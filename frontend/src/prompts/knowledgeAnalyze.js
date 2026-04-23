/**
 * [知识库 - 文档分析 Prompt]
 *
 * 用途：从上传文档里提取 GEO 创作素材（关键词 / 摘要 / 核心观点）。
 * 调用方：frontend/src/views/Knowledge.vue → analyzeWithDeepSeek
 * 输出 JSON：
 *   { keywords: string[], summary: string, keyPoints: string[] }
 */
export const buildKnowledgeAnalyzePrompt = (content) => `你是一个内容分析专家。请分析以下文档，提取用于AI创作的知识素材。

文档内容：
${content}

请以JSON格式返回：
{
  "keywords": ["关键词1", "关键词2", ...],  // 5-10个可用于GEO创作的关键词
  "summary": "100字内的摘要",  // 文档核心内容概述
  "keyPoints": ["要点1", "要点2", ...]  // 3-5个核心观点
}

要求：
- keywords 要能直接用于prompt匹配，覆盖品牌词、产品词、场景词、问题词
- summary 要包含品牌/产品的核心卖点
- keyPoints 是用户真正关心的价值点`
