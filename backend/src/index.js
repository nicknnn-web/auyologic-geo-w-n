import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

import pool, { initDB } from './db.js';
import { processGeoDetection } from './services/geoDetection.js';
import { analyzeWebsite } from './services/websiteAnalyzer.js';
import { generateContent } from './services/contentGenerator.js';

console.log('DATABASE_URL loaded:', process.env.DATABASE_URL ? 'YES (length=' + process.env.DATABASE_URL.length + ')' : 'NO');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 文件上传
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// 密码哈希
const hashPassword = (pwd) => crypto.createHash('sha256').update(pwd).digest('hex');
const verifyPassword = (pwd, hash) => hashPassword(pwd) === hash;

// 单用户模式：固定 user_id = 1
const DEFAULT_USER_ID = 1;

// ========== 认证 ==========
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, deepseek_api_key } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    const password_hash = hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, deepseek_api_key)
       VALUES ($1, $2, $3, $4) RETURNING id, username, email, created_at`,
      [username, email, password_hash, deepseek_api_key || null]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: '用户名或邮箱已存在' });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: '缺少邮箱或密码' });
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: '用户不存在' });
    const user = result.rows[0];
    if (!verifyPassword(password, user.password_hash)) return res.status(401).json({ error: '密码错误' });
    res.json({
      user: { id: user.id, username: user.username, email: user.email, created_at: user.created_at }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 用户设置 ==========
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, deepseek_api_key, doubao_api_key, kimi_api_key, company_name, website, industry, description, target_audience, created_at FROM users WHERE id = $1', [DEFAULT_USER_ID]);
    if (result.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/settings', async (req, res) => {
  try {
    const { username, deepseek_api_key, doubao_api_key, kimi_api_key, company_name, website, industry, description, target_audience } = req.body;
    const result = await pool.query(
      `UPDATE users SET
        username = COALESCE(NULLIF($1, ''), username),
        deepseek_api_key = COALESCE(NULLIF($2, ''), deepseek_api_key),
        doubao_api_key = COALESCE(NULLIF($3, ''), doubao_api_key),
        kimi_api_key = COALESCE(NULLIF($4, ''), kimi_api_key),
        company_name = COALESCE(NULLIF($6, ''), company_name),
        website = COALESCE(NULLIF($7, ''), website),
        industry = COALESCE(NULLIF($8, ''), industry),
        description = COALESCE(NULLIF($9, ''), description),
        target_audience = COALESCE(NULLIF($10, ''), target_audience),
        updated_at = NOW()
       WHERE id = $5 RETURNING id, username, email, deepseek_api_key, doubao_api_key, kimi_api_key, company_name, website, industry, description, target_audience`,
      [username || null, deepseek_api_key || null, doubao_api_key || null, kimi_api_key || null, DEFAULT_USER_ID, company_name || null, website || null, industry || null, description || null, target_audience || null]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== 通用 CRUD（所有业务表） ==========
const crudRoutes = [
  { path: '/api/keywords',         table: 'keywords' },
  { path: '/api/questions',        table: 'expanded_questions' },
  { path: '/api/documents',        table: 'documents' },
  { path: '/api/images',           table: 'images' },
  { path: '/api/instruction-templates', table: 'instruction_templates' },
  { path: '/api/drafts',           table: 'content_drafts' },
  { path: '/api/accounts',         table: 'accounts' },
  { path: '/api/delivery-tasks',  table: 'delivery_tasks' },
  { path: '/api/publish-records', table: 'publish_records' },
  { path: '/api/geo-tasks',       table: 'geo_detection_tasks' },
  { path: '/api/website-tasks',    table: 'website_optimization_tasks' },
];

// 确保表存在（防御性：如果 initDB 漏了，每个路由第一次访问时自动创建）
const tableSchemas = {
  keywords: `CREATE TABLE IF NOT EXISTS keywords (id SERIAL PRIMARY KEY, user_id VARCHAR(255), keyword VARCHAR(500), type VARCHAR(50) DEFAULT '品牌', created_at TIMESTAMP DEFAULT NOW())`,
  expanded_questions: `CREATE TABLE IF NOT EXISTS expanded_questions (id SERIAL PRIMARY KEY, user_id VARCHAR(255), keyword_id INTEGER, question TEXT, answer TEXT, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMP DEFAULT NOW())`,
  documents: `CREATE TABLE IF NOT EXISTS documents (id SERIAL PRIMARY KEY, user_id VARCHAR(255), title VARCHAR(500), content TEXT, file_path VARCHAR(1000), file_type VARCHAR(50), file_size INTEGER, created_at TIMESTAMP DEFAULT NOW())`,
  images: `CREATE TABLE IF NOT EXISTS images (id SERIAL PRIMARY KEY, user_id VARCHAR(255), title VARCHAR(500), image_path VARCHAR(1000), tags TEXT, created_at TIMESTAMP DEFAULT NOW())`,
  instruction_templates: `CREATE TABLE IF NOT EXISTS instruction_templates (id SERIAL PRIMARY KEY, user_id VARCHAR(255), name VARCHAR(200), content TEXT, created_at TIMESTAMP DEFAULT NOW())`,
  content_drafts: `CREATE TABLE IF NOT EXISTS content_drafts (id SERIAL PRIMARY KEY, user_id VARCHAR(255), keyword VARCHAR(500), content TEXT, platforms TEXT, status VARCHAR(20) DEFAULT 'draft', created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`,
  accounts: `CREATE TABLE IF NOT EXISTS accounts (id SERIAL PRIMARY KEY, user_id VARCHAR(255), platform VARCHAR(50), account_name VARCHAR(200), account_id VARCHAR(200), cookies TEXT, status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMP DEFAULT NOW())`,
  delivery_tasks: `CREATE TABLE IF NOT EXISTS delivery_tasks (id SERIAL PRIMARY KEY, user_id VARCHAR(255), draft_id INTEGER, platform VARCHAR(50), account_id INTEGER, content TEXT, status VARCHAR(20) DEFAULT 'pending', result TEXT, created_at TIMESTAMP DEFAULT NOW(), published_at TIMESTAMP)`,
  publish_records: `CREATE TABLE IF NOT EXISTS publish_records (id SERIAL PRIMARY KEY, user_id VARCHAR(255), draft_id INTEGER, platform VARCHAR(50), account_id INTEGER, content TEXT, status VARCHAR(20) DEFAULT 'published', result TEXT, published_at TIMESTAMP DEFAULT NOW())`,
  geo_detection_tasks: `CREATE TABLE IF NOT EXISTS geo_detection_tasks (id SERIAL PRIMARY KEY, user_id VARCHAR(255), keyword VARCHAR(500), platform VARCHAR(50), visible BOOLEAN DEFAULT FALSE, summary TEXT, score INTEGER DEFAULT 0, checked_at TIMESTAMP DEFAULT NOW())`,
  website_optimization_tasks: `CREATE TABLE IF NOT EXISTS website_optimization_tasks (id SERIAL PRIMARY KEY, user_id VARCHAR(255), url VARCHAR(1000), seo_score INTEGER DEFAULT 0, ai_score INTEGER DEFAULT 0, tech_score INTEGER DEFAULT 0, content_score INTEGER DEFAULT 0, overall_score INTEGER DEFAULT 0, report JSONB, checked_at TIMESTAMP DEFAULT NOW())`,
};

const ensureTable = async (table) => {
  if (tableSchemas[table]) {
    await pool.query(tableSchemas[table]).catch(() => {});
  }
};

crudRoutes.forEach(({ path: routePath, table }) => {
  app.get(routePath, async (req, res) => {
    try {
      await ensureTable(table);
      const result = await pool.query(`SELECT * FROM ${table} WHERE user_id = $1 ORDER BY created_at DESC`, [DEFAULT_USER_ID]);
      res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`${routePath}/:id`, async (req, res) => {
    try {
      await ensureTable(table);
      const result = await pool.query(`SELECT * FROM ${table} WHERE id = $1 AND user_id = $2`, [req.params.id, DEFAULT_USER_ID]);
      if (result.rows.length === 0) return res.status(404).json({ error: '记录不存在' });
      res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post(routePath, async (req, res) => {
    try {
      await ensureTable(table);
      const data = { ...req.body, user_id: DEFAULT_USER_ID };
      const cols = Object.keys(data);
      const vals = cols.map((_, i) => `$${i + 1}`).join(', ');
      const result = await pool.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals}) RETURNING *`, Object.values(data));
      res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put(`${routePath}/:id`, async (req, res) => {
    try {
      await ensureTable(table);
      const data = req.body;
      const cols = Object.keys(data).map((k, i) => `${k} = $${i + 1}`).join(', ');
      const result = await pool.query(
        `UPDATE ${table} SET ${cols}, updated_at = NOW() WHERE id = $${Object.keys(data).length + 1} AND user_id = $${Object.keys(data).length + 2} RETURNING *`,
        [...Object.values(data), req.params.id, DEFAULT_USER_ID]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: '记录不存在' });
      res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete(`${routePath}/:id`, async (req, res) => {
    try {
      await ensureTable(table);
      await pool.query(`DELETE FROM ${table} WHERE id = $1 AND user_id = $2`, [req.params.id, DEFAULT_USER_ID]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
});

// ========== 文件上传 ==========
app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: '未上传文件' });
    let content = '';
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.txt' || ext === '.md') {
      content = fs.readFileSync(file.path, 'utf-8');
    } else if (ext === '.pdf') {
      try {
        const pdfParse = await import('pdf-parse');
        const data = await pdfParse.default(fs.readFileSync(file.path));
        content = data.text;
      } catch { content = '[PDF解析失败]'; }
    } else { content = `[${ext} 文件，内容未解析]`; }
    const result = await pool.query(
      `INSERT INTO documents (user_id, title, content, file_url, file_name, file_size)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [DEFAULT_USER_ID, file.originalname, content, `/uploads/${file.filename}`, file.originalname, file.size]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== AI 功能 ==========
app.post('/api/ai/generate', async (req, res) => {
  try {
    const { prompt, type } = req.body;
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [DEFAULT_USER_ID]);
    const apiKey = user.rows[0]?.deepseek_api_key || process.env.DEFAULT_DEEPSEEK_API_KEY;
    if (!apiKey) return res.status(400).json({ error: '请先在设置中配置 DeepSeek API Key' });
    const result = await generateContent(prompt, apiKey);
    res.json({ content: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ai/questions', async (req, res) => {
  try {
    const { keyword, platforms } = req.body;
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [DEFAULT_USER_ID]);
    const apiKey = user.rows[0]?.deepseek_api_key || process.env.DEFAULT_DEEPSEEK_API_KEY;
    if (!apiKey) return res.status(400).json({ error: '请先配置 DeepSeek API Key' });
    const result = await generateContent(`针对关键词"${keyword}"，在${platforms || '知乎/小红书/微信公众号'}平台，生成用户常问的问题列表，返回JSON数组格式：[{question: "...", platform: "...", type: "..."}]，只需返回JSON数组`, apiKey);
    try {
      const questions = JSON.parse(result);
      res.json({ questions });
    } catch { res.json({ content: result }); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== 健康检查 ==========
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
  } catch (err) {
    res.json({ status: 'ok', database: 'disconnected', time: new Date().toISOString() });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ========== 启动 ==========
app.listen(PORT, async () => {
  console.log(`GEO backend running on http://localhost:${PORT}`);
  await initDB();
});
