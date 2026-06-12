import crypto from 'crypto';

/** 心跳 TTL：超过此时间未心跳视为离线（兜底，关代理时走 offline 删除） */
export const AGENT_HEARTBEAT_TTL_MS = 15_000;

const SESSION_KEY_RE = /^(local|cloud)_([a-zA-Z0-9_-]+)_(\d{13})_([a-f0-9]{8})$/;
const RUN_MODES = new Set(['local', 'cloud']);

/** @type {Map<string, Set<import('express').Response>>} */
const sseByUser = new Map();

export function buildSessionKey(userId, runMode, startTs, nonce) {
  return `${runMode}_${userId}_${startTs}_${nonce}`;
}

export function parseSessionKey(sessionKey) {
  const m = SESSION_KEY_RE.exec(String(sessionKey || ''));
  if (!m) return null;
  return { runMode: m[1], userId: m[2], startTs: Number(m[3]), nonce: m[4] };
}

export function inferRunModeFromServerUrl(baseUrl) {
  try {
    const host = new URL(String(baseUrl)).hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'local';
    if (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
    ) {
      return 'local';
    }
    return 'cloud';
  } catch {
    return 'cloud';
  }
}

export function normalizeRegisterBody(raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  let runMode = String(b.runMode ?? b.run_mode ?? '').trim().toLowerCase();
  if (!RUN_MODES.has(runMode)) {
    runMode = inferRunModeFromServerUrl(b.serverUrl ?? b.server_url ?? '');
  }
  return {
    runMode,
    startTs: b.startTs ?? b.start_ts,
    nonce: b.nonce,
    serverUrl: b.serverUrl ?? b.server_url,
    clientLabel: b.clientLabel ?? b.client_label,
  };
}

export function validateRegisterPayload(payload) {
  const { runMode, startTs, nonce } = normalizeRegisterBody(payload);
  if (!RUN_MODES.has(runMode)) return 'runMode 须为 local 或 cloud';
  const ts = Number(startTs);
  if (!Number.isFinite(ts) || ts < 1e12) return 'startTs 无效';
  const now = Date.now();
  if (ts > now + 10_000) return 'startTs 不能在未来';
  if (ts < now - 10 * 60_000) return 'startTs 过旧，请重新启动代理';
  const n = String(nonce || '');
  if (!/^[a-f0-9]{8}$/.test(n)) return 'nonce 须为 8 位十六进制';
  return null;
}

export function hashAgentToken(plain) {
  return crypto.createHash('sha256').update(String(plain)).digest('hex');
}

export function generateAgentTokenPlain() {
  return `agy_${crypto.randomBytes(24).toString('hex')}`;
}

export function detectRunModeFromEnv() {
  if (process.env.AGENT_RUN_MODE === 'cloud') return 'cloud';
  if (
    process.env.KUBERNETES_SERVICE_HOST ||
    process.env.ZEABUR ||
    process.env.ZEABUR_ENV ||
    process.env.CONTAINER === 'docker'
  ) {
    return 'cloud';
  }
  return 'local';
}

export function addSseClient(userId, res) {
  const uid = String(userId);
  if (!sseByUser.has(uid)) sseByUser.set(uid, new Set());
  sseByUser.get(uid).add(res);
}

export function removeSseClient(userId, res) {
  const set = sseByUser.get(String(userId));
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseByUser.delete(String(userId));
}

export async function listActiveSessions(pool, userId) {
  const ttlSec = Math.ceil(AGENT_HEARTBEAT_TTL_MS / 1000);
  const r = await pool.query(
    `SELECT session_key, user_id, run_mode, start_ts, server_url, client_label, last_heartbeat, created_at
     FROM agent_sessions
     WHERE user_id = $1
       AND last_heartbeat > NOW() - ($2::int * INTERVAL '1 second')
     ORDER BY last_heartbeat DESC`,
    [userId, ttlSec]
  );
  return r.rows;
}

export async function getStatusPayload(pool, userId) {
  const sessions = await listActiveSessions(pool, userId);
  const lastSeen = sessions.length
    ? Math.max(...sessions.map((s) => new Date(s.last_heartbeat).getTime()))
    : null;
  return {
    online: sessions.length > 0,
    lastSeen,
    sessions: sessions.map((s) => ({
      sessionKey: s.session_key,
      runMode: s.run_mode,
      startTs: Number(s.start_ts),
      serverUrl: s.server_url || '',
      lastHeartbeat: s.last_heartbeat,
    })),
  };
}

export async function broadcastStatus(pool, userId) {
  const payload = await getStatusPayload(pool, userId);
  const set = sseByUser.get(String(userId));
  if (set?.size) {
    const chunk = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) {
      try {
        res.write(chunk);
      } catch {
        set.delete(res);
      }
    }
  }
  return payload;
}

export async function resolveUserIdFromAgentToken(pool, plainToken) {
  const token = String(plainToken || '').trim();
  if (!token.startsWith('agy_')) return null;
  const hash = hashAgentToken(token);
  const r = await pool.query('SELECT user_id FROM agent_tokens WHERE token_hash = $1', [hash]);
  return r.rows[0]?.user_id || null;
}

export async function upsertAgentToken(pool, userId) {
  const plain = generateAgentTokenPlain();
  const hash = hashAgentToken(plain);
  await pool.query(
    `INSERT INTO agent_tokens (user_id, token_hash, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, updated_at = NOW()`,
    [userId, hash]
  );
  return plain;
}

export async function hasAgentToken(pool, userId) {
  const r = await pool.query('SELECT 1 FROM agent_tokens WHERE user_id = $1', [userId]);
  return r.rowCount > 0;
}

export async function revokeAgentToken(pool, userId) {
  await pool.query('DELETE FROM agent_tokens WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM agent_sessions WHERE user_id = $1', [userId]);
  await broadcastStatus(pool, userId);
}

export async function registerSession(pool, userId, body) {
  const normalized = normalizeRegisterBody(body);
  const err = validateRegisterPayload(normalized);
  if (err) throw new Error(err);
  const { runMode, startTs, nonce, serverUrl, clientLabel } = normalized;
  const sessionKey = buildSessionKey(userId, runMode, startTs, nonce);
  const parsed = parseSessionKey(sessionKey);
  if (!parsed || parsed.userId !== userId) throw new Error('sessionKey 与用户不匹配');

  await pool.query(
    `INSERT INTO agent_sessions
       (session_key, user_id, run_mode, start_ts, server_url, client_label, last_heartbeat)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (session_key) DO UPDATE SET
       last_heartbeat = NOW(),
       server_url = EXCLUDED.server_url,
       client_label = EXCLUDED.client_label`,
    [
      sessionKey,
      userId,
      runMode,
      startTs,
      String(serverUrl || '').slice(0, 500) || null,
      String(clientLabel || '').slice(0, 200) || null,
    ]
  );
  await broadcastStatus(pool, userId);
  return { sessionKey, runMode, startTs };
}

export async function touchHeartbeat(pool, userId, sessionKey) {
  const parsed = parseSessionKey(sessionKey);
  if (!parsed || parsed.userId !== userId) return false;
  const r = await pool.query(
    `UPDATE agent_sessions SET last_heartbeat = NOW()
     WHERE session_key = $1 AND user_id = $2
     RETURNING session_key`,
    [sessionKey, userId]
  );
  return r.rowCount > 0;
}

export async function removeSession(pool, userId, sessionKey) {
  const parsed = parseSessionKey(sessionKey);
  if (!parsed || parsed.userId !== userId) return false;
  const r = await pool.query(
    'DELETE FROM agent_sessions WHERE session_key = $1 AND user_id = $2 RETURNING session_key',
    [sessionKey, userId]
  );
  if (r.rowCount > 0) await broadcastStatus(pool, userId);
  return r.rowCount > 0;
}

export async function isUserAgentOnline(pool, userId) {
  if (!userId) return false;
  const ttlSec = Math.ceil(AGENT_HEARTBEAT_TTL_MS / 1000);
  const r = await pool.query(
    `SELECT 1 FROM agent_sessions
     WHERE user_id = $1
       AND last_heartbeat > NOW() - ($2::int * INTERVAL '1 second')
     LIMIT 1`,
    [userId, ttlSec]
  );
  return r.rowCount > 0;
}

export async function pruneStaleSessions(pool) {
  await pool.query(
    `DELETE FROM agent_sessions WHERE last_heartbeat < NOW() - INTERVAL '2 hours'`
  );
}
