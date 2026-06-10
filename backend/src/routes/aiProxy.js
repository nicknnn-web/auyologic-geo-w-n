/**
 * 统一 AI 代理端点（密钥来源：ai_provider_connection 数据库表）
 *
 * POST /api/ai/generate
 * Body:
 *   prompt           string  必填
 *   connectionId?    number  指定数据库中的连接 id；缺省时取该 user 的第一条 enabled 连接
 *   model?           string  覆盖连接的默认模型名
 *   systemPrompt?    string
 *   max_tokens?      number
 *   temperature?     number
 *
 * GET /api/ai/providers
 *   返回当前用户已配置的连接清单（来自数据库）
 */

import { Router } from 'express';
import pool from '../db.js';
import { createAiClientByConnectionId } from '../services/aiClientFactory.js';

const router = Router();

function getUserId(req) {
  return req.userId;
}

async function resolveConnectionId(userId, connectionId) {
  if (connectionId) return Number(connectionId);
  const { rows } = await pool.query(
    `SELECT id FROM ai_provider_connection
     WHERE enabled = true
     ORDER BY id ASC LIMIT 1`
  );
  return rows[0]?.id || null;
}

router.post('/generate', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { prompt, connectionId, max_tokens, temperature, systemPrompt } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: 'prompt 是必填项' });
    }

    const cid = await resolveConnectionId(userId, connectionId);
    if (!cid) {
      return res.status(400).json({
        error: '尚未配置任何启用的大模型连接，请先到「大模型接入」添加并启用',
      });
    }

    const client = await createAiClientByConnectionId(pool, cid, { userId });
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const result = await client.chat(messages, {
      maxTokens: max_tokens || 2000,
      temperature: temperature ?? 0.7,
    });

    if (!result.content) {
      return res.status(500).json({ error: 'AI 返回内容为空' });
    }

    res.json({
      content: result.content,
      vendorName: client.vendorName,
      providerKey: client.providerKey,
      connectionId: client.connectionId,
      model: client.model,
    });
  } catch (error) {
    console.error('AI 代理请求失败:', error);
    res.status(500).json({
      error: error.message || 'AI 请求失败',
      details: error.code,
    });
  }
});

/**
 * 列出当前用户在数据库中配置的可用连接
 */
router.get('/providers', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, vendor_name, provider_key, default_model, enabled,
              key_last4, last_test_status
       FROM ai_provider_connection
       ORDER BY id ASC`
    );
    res.json({
      success: true,
      providers: rows.map((r) => ({
        connectionId: r.id,
        vendorName: r.vendor_name,
        providerKey: r.provider_key,
        defaultModel: r.default_model,
        enabled: r.enabled,
        keyLast4: r.key_last4,
        lastTestStatus: r.last_test_status,
      })),
    });
  } catch (e) {
    console.error('GET /api/ai/providers:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
