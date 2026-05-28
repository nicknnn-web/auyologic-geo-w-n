/**
 * 统一 AI 客户端工厂
 *
 * 国内厂商：OpenAI 兼容 Chat Completions。
 * ChatGPT / OpenAI：Responses API（client.responses.create）。
 * Gemini：@google/genai（models.generateContent）。
 * Claude：Anthropic Messages API（/v1/messages）。
 *
 * 使用方式：
 *   const client = await createAiClientByConnectionId(pool, id)
 *   const { content } = await client.chat(messages, { maxTokens: 2048 })
 */

import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { decryptSecret, isEncryptionConfigured } from './credentialCrypto.js';

/**
 * 已知提供商注册表。
 */
export const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-v4-flash',
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
    defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini',
    nativeApi: 'openai-responses',
  },
  chatgpt: {
    label: 'ChatGPT',
    baseURL:
      process.env.CHATGPT_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      'https://api.openai.com/v1',
    apiKeyEnv: 'CHATGPT_API_KEY',
    apiKeyEnvFallback: 'OPENAI_API_KEY',
    defaultModel: process.env.CHATGPT_DEFAULT_MODEL || 'gpt-5.5',
    nativeApi: 'openai-responses',
  },
  gemini: {
    label: 'Google Gemini',
    apiKeyEnv: 'GEMINI_API_KEY',
    apiKeyEnvFallback: 'GOOGLE_API_KEY',
    defaultModel: process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.5-flash',
    nativeApi: 'gemini',
  },
  claude: {
    label: 'Claude (Anthropic)',
    baseURL: process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com',
    apiKeyEnv: 'CLAUDE_API_KEY',
    apiKeyEnvFallback: 'ANTHROPIC_API_KEY',
    defaultModel: process.env.CLAUDE_DEFAULT_MODEL || 'claude-opus-4-7',
    nativeApi: 'anthropic',
  },
  doubao: {
    label: '豆包',
    baseURL: process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    apiKeyEnv: 'DOUBAO_API_KEY',
    defaultModel: process.env.DOUBAO_DEFAULT_MODEL || 'doubao-seed-1-6-251015',
  },
  hunyuan: {
    label: '腾讯元宝（混元）',
    baseURL: process.env.HUNYUAN_BASE_URL || 'https://api.hunyuan.cloud.tencent.com/v1',
    apiKeyEnv: 'HUNYUAN_API_KEY',
    defaultModel: process.env.HUNYUAN_DEFAULT_MODEL || 'hunyuan-turbos-latest',
  },
  wenxin: {
    label: '文心一言（千帆）',
    baseURL: process.env.WENXIN_BASE_URL || 'https://qianfan.baidubce.com/v2',
    apiKeyEnv: 'WENXIN_API_KEY',
    defaultModel: process.env.WENXIN_DEFAULT_MODEL || 'ernie-4.0-turbo-8k',
  },
};

export function getPresetBaseURL(providerKey) {
  const cfg = PROVIDERS[providerKey];
  return cfg?.baseURL ?? null;
}

export function resolveConnectionBaseURL(row) {
  const override = String(row?.base_url_override || '').trim();
  if (override) return override;
  if (row?.provider_key === 'custom') return '';
  return getPresetBaseURL(row?.provider_key) || '';
}

export function resolveConnectionModel(row) {
  const m = String(row?.default_model || '').trim();
  if (m) return m;
  return PROVIDERS[row?.provider_key]?.defaultModel || 'gpt-4o-mini';
}

/** 连接是否可不配置 Base URL（走官方 SDK 默认端点） */
export function connectionAllowsEmptyBaseURL(providerKey) {
  return (
    usesGeminiNativeApi(providerKey) ||
    usesAnthropicNativeApi(providerKey) ||
    usesOpenAiResponsesApi(providerKey)
  );
}

export function usesAnthropicNativeApi(providerKey) {
  return providerKey === 'claude' || PROVIDERS[providerKey]?.nativeApi === 'anthropic';
}

export function usesGeminiNativeApi(providerKey) {
  return providerKey === 'gemini' || PROVIDERS[providerKey]?.nativeApi === 'gemini';
}

export function usesOpenAiResponsesApi(providerKey) {
  const api = PROVIDERS[providerKey]?.nativeApi;
  return api === 'openai-responses' || providerKey === 'chatgpt';
}

function resolveProviderApiKey(cfg, providerKey) {
  let key = process.env[cfg.apiKeyEnv];
  if (!key && cfg.apiKeyEnvFallback) {
    key = process.env[cfg.apiKeyEnvFallback];
  }
  if (!key && providerKey === 'chatgpt') {
    key = process.env.OPENAI_API_KEY;
  }
  return key;
}

function attachAbortHandling(externalSignal, timeoutMs) {
  const ac = new AbortController();
  let timer = null;
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      try {
        ac.abort(new Error(`AI 请求超时（${timeoutMs}ms）`));
      } catch {
        /* ignore */
      }
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
        try {
          ac.abort(externalSignal.reason || new Error('请求已被取消'));
        } catch {
          /* ignore */
        }
      },
      { once: true }
    );
  }
  return {
    signal: ac.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

function toAnthropicPayload(messages) {
  let system;
  const out = [];
  for (const m of messages || []) {
    const role = m?.role;
    const content = String(m?.content ?? '');
    if (role === 'system') {
      system = system ? `${system}\n\n${content}` : content;
      continue;
    }
    if (role === 'user' || role === 'assistant') {
      out.push({ role, content });
    }
  }
  if (!out.length) out.push({ role: 'user', content: 'hi' });
  return { system, messages: out };
}

/** OpenAI Responses API：instructions + input */
function messagesToResponsesParams(messages) {
  let instructions;
  const turns = [];
  for (const m of messages || []) {
    const text = String(m?.content ?? '');
    if (!text) continue;
    if (m.role === 'system') {
      instructions = instructions ? `${instructions}\n\n${text}` : text;
    } else if (m.role === 'user' || m.role === 'assistant') {
      turns.push({
        role: m.role,
        content: text,
      });
    }
  }
  if (!turns.length) {
    return { instructions, input: 'hi' };
  }
  if (turns.length === 1 && turns[0].role === 'user') {
    return { instructions, input: turns[0].content };
  }
  return { instructions, input: turns };
}

/** Gemini generateContent：systemInstruction + contents */
function messagesToGeminiPayload(messages) {
  let systemInstruction;
  const contents = [];
  for (const m of messages || []) {
    const text = String(m?.content ?? '');
    if (!text) continue;
    if (m.role === 'system') {
      systemInstruction = systemInstruction ? `${systemInstruction}\n\n${text}` : text;
      continue;
    }
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text }] });
    } else if (m.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text }] });
    }
  }
  if (!contents.length) {
    contents.push({ role: 'user', parts: [{ text: 'hi' }] });
  }
  return { systemInstruction, contents };
}

/**
 * Anthropic Claude — POST /v1/messages
 * @see https://docs.anthropic.com/en/api/messages
 */
export function createAnthropicClient({ baseURL, apiKey, defaultModel = 'claude-opus-4-7' }) {
  if (!apiKey) throw new Error('apiKey 不能为空');
  const root = String(baseURL || 'https://api.anthropic.com').replace(/\/$/, '');
  const endpoint = root.endsWith('/v1') ? `${root}/messages` : `${root}/v1/messages`;
  const model = defaultModel || 'claude-opus-4-7';

  return {
    provider: 'claude',
    model,
    async chat(messages, opts = {}) {
      const {
        model: m = model,
        maxTokens = 4096,
        temperature = 0.3,
        signal: externalSignal,
        timeoutMs,
      } = opts;

      const { system, messages: anthropicMessages } = toAnthropicPayload(messages);
      const body = {
        model: m,
        max_tokens: maxTokens,
        temperature,
        messages: anthropicMessages,
      };
      if (system) body.system = system;

      const { signal, cleanup } = attachAbortHandling(externalSignal, timeoutMs);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': String(apiKey).trim(),
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal,
        });
        const raw = await res.text();
        if (!res.ok) {
          throw new Error(`Claude API ${res.status}: ${raw.slice(0, 800)}`);
        }
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error('Claude API 返回非 JSON');
        }
        const content =
          (data.content || [])
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('') || '';
        return { content, usage: data.usage ?? null };
      } finally {
        cleanup();
      }
    },
  };
}

/**
 * OpenAI ChatGPT — Responses API（client.responses.create + output_text）
 */
export function createOpenAiResponsesClient({ apiKey, baseURL, defaultModel = 'gpt-5.5' }) {
  if (!apiKey) throw new Error('apiKey 不能为空');
  const clientOpts = {
    apiKey: String(apiKey).trim(),
    timeout: 90_000,
    maxRetries: 1,
  };
  const base = String(baseURL || '').trim();
  if (base) clientOpts.baseURL = base;
  const openaiClient = new OpenAI(clientOpts);
  const model = defaultModel || 'gpt-5.5';

  return {
    provider: 'chatgpt',
    model,
    async chat(messages, opts = {}) {
      const {
        model: m = model,
        maxTokens = 4096,
        signal: externalSignal,
        timeoutMs,
      } = opts;

      const { instructions, input } = messagesToResponsesParams(messages);
      const { signal, cleanup } = attachAbortHandling(externalSignal, timeoutMs);
      try {
        const response = await openaiClient.responses.create(
          {
            model: m,
            input,
            ...(instructions ? { instructions } : {}),
            max_output_tokens: maxTokens,
          },
          { signal }
        );
        const content = response.output_text ?? '';
        return { content, usage: response.usage ?? null };
      } finally {
        cleanup();
      }
    },
  };
}

/**
 * Google Gemini — @google/genai
 */
export function createGeminiClient({ apiKey, defaultModel = 'gemini-2.5-flash' }) {
  if (!apiKey) throw new Error('apiKey 不能为空');
  const ai = new GoogleGenAI({ apiKey: String(apiKey).trim() });
  const model = defaultModel || 'gemini-2.5-flash';

  return {
    provider: 'gemini',
    model,
    async chat(messages, opts = {}) {
      const {
        model: m = model,
        maxTokens = 4096,
        temperature = 0.3,
        signal: externalSignal,
        timeoutMs,
      } = opts;

      const { systemInstruction, contents } = messagesToGeminiPayload(messages);
      const { signal, cleanup } = attachAbortHandling(externalSignal, timeoutMs);
      try {
        const response = await ai.models.generateContent({
          model: m,
          contents,
          config: {
            maxOutputTokens: maxTokens,
            temperature,
            ...(systemInstruction ? { systemInstruction } : {}),
            abortSignal: signal,
          },
        });
        const content = response.text ?? '';
        return { content, usage: response.usageMetadata ?? null };
      } finally {
        cleanup();
      }
    },
  };
}

/**
 * 按接入配置创建统一 chat 客户端
 */
export function createAiClientFromConnectionParams({
  providerKey,
  baseURL,
  apiKey,
  defaultModel = 'gpt-4o-mini',
}) {
  if (usesAnthropicNativeApi(providerKey)) {
    return createAnthropicClient({
      baseURL: baseURL || getPresetBaseURL('claude'),
      apiKey,
      defaultModel,
    });
  }
  if (usesGeminiNativeApi(providerKey)) {
    return createGeminiClient({ apiKey, defaultModel });
  }
  if (usesOpenAiResponsesApi(providerKey)) {
    return createOpenAiResponsesClient({
      apiKey,
      baseURL: baseURL || getPresetBaseURL(providerKey) || undefined,
      defaultModel,
    });
  }
  if (!baseURL || !String(baseURL).trim()) {
    throw new Error('baseURL 不能为空（OpenAI 兼容接入须配置 Base URL）');
  }
  return createOpenAiCompatibleClient({ baseURL, apiKey, defaultModel, providerKey });
}

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

  const pk = row.provider_key;
  const baseURL = resolveConnectionBaseURL(row);
  if (!baseURL && !connectionAllowsEmptyBaseURL(pk)) {
    throw new Error(`连接 ${row.vendor_name} 未能解析 Base URL（custom 类型须填 base_url_override）`);
  }
  if (pk === 'custom' && !baseURL) {
    throw new Error(`连接 ${row.vendor_name} 为自定义类型，须填写 Base URL`);
  }

  const apiKey = decryptSecret(row.api_key_cipher, secret);
  if (!apiKey) {
    throw new Error(`连接 ${row.vendor_name} 的 API Key 解密为空`);
  }
  const defaultModel = resolveConnectionModel(row);
  const client = createAiClientFromConnectionParams({
    providerKey: pk,
    baseURL,
    apiKey,
    defaultModel,
  });
  return {
    chat: client.chat,
    model: defaultModel,
    vendorName: row.vendor_name,
    providerKey: pk,
    connectionId: cid,
  };
}

export async function createAiClientsByIds(pool, ids, opts = {}) {
  const map = new Map();
  for (const id of ids) {
    const cli = await createAiClientByConnectionId(pool, id, opts);
    map.set(cli.connectionId, cli);
  }
  return map;
}

export function usesDeepSeekProvider(providerKey) {
  return String(providerKey || '').trim() === 'deepseek';
}

/** 在 messages 前插入 system（若尚无 system） */
export function mergeSystemMessage(messages, systemContent) {
  const list = Array.isArray(messages) ? [...messages] : [];
  const sys = String(systemContent || '').trim();
  if (!sys) return list;
  if (list.some((m) => m?.role === 'system')) return list;
  return [{ role: 'system', content: sys }, ...list];
}

/**
 * 组装 Chat Completions 请求体（DeepSeek V4 支持 thinking / reasoning_effort）
 * @see https://api-docs.deepseek.com/guides/thinking_mode
 */
export function buildChatCompletionRequestBody({
  model,
  messages,
  maxTokens,
  temperature,
  providerKey,
  deepSeekThinking = false,
  reasoningEffort = 'high',
  stream = false,
}) {
  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: !!stream,
  };
  if (usesDeepSeekProvider(providerKey) && deepSeekThinking) {
    body.reasoning_effort = reasoningEffort || 'high';
    body.thinking =
      typeof deepSeekThinking === 'object' && deepSeekThinking !== null
        ? deepSeekThinking
        : { type: 'enabled' };
  } else if (usesDeepSeekProvider(providerKey) && deepSeekThinking === false) {
    body.thinking = { type: 'disabled' };
  }
  return body;
}

/** OpenAI 兼容 Chat Completions（国内厂商 / 自定义网关） */
export function createOpenAiCompatibleClient({
  baseURL,
  apiKey,
  defaultModel = 'gpt-4o-mini',
  providerKey = '',
}) {
  if (!apiKey) throw new Error('apiKey 不能为空');
  if (!baseURL || !String(baseURL).trim()) throw new Error('baseURL 不能为空');
  const openaiClient = new OpenAI({
    apiKey: String(apiKey).trim(),
    baseURL: String(baseURL).trim(),
    timeout: 90_000,
    maxRetries: 1,
  });
  const model = defaultModel || 'gpt-4o-mini';
  const pk = String(providerKey || '').trim();
  return {
    provider: pk || 'custom',
    providerKey: pk,
    model,
    async chat(messages, opts = {}) {
      const {
        model: m = model,
        maxTokens = 4096,
        temperature = 0.3,
        signal: externalSignal,
        timeoutMs,
        deepSeekThinking = false,
        reasoningEffort = 'high',
        stream = false,
        systemMessage,
      } = opts;

      let finalMessages = messages;
      if (systemMessage) {
        finalMessages = mergeSystemMessage(messages, systemMessage);
      }

      const requestBody = buildChatCompletionRequestBody({
        model: m,
        messages: finalMessages,
        maxTokens,
        temperature,
        providerKey: pk,
        deepSeekThinking,
        reasoningEffort,
        stream,
      });

      const { signal, cleanup } = attachAbortHandling(externalSignal, timeoutMs);
      try {
        const response = await openaiClient.chat.completions.create(requestBody, { signal });
        const msg = response.choices?.[0]?.message;
        const content = msg?.content ?? '';
        const reasoningContent = msg?.reasoning_content ?? msg?.reasoningContent ?? '';
        return {
          content,
          reasoningContent: reasoningContent || undefined,
          usage: response.usage ?? null,
          requestBody,
        };
      } finally {
        cleanup();
      }
    },
  };
}

export function createAiClient(provider) {
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    throw new Error(
      `未知的 AI provider: "${provider}"，可用值：${Object.keys(PROVIDERS).join(', ')}`
    );
  }

  const apiKey = resolveProviderApiKey(cfg, provider);
  if (!apiKey) {
    const hint = cfg.apiKeyEnvFallback
      ? `${cfg.apiKeyEnv} 或 ${cfg.apiKeyEnvFallback}`
      : cfg.apiKeyEnv;
    throw new Error(`provider "${provider}" 需要环境变量 ${hint}，当前未配置`);
  }

  return createAiClientFromConnectionParams({
    providerKey: provider,
    baseURL: cfg.baseURL || '',
    apiKey,
    defaultModel: cfg.defaultModel,
  });
}

export async function chatWithProvider(provider, { systemPrompt, userPrompt, model, maxTokens, temperature } = {}) {
  const client = createAiClient(provider);
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });
  return client.chat(messages, { model, maxTokens, temperature });
}

export function isProviderConfigured(provider) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return false;
  return !!resolveProviderApiKey(cfg, provider);
}
