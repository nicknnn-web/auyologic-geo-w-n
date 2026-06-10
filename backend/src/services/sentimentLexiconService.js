/**
 * 情感词库：供品牌体检「答案分析」Prompt 注入，统一 hasNegative / sentimentKeywords 口径。
 */

/** 情感词与词云短语允许的最大 Unicode 码点数（产品：最多四字） */
export const SENTIMENT_KEYWORD_MAX_CODEPOINTS = 4;

export function sentimentKeywordCodePointLength(s) {
  return [...String(s || '').trim()].length;
}

export function isSentimentKeywordLengthValid(s) {
  const n = sentimentKeywordCodePointLength(s);
  return n >= 1 && n <= SENTIMENT_KEYWORD_MAX_CODEPOINTS;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @returns {Promise<{ positive: string[]; neutral: string[]; negative: string[] }>}
 */
export async function loadSentimentLexiconForPrompt(pool, userId) {
  const uid = String(userId || '').trim() || 'unknown';
  let rows = [];
  try {
    const res = await pool.query(
      `SELECT keyword, tier
       FROM geo_sentiment_lexicon
       WHERE user_id = $1 AND enabled = true AND trim(keyword) <> ''
       ORDER BY tier, sort_order ASC, id ASC`,
      [uid]
    );
    rows = res.rows;
  } catch (e) {
    if (e.code === '42P01') {
      console.warn('[sentiment-lexicon] 表尚未初始化，跳过词表注入');
      return { positive: [], neutral: [], negative: [] };
    }
    throw e;
  }
  const out = { positive: [], neutral: [], negative: [] };
  for (const r of rows || []) {
    const k = String(r.keyword || '').trim();
    if (!k || !isSentimentKeywordLengthValid(k)) continue;
    const t = String(r.tier || '').toLowerCase();
    if (t === 'positive') out.positive.push(k);
    else if (t === 'neutral') out.neutral.push(k);
    else if (t === 'negative') out.negative.push(k);
  }
  return out;
}

function sortByKeywordLengthDesc(arr) {
  return [...(arr || [])].sort((a, b) => String(b).length - String(a).length);
}

/**
 * 报告词云：词库按长度降序排列（同档内优先长词）；匹配规则见 matchesLexiconKeyword（仅整词精确命中）。
 */
export async function loadSentimentLexiconPolarityRules(pool, userId) {
  const raw = await loadSentimentLexiconForPrompt(pool, userId);
  return {
    positive: sortByKeywordLengthDesc(raw.positive),
    neutral: sortByKeywordLengthDesc(raw.neutral),
    negative: sortByKeywordLengthDesc(raw.negative),
  };
}

/**
 * 从探针 raw_json 取回答正文（与 geoBrandAnalysisService 分析用文本一致）。
 * @param {object} rawJson
 * @returns {string}
 */
function answerFromLegacyContent(content) {
  const s = String(content || '').trim();
  if (!s) return '';
  if (!s.startsWith('{') && !s.startsWith('[')) return s;
  try {
    const o = JSON.parse(s);
    if (o && typeof o.answer === 'string' && o.answer.trim()) return o.answer.trim();
  } catch {
    /* fall through */
  }
  return s;
}

/** 探针回答送入分析/词云前的长度上限（与 geoBrandTaskConfig 默认一致） */
export function truncateTextForAnalysis(text, maxChars = 10000) {
  const s = String(text || '').trim();
  if (!s || s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}\n\n[…原文已截断，仅分析前 ${maxChars} 字…]`;
}

export function extractProbeAnswerText(rawJson) {
  const j = rawJson || {};
  const raw = String(j.raw_answer || '').trim();
  if (raw) return raw;
  const fromContent = answerFromLegacyContent(j.content || j.answer);
  if (fromContent) return fromContent;
  return (
    String(j.structured?.answer || '').trim() ||
    String(j.parsed?.answer || '').trim()
  );
}

/**
 * 与 GET /sentiment-lexicon/:id/trace 一致：在本 task 全部探针回答正文中，按子串非重叠扫描统计 keyword 出现次数之和。
 * @param {import('pg').Pool} pool
 * @param {number} taskId
 * @param {string} keyword
 * @returns {Promise<number>}
 */
export async function countProbeKeywordOccurrencesForTask(pool, taskId, keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) return 0;
  const tid = Number(taskId);
  if (!Number.isFinite(tid) || tid <= 0) return 0;
  const { rows: ans } = await pool.query(
    `SELECT ga.raw_json
     FROM geo_health_analysis a
     INNER JOIN geo_health_answer ga ON ga.id = a.answer_id AND ga.task_id = a.task_id
     WHERE a.task_id = $1 AND a.error_text IS NULL`,
    [tid]
  );
  let total = 0;
  for (const ar of ans) {
    const text = extractProbeAnswerText(ar.raw_json);
    if (!text) continue;
    let pos = 0;
    while (true) {
      const i = text.indexOf(kw, pos);
      if (i === -1) break;
      total += 1;
      pos = i + Math.max(1, kw.length);
    }
  }
  return total;
}

/**
 * 本期任务全部探针回答正文（与溯源 trace 同源 SQL）。
 * @param {import('pg').Pool} pool
 * @param {number} taskId
 * @returns {Promise<string[]>}
 */
export async function probeAnswerTextsForTask(pool, taskId) {
  const tid = Number(taskId);
  if (!Number.isFinite(tid) || tid <= 0) return [];
  const { rows } = await pool.query(
    `SELECT ga.raw_json
     FROM geo_health_analysis a
     INNER JOIN geo_health_answer ga ON ga.id = a.answer_id AND ga.task_id = a.task_id
     WHERE a.task_id = $1 AND a.error_text IS NULL`,
    [tid]
  );
  const out = [];
  for (const ar of rows || []) {
    const t = extractProbeAnswerText(ar.raw_json);
    if (t) out.push(t);
  }
  return out;
}

/**
 * 与溯源 trace 一致：逐条回答内对 keyword 做非重叠子串 indexOf 计数（大小写敏感，与 trace 相同）。
 * @param {string[]} texts
 * @param {string} keyword
 * @returns {number}
 */
export function countProbeKeywordSubstringHits(texts, keyword) {
  const kw = String(keyword || '').trim();
  if (!kw || !texts?.length) return 0;
  let total = 0;
  for (const text of texts) {
    let pos = 0;
    while (true) {
      const i = text.indexOf(kw, pos);
      if (i === -1) break;
      total += 1;
      pos = i + Math.max(1, kw.length);
    }
  }
  return total;
}

/**
 * 在回答原文中统计词库词出现次数：从左到右、非重叠子串匹配。
 * 词库词含拉丁字母时大小写不敏感；纯中文等按字面匹配。
 * @param {string} haystack
 * @param {string} needle
 * @returns {number}
 */
export function countLexiconPhraseInText(haystack, needle) {
  const h = String(haystack || '');
  const n = String(needle || '').trim();
  if (!h || !n) return 0;
  const useCi = /[a-z]/i.test(n);
  const src = useCi ? h.toLowerCase() : h;
  const pat = useCi ? n.toLowerCase() : n;
  let count = 0;
  let pos = 0;
  while (true) {
    const i = src.indexOf(pat, pos);
    if (i === -1) break;
    count += 1;
    pos = i + pat.length;
  }
  return count;
}

function dedupeLexiconKeywords(lexEntries) {
  const uniq = [];
  const seen = new Set();
  for (const e of lexEntries || []) {
    const k = String(e.keyword || '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniq.push(k);
  }
  return uniq;
}

/**
 * 词云：对每条探针回答原文，逐条累加各词库词的非重叠出现次数。
 * @param {Array<{ raw_json?: object }>} answerRows
 * @param {Array<{ keyword: string, polarity: string }>} lexEntries
 * @returns {Map<string, number>}
 */
export function aggregateLexiconHitsFromProbeAnswers(answerRows, lexEntries) {
  const uniqKeywords = dedupeLexiconKeywords(lexEntries);
  const lexHitCount = new Map();
  for (const row of answerRows || []) {
    const text = extractProbeAnswerText(row.raw_json);
    if (!text) continue;
    for (const keyword of uniqKeywords) {
      const c = countLexiconPhraseInText(text, keyword);
      if (!c) continue;
      lexHitCount.set(keyword, (lexHitCount.get(keyword) || 0) + c);
    }
  }
  return lexHitCount;
}

/**
 * 词云来源明细：每条分析回答 × 每个词库词一行（count>0），供报告弹窗列表。
 * @param {Array<{ task_id: number, question_id: number, raw_json?: object }>} answerRows
 * @param {Array<{ keyword: string, polarity: string }>} lexEntries
 * @returns {Array<{ taskId: number, questionId: number, answerText: string, keyword: string, count: number }>}
 */
export function buildSentimentSourceDetailRows(answerRows, lexEntries) {
  const uniqKeywords = dedupeLexiconKeywords(lexEntries);
  const out = [];
  for (const row of answerRows || []) {
    const taskId = Number(row.task_id);
    const questionId = Number(row.question_id);
    const text = extractProbeAnswerText(row.raw_json);
    if (!text) continue;
    for (const keyword of uniqKeywords) {
      const count = countLexiconPhraseInText(text, keyword);
      if (count > 0) {
        out.push({
          taskId: Number.isFinite(taskId) ? taskId : row.task_id,
          questionId: Number.isFinite(questionId) ? questionId : row.question_id,
          answerText: text,
          keyword,
          count,
        });
      }
    }
  }
  out.sort((a, b) => {
    if (a.questionId !== b.questionId) return a.questionId - b.questionId;
    return String(a.keyword).localeCompare(String(b.keyword), 'zh-Hans-CN');
  });
  return out;
}

/** 分词 token 与词库词须整词一致（trim 后）；不做子串包含，避免「大」误计「噪音大」。 */
function matchesLexiconKeyword(word, lexKw) {
  const w = String(word || '').trim();
  const k = String(lexKw || '').trim();
  if (!w || !k) return false;
  if (w === k) return true;
  if (w.toLowerCase() === k.toLowerCase()) return true;
  return false;
}

/**
 * 词云极性：先按词库三档命中；未命中返回 null，由报告层再用 has_negative / 可见度 集合兜底。
 * @param {string} word
 * @param {{ positive: string[]; neutral: string[]; negative: string[] }} rules
 * @returns {'positive'|'negative'|'neutral'|null}
 */
export function sentimentPolarityFromLexicon(word, rules) {
  if (!rules) return null;
  const order = [
    ['negative', rules.negative],
    ['positive', rules.positive],
    ['neutral', rules.neutral],
  ];
  for (const [pol, list] of order) {
    for (const k of list || []) {
      if (matchesLexiconKeyword(word, k)) return pol;
    }
  }
  return null;
}
