import express from 'express';
import jwt from 'jsonwebtoken';
import {
  addSseClient,
  removeSseClient,
  broadcastStatus,
  getStatusPayload,
  resolveUserIdFromAgentToken,
  upsertAgentToken,
  hasAgentToken,
  revokeAgentToken,
  registerSession,
  touchHeartbeat,
  removeSession,
  pruneStaleSessions,
} from '../services/agentSessionService.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'auyologic-geo-secret-2026';

function noStoreJson(res, body) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  return res.json(body);
}

async function requireAgentToken(req, res, next) {
  const { pool } = req.app.locals;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const userId = await resolveUserIdFromAgentToken(pool, token);
  if (!userId) {
    return res.status(401).json({ error: '代理令牌无效，请在网页「代理连接令牌」中生成并写入本地配置' });
  }
  req.agentUserId = userId;
  next();
}

function resolveUserIdFromJwt(req) {
  if (req.userId) return req.userId;
  const q = String(req.query.token || req.query.access_token || '').trim();
  if (!q) return null;
  try {
    const payload = jwt.verify(q, JWT_SECRET);
    return payload.userId || null;
  } catch {
    return null;
  }
}

/** 生成 / 覆盖代理连接令牌（网页登录用户） */
router.post('/agent/token', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { pool } = req.app.locals;
    const token = await upsertAgentToken(pool, userId);
    noStoreJson(res, { ok: true, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/agent/token', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { pool } = req.app.locals;
    const configured = await hasAgentToken(pool, userId);
    noStoreJson(res, { configured });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/agent/token', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { pool } = req.app.locals;
    await revokeAgentToken(pool, userId);
    noStoreJson(res, { ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** 代理启动注册 */
router.post('/agent/register', requireAgentToken, async (req, res) => {
  try {
    const { pool } = req.app.locals;
    await pruneStaleSessions(pool);
    const result = await registerSession(pool, req.agentUserId, req.body || {});
    noStoreJson(res, { ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/agent/heartbeat', requireAgentToken, async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const sessionKey = String(req.body?.sessionKey || '').trim();
    if (!sessionKey) return res.status(400).json({ error: '缺少 sessionKey' });
    const ok = await touchHeartbeat(pool, req.agentUserId, sessionKey);
    if (!ok) return res.status(404).json({ error: '会话不存在或 sessionKey 无效' });
    noStoreJson(res, { ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/agent/offline', requireAgentToken, async (req, res) => {
  try {
    const { pool } = req.app.locals;
    const sessionKey = String(req.body?.sessionKey || '').trim();
    if (!sessionKey) return res.status(400).json({ error: '缺少 sessionKey' });
    await removeSession(pool, req.agentUserId, sessionKey);
    noStoreJson(res, { ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** 浏览器轮询：当前登录用户的代理是否在线 */
router.get('/agent/status', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: '未登录' });
    const { pool } = req.app.locals;
    await pruneStaleSessions(pool);
    const payload = await getStatusPayload(pool, userId);
    noStoreJson(res, payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** SSE：代理状态变更即时推送（query token 供 EventSource 使用） */
router.get('/agent/status/stream', async (req, res) => {
  const userId = resolveUserIdFromJwt(req);
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }
  const { pool } = req.app.locals;

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  addSseClient(userId, res);

  try {
    const payload = await getStatusPayload(pool, userId);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    /* ignore */
  }

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(ping);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(ping);
    removeSseClient(userId, res);
  });
});

export default router;
