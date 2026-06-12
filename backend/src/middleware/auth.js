import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'auyologic-geo-secret-2026';

/**
 * 挂载在 app.use('/api', authMiddleware) 时，req.path 为去掉 /api 后的路径。
 * 本地代理进程无法携带浏览器 JWT，故 agent 轮询/回调接口放行；下载安装包仍须登录。
 */
export function isPublicApiPath(path) {
  const p = String(path || '').split('?')[0];
  if (p === '/health') return true;
  if (p.startsWith('/agent/')) {
    if (p === '/agent/download') return false;
    // 浏览器登录态：状态查询 / 令牌管理
    if (p === '/agent/status' || p === '/agent/status/stream' || p === '/agent/token') return false;
    // register / heartbeat / offline 与其它 agent 回调：走代理令牌（路由内校验）
    return true;
  }
  return false;
}

/**
 * 验证 JWT，将解析后的 user_id 注入 req.userId
 * 所有需要身份的路由都应先经过此中间件
 */
export function authMiddleware(req, res, next) {
  if (isPublicApiPath(req.path)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: '未登录，请先登录', code: 'UNAUTHORIZED' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token 无效或已过期，请重新登录', code: 'TOKEN_EXPIRED' });
  }
}

/**
 * 签发 JWT（有效期 7 天）
 */
export function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}
