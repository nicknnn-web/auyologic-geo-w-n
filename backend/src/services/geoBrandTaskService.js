/**
 * 品牌体检任务：从 questions 抽样 → 调 AI（多模型支持）→ 存 geo_health_answer / geo_health_article
 *
 * 维护说明：
 * - 抽题数量：改 config/geoBrandTaskConfig.js 里的 GEO_HEALTH_QUESTIONS_PER_TYPE
 * - 抽样类型：resolveGeoHealthKeywordBuckets 读 sys_dict keyword_type 全部 data_key，与 questions.keyword_type 匹配
 * - 探针模型列表：config/geoBrandTaskConfig.js 的 PROBE_MODELS（或环境变量 PROBE_MODELS=deepseek,qwen）
 * - Prompt 默认文案改 DEFAULT_SYSTEM_PROMPT / buildDefaultUserPrompt；也可在接口里传自定义覆盖
 * - 解析 JSON、入库文章的逻辑在 probeOneQuestionWithModel，与 AI 调用分离
 */
import crypto from 'crypto';
import { createAiClient, PROVIDERS } from './aiClientFactory.js';
import {
  GEO_HEALTH_QUESTIONS_PER_TYPE,
  GEO_HEALTH_PROBE_BATCH_DELAY_MS,
  GEO_HEALTH_PROBE_CONCURRENCY,
  GEO_HEALTH_KEYWORD_TYPE_DICT_TYPE,
  PROBE_MODELS,
} from '../config/geoBrandTaskConfig.js';

/** 当前启用的第一个探针 provider 的默认模型名（向后兼容用） */
export const DEEPSEEK_DEFAULT_MODEL = PROVIDERS[PROBE_MODELS[0] || 'deepseek']?.defaultModel || 'deepseek-chat';

/**
 * 从 sys_dict 读取 dict_type=keyword_type 的全部启用项，用 data_key 与 questions.keyword_type 一致匹配抽题。
 * geo_health_question.question_type 存 data_key（与问题库一致）。
 *
 * @returns {{ buckets: { questionType: string, keywordType: string, extraAnd: string }[], allowedKeys: string[] }}
 */
export async function resolveGeoHealthKeywordBuckets(pool) {
  const { rows } = await pool.query(
    `SELECT data_key, data_value
     FROM sys_dict
     WHERE dict_type = $1 AND COALESCE(enabled, true) = true
     ORDER BY sort_order ASC NULLS LAST, data_key ASC`,
    [GEO_HEALTH_KEYWORD_TYPE_DICT_TYPE]
  );

  const buckets = [];
  for (const r of rows) {
    const keywordType = String(r.data_key ?? '').trim();
    if (!keywordType) continue;
    buckets.push({ questionType: keywordType, keywordType, extraAnd: '' });
  }

  const allowedKeys = [...new Set(buckets.map((b) => b.keywordType))];
  return { buckets, allowedKeys };
}

// Prompt 已迁至 backend/src/prompts/geoHealthProbe.js
// 保留同名 export (DEFAULT_SYSTEM_PROMPT) 做向后兼容
import { PROBE_SYSTEM_PROMPT, buildProbeUserPrompt } from '../prompts/geoHealthProbe.js';
export const DEFAULT_SYSTEM_PROMPT = PROBE_SYSTEM_PROMPT;

function md5(s) {
  return crypto.createHash('md5').update(String(s), 'utf8').digest('hex');
}

/**
 * 从已审核问题库随机抽取：按 keyword_type（单值或 IN）、extraAnd；不按 user_id、不按「关键词」过滤。
 * keywordTypesIn 与 keywordType 二选一；优先 keywordTypesIn。
 */
export async function pickApprovedQuestions(pool, { keywordType, keywordTypesIn, extraAnd = '', limit }) {
  const params = [];
  let i = 1;
  let sql = `
    SELECT q.id, q.question
    FROM questions q
    WHERE q.status = '已审核'
  `;
  if (keywordTypesIn && keywordTypesIn.length > 0) {
    const ph = keywordTypesIn.map((_, idx) => `$${i + idx}`).join(', ');
    sql += ` AND q.keyword_type IN (${ph})`;
    params.push(...keywordTypesIn);
    i += keywordTypesIn.length;
  } else if (keywordType) {
    sql += ` AND q.keyword_type = $${i}`;
    params.push(keywordType);
    i += 1;
  }
  if (extraAnd && String(extraAnd).trim()) {
    sql += ` ${extraAnd}`;
  }
  sql += ` ORDER BY RANDOM() LIMIT $${i}`;
  params.push(limit);
  const { rows } = await pool.query(sql, params);
  return rows;
}

/** 抽不够时在 allowedKeys（字典 keyword_type 全部 data_key）之间补量 */
async function fillToLimit(pool, { initialRows, limit, allowedKeys }) {
  const out = [...initialRows];
  const taken = new Set(out.map((r) => r.id));

  const tryAdd = (rows) => {
    for (const r of rows) {
      if (taken.has(r.id)) continue;
      out.push(r);
      taken.add(r.id);
      if (out.length >= limit) return true;
    }
    return false;
  };

  if (out.length >= limit) return out.slice(0, limit);
  if (!allowedKeys || allowedKeys.length === 0) return out.slice(0, limit);

  for (const kt of allowedKeys) {
    const more = await pickApprovedQuestions(pool, {
      keywordType: kt,
      extraAnd: '',
      limit: limit * 2,
    });
    if (tryAdd(more)) return out.slice(0, limit);
  }

  const loose = await pickApprovedQuestions(pool, {
    keywordTypesIn: allowedKeys,
    extraAnd: '',
    limit: limit * 3,
  });
  tryAdd(loose);
  return out.slice(0, limit);
}

/**
 * 从模型回复中解析 JSON（兼容 ```json 围栏）
 */
export function extractJsonFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  const inner = fence ? fence[1].trim() : raw;
  try {
    return JSON.parse(inner);
  } catch {
    const start = inner.indexOf('{');
    const end = inner.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(inner.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
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

/**
 * 创建任务：按字典 keyword_type 每一类各抽 GEO_HEALTH_QUESTIONS_PER_TYPE 条（不按关键词）。检测时只把问题发给大模型。
 */
export async function createGeoTaskAndQuestions(pool, { userId }) {
  const { buckets, allowedKeys } = await resolveGeoHealthKeywordBuckets(pool);
  if (!buckets.length) {
    throw new Error('字典 keyword_type 无启用项（sys_dict 中 dict_type=keyword_type 为空），无法抽题');
  }

  const ins = await pool.query(
    `INSERT INTO geo_health_task (user_id, keyword, status) VALUES ($1, '', 'pending') RETURNING *`,
    [userId]
  );
  const task = ins.rows[0];
  const taskId = task.id;

  let total = 0;
  const perType = GEO_HEALTH_QUESTIONS_PER_TYPE;
  const pickedSummary = [];
  for (const bucket of buckets) {
    let rows = await pickApprovedQuestions(pool, {
      keywordType: bucket.keywordType,
      extraAnd: bucket.extraAnd,
      limit: perType,
    });
    rows = await fillToLimit(pool, { initialRows: rows, limit: perType, allowedKeys });

    const batch = rows.map((r) => ({
      sourceQuestionId: r.id,
      keywordType: bucket.keywordType,
      question: r.question,
    }));
    pickedSummary.push(...batch);
    console.log(
      `[geo-health] 抽题 taskId=${taskId} keyword_type(data_key)=${bucket.keywordType} 本类 ${batch.length} 条（目标每类 ${perType}）`,
      batch.map((b) => ({ id: b.sourceQuestionId, q: b.question }))
    );

    for (const r of rows) {
      await pool.query(
        `INSERT INTO geo_health_question (task_id, source_question_id, question, question_type)
         VALUES ($1, $2, $3, $4)`,
        [taskId, r.id, r.question, bucket.questionType]
      );
      total += 1;
    }
  }

  console.log(
    `[geo-health] 抽题汇总 taskId=${taskId} userId=${userId} 共 ${pickedSummary.length} 题`,
    pickedSummary.map((p) => `[${p.keywordType}]#${p.sourceQuestionId} ${p.question}`)
  );

  await pool.query(`UPDATE geo_health_task SET status = 'running' WHERE id = $1`, [taskId]);

  return { taskId, questionCount: total, status: 'running' };
}

// buildDefaultUserPrompt 已迁至 backend/src/prompts/geoHealthProbe.js（buildProbeUserPrompt）
const buildDefaultUserPrompt = buildProbeUserPrompt;

/**
 * 对单题 + 单模型调用 AI，写入 geo_health_answer，并把 sources 解析进 geo_health_article（按 task 去重）。
 *
 * @param {object} pool - pg Pool
 * @param {object} options
 * @param {number} options.taskId
 * @param {number} options.questionId
 * @param {string} [options.provider='deepseek'] - aiClientFactory PROVIDERS key
 * @param {string} [options.systemPrompt]
 * @param {string} [options.userPrompt]   - 若不传则用默认构建
 * @param {number} [options.maxTokens=4096]
 * @param {number} [options.temperature=0.3]
 */
export async function probeOneQuestionWithModel(pool, options) {
  const {
    taskId,
    questionId,
    provider = PROBE_MODELS[0] || 'deepseek',
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    userPrompt: userPromptOverride,
    maxTokens = 4096,
    temperature = 0.3,
  } = options;

  const providerCfg = PROVIDERS[provider];
  if (!providerCfg) throw new Error(`未知 provider: ${provider}`);
  const modelName = providerCfg.defaultModel;

  const qRes = await pool.query(
    `SELECT gq.id, gq.question, gq.question_type,
            COALESCE(d.data_value, gq.question_type) AS keyword_type_label
     FROM geo_health_question gq
     LEFT JOIN sys_dict d ON d.dict_type = $3 AND d.data_key = gq.question_type
     WHERE gq.id = $1 AND gq.task_id = $2`,
    [questionId, taskId, GEO_HEALTH_KEYWORD_TYPE_DICT_TYPE]
  );
  if (qRes.rows.length === 0) throw new Error('找不到该任务下的问题');

  const row = qRes.rows[0];
  const typeLine =
    row.keyword_type_label && String(row.keyword_type_label) !== String(row.question_type)
      ? `${row.keyword_type_label}（${row.question_type}）`
      : String(row.question_type ?? '');
  const userPrompt = userPromptOverride || buildDefaultUserPrompt(typeLine, row.question);

  const client = createAiClient(provider);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let content = '';
  let parsed = null;
  let errMsg = null;
  let usage = null;

  try {
    const out = await client.chat(messages, { maxTokens, temperature });
    content = out.content;
    usage = out.usage ?? null;
    parsed = extractJsonFromText(content);
  } catch (e) {
    errMsg = e.message || String(e);
    await pool.query(
      `INSERT INTO geo_health_answer (task_id, question_id, model_name, raw_json, valid_count, error_text)
       VALUES ($1, $2, $3, $4::jsonb, 0, $5)
       ON CONFLICT (question_id, model_name) DO UPDATE SET
         raw_json = EXCLUDED.raw_json,
         valid_count = 0,
         error_text = EXCLUDED.error_text,
         created_at = NOW()`,
      [taskId, questionId, modelName, JSON.stringify({ error: errMsg, provider, model: modelName }), errMsg]
    );
    throw e;
  }

  // sources 兼容两个字段名：sources（新格式）/ articles（旧格式）
  const sourcesIn = Array.isArray(parsed?.sources)
    ? parsed.sources
    : Array.isArray(parsed?.articles)
      ? parsed.articles
      : [];

  const storedPayload = { provider, model: modelName, content, parsed, usage };

  await pool.query(
    `INSERT INTO geo_health_answer (task_id, question_id, model_name, raw_json, valid_count, error_text)
     VALUES ($1, $2, $3, $4::jsonb, 0, NULL)
     ON CONFLICT (question_id, model_name) DO UPDATE SET
       raw_json = EXCLUDED.raw_json,
       error_text = NULL,
       created_at = NOW()`,
    [taskId, questionId, modelName, JSON.stringify(storedPayload)]
  );

  let validCount = 0;
  for (const a of sourcesIn) {
    const title = String(a.title ?? '').trim() || '未命名';
    const summary = String(a.summary ?? '').trim();
    const platform = String(a.platform ?? '').trim().slice(0, 256) || '未知';
    const publishTime = String(a.publish_time ?? '').trim().slice(0, 128);
    let url = String(a.url ?? '').trim();

    if (!url || !isHttpUrl(url)) {
      url = `hash:${md5(`${title}\n${summary}`)}`;
    } else {
      url = url.slice(0, 2048);
    }

    const dedupeKey = buildDedupeKey(title, summary, url.startsWith('hash:') ? '' : url).slice(0, 256);
    const contentHash = md5(`${title}\n${summary}`);

    const ins = await pool.query(
      `INSERT INTO geo_health_article (task_id, question_id, model_name, platform, title, url, publish_time, summary, content_hash, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (task_id, dedupe_key) DO NOTHING
       RETURNING id`,
      [taskId, questionId, modelName, platform, title, url, publishTime, summary, contentHash, dedupeKey]
    );
    if (ins.rows.length) validCount += 1;
  }

  await pool.query(
    `UPDATE geo_health_answer SET valid_count = $1 WHERE task_id = $2 AND question_id = $3 AND model_name = $4`,
    [validCount, taskId, questionId, modelName]
  );

  return { taskId, questionId, provider, model: modelName, validCount, articleCount: sourcesIn.length };
}

/**
 * 向后兼容别名：旧代码（route /probe 等）仍可调用 probeWithDeepseekAndStore
 */
export async function probeWithDeepseekAndStore(pool, options) {
  return probeOneQuestionWithModel(pool, {
    ...options,
    provider: options.provider || PROBE_MODELS[0] || 'deepseek',
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 后台依次分批调用 AI（支持多模型）。
 * 每道题 × 每个 PROBE_MODELS 中的 provider 各调用一次，结果分别存入 geo_health_answer。
 * 失败单题/单模型会记 error，不中断整批。
 * 全部结束后将 geo_health_task.status 置为 'probing_done'（由调用方决定是否继续分析）。
 */
export async function runAllProbesForTask(pool, taskId) {
  const { rows } = await pool.query(
    `SELECT id FROM geo_health_question WHERE task_id = $1 ORDER BY id ASC`,
    [taskId]
  );
  const ids = rows.map((r) => r.id);

  if (ids.length === 0) {
    await pool.query(`UPDATE geo_health_task SET status = 'completed' WHERE id = $1`, [taskId]);
    return { taskId, processed: 0, failedCount: 0 };
  }

  // 构建"题目 × 模型"任务列表
  const tasks = [];
  for (const questionId of ids) {
    for (const provider of PROBE_MODELS) {
      tasks.push({ questionId, provider });
    }
  }

  const conc = GEO_HEALTH_PROBE_CONCURRENCY;
  const delayMs = GEO_HEALTH_PROBE_BATCH_DELAY_MS;
  let failedCount = 0;

  try {
    await pool.query(`UPDATE geo_health_task SET status = 'probing' WHERE id = $1`, [taskId]);

    for (let i = 0; i < tasks.length; i += conc) {
      const batch = tasks.slice(i, i + conc);
      const batchFails = await Promise.all(
        batch.map(async ({ questionId, provider }) => {
          try {
            await probeOneQuestionWithModel(pool, { taskId, questionId, provider });
            return 0;
          } catch (e) {
            console.error(
              `[geo-health] probe fail task=${taskId} question=${questionId} provider=${provider}`,
              e?.message || e
            );
            return 1;
          }
        })
      );
      failedCount += batchFails.reduce((a, b) => a + b, 0);
      if (i + conc < tasks.length) await sleep(delayMs);
    }

    // probing 完成，等待 runAllAnalysisForTask 把状态推到 completed
    await pool.query(`UPDATE geo_health_task SET status = 'probing_done' WHERE id = $1`, [taskId]);
    return { taskId, processed: tasks.length, failedCount };
  } catch (e) {
    console.error(`[geo-health] task=${taskId} probe runner fatal`, e);
    await pool.query(`UPDATE geo_health_task SET status = 'failed' WHERE id = $1`, [taskId]);
    throw e;
  }
}

/**
 * 供轮询：题目总数、已答数、成功/失败/待处理 + 分析进度。
 * 同时支持 probing / analyzing / completed 等状态。
 */
export async function getGeoHealthTaskProgress(pool, { taskId, userId }) {
  const t = await pool.query(
    `SELECT id, status, keyword, error_text, created_at FROM geo_health_task WHERE id = $1 AND user_id = $2`,
    [taskId, userId]
  );
  if (t.rows.length === 0) return null;

  const totalR = await pool.query(
    `SELECT COUNT(*)::int AS c FROM geo_health_question WHERE task_id = $1`,
    [taskId]
  );
  // 每题 × 每个模型都算一条 answer，乘以 probe 模型数
  const probeModelCount = PROBE_MODELS.length || 1;
  const totalAnswersExpected = totalR.rows[0].c * probeModelCount;

  const ansR = await pool.query(
    `SELECT
       COUNT(*)::int AS answered,
       COUNT(*) FILTER (WHERE error_text IS NOT NULL AND btrim(COALESCE(error_text, '')) <> '')::int AS failed
     FROM geo_health_answer
     WHERE task_id = $1`,
    [taskId]
  );

  // 分析进度（geo_health_analysis 在阶段1建表后才有数据）
  let analysisDone = 0;
  let analysisTotal = totalAnswersExpected;
  try {
    const aR = await pool.query(
      `SELECT COUNT(*)::int AS c FROM geo_health_analysis WHERE task_id = $1`,
      [taskId]
    );
    analysisDone = aR.rows[0].c;
  } catch {
    // geo_health_analysis 表可能尚未创建（阶段0），忽略
  }

  const totalQuestions = totalR.rows[0].c;
  const answeredCount = ansR.rows[0].answered;
  const failedCount = ansR.rows[0].failed;
  const successCount = answeredCount - failedCount;
  const pendingCount = Math.max(0, totalAnswersExpected - answeredCount);

  return {
    taskId,
    status: t.rows[0].status,
    keyword: t.rows[0].keyword,
    errorText: t.rows[0].error_text || null,
    createdAt: t.rows[0].created_at,
    // 探针进度
    totalQuestions,
    probeModelCount,
    totalAnswersExpected,
    answeredCount,
    successCount,
    failedCount,
    pendingCount,
    // 分析进度（阶段1接入后有效）
    analysisDone,
    analysisTotal,
    analysisRemaining: Math.max(0, totalAnswersExpected - analysisDone),
  };
}
