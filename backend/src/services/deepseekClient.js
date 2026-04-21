/**
 * 仅对接 DeepSeek 兼容接口（OpenAI SDK + baseURL）。
 * 以后若增加豆包 / Kimi，请新建 doubaoClient.js 等，再在业务里按模型名分发，勿在此文件堆逻辑。
 */
import OpenAI from 'openai';

export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

export function createDeepseekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
  if (!apiKey) {
    throw new Error('未配置环境变量 DEEPSEEK_API_KEY');
  }
  return new OpenAI({ apiKey, baseURL });
}

/**
 * 单次对话。维护时只需关心 system + user 文案与模型名。
 */
export async function chatDeepseek(client, options) {
  const {
    systemPrompt,
    userPrompt,
    model = DEEPSEEK_DEFAULT_MODEL,
    maxTokens = 4096,
    temperature = 0.3,
  } = options;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
  });

  const content = response.choices?.[0]?.message?.content ?? '';
  return {
    content,
    usage: response.usage ?? null,
  };
}
