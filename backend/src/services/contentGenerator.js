// AI内容生成服务
import { buildContentGeneratorSystemPrompt } from '../prompts/contentGenerator.js'

/**
 * 根据内容类型返回对应的文章结构模板
 */
function getArticleTemplate(contentType) {
  const templates = {
    review: `请按以下结构生成产品评测文章：
# [产品名称] 深度评测：[核心卖点一句话]

## 一、产品概览
[简要介绍产品定位、目标用户、主要特点，2-3段]

## 二、核心功能体验
[逐一测评主要功能，每个功能用 ### 三级标题，包含实际使用体验]

## 三、优点与亮点
- [优点1]：[详细说明]
- [优点2]：[详细说明]
- [优点3]：[详细说明]

## 四、不足与改进空间
- [不足1]：[客观分析]
- [不足2]：[客观分析]

## 五、综合评分与推荐
> [总结性评价，明确推荐人群和使用场景]

**总评**：[1-2句话的最终结论]`,

    marketing: `请按以下结构生成营销软文：
# [吸引眼球的标题，突出用户利益]

[开篇钩子：用痛点或场景引入，1-2段]

## 为什么你需要它？
[分析用户痛点，引发共鸣，2-3段]

## 它能为你带来什么
- **[价值点1]**：[具体说明]
- **[价值点2]**：[具体说明]  
- **[价值点3]**：[具体说明]

## 真实用户在说什么
> [用户证言1，真实感强]

> [用户证言2，突出效果]

## 立即行动
[行动号召，说明获取方式或限时优惠，制造紧迫感]`,

    tutorial: `请按以下结构生成使用教程：
# 完整教程：如何[实现目标]

## 前置准备
- [所需工具或条件1]
- [所需工具或条件2]

## 步骤一：[第一步标题]
[详细操作说明，可配合截图描述]

## 步骤二：[第二步标题]
[详细操作说明]

## 步骤三：[第三步标题]
[详细操作说明]

## 常见问题解答

### Q：[常见问题1]
[解答]

### Q：[常见问题2]
[解答]

## 小结
> [核心要点回顾，1-2句话]`,

    news: `请按以下结构生成新闻资讯文章：
# [新闻标题，简洁有力]

**[导语：一句话概括核心信息]**

[背景信息，交代事件来龙去脉，1-2段]

## 核心要点
- [要点1]
- [要点2]
- [要点3]

## 详细分析
[深度解读，2-3段，加入行业视角]

## 影响与展望
[对行业或用户的影响分析，预测未来趋势]

> 编辑点评：[简短的专业评价]`,

    case: `请按以下结构生成案例分享文章：
# [客户名称/行业] 案例：[核心成果一句话]

## 客户背景
[介绍客户情况、面临的挑战，1-2段]

## 面临的核心挑战
- [挑战1]
- [挑战2]
- [挑战3]

## 解决方案
[描述具体采用的方案，如何针对性地解决问题，2-3段]

## 实施过程
[关键实施步骤和里程碑]

## 成果数据
- **[指标1]**：提升了 [具体数字]%
- **[指标2]**：[具体成果描述]
- **[指标3]**：[具体成果描述]

## 客户评价
> "[客户真实评价，突出价值感受]"
> —— [客户姓名/职位]

## 经验总结
[可复制的方法论，对其他客户的参考价值]`,

    qa: `请按以下结构生成问答文章：
# 关于[主题]的10个高频问题，专家一一解答

[前言：说明文章价值和读者收益，1段]

## Q1：[高频问题1]

[详细专业解答，100-150字]

## Q2：[高频问题2]

[详细专业解答]

## Q3：[高频问题3]

[详细专业解答]

## Q4：[高频问题4]

[详细专业解答]

## Q5：[高频问题5]

[详细专业解答]

> **总结**：[核心要点归纳，帮助读者快速掌握关键信息]`
  }
  return templates[contentType] || templates.marketing
}

/**
 * 获取语气风格描述
 */
function getToneDescription(tone) {
  const toneMap = {
    professional: '语气专业严谨，逻辑清晰，使用行业术语，体现权威感',
    friendly: '语气亲和友好，贴近读者，用日常语言，让人感觉可信赖',
    casual: '语气轻松活泼，幽默有趣，多用短句和口语，充满活力'
  }
  return toneMap[tone] || toneMap.friendly
}

/**
 * 获取文章长度要求
 */
function getLengthRequirement(length) {
  const lengthMap = {
    short: '文章总长度控制在 400-600 字，简洁精炼',
    medium: '文章总长度在 800-1200 字，内容充实但不啰嗦',
    long: '文章总长度 1500-2500 字，深度详尽，每个章节内容丰富'
  }
  return lengthMap[length] || lengthMap.medium
}

/**
 * 获取格式要求
 */
function getFormatRequirement(format) {
  const formatMap = {
    plain: '使用自然段落，减少标题，重点用加粗 **text** 标注',
    headings: '使用 ## 二级标题和 ### 三级标题组织内容，每个章节有清晰的标题',
    bullets: '大量使用 - 列表符号，将内容拆解为要点，便于快速阅读'
  }
  return formatMap[format] || formatMap.headings
}

export async function generateContent(prompt, ctx = {}, options = {}) {
  const aiClient = ctx?.aiClient;
  if (!aiClient) {
    throw new Error('generateContent: 缺少 aiClient（应由路由层从数据库连接解析）');
  }

  // 从 prompt 中尝试解析结构化参数（如果前端传来了结构化 prompt）
  // 这里优先使用 options 中的参数，其次解析 prompt
  const contentType = options.contentType || 'marketing'
  const tone = options.tone || 'friendly'
  const length = options.length || 'medium'
  const format = options.format || 'headings'
  const keywords = options.keywords || []
  const platforms = options.platforms || []
  const audience = options.audience || ''

  // 构建系统提示词（prompt 已抽到 backend/src/prompts/contentGenerator.js）
  const systemPrompt = buildContentGeneratorSystemPrompt({
    toneDesc: getToneDescription(tone),
    lengthReq: getLengthRequirement(length),
    formatReq: getFormatRequirement(format),
  })

  // 构建用户提示词（结合文章模板）
  const articleTemplate = getArticleTemplate(contentType)
  
  let userPrompt = articleTemplate + '\n\n'
  
  if (keywords.length > 0) {
    userPrompt += `【核心关键词（必须自然融入文章）】\n${keywords.join('、')}\n\n`
  }
  
  if (audience) {
    userPrompt += `【目标读者】${audience}\n\n`
  }
  
  if (platforms.length > 0) {
    userPrompt += `【发布平台】${platforms.join('、')}（文章风格需符合该平台调性）\n\n`
  }
  
  // 如果前端还传来了额外的自定义 prompt，也加入
  if (prompt && !prompt.includes('请帮我撰写')) {
    userPrompt += `【额外创作要求】\n${prompt}\n\n`
  } else if (prompt) {
    // 提取补充说明部分
    const extraMatch = prompt.match(/【补充说明】\n([\s\S]+)$/)
    if (extraMatch) {
      userPrompt += `【额外创作要求】\n${extraMatch[1]}\n\n`
    }
    // 提取关键词（如果 options 没有传来）
    if (keywords.length === 0) {
      const kwMatch = prompt.match(/【核心关键词】\n(.+)\n/)
      if (kwMatch) {
        userPrompt += `核心关键词：${kwMatch[1]}\n\n`
      }
    }
  }
  
  userPrompt += '请按照上述模板结构，生成一篇完整、高质量的文章。注意：直接输出文章内容，不需要前言说明。'

  const { content } = await aiClient.chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.75, maxTokens: 4000 }
  );

  return content || '生成失败，请重试';
}
