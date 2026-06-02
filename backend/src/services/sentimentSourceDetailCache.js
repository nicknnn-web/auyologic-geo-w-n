/**
 * 词云来源明细：按 task 缓存已解析探针正文 + 命中索引，避免每次请求重复扫库与 JSON 解析。
 */
import {
  countLexiconPhraseInText,
  extractProbeAnswerText,
} from './sentimentLexiconService.js';
import { loadWordCloudLexEntriesForTask } from './geoHealthWordCloudPersistService.js';

const CACHE_TTL_MS = 15 * 60 * 1000;
/** @type {Map<string, { at: number, answers: Array<{ taskId: number, questionId: number, text: string }>, keywords: string[], hits: Array<{ taskId: number, questionId: number, keyword: string, count: number, answerIndex: number }> }>} */
const taskCache = new Map();

function dedupeKeywords(lexEntries) {
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

function buildHitIndex(answers, keywords) {
  const hits = [];
  for (let ai = 0; ai < answers.length; ai += 1) {
    const a = answers[ai];
    for (const keyword of keywords) {
      const count = countLexiconPhraseInText(a.text, keyword);
      if (count > 0) {
        hits.push({
          taskId: a.taskId,
          questionId: a.questionId,
          keyword,
          count,
          answerIndex: ai,
        });
      }
    }
  }
  hits.sort((x, y) => {
    if (x.questionId !== y.questionId) return x.questionId - y.questionId;
    return String(x.keyword).localeCompare(String(y.keyword), 'zh-Hans-CN');
  });
  return hits;
}

async function ensureTaskCache(pool, taskId) {
  const key = String(taskId);
  const hit = taskCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;

  const answerRes = await pool.query(
    `SELECT a.task_id, a.question_id, ga.raw_json
     FROM geo_health_analysis a
     INNER JOIN geo_health_answer ga ON ga.id = a.answer_id AND ga.task_id = a.task_id
     WHERE a.task_id = $1 AND a.error_text IS NULL
     ORDER BY a.question_id ASC, a.id ASC`,
    [taskId]
  );

  const answers = [];
  for (const row of answerRes.rows || []) {
    const text = extractProbeAnswerText(row.raw_json);
    if (!text) continue;
    const taskIdNum = Number(row.task_id);
    const questionIdNum = Number(row.question_id);
    answers.push({
      taskId: Number.isFinite(taskIdNum) ? taskIdNum : row.task_id,
      questionId: Number.isFinite(questionIdNum) ? questionIdNum : row.question_id,
      text,
    });
  }

  const lexEntries = await loadWordCloudLexEntriesForTask(pool, taskId);
  const keywords = dedupeKeywords(lexEntries);
  const hits = buildHitIndex(answers, keywords);

  const entry = { at: Date.now(), answers, keywords, hits };
  taskCache.set(key, entry);
  return entry;
}

export function invalidateSentimentSourceCache(taskId) {
  if (taskId == null) {
    taskCache.clear();
    return;
  }
  taskCache.delete(String(taskId));
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} taskId
 * @param {{ q?: string, page?: number, pageSize?: number }} opts
 */
export async function querySentimentSourcePage(pool, taskId, opts = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 10));
  const q = String(opts.q ?? '').trim();

  const entry = await ensureTaskCache(pool, taskId);

  let hits = entry.hits;
  if (q) {
    const ql = q.toLowerCase();
    hits = entry.hits.filter((h) => String(h.keyword || '').toLowerCase().includes(ql));
  }

  const total = hits.length;
  const start = (page - 1) * pageSize;
  const slice = hits.slice(start, start + pageSize);
  const list = slice.map((h) => ({
    taskId: h.taskId,
    questionId: h.questionId,
    keyword: h.keyword,
    count: h.count,
    answerText: entry.answers[h.answerIndex]?.text ?? '',
  }));

  return { list, total, page, pageSize };
}
