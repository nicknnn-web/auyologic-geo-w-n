import express from 'express';
import { generateContent } from '../services/contentGenerator.js';
import 'dotenv/config';

const router = express.Router();

// POST /api/generate - 生成内容
router.post('/generate', async (req, res) => {
  try {
    const { prompt, apiKey, contentType, tone, length, format, keywords, platforms, audience } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: '缺少 API Key' });
    }

    const result = await generateContent(prompt, apiKey, {
      contentType,
      tone,
      length,
      format,
      keywords,
      platforms,
      audience
    });

    res.json({ success: true, content: result });
  } catch (err) {
    console.error('内容生成失败:', err.message);
    res.status(500).json({ error: err.message || '生成失败' });
  }
});

export default router;
