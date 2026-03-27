import express from 'express';
import { processGeoDetection } from '../services/geoDetection.js';
import 'dotenv/config';

const router = express.Router();

// POST /api/geo-detection - GEO检测
router.post('/geo-detection', async (req, res) => {
  try {
    const { keywords, platforms, apiKey } = req.body;
    
    if (!keywords || keywords.length === 0) {
      return res.status(400).json({ error: '请提供关键词' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: '缺少 API Key' });
    }

    const result = await processGeoDetection(keywords, platforms, apiKey);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('GEO检测失败:', err.message);
    res.status(500).json({ error: err.message || '检测失败' });
  }
});

export default router;
