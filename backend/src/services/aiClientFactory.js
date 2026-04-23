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
};

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
