/**
 * 词云：词库命中 + 大模型从原文抽取的情感短语，合并后重合不双计（词库极性优先）。
 */

import { createAiClientByConnectionId } from './aiClientFactory.js';
import {
  countLexiconPhraseInText,
  extractProbeAnswerText,
  isSentimentKeywordLengthValid,
} from './sentimentLexiconService.js';
import { extractJsonFromText } from './geoBrandTaskService.js';
import {
  GEO_HEALTH_WORDCLOUD_AI_SYSTEM,
  buildGeoHealthWordCloudAiUserPrompt,
} from '../prompts/geoHealthWordCloudAi.js';

const POLARITY_SET = new Set(['positive', 'neutral', 'negative']);

/** 与词库英文大小写不敏感策略对齐：含拉丁字母时整串转小写作合并键；否则 trim 即可 */
export function mergeKeyForWordCloudPhrase(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  if (/[a-zA-Z]/.test(t)) return t.toLowerCase();
  return t;
}

async function resolveFirstEnabledConnectionId(pool, userId) {
  const { rows } = await pool.query(
    `SELECT id FROM ai_provider_connection
     WHERE user_id = $1 AND enabled = true
     ORDER BY id ASC LIMIT 1`,
    [userId]
  );
  const id = rows[0]?.id;
  return Number.isFinite(Number(id)) && Number(id) > 0 ? Number(id) : null;
}

function wordCloudAiDisabled() {
  const v = String(process.env.GEO_HEALTH_WORDCLOUD_AI ?? '1').trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'off';
}

function maxCharsPerBatch() {
  const n = Number(process.env.GEO_HEALTH_WORDCLOUD_AI_MAX_CHARS || 24000);
  return Number.isFinite(n) && n > 2000 ? n : 24000;
}

function maxAnswersPerBatch() {
  const n = Number(process.env.GEO_HEALTH_WORDCLOUD_AI_MAX_ANSWERS || 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 30) : 10;
}

function aiTimeoutMs() {
  const n = Number(process.env.GEO_HEALTH_WORDCLOUD_AI_TIMEOUT_MS || 120000);
  return Number.isFinite(n) && n > 5000 ? n : 120000;
}

/**
 * @param {unknown} parsed
 * @returns {Array<{ answerId: string, phrases: Array<{ phrase: string, polarity: string }> }>}
 */
function normalizeAiItems(parsed) {
  if (!parsed || typeof parsed !== 'object') return [];
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const out = [];
  for (const it of items) {
    const answerId = String(it?.answerId ?? it?.id ?? '').trim();
    const phrasesIn = Array.isArray(it?.phrases) ? it.phrases : [];
    const phrases = [];
    for (const p of phrasesIn) {
      const phrase = String(p?.phrase ?? '').trim();
      const polarity = String(p?.polarity ?? '').trim().toLowerCase();
      if (!phrase || !POLARITY_SET.has(polarity)) continue;
      if (!isSentimentKeywordLengthValid(phrase)) continue;
      phrases.push({ phrase, polarity });
    }
    if (answerId) out.push({ answerId, phrases });
  }
  return out;
}

/**
 * 将回答行切成若干批，控制单次 Prompt 体积。
 * @param {Array<{ analysis_id: number|string, raw_json?: object }>} rows
 */
function chunkAnswerRowsForWordCloudAi(rows) {
  const maxChars = maxCharsPerBatch();
  const maxN = maxAnswersPerBatch();
  const batches = [];
  let cur = [];
  let curChars = 0;

  const flush = () => {
    if (cur.length) {
      batches.push(cur);
      cur = [];
      curChars = 0;
    }
  };

  for (const row of rows || []) {
    const id = String(row.analysis_id ?? '').trim();
    const text = extractProbeAnswerText(row.raw_json);
    if (!id || !text) continue;
    const entry = { analysis_id: row.analysis_id, id, text };
    const addLen = text.length + id.length + 32;
    if (cur.length >= maxN || (cur.length > 0 && curChars + addLen > maxChars)) flush();
    cur.push(entry);
    curChars += addLen;
  }
  flush();
  return batches;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {{ brandName: string, industry?: string, brandDescription?: string, targetAudience?: string, answerRows: Array<{ analysis_id: number|string, raw_json?: object }> }} ctx
 * @returns {Promise<Array<{ phrase: string, polarity: string, analysisId: string }>>}
 */
export async function fetchWordCloudPhrasesFromAi(pool, userId, ctx) {
  if (wordCloudAiDisabled()) return [];

  const cid = await resolveFirstEnabledConnectionId(pool, userId);
  if (!cid) {
    console.warn('[wordcloud-ai] 无可用大模型连接，跳过 AI 词云补充');
    return [];
  }

  let client;
  try {
    client = await createAiClientByConnectionId(pool, cid, { userId });
  } catch (e) {
    console.warn('[wordcloud-ai] 创建 AI 客户端失败，跳过:', e.message || e);
    return [];
  }

  const batches = chunkAnswerRowsForWordCloudAi(ctx.answerRows);
  const collected = [];

  for (const batch of batches) {
    const payload = batch.map((b) => ({ id: b.id, text: b.text }));
    let answersJson;
    try {
      answersJson = JSON.stringify(payload);
    } catch {
      continue;
    }
    const userPrompt = buildGeoHealthWordCloudAiUserPrompt({
      brandName: ctx.brandName,
      industry: ctx.industry,
      brandDescription: ctx.brandDescription,
      targetAudience: ctx.targetAudience,
      answersJson,
    });

    let content = '';
    try {
      const res = await client.chat(
        [
          { role: 'system', content: GEO_HEALTH_WORDCLOUD_AI_SYSTEM },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.2, maxTokens: 4096, timeoutMs: aiTimeoutMs() }
      );
      content = res.content || '';
    } catch (e) {
      console.warn('[wordcloud-ai] 单批请求失败，跳过该批:', e.message || e);
      continue;
    }

    const parsed = extractJsonFromText(content);
    const items = normalizeAiItems(parsed);
    const textById = new Map(batch.map((b) => [String(b.id), b.text]));

    for (const it of items) {
      const fullText = textById.get(String(it.answerId));
      if (!fullText) continue;
      for (const { phrase, polarity } of it.phrases) {
        if (!phrase || !isSentimentKeywordLengthValid(phrase)) continue;
        if (fullText.indexOf(phrase) === -1) continue;
        if (countLexiconPhraseInText(fullText, phrase) < 1) continue;
        collected.push({ phrase, polarity, analysisId: String(it.answerId) });
      }
    }
  }

  return collected;
}

/**
 * 词库 + AI 合并为 sentimentWordCloud 列表（与前端 GEOHealthReport 字段一致）。
 * @param {object} p
 * @param {Array<{ keyword: string, polarity: string }>} p.lexEntries
 * @param {Map<string, number>} p.lexHitCount
 * @param {Array<{ analysis_id?: number|string, raw_json?: object }>} p.answerRows
 * @param {Array<{ phrase: string, polarity: string }>} p.aiRows
 * @returns {Array<{ text: string, count: number, polarity: string, weight: number, source?: string }>}
 */
export function mergeLexiconAndAiWordCloud(p) {
  const { lexEntries, lexHitCount, answerRows, aiRows } = p;

  /** 仅本任务确有命中的词库词参与「与 AI 去重」；词库有配置但 count=0 时不挡 AI 同语 */
  const lexMergeKeys = new Set();
  for (const e of lexEntries || []) {
    const kw = String(e.keyword || '').trim();
    if (!kw || (lexHitCount.get(kw) || 0) <= 0) continue;
    const k = mergeKeyForWordCloudPhrase(kw);
    if (k) lexMergeKeys.add(k);
  }

  /** @type {Map<string, { text: string, count: number, polarity: string, source: string }>} */
  const byDisplay = new Map();

  for (const e of lexEntries || []) {
    const kw = String(e.keyword || '').trim();
    if (!kw) continue;
    const count = lexHitCount.get(kw) || 0;
    if (count <= 0) continue;
    byDisplay.set(kw, {
      text: kw,
      count,
      polarity: e.polarity,
      source: 'lexicon',
    });
  }

  /** AI 同 mergeKey 只保留一条展示词与极性（先出现优先） */
  const aiCanonByMergeKey = new Map();
  for (const row of aiRows || []) {
    const phrase = String(row.phrase || '').trim();
    if (!phrase || !isSentimentKeywordLengthValid(phrase)) continue;
    const mk = mergeKeyForWordCloudPhrase(phrase);
    if (!mk || lexMergeKeys.has(mk)) continue;
    if (!POLARITY_SET.has(String(row.polarity || '').toLowerCase())) continue;
    if (aiCanonByMergeKey.has(mk)) continue;
    aiCanonByMergeKey.set(mk, {
      phrase,
      polarity: String(row.polarity).toLowerCase(),
    });
  }

  for (const { phrase, polarity } of aiCanonByMergeKey.values()) {
    let total = 0;
    for (const ans of answerRows || []) {
      const text = extractProbeAnswerText(ans.raw_json);
      if (!text) continue;
      total += countLexiconPhraseInText(text, phrase);
    }
    if (total <= 0) continue;
    byDisplay.set(phrase, {
      text: phrase,
      count: total,
      polarity,
      source: 'ai',
    });
  }

  const hitPositive = [...byDisplay.values()].map((x) => x.count).filter((c) => c > 0);
  const hitMax = hitPositive.length ? Math.max(...hitPositive, 1) : 1;

  const list = [...byDisplay.values()].map((x) => ({
    text: x.text,
    count: x.count,
    polarity: x.polarity,
    weight: x.count / hitMax,
    source: x.source,
  }));

  list.sort((a, b) => b.count - a.count || String(a.text).localeCompare(String(b.text), 'zh-Hans-CN'));
  return list;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {{ brandName: string, industry?: string, brandDescription?: string, targetAudience?: string, answerRows: Array<{ analysis_id: number|string, raw_json?: object }>, lexEntries: Array<{ keyword: string, polarity: string }>, lexHitCount: Map<string, number> }} args
 */
export async function buildSentimentWordCloudMerged(pool, userId, args) {
  const aiRows = await fetchWordCloudPhrasesFromAi(pool, userId, {
    brandName: args.brandName,
    industry: args.industry,
    brandDescription: args.brandDescription,
    targetAudience: args.targetAudience,
    answerRows: args.answerRows,
  });
  return mergeLexiconAndAiWordCloud({
    lexEntries: args.lexEntries,
    lexHitCount: args.lexHitCount,
    answerRows: args.answerRows,
    aiRows,
  });
}
