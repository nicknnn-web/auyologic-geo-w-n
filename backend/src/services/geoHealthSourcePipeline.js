/**
 * 品牌体检信源流水线：博查检索（每题）→ 分析模型四分类 → geo_health_article
 */

import crypto from 'crypto';
import { createAiClientByConnectionId } from './aiClientFactory.js';
import { bochaWebSearch } from './bochaWebSearch.js';
import { isBochaConfiguredForUser, resolveBochaCredentials } from './bochaCredentials.js';
import {
  GEO_BOCHA_SEARCH_CONCURRENCY,
  GEO_SOURCE_CLASSIFY_CONCURRENCY,
  GEO_SOURCE_CLASSIFY_MAX_TOKENS,
  GEO_SOURCE_CLASSIFY_TIMEOUT_MS,
  GEO_SOURCE_CLASSIFY_USE_LLM,
} from '../config/geoBrandTaskConfig.js';
import {
  SOURCE_CLASSIFY_SYSTEM_PROMPT,
  buildSourceClassifyUserPrompt,
} from '../prompts/geoHealthSourceClassify.js';
import { mergeAiAndDomainSourceCategory, SOURCE_CATEGORY } from './sourceClassifier.js';
import { isAcceptableSourceUrl } from '../utils/sourceUrlValidation.js';
import {
  extractJsonFromText,
  geoHealthTaskExists,
  runWithSlidingConcurrency,
} from './geoBrandTaskService.js';
import { startPhaseTimer, logPhaseDone } from '../utils/geoTaskTiming.js';

function md5(s) {
  return crypto.createHash('md5').update(String(s), 'utf8').digest('hex');
}

function isHttpUrl(u) {
  try {
    const x = new URL(String(u).trim());
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeUrlForDedupe(url) {
  try {
    const u = new URL(String(url).trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

function buildDedupeKey(title, summary, url) {
  const t = String(title || '').trim();
  const s = String(summary || '').trim();
  if (url && isHttpUrl(url)) {
    const n = normalizeUrlForDedupe(url);
    if (n) return `url:${n}`;
  }
  return `hash:${md5(`${t}\n${s}`)}`;
}

/** 仅域名规则分类（不调 LLM） */
function buildRuleOnlyClassifyItems(hits, brandWebsite) {
  return hits.map((h) => ({
    index: h.index,
    url: h.url,
    category: mergeAiAndDomainSourceCategory(h.url, null, { brandWebsite }),
  }));
}

/**
 * 将分类结果批量写入 geo_health_article，返回新增条数
 */
async function insertClassifiedArticlesBatch(pool, {
  taskId,
  questionId,
  modelName,
  hits,
  items,
  brandWebsite,
}) {
  const hitByIndex = new Map(hits.map((h) => [h.index, h]));
  const hitByUrl = new Map(hits.map((h) => [String(h.url).trim().toLowerCase(), h]));
  const validCategories = new Set(Object.values(SOURCE_CATEGORY));
  const rows = [];

  for (const item of items) {
    let hit = hitByIndex.get(item.index);
    const url = String(item.url || hit?.url || '').trim();
    if (!hit) hit = hitByUrl.get(url.toLowerCase());
    if (!hit || !isAcceptableSourceUrl(url)) continue;

    const title = String(hit.title || '').trim() || '未命名';
    const summary = String(hit.summary || hit.snippet || '').trim();
    const platform = String(hit.platform || '').trim().slice(0, 256) || '未知';
    const publishTime = String(hit.publishTime || '').trim().slice(0, 128);
    const category = mergeAiAndDomainSourceCategory(url, item.category, { brandWebsite });
    const sourceCategory = validCategories.has(category)
      ? category
      : mergeAiAndDomainSourceCategory(url, null, { brandWebsite });

    rows.push({
      taskId,
      questionId,
      modelName,
      platform,
      title,
      url,
      publishTime,
      summary,
      contentHash: md5(`${title}\n${summary}`),
      dedupeKey: buildDedupeKey(title, summary, url).slice(0, 256),
      sourceCategory,
    });
  }

  if (!rows.length) return 0;

  const params = [];
  const valueTuples = rows.map((r, i) => {
    const o = i * 11;
    params.push(
      r.taskId,
      r.questionId,
      r.modelName,
      r.platform,
      r.title,
      r.url,
      r.publishTime,
      r.summary,
      r.contentHash,
      r.dedupeKey,
      r.sourceCategory
    );
    return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10}, $${o + 11})`;
  });

  const ins = await pool.query(
    `INSERT INTO geo_health_article (task_id, question_id, model_name, platform, title, url, publish_time, summary, content_hash, dedupe_key, source_category)
     VALUES ${valueTuples.join(', ')}
     ON CONFLICT (task_id, dedupe_key) DO NOTHING
     RETURNING id`,
    params
  );
  return ins.rows.length;
}

async function markSourceClassifyDone(pool, taskId, questionId) {
  await pool.query(
    `UPDATE geo_health_source_search SET classify_done = true WHERE task_id = $1 AND question_id = $2`,
    [taskId, questionId]
  );
}

async function resolveClassifyItems(analysisClient, ctx, row, hits) {
  if (!GEO_SOURCE_CLASSIFY_USE_LLM) {
    return buildRuleOnlyClassifyItems(hits, ctx.brandWebsite);
  }
  const userPrompt = buildSourceClassifyUserPrompt({
    brandName: ctx.brandName,
    brandWebsite: ctx.brandWebsite,
    questionText: row.question_text || row.query,
    hits,
  });
  const { content } = await analysisClient.chat(
    [
      { role: 'system', content: SOURCE_CLASSIFY_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    {
      maxTokens: GEO_SOURCE_CLASSIFY_MAX_TOKENS,
      temperature: 0.1,
      timeoutMs: GEO_SOURCE_CLASSIFY_TIMEOUT_MS,
    }
  );
  const parsed = extractJsonFromText(content);
  let items = Array.isArray(parsed?.items) ? parsed.items : [];
  if (!items.length) {
    items = buildRuleOnlyClassifyItems(hits, ctx.brandWebsite);
  }
  return items;
}

async function fetchTaskContext(pool, taskId) {
  const tRes = await pool.query(
    `SELECT t.id, t.user_id, t.analysis_connection_id, t.connection_ids, t.keyword,
            u.company_name, u.website
     FROM geo_health_task t
     LEFT JOIN users u ON u.user_id = t.user_id
     WHERE t.id = $1`,
    [taskId]
  );
  const row = tRes.rows[0];
  if (!row) throw new Error(`任务不存在 taskId=${taskId}`);

  let analysisCid = row.analysis_connection_id;
  if (!analysisCid && Array.isArray(row.connection_ids) && row.connection_ids.length) {
    analysisCid = row.connection_ids[0];
  }
  const brandName = String(row.company_name || row.keyword || '').trim();
  const brandWebsite = String(row.website || '').trim();

  return {
    userId: row.user_id,
    analysisConnectionId: analysisCid,
    brandName,
    brandWebsite,
  };
}

/**
 * 阶段 1：每题调用博查，写入 geo_health_source_search
 */
export async function runBochaSourceSearchForTask(pool, taskId) {
  const bochaStartedAt = startPhaseTimer();

  const { rows: taskRows } = await pool.query(
    `SELECT user_id FROM geo_health_task WHERE id = $1 LIMIT 1`,
    [taskId]
  );
  const taskUserId = taskRows[0]?.user_id || 'default_user';
  const bochaCreds = await resolveBochaCredentials(taskUserId);

  if (!bochaCreds.apiKey) {
    console.warn(
      `[geo-source] task=${taskId} 未配置博查（大模型接入或 BOCHA_API_KEY），跳过信源检索（不影响探针分析与报告生成）`
    );
    logPhaseDone('geo-bocha', taskId, '博查', bochaStartedAt, { skipped: true, reason: 'not_configured' });
    return { taskId, processed: 0, failedCount: 0, skipped: true, reason: 'bocha_not_configured' };
  }

  const bochaSearchOpts = { apiKey: bochaCreds.apiKey, baseUrl: bochaCreds.baseUrl };

  const { rows: questions } = await pool.query(
    `SELECT id, question FROM geo_health_question WHERE task_id = $1 ORDER BY id ASC`,
    [taskId]
  );
  if (!questions.length) {
    logPhaseDone('geo-bocha', taskId, '博查', bochaStartedAt, { questions: 0 });
    return { taskId, processed: 0, failedCount: 0 };
  }

  await pool.query(`UPDATE geo_health_task SET status = 'sourcing' WHERE id = $1`, [taskId]);

  console.log(
    `[geo-source] task=${taskId} 博查检索 ${questions.length} 题，并发=${GEO_BOCHA_SEARCH_CONCURRENCY}（全局请求间隔由 GEO_BOCHA_MIN_INTERVAL_MS 控制）`
  );

  const failedCount = await runWithSlidingConcurrency(
    questions,
    GEO_BOCHA_SEARCH_CONCURRENCY,
    async (q) => {
      if (!(await geoHealthTaskExists(pool, taskId))) return 0;
      const questionId = q.id;
      const query = String(q.question || '').trim();
      try {
        const result = await bochaWebSearch(query, bochaSearchOpts);
        const hits = result.hits || [];
        await pool.query(
          `INSERT INTO geo_health_source_search (task_id, question_id, query, hit_count, raw_json, error_text)
           VALUES ($1, $2, $3, $4, $5::jsonb, NULL)
           ON CONFLICT (task_id, question_id) DO UPDATE SET
             query = EXCLUDED.query,
             hit_count = EXCLUDED.hit_count,
             raw_json = EXCLUDED.raw_json,
             error_text = NULL,
             created_at = NOW()`,
          [taskId, questionId, query, hits.length, JSON.stringify({ hits, totalEstimatedMatches: result.totalEstimatedMatches, log_id: result.raw?.log_id })]
        );
        return 0;
      } catch (e) {
        const errMsg = e.message || String(e);
        console.warn(`[geo-source] bocha fail task=${taskId} q=${questionId}`, errMsg);
        await pool.query(
          `INSERT INTO geo_health_source_search (task_id, question_id, query, hit_count, raw_json, error_text)
           VALUES ($1, $2, $3, 0, '{}'::jsonb, $4)
           ON CONFLICT (task_id, question_id) DO UPDATE SET
             hit_count = 0,
             error_text = EXCLUDED.error_text,
             created_at = NOW()`,
          [taskId, questionId, query, errMsg]
        );
        return 1;
      }
    }
  );

  if (!(await geoHealthTaskExists(pool, taskId))) {
    logPhaseDone('geo-bocha', taskId, '博查', bochaStartedAt, {
      questions: questions.length,
      failed: failedCount,
      aborted: true,
    });
    return { taskId, processed: questions.length, failedCount, aborted: true };
  }

  await pool.query(`UPDATE geo_health_task SET status = 'sourcing_done' WHERE id = $1`, [taskId]);
  logPhaseDone('geo-bocha', taskId, '博查', bochaStartedAt, {
    questions: questions.length,
    failed: failedCount,
  });
  return { taskId, processed: questions.length, failedCount };
}

/**
 * 阶段 2：按题用 analysis_connection_id 分类博查 hits，写入 geo_health_article
 */
export async function runSourceClassificationForTask(pool, taskId) {
  const ctx = await fetchTaskContext(pool, taskId);
  let analysisClient = null;
  let modelName = 'bocha:rules';
  if (GEO_SOURCE_CLASSIFY_USE_LLM && ctx.analysisConnectionId) {
    try {
      analysisClient = await createAiClientByConnectionId(pool, ctx.analysisConnectionId, {
        userId: ctx.userId,
      });
      modelName = `bocha:${analysisClient.vendorName}`;
    } catch (e) {
      console.warn(
        `[geo-source] task=${taskId} 信源分类模型不可用，降级为域名规则: ${e?.message || e}`
      );
    }
  } else if (GEO_SOURCE_CLASSIFY_USE_LLM && !ctx.analysisConnectionId) {
    console.warn(
      `[geo-source] task=${taskId} 未指定分析模型连接，信源分类仅用域名规则（不影响报告分析）`
    );
  }

  const { rows: searchRows } = await pool.query(
    `SELECT ss.question_id, ss.query, ss.raw_json, ss.error_text,
            gq.question AS question_text
     FROM geo_health_source_search ss
     JOIN geo_health_question gq ON gq.id = ss.question_id AND gq.task_id = ss.task_id
     WHERE ss.task_id = $1
     ORDER BY ss.question_id ASC`,
    [taskId]
  );

  await pool.query(`UPDATE geo_health_task SET status = 'classifying' WHERE id = $1`, [taskId]);
  await pool.query(`DELETE FROM geo_health_article WHERE task_id = $1`, [taskId]);
  await pool.query(
    `UPDATE geo_health_source_search SET classify_done = false WHERE task_id = $1`,
    [taskId]
  );

  console.log(
    `[geo-source] task=${taskId} 信源分类 ${searchRows.length} 题，并发=${GEO_SOURCE_CLASSIFY_CONCURRENCY}，模式=${GEO_SOURCE_CLASSIFY_USE_LLM ? 'LLM+规则' : '仅规则'}`
  );

  let failedCount = 0;
  let insertedTotal = 0;

  failedCount = await runWithSlidingConcurrency(
    searchRows,
    GEO_SOURCE_CLASSIFY_CONCURRENCY,
    async (row) => {
      if (!(await geoHealthTaskExists(pool, taskId))) return 0;
      const questionId = row.question_id;
      const raw = row.raw_json || {};
      const hits = Array.isArray(raw.hits) ? raw.hits : [];

      try {
        if (!hits.length) {
          await markSourceClassifyDone(pool, taskId, questionId);
          return 0;
        }
        const items = await resolveClassifyItems(analysisClient, ctx, row, hits);
        const n = await insertClassifiedArticlesBatch(pool, {
          taskId,
          questionId,
          modelName,
          hits,
          items,
          brandWebsite: ctx.brandWebsite,
        });
        insertedTotal += n;
        await markSourceClassifyDone(pool, taskId, questionId);
        return 0;
      } catch (e) {
        console.warn(`[geo-source] classify fail task=${taskId} q=${questionId}`, e?.message || e);
        await markSourceClassifyDone(pool, taskId, questionId);
        return 1;
      }
    }
  );

  if (!(await geoHealthTaskExists(pool, taskId))) {
    return { taskId, insertedTotal, failedCount, aborted: true };
  }

  await pool.query(`UPDATE geo_health_task SET status = 'classifying_done' WHERE id = $1`, [taskId]);
  console.log(`[geo-source] task=${taskId} 信源入库 ${insertedTotal} 条，分类失败 ${failedCount} 题`);
  return { taskId, insertedTotal, failedCount };
}

/**
 * 博查检索 + 分类（探针完成后调用）。
 * 信源未配置或任一步骤失败均不抛错、不把任务标为 failed，以免阻断二次分析与报告。
 */
export async function runGeoHealthSourcePipelineForTask(pool, taskId) {
  let searchOutcome = { skipped: false };
  try {
    searchOutcome = await runBochaSourceSearchForTask(pool, taskId);
    if (searchOutcome.skipped) {
      console.warn(
        `[geo-source] task=${taskId} 已跳过博查检索 reason=${searchOutcome.reason || 'unknown'}`
      );
    }
  } catch (e) {
    console.warn(
      `[geo-source] task=${taskId} 博查阶段异常（不影响后续分析）:`,
      e?.message || e
    );
    searchOutcome = { skipped: true, error: e?.message || String(e) };
  }

  if (!(await geoHealthTaskExists(pool, taskId))) {
    return { taskId, aborted: true };
  }

  try {
    const classifyOutcome = await runSourceClassificationForTask(pool, taskId);
    return { ...searchOutcome, ...classifyOutcome };
  } catch (e) {
    console.warn(
      `[geo-source] task=${taskId} 分类阶段异常（不影响后续分析）:`,
      e?.message || e
    );
    return {
      taskId,
      ...searchOutcome,
      classifySkipped: true,
      classifyError: e?.message || String(e),
    };
  }
}
