/**
 * 品牌体检二次分析服务
 *
 * 职责：读取 geo_health_answer 中的 AI 原始回答 → 用"合并分析 prompt"做多维度判定 → 写入 geo_health_analysis
 *
 * 分析维度（一次 AI 调用完成全部）：
 *   visibility      品牌是否有效露出（visible / not_visible）
 *   position        推荐位置（T0首位 / T1非首位 / T2未提及 / T3负面）
 *   brand_status    品牌词质量（accurate / bias / missing / hijack / risk / not_applicable）
 *   compare_status  对比倾向（win / neutral / lose / hijack / risk / not_applicable）
 *   brandMentioned  是否提及品牌（boolean）
 *   brandRank       品牌推荐顺序（number | null）
 *   topBrand        首位推荐品牌名（string | null）
 *   competitorsMentioned  出现的竞品列表（string[]）
 *   hasNegative     是否出现负面（boolean）
 *   sourceType      主要信源类型（由 AI 根据回答内容动态判断，如"官网""知乎""小红书"等）
 *   sentimentKeywords     语义情绪精炼词（string[]，模型可选输出；词云统计用 answer_tokens 服务端分词）
 *
 * category 由 question_type 在代码侧映射，不让 AI 判断：
 *   brand / enterprise → "brand"
 *   compare            → "compare"
 *   price / product / scenario / 其它 → "open"
 */

import { createAiClient } from './aiClientFactory.js';
import { extractJsonFromText } from './geoBrandTaskService.js';
import {
  ANALYSIS_MODEL,
  GEO_HEALTH_ANALYSIS_CONCURRENCY,
  GEO_HEALTH_ANALYSIS_DELAY_MS,
  PROBE_MODELS,
} from '../config/geoBrandTaskConfig.js';

// ─────────────────────────────────────────────
// category 映射（代码侧确定，不依赖 AI）
// ─────────────────────────────────────────────

const BRAND_TYPES = new Set(['brand', 'enterprise', '品牌词', '企业词']);
const COMPARE_TYPES = new Set(['compare', '对比词']);

/**
 * 将 question_type（sys_dict data_key）映射到分析 category。
 * @param {string} questionType
 * @returns {'brand'|'compare'|'open'}
 */
export function inferCategory(questionType) {
  const t = String(questionType || '').toLowerCase().trim();
  if (BRAND_TYPES.has(t)) return 'brand';
  if (COMPARE_TYPES.has(t)) return 'compare';
  return 'open';
}

// ─────────────────────────────────────────────
// 分析 prompt
// ─────────────────────────────────────────────

// Prompt 已迁至 backend/src/prompts/geoHealthAnalysis.js
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisPrompt,
} from '../prompts/geoHealthAnalysis.js';
import { loadSentimentLexiconForPrompt } from './sentimentLexiconService.js';
import { segmentAnswerText } from './answerTokenizer.js';
export { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt };

// ─────────────────────────────────────────────
// 核心分析：单条 answer → 写入 geo_health_analysis
// ─────────────────────────────────────────────

/**
 * 对一条 geo_health_answer 执行分析，结果写入 geo_health_analysis。
 * 支持断点续跑：若 answer_id 已存在且无 error_text，直接跳过。
 *
 * @param {object} pool
 * @param {object} options
 * @param {number} options.taskId
 * @param {number} options.answerId   - geo_health_answer.id
 * @param {string} options.brand      - 企业/品牌名称
 * @param {boolean} [options.force]   - true 时强制重新分析（忽略已有结果）
 */
export async function analyzeOneAnswer(pool, { taskId, answerId, brand, force = false }) {
  // 断点续跑：已成功分析的直接跳过
  if (!force) {
    const existing = await pool.query(
      `SELECT id FROM geo_health_analysis WHERE answer_id = $1 AND error_text IS NULL`,
      [answerId]
    );
    if (existing.rows.length > 0) {
      return { skipped: true, answerId };
    }
  }

  // 读取 answer + 关联 question 信息
  const aRes = await pool.query(
    `SELECT
       ga.id           AS answer_id,
       ga.task_id,
       ga.question_id,
       ga.model_name,
       ga.raw_json,
       ga.error_text   AS answer_error,
       gq.question,
       gq.question_type,
       gq.source_question_id,
       gt.user_id      AS task_user_id
     FROM geo_health_answer ga
     JOIN geo_health_question gq ON gq.id = ga.question_id
     JOIN geo_health_task gt ON gt.id = ga.task_id
     WHERE ga.id = $1 AND ga.task_id = $2`,
    [answerId, taskId]
  );

  if (aRes.rows.length === 0) {
    throw new Error(`geo_health_answer id=${answerId} 不存在或不属于 task=${taskId}`);
  }

  const row = aRes.rows[0];

  // 若探针本身失败，记录分析层也失败，不重复调 AI
  if (row.answer_error) {
    await upsertAnalysis(pool, {
      taskId,
      questionId: row.question_id,
      answerId,
      sourceQuestionId: row.source_question_id,
      questionType: row.question_type,
      modelName: row.model_name,
      analysisProvider: ANALYSIS_MODEL,
      answerTokens: [],
      errorText: `探针失败，跳过分析：${row.answer_error}`,
      rawAnalysisJson: null,
    });
    return { skipped: false, answerId, error: 'probe_failed' };
  }

  // 从 raw_json 提取回答文本
  const rawJson = row.raw_json || {};
  const answerText =
    String(rawJson.content || rawJson.answer || '').trim() ||
    String(rawJson.parsed?.answer || '').trim();

  if (!answerText) {
    await upsertAnalysis(pool, {
      taskId,
      questionId: row.question_id,
      answerId,
      sourceQuestionId: row.source_question_id,
      questionType: row.question_type,
      modelName: row.model_name,
      analysisProvider: ANALYSIS_MODEL,
      answerTokens: [],
      errorText: '探针 raw_json 中未找到有效回答文本',
      rawAnalysisJson: null,
    });
    return { skipped: false, answerId, error: 'no_answer_text' };
  }

  const answerTokens = segmentAnswerText(answerText);

  if (!brand) {
    throw new Error('brand 为空，请先在「企业设置」中配置品牌名称');
  }

  const category = inferCategory(row.question_type);
  const taskUserId = String(row.task_user_id || 'default_user').trim() || 'default_user';
  const sentimentLexicon = await loadSentimentLexiconForPrompt(pool, taskUserId);
  const prompt = buildAnalysisPrompt({
    brand,
    question: row.question,
    answer: answerText,
    category,
    sentimentLexicon,
  });

  let analysisResult = null;
  let errMsg = null;

  try {
    const client = createAiClient(ANALYSIS_MODEL);
    const messages = [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];
    const { content } = await client.chat(messages, { maxTokens: 1024, temperature: 0.1 });
    analysisResult = extractJsonFromText(content);
    if (!analysisResult) throw new Error(`分析 AI 返回内容无法解析为 JSON：${content?.slice(0, 200)}`);
  } catch (e) {
    errMsg = e.message || String(e);
    await upsertAnalysis(pool, {
      taskId,
      questionId: row.question_id,
      answerId,
      sourceQuestionId: row.source_question_id,
      questionType: row.question_type,
      category,
      modelName: row.model_name,
      analysisProvider: ANALYSIS_MODEL,
      answerTokens,
      errorText: errMsg,
      rawAnalysisJson: null,
    });
    throw e;
  }

  await upsertAnalysis(pool, {
    taskId,
    questionId: row.question_id,
    answerId,
    sourceQuestionId: row.source_question_id,
    questionType: row.question_type,
    category,
    modelName: row.model_name,
    analysisProvider: ANALYSIS_MODEL,
    visibility: analysisResult.visibility,
    position: analysisResult.position,
    brandStatus: analysisResult.brand_status,
    compareStatus: analysisResult.compare_status,
    brandMentioned: normalizeBool(analysisResult.brandMentioned),
    brandRank: normalizeInt(analysisResult.brandRank),
    topBrand: normStr(analysisResult.topBrand),
    competitorsMentioned: normalizeArray(analysisResult.competitorsMentioned),
    hasNegative: normalizeBool(analysisResult.hasNegative),
    sourceType: normStr(analysisResult.sourceType),
    sentimentKeywords: normalizeArray(analysisResult.sentimentKeywords),
    answerTokens,
    rawAnalysisJson: analysisResult,
    errorText: null,
  });

  return { skipped: false, answerId, category, visibility: analysisResult.visibility };
}

// ─────────────────────────────────────────────
// 批量分析：全任务
// ─────────────────────────────────────────────

/**
 * 对一个 task 下所有 geo_health_answer 逐批运行分析。
 * 会自动从 users 表读取企业名称作为 brand。
 * 完成后更新 geo_health_task.status = 'completed'。
 *
 * @param {object} pool
 * @param {number} taskId
 */
export async function runAllAnalysisForTask(pool, taskId) {
  // 读取企业名称 —— 必须有值，否则分析结果无意义，直接中断
  const brand = await fetchBrandName(pool);
  if (!brand) {
    const warnMsg = '请先在「企业设置」中配置品牌名称（企业名称），再生成体检报告';
    console.warn(`[geo-analysis] task=${taskId} 中断：${warnMsg}`);
    await pool.query(
      `UPDATE geo_health_task SET status = 'failed', error_text = $2 WHERE id = $1`,
      [taskId, warnMsg]
    );
    throw new Error(warnMsg);
  }

  // 查询该任务所有 answer
  const { rows: answers } = await pool.query(
    `SELECT ga.id AS answer_id
     FROM geo_health_answer ga
     WHERE ga.task_id = $1
     ORDER BY ga.id ASC`,
    [taskId]
  );

  if (answers.length === 0) {
    await pool.query(`UPDATE geo_health_task SET status = 'completed' WHERE id = $1`, [taskId]);
    return { taskId, processed: 0, failedCount: 0, skippedCount: 0 };
  }

  await pool.query(`UPDATE geo_health_task SET status = 'analyzing' WHERE id = $1`, [taskId]);

  const conc = GEO_HEALTH_ANALYSIS_CONCURRENCY;
  const delayMs = GEO_HEALTH_ANALYSIS_DELAY_MS;
  let failedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < answers.length; i += conc) {
    const batch = answers.slice(i, i + conc);
    const results = await Promise.all(
      batch.map(async ({ answer_id: answerId }) => {
        try {
          const r = await analyzeOneAnswer(pool, { taskId, answerId, brand });
          if (r.skipped) skippedCount += 1;
          return 0;
        } catch (e) {
          console.error(
            `[geo-analysis] fail task=${taskId} answer=${answerId}`,
            e?.message || e
          );
          return 1;
        }
      })
    );
    failedCount += results.reduce((a, b) => a + b, 0);
    if (i + conc < answers.length) await sleep(delayMs);
  }

  await pool.query(`UPDATE geo_health_task SET status = 'completed' WHERE id = $1`, [taskId]);
  console.log(
    `[geo-analysis] task=${taskId} 完成 total=${answers.length} failed=${failedCount} skipped=${skippedCount}`
  );
  return { taskId, processed: answers.length, failedCount, skippedCount };
}

// ─────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────

/** 从 users 表读取企业名称，失败时返回空字符串 */
async function fetchBrandName(pool) {
  try {
    const { rows } = await pool.query(
      `SELECT company_name FROM users WHERE user_id = 'default_user' LIMIT 1`
    );
    return String(rows[0]?.company_name || '').trim();
  } catch {
    return '';
  }
}

/** upsert 一条分析记录 */
async function upsertAnalysis(pool, fields) {
  const {
    taskId, questionId, answerId, sourceQuestionId, questionType, category,
    modelName, analysisProvider,
    visibility, position, brandStatus, compareStatus,
    brandMentioned, brandRank, topBrand,
    competitorsMentioned, hasNegative, sourceType, sentimentKeywords, answerTokens,
    rawAnalysisJson, errorText,
  } = fields;

  const tokensJson = JSON.stringify(Array.isArray(answerTokens) ? answerTokens : []);

  await pool.query(
    `INSERT INTO geo_health_analysis (
       task_id, question_id, answer_id, source_question_id, question_type, category,
       model_name, analysis_provider,
       visibility, position, brand_status, compare_status,
       brand_mentioned, brand_rank, top_brand,
       competitors_mentioned, has_negative, source_type, sentiment_keywords, answer_tokens,
       raw_analysis_json, error_text
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8,
       $9, $10, $11, $12,
       $13, $14, $15,
       $16::jsonb, $17, $18, $19::jsonb, $20::jsonb,
       $21::jsonb, $22
     )
     ON CONFLICT (answer_id) DO UPDATE SET
       category            = EXCLUDED.category,
       visibility          = EXCLUDED.visibility,
       position            = EXCLUDED.position,
       brand_status        = EXCLUDED.brand_status,
       compare_status      = EXCLUDED.compare_status,
       brand_mentioned     = EXCLUDED.brand_mentioned,
       brand_rank          = EXCLUDED.brand_rank,
       top_brand           = EXCLUDED.top_brand,
       competitors_mentioned = EXCLUDED.competitors_mentioned,
       has_negative        = EXCLUDED.has_negative,
       source_type         = EXCLUDED.source_type,
       sentiment_keywords  = EXCLUDED.sentiment_keywords,
       answer_tokens         = EXCLUDED.answer_tokens,
       raw_analysis_json   = EXCLUDED.raw_analysis_json,
       error_text          = EXCLUDED.error_text,
       created_at          = NOW()`,
    [
      taskId, questionId, answerId, sourceQuestionId ?? null, questionType ?? null, category ?? null,
      modelName ?? null, analysisProvider ?? null,
      visibility ?? null, position ?? null, brandStatus ?? null, compareStatus ?? null,
      brandMentioned ?? null, brandRank ?? null, topBrand ?? null,
      JSON.stringify(competitorsMentioned ?? []),
      hasNegative ?? null,
      sourceType ?? null,
      JSON.stringify(sentimentKeywords ?? []),
      tokensJson,
      rawAnalysisJson ? JSON.stringify(rawAnalysisJson) : null,
      errorText ?? null,
    ]
  );
}

function normalizeBool(v) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return null;
}

function normalizeInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function normStr(v) {
  if (v === null || v === undefined || v === 'null') return null;
  const s = String(v).trim();
  return s || null;
}

function normalizeArray(v) {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return [];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
