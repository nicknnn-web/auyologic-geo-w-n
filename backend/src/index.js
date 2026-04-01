import './playwright-env.js';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import archiver from 'archiver';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { initDB } from './db.js';
import {
  verifySession,
  closeSession,
} from './services/playwrightAuth.js';
import {
  executePublishTask,
  getTaskStatus,
  cleanupTask,
} from './services/playwrightPublisher.js';

const { Pool } = pg;
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 设置默认时区为中国时区
process.env.TZ = 'Asia/Shanghai';

const BUILD_VERSION = 'v2026032901';

// 初始化数据库表
initDB().catch(console.error);

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 获取用户ID
const getUserId = (req) => {
  const id = req.headers['x-user-id'];
  if (id && id !== 'undefined' && id !== 'null') return id;
  return 'default_user';
};

// 数据库表结构test
const tableSchemas = {
  users: `CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, user_id VARCHAR(255) UNIQUE, username VARCHAR(200), email VARCHAR(200), password_hash VARCHAR(255), deepseek_api_key TEXT, doubao_api_key TEXT, kimi_api_key TEXT, company_name VARCHAR(500), website VARCHAR(500), industry VARCHAR(200), description TEXT, target_audience TEXT, default_ai_model VARCHAR(50) DEFAULT 'deepseek-chat', created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`,
  keywords: `CREATE TABLE IF NOT EXISTS keywords (id SERIAL PRIMARY KEY, user_id VARCHAR(255), keyword VARCHAR(500), type VARCHAR(50), source VARCHAR(100), status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMP DEFAULT NOW())`,
  questions: `CREATE TABLE IF NOT EXISTS questions (id SERIAL PRIMARY KEY, user_id VARCHAR(255), keyword_id INTEGER, question TEXT, answer TEXT, keyword_type VARCHAR(50), source_keyword VARCHAR(255), status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW())`,
  knowledge: `CREATE TABLE IF NOT EXISTS knowledge (id SERIAL PRIMARY KEY, user_id VARCHAR(255), name VARCHAR(500), filename VARCHAR(500), type VARCHAR(50), file_type VARCHAR(50), size INTEGER, content TEXT, summary TEXT, created_at TIMESTAMP DEFAULT NOW())`,
  history: `CREATE TABLE IF NOT EXISTS history (id SERIAL PRIMARY KEY, user_id VARCHAR(255), operation_type VARCHAR(100), input_data TEXT, result_data TEXT, created_at TIMESTAMP DEFAULT NOW())`,
  documents: `CREATE TABLE IF NOT EXISTS documents (id SERIAL PRIMARY KEY, user_id VARCHAR(255), title VARCHAR(500), content TEXT, tags TEXT[], created_at TIMESTAMP DEFAULT NOW())`,
  images: `CREATE TABLE IF NOT EXISTS images (id SERIAL PRIMARY KEY, user_id VARCHAR(255), title VARCHAR(500), image_path TEXT, size INTEGER, tags TEXT, created_at TIMESTAMP DEFAULT NOW())`,
  instruction_templates: `CREATE TABLE IF NOT EXISTS instruction_templates (id SERIAL PRIMARY KEY, user_id VARCHAR(255), name VARCHAR(500), content TEXT, created_at TIMESTAMP DEFAULT NOW())`,
  drafts: `CREATE TABLE IF NOT EXISTS drafts (id SERIAL PRIMARY KEY, user_id VARCHAR(255), title VARCHAR(500), brand VARCHAR(255), content TEXT, audience TEXT, platforms TEXT[], command_id INTEGER, extra TEXT, selected_docs TEXT, selected_images TEXT, status VARCHAR(50), created_at TIMESTAMP DEFAULT NOW())`,
  accounts: `CREATE TABLE IF NOT EXISTS accounts (id SERIAL PRIMARY KEY, user_id VARCHAR(255), platform VARCHAR(100), username VARCHAR(255), cookies TEXT, status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMP DEFAULT NOW())`,
  delivery_tasks: `CREATE TABLE IF NOT EXISTS delivery_tasks (id SERIAL PRIMARY KEY, user_id VARCHAR(255), title VARCHAR(500), content TEXT, platforms TEXT[], status VARCHAR(50), scheduled_time TIMESTAMP, created_at TIMESTAMP DEFAULT NOW())`,
  publish_records: `CREATE TABLE IF NOT EXISTS publish_records (id SERIAL PRIMARY KEY, user_id VARCHAR(255), task_id INTEGER, platform VARCHAR(100), published_at TIMESTAMP, url VARCHAR(1000), status VARCHAR(50), created_at TIMESTAMP DEFAULT NOW())`,
  geo_tasks: `CREATE TABLE IF NOT EXISTS geo_tasks (id SERIAL PRIMARY KEY, user_id VARCHAR(255), keyword VARCHAR(255), platform VARCHAR(100), status VARCHAR(50), result TEXT, created_at TIMESTAMP DEFAULT NOW())`,
  website_tasks: `CREATE TABLE IF NOT EXISTS website_tasks (id SERIAL PRIMARY KEY, user_id VARCHAR(255), url TEXT, status VARCHAR(50), result TEXT, created_at TIMESTAMP DEFAULT NOW())`,
  website_reports: `CREATE TABLE IF NOT EXISTS website_reports (id SERIAL PRIMARY KEY, user_id VARCHAR(255), url TEXT, score INTEGER, items TEXT, issues TEXT, details TEXT, checked_at TIMESTAMP DEFAULT NOW())`
};

// 确保表存在 + 迁移
const ensureTable = async (table) => {
  if (tableSchemas[table]) {
    await pool.query(tableSchemas[table]).catch(() => {});
  }
  // 迁移：新字段
  if (table === 'questions') {
    try {
      await pool.query(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS keyword_type VARCHAR(50)`);
      await pool.query(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_keyword VARCHAR(255)`);
    } catch (e) { console.log('Questions migration:', e.message); }
  }
  if (table === 'knowledge') {
    try {
      await pool.query(`ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS file_type VARCHAR(50)`).catch(() => {});
      await pool.query(`ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS name VARCHAR(500)`).catch(() => {});
      await pool.query(`ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS summary TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS filename VARCHAR(500)`).catch(() => {});
      await pool.query(`ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS content TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS type VARCHAR(50)`).catch(() => {});
      await pool.query(`ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS size INTEGER`).catch(() => {});
    } catch (e) { console.log('Knowledge migration:', e.message); }
  }
  if (table === 'images') {
    try {
      await pool.query(`ALTER TABLE images ADD COLUMN IF NOT EXISTS size INTEGER`).catch(() => {});
      await pool.query(`ALTER TABLE images ALTER COLUMN image_path TYPE TEXT`).catch(() => {});
    } catch (e) { console.log('Images migration:', e.message); }
  }
  if (table === 'instruction_templates') {
    try {
      await pool.query(`ALTER TABLE instruction_templates ADD COLUMN IF NOT EXISTS content_type VARCHAR(50)`).catch(() => {});
    } catch (e) { console.log('Instruction_templates migration:', e.message); }
  }
  if (table === 'history') {
    try {
      await pool.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS title VARCHAR(500)`).catch(() => {});
      await pool.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS keyword VARCHAR(255)`).catch(() => {});
      await pool.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS audience TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS platforms TEXT[]`).catch(() => {});
      await pool.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS command_id INTEGER`).catch(() => {});
      await pool.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS local_id VARCHAR(100)`).catch(() => {});
    } catch (e) { console.log('History migration:', e.message); }
  }
  if (table === 'drafts') {
    try {
      await pool.query(`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS title VARCHAR(500)`).catch(() => {});
      await pool.query(`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS brand VARCHAR(255)`).catch(() => {});
      await pool.query(`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS audience TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS extra TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS selected_docs TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS selected_images TEXT`).catch(() => {});
      await pool.query(`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS command_id INTEGER`).catch(() => {});
    } catch (e) { console.log('Drafts migration:', e.message); }
  }
};

// CRUD 路由
const tables = ['keywords', 'questions', 'knowledge', 'history', 'documents', 'images', 'instruction_templates', 'drafts', 'accounts', 'delivery_tasks', 'publish_records', 'geo_tasks', 'website_tasks', 'website_reports'];

// snake_case 转 camelCase
const toCamelCase = (obj) => {
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) {
    return obj.map(item => toCamelCase(item));
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelKey] = toCamelCase(value);
    }
    return result;
  }
  return obj;
};

tables.forEach(table => {
  const routePath = `/api/${table}`;
  const hyphenPath = `/api/${table.replace(/_/g, '-')}`;

  // 如果有下划线，添加 hyphenated 别名路由
  if (table.includes('_')) {
    app.get(hyphenPath, async (req, res) => {
      try {
        await ensureTable(table);
        const result = await pool.query(`SELECT * FROM ${table} ORDER BY id DESC`);
        res.json(toCamelCase(result.rows));
      } catch (err) { res.status(500).json({ error: err.message }); }
    });
    app.post(hyphenPath, async (req, res) => {
      try {
        await ensureTable(table);
        const data = { ...req.body };
        for (const [key, value] of Object.entries(data)) {
          const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          if (snakeKey !== key) { data[snakeKey] = value; delete data[key]; }
        }
        const cols = Object.keys(data);
        const vals = cols.map((_, i) => `$${i + 1}`).join(', ');
        const result = await pool.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals}) RETURNING *`, Object.values(data));
        res.json(result.rows[0]);
      } catch (err) { res.status(500).json({ error: err.message }); }
    });
    app.put(`${hyphenPath}/:id`, async (req, res) => {
      try {
        await ensureTable(table);
        const data = { ...req.body };
        for (const [key, value] of Object.entries(data)) {
          const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          if (snakeKey !== key) { data[snakeKey] = value; delete data[key]; }
        }
        const cols = Object.keys(data).map((k, i) => `${k} = $${i + 1}`).join(', ');
        const result = await pool.query(`UPDATE ${table} SET ${cols} WHERE id = $${Object.keys(data).length + 1} RETURNING *`, [...Object.values(data), req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: '记录不存在' });
        res.json(result.rows[0]);
      } catch (err) { res.status(500).json({ error: err.message }); }
    });
    app.delete(`${hyphenPath}/:id`, async (req, res) => {
      try {
        await ensureTable(table);
        const result = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: '记录不存在' });
        res.json(result.rows[0]);
      } catch (err) { res.status(500).json({ error: err.message }); }
    });
  }

  app.get(routePath, async (req, res) => {
    try {
      await ensureTable(table);
      const result = await pool.query(`SELECT * FROM ${table} ORDER BY id DESC`);
      res.json(toCamelCase(result.rows));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post(routePath, async (req, res) => {
    try {
      await ensureTable(table);
      const data = { ...req.body };
      for (const [key, value] of Object.entries(data)) {
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (snakeKey !== key) {
          data[snakeKey] = value;
          delete data[key];
        }
      }
      const cols = Object.keys(data);
      const vals = cols.map((_, i) => `$${i + 1}`).join(', ');
      const result = await pool.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals}) RETURNING *`, Object.values(data));
      res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put(`${routePath}/:id`, async (req, res) => {
    try {
      await ensureTable(table);
      const data = { ...req.body };
      for (const [key, value] of Object.entries(data)) {
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (snakeKey !== key) {
          data[snakeKey] = value;
          delete data[key];
        }
      }
      const cols = Object.keys(data).map((k, i) => `${k} = $${i + 1}`).join(', ');
      const result = await pool.query(
        `UPDATE ${table} SET ${cols} WHERE id = $${Object.keys(data).length + 1} RETURNING *`,
        [...Object.values(data), req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: '记录不存在' });
      res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete(`${routePath}/:id`, async (req, res) => {
    try {
      await ensureTable(table);
      const result = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: '记录不存在' });
      res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`${routePath}/:id`, async (req, res) => {
    try {
      await ensureTable(table);
      const result = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: '记录不存在' });
      res.json(toCamelCase(result.rows[0]));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
});

// 健康检查
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', time: new Date().toISOString(), version: BUILD_VERSION });
  } catch (err) {
    res.json({ status: 'ok', database: 'disconnected', time: new Date().toISOString(), version: BUILD_VERSION });
  }
});

// 简化登录（无需密码，返回默认用户）
app.post('/api/auth/login', async (req, res) => {
  const userId = 'default_user';
  try {
    const result = await pool.query(`SELECT * FROM users WHERE user_id = $1`, [userId]);
    if (result.rows.length === 0) {
      const newUser = await pool.query(`
        INSERT INTO users (user_id, username, deepseek_api_key, default_ai_model)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [userId, '管理员', process.env.DEEPSEEK_API_KEY || '', 'deepseek-chat']);
      res.json({ success: true, user_id: userId, username: '管理员' });
    } else {
      const user = result.rows[0];
      res.json({ success: true, user_id: user.user_id, username: user.username });
    }
  } catch (err) {
    res.json({ success: true, user_id: userId, username: '管理员' });
  }
});

// 企业设置 API（全局共享，不区分用户）
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM users WHERE user_id = 'default_user'`);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      // 返回与前端一致的字段名，Date 对象转 ISO 字符串
      res.json({
        company_name: user.company_name || '',
        website: user.website || '',
        industry: user.industry || '',
        description: user.description || '',
        target_audience: user.target_audience || '',
        deepseek_api_key: user.deepseek_api_key || '',
        doubao_api_key: user.doubao_api_key || '',
        kimi_api_key: user.kimi_api_key || '',
        default_ai_model: user.default_ai_model || 'deepseek-chat',
        created_at: user.created_at instanceof Date ? user.created_at.toISOString() : user.created_at,
        updated_at: user.updated_at instanceof Date ? user.updated_at.toISOString() : user.updated_at
      });
    } else {
      res.json({ company_name: '', website: '', industry: '', description: '', target_audience: '' });
    }
  } catch (err) {
    // 表可能不存在，返回空数据
    res.json({ company_name: '', website: '', industry: '', description: '', target_audience: '' });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const { company_name, website, industry, description, target_audience, deepseek_api_key, doubao_api_key, kimi_api_key, default_ai_model } = req.body;

    const result = await pool.query(`
      INSERT INTO users (user_id, company_name, website, industry, description, target_audience, deepseek_api_key, doubao_api_key, kimi_api_key, default_ai_model, updated_at)
      VALUES ('default_user', $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        website = EXCLUDED.website,
        industry = EXCLUDED.industry,
        description = EXCLUDED.description,
        target_audience = EXCLUDED.target_audience,
        deepseek_api_key = EXCLUDED.deepseek_api_key,
        doubao_api_key = EXCLUDED.doubao_api_key,
        kimi_api_key = EXCLUDED.kimi_api_key,
        default_ai_model = EXCLUDED.default_ai_model,
        updated_at = NOW()
      RETURNING *
    `, [company_name || '', website || '', industry || '', description || '', target_audience || '', deepseek_api_key || '', doubao_api_key || '', kimi_api_key || '', default_ai_model || 'deepseek-chat']);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('保存设置失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== 平台账号管理 ==========

app.get('/api/platform-accounts', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, platform, account_name, phone_number,
              auth_status, auth_time, last_verified_at, status, created_at, updated_at
       FROM media_accounts ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/platform-accounts', async (req, res) => {
  try {
    const { platform, account_name, phone_number } = req.body;
    if (!platform) return res.status(400).json({ error: '平台不能为空' });
    const result = await pool.query(
      `INSERT INTO media_accounts (platform, account_name, phone_number, auth_status, status)
       VALUES ($1, $2, $3, 'pending', 'active') RETURNING
       id, platform, account_name, phone_number, auth_status, auth_time, last_verified_at, status, created_at`,
      [platform, account_name || '', phone_number || null]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/platform-accounts/:id', async (req, res) => {
  try {
    const { account_name, phone_number, status } = req.body;
    const result = await pool.query(
      `UPDATE media_accounts SET
         account_name = COALESCE($1, account_name),
         phone_number = COALESCE($2, phone_number),
         status       = COALESCE($3, status),
         updated_at   = NOW()
       WHERE id = $4
       RETURNING id, platform, account_name, phone_number, auth_status, auth_time, status`,
      [account_name || null, phone_number || null, status || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '账号不存在' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/platform-accounts/:id', async (req, res) => {
  try {
    await closeSession(req.params.id);
    await pool.query('DELETE FROM media_accounts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 任务状态映射 → 前端 sessionStatus
const AUTH_TASK_STATUS_MAP = {
  idle: null,
  waiting_agent: 'waiting_agent',
  agent_running: 'opening',
  browser_opened: 'browser_opened',
  waiting_sms_code: 'waiting_sms_code',
  submitting: 'submitting',
  login_detected: 'authorized',
  done: 'authorized',
  failed: null,
  cancelled: null,
};

// 创建授权任务（写 DB，不启动 Playwright）
app.post('/api/platform-accounts/:id/auth-start', async (req, res) => {
  try {
    const accountId = req.params.id;
    const row = await pool.query('SELECT * FROM media_accounts WHERE id = $1', [accountId]);
    if (row.rows.length === 0) return res.status(404).json({ error: '账号不存在' });
    const { phone_number } = row.rows[0];
    const phoneNumber = req.body.phone_number || phone_number;
    await pool.query(
      `UPDATE media_accounts SET
         auth_task_status       = 'waiting_agent',
         auth_task_phone        = $1,
         pending_sms_code       = NULL,
         user_confirm_complete  = FALSE,
         auth_task_started_at   = NOW(),
         updated_at             = NOW()
       WHERE id = $2`,
      [phoneNumber || null, accountId]
    );
    res.json({ success: true, message: '授权任务已创建，等待本地代理接收...' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 存储验证码供代理取走
app.post('/api/platform-accounts/:id/auth-submit-code', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: '验证码不能为空' });
    await pool.query(
      `UPDATE media_accounts SET pending_sms_code = $1, updated_at = NOW() WHERE id = $2`,
      [code.trim(), req.params.id]
    );
    res.json({ success: true, message: '验证码已提交，代理将自动填入' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 用户点击「我已完成登录」→ 通知代理捕获 session
app.post('/api/platform-accounts/:id/auth-complete', async (req, res) => {
  try {
    const accountId = req.params.id;
    const row = await pool.query('SELECT auth_task_status FROM media_accounts WHERE id = $1', [accountId]);
    if (row.rows.length === 0) return res.status(404).json({ error: '账号不存在' });
    if (row.rows[0].auth_task_status === 'done') {
      return res.json({ success: true, message: '授权已完成' });
    }
    await pool.query(
      `UPDATE media_accounts SET user_confirm_complete = TRUE, updated_at = NOW() WHERE id = $1`,
      [accountId]
    );
    res.json({ success: true, message: '已通知代理捕获登录状态，请稍候...' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 查询授权状态（从 DB 读）
app.get('/api/platform-accounts/:id/auth-status', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT auth_task_status FROM media_accounts WHERE id = $1', [req.params.id]
    );
    if (result.rows.length === 0) return res.json({ sessionStatus: null });
    const raw = result.rows[0].auth_task_status || 'idle';
    res.json({ sessionStatus: AUTH_TASK_STATUS_MAP[raw] ?? raw });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 取消授权任务
app.post('/api/platform-accounts/:id/auth-cancel', async (req, res) => {
  try {
    await pool.query(
      `UPDATE media_accounts SET
         auth_task_status = 'cancelled',
         user_confirm_complete = FALSE,
         updated_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 验证 session 有效性（仍用纯函数，不需要浏览器）
app.post('/api/platform-accounts/:id/auth-verify', async (req, res) => {
  try {
    const accountId = req.params.id;
    const row = await pool.query(
      'SELECT platform, session_state FROM media_accounts WHERE id = $1', [accountId]
    );
    if (row.rows.length === 0) return res.status(404).json({ error: '账号不存在' });
    const { platform, session_state } = row.rows[0];
    const valid = await verifySession(platform, session_state);
    const newStatus = valid ? 'authorized' : 'expired';
    await pool.query(
      `UPDATE media_accounts SET auth_status = $1, last_verified_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [newStatus, accountId]
    );
    res.json({ valid, auth_status: newStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== 本地代理专用接口 ==========

// 代理心跳（用于前端检测代理是否在线）
let agentLastSeen = null;

app.post('/api/agent/heartbeat', (req, res) => {
  agentLastSeen = Date.now();
  res.json({ ok: true });
});

app.get('/api/agent/status', (req, res) => {
  const online = agentLastSeen !== null && (Date.now() - agentLastSeen < 30000);
  res.json({ online, lastSeen: agentLastSeen });
});

// 代理轮询：取一条待处理任务（原子操作）
app.get('/api/agent/pending-task', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE media_accounts
         SET auth_task_status = 'agent_running', updated_at = NOW()
       WHERE id = (
         SELECT id FROM media_accounts
         WHERE auth_task_status = 'waiting_agent'
         ORDER BY auth_task_started_at ASC
         LIMIT 1
       )
       RETURNING id, platform, auth_task_phone`
    );
    if (result.rows.length === 0) return res.json({ task: null });
    const row = result.rows[0];
    res.json({ task: { accountId: row.id, platform: row.platform, phoneNumber: row.auth_task_phone } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 代理上报进度
app.post('/api/agent/update-status', async (req, res) => {
  try {
    const { accountId, status } = req.body;
    await pool.query(
      `UPDATE media_accounts SET auth_task_status = $1, updated_at = NOW() WHERE id = $2`,
      [status, accountId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 代理取验证码（取走后清除）
app.get('/api/agent/sms-code/:accountId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT pending_sms_code FROM media_accounts WHERE id = $1', [req.params.accountId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '账号不存在' });
    const code = result.rows[0].pending_sms_code;
    if (code) {
      await pool.query(
        `UPDATE media_accounts SET pending_sms_code = NULL, updated_at = NOW() WHERE id = $1`,
        [req.params.accountId]
      );
      return res.json({ code });
    }
    res.json({ code: null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 代理查询用户是否点击了「我已完成登录」或取消
app.get('/api/agent/confirm-check/:accountId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_confirm_complete, auth_task_status FROM media_accounts WHERE id = $1',
      [req.params.accountId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '账号不存在' });
    const row = result.rows[0];
    res.json({
      confirmed: row.user_confirm_complete === true,
      cancelled: row.auth_task_status === 'cancelled',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 代理完成授权，上传 storageState
app.post('/api/agent/complete-auth', async (req, res) => {
  try {
    const { accountId, storageState, userAgent } = req.body;
    await pool.query(
      `UPDATE media_accounts SET
         session_state         = $1,
         user_agent            = $2,
         auth_status           = 'authorized',
         auth_time             = NOW(),
         last_verified_at      = NOW(),
         auth_task_status      = 'done',
         user_confirm_complete = FALSE,
         updated_at            = NOW()
       WHERE id = $3`,
      [JSON.stringify(storageState), userAgent, accountId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 代理报告失败
app.post('/api/agent/fail-auth', async (req, res) => {
  try {
    const { accountId } = req.body;
    await pool.query(
      `UPDATE media_accounts SET auth_task_status = 'failed', updated_at = NOW() WHERE id = $1`,
      [accountId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 下载本地代理程序（local-agent 文件夹打包为 zip，.bat 文件强制 CRLF）
app.get('/api/agent/download', (req, res) => {
  const agentDir = join(__dirname, '../local-agent');
  if (!fs.existsSync(agentDir)) {
    return res.status(404).json({ error: '本地代理目录不存在' });
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="auyologic-local-agent.zip"');

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    console.error('[下载代理] 打包出错:', err.message);
    if (!res.headersSent) res.status(500).end();
  });
  archive.pipe(res);

  const IGNORE = ['node_modules/**', 'dist/**', 'node.exe', '*.zip', '.auyologic-agent.json'];

  // .bat 文件：读取内容，转换为 CRLF 后作为 buffer 写入（Windows CMD 需要 CRLF）
  const batFiles = fs.readdirSync(agentDir).filter(f => f.endsWith('.bat'));
  for (const bat of batFiles) {
    const content = fs.readFileSync(join(agentDir, bat), 'utf8');
    const crlf = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    archive.append(Buffer.from(crlf, 'utf8'), { name: bat });
  }

  // 其余文件正常打包（排除 .bat 和忽略列表）
  archive.glob('**/*', {
    cwd: agentDir,
    ignore: [...IGNORE, '*.bat'],
  });

  archive.finalize();
});

// ========== 发布任务管理 ==========

app.get('/api/publish-tasks', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pt.*, ma.account_name
       FROM publish_tasks pt
       LEFT JOIN media_accounts ma ON pt.account_id = ma.id
       ORDER BY pt.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/publish-tasks', async (req, res) => {
  try {
    const { task_name, draft_id, draft_title, platform, account_id, content, title, tags } = req.body;
    if (!platform || !account_id) return res.status(400).json({ error: '平台和账号不能为空' });
    const result = await pool.query(
      `INSERT INTO publish_tasks
         (task_name, draft_id, draft_title, platform, account_id, content, title, tags, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
       RETURNING *`,
      [task_name || '', draft_id || null, draft_title || '', platform, account_id, content || '', title || '', tags || '']
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/publish-tasks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM publish_tasks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/publish-tasks/:id/execute', async (req, res) => {
  try {
    const taskId = req.params.id;
    const taskRow = await pool.query('SELECT * FROM publish_tasks WHERE id = $1', [taskId]);
    if (taskRow.rows.length === 0) return res.status(404).json({ error: '任务不存在' });
    const task = taskRow.rows[0];

    const accRow = await pool.query('SELECT * FROM media_accounts WHERE id = $1', [task.account_id]);
    if (accRow.rows.length === 0) return res.status(404).json({ error: '关联账号不存在' });
    const account = accRow.rows[0];

    if (account.auth_status !== 'authorized' || !account.session_state) {
      return res.status(400).json({
        error: '账号授权已失效，请前往账号管理页重新授权',
        auth_status: account.auth_status,
      });
    }

    await pool.query(
      `UPDATE publish_tasks SET status = 'running', updated_at = NOW() WHERE id = $1`,
      [taskId]
    );

    executePublishTask(
      {
        taskId,
        platform: task.platform,
        sessionState: account.session_state,
        content: task.content || '',
        title: task.title || '',
        tags: task.tags || '',
      },
      async (err, publishedUrl) => {
        try {
          const log = getTaskStatus(taskId)?.log || '';
          if (err) {
            await pool.query(
              `UPDATE publish_tasks SET status = 'failed', error_message = $1, task_log = $2, updated_at = NOW() WHERE id = $3`,
              [err.message, log, taskId]
            );
          } else {
            await pool.query(
              `UPDATE publish_tasks SET status = 'done', published_url = $1, task_log = $2, updated_at = NOW() WHERE id = $3`,
              [publishedUrl || '', log, taskId]
            );
            await pool.query(
              `INSERT INTO publish_records
                 (task_id, draft_title, platform, account_id, account_name, published_url, status)
               VALUES ($1,$2,$3,$4,$5,$6,'已发布')`,
              [taskId, task.draft_title || '', task.platform, task.account_id, account.account_name || '', publishedUrl || '']
            );
          }
          cleanupTask(taskId);
        } catch (dbErr) {
          console.error('[发布回调] DB 写入失败：', dbErr.message);
        }
      }
    );

    res.json({ success: true, message: '发布任务已启动，正在后台执行' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/publish-tasks/:id/status', async (req, res) => {
  try {
    const taskId = req.params.id;
    const memStatus = getTaskStatus(taskId);
    if (memStatus) return res.json(memStatus);
    const result = await pool.query(
      'SELECT status, task_log, published_url, error_message FROM publish_tasks WHERE id = $1',
      [taskId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '任务不存在' });
    const row = result.rows[0];
    res.json({
      status: row.status,
      log: row.task_log || '',
      publishedUrl: row.published_url || '',
      errorMessage: row.error_message || '',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== 发布记录 ==========

app.get('/api/publish-records', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, draft_title, platform, account_name, published_url, status, error_message, created_at
       FROM publish_records
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== 后端启动时清理残留 pending 授权状态 ==========
async function cleanupStalePendingAuth() {
  try {
    const result = await pool.query(
      `UPDATE media_accounts SET auth_status = 'pending', updated_at = NOW()
       WHERE auth_status NOT IN ('authorized', 'expired', 'invalid', 'pending')`
    );
    if (result.rowCount > 0) {
      console.log(`[启动清理] 重置了 ${result.rowCount} 条残留的中间授权状态`);
    }
  } catch (err) {
    console.warn('[启动清理] 清理残留状态失败：', err.message);
  }
}

// 导入路由
import contentGeneratorRouter from './routes/contentGenerator.js';
import geoDetectionRouter from './routes/geoDetection.js';
import websiteAnalyzerRouter from './routes/websiteAnalyzer.js';
import aiProxyRouter from './routes/aiProxy.js';

app.use('/api', contentGeneratorRouter);
app.use('/api', geoDetectionRouter);
app.use('/api', websiteAnalyzerRouter);
app.use('/api/ai', aiProxyRouter);

// ========== Stub 接口（功能完善后替换为真实实现）==========

// GEO 检测历史（目前暂无持久化，先返回空数组）
app.get('/api/geo-detection-history', async (req, res) => {
  res.json([]);
});

// 网站检测报告（目前暂无持久化，先返回空数组）
app.get('/api/website-reports', async (req, res) => {
  res.json([]);
});

// 启动
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}, version ${BUILD_VERSION}`);
  await cleanupStalePendingAuth();
});
