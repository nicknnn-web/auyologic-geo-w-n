/**
 * 情感词库：供品牌体检「答案分析」Prompt 注入，统一 hasNegative / sentimentKeywords 口径。
 */

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @returns {Promise<{ positive: string[]; neutral: string[]; negative: string[] }>}
 */
export async function loadSentimentLexiconForPrompt(pool, userId) {
  const uid = String(userId || 'default_user').trim() || 'default_user';
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
    if (!k) continue;
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
 * 报告词云：按关键词长度降序排列，优先匹配长词（避免短词误伤）。
 */
export async function loadSentimentLexiconPolarityRules(pool, userId) {
  const raw = await loadSentimentLexiconForPrompt(pool, userId);
  return {
    positive: sortByKeywordLengthDesc(raw.positive),
    neutral: sortByKeywordLengthDesc(raw.neutral),
    negative: sortByKeywordLengthDesc(raw.negative),
  };
}

function matchesLexiconKeyword(word, lexKw) {
  const w = String(word || '').trim();
  const k = String(lexKw || '').trim();
  if (!w || !k) return false;
  if (w === k) return true;
  if (w.toLowerCase() === k.toLowerCase()) return true;
  if (k.length < 2) return false;
  return w.includes(k) || k.includes(w);
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
