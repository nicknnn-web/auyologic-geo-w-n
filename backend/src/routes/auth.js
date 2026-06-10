import express from 'express';
import bcrypt from 'bcryptjs';
import { signToken, authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * 注册新用户（email + password 必填）
 * 邮箱已被注册时返回 409 + exists:true，前端提示可直接登录
 */
router.post('/register', async (req, res) => {
  const { pool } = req.app.locals;
  const { email, password, username: usernameRaw } = req.body || {};

  const emailNorm = String(email || '').trim().toLowerCase();
  if (!emailNorm || !password) {
    return res.status(400).json({ error: '邮箱和密码不能为空' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return res.status(400).json({ error: '邮箱格式不正确' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '密码至少 8 位' });
  }

  // 用户名选填；未填则使用邮箱
  let username = String(usernameRaw || '').trim();
  if (!username) {
    username = emailNorm;
  } else if (username.length > 200) {
    return res.status(400).json({ error: '用户名不能超过 200 个字符' });
  }

  try {
    // 检查邮箱是否已注册
    const existing = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = $1`,
      [emailNorm]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: '该邮箱已注册，可直接登录', exists: true });
    }

    // 检查用户名是否已被占用
    const dupUsername = await pool.query(
      `SELECT 1 FROM users WHERE username = $1`,
      [username]
    );
    if (dupUsername.rows.length > 0) {
      return res.status(409).json({ error: '该用户名已被占用，请换一个' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const result = await pool.query(
      `INSERT INTO users (user_id, username, email, password_hash, default_ai_model, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'deepseek-v4-flash', NOW(), NOW())
       RETURNING id, user_id, username, email, created_at`,
      [userId, username, emailNorm, passwordHash]
    );

    const user = result.rows[0];
    const token = signToken(user.user_id);

    // 为新用户写入情感词种子
    await seedSentimentLexicon(pool, user.user_id).catch(() => {});

    res.status(201).json({
      success: true,
      token,
      user: { userId: user.user_id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error('[auth] register error:', err.message);
    res.status(500).json({ error: '注册失败：' + err.message });
  }
});

/**
 * POST /api/auth/login
 * 用邮箱（或老账号的用户名）+ 密码登录，返回 JWT token
 */
router.post('/login', async (req, res) => {
  const { pool } = req.app.locals;
  const { email, username, password } = req.body || {};

  const account = String(email || username || '').trim();
  if (!account || !password) {
    return res.status(400).json({ error: '邮箱和密码不能为空' });
  }

  try {
    // 邮箱匹配优先；同时兼容老账号（如 admin）直接用用户名登录
    const result = await pool.query(
      `SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR username = $1 LIMIT 1`,
      [account]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const user = result.rows[0];

    // 兼容旧的 default_user（无密码哈希）：如果没有 password_hash，要求先设置密码
    if (!user.password_hash) {
      return res.status(401).json({ error: '该账号尚未设置密码，请联系管理员重置' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const token = signToken(user.user_id);

    res.json({
      success: true,
      token,
      user: {
        userId: user.user_id,
        username: user.username,
        email: user.email || ''
      }
    });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(500).json({ error: '登录失败：' + err.message });
  }
});

/**
 * POST /api/auth/change-password
 * 修改密码（需要已登录）
 */
router.post('/change-password', authMiddleware, async (req, res) => {
  const { pool } = req.app.locals;
  const userId = req.userId; // 由 authMiddleware 注入
  const { oldPassword, newPassword } = req.body || {};

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: '旧密码和新密码不能为空' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: '新密码至少 6 位' });
  }

  try {
    const result = await pool.query(
      `SELECT password_hash FROM users WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(oldPassword, user.password_hash || '');
    if (!valid) {
      return res.status(401).json({ error: '旧密码错误' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2`,
      [newHash, userId]
    );

    res.json({ success: true, message: '密码修改成功' });
  } catch (err) {
    console.error('[auth] change-password error:', err.message);
    res.status(500).json({ error: '修改密码失败：' + err.message });
  }
});

/**
 * GET /api/auth/me
 * 获取当前登录用户信息
 */
router.get('/me', authMiddleware, async (req, res) => {
  const { pool } = req.app.locals;
  const userId = req.userId;

  try {
    const result = await pool.query(
      `SELECT user_id, username, email, company_name, website, industry, default_ai_model, created_at
       FROM users WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const user = result.rows[0];
    res.json({
      userId: user.user_id,
      username: user.username,
      email: user.email || '',
      companyName: user.company_name || '',
      website: user.website || '',
      industry: user.industry || '',
      defaultAiModel: user.default_ai_model || 'deepseek-v4-flash',
      createdAt: user.created_at
    });
  } catch (err) {
    console.error('[auth] me error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 为新注册用户写入情感词种子
 */
async function seedSentimentLexicon(pool, userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM geo_sentiment_lexicon WHERE user_id = $1`,
    [userId]
  );
  if (rows[0].c > 0) return;

  await pool.query(`
    INSERT INTO geo_sentiment_lexicon (user_id, keyword, tier, enabled, sort_order) VALUES
    ($1,'领先','positive',true,0),($1,'优质','positive',true,1),($1,'口碑好','positive',true,2),($1,'值得信赖','positive',true,3),($1,'出色','positive',true,4),
    ($1,'推荐','positive',true,5),($1,'稳健','positive',true,6),($1,'专业','positive',true,7),($1,'创新','positive',true,8),($1,'性价比高','positive',true,9),
    ($1,'体验好','positive',true,10),($1,'服务周到','positive',true,11),($1,'行业标杆','positive',true,12),($1,'实力强','positive',true,13),($1,'好评','positive',true,14),
    ($1,'可靠','positive',true,15),($1,'亮点突出','positive',true,16),($1,'表现优秀','positive',true,17),($1,'备受认可','positive',true,18),($1,'优势明显','positive',true,19),
    ($1,'一般','neutral',true,0),($1,'尚可','neutral',true,1),($1,'中规中矩','neutral',true,2),($1,'略有差异','neutral',true,3),($1,'看场景','neutral',true,4),
    ($1,'各有特点','neutral',true,5),($1,'看需求','neutral',true,6),($1,'选择多','neutral',true,7),($1,'价差大','neutral',true,8),($1,'配置多样','neutral',true,9),
    ($1,'版本较多','neutral',true,10),($1,'地区差异','neutral',true,11),($1,'待定','neutral',true,12),($1,'信息有限','neutral',true,13),($1,'需核实','neutral',true,14),
    ($1,'因人制宜','neutral',true,15),($1,'选项丰富','neutral',true,16),($1,'没有绝对','neutral',true,17),($1,'持平','neutral',true,18),($1,'了解不多','neutral',true,19),
    ($1,'差评','negative',true,0),($1,'避雷','negative',true,1),($1,'踩坑','negative',true,2),($1,'翻车','negative',true,3),($1,'风险','negative',true,4),
    ($1,'投诉','negative',true,5),($1,'问题较多','negative',true,6),($1,'逊色','negative',true,7),($1,'不推荐','negative',true,8),($1,'谨慎','negative',true,9),
    ($1,'争议','negative',true,10),($1,'短板','negative',true,11),($1,'噪音大','negative',true,12),($1,'售后差','negative',true,13),($1,'缩水','negative',true,14),
    ($1,'槽点','negative',true,15),($1,'假货','negative',true,16),($1,'隐患','negative',true,17),($1,'不佳','negative',true,18),($1,'退款难','negative',true,19)
    ON CONFLICT DO NOTHING
  `, [userId]);
}

export default router;
