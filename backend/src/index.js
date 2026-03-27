import express from 'express';
import cors from 'cors';
import pg from 'pg';
import 'dotenv/config';
import { initDB } from './db.js';

const { Pool } = pg;
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 构建版本
const BUILD_VERSION = 'v2026032720';

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

// 数据库表结构
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
  website_tasks: `CREATE TABLE IF NOT EXISTS website_tasks (id SERIAL PRIMARY KEY, user_id VARCHAR(255), url TEXT, status VARCHAR(50), result TEXT, created_at TIMESTAMP DEFAULT NOW())`
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
    } catch (e) { console.log('Knowledge migration:', e.message); }
  }
  if (table === 'images') {
    try {
      await pool.query(`ALTER TABLE images ADD COLUMN IF NOT EXISTS size INTEGER`).catch(() => {});
      await pool.query(`ALTER TABLE images ALTER COLUMN image_path TYPE TEXT`).catch(() => {});
    } catch (e) { console.log('Images migration:', e.message); }
  }
};

// CRUD 路由
const tables = ['keywords', 'questions', 'knowledge', 'history', 'documents', 'images', 'instruction_templates', 'drafts', 'accounts', 'delivery_tasks', 'publish_records', 'geo_tasks', 'website_tasks'];

// snake_case 转 camelCase
const toCamelCase = (obj) => {
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
        const userId = getUserId(req);
        const result = await pool.query(`SELECT * FROM ${table} WHERE user_id = $1 ORDER BY id DESC`, [userId]);
        res.json(toCamelCase(result.rows));
      } catch (err) { res.status(500).json({ error: err.message }); }
    });
    app.post(hyphenPath, async (req, res) => {
      try {
        await ensureTable(table);
        const userId = getUserId(req);
        const data = { ...req.body, user_id: userId };
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
        const userId = getUserId(req);
        const data = { ...req.body };
        for (const [key, value] of Object.entries(data)) {
          const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          if (snakeKey !== key) { data[snakeKey] = value; delete data[key]; }
        }
        const cols = Object.keys(data).map((k, i) => `${k} = $${i + 1}`).join(', ');
        const result = await pool.query(`UPDATE ${table} SET ${cols} WHERE id = $${Object.keys(data).length + 1} AND user_id = $${Object.keys(data).length + 2} RETURNING *`, [...Object.values(data), req.params.id, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: '记录不存在' });
        res.json(result.rows[0]);
      } catch (err) { res.status(500).json({ error: err.message }); }
    });
    app.delete(`${hyphenPath}/:id`, async (req, res) => {
      try {
        await ensureTable(table);
        const userId = getUserId(req);
        const result = await pool.query(`DELETE FROM ${table} WHERE id = $1 AND user_id = $2 RETURNING *`, [req.params.id, userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: '记录不存在' });
        res.json(result.rows[0]);
      } catch (err) { res.status(500).json({ error: err.message }); }
    });
  }
  
  app.get(routePath, async (req, res) => {
    try {
      await ensureTable(table);
      const userId = getUserId(req);
      const result = await pool.query(`SELECT * FROM ${table} WHERE user_id = $1 ORDER BY id DESC`, [userId]);
      res.json(toCamelCase(result.rows));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  
  app.post(routePath, async (req, res) => {
    try {
      await ensureTable(table);
      const userId = getUserId(req);
      // camelCase 转 snake_case
      const data = { ...req.body, user_id: userId };
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
      const userId = getUserId(req);
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
        `UPDATE ${table} SET ${cols} WHERE id = $${Object.keys(data).length + 1} AND user_id = $${Object.keys(data).length + 2} RETURNING *`,
        [...Object.values(data), req.params.id, userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: '记录不存在' });
      res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  
  app.delete(`${routePath}/:id`, async (req, res) => {
    try {
      await ensureTable(table);
      const userId = getUserId(req);
      const result = await pool.query(`DELETE FROM ${table} WHERE id = $1 AND user_id = $2 RETURNING *`, [req.params.id, userId]);
      if (result.rows.length === 0) return res.status(404).json({ error: '记录不存在' });
      res.json(result.rows[0]);
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

// 企业设置 API
app.get('/api/settings', async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await pool.query(`SELECT * FROM users WHERE user_id = $1`, [userId]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      // 返回与前端一致的字段名
      res.json({
        company_name: user.company_name || '',
        website: user.website || '',
        industry: user.industry || '',
        description: user.description || '',
        target_audience: user.target_audience || '',
        deepseek_api_key: user.deepseek_api_key || '',
        doubao_api_key: user.doubao_api_key || '',
        kimi_api_key: user.kimi_api_key || '',
        default_ai_model: user.default_ai_model || 'deepseek-chat'
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
    const userId = getUserId(req);
    const { company_name, website, industry, description, target_audience, deepseek_api_key, doubao_api_key, kimi_api_key, default_ai_model } = req.body;
    
    const result = await pool.query(`
      INSERT INTO users (user_id, company_name, website, industry, description, target_audience, deepseek_api_key, doubao_api_key, kimi_api_key, default_ai_model, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
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
    `, [userId, company_name || '', website || '', industry || '', description || '', target_audience || '', deepseek_api_key || '', doubao_api_key || '', kimi_api_key || '', default_ai_model || 'deepseek-chat']);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('保存设置失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 导入路由
import contentGeneratorRouter from './routes/contentGenerator.js';
import geoDetectionRouter from './routes/geoDetection.js';
import websiteAnalyzerRouter from './routes/websiteAnalyzer.js';

app.use('/api', contentGeneratorRouter);
app.use('/api', geoDetectionRouter);
app.use('/api', websiteAnalyzerRouter);

// 启动
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}, version ${BUILD_VERSION}`));
