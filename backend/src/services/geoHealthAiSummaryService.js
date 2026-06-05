/**
 * GEO 体检报告 - AI 智能总结服务
 *
 * 基于已算好的报告 payload，调用任务配置的分析模型生成一段「结果解读」，
 * 并将结果与当时的分析指纹一起落库到 geo_health_task，便于下次直接展示并判断是否过期。
 */
import { createAiClientByConnectionId } from './aiClientFactory.js';
import {
  GEO_HEALTH_AI_SUMMARY_SYSTEM,
  buildGeoHealthAiSummaryUserPrompt,
} from '../prompts/geoHealthAiSummary.js';

const AI_SUMMARY_MAX_TOKENS = 1200;
const AI_SUMMARY_TIMEOUT_MS = 60000;

/**
 * 【可在此处修改 AI 智能总结使用的模型】
 * 如果想固定用某一个「大模型接入」连接（不跟随任务的分析模型），
 * 把下面 FORCE_SUMMARY_CONNECTION_ID 改成对应连接的 id（数字）即可；
 * 也可用环境变量 GEO_AI_SUMMARY_CONNECTION_ID 覆盖。设为 0 / null 表示不固定，走默认优先级。
 */
const FORCE_SUMMARY_CONNECTION_ID = 0;

function resolveForcedSummaryConnectionId() {
  const fromEnv = Number(process.env.GEO_AI_SUMMARY_CONNECTION_ID);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  if (Number.isFinite(FORCE_SUMMARY_CONNECTION_ID) && FORCE_SUMMARY_CONNECTION_ID > 0) {
    return FORCE_SUMMARY_CONNECTION_ID;
  }
  return null;
}

/**
 * 解析用于生成总结的大模型连接，优先级：
 * ① 强制指定（FORCE_SUMMARY_CONNECTION_ID / 环境变量）
 * ② 任务配置的分析模型 analysis_connection_id
 * ③ 该用户第一条 enabled 且非博查的连接
 */
async function resolveSummaryConnectionId(pool, userId, analysisConnectionId) {
  const forced = resolveForcedSummaryConnectionId();
  if (forced) return forced;

  const fromTask = Number(analysisConnectionId);
  if (Number.isFinite(fromTask) && fromTask > 0) return fromTask;
  const uid = String(userId || 'default_user').trim() || 'default_user';
  const { rows } = await pool.query(
    `SELECT id FROM ai_provider_connection
     WHERE user_id = $1 AND enabled = true AND provider_key <> 'bocha'
     ORDER BY id ASC LIMIT 1`,
    [uid]
  );
  const id = rows[0]?.id;
  return Number.isFinite(Number(id)) && Number(id) > 0 ? Number(id) : null;
}

/**
 * 生成并落库 AI 智能总结。
 * @param {import('pg').Pool} pool
 * @param {object} args
 * @param {number} args.taskId
 * @param {string} args.userId
 * @param {object} args.report   主报告 payload（含 brandName/各指标）
 * @param {string} args.analysisFp  当前分析指纹（用于过期判断）
 * @returns {Promise<{ text: string, generatedAt: string }>}
 */
export async function generateGeoHealthAiSummary(pool, { taskId, userId, report, analysisFp }) {
  const { rows } = await pool.query(
    `SELECT analysis_connection_id FROM geo_health_task WHERE id = $1 AND user_id = $2`,
    [taskId, userId]
  );
  if (!rows[0]) throw new Error('任务不存在或无权访问');

  const cid = await resolveSummaryConnectionId(pool, userId, rows[0].analysis_connection_id);
  if (!cid) {
    throw new Error('未找到可用的大模型连接，请先在「大模型接入」中配置并启用一个模型');
  }

  const client = await createAiClientByConnectionId(pool, cid, { userId });
  const messages = [
    { role: 'system', content: GEO_HEALTH_AI_SUMMARY_SYSTEM },
    { role: 'user', content: buildGeoHealthAiSummaryUserPrompt(report) },
  ];
  const { content } = await client.chat(messages, {
    maxTokens: AI_SUMMARY_MAX_TOKENS,
    temperature: 0.5,
    timeoutMs: AI_SUMMARY_TIMEOUT_MS,
  });
  const text = String(content || '').trim();
  if (!text) throw new Error('大模型返回为空，请稍后重试');

  const generatedAt = new Date();
  await pool.query(
    `UPDATE geo_health_task
     SET ai_summary = $1, ai_summary_at = $2, ai_summary_fp = $3
     WHERE id = $4 AND user_id = $5`,
    [text, generatedAt, String(analysisFp || ''), taskId, userId]
  );

  return { text, generatedAt: generatedAt.toISOString() };
}

/**
 * 读取已存的 AI 总结，并根据分析指纹判断是否过期（数据更新后老总结视为 stale）。
 */
export async function loadGeoHealthAiSummary(pool, taskId, userId, currentFp) {
  try {
    const { rows } = await pool.query(
      `SELECT ai_summary, ai_summary_at, ai_summary_fp
       FROM geo_health_task WHERE id = $1 AND user_id = $2`,
      [taskId, userId]
    );
    const row = rows[0];
    const text = String(row?.ai_summary || '').trim();
    if (!text) return null;
    return {
      text,
      generatedAt: row.ai_summary_at ? new Date(row.ai_summary_at).toISOString() : null,
      stale: String(row.ai_summary_fp || '') !== String(currentFp || ''),
    };
  } catch (e) {
    console.warn('[geo-health-ai-summary] load:', e?.message || e);
    return null;
  }
}
