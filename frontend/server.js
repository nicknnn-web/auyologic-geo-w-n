import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;
const API_BACKEND = process.env.API_BACKEND || 'https://auyologic.zeabur.app';

// API 代理 - 将 /api/* 请求转发到后端
// 使用 raw body 解析，保持原始请求体不做修改
app.use('/api', express.raw({ type: () => true, limit: '50mb' }));

app.all('/api/*', async (req, res) => {
  try {
    const targetUrl = `${API_BACKEND}${req.originalUrl}`;
    console.log(`[API Proxy] ${req.method} ${req.originalUrl}`);

    // 复制请求头，过滤掉不应该转发的头
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      // 跳过 hop-by-hop 头和 host
      if (!['host', 'connection', 'keep-alive', 'transfer-encoding', 
            'upgrade', 'proxy-connection'].includes(lower)) {
        headers[key] = value;
      }
    }
    // 确保有 x-user-id
    if (!headers['x-user-id']) {
      headers['x-user-id'] = 'default_user';
    }

    const fetchOptions = {
      method: req.method,
      headers,
    };

    // GET/HEAD 不带 body
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = req.body;
    }

    const backendRes = await fetch(targetUrl, fetchOptions);

    // 透传后端响应头
    res.status(backendRes.status);
    backendRes.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (!['transfer-encoding', 'content-encoding', 'connection'].includes(lower)) {
        res.setHeader(key, value);
      }
    });

    const data = await backendRes.arrayBuffer();
    res.send(Buffer.from(data));
  } catch (err) {
    console.error(`[API Proxy Error] ${req.method} ${req.originalUrl}:`, err.message);
    res.status(502).json({ error: 'Backend unreachable', details: err.message });
  }
});

// 静态文件服务
app.use(express.static('dist'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'dist' });
});

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}, API proxy -> ${API_BACKEND}`);
});
