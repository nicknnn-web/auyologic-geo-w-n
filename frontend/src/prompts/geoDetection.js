/**
 * [GEO 检测 - 品牌可见度分析 Prompt]
 *
 * 用途：对"问题 × 平台"组合调用 AI，分析品牌可见度。
 * 调用方：frontend/src/views/GEODetection.vue
 */

/** 系统提示词 */
export const GEO_DETECTION_SYSTEM_PROMPT =
  '你是一个专业的AI内容分析助手，擅长分析品牌在AI平台回答中的可见度。'

/**
 * 构建可见度分析 user prompt
 * @param {object} params
 * @param {string} params.question
 * @param {string} params.keyword      目标品牌关键词
 * @param {string} params.platformId   目标 AI 平台
 */
export const buildGeoDetectionPrompt = ({ question, keyword, platformId }) => `你是一个AI平台内容分析专家。请分析以下问题在AI平台回答中的品牌可见度。

问题: "${question}"
检测的品牌关键词: "${keyword}"
目标AI平台: "${platformId}"

请分析AI平台的回答中是否提到了该品牌，并返回JSON格式的分析结果。

分析维度:
1. mentioned: 是否被提及 (true/false)
2. mentionType: 提及类型 ("explicit"=明确提及, "implicit"=隐含提及, "related"=相关但未直接提及, "none"=未提及)
3. firstMentionPosition: 首次提及位置 (0.0-1.0, 0=开头, 1=结尾)
4. positionRank: 位置等级 ("top"=前10%, "above_fold"=可视区域, "below_fold"=需要滚动)
5. sentiment: 情感倾向 ("positive"=正面, "neutral"=中性, "negative"=负面)
6. semanticRelevance: 语义相关性 (0.0-1.0)
7. competitivePosition: 竞品位置 ("winner"=优于竞品, "loser"=劣于竞品, "mentioned"=与竞品并列, null=未提竞品)
8. competitorsMentioned: 被提及的竞品列表 (数组)

请返回一个JSON对象，包含以上所有字段。不要添加任何解释或markdown格式。`
