/**
 * 探针回答文本分词（服务端）：在拿到 answer 正文后切词，供报告词云等统计使用。
 * 优先使用 @node-rs/jieba；不可用时回退 Intl.Segmenter / 连续汉字与英文抽取。
 */

import { Jieba } from '@node-rs/jieba';
import { dict } from '@node-rs/jieba/dict.js';

const MAX_TOKENS = 4000;

const HAN_RE = /[\u3007\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+/g;
const LAT_RE = /[a-zA-Z][a-zA-Z0-9._-]*/g;

/** @type {InstanceType<typeof Jieba> | null} */
let jiebaInstance = null;
let jiebaInitError = null;

function getJieba() {
  if (jiebaInitError) return null;
  if (jiebaInstance) return jiebaInstance;
  try {
    jiebaInstance = Jieba.withDict(dict);
    return jiebaInstance;
  } catch (e) {
    jiebaInitError = e;
    console.warn('[answerTokenizer] @node-rs/jieba 初始化失败，使用回退分词:', e?.message || e);
    return null;
  }
}

function isJunkToken(s) {
  if (!s || s.length > 64) return true;
  if (/^[\s\u200b-\u200f\ufeff]+$/u.test(s)) return true;
  if (/^[\p{P}\p{S}]+$/u.test(s)) return true;
  return false;
}

function pushFilteredParts(parts, out) {
  for (const s of parts) {
    const t = String(s || '').trim();
    if (isJunkToken(t)) continue;
    out.push(t);
    if (out.length >= MAX_TOKENS) return true;
  }
  return false;
}

function segmentWithJieba(raw) {
  const j = getJieba();
  if (!j) return null;
  try {
    const parts = j.cut(raw, true);
    const out = [];
    if (pushFilteredParts(parts, out)) return out;
    return out.length ? out : null;
  } catch (e) {
    console.warn('[answerTokenizer] jieba.cut 失败:', e?.message || e);
    return null;
  }
}

function segmentWithIntl(raw) {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
  try {
    const seg = new Intl.Segmenter('zh-Hans-CN', { granularity: 'word' });
    const out = [];
    for (const part of seg.segment(raw)) {
      const s = String(part.segment || '').trim();
      if (isJunkToken(s)) continue;
      if (part.isWordLike !== true) continue;
      out.push(s);
      if (out.length >= MAX_TOKENS) return out;
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function naiveExtractTokens(raw) {
  const out = [];
  const pushMany = (re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const s = m[0].trim();
      if (s && !isJunkToken(s)) out.push(s);
      if (out.length >= MAX_TOKENS) return true;
    }
    return false;
  };
  if (pushMany(HAN_RE)) return out.slice(0, MAX_TOKENS);
  pushMany(LAT_RE);
  return out.slice(0, MAX_TOKENS);
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function segmentAnswerText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  return (
    segmentWithJieba(raw) ||
    segmentWithIntl(raw) ||
    naiveExtractTokens(raw)
  );
}
