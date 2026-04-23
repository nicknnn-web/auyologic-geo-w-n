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
import { parsePagination, pagedResponse } from './pagination.js';

const { Pool } = pg;
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 设置默认时区为中国时区
process.env.TZ = 'Asia/Shanghai';

const BUILD_VERSION = 'v2026032901';

// 初始化数据库表 + sys_dict 与关键词类型英文 key 迁移
initDB()
  .then(() => ensureSysDictAndMigrate())
  .catch((e) => {
    console.error('initDB:', e)
    ensureSysDictAndMigrate().catch((e2) => console.error('sys_dict migrate:', e2))
  })

/** 系统字典表 + 种子；keywords.type / questions.keyword_type 统一为数字 data_key（01–06，含对比/价格） */
const SYS_DICT_RUNTIME_BOOTSTRAP_META = 'sys_dict_runtime_bootstrap_v1'

async function ensureSysDictAndMigrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sys_dict (
      id SERIAL PRIMARY KEY,
      dict_type VARCHAR(64) NOT NULL,
      data_key VARCHAR(64) NOT NULL,
      data_value VARCHAR(255) NOT NULL,
      sort_order INTEGER DEFAULT 0,
      enabled BOOLEAN DEFAULT TRUE,
      remark VARCHAR(500),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(dict_type, data_key)
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sys_dict_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sys_dict_type (
      dict_type_key VARCHAR(64) PRIMARY KEY,
      dict_type_value VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `)
  const bootDone = await pool.query(`SELECT 1 FROM sys_dict_meta WHERE key = $1`, [
    SYS_DICT_RUNTIME_BOOTSTRAP_META,
  ])
  if (bootDone.rows.length > 0) {
    return
  }

  const dataMigrations = [
    [`UPDATE keywords SET type = '01' WHERE type IN ('品牌','brand')`, []],
    [`UPDATE keywords SET type = '02' WHERE type IN ('产品','product')`, []],
    [`UPDATE keywords SET type = '03' WHERE type IN ('场景','scene')`, []],
    [`UPDATE keywords SET type = '04' WHERE type IN ('企业','enterprise')`, []],
    [`UPDATE questions SET keyword_type = '01' WHERE keyword_type IN ('品牌','brand')`, []],
    [`UPDATE questions SET keyword_type = '02' WHERE keyword_type IN ('产品','product')`, []],
    [`UPDATE questions SET keyword_type = '03' WHERE keyword_type IN ('场景','scene')`, []],
    [`UPDATE questions SET keyword_type = '04' WHERE keyword_type IN ('企业','enterprise')`, []],
  ]
  for (const [sql] of dataMigrations) {
    try {
      await pool.query(sql)
    } catch (e) {
      console.warn('sys_dict migrate sql:', e.message)
    }
  }
  try {
    await pool.query(
      `DELETE FROM sys_dict WHERE dict_type = 'keyword_type' AND data_key IN ('brand','product','scene','enterprise')`
    )
  } catch (e) {
    console.warn('sys_dict cleanup old keys:', e.message)
  }
  /**
   * keyword_type 四条默认种子：历史上每次 API 都执行 INSERT…ON CONFLICT，
   * 用户删掉某条后下次请求会再 INSERT 缺失行 → SERIAL 拿到新 id，表现为「删一次 id 就变了」。
   * 改为：仅在库中尚无迁移标记时跑一轮种子（升级/空库各一次），之后不再自动补插被删行，已存在行仍用 ON CONFLICT 只更新文案/排序。
   */
  const KEYWORD_TYPE_SEED_META = 'keyword_type_defaults_v1'
  const seedApplied = await pool.query(`SELECT 1 FROM sys_dict_meta WHERE key = $1`, [
    KEYWORD_TYPE_SEED_META,
  ])
  const seeds = [
    ['keyword_type', '01', '品牌词', 10],
    ['keyword_type', '02', '产品词', 20],
    ['keyword_type', '03', '场景词', 30],
    ['keyword_type', '04', '企业词', 40],
  ]
  if (seedApplied.rows.length === 0) {
    for (const [dictType, dataKey, dataValue, sortOrder] of seeds) {
      await pool.query(
        `INSERT INTO sys_dict (dict_type, data_key, data_value, sort_order, enabled)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (dict_type, data_key) DO UPDATE SET
           data_value = EXCLUDED.data_value,
           sort_order = EXCLUDED.sort_order,
           enabled = EXCLUDED.enabled`,
        [dictType, dataKey, dataValue, sortOrder]
      )
    }
    await pool.query(
      `INSERT INTO sys_dict_meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [KEYWORD_TYPE_SEED_META, '1']
    )
  }
  /** 品牌体检抽题等：对比词/价格词（空库与已上线库均 upsert，不依赖 v1 种子是否已跑） */
  for (const [dictType, dataKey, dataValue, sortOrder] of [
    ['keyword_type', '05', '对比词', 50],
    ['keyword_type', '06', '价格词', 60],
  ]) {
    await pool.query(
      `INSERT INTO sys_dict (dict_type, data_key, data_value, sort_order, enabled)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (dict_type, data_key) DO UPDATE SET
         data_value = EXCLUDED.data_value,
         sort_order = EXCLUDED.sort_order,
         enabled = EXCLUDED.enabled`,
      [dictType, dataKey, dataValue, sortOrder]
    )
  }
  try {
    await pool.query(`ALTER TABLE keywords ALTER COLUMN type SET DEFAULT '01'`)
  } catch (_) {
    /* ignore if column missing */
  }

  /** 字典类型元数据：key（英文标识）+ value（中文名），与 sys_dict.dict_type 对齐 */
  await pool
    .query(
      `INSERT INTO sys_dict_type (dict_type_key, dict_type_value) VALUES ('keyword_type', '关键词类型')
       ON CONFLICT (dict_type_key) DO UPDATE SET
         dict_type_value = EXCLUDED.dict_type_value,
         updated_at = NOW()`
    )
    .catch((e) => console.warn('sys_dict_type seed:', e.message))
  await pool
    .query(
      `INSERT INTO sys_dict_type (dict_type_key, dict_type_value)
       SELECT DISTINCT d.dict_type::text, d.dict_type::text
       FROM sys_dict d
       WHERE NOT EXISTS (SELECT 1 FROM sys_dict_type t WHERE t.dict_type_key = d.dict_type::text)`
    )
    .catch((e) => console.warn('sys_dict_type backfill:', e.message))
  await pool
    .query(`UPDATE sys_dict_type SET dict_type_value = '关键词类型' WHERE dict_type_key = 'keyword_type'`)
    .catch(() => {})

  await pool.query(
    `INSERT INTO sys_dict_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [SYS_DICT_RUNTIME_BOOTSTRAP_META, '1']
  )
}

/** 写入或更新字典类型中文名 */
async function upsertSysDictType(dictTypeKey, dictTypeValue) {
  const v = String(dictTypeValue || '').trim().slice(0, 255)
  if (!v) throw new Error('dictTypeValue 不能为空')
  await pool.query(
    `INSERT INTO sys_dict_type (dict_type_key, dict_type_value) VALUES ($1, $2)
     ON CONFLICT (dict_type_key) DO UPDATE SET
       dict_type_value = EXCLUDED.dict_type_value,
       updated_at = NOW()`,
    [dictTypeKey, v]
  )
}

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

/** 使用 LIMIT/OFFSET 分页的通用 CRUD 表（与前端 el-pagination 对齐） */
const PAGED_CRUD_TABLES = new Set([
  'keywords',
  'questions',
  'instruction_templates',
  'drafts',
  'publish_records',
])

function buildCrudTableFilter(table, req) {
  const parts = []
  const params = []
  if (table === 'keywords' && req.query.type) {
    parts.push(`type = $${params.length + 1}`)
    params.push(String(req.query.type))
  }
  if (table === 'questions') {
    if (req.query.keywordType) {
      parts.push(`keyword_type = $${params.length + 1}`)
      params.push(String(req.query.keywordType))
    }
    if (req.query.status) {
      parts.push(`status = $${params.length + 1}`)
      params.push(String(req.query.status))
    }
  }
  if (table === 'drafts' && req.query.status) {
    parts.push(`status = $${params.length + 1}`)
    params.push(String(req.query.status))
  }
  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : ''
  return { where, params }
}

async function fetchPagedCrudList(table, req) {
  await ensureTable(table)
  const { page, pageSize, offset } = parsePagination(req)
  const { where, params } = buildCrudTableFilter(table, req)
  const countR = await pool.query(
    `SELECT COUNT(*)::int AS c FROM ${table} ${where}`,
    params
  )
  const total = countR.rows[0]?.c ?? 0
  const lim = params.length + 1
  const off = params.length + 2
  const orderSql =
    table === 'publish_records'
      ? 'ORDER BY created_at DESC NULLS LAST, id DESC'
      : 'ORDER BY id DESC'
  const dataR = await pool.query(
    `SELECT * FROM ${table} ${where} ${orderSql} LIMIT $${lim} OFFSET $${off}`,
    [...params, pageSize, offset]
  )
  const out = pagedResponse(toCamelCase(dataR.rows), total, page, pageSize)
  if (table === 'questions') {
    const appR = await pool.query(
      `SELECT COUNT(*)::int AS c FROM questions WHERE status = '已审核'`
    )
    out.approvedTotal = appR.rows[0]?.c ?? 0
  }
  return out
}

async function handleCrudTableGet(req, res, table) {
  try {
    if (PAGED_CRUD_TABLES.has(table)) {
      const body = await fetchPagedCrudList(table, req)
      return res.json(body)
    }
    await ensureTable(table)
    const result = await pool.query(`SELECT * FROM ${table} ORDER BY id DESC`)
    res.json(toCamelCase(result.rows))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/** 字典下拉：?dictType=keyword_type → [{ dataKey, dataValue, sortOrder }]（关键词类型 data_key 为 01–06） */
app.get('/api/sys-dict', async (req, res) => {
  try {
    const dictType = req.query.dictType || req.query.type
    if (!dictType) {
      return res.status(400).json({ error: 'dictType is required' })
    }
    await ensureSysDictAndMigrate()
    const result = await pool.query(
      `SELECT data_key, data_value, sort_order FROM sys_dict
       WHERE dict_type = $1 AND enabled = true
       ORDER BY sort_order ASC NULLS LAST, data_key ASC`,
      [dictType]
    )
    res.json(toCamelCase(result.rows))
  } catch (err) {
    console.error('sys-dict:', err)
    res.status(500).json({ error: err.message })
  }
})

const SYS_DICT_KEY_RE = /^[a-zA-Z0-9_-]{1,64}$/

/** 字典类型列表（管理页筛选）：{ dictTypeKey, dictTypeValue }[] */
app.get('/api/sys-dict/types', async (req, res) => {
  try {
    await ensureSysDictAndMigrate()
    const r = await pool.query(
      `SELECT dict_type_key, dict_type_value FROM sys_dict_type ORDER BY dict_type_key ASC`
    )
    res.json({ types: toCamelCase(r.rows) })
  } catch (err) {
    console.error('sys-dict/types:', err)
    res.status(500).json({ error: err.message })
  }
})

/** 字典条目列表（管理用，含禁用项，分页） */
app.get('/api/sys-dict/entries', async (req, res) => {
  try {
    await ensureSysDictAndMigrate()
    const dictType = req.query.dictType || req.query.type
    const { page, pageSize, offset } = parsePagination(req)
    const params = []
    let where = '1=1'
    if (dictType) {
      params.push(String(dictType))
      where += ` AND d.dict_type = $${params.length}`
    }
    const countR = await pool.query(
      `SELECT COUNT(*)::int AS c FROM sys_dict d WHERE ${where}`,
      params
    )
    const total = countR.rows[0]?.c ?? 0
    const lim = params.length + 1
    const off = params.length + 2
    const orderBy = dictType
      ? 'ORDER BY d.sort_order ASC NULLS LAST, d.data_key ASC'
      : 'ORDER BY d.dict_type ASC, d.sort_order ASC NULLS LAST, d.data_key ASC'
    const result = await pool.query(
      `SELECT d.id, d.dict_type, COALESCE(t.dict_type_value, d.dict_type) AS dict_type_value,
              d.data_key, d.data_value, d.sort_order, d.enabled, d.remark, d.created_at
       FROM sys_dict d
       LEFT JOIN sys_dict_type t ON t.dict_type_key = d.dict_type
       WHERE ${where} ${orderBy} LIMIT $${lim} OFFSET $${off}`,
      [...params, pageSize, offset]
    )
    res.json(pagedResponse(toCamelCase(result.rows), total, page, pageSize))
  } catch (err) {
    console.error('sys-dict/entries:', err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/sys-dict/entries', async (req, res) => {
  try {
    await ensureSysDictAndMigrate()
    const { dictType, dictTypeValue, dataKey, dataValue, sortOrder, enabled, remark } = req.body || {}
    if (!dictType || !dataKey || dataValue === undefined || dataValue === '') {
      return res.status(400).json({ error: 'dictType、dataKey、dataValue 为必填' })
    }
    const dtv = dictTypeValue !== undefined && dictTypeValue !== null ? String(dictTypeValue).trim() : ''
    if (!dtv) {
      return res.status(400).json({ error: 'dictTypeValue（字典类型中文名）为必填' })
    }
    if (!SYS_DICT_KEY_RE.test(dictType) || !SYS_DICT_KEY_RE.test(dataKey)) {
      return res.status(400).json({ error: 'dictType / dataKey 仅允许字母数字下划线与中划线，长度 1–64' })
    }
    const so = sortOrder === undefined || sortOrder === null ? 0 : Number(sortOrder)
    const en = enabled === false ? false : true
    const rm = remark != null ? String(remark).slice(0, 500) : null
    await upsertSysDictType(dictType, dtv)
    const result = await pool.query(
      `INSERT INTO sys_dict (dict_type, data_key, data_value, sort_order, enabled, remark)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, dict_type, data_key, data_value, sort_order, enabled, remark, created_at`,
      [dictType, dataKey, String(dataValue).slice(0, 255), Number.isFinite(so) ? so : 0, en, rm]
    )
    const row = result.rows[0]
    const tv = await pool.query(
      `SELECT dict_type_value FROM sys_dict_type WHERE dict_type_key = $1`,
      [row.dict_type]
    )
    res.status(201).json(
      toCamelCase({
        ...row,
        dict_type_value: tv.rows[0]?.dict_type_value ?? dtv,
      })
    )
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: '该字典类型下已存在相同 dataKey' })
    }
    console.error('sys-dict/entries POST:', err)
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/sys-dict/entries/:id', async (req, res) => {
  try {
    await ensureSysDictAndMigrate()
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: '无效的 id' })
    }
    const { dictType, dictTypeValue, dataKey, dataValue, sortOrder, enabled, remark } = req.body || {}
    const cur = await pool.query(`SELECT * FROM sys_dict WHERE id = $1`, [id])
    if (cur.rows.length === 0) {
      return res.status(404).json({ error: '记录不存在' })
    }
    const old = cur.rows[0]
    const nextType =
      dictType !== undefined && dictType !== null ? String(dictType) : old.dict_type
    const nextKey =
      dataKey !== undefined && dataKey !== null ? String(dataKey) : old.data_key
    const nextVal =
      dataValue !== undefined && dataValue !== null
        ? String(dataValue).slice(0, 255)
        : old.data_value
    if (!nextVal) {
      return res.status(400).json({ error: 'dataValue 不能为空' })
    }
    if (!SYS_DICT_KEY_RE.test(nextType) || !SYS_DICT_KEY_RE.test(nextKey)) {
      return res.status(400).json({ error: 'dictType / dataKey 仅允许字母数字下划线与中划线，长度 1–64' })
    }
    const nextSo =
      sortOrder !== undefined && sortOrder !== null
        ? Number(sortOrder)
        : old.sort_order
    const nextEn =
      enabled !== undefined && enabled !== null ? Boolean(enabled) : old.enabled
    const nextRm =
      remark !== undefined
        ? remark === null || remark === ''
          ? null
          : String(remark).slice(0, 500)
        : old.remark

    const result = await pool.query(
      `UPDATE sys_dict SET
        dict_type = $1,
        data_key = $2,
        data_value = $3,
        sort_order = $4,
        enabled = $5,
        remark = $6
       WHERE id = $7
       RETURNING id, dict_type, data_key, data_value, sort_order, enabled, remark, created_at`,
      [nextType, nextKey, nextVal, Number.isFinite(nextSo) ? nextSo : 0, nextEn, nextRm, id]
    )
    const updated = result.rows[0]
    if (dictTypeValue !== undefined && dictTypeValue !== null && String(dictTypeValue).trim() !== '') {
      await upsertSysDictType(nextType, dictTypeValue)
    }
    const tv = await pool.query(
      `SELECT dict_type_value FROM sys_dict_type WHERE dict_type_key = $1`,
      [updated.dict_type]
    )
    res.json(
      toCamelCase({
        ...updated,
        dict_type_value: tv.rows[0]?.dict_type_value ?? updated.dict_type,
      })
    )
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: '该字典类型下已存在相同 dataKey' })
    }
    console.error('sys-dict/entries PUT:', err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/sys-dict/entries/:id', async (req, res) => {
  try {
    await ensureSysDictAndMigrate()
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: '无效的 id' })
    }
    const r = await pool.query(`DELETE FROM sys_dict WHERE id = $1 RETURNING id`, [id])
    if (r.rows.length === 0) {
      return res.status(404).json({ error: '记录不存在' })
    }
    res.json({ ok: true, id })
  } catch (err) {
    console.error('sys-dict/entries DELETE:', err)
    res.status(500).json({ error: err.message })
  }
})

/** 批量删除字典条目（POST 避免部分代理丢弃 DELETE body） */
app.post('/api/sys-dict/entries/batch-delete', async (req, res) => {
  try {
    await ensureSysDictAndMigrate()
    const raw = req.body?.ids
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ error: '请提供非空 ids 数组' })
    }
    const MAX_BATCH = 500
    const ids = [
      ...new Set(
        raw
          .map((x) => parseInt(String(x), 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      ),
    ]
    if (ids.length === 0) {
      return res.status(400).json({ error: 'ids 中无有效正整数 id' })
    }
    if (ids.length > MAX_BATCH) {
      return res.status(400).json({ error: `单次最多删除 ${MAX_BATCH} 条` })
    }
    const r = await pool.query(`DELETE FROM sys_dict WHERE id = ANY($1::int[]) RETURNING id`, [ids])
    res.json({
      ok: true,
      deletedIds: r.rows.map((row) => row.id),
      deletedCount: r.rowCount,
    })
  } catch (err) {
    console.error('sys-dict/entries batch-delete:', err)
    res.status(500).json({ error: err.message })
  }
})

tables.forEach(table => {
  const routePath = `/api/${table}`;
  const hyphenPath = `/api/${table.replace(/_/g, '-')}`;

  // 如果有下划线，添加 hyphenated 别名路由
  if (table.includes('_')) {
    app.get(hyphenPath, (req, res) => handleCrudTableGet(req, res, table));
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

  app.get(routePath, (req, res) => handleCrudTableGet(req, res, table));

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

/** 控制台卡片统计（避免列表分页后总数不准） */
app.get('/api/dashboard-stats', async (req, res) => {
  try {
    for (const t of ['keywords', 'questions', 'drafts', 'publish_records']) {
      await ensureTable(t)
    }
    const [
      kwTotal,
      kwBrand,
      kwProduct,
      kwIndustry,
      qTotal,
      qApproved,
      dTotal,
      prPublished,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM keywords'),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM keywords WHERE type IN ('01','brand','品牌')`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM keywords WHERE type IN ('02','product','产品')`
      ),
      pool.query(`SELECT COUNT(*)::int AS c FROM keywords WHERE type = '行业'`),
      pool.query('SELECT COUNT(*)::int AS c FROM questions'),
      pool.query(`SELECT COUNT(*)::int AS c FROM questions WHERE status = '已审核'`),
      pool.query('SELECT COUNT(*)::int AS c FROM drafts'),
      pool.query(`SELECT COUNT(*)::int AS c FROM publish_records WHERE status = '已发布'`),
    ])
    res.json({
      keywordsTotal: kwTotal.rows[0]?.c ?? 0,
      keywordBrand: kwBrand.rows[0]?.c ?? 0,
      keywordProduct: kwProduct.rows[0]?.c ?? 0,
      keywordIndustry: kwIndustry.rows[0]?.c ?? 0,
      questionsTotal: qTotal.rows[0]?.c ?? 0,
      questionsApproved: qApproved.rows[0]?.c ?? 0,
      draftsTotal: dTotal.rows[0]?.c ?? 0,
      publishedTotal: prPublished.rows[0]?.c ?? 0,
    })
  } catch (err) {
    console.error('dashboard-stats:', err)
    res.status(500).json({ error: err.message })
  }
})

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
    const { page, pageSize, offset } = parsePagination(req)
    const parts = []
    const params = []
    if (req.query.authStatus) {
      params.push(String(req.query.authStatus))
      parts.push(`auth_status = $${params.length}`)
    }
    const where = parts.length ? `WHERE ${parts.join(' AND ')}` : ''
    const countR = await pool.query(
      `SELECT COUNT(*)::int AS c FROM media_accounts ${where}`,
      params
    )
    const total = countR.rows[0]?.c ?? 0
    const lim = params.length + 1
    const off = params.length + 2
    const result = await pool.query(
      `SELECT id, platform, account_name, phone_number,
              auth_status, auth_time, last_verified_at, status, created_at, updated_at
       FROM media_accounts ${where} ORDER BY created_at DESC LIMIT $${lim} OFFSET $${off}`,
      [...params, pageSize, offset]
    )
    res.json(pagedResponse(result.rows, total, page, pageSize))
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

/** 投放走本地代理时：须有心跳。ALLOW_PUBLISH_WITHOUT_AGENT=true 时跳过（服务器内 Playwright） */
function isLocalAgentOnline() {
  if (process.env.ALLOW_PUBLISH_WITHOUT_AGENT === 'true') return true;
  return agentLastSeen !== null && (Date.now() - agentLastSeen < 30000);
}

// 代理轮询：领取一条待发布的投放任务（原子更新为 running）
app.get('/api/agent/pending-publish', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE publish_tasks AS pt
         SET status = 'running', updated_at = NOW()
       FROM (
         SELECT id FROM publish_tasks
         WHERE status = 'queued_local'
         ORDER BY id ASC
         LIMIT 1
       ) AS sub
       WHERE pt.id = sub.id
       RETURNING pt.*`
    );
    if (result.rows.length === 0) return res.json({ task: null });

    const task = result.rows[0];
    const acc = await pool.query(
      'SELECT session_state, account_name FROM media_accounts WHERE id = $1',
      [task.account_id]
    );
    if (acc.rows.length === 0 || !acc.rows[0].session_state) {
      await pool.query(
        `UPDATE publish_tasks SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
        [acc.rows.length === 0 ? '关联账号不存在' : '账号未授权或 session 为空', task.id]
      );
      return res.json({ task: null });
    }

    const { session_state, account_name } = acc.rows[0];
    res.json({
      task: {
        taskId: task.id,
        platform: task.platform,
        accountId: task.account_id,
        accountName: account_name,
        content: task.content,
        title: task.title,
        tags: task.tags,
        draftTitle: task.draft_title,
        sessionState: session_state,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 代理上报投放结果
app.post('/api/agent/complete-publish', async (req, res) => {
  try {
    const { taskId, success, publishedUrl, errorMessage, taskLog } = req.body;
    const tid = Number(taskId);
    if (!tid) return res.status(400).json({ error: 'taskId 无效' });

    const taskRow = await pool.query('SELECT * FROM publish_tasks WHERE id = $1', [tid]);
    if (taskRow.rows.length === 0) return res.status(404).json({ error: '任务不存在' });
    const task = taskRow.rows[0];

    const accRow = await pool.query('SELECT account_name FROM media_accounts WHERE id = $1', [task.account_id]);
    const accountName = accRow.rows[0]?.account_name || '';

    cleanupTask(tid);

    if (success) {
      await pool.query(
        `UPDATE publish_tasks SET status = 'done', published_url = $1, task_log = $2, error_message = NULL, updated_at = NOW() WHERE id = $3`,
        [publishedUrl || '', taskLog || '', tid]
      );
      await pool.query(
        `INSERT INTO publish_records
           (task_id, draft_title, platform, account_id, account_name, published_url, status)
         VALUES ($1,$2,$3,$4,$5,$6,'已发布')`,
        [tid, task.draft_title || '', task.platform, task.account_id, accountName, publishedUrl || '']
      );
    } else {
      await pool.query(
        `UPDATE publish_tasks SET status = 'failed', error_message = $1, task_log = $2, updated_at = NOW() WHERE id = $3`,
        [errorMessage || '发布失败', taskLog || '', tid]
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

  // 本地投放依赖的发布逻辑（与仓库 backend/src 同步）
  const publisherPath = join(__dirname, '../src/services/playwrightPublisher.js');
  if (fs.existsSync(publisherPath)) {
    archive.file(publisherPath, { name: 'src/services/playwrightPublisher.js' });
  }

  archive.finalize();
});

// ========== 发布任务管理 ==========

app.get('/api/publish-tasks', async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePagination(req)
    const baseFrom = `FROM publish_tasks pt
       LEFT JOIN media_accounts ma ON pt.account_id = ma.id`
    const countR = await pool.query(`SELECT COUNT(*)::int AS c ${baseFrom}`)
    const total = countR.rows[0]?.c ?? 0
    const result = await pool.query(
      `SELECT pt.*, ma.account_name ${baseFrom}
       ORDER BY pt.created_at DESC NULLS LAST, pt.id DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    )
    res.json(pagedResponse(result.rows, total, page, pageSize))
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

    // 服务器内 Playwright（仅 ALLOW_PUBLISH_WITHOUT_AGENT=true）
    if (process.env.ALLOW_PUBLISH_WITHOUT_AGENT === 'true') {
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
      return res.json({ success: true, message: '发布任务已启动，正在后台执行' });
    }

    if (!isLocalAgentOnline()) {
      return res.status(503).json({
        error: '本地代理未在线，请先启动本地代理后再执行发布',
        agentOffline: true,
      });
    }

    await pool.query(
      `UPDATE publish_tasks SET status = 'queued_local', task_log = '', error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [taskId]
    );
    res.json({ success: true, message: '已加入本地发布队列，请保持代理运行' });
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
import fileUploadRouter from './routes/fileUpload.js';
import geoBrandTaskRouter from './routes/geoBrandTask.js';
import geoHealthReportRouter from './routes/geoHealthReport.js';

app.use('/api', contentGeneratorRouter);
app.use('/api/minio', fileUploadRouter);
app.use('/api', geoDetectionRouter);
app.use('/api', websiteAnalyzerRouter);
app.use('/api/ai', aiProxyRouter);
app.use('/api', geoBrandTaskRouter);
app.use('/api', geoHealthReportRouter);

// ========== Stub 接口（功能完善后替换为真实实现）==========

// GEO 检测报告 CRUD
app.get('/api/geo-reports', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM geo_reports ORDER BY checked_at DESC LIMIT 50`
    );
    res.json(toCamelCase(result.rows));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/geo-reports', async (req, res) => {
  try {
    const { keyword, overallScore, overallGrade, visibleCount, missingCount, platformData } = req.body;
    const result = await pool.query(
      `INSERT INTO geo_reports (user_id, keyword, overall_score, overall_grade, visible_count, missing_count, platform_data)
       VALUES ('default_user', $1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [keyword || '', overallScore || 0, overallGrade || 'D', visibleCount || 0, missingCount || 0, JSON.stringify(platformData || {})]
    );
    res.json(toCamelCase(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/geo-reports/:id', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM geo_reports WHERE id = $1 RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '报告不存在' });
    res.json(toCamelCase(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GEO 检测明细 CRUD
app.get('/api/geo-detection', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM geo_detection ORDER BY checked_at DESC LIMIT 200`
    );
    res.json(toCamelCase(result.rows));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/geo-detection', async (req, res) => {
  try {
    const { keyword, platform, visible, summary, score } = req.body;
    const result = await pool.query(
      `INSERT INTO geo_detection (user_id, keyword, platform, visible, summary, score)
       VALUES ('default_user', $1, $2, $3, $4, $5)
       RETURNING *`,
      [keyword || '', platform || '', visible || false, summary || '', score || 0]
    );
    res.json(toCamelCase(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/geo-detection/:id', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM geo_detection WHERE id = $1 RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '记录不存在' });
    res.json(toCamelCase(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 网站检测报告 CRUD
app.get('/api/website-reports', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM website_optimization ORDER BY checked_at DESC LIMIT 50`
    );
    res.json(toCamelCase(result.rows));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/website-reports', async (req, res) => {
  try {
    const { url, seoScore, aiScore, techScore, contentScore, overallScore, report } = req.body;
    const result = await pool.query(
      `INSERT INTO website_optimization (user_id, url, seo_score, ai_score, tech_score, content_score, overall_score, report)
       VALUES ('default_user', $1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [url || '', seoScore || 0, aiScore || 0, techScore || 0, contentScore || 0, overallScore || 0, JSON.stringify(report || {})]
    );
    res.json(toCamelCase(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/website-reports/:id', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM website_optimization WHERE id = $1 RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '报告不存在' });
    res.json(toCamelCase(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== GEO 健康体检报告 API ==========
// ⚠️ 以下旧实现已被 routes/geoHealthReport.js 取代，保留仅供参考
// app.get('/api/geo-health-report', async (req, res) => {
const _LEGACY_geo_health_report_DISABLED = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'default_user';

    // 获取最新的 GEO 检测报告（聚合数据）
    const reportsRes = await pool.query(
      `SELECT * FROM geo_reports WHERE user_id = $1 ORDER BY checked_at DESC LIMIT 5`,
      [userId]
    );

    // 获取详细的每次检测记录（包含 summary）
    const detectionRes = await pool.query(
      `SELECT * FROM geo_detection WHERE user_id = $1 ORDER BY checked_at DESC LIMIT 200`,
      [userId]
    );

    const reports = toCamelCase(reportsRes.rows);
    const detections = toCamelCase(detectionRes.rows);

    const normKw = (k) => String(k || '').trim().toLowerCase();
    const latestReport = reports[0];
    const brandKeywordRaw = latestReport?.keyword || '';
    const brandKwNorm = normKw(brandKeywordRaw);

    // KPI 分母：优先非品牌词（与总报告 keyword 完全相同的检测视为品牌直搜并剔除）
    let nonBrandDetections = detections.filter((d) => normKw(d.keyword) !== brandKwNorm);
    let kpiDenominator = 'non_brand';
    if (nonBrandDetections.length === 0 && detections.length > 0) {
      nonBrandDetections = detections;
      kpiDenominator = 'all_fallback';
    }
    const kpiPool = nonBrandDetections;
    const totalKpi = kpiPool.length;

    // ===== 计算健康指标（基于 kpiPool）=====
    const totalChecks = detections.length;
    const topMentions = kpiPool.filter((d) => (d.score || 0) >= 80).length;
    const interceptRate = totalKpi > 0 ? Math.round((topMentions / totalKpi) * 100) : 0;

    const blindChecks = kpiPool.filter((d) => !d.visible || (d.score || 0) === 0).length;
    const blindIndex = totalKpi > 0 ? Math.round((blindChecks / totalKpi) * 100) : 0;

    const negativeKeywords = ['负面', '丑闻', '问题', '漏洞', '欺骗', '失败', '投诉', '曝光', '危机'];
    let negativeMentions = 0;
    for (const d of kpiPool) {
      const summary = String(d.summary || '').toLowerCase();
      if (negativeKeywords.some((kw) => summary.includes(kw))) negativeMentions++;
    }
    const negativeRate = totalKpi > 0 ? Math.round((negativeMentions / totalKpi) * 100) : 0;

    const avgScore = totalChecks > 0
      ? Math.round(detections.reduce((s, d) => s + (d.score || 0), 0) / totalChecks)
      : 0;

    // 6. 综合健康分（S/A/B/C/D 转为 100-40）
    const healthScore = latestReport
      ? { S: 95, A: 82, B: 68, C: 55, D: 38 }[latestReport.overallGrade] || 50
      : 0;

    // 7. 全域可见度矩阵（按意图路径 × 平台：同平台多条记录按路径索引轮转）
    const intentPaths = [
      { key: 'core', label: '核心词', type: '品牌词' },
      { key: 'scene', label: '场景词', type: '需求词' },
      { key: 'compare', label: '对比词', type: '竞品词' },
      { key: 'feature', label: '功能词', type: '产品词' },
      { key: 'price', label: '价格词', type: '决策词' },
    ];

    const platforms = [
      { key: 'kimi',     name: 'Kimi',      icon: 'K',  color: '#06B6D4', simulated: true },
      { key: 'doubao',   name: '豆包',      icon: '豆', color: '#EA580C', simulated: true },
      { key: 'yuanbao',  name: '腾讯元宝',   icon: '元', color: '#0EA5E9', simulated: true },
      { key: 'tongyi',   name: '通义千问',   icon: '通', color: '#8B5CF6', simulated: true },
      { key: 'yiyan',    name: '文心一言',   icon: '文', color: '#EF4444', simulated: true },
      { key: 'deepseek', name: 'DeepSeek',  icon: 'D',  color: '#4F46E5', simulated: false },
      // { key: 'zhipu',    name: '智谱清言',   icon: '智', color: '#10B981', simulated: true },
      // { key: 'spark',    name: '讯飞星火',   icon: '讯', color: '#F59E0B', simulated: true },
    ];

    /** 矩阵词条：核心词 4 档；其余路径 5 档。假数据阶段写死格子，避免每次请求变化。 */
    const FIXED_MATRIX_DATA = {
      core: {
        kimi: 'second',
        doubao: 'second',
        yuanbao: 'not_priority',
        tongyi: 'none',
        yiyan: 'not_priority',
        deepseek: 'precise',
      },
      scene: {
        kimi: 'mid_tier',
        doubao: 'head_tier',
        yuanbao: 'mid_tier',
        tongyi: 'rank_tail',
        yiyan: 'mid_tier',
        deepseek: 'industry_first',
      },
      compare: {
        kimi: 'rank_tail',
        doubao: 'head_tier',
        yuanbao: 'mid_tier',
        tongyi: 'none',
        yiyan: 'rank_tail',
        deepseek: 'industry_first',
      },
      feature: {
        kimi: 'mid_tier',
        doubao: 'head_tier',
        yuanbao: 'rank_tail',
        tongyi: 'mid_tier',
        yiyan: 'head_tier',
        deepseek: 'industry_first',
      },
      price: {
        kimi: 'rank_tail',
        doubao: 'mid_tier',
        yuanbao: 'rank_tail',
        tongyi: 'none',
        yiyan: 'mid_tier',
        deepseek: 'head_tier',
      },
    };

    const matrixData = {};
    intentPaths.forEach((path) => {
      matrixData[path.key] = {};
      const row = FIXED_MATRIX_DATA[path.key] || {};
      for (const plat of platforms) {
        matrixData[path.key][plat.key] = row[plat.key] ?? 'none';
      }
    });

    const clamp100 = (n) => Math.min(100, Math.max(0, Math.round(n)));

    /** 综合得分展示顺序：DeepSeek 第一、豆包第二，其余随意（前端按 score 降序） */
    const MV_SCORE_FIXED = {
      deepseek: 92,
      doubao: 86,
      kimi: 78,
      yuanbao: 74,
      tongyi: 70,
      yiyan: 66,
    };

    // 各平台大模型可见度卡片（矩阵列 + 该平台检测均分）
    let modelVisibilityCards = platforms.map((plat) => {
      const pk = plat.key;
      let top1 = 0;
      let top2 = 0;
      let mention = 0;
      let comp = 0;
      let none = 0;
      for (const path of intentPaths) {
        const v = matrixData[path.key]?.[pk];
        if (path.key === 'core') {
          if (v === 'precise') top1++;
          else if (v === 'second') top2++;
          else if (v === 'not_priority') comp++;
          else none++;
        } else {
          if (v === 'industry_first') top1++;
          else if (v === 'head_tier') top2++;
          else if (v === 'mid_tier') mention++;
          else if (v === 'rank_tail') comp++;
          else none++;
        }
      }
      const nPaths = intentPaths.length || 1;
      const platRows = detections.filter(
        (d) => d.platform && String(d.platform).toLowerCase().includes(pk)
      );
      const avgPlat = platRows.length
        ? Math.round(platRows.reduce((s, d) => s + (d.score || 0), 0) / platRows.length)
        : 0;
      const matrixPart = Math.round(((top1 + top2 * 0.72 + mention * 0.48) / nPaths) * 100);
      const score = clamp100(matrixPart * 0.55 + avgPlat * 0.45);

      const bullets = [];
      if (none >= Math.ceil(nPaths * 0.5)) {
        bullets.push({ tone: 'bad', text: `大模型盲区明显（${none}/${nPaths} 路径未有效露出）` });
      } else if (none >= 2) {
        bullets.push({ tone: 'warn', text: `部分意图路径未提及（${none} 处）` });
      }
      if (comp >= 2) {
        bullets.push({ tone: 'bad', text: '竞品拦截偏重，多场景被第三方占优' });
      } else if (comp === 1) {
        bullets.push({ tone: 'warn', text: '存在竞品优势格，可关注对比类问法' });
      }
      if (top1 >= 2) {
        bullets.push({ tone: 'good', text: `首位心智露出较好（${top1} 条路径首位）` });
      }
      if (avgPlat >= 72 && !bullets.some((b) => b.tone === 'good')) {
        bullets.push({ tone: 'good', text: '该模型检测均分较高' });
      }
      if (top2 + mention >= 3 && !bullets.some((b) => b.tone === 'good')) {
        bullets.push({ tone: 'good', text: '多条路径保持顺位提及' });
      }
      if (!bullets.length) {
        bullets.push({ tone: 'neutral', text: '检测样本较少，建议扩大关键词覆盖' });
      }
      while (bullets.length < 2) {
        bullets.push({ tone: 'neutral', text: '可结合下方矩阵持续观察各路径变化' });
      }

      let status = 'high';
      let statusText = '高风险';
      if (score >= 70) {
        status = 'good';
        statusText = '表现良好';
      } else if (score >= 45) {
        status = 'mid';
        statusText = '待加强';
      }

      return {
        platformKey: pk,
        name: plat.name,
        icon: plat.icon,
        brandColor: plat.color,
        simulated: !!plat.simulated,
        score,
        status,
        statusText,
        bullets: bullets.slice(0, 4),
      };
    });

    modelVisibilityCards = modelVisibilityCards.map((c) => {
      const score = MV_SCORE_FIXED[c.platformKey] ?? c.score;
      let status = 'high';
      let statusText = '高风险';
      if (score >= 70) {
        status = 'good';
        statusText = '表现良好';
      } else if (score >= 45) {
        status = 'mid';
        statusText = '待加强';
      }
      return { ...c, score, status, statusText };
    });

    // 8. 兼容占位：六维情绪（无随机数，由 KPI 推导，前端词云为主）
    const emotionData = [
      clamp100(interceptRate + 8),
      clamp100(100 - blindIndex * 0.85),
      clamp100(avgScore),
      clamp100(avgScore * 0.92),
      clamp100(100 - negativeRate * 1.2),
      clamp100((interceptRate + (100 - blindIndex)) / 2),
    ];

    // —— 模块 C：竞品拦截诊断（三条横条：只改 count，占比由次数合计自动计算）——
    const competitorMentionRows = [
      { name: '竞品A', count: 12, barTone: 'primary' },
      { name: '竞品B', count: 8, barTone: 'primary' },
      { name: '竞品C', count: 7, barTone: 'primary' },
    ];
    const compMentionTotal = competitorMentionRows.reduce((s, r) => s + (Number(r.count) || 0), 0);
    let compMentionPcts =
      compMentionTotal > 0
        ? competitorMentionRows.map((r) =>
            Math.round(((Number(r.count) || 0) / compMentionTotal) * 100)
          )
        : competitorMentionRows.map(() => 0);
    const compPctDrift = 100 - compMentionPcts.reduce((a, b) => a + b, 0);
    if (compMentionTotal > 0 && compPctDrift !== 0 && compMentionPcts.length) {
      compMentionPcts[compMentionPcts.length - 1] += compPctDrift;
    }
    const competitorMentions = competitorMentionRows.map((r, i) => ({
      name: r.name,
      count: r.count,
      barTone: r.barTone,
      pct: compMentionPcts[i],
    }));

    const ctxKeys = ['平替', '对比', '性价比', '口碑', '首选', '免费', '多模态', '代码能力'];
    const contextTags = ctxKeys
      .map((text) => ({
        text,
        count: detections.reduce((n, d) => (String(d.summary || '').includes(text) ? n + 1 : n), 0),
      }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);

    const stopBi = new Set('的了是在和与或为有被从对及及等也又就都很还这那之其一个中于及与或吗呢吧啊哦嗯呀么嘛别个种第于以于及'.split(''));
    const biCounts = new Map();
    for (const d of detections) {
      const s = String(d.summary || '').replace(/\s/g, '');
      for (let i = 0; i < s.length - 1; i++) {
        const bi = s.slice(i, i + 2);
        if (!/^[\u4e00-\u9fff]{2}$/.test(bi)) continue;
        if (stopBi.has(bi[0]) || stopBi.has(bi[1])) continue;
        biCounts.set(bi, (biCounts.get(bi) || 0) + 1);
      }
    }
    const triggerWords = [...biCounts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([text]) => text);

    /** 高频触发词颜色档：>50 红，30–50 橙，小于 30 灰 */
    const levelFromTriggerCount = (c) => {
      const n = Number(c) || 0;
      if (n > 50) return 'high';
      if (n >= 30) return 'orange';
      return 'neutral';
    };

    const curatedTriggers = [];
    let curatedSample = '';
    let curatedCount = 0;
    const pingtiRe = /有没有[^。！？\n]{0,22}平替[^。！？\n]{0,10}/;
    for (const d of detections) {
      const s = String(d.summary || '');
      if (pingtiRe.test(s)) curatedCount++;
    }
    if (curatedCount > 0) {
      for (const d of detections) {
        const s = String(d.summary || '');
        const m = s.match(pingtiRe);
        if (m && m[0].length >= 6) {
          curatedSample = m[0].trim();
          break;
        }
      }
      if (curatedSample) {
        curatedTriggers.push({
          text: `「${curatedSample}」`,
          count: curatedCount,
          level: levelFromTriggerCount(curatedCount),
        });
      }
    }

    const fromBi = triggerWords
      .filter((t) => !curatedTriggers.some((c) => String(c.text).includes(t)))
      .slice(0, 7)
      .map((text) => {
        const cnt = biCounts.get(text) || 0;
        return {
          text,
          count: cnt,
          level: levelFromTriggerCount(cnt),
        };
      });
    const lossTriggerTags = [...curatedTriggers, ...fromBi].slice(0, 8);

    // —— 模块 D：词云（价值向短语 + 分句 + 每条摘要内去重 + 子串去冗，避免笼统二字词与重复片段）——
    const posHints = ['强', '优', '好', '深', '佳', '高', '快', '省', '开源', '中文', '性价比', '推理', '优异', '理解', '便宜', '免费', '便捷', '稳定', '准确', '智能', '高效', '安全', '流畅', '专业'];
    const negHints = ['差', '弱', '缺', '慢', '贵', '限', '待', '问题', '排队', '暂缺', '不足', '危机', '漏洞', '投诉', '失败', '风险', '延迟', '卡顿', '错误'];
    const CLOUD_STOP_BIGRAM = new Set([
      '可以', '能够', '进行', '使用', '用户', '产品', '这个', '一个', '没有', '但是', '如果', '或者', '以及', '目前', '方面', '相关', '需要', '可能', '非常', '比较', '同样', '主要', '作为', '由于', '为了', '所有', '而且', '所以', '只是', '这样', '这种', '那么', '虽然', '还是', '不是', '通过', '基于', '其中', '例如', '一般', '通常', '建议', '推荐', '选择', '因此', '同时', '此外', '另外', '具有', '拥有', '采用', '包括', '提供', '然后', '因为', '不会', '已经', '什么', '怎么', '如何', '哪些', '是否', '应当', '应该', '最好', '方便', '简单', '一些', '一种', '一次', '一样', '一直', '一点', '一定',
    ]);
    const CLOUD_STOP_PREFIX = new Set(['可以', '能够', '进行', '使用', '这个', '一个', '如果', '或者', '以及', '通过', '基于', '例如', '建议', '推荐', '选择', '什么', '怎么', '如何', '是否', '需要', '可能', '非常', '比较', '主要', '所有', '而且', '因此', '同时', '此外', '另外', '具有', '拥有', '采用', '包括', '提供', '然后', '因为', '所以', '不会', '已经', '同样', '作为', '由于', '为了', '只是', '这样', '这种', '那么', '虽然', '还是', '不是', '其中', '一般', '通常', '应当', '应该', '最好', '方便', '简单', '相关', '方面', '目前', '用户', '产品', '但是', '没有', '比较', '非常']);

    const extractWordCloudPhrases = (summary) => {
      const raw = String(summary || '').trim();
      if (!raw) return [];
      const out = new Set();
      const clauses = raw
        .split(/[。！？；;、\n\r]+/)
        .map((x) => x.replace(/[\s\u3000]+/g, '').trim())
        .filter((x) => x.length >= 4);

      const pushPhrase = (t) => {
        const w = String(t || '')
          .replace(/[「」『』"“”'']/g, '')
          .replace(/^的+|的$/g, '');
        if (w.length < 3 || w.length > 16) return;
        if (/^[\u4e00-\u9fff]+$/.test(w) && CLOUD_STOP_PREFIX.has(w.slice(0, 2))) return;
        if (/^[\u4e00-\u9fff]+$/.test(w)) out.add(w);
      };

      const benefitRes = [
        /(?:支持|内置|集成|搭载|具备|提供|实现|拥有)([^。，！？；、\s]{2,12})/g,
        /(?:免费|免注册|无需|不限|一键|自动|实时|极速|超低|无损|离线|本地)([^。，！？；、\s]{0,10})/g,
        /(?:省流|省内存|省时间|更省|更快|更准|更强|更稳|更易)([^。，！？；、\s]{0,6})?/g,
        /([^。，！？；、\s]{2,8})(?:功能|体验|服务|模式|助手|模型|版本|套餐|权益|优惠|折扣|试用)/g,
        /(?:性价比|准确率|响应速度|推理能力|上下文|多模态|开源|本地化|私有化)([^。，！？；、\s]{0,6})?/g,
        /(?:优势在于|亮点是|特点是|特别适合|解决了|避免了)([^。，！？；、\s]{2,12})/g,
        /(?:赠送|限时|折扣|试用|升级至|解锁)([^。，！？；、\s]{0,10})/g,
      ];

      for (const c of clauses) {
        for (const re of benefitRes) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(c)) !== null) {
            const g1 = (m[1] || '').trim();
            if (g1.length >= 2) pushPhrase(g1);
            const full = String(m[0] || '').replace(/[「」『』"“”]/g, '');
            if (full.length >= 4 && full.length <= 16 && /^[\u4e00-\u9fff]+$/.test(full)) pushPhrase(full);
          }
        }
        if (c.length >= 5 && c.length <= 14 && /^[\u4e00-\u9fff]+$/.test(c)) {
          let bad = 0;
          for (let i = 0; i + 2 <= c.length; i++) {
            if (CLOUD_STOP_BIGRAM.has(c.slice(i, i + 2))) bad++;
          }
          if (bad < c.length * 0.55) pushPhrase(c);
        }
      }

      const enRe = /\b[a-z][a-z0-9][a-z0-9+.-]{2,12}\b/gi;
      let em;
      while ((em = enRe.exec(raw)) !== null) {
        const t = em[0];
        if (/^(the|and|for|com|org|www|http|src)$/i.test(t)) continue;
        out.add(t);
      }
      return [...out];
    };

    const phraseDocCount = new Map();
    for (const d of detections) {
      const phrases = extractWordCloudPhrases(d.summary);
      const oncePerDoc = new Set(phrases);
      for (const p of oncePerDoc) phraseDocCount.set(p, (phraseDocCount.get(p) || 0) + 1);
    }

    const rankedPhrases = [...phraseDocCount.entries()].filter(([t, c]) => {
      if (c < 1) return false;
      if (t.length < 3) return false;
      if (t.length === 3 && c < 2) return false;
      if (/^[\u4e00-\u9fff]+$/.test(t) && CLOUD_STOP_BIGRAM.has(t)) return false;
      return true;
    });

    const pickDiversePhrases = (entries, limit) => {
      const sorted = [...entries].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
      const picked = [];
      for (const [w, c] of sorted) {
        if (picked.some((x) => x.text === w)) continue;
        if (picked.some((x) => x.text.includes(w) && x.text.length > w.length)) continue;
        for (let i = picked.length - 1; i >= 0; i--) {
          if (w.includes(picked[i].text) && w.length > picked[i].text.length) picked.splice(i, 1);
        }
        picked.push({ text: w, c });
        if (picked.length >= limit) break;
      }
      return picked;
    };

    const cloudTop = pickDiversePhrases(rankedPhrases, 28);
    const maxW = cloudTop.length ? Math.max(...cloudTop.map((x) => x.c), 1) : 1;
    const sentimentWordCloud = cloudTop.map(({ text, c }) => {
      let polarity = 'neutral';
      if (negHints.some((h) => text.includes(h))) polarity = 'negative';
      else if (posHints.some((h) => text.includes(h))) polarity = 'positive';
      return { text, weight: c / maxW, polarity };
    });

    // —— 模块 E：智能诊断 ——
    let matrixCompetitorCells = 0;
    for (const pk of Object.keys(matrixData)) {
      for (const ck of Object.keys(matrixData[pk] || {})) {
        const cell = matrixData[pk][ck];
        if (cell === 'rank_tail' || cell === 'not_priority') matrixCompetitorCells++;
      }
    }
    const diagnosticSuggestions = [];
    let seq = 1;
    if (blindIndex >= 50) {
      diagnosticSuggestions.push({
        id: String(seq++),
        accent: 'rose',
        title: `大模型盲区预警：场景词可见度极低（盲区指数 ${blindIndex}%）`,
        diagnosis: `AI 认知诊断：在当前非品牌词检测样本中，约 ${blindIndex}% 未形成有效露出或关联偏弱，场景类、对比类路径的可见度尤为分散，易被竞品内容抢占首位心智。`,
        suggestions: [
          '针对小红书、知乎及垂直行业媒体增加结构化评测与场景化案例内容',
          '统一品牌实体与产品命名表述，减少多别名造成的检索稀释',
        ],
      });
    }
    if (matrixCompetitorCells >= 4) {
      diagnosticSuggestions.push({
        id: String(seq++),
        accent: 'orange',
        title: '竞品拦截风险：摘要中第三方品牌露出偏高',
        diagnosis: 'AI 认知诊断：检测结果摘要中多次出现「推荐 / 首选 / 平替」类表述指向竞品或替代方案，可能分流本品牌在生成式答案中的心智份额。',
        suggestions: [
          '梳理高转化场景下的官方话术与权威背书素材，提升首位推荐概率',
          '对高频竞品对比词布局差异化卖点与可验证数据',
        ],
      });
    }
    if (negativeRate >= 18) {
      diagnosticSuggestions.push({
        id: String(seq++),
        accent: 'orange',
        title: `负面关联偏高（约 ${negativeRate}% 的检测摘要命中风险词）`,
        diagnosis: 'AI 认知诊断：部分摘要与负面词典共现，可能影响用户对品牌安全与可信度的判断。',
        suggestions: [
          '建立舆情关键词监控与正向事实库，在公开渠道主动澄清高频误解点',
        ],
      });
    }
    if (diagnosticSuggestions.length === 0 && totalChecks > 0) {
      diagnosticSuggestions.push({
        id: '1',
        accent: 'rose',
        title: '基线健康：维持内容投放与监测节奏',
        diagnosis: 'AI 认知诊断：当前盲区、竞品与负面指标均未突破高风险阈值，整体处于可维持区间。',
        suggestions: [
          '保持现有 GEO 检测频率，并定期复盘各平台摘要用语变化',
        ],
      });
    }

    // 9. 信源权威数据（用 avgScore 推算）
    const authorityScore = avgScore;
    const sourceData = [
      { type: '权威媒体', count: Math.round(authorityScore * 0.5), pct: Math.round(authorityScore * 0.42), color: '#67c23a' },
      { type: '行业垂直', count: Math.round(authorityScore * 0.4), pct: Math.round(authorityScore * 0.33), color: '#409eff' },
      { type: '自媒体', count: Math.round(authorityScore * 0.2), pct: Math.round(Math.max(0, 25 - authorityScore * 0.06)), color: '#e6a23c' },
      { type: 'UGC / 社区', count: Math.max(0, Math.round(authorityScore * 0.1)), pct: Math.max(0, Math.round(100 - authorityScore * 0.75)), color: '#909399' },
    ];

    // 10. 流失漏斗
    const funnelBaseline = 10000;
    const funnelStages = [
      { key: 'aware', label: '品牌认知', value: funnelBaseline.toLocaleString(), width: 95, lost: Math.round(blindIndex * 0.06), lossColor: '#f56c6c', color: '#67c23a' },
      { key: 'interest', label: '产生兴趣', value: Math.round(funnelBaseline * (1 - blindIndex * 0.006)).toLocaleString(), width: Math.max(40, 75 - blindIndex * 0.3), lost: Math.round(negativeRate * 0.05), lossColor: '#e6a23c', color: '#409eff' },
      { key: 'consider', label: '考虑选择', value: Math.round(funnelBaseline * (1 - blindIndex * 0.006) * (1 - negativeRate * 0.005)).toLocaleString(), width: Math.max(30, 55 - (blindIndex + negativeRate) * 0.2), lost: Math.round((100 - authorityScore) * 0.07), lossColor: '#f56c6c', color: '#7070f0' },
      { key: 'purchase', label: '付费转化', value: Math.max(100, Math.round(funnelBaseline * 0.036 * (authorityScore / 100))).toLocaleString(), width: Math.max(25, 38 - blindIndex * 0.1), lost: 0, lossColor: '#909399', color: '#e6a23c' },
    ];

    res.json({
      success: true,
      healthScore,
      brandName: latestReport?.keyword || '品牌',
      brandDomain: latestReport?.keyword || '',
      checkTime: latestReport?.checkedAt || new Date().toISOString(),
      comparePercent: Math.max(5, 100 - healthScore) + '%',
      kpiDenominator,
      interceptRate,
      blindIndex,
      negativeRate,
      authorityScore,
      intentPaths,
      platforms,
      matrixData,
      modelVisibilityCards,
      emotionData,
      competitorMentions,
      contextTags,
      triggerWords,
      lossTriggerTags,
      sentimentWordCloud,
      diagnosticSuggestions,
      sourceData,
      funnelStages,
      riskLevel: blindIndex >= 50 || negativeRate >= 30 ? 'high' : blindIndex >= 30 || negativeRate >= 15 ? 'mid' : 'low',
      rawData: {
        totalChecks,
        totalKpiDenominator: totalKpi,
        topMentions,
        blindChecks,
        negativeMentions,
        avgScore,
        reportsCount: reports.length
      }
    });
  } catch (err) {
    console.error('geo-health-report error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}; // _LEGACY_geo_health_report_DISABLED

// 启动
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}, version ${BUILD_VERSION}`);
  await cleanupStalePendingAuth();
});
