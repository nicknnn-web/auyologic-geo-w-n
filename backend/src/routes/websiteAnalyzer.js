import express from 'express';
import { analyzeWebsite } from '../services/websiteAnalyzer.js';
import 'dotenv/config';

const router = express.Router();

// POST /api/website-analyze - 网站分析
router.post('/website-analyze', async (req, res) => {
  try {
    const { url, apiKey } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: '请提供网址' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: '缺少 API Key' });
    }

    const result = await analyzeWebsite(url, apiKey);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('网站分析失败:', err.message);
    res.status(500).json({ error: err.message || '分析失败' });
  }
});

export default router;
