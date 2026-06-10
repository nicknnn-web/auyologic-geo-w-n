/**
 * 大模型接入管理：密文存库、可编辑、测试连接
 * GET/POST/PUT/DELETE /api/ai-provider-connections
 * POST /api/ai-provider-connections/:id/test
 * GET /api/ai-provider-connections/presets
 * POST/DELETE /api/ai-provider-connections/:id/logo  Logo 上传至 MinIO，logo_relpath 存完整预览 URL
 */
import { Router } from 'express';
import multer from 'multer';
import pool from '../db.js';
import { encryptSecret, decryptSecret, isEncryptionConfigured } from '../services/credentialCrypto.js';
import {
  PROVIDERS,
  getPresetBaseURL,
  createAiClientFromConnectionParams,
  resolveConnectionModel,
} from '../services/aiClientFactory.js';
import { testBochaWebSearch } from '../services/bochaWebSearch.js';
import { getBochaBaseUrlFromEnv } from '../services/bochaCredentials.js';
import {
  resolveAiLogoPublicUrl,
  removeAiLogoStored,
  saveAiLogoFromBuffer,
} from '../utils/aiProviderLogoStorage.js';
import { AI_PROVIDER_SCOPE } from '../constants/aiProviderScope.js';

const router = Router();

const ALLOWED_KEYS = new Set([
  'deepseek',
  'qwen',
  'kimi',
  'glm',
  'openai',
  'chatgpt',
  'gemini',
  'claude',
  'doubao',
  'hunyuan',
  'wenxin',
  'custom',
  'bocha',
]);

function safePathSegment(s) {
  return String(s || 'user')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80) || 'user';
}

/** 合法则返回色值，空串/仅空白返回 null，非法返回 undefined（表示应 400） */
function normalizeLogoBgColor(input) {
  if (input === undefined) return undefined;
  if (input === null) return null;
  const s = String(input).trim();
  if (s === '') return null;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return s;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*[\d.]+\s*)?\)$/.test(s) && s.length < 80) {
    return s;
  }
  return undefined;
}

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      /^image\/(png|jpeg|gif|webp|svg\+xml)$/i.test(file.mimetype) ||
      file.mimetype === 'image/svg+xml';
    if (ok) cb(null, true);
    else cb(new Error('请上传 png / jpg / gif / webp / svg 图片'));
  },
});

function keyLast4(plain) {
  const s = String(plain || '');
  if (s.length >= 4) return s.slice(-4);
  return s || null;
}

function resolveBaseUrl(row) {
  const override = (row.base_url_override || '').trim();
  if (override) return override;
  if (row.provider_key === 'bocha') return getBochaBaseUrlFromEnv();
  if (row.provider_key === 'custom') return '';
  return getPresetBaseURL(row.provider_key) || '';
}

function defaultModelForRow(row) {
  return resolveConnectionModel(row);
}

function toDto(row) {
  if (!row) return null;
  const logoRel = String(row.logo_relpath || '').trim();
  const logoUrl = logoRel ? resolveAiLogoPublicUrl(logoRel) : null;
  const rawBg = row.logo_bg_color;
  const logoBgColor = rawBg != null && String(rawBg).trim() !== '' ? String(rawBg).trim() : null;
  return {
    id: row.id,
    userId: row.user_id,
    vendorName: row.vendor_name,
    providerKey: row.provider_key,
    baseUrlOverride: row.base_url_override || '',
    defaultModel: row.default_model || '',
    enabled: row.enabled,
    keyLast4: row.key_last4 || null,
    lastTestStatus: row.last_test_status,
    lastTestAt: row.last_test_at,
    lastTestMessage: row.last_test_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    logoUrl,
    logoBgColor,
  };
}

/** 全站每种 provider_key 仅允许一条 */
async function existsOtherByProviderKey(providerKey, excludeId) {
  if (excludeId == null) {
    const { rows } = await pool.query(
      `SELECT 1 FROM ai_provider_connection WHERE provider_key = $1 LIMIT 1`,
      [providerKey]
    );
    return rows.length > 0;
  }
  const { rows } = await pool.query(
    `SELECT 1 FROM ai_provider_connection WHERE provider_key = $1 AND id != $2 LIMIT 1`,
    [providerKey, excludeId]
  );
  return rows.length > 0;
}

/** 预设厂商（无密钥，供前端下拉） */
router.get('/ai-provider-connections/presets', (req, res) => {
  const list = Object.entries(PROVIDERS).map(([key, v]) => ({
    providerKey: key,
    label: v.label,
    defaultBaseUrl: v.baseURL,
    defaultModel: v.defaultModel,
  }));
  list.push({
    providerKey: 'custom',
    label: '自定义（OpenAI 兼容）',
    defaultBaseUrl: '',
    defaultModel: 'gpt-4o-mini',
  });
  list.push({
    providerKey: 'bocha',
    label: '博查（信源 Web Search）',
    defaultBaseUrl: getBochaBaseUrlFromEnv(),
    defaultModel: 'web-search',
  });
  res.json({ success: true, presets: list });
});

router.get('/ai-provider-connections', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, vendor_name, provider_key, base_url_override, default_model, enabled,
              key_last4, last_test_status, last_test_at, last_test_message, created_at, updated_at,
              logo_relpath, logo_bg_color
       FROM ai_provider_connection
       ORDER BY id DESC`
    );
    res.json({ success: true, list: rows.map(toDto) });
  } catch (e) {
    console.error('[ai-provider-connections]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/ai-provider-connections/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: '无效 id' });
    }
    const { rows } = await pool.query(
      `SELECT id, user_id, vendor_name, provider_key, base_url_override, default_model, enabled,
              key_last4, last_test_status, last_test_at, last_test_message, created_at, updated_at,
              logo_relpath, logo_bg_color
       FROM ai_provider_connection WHERE id = $1`,
      [id]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: '未找到' });
    }
    res.json({ success: true, data: toDto(rows[0]) });
  } catch (e) {
    console.error('[ai-provider-connections]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/ai-provider-connections', async (req, res) => {
  try {
    const secret = process.env.AI_CREDENTIALS_SECRET;
    if (!isEncryptionConfigured(secret)) {
      return res.status(503).json({
        success: false,
        error: '服务端未配置 AI_CREDENTIALS_SECRET（至少 16 字符），无法安全保存密钥',
      });
    }
    const {
      vendorName,
      providerKey,
      baseUrlOverride,
      defaultModel,
      apiKey,
      enabled = true,
      logoBgColor: logoBgIn,
    } = req.body || {};
    const pk = String(providerKey || '').trim();
    if (!ALLOWED_KEYS.has(pk)) {
      return res.status(400).json({ success: false, error: '无效的 providerKey' });
    }
    const vname = String(vendorName || '').trim();
    if (!vname) {
      return res.status(400).json({ success: false, error: '请填写厂家名称' });
    }
    const apiKeyTrim = String(apiKey || '').trim();
    if (!apiKeyTrim) {
      return res.status(400).json({ success: false, error: '请填写 API Key' });
    }
    const override = String(baseUrlOverride || '').trim();
    if (pk === 'custom' && !override) {
      return res.status(400).json({ success: false, error: '自定义接入须填写 Base URL' });
    }
    if (pk !== 'bocha' && !String(defaultModel || '').trim()) {
      return res.status(400).json({ success: false, error: '请填写模型名（须与厂商控制台一致）' });
    }
    if (await existsOtherByProviderKey(pk, null)) {
      return res.status(400).json({
        success: false,
        error: '该厂商类型已有一条接入，同类型仅允许保留一条。请编辑已有记录或先删除再新增。',
      });
    }
    const lbgN = normalizeLogoBgColor(logoBgIn);
    if (lbgN === undefined && String(logoBgIn || '').trim() !== '') {
      return res.status(400).json({ success: false, error: 'Logo 底色格式无效（请使用 # 开头的 HEX 或 rgb/rgba）' });
    }
    const cipher = encryptSecret(apiKeyTrim, secret);
    const kl4 = keyLast4(apiKeyTrim);
    let dm = String(defaultModel || '').trim();
    if (pk === 'bocha' && !dm) dm = 'web-search';
    const { rows } = await pool.query(
      `INSERT INTO ai_provider_connection (
        user_id, vendor_name, provider_key, base_url_override, api_key_cipher, key_last4,
        default_model, enabled, updated_at, logo_bg_color
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9)
      RETURNING id, user_id, vendor_name, provider_key, base_url_override, default_model, enabled,
                key_last4, last_test_status, last_test_at, last_test_message, created_at, updated_at,
                logo_relpath, logo_bg_color`,
      [AI_PROVIDER_SCOPE, vname, pk, override || null, cipher, kl4, dm || null, !!enabled, lbgN ?? null]
    );
    res.json({ success: true, data: toDto(rows[0]) });
  } catch (e) {
    console.error('[ai-provider-connections]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/ai-provider-connections/:id', async (req, res) => {
  try {
    const secret = process.env.AI_CREDENTIALS_SECRET;
    if (!isEncryptionConfigured(secret)) {
      return res.status(503).json({
        success: false,
        error: '服务端未配置 AI_CREDENTIALS_SECRET',
      });
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: '无效 id' });
    }
    const {
      vendorName,
      providerKey,
      baseUrlOverride,
      defaultModel,
      apiKey,
      enabled,
      logoBgColor: logoBgIn,
    } = req.body || {};

    const { rows: exist } = await pool.query(
      `SELECT * FROM ai_provider_connection WHERE id = $1`,
      [id]
    );
    if (!exist[0]) {
      return res.status(404).json({ success: false, error: '未找到' });
    }

    const pk = providerKey != null ? String(providerKey).trim() : exist[0].provider_key;
    if (!ALLOWED_KEYS.has(pk)) {
      return res.status(400).json({ success: false, error: '无效的 providerKey' });
    }
    const vname = vendorName != null ? String(vendorName).trim() : exist[0].vendor_name;
    if (!vname) {
      return res.status(400).json({ success: false, error: '请填写厂家名称' });
    }
    const override =
      baseUrlOverride !== undefined
        ? String(baseUrlOverride || '').trim()
        : (exist[0].base_url_override || '');
    if (pk === 'custom' && !override) {
      return res.status(400).json({ success: false, error: '自定义接入须填写 Base URL' });
    }
    if (await existsOtherByProviderKey(pk, id)) {
      return res.status(400).json({
        success: false,
        error: '已存在同厂商类型的其他接入，同类型仅允许保留一条。请选择其它类型或编辑已有记录。',
      });
    }
    const dm =
      defaultModel !== undefined
        ? String(defaultModel || '').trim()
        : (exist[0].default_model || '');
    if (pk !== 'bocha' && !dm) {
      return res.status(400).json({ success: false, error: '请填写模型名（须与厂商控制台一致）' });
    }
    const en = enabled !== undefined ? !!enabled : exist[0].enabled;

    let nextLogoBg = exist[0].logo_bg_color;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'logoBgColor')) {
      const lbgN = normalizeLogoBgColor(logoBgIn);
      if (lbgN === undefined && String(logoBgIn || '').trim() !== '') {
        return res.status(400).json({ success: false, error: 'Logo 底色格式无效（请使用 # 开头的 HEX 或 rgb/rgba）' });
      }
      nextLogoBg = lbgN ?? null;
    }

    let cipher = exist[0].api_key_cipher;
    let kl4 = exist[0].key_last4;
    if (apiKey != null && String(apiKey).trim() !== '') {
      const apiKeyTrim = String(apiKey).trim();
      cipher = encryptSecret(apiKeyTrim, secret);
      kl4 = keyLast4(apiKeyTrim);
    }

    const { rows } = await pool.query(
      `UPDATE ai_provider_connection SET
        vendor_name = $1,
        provider_key = $2,
        base_url_override = $3,
        api_key_cipher = $4,
        key_last4 = $5,
        default_model = $6,
        enabled = $7,
        logo_bg_color = $8,
        updated_at = NOW()
      WHERE id = $9
      RETURNING id, user_id, vendor_name, provider_key, base_url_override, default_model, enabled,
                key_last4, last_test_status, last_test_at, last_test_message, created_at, updated_at,
                logo_relpath, logo_bg_color`,
      [vname, pk, override || null, cipher, kl4, dm || null, en, nextLogoBg, id]
    );
    res.json({ success: true, data: toDto(rows[0]) });
  } catch (e) {
    console.error('[ai-provider-connections]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/ai-provider-connections/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: '无效 id' });
    }
    const del = await pool.query(
      `DELETE FROM ai_provider_connection WHERE id = $1 RETURNING id, logo_relpath`,
      [id]
    );
    if (!del.rowCount) {
      return res.status(404).json({ success: false, error: '未找到' });
    }
    const rel = del.rows[0]?.logo_relpath;
    if (rel) removeAiLogoStored(rel);
    res.json({ success: true });
  } catch (e) {
    console.error('[ai-provider-connections]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/ai-provider-connections/:id/test', async (req, res) => {
  try {
    const secret = process.env.AI_CREDENTIALS_SECRET;
    if (!isEncryptionConfigured(secret)) {
      return res.status(503).json({ success: false, error: '服务端未配置 AI_CREDENTIALS_SECRET' });
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: '无效 id' });
    }
    const { rows } = await pool.query(
      `SELECT * FROM ai_provider_connection WHERE id = $1`,
      [id]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ success: false, error: '未找到' });
    }
    const baseURL = resolveBaseUrl(row);
    if (!baseURL && row.provider_key !== 'bocha') {
      await pool.query(
        `UPDATE ai_provider_connection SET last_test_status = $1, last_test_message = $2, last_test_at = NOW(), updated_at = NOW() WHERE id = $3`,
        ['fail', '无法解析 Base URL，请检查预设或自定义地址', id]
      );
      return res.json({ success: false, ok: false, message: '无法解析 Base URL' });
    }
    let apiKey;
    try {
      apiKey = decryptSecret(row.api_key_cipher, secret);
    } catch (err) {
      await pool.query(
        `UPDATE ai_provider_connection SET last_test_status = $1, last_test_message = $2, last_test_at = NOW(), updated_at = NOW() WHERE id = $3`,
        ['fail', '密钥解密失败，请检查 AI_CREDENTIALS_SECRET 是否与写入时一致', id]
      );
      return res.status(500).json({ success: false, ok: false, error: '密钥解密失败' });
    }

    if (row.provider_key === 'bocha') {
      try {
        const result = await testBochaWebSearch({
          apiKey,
          baseUrl: baseURL || getBochaBaseUrlFromEnv(),
          query: '连接测试',
        });
        const n = (result.hits || []).length;
        const msg = `连接成功，返回 ${n} 条网页结果`;
        await pool.query(
          `UPDATE ai_provider_connection SET last_test_status = $1, last_test_message = $2, last_test_at = NOW(), updated_at = NOW() WHERE id = $3`,
          ['ok', msg, id]
        );
        return res.json({ success: true, ok: true, message: msg });
      } catch (err) {
        const msg = err?.message || String(err);
        await pool.query(
          `UPDATE ai_provider_connection SET last_test_status = $1, last_test_message = $2, last_test_at = NOW(), updated_at = NOW() WHERE id = $3`,
          ['fail', msg.slice(0, 2000), id]
        );
        return res.json({ success: true, ok: false, message: msg });
      }
    }

    if (!baseURL) {
      await pool.query(
        `UPDATE ai_provider_connection SET last_test_status = $1, last_test_message = $2, last_test_at = NOW(), updated_at = NOW() WHERE id = $3`,
        ['fail', '无法解析 Base URL，请检查预设或自定义地址', id]
      );
      return res.json({ success: false, ok: false, message: '无法解析 Base URL' });
    }
    const client = createAiClientFromConnectionParams({
      providerKey: row.provider_key,
      baseURL,
      apiKey,
      defaultModel: defaultModelForRow(row),
    });
    try {
      await client.chat([{ role: 'user', content: 'hi' }], { maxTokens: 8, temperature: 0 });
      await pool.query(
        `UPDATE ai_provider_connection SET last_test_status = $1, last_test_message = $2, last_test_at = NOW(), updated_at = NOW() WHERE id = $3`,
        ['ok', '连接成功', id]
      );
      res.json({ success: true, ok: true, message: '连接成功' });
    } catch (err) {
      const msg = err?.message || String(err);
      await pool.query(
        `UPDATE ai_provider_connection SET last_test_status = $1, last_test_message = $2, last_test_at = NOW(), updated_at = NOW() WHERE id = $3`,
        ['fail', msg.slice(0, 2000), id]
      );
      res.json({ success: true, ok: false, message: msg });
    }
  } catch (e) {
    console.error('[ai-provider-connections test]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/** 自定义问题试跑：大模型返回对话内容；博查返回检索摘要（不写 last_test_status） */
router.post('/ai-provider-connections/:id/try-prompt', async (req, res) => {
  try {
    const secret = process.env.AI_CREDENTIALS_SECRET;
    if (!isEncryptionConfigured(secret)) {
      return res.status(503).json({
        success: false,
        error: '服务端未配置 AI_CREDENTIALS_SECRET（至少 16 字符）',
      });
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: '无效 id' });
    }
    const prompt = String(req.body?.prompt ?? req.body?.message ?? '').trim();
    if (!prompt) {
      return res.status(400).json({ success: false, error: '请填写测试问题' });
    }
    let maxTokens = parseInt(String(req.body?.maxTokens ?? req.body?.max_tokens ?? '2048'), 10);
    if (!Number.isFinite(maxTokens) || maxTokens < 1) maxTokens = 2048;
    maxTokens = Math.min(maxTokens, 8192);

    const { rows } = await pool.query(
      `SELECT * FROM ai_provider_connection WHERE id = $1`,
      [id]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ success: false, error: '未找到' });
    }

    const baseURL = resolveBaseUrl(row);
    let apiKey;
    try {
      apiKey = decryptSecret(row.api_key_cipher, secret);
    } catch (err) {
      return res.status(500).json({ success: false, ok: false, error: '密钥解密失败' });
    }

    const vendorName = row.vendor_name;
    const providerKey = row.provider_key;
    if (providerKey === 'bocha') {
      try {
        const result = await testBochaWebSearch({
          apiKey,
          baseUrl: baseURL || getBochaBaseUrlFromEnv(),
          query: prompt,
        });
        const hits = result.hits || [];
        const lines = hits.slice(0, 8).map((h, i) => {
          const title = h.title || h.name || '无标题';
          const url = h.url || '';
          return `${i + 1}. ${title}${url ? `\n   ${url}` : ''}`;
        });
        const content =
          lines.length > 0
            ? `检索「${prompt}」共 ${hits.length} 条（展示前 ${lines.length} 条）：\n\n${lines.join('\n\n')}`
            : `检索「${prompt}」未返回网页结果。`;
        return res.json({
          success: true,
          ok: true,
          content,
          vendorName,
          providerKey,
          model: 'web-search',
        });
      } catch (err) {
        return res.json({
          success: true,
          ok: false,
          error: err?.message || String(err),
          vendorName,
          providerKey,
        });
      }
    }

    if (!baseURL) {
      return res.json({ success: false, ok: false, error: '无法解析 Base URL' });
    }

    const configuredModel = defaultModelForRow(row);
    const client = createAiClientFromConnectionParams({
      providerKey: row.provider_key,
      baseURL,
      apiKey,
      defaultModel: configuredModel,
    });
    try {
      const result = await client.chat([{ role: 'user', content: prompt }], {
        maxTokens,
        temperature: 0.7,
      });
      const content = String(result?.content ?? '').trim();
      if (!content) {
        return res.json({
          success: true,
          ok: false,
          error: '模型返回内容为空',
          vendorName,
          providerKey,
          model: configuredModel,
        });
      }
      return res.json({
        success: true,
        ok: true,
        content,
        vendorName,
        providerKey,
        model: configuredModel,
      });
    } catch (err) {
      return res.json({
        success: true,
        ok: false,
        error: err?.message || String(err),
        vendorName,
        providerKey,
        model: configuredModel,
      });
    }
  } catch (e) {
    console.error('[ai-provider-connections try-prompt]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post(
  '/ai-provider-connections/:id/logo',
  (req, res, next) => {
    logoUpload.single('logo')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, error: err.message || '上传失败' });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, error: '无效 id' });
      }
      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, error: '请选择图片文件' });
      }
      const { rows: exist } = await pool.query(
        `SELECT id, logo_relpath FROM ai_provider_connection WHERE id = $1`,
        [id]
      );
      if (!exist[0]) {
        return res.status(404).json({ success: false, error: '未找到' });
      }
      const oldRel = exist[0].logo_relpath;
      let stored;
      try {
        stored = await saveAiLogoFromBuffer({
          userId: AI_PROVIDER_SCOPE,
          connectionId: id,
          originalName: req.file.originalname,
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
        });
      } catch (upErr) {
        console.error('[ai-provider-connections logo] upload', upErr);
        return res.status(500).json({ success: false, error: upErr.message || '上传存储失败' });
      }
      let rows;
      try {
        const upd = await pool.query(
          `UPDATE ai_provider_connection SET logo_relpath = $1, updated_at = NOW()
           WHERE id = $2
           RETURNING id, user_id, vendor_name, provider_key, base_url_override, default_model, enabled,
                     key_last4, last_test_status, last_test_at, last_test_message, created_at, updated_at,
                     logo_relpath, logo_bg_color`,
          [stored, id]
        );
        rows = upd.rows;
      } catch (dbErr) {
        removeAiLogoStored(stored);
        throw dbErr;
      }
      if (oldRel && oldRel !== stored) removeAiLogoStored(oldRel);
      res.json({ success: true, data: toDto(rows[0]) });
    } catch (e) {
      console.error('[ai-provider-connections logo]', e);
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

router.delete('/ai-provider-connections/:id/logo', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, error: '无效 id' });
    }
    const sel = await pool.query(
      `SELECT id, logo_relpath FROM ai_provider_connection WHERE id = $1`,
      [id]
    );
    if (!sel.rows[0]) {
      return res.status(404).json({ success: false, error: '未找到' });
    }
    const oldRel = sel.rows[0].logo_relpath;
    await pool.query(
      `UPDATE ai_provider_connection SET logo_relpath = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    if (oldRel) removeAiLogoStored(oldRel);
    const { rows: again } = await pool.query(
      `SELECT id, user_id, vendor_name, provider_key, base_url_override, default_model, enabled,
              key_last4, last_test_status, last_test_at, last_test_message, created_at, updated_at,
              logo_relpath, logo_bg_color
       FROM ai_provider_connection WHERE id = $1`,
      [id]
    );
    res.json({ success: true, data: toDto(again[0]) });
  } catch (e) {
    console.error('[ai-provider-connections logo delete]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
