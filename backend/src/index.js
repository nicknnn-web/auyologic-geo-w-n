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

// 单用户模式：固定 user_id = 'default_user'
const DEFAULT_USER_ID = 'default_user';

// ========== 认证（单用户模式：无需注册） ==========
app.post('/api/auth/register', async (req, res) => {
  res.status(403).json({ error: '单用户模式，无需注册。请使用 admin 账号登录。' });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '请输入账号和密码' });
    }

    // 私用模式：固定管理员账号
    if (username === 'admin' && password === 'auyologic2026') {
      // 生成简单 token
      const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
      return res.json({ success: true, token, user: { username: 'admin' } });
    }

    res.status(401).json({ success: false, message: '账号或密码错误' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== 用户设置 ==========
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [DEFAULT_USER_ID]);
    if (result.rows.length === 0) {
      // 首次访问，创建一条记录
      const insert = await pool.query(
        'INSERT INTO user_settings (user_id) VALUES ($1) RETURNING *',
        [DEFAULT_USER_ID]
      );
      return res.json(insert.rows[0]);
    }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/settings', async (req, res) => {
  try {
    const { deepseek_api_key, doubao_api_key, kimi_api_key, default_ai_model } = req.body;
    const result = await pool.query(
      `UPDATE user_settings SET
        deepseek_api_key = COALESCE($1, deepseek_api_key),
        doubao_api_key = COALESCE($2, doubao_api_key),
        kimi_api_key = COALESCE($3, kimi_api_key),
        default_ai_model = COALESCE($4, default_ai_model),
        updated_at = NOW()
       WHERE user_id = $5 RETURNING *`,
      [deepseek_api_key || null, doubao_api_key || null, kimi_api_key || null, default_ai_model || null, DEFAULT_USER_ID]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== 通用 CRUD（所有业务表） ==========
const crudRoutes = [
  { path: '/api/keywords',         table: 'keywords' },
  { path: '/api/questions',        table: 'questions' },
  { path: '/api/documents',        table: 'knowledge' },
  { path: '/api/images',           table: 'images' },
  { path: '/api/instruction-templates', table: 'commands' },
  { path: '/api/drafts',           table: 'content_drafts' },
  { path: '/api/accounts',         table: 'media_accounts' },
  { path: '/api/delivery-tasks',  table: 'publish_tasks' },
  { path: '/api/publish-records',  table: 'publish_records' },
  { path: '/api/geo-tasks',       table: 'geo_detection' },
  { path: '/api/geo-reports',     table: 'geo_reports' },
  { path: '/api/website-tasks',    table: 'website_optimization' },
];

crudRoutes.forEach(({ path: routePath, table }) => {
  app.get(routePath, async (req, res) => {
    try {
      const result = await pool.query(`SELECT * FROM ${table} WHERE user_id = $1 ORDER BY created_at DESC`, [DEFAULT_USER_ID]);
      res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get(`${routePath}/:id`, async (req, res) => {
    try {
      const result = await pool.query(`SELECT * FROM ${table} WHERE id = $1 AND user_id = $2`, [req.params.id, DEFAULT_USER_ID]);
      if (result.rows.length === 0) return res.status(404).json({ error: '记录不存在' });
      res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post(routePath, async (req, res) => {
    try {
      const data = { ...req.body, user_id: DEFAULT_USER_ID };
      const cols = Object.keys(data);
      const vals = cols.map((_, i) => `$${i + 1}`).join(', ');
      const result = await pool.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${vals}) RETURNING *`, Object.values(data));
      res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put(`${routePath}/:id`, async (req, res) => {
    try {
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
    const { prompt, type, contentType, tone, length, format, keywords, platforms, audience } = req.body;
    const user = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [DEFAULT_USER_ID]);
    const apiKey = user.rows[0]?.deepseek_api_key || process.env.DEFAULT_DEEPSEEK_API_KEY;
    if (!apiKey) return res.status(400).json({ error: '请先在设置中配置 DeepSeek API Key' });
    // 将结构化参数传给生成器
    const options = { contentType, tone, length, format, keywords: keywords || [], platforms: platforms || [], audience: audience || '' };
    const result = await generateContent(prompt, apiKey, options);
    res.json({ content: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ai/questions', async (req, res) => {
  try {
    const { keyword, platforms } = req.body;
    const user = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [DEFAULT_USER_ID]);
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
