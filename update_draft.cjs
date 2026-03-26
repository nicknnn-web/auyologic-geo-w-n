const fs = require('fs');
const content = fs.readFileSync('test_article.md', 'utf8');

// 更新 ID=4 的草稿
fetch('https://fokgoxfxgyjq.sealoshzh.site/api/drafts/4', {
  method: 'PUT',
  headers: {'Content-Type': 'application/json', 'x-user-id': 'default_user'},
  body: JSON.stringify({content})
}).then(r=>r.json()).then(d=>console.log('更新成功:', d.id || d)).catch(e=>console.error(e));
