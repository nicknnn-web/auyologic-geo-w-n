/**
 * 统一 AI 代理端点
 *
 * POST /api/ai/generate
 * Body:
 *   prompt       string  必填
 *   provider?    string  provider key（deepseek / qwen / kimi / glm / openai），默认 deepseek
 *   model?       string  覆盖 provider 的默认模型名
 *   systemPrompt? string
 *   max_tokens?  number
 *   temperature? number
 *   apiKey?      string  临时覆盖（优先于环境变量，谨慎使用）
 *   baseURL?     string  临时覆盖 baseURL
 */

import { Router } from 'express';
import OpenAI from 'openai';
import { createAiClient, PROVIDERS, isProviderConfigured } from '../services/aiClientFactory.js';
import 'dotenv/config';

const router = Router();

router.post('/generate', async (req, res) => {
  try {
    const {
      prompt,
      provider: providerParam,
      model,
      max_tokens,
      temperature,
      systemPrompt,
      // 兼容旧调用：直接传 apiKey/baseURL 走临时客户端
      apiKey,
      baseURL,
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt 是必填项' });
    }

    let content;

    // 如果前端直接传了 apiKey / baseURL（旧方式），走临时 OpenAI 客户端
    if (apiKey || baseURL) {
      const resolvedKey = apiKey || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
      const resolvedURL = baseURL || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
      if (!resolvedKey) {
        return res.status(500).json({ error: '未配置 API Key，请联系管理员' });
      }
      const tempClient = new OpenAI({ apiKey: resolvedKey, baseURL: resolvedURL });
      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });
      const response = await tempClient.chat.completions.create({
        model: model || 'deepseek-chat',
        messages,
        max_tokens: max_tokens || 2000,
        temperature: temperature ?? 0.7,
      });
      content = response.choices?.[0]?.message?.content;
    } else {
      // 新方式：通过 provider key 路由
      const provider = providerParam || 'deepseek';
      if (!PROVIDERS[provider]) {
        return res.status(400).json({
          error: `未知的 provider: "${provider}"，可用值：${Object.keys(PROVIDERS).join(', ')}`,
        });
      }
      if (!isProviderConfigured(provider)) {
        return res.status(500).json({
          error: `provider "${provider}" 的 API Key（${PROVIDERS[provider].apiKeyEnv}）未配置`,
        });
      }
      const client = createAiClient(provider);
      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });
      const result = await client.chat(messages, {
        model: model || undefined,
        maxTokens: max_tokens || 2000,
        temperature: temperature ?? 0.7,
      });
      content = result.content;
    }

    if (!content) {
      return res.status(500).json({ error: 'AI 返回内容为空' });
    }

    res.json({ content });
  } catch (error) {
    console.error('AI 代理请求失败:', error);
    res.status(500).json({
      error: error.message || 'AI 请求失败',
      details: error.code,
    });
  }
});

/** 查询当前已配置的 provider 列表（只读，便于前端展示可用模型） */
router.get('/providers', (req, res) => {
  const list = Object.entries(PROVIDERS).map(([key, cfg]) => ({
    key,
    label: cfg.label,
    defaultModel: cfg.defaultModel,
    configured: isProviderConfigured(key),
  }));
  res.json({ success: true, providers: list });
});

export default router;
