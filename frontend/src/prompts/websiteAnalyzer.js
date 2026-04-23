/**
 * [网站优化检测 - AI 亲和性分析 Prompt]
 *
 * 用途：对网页做 SEO + AI 友好度评分，不同页面类型（门户 / 文章详情）走不同评分口径。
 * 调用方：frontend/src/utils/websiteAnalyzer.js → checkAIFriendlinessDeep
 */

/** 门户首页 / 列表页 system prompt */
export const PORTAL_SEO_SYSTEM_PROMPT =
  '你是一个专业的门户网站SEO分析专家。请严格按JSON格式返回分析结果。'

/** 文章页 / 详情页 system prompt */
export const ARTICLE_SEO_SYSTEM_PROMPT =
  '你是一个专业的SEO和AI亲和性分析专家。请严格按JSON格式返回分析结果。'

/** 门户首页 / 列表页评分规则文本 */
export const PORTAL_SCORING_RULES = `页面类型：门户网站首页/列表页
评分标准（总分25分）：
1. 导航结构（是否有清晰的导航、分类）0-8分
2. 内容丰富度（首页内容多样性、板块划分）0-7分
3. 链接结构（内链丰富度、分类链接）0-5分
4. SEO基础（title、meta、h1）0-5分`

/** 文章页 / 详情页评分规则文本 */
export const ARTICLE_SCORING_RULES = `页面类型：文章/详情页
评分标准（总分25分）：
1. 内容质量（是否专业、有深度、原创）0-8分
2. 结构化程度（是否有清晰的标题层级、数据表格、列表）0-7分
3. 实体提及（是否提及具体品牌、产品、地点、人物等）0-5分
4. GEO要素（是否包含FAQ问答、引用来源、数据支撑、术语解释）0-5分`

/**
 * 根据页面类型一次性返回 system prompt + 评分规则
 * @param {'portal'|'article'} pageType
 */
export const getAIFriendlinessPromptSet = (pageType) => {
  if (pageType === 'portal') {
    return { systemPrompt: PORTAL_SEO_SYSTEM_PROMPT, scoringRules: PORTAL_SCORING_RULES }
  }
  return { systemPrompt: ARTICLE_SEO_SYSTEM_PROMPT, scoringRules: ARTICLE_SCORING_RULES }
}

/**
 * 构建 AI 亲和性 user prompt
 * @param {object} params
 * @param {string} params.scoringRules  评分规则文本（见上）
 * @param {string} params.url
 * @param {string} params.truncatedText 已截断的网页正文
 */
export const buildAIFriendlinessPrompt = ({ scoringRules, url, truncatedText }) => `请分析以下网页内容，${scoringRules}

网址：${url}
内容摘要：${truncatedText}

请返回严格的JSON格式（不要有其他文字）：
{
  "score": 数字,
  "quality": 数字,
  "structure": 数字,
  "entity": 数字,
  "geo": 数字,
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"]
}`
