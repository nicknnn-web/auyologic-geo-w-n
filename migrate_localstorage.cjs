// migrate_localstorage.cjs
// 用法: node migrate_localstorage.cjs <localStorage_export.json>
const https = require('https');
const fs = require('fs');

const API_BASE = 'https://fokgoxfxgyjq.sealoshzh.site';  // 后端地址

// 读取导出的 localStorage 数据
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));

const post = (path, body) => new Promise((resolve, reject) => {
  const url = new URL(API_BASE + path);
  const postData = JSON.stringify(body);
  const opts = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
  };
  const req = https.request(opts, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try { resolve(JSON.parse(d)); }
      catch { resolve(d); }
    });
  });
  req.on('error', reject);
  req.write(postData);
  req.end();
});

async function migrate() {
  const results = {};

  // 1. 企业设置
  if (data['enterprise-settings']) {
    const s = data['enterprise-settings'];
    console.log('企业设置:', s.name, s.industry);
    // 后端 /api/settings PUT 更新
    results.settings = await post('/api/settings', {
      username: s.name || '',
      deepseek_api_key: s.deepseekApiKey || '',
      doubao_api_key: s.doubaoApiKey || '',
      kimi_api_key: s.kimiApiKey || ''
    }).catch(e => ({ error: e.message }));
  }

  // 2. 关键词
  if (data.keywords && data.keywords.length > 0) {
    console.log(`迁移 ${data.keywords.length} 个关键词...`);
    results.keywords = [];
    for (const kw of data.keywords) {
      const r = await post('/api/keywords', {
        keyword: kw.keyword || kw.text || String(kw),
        type: kw.type || '品牌'
      }).catch(e => ({ error: e.message }));
      results.keywords.push(r);
    }
  }

  // 3. 扩展问题
  if (data.questions && data.questions.length > 0) {
    console.log(`迁移 ${data.questions.length} 个问题...`);
    results.questions = [];
    for (const q of data.questions) {
      const r = await post('/api/questions', {
        question: q.question || q.text || String(q),
        keywordType: q.keywordType || '',
        sourceKeyword: q.sourceKeyword || '',
        status: q.status || 'pending'
      }).catch(e => ({ error: e.message }));
      results.questions.push(r);
    }
  }

  // 4. 知识库文档
  if (data.knowledge && data.knowledge.length > 0) {
    console.log(`迁移 ${data.knowledge.length} 篇知识库文档...`);
    results.knowledge = [];
    for (const doc of data.knowledge) {
      const r = await post('/api/documents', {
        title: doc.title || '',
        content: doc.content || ''
      }).catch(e => ({ error: e.message }));
      results.knowledge.push(r);
    }
  }

  // 5. 创作指令模板
  if (data.commands && data.commands.length > 0) {
    console.log(`迁移 ${data.commands.length} 个指令模板...`);
    results.commands = [];
    for (const cmd of data.commands) {
      const r = await post('/api/instruction-templates', {
        name: cmd.name || '',
        content: cmd.content || cmd.prompt || ''
      }).catch(e => ({ error: e.message }));
      results.commands.push(r);
    }
  }

  console.log('\n迁移完成:');
  console.log(JSON.stringify(results, null, 2));
}

migrate().catch(console.error);
