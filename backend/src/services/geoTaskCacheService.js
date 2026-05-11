/**
 * 品牌体检报告快照：按 task 缓存整份 JSON（含词云）。
 * 第三段指纹列名仍为 lexicon_fingerprint，语义为「本期词云明细表」变更检测（geo_health_word_cloud_item）。
 */

function cacheDisabled() {
  const v = String(process.env.GEO_TASK_CACHE ?? '1').trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'off';
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} taskId
 * @param {string} userId
 * @returns {Promise<{ analysisFp: string, articleFp: string, lexiconFp: string }>}
 */
export async function computeGeoTaskCacheFingerprints(pool, taskId, userId) {
  const [ar, pr] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS c, COALESCE(MAX(created_at)::text, '') AS mx
       FROM geo_health_analysis WHERE task_id = $1 AND error_text IS NULL`,
      [taskId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c, COALESCE(MAX(created_at)::text, '') AS mx
       FROM geo_health_article WHERE task_id = $1`,
      [taskId]
    ),
  ]);
  let wcRow = { c: 0, mu: '' };
  try {
    const lr = await pool.query(
      `SELECT COUNT(*)::int AS c, COALESCE(MAX(updated_at)::text, '') AS mu
       FROM geo_health_word_cloud_item WHERE task_id = $1`,
      [taskId]
    );
    wcRow = lr.rows[0] || wcRow;
  } catch (e) {
    if (e.code !== '42P01') throw e;
  }
  const analysisFp = `${ar.rows[0]?.c ?? 0}:${ar.rows[0]?.mx ?? ''}`;
  const articleFp = `${pr.rows[0]?.c ?? 0}:${pr.rows[0]?.mx ?? ''}`;
  const lexiconFp = `${wcRow.c ?? 0}:${wcRow.mu ?? ''}`;
  return { analysisFp, articleFp, lexiconFp };
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} taskId
 * @param {string} userId
 * @param {{ analysisFp: string, articleFp: string, lexiconFp: string }} fps
 * @returns {Promise<object|null>} 命中时返回可原样 res.json 的 payload
 */
export async function getGeoTaskReportCache(pool, taskId, userId, fps) {
  if (cacheDisabled()) return null;
  try {
    const { rows } = await pool.query(
      `SELECT report_payload FROM geo_task_cache
       WHERE task_id = $1 AND user_id = $2
         AND analysis_fingerprint = $3 AND article_fingerprint = $4 AND lexicon_fingerprint = $5
       LIMIT 1`,
      [taskId, userId, fps.analysisFp, fps.articleFp, fps.lexiconFp]
    );
    const raw = rows[0]?.report_payload;
    if (raw == null) return null;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return raw;
  } catch (e) {
    if (e.code === '42P01') return null;
    throw e;
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ taskId: number, userId: string, analysisFp: string, articleFp: string, lexiconFp: string, payload: object }} args
 */
export async function upsertGeoTaskReportCache(pool, args) {
  if (cacheDisabled()) return;
  const { taskId, userId, analysisFp, articleFp, lexiconFp, payload } = args;
  const swc = Array.isArray(payload?.sentimentWordCloud) ? payload.sentimentWordCloud : [];
  try {
    await pool.query(
      `INSERT INTO geo_task_cache (
         task_id, user_id, analysis_fingerprint, article_fingerprint, lexicon_fingerprint,
         report_payload, sentiment_word_cloud, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, NOW())
       ON CONFLICT (task_id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         analysis_fingerprint = EXCLUDED.analysis_fingerprint,
         article_fingerprint = EXCLUDED.article_fingerprint,
         lexicon_fingerprint = EXCLUDED.lexicon_fingerprint,
         report_payload = EXCLUDED.report_payload,
         sentiment_word_cloud = EXCLUDED.sentiment_word_cloud,
         updated_at = NOW()`,
      [
        taskId,
        userId,
        analysisFp,
        articleFp,
        lexiconFp,
        JSON.stringify(payload),
        JSON.stringify(swc),
      ]
    );
  } catch (e) {
    if (e.code === '42P01') {
      console.warn('[geo_task_cache] 表不存在，跳过写入（请执行 DB 初始化）');
      return;
    }
    console.error('[geo_task_cache] upsert 失败:', e.message || e);
  }
}
