import express from 'express';
import 'dotenv/config';

const router = express.Router();

// DeepSeek API 配置端点
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

/**
 * AI 代理路由 - 前端通过此路由调用 DeepSeek API
 * 避免在前端硬编码 API Key
 */
router.post('/ai/generate', async (req, res) => {
  try {
    // 检查 API Key 是否配置
    if (!DEEPSEEK_API_KEY) {
      return res.status(500).json({ error: 'DeepSeek API Key 未配置' });
    }

    const { prompt, type = 'content' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: '缺少 prompt 参数' });
    }

    // 调用 DeepSeek API
    const response = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API 错误:', response.status, errorText);
      return res.status(response.status).json({ error: 'AI 生成失败', details: errorText });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    res.json({ success: true, content });
  } catch (error) {
    console.error('AI 代理错误:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
