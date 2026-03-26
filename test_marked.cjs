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
// 只处理标题和列表，不要处理已有的粗体标记 **
let processed = testText
  // 标题：确保 # 后有空格
  .replace(/^#{1,6}([^\s#])/gm, '$& ')
  // 引用：确保 > 后有空格
  .replace(/^>([^\s])/gm, '> $1')
  // 列表：确保 - 或 * 后有空格（但要排除已经是 ** 的情况）
  .replace(/^([-])([^\s*])/gm, '- $2');
console.log(processed);

console.log('\n=== marked 解析结果 ===');
const result = marked.parse(processed);
console.log(result);

console.log('\n=== 测试换行 ===');
const testBreaks = '第一行\n第二行\n\n第三段';
console.log('输入:', JSON.stringify(testBreaks));
console.log('输出:', marked.parse(testBreaks));
