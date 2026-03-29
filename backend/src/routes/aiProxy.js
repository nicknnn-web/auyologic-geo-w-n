import { Router } from 'express';
import OpenAI from 'openai';
import 'dotenv/config';

const router = Router();

// 统一 AI 代理端点
// 前端调用: POST /api/ai/generate
// Body: { prompt: string, model?: string, max_tokens?: number, temperature?: number }

const getAPIKey = (req) => {
  // 优先使用用户提供的 Key，其次使用环境变量
  return req.body.apiKey || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
};

const getBaseURL = (req) => {
  return req.body.baseURL || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
};

router.post('/generate', async (req, res) => {
  try {
    const { prompt, model, max_tokens, temperature, systemPrompt, apiKey, baseURL } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt 是必填项' });
    }

    const resolvedAPIKey = apiKey || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
    const resolvedBaseURL = baseURL || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';

    if (!resolvedAPIKey) {
      return res.status(500).json({ error: '未配置 API Key，请联系管理员' });
    }

    const client = new OpenAI({
      apiKey: resolvedAPIKey,
      baseURL: resolvedBaseURL,
    });

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await client.chat.completions.create({
      model: model || 'deepseek-chat',
      messages,
      max_tokens: max_tokens || 2000,
      temperature: temperature ?? 0.7,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: 'AI 返回内容为空' });
    }

    res.json({ content });
  } catch (error) {
    console.error('AI 代理请求失败:', error);
    res.status(500).json({
      error: error.message || 'AI 请求失败',
      details: error.code
    });
  }
});

export default router;
