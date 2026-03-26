const { JSDOM } = require('jsdom');
const { marked } = require('marked');
const DOMPurify = require('dompurify');

// 创建 DOM 环境
const window = new JSDOM('').window;
const purify = DOMPurify(window);

// 配置 marked
marked.use({
  gfm: true,
  breaks: true
});

// 测试数据库中的原始内容
const rawContent = `# GEO内容生成：让创意不再枯竭

## 引言

作为一名内容营销人，你是否也曾面对空白的文档发呆？

## 初识GEO

GEO给我的第一印象是"专业"。它没有花哨的界面，而是专注于解决营销人最核心的痛点。

**关键特点：**
- 高效产出
- 质量稳定
- 学习能力强

## 总结

GEO内容生成已经成为我工作中不可或缺的助手。`;

console.log('=== 原始内容（数据库中的 Markdown） ===');
console.log(rawContent);
console.log('\n=== 预处理后 ===');
let processed = rawContent
  .replace(/^#{1,6}([^\s#])/gm, '$& ')
  .replace(/^>([^\s])/gm, '> $1')
  .replace(/^([-])([^\s*])/gm, '- $2');
console.log(processed);

console.log('\n=== marked.parse 解析后 ===');
let html = marked.parse(processed);
console.log(html);

console.log('\n=== DOMPurify 清理后 ===');
html = purify.sanitize(html, {
  ALLOWED_TAGS: [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'b', 'i', 'u', 's', 'del',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'br', 'hr',
    'a', 'span', 'div'
  ],
  ALLOWED_ATTR: ['href', 'target', 'class', 'style']
});
console.log(html);
