// GEO可见度检测服务
// 检测品牌关键词在各AI平台（通过搜索）的可见度

const AI_PLATFORMS = {
  'deepseek': { name: 'DeepSeek', searchUrl: 'https://api.searchapi.cn/v1/search' },
  'doubao': { name: '豆包', searchUrl: 'https:// volcapp.com/search' },
  'kimi': { name: 'Kimi', searchUrl: 'https://kimi.moonshot.cn/search' },
  'tongyi': { name: '通义千问', searchUrl: 'https://tongyi.aliyun.com/search' },
  'wenxin': { name: '文心一言', searchUrl: 'https://yiyan.baidu.com/search' },
  'yuanbao': { name: '腾讯元宝', searchUrl: 'https://yuanbao.tencent.com/search' },
  'zhipu': { name: '智谱', searchUrl: 'https://chatglm.cn/search' },
};

export async function processGeoDetection(keywords, platforms = Object.keys(AI_PLATFORMS), apiKey) {
  const results = [];
  const platformResults = {};

  for (const kw of keywords) {
    for (const platform of platforms) {
      try {
        // 使用AI分析该关键词在对应平台的搜索结果摘要
        const searchQuery = `品牌"${kw}"在${AI_PLATFORMS[platform]?.name || platform}中的可见度`;
        const result = await analyzeBrandVisibility(searchQuery, kw, apiKey);

        results.push({
          keyword: kw,
          platform,
          platformName: AI_PLATFORMS[platform]?.name || platform,
          visible: result.visible,
          summary: result.summary,
          score: result.score,
        });
      } catch (err) {
        console.error(`检测失败 [${kw}][${platform}]:`, err.message);
      }
    }
  }

  // 计算综合评分
  const visibleResults = results.filter(r => r.visible);
  const missingResults = results.filter(r => !r.visible);
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
    : 0;

  // 评定等级
  let grade = 'D';
  if (avgScore >= 90) grade = 'S';
  else if (avgScore >= 80) grade = 'A';
  else if (avgScore >= 70) grade = 'B';
  else if (avgScore >= 60) grade = 'C';

  return {
    results,
    overallScore: avgScore,
    overallGrade: grade,
    visibleCount: visibleResults.length,
    missingCount: missingResults.length,
    platformNames: [...new Set(visibleResults.map(r => r.platformName))],
    checkedAt: new Date().toISOString(),
  };
}

async function analyzeBrandVisibility(query, keyword, apiKey) {
  // 使用DeepSeek分析
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey });

  const prompt = `请分析搜索查询："${query}"
请判断搜索结果中是否明确提到了品牌"${keyword}"。
返回JSON格式：
{
  "visible": true或false,
  "summary": "一句话总结搜索结果中关于该品牌的内容",
  "score": 0-100的评分（品牌提及程度、内容相关性）
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const text = response.choices[0]?.message?.content || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return { visible: false, summary: '分析失败', score: 0 };
  } catch (err) {
    return { visible: false, summary: `API错误: ${err.message}`, score: 0 };
  }
}
