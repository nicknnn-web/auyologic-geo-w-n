/**
 * DeepSeek 客户端（向后兼容层）
 *
 * 新代码请直接使用 aiClientFactory.js：
 *   import { createAiClient } from './aiClientFactory.js'
 *   const client = createAiClient('deepseek')
 *   const { content } = await client.chat(messages, { maxTokens: 2048 })
 *
 * 此文件保留是为了兼容已有调用（aiProxy.js 等），不建议在新业务里引用。
 */

import { createAiClient, PROVIDERS } from './aiClientFactory.js';

export const DEEPSEEK_DEFAULT_MODEL = PROVIDERS.deepseek.defaultModel;

/** 兼容旧调用：返回一个带 chat.completions.create 方法的对象（供旧版 chatDeepseek 使用） */
export function createDeepseekClient() {
  // 直接返回 aiClientFactory 创建的统一客户端
  // 旧代码调用 createDeepseekClient() 后再调 chatDeepseek(client, opts)，仍然有效
  return createAiClient('deepseek');
}

/**
 * 单次对话（兼容旧签名）。
 * client 参数已被忽略（工厂内部自行创建），保留参数是为了不破坏现有调用。
 */
export async function chatDeepseek(_clientIgnored, options) {
  const {
    systemPrompt,
    userPrompt,
    model = DEEPSEEK_DEFAULT_MODEL,
    maxTokens = 4096,
    temperature = 0.3,
  } = options;

  const client = createAiClient('deepseek');
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  return client.chat(messages, { model, maxTokens, temperature });
}
