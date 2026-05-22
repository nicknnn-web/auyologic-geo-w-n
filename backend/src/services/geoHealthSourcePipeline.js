/**
 * 品牌体检信源流水线：博查检索（每题）→ 分析模型四分类 → geo_health_article
 */

import crypto from 'crypto';
import { createAiClientByConnectionId } from './aiClientFactory.js';
import { bochaWebSearch, isBochaConfigured } from './bochaWebSearch.js';
import {
  GEO_BOCHA_SEARCH_CONCURRENCY,
  GEO_SOURCE_CLASSIFY_CONCURRENCY,
  GEO_SOURCE_CLASSIFY_MAX_TOKENS,
  GEO_SOURCE_CLASSIFY_TIMEOUT_MS,
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
  if (!analysisCid) {
    throw new Error('任务未指定 analysis_connection_id，无法执行信源分类');
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
  if (!isBochaConfigured()) {
    const msg = '未配置 BOCHA_API_KEY，无法执行信源检索';
    await pool.query(
      `UPDATE geo_health_task SET status = 'failed', error_text = $2 WHERE id = $1`,
      [taskId, msg]
    );
    throw new Error(msg);
  }

  const { rows: questions } = await pool.query(
    `SELECT id, question FROM geo_health_question WHERE task_id = $1 ORDER BY id ASC`,
    [taskId]
  );
  if (!questions.length) {
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
        const result = await bochaWebSearch(query);
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
    return { taskId, processed: questions.length, failedCount, aborted: true };
  }

  await pool.query(`UPDATE geo_health_task SET status = 'sourcing_done' WHERE id = $1`, [taskId]);
  return { taskId, processed: questions.length, failedCount };
}

/**
 * 阶段 2：按题用 analysis_connection_id 分类博查 hits，写入 geo_health_article
 */
export async function runSourceClassificationForTask(pool, taskId) {
  const ctx = await fetchTaskContext(pool, taskId);
  const analysisClient = await createAiClientByConnectionId(pool, ctx.analysisConnectionId, {
    userId: ctx.userId,
  });
  const modelName = `bocha:${analysisClient.vendorName}`;

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
      if (!hits.length) return 0;

      try {
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
          items = hits.map((h) => ({
            index: h.index,
            url: h.url,
            category: mergeAiAndDomainSourceCategory(h.url, null, { brandWebsite: ctx.brandWebsite }),
          }));
        }
        const hitByIndex = new Map(hits.map((h) => [h.index, h]));
        const hitByUrl = new Map(hits.map((h) => [String(h.url).trim().toLowerCase(), h]));

        for (const item of items) {
          let hit = hitByIndex.get(item.index);
          const url = String(item.url || hit?.url || '').trim();
          if (!hit) hit = hitByUrl.get(url.toLowerCase());
          if (!hit || !isAcceptableSourceUrl(url)) continue;

          const title = String(hit.title || '').trim() || '未命名';
          const summary = String(hit.summary || hit.snippet || '').trim();
          const platform = String(hit.platform || '').trim().slice(0, 256) || '未知';
          const publishTime = String(hit.publishTime || '').trim().slice(0, 128);
          const category = mergeAiAndDomainSourceCategory(
            url,
            item.category,
            { brandWebsite: ctx.brandWebsite }
          );
          const validCategories = new Set(Object.values(SOURCE_CATEGORY));
          const sourceCategory = validCategories.has(category)
            ? category
            : mergeAiAndDomainSourceCategory(url, null, { brandWebsite: ctx.brandWebsite });

          const dedupeKey = buildDedupeKey(title, summary, url).slice(0, 256);
          const contentHash = md5(`${title}\n${summary}`);

          const ins = await pool.query(
            `INSERT INTO geo_health_article (task_id, question_id, model_name, platform, title, url, publish_time, summary, content_hash, dedupe_key, source_category)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (task_id, dedupe_key) DO NOTHING
             RETURNING id`,
            [
              taskId,
              questionId,
              modelName,
              platform,
              title,
              url,
              publishTime,
              summary,
              contentHash,
              dedupeKey,
              sourceCategory,
            ]
          );
          if (ins.rows.length) insertedTotal += 1;
        }
        return 0;
      } catch (e) {
        console.warn(`[geo-source] classify fail task=${taskId} q=${questionId}`, e?.message || e);
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
 * 博查检索 + 分类（探针完成后调用）
 */
export async function runGeoHealthSourcePipelineForTask(pool, taskId) {
  await runBochaSourceSearchForTask(pool, taskId);
  if (!(await geoHealthTaskExists(pool, taskId))) {
    return { taskId, aborted: true };
  }
  return runSourceClassificationForTask(pool, taskId);
}
