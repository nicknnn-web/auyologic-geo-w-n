const { marked } = require('marked');

// 配置 marked
marked.use({
  gfm: true,
  breaks: true
});

// 测试文本 - 模拟文章内容
const testText = `# GEO内容生成：让创意不再枯竭

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

console.log('=== 原始文本 ===');
console.log(testText);
console.log('\n=== 预处理后 ===');
let processed = testText
  .replace(/^#{1,6}([^\s#])/gm, '$& $1')
  .replace(/^([-*])([^\s])/gm, '$1 $2');
console.log(processed);

console.log('\n=== marked 解析结果 ===');
const result = marked.parse(processed);
console.log(result);
