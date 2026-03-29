/**
 * 多关键词检测算法测试
 * 运行: node test-multi-keywords.js
 */

// 模拟的 AI 回答文本
const mockAnswers = [
  "苹果是一家知名的科技公司，他们的产品非常受欢迎。",
  "华为手机很不错，质量很好。",
  "小米性价比高，功能强大。",
  "这个产品很好用，推荐购买。",
  "我不知道这个品牌。",
  "苹果和华为都是优秀的公司。"
];

// 测试的关键词数组
const testKeywords = ['苹果', '华为', '小米'];

// 多关键词检测逻辑
function detectMultiKeywords(text, keywords) {
  const lowerText = text.toLowerCase();
  
  // 检查每个关键词是否被提及
  const keywordResults = keywords.map(kw => {
    const lowerKw = kw.toLowerCase()
    const mentioned = lowerText.includes(lowerKw)
    
    let mentionType = 'none'
    if (mentioned) {
      // 检查完整词匹配
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const exactPattern = new RegExp(`\\b${escaped}\\b`, 'i')
      mentionType = exactPattern.test(text) ? 'explicit' : 'implicit'
    }
    
    return { keyword: kw, mentioned, mentionType }
  })
  
  // 任一关键词提及就算 mentioned
  const mentioned = keywordResults.some(r => r.mentioned)
  
  // 统计命中情况
  const mentionedCount = keywordResults.filter(r => r.mentioned).length
  const allMentioned = mentionedCount === keywords.length  // 全部命中
  const partialMentioned = mentioned && !allMentioned      // 部分命中
  
  // mentionType 判断
  let mentionType = 'none'
  if (mentioned) {
    const explicitCount = keywordResults.filter(r => r.mentionType === 'explicit').length
    if (explicitCount === mentionedCount) mentionType = 'explicit'
    else if (explicitCount > 0) mentionType = 'partial_explicit'
    else mentionType = 'implicit'
  }
  
  return {
    mentioned,
    mentionType,
    mentionedCount,
    keywordsTotal: keywords.length,
    allMentioned,
    partialMentioned,
    keywordResults
  }
}

// 测试
console.log('===== 多关键词检测算法测试 =====\n');
console.log(`关键词: ${testKeywords.join(', ')}\n`);

mockAnswers.forEach((answer, idx) => {
  console.log(`--- 测试 ${idx + 1} ---`);
  console.log(`回答: "${answer}"`);
  
  const result = detectMultiKeywords(answer, testKeywords);
  
  console.log(`结果:`);
  console.log(`  - 任一命中 (mentioned): ${result.mentioned}`);
  console.log(`  - 提及类型: ${result.mentionType}`);
  console.log(`  - 命中数量: ${result.mentionedCount}/${result.keywordsTotal}`);
  console.log(`  - 全部命中: ${result.allMentioned}`);
  console.log(`  - 部分命中: ${result.partialMentioned}`);
  
  console.log(`  - 详细:`);
  result.keywordResults.forEach(kr => {
    console.log(`    ${kr.keyword}: ${kr.mentioned ? '✓' : '✗'} (${kr.mentionType})`);
  });
  
  // 分类展示
  if (result.allMentioned) {
    console.log(`  → 分类: 全部命中 ✅`);
  } else if (result.partialMentioned) {
    console.log(`  → 分类: 部分命中 ⚠️`);
  } else if (result.mentioned) {
    console.log(`  → 分类: 单一命中`);
  } else {
    console.log(`  → 分类: 未命中 ❌`);
  }
  
  console.log('');
});

console.log('===== 测试完成 =====');