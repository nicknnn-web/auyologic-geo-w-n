import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;
const API_BACKEND = process.env.API_BACKEND || 'https://auyologic.zeabur.app';

// ============ API 代理 ============

// 不用 express 的 body parser，直接用原始流转发
app.all('/api/*', async (req, res) => {
  try {
    const targetUrl = `${API_BACKEND}${req.originalUrl}`;
    console.log(`[API Proxy] ${req.method} ${req.originalUrl}`);

    // 收集请求体 chunks
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks);

    // 复制请求头
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      // 跳过 hop-by-hop 头
      if (!['host', 'connection', 'keep-alive', 'transfer-encoding',
            'upgrade', 'proxy-connection', 'content-length'].includes(lower)) {
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
    if (req.method !== 'GET' && req.method !== 'HEAD' && rawBody.length > 0) {
      fetchOptions.body = rawBody;
    }

    const backendRes = await fetch(targetUrl, fetchOptions);

    // 透传后端状态码和响应头
    res.status(backendRes.status);
    backendRes.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (!['transfer-encoding', 'content-encoding', 'connection', 'content-length'].includes(lower)) {
        res.setHeader(key, value);
      }
    });

    // 流式转发响应体
    const data = await backendRes.arrayBuffer();
    res.end(Buffer.from(data));
  } catch (err) {
    console.error(`[API Proxy Error] ${req.method} ${req.originalUrl}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Backend unreachable', details: err.message });
    }
  }
});

// ============ 静态文件 ============

app.use(express.static('dist'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'dist' });
});

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}, API proxy -> ${API_BACKEND}`);
});
