import express from 'express';
import { generateContent } from '../services/contentGenerator.js';
import pool from '../db.js';
import { createAiClientByConnectionId } from '../services/aiClientFactory.js';

const router = express.Router();

function getUserId(req) {
  return String(req.headers['x-user-id'] || 'default_user').trim() || 'default_user';
}

async function resolveConnectionId(userId, connectionId) {
  if (connectionId) return Number(connectionId);
  const { rows } = await pool.query(
    `SELECT id FROM ai_provider_connection
     WHERE user_id = $1 AND enabled = true
     ORDER BY id ASC LIMIT 1`,
    [userId]
  );
  return rows[0]?.id || null;
}

// POST /api/generate - 生成内容
router.post('/generate', async (req, res) => {
  try {
    const userId = getUserId(req);
    const {
      prompt,
      connectionId,
      contentType,
      tone,
      length,
      format,
      keywords,
      platforms,
      audience,
    } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: '缺少 prompt' });
    }

    const cid = await resolveConnectionId(userId, connectionId);
    if (!cid) {
      return res.status(400).json({
        error: '尚未配置任何启用的大模型连接，请先到「大模型接入」添加并启用',
      });
    }
    const aiClient = await createAiClientByConnectionId(pool, cid, { userId });

    const result = await generateContent(prompt, { aiClient }, {
      contentType,
      tone,
      length,
      format,
      keywords,
      platforms,
      audience,
    });

    res.json({ success: true, content: result });
  } catch (err) {
    console.error('内容生成失败:', err.message);
    res.status(500).json({ error: err.message || '生成失败' });
  }
});

export default router;
