/**
 * 统一 AI 客户端工厂
 *
 * 支持所有兼容 OpenAI Chat Completions API 的大模型平台。
 * 新增模型：只需在 PROVIDERS 里加一条记录 + 对应环境变量即可，业务代码无需改动。
 *
 * 使用方式：
 *   import { createAiClient, resolveProbeModels, ANALYSIS_PROVIDER } from './aiClientFactory.js'
 *   const client = createAiClient('deepseek')
 *   const { content, usage } = await client.chat(messages, { maxTokens: 2048, temperature: 0.3 })
 */

import OpenAI from 'openai';
import { decryptSecret, isEncryptionConfigured } from './credentialCrypto.js';

/**
 * 已知提供商注册表。
 * provider key 同时用于环境变量前缀和配置文件里的 PROBE_MODELS 值。
 */
export const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
  },
  qwen: {
    label: '通义千问',
    baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'QWEN_API_KEY',
    defaultModel: 'qwen-max',
  },
  kimi: {
    label: 'Kimi',
    baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
    apiKeyEnv: 'KIMI_API_KEY',
    defaultModel: 'moonshot-v1-8k',
  },
  glm: {
    label: '智谱GLM',
    baseURL: process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/',
    apiKeyEnv: 'GLM_API_KEY',
    defaultModel: 'glm-4',
  },
  openai: {
    label: 'OpenAI',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
  },
  /** 豆包 / 火山方舟 — OpenAI 兼容 */
  doubao: {
    label: '豆包（火山方舟）',
    baseURL: process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    apiKeyEnv: 'DOUBAO_API_KEY',
    defaultModel: process.env.DOUBAO_DEFAULT_MODEL || 'doubao-seed-1-6-251015',
  },
};

/**
 * 根据预设 key 取默认 Base URL（不含用户覆盖）
 * @param {string} providerKey
 * @returns {string|null}
 */
export function getPresetBaseURL(providerKey) {
  const cfg = PROVIDERS[providerKey];
  return cfg?.baseURL ?? null;
}

/**
 * 解析连接行的最终 baseURL：override 优先，否则使用预设。
 * @param {{ provider_key: string, base_url_override?: string|null }} row
 * @returns {string}
 */
export function resolveConnectionBaseURL(row) {
  const override = String(row?.base_url_override || '').trim();
  if (override) return override;
  if (row?.provider_key === 'custom') return '';
  return getPresetBaseURL(row?.provider_key) || '';
}

/**
 * 解析连接行的最终模型名：default_model 优先，否则使用预设。
 */
export function resolveConnectionModel(row) {
  const m = String(row?.default_model || '').trim();
  if (m) return m;
  return PROVIDERS[row?.provider_key]?.defaultModel || 'gpt-4o-mini';
}

/**
 * 按 ai_provider_connection.id 取出密文 → 解密 → 创建 OpenAI 兼容客户端。
 * 完全不依赖环境变量中的厂商 API Key。
 *
 * @param {object} pool - pg Pool
 * @param {number} connectionId
 * @param {object} [opts]
 * @param {string} [opts.userId] - 若提供，会校验连接归属
 * @returns {Promise<{ chat: Function, model: string, vendorName: string, providerKey: string, connectionId: number }>}
 */
export async function createAiClientByConnectionId(pool, connectionId, opts = {}) {
  const cid = Number(connectionId);
  if (!Number.isFinite(cid) || cid <= 0) {
    throw new Error(`无效的 connectionId: ${connectionId}`);
  }
  const secret = process.env.AI_CREDENTIALS_SECRET;
  if (!isEncryptionConfigured(secret)) {
    throw new Error('服务端未配置 AI_CREDENTIALS_SECRET，无法解密 API Key');
  }
  const params = [cid];
  let sql = `SELECT id, user_id, vendor_name, provider_key, base_url_override, api_key_cipher,
                    default_model, enabled
             FROM ai_provider_connection WHERE id = $1`;
  if (opts.userId) {
    sql += ' AND user_id = $2';
    params.push(opts.userId);
  }
  const { rows } = await pool.query(sql, params);
  const row = rows[0];
  if (!row) throw new Error(`找不到大模型连接（id=${cid}）`);
  if (row.enabled === false) {
    throw new Error(`大模型连接已禁用：${row.vendor_name}（id=${cid}）`);
  }

  const baseURL = resolveConnectionBaseURL(row);
  if (!baseURL) {
    throw new Error(`连接 ${row.vendor_name} 未能解析 Base URL（custom 类型须填 base_url_override）`);
  }
  const apiKey = decryptSecret(row.api_key_cipher, secret);
  if (!apiKey) {
    throw new Error(`连接 ${row.vendor_name} 的 API Key 解密为空`);
  }
  const defaultModel = resolveConnectionModel(row);
  const client = createOpenAiCompatibleClient({ baseURL, apiKey, defaultModel });
  return {
    chat: client.chat,
    model: defaultModel,
    vendorName: row.vendor_name,
    providerKey: row.provider_key,
    connectionId: cid,
  };
}

/**
 * 批量按 ID 列表预实例化客户端（任务内复用，避免重复解密）。
 * 任一失败抛错（带连接信息），由调用方处理。
 *
 * @param {object} pool
 * @param {number[]} ids
 * @param {{ userId?: string }} [opts]
 * @returns {Promise<Map<number, { chat, model, vendorName, providerKey, connectionId }>>}
 */
export async function createAiClientsByIds(pool, ids, opts = {}) {
  const map = new Map();
  for (const id of ids) {
    const cli = await createAiClientByConnectionId(pool, id, opts);
    map.set(cli.connectionId, cli);
  }
  return map;
}

/**
 * 使用任意 baseURL + apiKey 创建与 createAiClient 相同接口的客户端（OpenAI 兼容）
 */
export function createOpenAiCompatibleClient({ baseURL, apiKey, defaultModel = 'gpt-4o-mini' }) {
  if (!apiKey) throw new Error('apiKey 不能为空');
  if (!baseURL || !String(baseURL).trim()) throw new Error('baseURL 不能为空');
  const openaiClient = new OpenAI({
    apiKey: String(apiKey).trim(),
    baseURL: String(baseURL).trim(),
    // 默认 90s 单次请求超时；具体业务可在 chat() 里 timeoutMs 覆盖
    timeout: 90_000,
    maxRetries: 1,
  });
  const model = defaultModel || 'gpt-4o-mini';
  return {
    provider: 'custom',
    model,
    /**
     * @param {Array} messages
     * @param {{ model?:string, maxTokens?:number, temperature?:number, signal?:AbortSignal, timeoutMs?:number }} opts
     */
    async chat(messages, opts = {}) {
      const {
        model: m = model,
        maxTokens = 4096,
        temperature = 0.3,
        signal: externalSignal,
        timeoutMs,
      } = opts;

      const ac = new AbortController();
      let timer = null;
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timer = setTimeout(() => {
          try { ac.abort(new Error(`AI 请求超时（${timeoutMs}ms）`)); } catch { /* ignore */ }
        }, timeoutMs);
      }
      if (externalSignal) {
        if (externalSignal.aborted) {
          if (timer) clearTimeout(timer);
          throw externalSignal.reason || new Error('请求已被取消');
        }
        externalSignal.addEventListener(
          'abort',
          () => {
            try { ac.abort(externalSignal.reason || new Error('请求已被取消')); } catch { /* ignore */ }
          },
          { once: true }
        );
      }

      try {
        const response = await openaiClient.chat.completions.create(
          {
            model: m,
            messages,
            max_tokens: maxTokens,
            temperature,
          },
          { signal: ac.signal }
        );
        const content = response.choices?.[0]?.message?.content ?? '';
        return { content, usage: response.usage ?? null };
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}

/**
 * 创建统一 AI 客户端。
 * 返回对象只暴露一个方法 chat()，业务层无需关心底层 SDK 细节。
 *
 * @param {string} provider - PROVIDERS 里的 key，如 'deepseek'
 * @returns {{ chat(messages, opts?): Promise<{ content: string, usage: object|null }>, provider: string, model: string }}
 */
export function createAiClient(provider) {
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    throw new Error(
      `未知的 AI provider: "${provider}"，可用值：${Object.keys(PROVIDERS).join(', ')}`
    );
  }

  const apiKey = process.env[cfg.apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `provider "${provider}" 需要环境变量 ${cfg.apiKeyEnv}，当前未配置`
    );
  }

  const openaiClient = new OpenAI({ apiKey, baseURL: cfg.baseURL });
  const defaultModel = cfg.defaultModel;

  return {
    provider,
    model: defaultModel,

    /**
     * 发起一次对话。
     *
     * @param {Array<{role: string, content: string}>} messages
     * @param {{ model?: string, maxTokens?: number, temperature?: number }} opts
     * @returns {Promise<{ content: string, usage: object|null }>}
     */
    async chat(messages, opts = {}) {
      const { model = defaultModel, maxTokens = 4096, temperature = 0.3 } = opts;
      const response = await openaiClient.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      });
      const content = response.choices?.[0]?.message?.content ?? '';
      return { content, usage: response.usage ?? null };
    },
  };
}

/**
 * 便捷方法：systemPrompt + userPrompt → content
 * 等价于原来的 chatDeepseek()，兼容旧调用方式。
 */
export async function chatWithProvider(provider, { systemPrompt, userPrompt, model, maxTokens, temperature } = {}) {
  const client = createAiClient(provider);
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });
  return client.chat(messages, { model, maxTokens, temperature });
}

/**
 * 检查某 provider 是否已配置 API Key（不会抛错，只返回 boolean）
 */
export function isProviderConfigured(provider) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return false;
  return !!process.env[cfg.apiKeyEnv];
}
