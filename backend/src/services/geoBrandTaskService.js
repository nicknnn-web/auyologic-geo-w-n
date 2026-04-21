/**
 * 品牌体检任务：从 questions 抽样 → 调 DeepSeek → 存 geo_health_answer / geo_health_article
 *
 * 维护说明：
 * - 抽题数量：改 config/geoBrandTaskConfig.js 里的 GEO_HEALTH_QUESTIONS_PER_TYPE
 * - 抽样类型：resolveGeoHealthKeywordBuckets 读 sys_dict keyword_type 全部 data_key，与 questions.keyword_type 匹配
 * - Prompt 默认文案改 DEFAULT_SYSTEM_PROMPT / buildDefaultUserPrompt；也可在接口里传自定义覆盖
 * - 解析 JSON、入库文章的逻辑在 probeWithDeepseekAndStore，与 DeepSeek 调用分离
 */
import crypto from 'crypto';
import { chatDeepseek, createDeepseekClient, DEEPSEEK_DEFAULT_MODEL } from './deepseekClient.js';
import {
  GEO_HEALTH_QUESTIONS_PER_TYPE,
  GEO_HEALTH_PROBE_BATCH_DELAY_MS,
  GEO_HEALTH_PROBE_CONCURRENCY,
  GEO_HEALTH_KEYWORD_TYPE_DICT_TYPE,
} from '../config/geoBrandTaskConfig.js';

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

export const DEFAULT_SYSTEM_PROMPT = `你是一个严格按 JSON 输出的助手。用户会给出一条需要分析的问题。
你必须只输出一个 JSON 对象，且包含键 "articles"：数组；每项为对象，字段 title、url、platform、publish_time、summary（均为字符串）。
不要输出 markdown 代码围栏以外的多余说明文字。url 尽量为真实可访问的 http/https 链接；若无法提供可省略该字段或留空字符串。`;

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

function buildDefaultUserPrompt(typeLine, questionText) {
  return [
    `问题类型（keyword_type，与 sys_dict.data_key 一致）：${typeLine}`,
    '',
    '用户问题：',
    questionText,
    '',
    '请先像一个通用大模型（如 ChatGPT / DeepSeek）一样，给出完整、自然的回答。',
    '回答应尽量贴近真实 AI 风格，可以包含对比、推荐或举例。',
    '',
    '然后，对你的回答进行结构化提取，并输出 JSON。',
    '',
    '要求：',
    '1. answer 为完整自然语言回答（保持原始风格）',
    '2. 如果回答中提到了具体产品 / 品牌 / 工具，请按“首次出现顺序”提取 只提取明确的品牌或公司名称，例如：OpenAI、阿里云、腾讯、Notion 等。\n' +
    '不要提取以下内容：\n' +
    '- 功能或技术（如：OCR、搜索引擎、AI模型）\n' +
    '- 泛化产品类别（如：电商平台、管理系统）\n' +
    '- 不明确归属的通用名称 ',
    '3. position 表示在回答中的出现顺序（第一个提到=1）',
    '4. 只提取明确提及的名称，不要推测或补充',
    '5. 如果没有提及任何产品，mentioned_entities 返回空数组',
    '6. 如果回答参考了外部信息，请提取来源 URL',
    '7. 不要编造来源',
    '8. 最终只输出 JSON',
    '',
    '输出格式：',
    '{',
    '  "answer": "完整回答内容",',
    '  "sources": [],',
    '  "mentioned_entities": [',
    '    { "name": "产品或品牌名", "type": "product", "position": 1 }',
    '  ]',
    '}'
  ].join('\n');
}

/**
 * 对单题调用 DeepSeek，写入 geo_health_answer，并把 articles 解析进 geo_health_article（按 task 去重）
 */
export async function probeWithDeepseekAndStore(pool, options) {
  const {
    taskId,
    questionId,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    userPrompt: userPromptOverride,
    maxTokens = 4096,
    temperature = 0.3,
  } = options;

  const qRes = await pool.query(
    `SELECT gq.id, gq.question, gq.question_type,
            COALESCE(d.data_value, gq.question_type) AS keyword_type_label
     FROM geo_health_question gq
     LEFT JOIN sys_dict d ON d.dict_type = $3 AND d.data_key = gq.question_type
     WHERE gq.id = $1 AND gq.task_id = $2`,
    [questionId, taskId, GEO_HEALTH_KEYWORD_TYPE_DICT_TYPE]
  );
  if (qRes.rows.length === 0) {
    throw new Error('找不到该任务下的问题');
  }
  const row = qRes.rows[0];
  const typeLine =
    row.keyword_type_label && String(row.keyword_type_label) !== String(row.question_type)
      ? `${row.keyword_type_label}（${row.question_type}）`
      : String(row.question_type ?? '');
  const userPrompt =
    userPromptOverride ||
    buildDefaultUserPrompt(typeLine, row.question);

  const client = createDeepseekClient();
  let content = '';
  let parsed = null;
  let errMsg = null;

  let usage = null;
  try {
    const out = await chatDeepseek(client, {
      systemPrompt,
      userPrompt,
      model: DEEPSEEK_DEFAULT_MODEL,
      maxTokens,
      temperature,
    });
    content = out.content;
    usage = out.usage ?? null;
    parsed = extractJsonFromText(content);
  } catch (e) {
    errMsg = e.message || String(e);
    const payload = { error: errMsg, model: DEEPSEEK_DEFAULT_MODEL };
    await pool.query(
      `INSERT INTO geo_health_answer (task_id, question_id, model_name, raw_json, valid_count, error_text)
       VALUES ($1, $2, $3, $4::jsonb, 0, $5)
       ON CONFLICT (question_id, model_name) DO UPDATE SET
         raw_json = EXCLUDED.raw_json,
         valid_count = 0,
         error_text = EXCLUDED.error_text,
         created_at = NOW()`,
      [taskId, questionId, DEEPSEEK_DEFAULT_MODEL, JSON.stringify(payload), errMsg]
    );
    throw e;
  }

  const articlesIn = Array.isArray(parsed?.articles) ? parsed.articles : [];
  const storedPayload = {
    model: DEEPSEEK_DEFAULT_MODEL,
    content,
    parsed,
    usage,
  };

  await pool.query(
    `INSERT INTO geo_health_answer (task_id, question_id, model_name, raw_json, valid_count, error_text)
     VALUES ($1, $2, $3, $4::jsonb, 0, NULL)
     ON CONFLICT (question_id, model_name) DO UPDATE SET
       raw_json = EXCLUDED.raw_json,
       error_text = NULL,
       created_at = NOW()`,
    [taskId, questionId, DEEPSEEK_DEFAULT_MODEL, JSON.stringify(storedPayload)]
  );

  let validCount = 0;
  for (const a of articlesIn) {
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
      [
        taskId,
        questionId,
        DEEPSEEK_DEFAULT_MODEL,
        platform,
        title,
        url,
        publishTime,
        summary,
        contentHash,
        dedupeKey,
      ]
    );
    if (ins.rows.length) validCount += 1;
  }

  await pool.query(
    `UPDATE geo_health_answer SET valid_count = $1 WHERE task_id = $2 AND question_id = $3 AND model_name = $4`,
    [validCount, taskId, questionId, DEEPSEEK_DEFAULT_MODEL]
  );

  return {
    taskId,
    questionId,
    model: DEEPSEEK_DEFAULT_MODEL,
    validCount,
    articleCount: articlesIn.length,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 后台依次分批调用 DeepSeek（同一 task 下全部题目）。失败单题会记 error，不中断整批。
 * 全部结束后将 geo_health_task.status 置为 completed；若未预料的致命错误则 failed。
 */
export async function runAllProbesForTask(pool, taskId) {
  const { rows } = await pool.query(
    `SELECT id FROM geo_health_question WHERE task_id = $1 ORDER BY id ASC`,
    [taskId]
  );
  const ids = rows.map((r) => r.id);

  if (ids.length === 0) {
    await pool.query(`UPDATE geo_health_task SET status = 'completed' WHERE id = $1`, [taskId]);
    return { taskId, processed: 0, failedQuestions: 0 };
  }

  let failedQuestions = 0;
  try {
    const conc = GEO_HEALTH_PROBE_CONCURRENCY;
    const delayMs = GEO_HEALTH_PROBE_BATCH_DELAY_MS;

    for (let i = 0; i < ids.length; i += conc) {
      const batch = ids.slice(i, i + conc);
      const batchFails = await Promise.all(
        batch.map(async (questionId) => {
          try {
            await probeWithDeepseekAndStore(pool, { taskId, questionId });
            return 0;
          } catch (e) {
            console.error(`[geo-health] task=${taskId} question=${questionId}`, e?.message || e);
            return 1;
          }
        })
      );
      failedQuestions += batchFails.reduce((a, b) => a + b, 0);
      if (i + conc < ids.length) {
        await sleep(delayMs);
      }
    }

    await pool.query(`UPDATE geo_health_task SET status = 'completed' WHERE id = $1`, [taskId]);
    return { taskId, processed: ids.length, failedQuestions };
  } catch (e) {
    console.error(`[geo-health] task=${taskId} runner fatal`, e);
    await pool.query(`UPDATE geo_health_task SET status = 'failed' WHERE id = $1`, [taskId]);
    throw e;
  }
}

/** 供轮询：题目总数、已答数、成功/失败/待处理 */
export async function getGeoHealthTaskProgress(pool, { taskId, userId }) {
  const t = await pool.query(`SELECT id, status, keyword, created_at FROM geo_health_task WHERE id = $1 AND user_id = $2`, [
    taskId,
    userId,
  ]);
  if (t.rows.length === 0) return null;

  const totalR = await pool.query(`SELECT COUNT(*)::int AS c FROM geo_health_question WHERE task_id = $1`, [taskId]);
  const ansR = await pool.query(
    `SELECT
       COUNT(*)::int AS answered,
       COUNT(*) FILTER (WHERE error_text IS NOT NULL AND btrim(COALESCE(error_text, '')) <> '')::int AS failed
     FROM geo_health_answer
     WHERE task_id = $1`,
    [taskId]
  );

  const totalQuestions = totalR.rows[0].c;
  const answeredCount = ansR.rows[0].answered;
  const failedCount = ansR.rows[0].failed;
  const successCount = answeredCount - failedCount;
  const pendingCount = Math.max(0, totalQuestions - answeredCount);

  return {
    taskId,
    status: t.rows[0].status,
    keyword: t.rows[0].keyword,
    createdAt: t.rows[0].created_at,
    totalQuestions,
    answeredCount,
    successCount,
    failedCount,
    pendingCount,
  };
}
