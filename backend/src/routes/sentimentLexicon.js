/**
 * GET/POST/PUT/DELETE /api/sentiment-lexicon
 * 情感词管理（正面优势 / 中性描述 / 负面警示）
 */
import { Router } from 'express';
import pool from '../db.js';
import { parsePagination, pagedResponse } from '../pagination.js';
import {
  isSentimentKeywordLengthValid,
  SENTIMENT_KEYWORD_MAX_CODEPOINTS,
} from '../services/sentimentLexiconService.js';

const router = Router();

function userId(req) {
  return String(req.headers['x-user-id'] || 'default_user').trim() || 'default_user';
}

function normKeyword(s) {
  return String(s || '').trim();
}

router.get('/sentiment-lexicon', async (req, res) => {
  try {
    const uid = userId(req);
    const tier = String(req.query.tier || '').toLowerCase();
    const { page, pageSize, offset } = parsePagination(req);

    const params = [uid];
    let where = 'user_id = $1';
    if (tier === 'positive' || tier === 'neutral' || tier === 'negative') {
      where += ' AND tier = $2';
      params.push(tier);
    }

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM geo_sentiment_lexicon WHERE ${where}`,
      params
    );
    const total = countRows[0]?.c ?? 0;

    const lim = params.length + 1;
    const off = params.length + 2;
    const { rows } = await pool.query(
      `SELECT id, user_id, keyword, tier, enabled, sort_order, created_at, updated_at
       FROM geo_sentiment_lexicon WHERE ${where}
       ORDER BY tier ASC, sort_order ASC, id ASC
       LIMIT $${lim} OFFSET $${off}`,
      [...params, pageSize, offset]
    );

    res.json({ success: true, ...pagedResponse(rows, total, page, pageSize) });
  } catch (e) {
    console.error('[sentiment-lexicon]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/** POST 避免部分代理丢弃 DELETE body */
router.post('/sentiment-lexicon/batch-delete', async (req, res) => {
  try {
    const uid = userId(req);
    const raw = req.body?.ids;
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ success: false, error: 'ids 须为非空数组' });
    }
    const intIds = [
      ...new Set(
        raw
          .map((x) => parseInt(String(x), 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      ),
    ];
    if (!intIds.length) {
      return res.status(400).json({ success: false, error: '无有效 id' });
    }
    const del = await pool.query(
      `DELETE FROM geo_sentiment_lexicon WHERE user_id = $1 AND id = ANY($2::int[]) RETURNING id`,
      [uid, intIds]
    );
    res.json({ success: true, deletedCount: del.rows.length });
  } catch (e) {
    console.error('[sentiment-lexicon]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/sentiment-lexicon', async (req, res) => {
  try {
    const uid = userId(req);
    const keyword = normKeyword(req.body?.keyword);
    const tier = String(req.body?.tier || '').toLowerCase();
    if (!keyword) return res.status(400).json({ success: false, error: 'keyword 不能为空' });
    if (!isSentimentKeywordLengthValid(keyword)) {
      return res.status(400).json({
        success: false,
        error: `关键词须为 1～${SENTIMENT_KEYWORD_MAX_CODEPOINTS} 个字（含英文按字符计，与词云一致）`,
      });
    }
    if (!['positive', 'neutral', 'negative'].includes(tier)) {
      return res.status(400).json({ success: false, error: 'tier 须为 positive | neutral | negative' });
    }
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;
    const ins = await pool.query(
      `INSERT INTO geo_sentiment_lexicon (user_id, keyword, tier, enabled, sort_order)
       VALUES ($1, $2, $3, true, $4)
       RETURNING id, user_id, keyword, tier, enabled, sort_order, created_at, updated_at`,
      [uid, keyword, tier, sortOrder]
    );
    res.json({ success: true, row: ins.rows[0] });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ success: false, error: '该关键词已存在（同一用户下不区分大小写）' });
    }
    console.error('[sentiment-lexicon]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/sentiment-lexicon/:id', async (req, res) => {
  try {
    const uid = userId(req);
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: '无效 id' });
    }
    const keyword = req.body?.keyword != null ? normKeyword(req.body.keyword) : null;
    const tier = req.body?.tier != null ? String(req.body.tier).toLowerCase() : null;
    if (tier != null && !['positive', 'neutral', 'negative'].includes(tier)) {
      return res.status(400).json({ success: false, error: 'tier 须为 positive | neutral | negative' });
    }
    const enabled = req.body?.enabled;
    const sortOrder = req.body?.sortOrder;

    const sets = [];
    const vals = [];
    let n = 1;
    if (keyword !== null) {
      if (!keyword) return res.status(400).json({ success: false, error: 'keyword 不能为空' });
      if (!isSentimentKeywordLengthValid(keyword)) {
        return res.status(400).json({
          success: false,
          error: `关键词须为 1～${SENTIMENT_KEYWORD_MAX_CODEPOINTS} 个字（含英文按字符计，与词云一致）`,
        });
      }
      sets.push(`keyword = $${n++}`);
      vals.push(keyword);
    }
    if (tier != null) {
      sets.push(`tier = $${n++}`);
      vals.push(tier);
    }
    if (typeof enabled === 'boolean') {
      sets.push(`enabled = $${n++}`);
      vals.push(enabled);
    }
    if (sortOrder != null && Number.isFinite(Number(sortOrder))) {
      sets.push(`sort_order = $${n++}`);
      vals.push(Number(sortOrder));
    }
    sets.push('updated_at = NOW()');
    if (sets.length === 1) {
      return res.status(400).json({ success: false, error: '无有效更新字段' });
    }
    vals.push(id, uid);
    const sql = `UPDATE geo_sentiment_lexicon SET ${sets.join(', ')} WHERE id = $${n++} AND user_id = $${n} RETURNING *`;
    const { rows } = await pool.query(sql, vals);
    if (!rows.length) return res.status(404).json({ success: false, error: '记录不存在' });
    res.json({ success: true, row: rows[0] });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ success: false, error: '该关键词已存在' });
    }
    console.error('[sentiment-lexicon]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/sentiment-lexicon/:id', async (req, res) => {
  try {
    const uid = userId(req);
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, error: '无效 id' });
    }
    const del = await pool.query(`DELETE FROM geo_sentiment_lexicon WHERE id = $1 AND user_id = $2 RETURNING id`, [
      id,
      uid,
    ]);
    if (!del.rows.length) return res.status(404).json({ success: false, error: '记录不存在' });
    res.json({ success: true });
  } catch (e) {
    console.error('[sentiment-lexicon]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
