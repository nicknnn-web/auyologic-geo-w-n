/**
 * 品牌体检词云：按 task 持久化（仅 AI 合并结果入库），与「情感词管理」API 共用数据源。
 */

import {
  fetchWordCloudPhrasesFromAi,
  mergeLexiconAndAiWordCloud,
  mergeKeyForWordCloudPhrase,
  orderWordCloudItemsForPersist,
} from './sentimentWordCloudAiService.js';
import { extractProbeAnswerText } from './sentimentLexiconService.js';

/**
 * 与 GET /api/geo-health-report 选「当前展示任务」规则一致（按企业名称 keyword 匹配 + 最近完成分析）。
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @returns {Promise<number|null>}
 */
export async function resolveLatestReportTaskId(pool, userId) {
  const uid = String(userId || 'default_user').trim() || 'default_user';
  const ent = await pool.query(
    `SELECT company_name FROM users WHERE user_id = $1 LIMIT 1`,
    [uid]
  );
  const brandName = String(ent.rows[0]?.company_name || '品牌').trim();
  const brandKey = brandName.slice(0, 500);

  const taskRes = await pool.query(
    `SELECT t.id AS task_id
     FROM geo_health_task t
     INNER JOIN (
       SELECT task_id, MAX(created_at) AS last_analysis_at
       FROM geo_health_analysis
       GROUP BY task_id
     ) finished ON finished.task_id = t.id
     WHERE t.user_id = $1 AND t.status = 'completed'
       AND (
         trim(coalesce(t.keyword, '')) = $2
         OR trim(coalesce(t.keyword, '')) = ''
       )
     ORDER BY finished.last_analysis_at DESC NULLS LAST, t.id DESC
     LIMIT 1`,
    [uid, brandKey]
  );
  const id = taskRes.rows[0]?.task_id;
  return Number.isFinite(Number(id)) && Number(id) > 0 ? Number(id) : null;
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} taskId
 * @returns {Promise<Array<{ text: string, count: number, polarity: string, weight: number, source?: string }>>}
 */
export async function loadPersistedWordCloudPayload(pool, taskId) {
  const tid = Number(taskId);
  if (!Number.isFinite(tid) || tid <= 0) return [];
  const { rows } = await pool.query(
    `SELECT keyword, tier AS polarity, hit_count AS count, source
     FROM geo_health_word_cloud_item
     WHERE task_id = $1 AND enabled = true
     ORDER BY tier ASC, hit_count DESC, sort_order ASC, id ASC`,
    [tid]
  );
  const counts = rows.map((r) => Number(r.count) || 0).filter((c) => c > 0);
  const hitMax = counts.length ? Math.max(...counts, 1) : 1;
  return rows.map((r) => {
    const c = Number(r.count) || 0;
    return {
      text: String(r.keyword || '').trim(),
      count: c,
      polarity: String(r.polarity || '').trim(),
      weight: c / hitMax,
      source: String(r.source || 'ai').trim() || 'ai',
    };
  });
}

/**
 * 任务完成后：仅 AI 词路合并 → 覆盖写入 geo_health_word_cloud_item。
 */
export async function persistAiWordCloudForTask(pool, taskId, userId, enterpriseCtx) {
  const tid = Number(taskId);
  const uid = String(userId || 'default_user').trim() || 'default_user';
  if (!Number.isFinite(tid) || tid <= 0) return { ok: false, error: 'invalid taskId' };

  const { rows } = await pool.query(
    `SELECT a.id AS analysis_id, ga.raw_json
     FROM geo_health_analysis a
     INNER JOIN geo_health_answer ga ON ga.id = a.answer_id AND ga.task_id = a.task_id
     WHERE a.task_id = $1 AND a.error_text IS NULL`,
    [tid]
  );

  const brandName = String(enterpriseCtx?.brandName || '品牌').trim();
  const aiRows = await fetchWordCloudPhrasesFromAi(pool, uid, {
    brandName,
    industry: enterpriseCtx?.industry || '',
    brandDescription: enterpriseCtx?.brandDescription || '',
    targetAudience: enterpriseCtx?.targetAudience || '',
    answerRows: rows,
  });

  const merged = mergeLexiconAndAiWordCloud({
    lexEntries: [],
    lexHitCount: new Map(),
    answerRows: rows,
    aiRows,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM geo_health_word_cloud_item WHERE task_id = $1`, [tid]);
    let order = 0;
    const ordered = orderWordCloudItemsForPersist(merged);
    /** @type {Map<string, number>} phrase_norm|tier -> 新插入行 id */
    const idByPhrasePolarity = new Map();
    for (const item of ordered) {
      const kw = String(item.text || '').trim();
      if (!kw) continue;
      const tier = String(item.polarity || '').trim().toLowerCase();
      if (!['positive', 'neutral', 'negative'].includes(tier)) continue;
      const hitCount = Math.max(1, Math.round(Number(item.count) || 1));
      const pn = mergeKeyForWordCloudPhrase(kw);
      if (!pn) continue;
      const mapKey = `${pn}|${tier}`;
      let parentId = null;
      const ch = item.clusterHead ? String(item.clusterHead).trim() : '';
      if (ch) {
        const pnorm = mergeKeyForWordCloudPhrase(ch);
        if (pnorm) parentId = idByPhrasePolarity.get(`${pnorm}|${tier}`) ?? null;
      }
      const ins = await client.query(
        `INSERT INTO geo_health_word_cloud_item (
           user_id, task_id, keyword, phrase_norm, tier, enabled, sort_order, hit_count, source, parent_id, updated_at
         ) VALUES ($1, $2, $3, $4, $5, true, $6, $7, 'ai', $8, NOW())
         RETURNING id`,
        [uid, tid, kw, pn, tier, order++, hitCount, parentId]
      );
      const newId = ins.rows[0]?.id;
      if (Number.isFinite(Number(newId))) idByPhrasePolarity.set(mapKey, Number(newId));
    }
    await client.query('COMMIT');
    return { ok: true, count: ordered.length };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[geo-health-word-cloud] persist failed task=', tid, e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  } finally {
    client.release();
  }
}

/**
 * 供 sentiment-sources：用本期已入库词在探针原文上展开命中行。
 */
export async function loadWordCloudLexEntriesForTask(pool, taskId) {
  const tid = Number(taskId);
  if (!Number.isFinite(tid) || tid <= 0) return [];
  const { rows } = await pool.query(
    `SELECT keyword, tier AS polarity FROM geo_health_word_cloud_item
     WHERE task_id = $1 AND enabled = true`,
    [tid]
  );
  return rows.map((r) => ({
    keyword: String(r.keyword || '').trim(),
    polarity: String(r.polarity || 'neutral').trim().toLowerCase(),
  })).filter((x) => x.keyword);
}
