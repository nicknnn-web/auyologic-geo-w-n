import express from 'express';
import { analyzeWebsite } from '../services/websiteAnalyzer.js';

const router = express.Router();

// POST /api/website-analyze - 网站结构/SEO 静态分析（不调用大模型 API）
router.post('/website-analyze', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) {
      return res.status(400).json({ error: '请提供网址' });
    }
    const result = await analyzeWebsite(url);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('网站分析失败:', err.message);
    res.status(500).json({ error: err.message || '分析失败' });
  }
});

export default router;
