import express from 'express';
import { processGeoDetection } from '../services/geoDetection.js';
import pool from '../db.js';
import { createAiClientByConnectionId } from '../services/aiClientFactory.js';

const router = express.Router();

function getUserId(req) {
  return req.userId;
}

/**
 * 解析连接 ID：优先 body.connectionId；否则取该 user 的第一条 enabled 连接
 */
async function resolveConnectionId(userId, connectionId) {
  if (connectionId) {
    return Number(connectionId);
  }
  const { rows } = await pool.query(
    `SELECT id FROM ai_provider_connection
     WHERE enabled = true
     ORDER BY id ASC LIMIT 1`
  );
  return rows[0]?.id || null;
}

// POST /api/geo-detection - GEO 可见度检测
router.post('/geo-detection', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { keywords, platforms, connectionId } = req.body || {};

    if (!keywords || keywords.length === 0) {
      return res.status(400).json({ error: '请提供关键词' });
    }
    const cid = await resolveConnectionId(userId, connectionId);
    if (!cid) {
      return res.status(400).json({
        error: '尚未配置任何启用的大模型连接，请先到「大模型接入」添加并启用',
      });
    }

    const aiClient = await createAiClientByConnectionId(pool, cid, { userId });
    const result = await processGeoDetection(keywords, platforms, { aiClient });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('GEO检测失败:', err.message);
    res.status(500).json({ error: err.message || '检测失败' });
  }
});

export default router;
