/**
 * 品牌体检任务：从 questions 抽样 → 探针 AI → 博查信源 → 分析
 *
 * 维护说明：
 * - 抽题数量：改 config/geoBrandTaskConfig.js 里的 GEO_HEALTH_QUESTIONS_PER_TYPE
 * - 探针模型：geo_health_task.connection_ids；信源：BOCHA_API_KEY + analysis_connection_id
 * - 信源入库见 services/geoHealthSourcePipeline.js
 */
import {
  PROVIDERS,
  createAiClientByConnectionId,
  createAiClientsByIds,
} from './aiClientFactory.js';
import {
  GEO_HEALTH_QUESTIONS_PER_TYPE,
  GEO_HEALTH_PROBE_BATCH_DELAY_MS,
  GEO_HEALTH_PROBE_CONCURRENCY,
  GEO_HEALTH_PROBE_MAX_TOKENS,
  GEO_HEALTH_PROBE_TIMEOUT_MS,
  GEO_HEALTH_KEYWORD_TYPE_DICT_TYPE,
} from '../config/geoBrandTaskConfig.js';

/** 历史兼容：默认模型名（仅向后兼容用，新流程不再依赖） */
export const DEEPSEEK_DEFAULT_MODEL = PROVIDERS.deepseek?.defaultModel || 'deepseek-chat';

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

/**
 * 从已审核问题库随机抽取：按 keyword_type（单值或 IN）、extraAnd；可选 userId（与 COALESCE 空 user_id→default_user 对齐）。
 * keywordTypesIn 与 keywordType 二选一；优先 keywordTypesIn。
 */
export async function pickApprovedQuestions(pool, { keywordType, keywordTypesIn, extraAnd = '', limit, userId = null }) {
  const params = [];
  let i = 1;
  let sql = `
    SELECT q.id, q.question
    FROM questions q
    WHERE q.status = 'approved'
  `;
  if (userId != null && String(userId).trim() !== '') {
    const uid = String(userId).trim();
    sql += ` AND COALESCE(NULLIF(trim(q.user_id), ''), 'default_user') = $${i}`;
    params.push(uid);
    i += 1;
  }
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

/**
 * 创建任务：按字典 keyword_type 每一类各抽 GEO_HEALTH_QUESTIONS_PER_TYPE 条（不按关键词）。检测时只把问题发给大模型。
 * geo_health_task.keyword 存创建时的企业品牌名称（与「企业设置」中的公司名称一致），供报告按品牌区分任务。
 */
async function fetchEnterpriseBrandKeyword(pool, userId) {
  const uid = String(userId || '').trim() || 'default_user';
  const { rows } = await pool.query(`SELECT company_name FROM users WHERE user_id = $1 LIMIT 1`, [uid]);
  const name = String(rows[0]?.company_name || '').trim();
  return name.slice(0, 500);
}

/**
 * 校验给定连接 ID 列表全部归属当前用户、enabled=true，并返回有效 ID 数组（去重 + 保序）。
 * @param {object} pool
 * @param {string} userId
 * @param {Array<number|string>} ids
 * @returns {Promise<number[]>}
 */
async function validateConnectionIdsForUser(pool, userId, ids) {
  const intIds = [
    ...new Set(
      (Array.isArray(ids) ? ids : [])
        .map((x) => parseInt(String(x), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ];
  if (intIds.length === 0) {
    throw new Error('请至少选择一个用于体检的大模型连接');
  }
  const { rows } = await pool.query(
    `SELECT id FROM ai_provider_connection
     WHERE user_id = $1 AND enabled = true AND id = ANY($2::int[])`,
    [userId, intIds]
  );
  const ok = new Set(rows.map((r) => r.id));
  const invalid = intIds.filter((id) => !ok.has(id));
  if (invalid.length) {
    throw new Error(`所选连接不可用或不属于当前用户：${invalid.join(', ')}`);
  }
  return intIds;
}

export async function createGeoTaskAndQuestions(pool, { userId, connectionIds, analysisConnectionId }) {
  const { buckets } = await resolveGeoHealthKeywordBuckets(pool);
  if (!buckets.length) {
    throw new Error('字典 keyword_type 无启用项（sys_dict 中 dict_type=keyword_type 为空），无法抽题');
  }

  const brandKeyword = await fetchEnterpriseBrandKeyword(pool, userId);

  const validIds = await validateConnectionIdsForUser(pool, userId, connectionIds);
  let analysisId = analysisConnectionId ? parseInt(String(analysisConnectionId), 10) : null;
  if (analysisId) {
    const { rows } = await pool.query(
      `SELECT id FROM ai_provider_connection
       WHERE user_id = $1 AND enabled = true AND id = $2`,
      [userId, analysisId]
    );
    if (!rows[0]) throw new Error(`分析模型连接不可用：${analysisId}`);
  } else {
    // 默认分析模型 = 探针列表第一个（一项任务用一个分析模型已够）
    analysisId = validIds[0];
  }

  const ins = await pool.query(
    `INSERT INTO geo_health_task (user_id, keyword, status, connection_ids, analysis_connection_id)
     VALUES ($1, $2, 'pending', $3::int[], $4) RETURNING *`,
    [userId, brandKeyword, validIds, analysisId]
  );
  const task = ins.rows[0];
  const taskId = task.id;

  let total = 0;
  const perType = GEO_HEALTH_QUESTIONS_PER_TYPE;
  const pickedSummary = [];
  for (const bucket of buckets) {
    const rows = await pickApprovedQuestions(pool, {
      keywordType: bucket.keywordType,
      extraAnd: bucket.extraAnd,
      limit: perType,
      userId,
    });

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

    if (rows.length) {
      // 批量 INSERT：unnest 数组一次入库，避免 N 次 round-trip
      const sourceIds = rows.map((r) => r.id);
      const questions = rows.map((r) => r.question);
      const types = rows.map(() => bucket.questionType);
      await pool.query(
        `INSERT INTO geo_health_question (task_id, source_question_id, question, question_type)
         SELECT $1, sid, q, qt
         FROM unnest($2::int[], $3::text[], $4::text[]) AS t(sid, q, qt)`,
        [taskId, sourceIds, questions, types]
      );
      total += rows.length;
    }
  }

  if (total === 0) {
    await pool.query(`DELETE FROM geo_health_task WHERE id = $1`, [taskId]);
    throw new Error(
      '当前账号下没有可用的「已审核」拓展问题（按关键词类型匹配）。请先在「拓展问题」中审核题目后再发起品牌体检。'
    );
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
 * 对单题 + 单连接调用 AI，写入 geo_health_answer（不含信源；信源由博查流水线写入）。
 *
 * 模型来源：完全来自数据库中的 ai_provider_connection 行，按 connectionId 解密 → OpenAI 兼容客户端。
 *
 * @param {object} pool - pg Pool
 * @param {object} options
 * @param {number} options.taskId
 * @param {number} options.questionId
 * @param {number} options.connectionId - ai_provider_connection.id（必填）
 * @param {object} [options.preparedClient] - 可选：已实例化的客户端（{ chat, model, vendorName, providerKey, connectionId }）
 * @param {string} [options.systemPrompt]
 * @param {string} [options.userPrompt]   - 若不传则用默认构建
 * @param {number} [options.maxTokens=4096]
 * @param {number} [options.temperature=0.3]
 */
/** 任务行仍存在（未被用户中止删除） */
export async function geoHealthTaskExists(pool, taskId) {
  const r = await pool.query(`SELECT 1 FROM geo_health_task WHERE id = $1 LIMIT 1`, [taskId]);
  return r.rows.length > 0;
}

export async function probeOneQuestionWithModel(pool, options) {
  const {
    taskId,
    questionId,
    connectionId,
    preparedClient,
    preparedQuestion,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    userPrompt: userPromptOverride,
    maxTokens = GEO_HEALTH_PROBE_MAX_TOKENS,
    temperature = 0.3,
    signal,
    timeoutMs = GEO_HEALTH_PROBE_TIMEOUT_MS,
  } = options;

  if (!(await geoHealthTaskExists(pool, taskId))) {
    return null;
  }

  if (!connectionId && !preparedClient) {
    throw new Error('probeOneQuestionWithModel: 需要 connectionId 或 preparedClient');
  }
  const client = preparedClient || (await createAiClientByConnectionId(pool, connectionId));
  const modelName = client.vendorName;
  const cid = client.connectionId;

  // 预取的题目元数据优先使用，避免 N×M 次重复 SQL
  let row = preparedQuestion;
  if (!row) {
    const qRes = await pool.query(
      `SELECT gq.id, gq.question, gq.question_type,
              COALESCE(d.data_value, gq.question_type) AS keyword_type_label
       FROM geo_health_question gq
       LEFT JOIN sys_dict d ON d.dict_type = $3 AND d.data_key = gq.question_type
       WHERE gq.id = $1 AND gq.task_id = $2`,
      [questionId, taskId, GEO_HEALTH_KEYWORD_TYPE_DICT_TYPE]
    );
    if (qRes.rows.length === 0) throw new Error('找不到该任务下的问题');
    row = qRes.rows[0];
  }

  const typeLine =
    row.keyword_type_label && String(row.keyword_type_label) !== String(row.question_type)
      ? `${row.keyword_type_label}（${row.question_type}）`
      : String(row.question_type ?? '');
  const userPrompt = userPromptOverride || buildDefaultUserPrompt(typeLine, row.question);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let content = '';
  let parsed = null;
  let errMsg = null;
  let usage = null;

  try {
    const out = await client.chat(messages, { maxTokens, temperature, signal, timeoutMs });
    content = out.content;
    usage = out.usage ?? null;
    parsed = extractJsonFromText(content);
  } catch (e) {
    errMsg = e.message || String(e);
    if (await geoHealthTaskExists(pool, taskId)) {
      await pool.query(
        `INSERT INTO geo_health_answer (task_id, question_id, model_name, connection_id, raw_json, valid_count, error_text)
         VALUES ($1, $2, $3, $4, $5::jsonb, 0, $6)
         ON CONFLICT (question_id, model_name) DO UPDATE SET
           raw_json = EXCLUDED.raw_json,
           connection_id = EXCLUDED.connection_id,
           valid_count = 0,
           error_text = EXCLUDED.error_text,
           created_at = NOW()`,
        [
          taskId,
          questionId,
          modelName,
          cid,
          JSON.stringify({ error: errMsg, vendorName: modelName, providerKey: client.providerKey, model: client.model }),
          errMsg,
        ]
      );
    }
    throw e;
  }

  const storedPayload = {
    providerKey: client.providerKey,
    vendorName: modelName,
    connectionId: cid,
    model: client.model,
    content,
    parsed,
    usage,
  };

  if (!(await geoHealthTaskExists(pool, taskId))) {
    return null;
  }

  await pool.query(
    `INSERT INTO geo_health_answer (task_id, question_id, model_name, connection_id, raw_json, valid_count, error_text)
     VALUES ($1, $2, $3, $4, $5::jsonb, 0, NULL)
     ON CONFLICT (question_id, model_name) DO UPDATE SET
       raw_json = EXCLUDED.raw_json,
       connection_id = EXCLUDED.connection_id,
       error_text = NULL,
       created_at = NOW()`,
    [taskId, questionId, modelName, cid, JSON.stringify(storedPayload)]
  );

  return {
    taskId,
    questionId,
    connectionId: cid,
    vendorName: modelName,
    providerKey: client.providerKey,
    model: client.model,
  };
}

/**
 * 向后兼容别名：保留 probeWithDeepseekAndStore 名称（要求调用方传入 connectionId）
 */
export async function probeWithDeepseekAndStore(pool, options) {
  return probeOneQuestionWithModel(pool, options);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 后台依次分批调用 AI（支持多模型）。
 * 每道题 × 每个 task.connection_ids 中的连接各调用一次，结果分别存入 geo_health_answer。
 * 失败单题/单模型会记 error，不中断整批。
 * 全部结束后将 geo_health_task.status 置为 'probing_done'（由调用方决定是否继续分析）。
 */
export async function runAllProbesForTask(pool, taskId) {
  // 读取任务信息，拿到 connection_ids
  const tRes = await pool.query(
    `SELECT id, user_id, connection_ids FROM geo_health_task WHERE id = $1`,
    [taskId]
  );
  const taskRow = tRes.rows[0];
  if (!taskRow) throw new Error(`任务不存在 taskId=${taskId}`);
  const connectionIds = Array.isArray(taskRow.connection_ids) ? taskRow.connection_ids : [];
  if (!connectionIds.length) {
    await pool.query(
      `UPDATE geo_health_task SET status = 'failed', error_text = $2 WHERE id = $1`,
      [taskId, '任务未指定大模型连接（connection_ids 为空），请重新选择模型生成体检']
    );
    throw new Error('任务未指定大模型连接');
  }

  // 一次预取：题目元数据 + 字典 label
  const { rows: questionRows } = await pool.query(
    `SELECT gq.id, gq.question, gq.question_type,
            COALESCE(d.data_value, gq.question_type) AS keyword_type_label
     FROM geo_health_question gq
     LEFT JOIN sys_dict d ON d.dict_type = $2 AND d.data_key = gq.question_type
     WHERE gq.task_id = $1
     ORDER BY gq.id ASC`,
    [taskId, GEO_HEALTH_KEYWORD_TYPE_DICT_TYPE]
  );
  if (questionRows.length === 0) {
    await pool.query(`UPDATE geo_health_task SET status = 'completed' WHERE id = $1`, [taskId]);
    return { taskId, processed: 0, failedCount: 0 };
  }
  const questionMap = new Map(questionRows.map((r) => [r.id, r]));

  // 任务级缓存：所有连接的客户端只解密一次复用
  let clientMap;
  try {
    clientMap = await createAiClientsByIds(pool, connectionIds, { userId: taskRow.user_id });
  } catch (e) {
    console.error(`[geo-health] 任务=${taskId} 解析连接失败`, e?.message || e);
    await pool.query(
      `UPDATE geo_health_task SET status = 'failed', error_text = $2 WHERE id = $1`,
      [taskId, `解析大模型连接失败：${e?.message || e}`]
    );
    throw e;
  }

  // 构建"题目 × 连接"任务列表
  const tasks = [];
  for (const q of questionRows) {
    for (const cid of connectionIds) {
      tasks.push({ questionId: q.id, connectionId: cid });
    }
  }

  const conc = GEO_HEALTH_PROBE_CONCURRENCY;
  const delayMs = GEO_HEALTH_PROBE_BATCH_DELAY_MS;
  let failedCount = 0;

  try {
    await pool.query(`UPDATE geo_health_task SET status = 'probing' WHERE id = $1`, [taskId]);

    // 滑动窗口并发：任一项完成立即调度下一项，最慢的题不会阻塞整批
    failedCount = await runWithSlidingConcurrency(tasks, conc, async ({ questionId, connectionId }) => {
      try {
        const preparedClient = clientMap.get(connectionId);
        const pr = await probeOneQuestionWithModel(pool, {
          taskId,
          questionId,
          connectionId,
          preparedClient,
          preparedQuestion: questionMap.get(questionId),
        });
        if (pr == null) return 0;
        return 0;
      } catch (e) {
        console.error(
          `[geo-health] probe fail task=${taskId} question=${questionId} connection=${connectionId}`,
          e?.message || e
        );
        return 1;
      } finally {
        if (delayMs > 0) await sleep(delayMs);
      }
    });

    if (!(await geoHealthTaskExists(pool, taskId))) {
      console.log(`[geo-health] task=${taskId} 已删除（中止），跳过 probing_done`);
      return { taskId, processed: tasks.length, failedCount };
    }

    // probing 完成，等待 runAllAnalysisForTask 把状态推到 completed
    await pool.query(`UPDATE geo_health_task SET status = 'probing_done' WHERE id = $1`, [taskId]);
    return { taskId, processed: tasks.length, failedCount };
  } catch (e) {
    console.error(`[geo-health] task=${taskId} probe runner fatal`, e);
    if (await geoHealthTaskExists(pool, taskId)) {
      await pool.query(`UPDATE geo_health_task SET status = 'failed' WHERE id = $1`, [taskId]);
    }
    throw e;
  }
}

/**
 * 滑动窗口并发执行器：始终保持最多 limit 个并发；任一 worker 完成立即取下一项。
 * worker 应自行 try/catch 并返回 1（失败）或 0（成功），返回值之和即失败数。
 *
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<number>} worker
 * @returns {Promise<number>} 失败计数总和
 */
export async function runWithSlidingConcurrency(items, limit, worker) {
  const total = items.length;
  let cursor = 0;
  let failed = 0;
  const n = Math.max(1, Math.min(limit, total));
  const runners = Array.from({ length: n }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= total) return;
      try {
        const r = await worker(items[idx]);
        if (r) failed += r;
      } catch {
        // worker 内部已 try/catch；这里再兜一层保险
        failed += 1;
      }
    }
  });
  await Promise.all(runners);
  return failed;
}

/**
 * 供轮询：题目总数、已答数、成功/失败/待处理 + 分析进度。
 * 同时支持 probing / analyzing / completed 等状态。
 */
export async function getGeoHealthTaskProgress(pool, { taskId, userId }) {
  const t = await pool.query(
    `SELECT id, status, keyword, error_text, created_at, connection_ids
     FROM geo_health_task WHERE id = $1 AND user_id = $2`,
    [taskId, userId]
  );
  if (t.rows.length === 0) return null;

  const totalR = await pool.query(
    `SELECT COUNT(*)::int AS c FROM geo_health_question WHERE task_id = $1`,
    [taskId]
  );
  // 每题 × 每个连接都算一条 answer
  const taskConnIds = Array.isArray(t.rows[0].connection_ids) ? t.rows[0].connection_ids : [];
  const probeModelCount = taskConnIds.length || 1;
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

  let sourceSearchDone = 0;
  let sourceSearchFailed = 0;
  try {
    const ssR = await pool.query(
      `SELECT
         COUNT(*)::int AS done,
         COUNT(*) FILTER (WHERE error_text IS NOT NULL AND btrim(error_text) <> '')::int AS failed
       FROM geo_health_source_search WHERE task_id = $1`,
      [taskId]
    );
    sourceSearchDone = ssR.rows[0]?.done ?? 0;
    sourceSearchFailed = ssR.rows[0]?.failed ?? 0;
  } catch {
    /* 表未迁移时忽略 */
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
    sourceSearchDone,
    sourceSearchTotal: totalQuestions,
    sourceSearchFailed,
  };
}
