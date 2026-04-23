/**
 * [GEO 改进方案报告 Prompt]
 *
 * 用途：基于网站 GEO 检测结果，生成结构化改进方案报告。
 * 调用方：frontend/src/views/GEOReport.vue → generateAIReport
 */

/** 系统提示词 */
export const GEO_REPORT_SYSTEM_PROMPT =
  '你是一个专业的GEO优化顾问，擅长生成结构化的改进方案报告。请严格按照JSON格式返回。'

/**
 * 构建 GEO 报告生成 prompt
 * @param {object} detectionData 检测数据（见下方字段）
 */
export const buildGeoReportPrompt = (detectionData) => {
  const techSection = detectionData.techDetails ? `
## 技术检测详情
- 技术基础得分: ${detectionData.techDetails.items.tech?.score || 0}/25
- 页面结构得分: ${detectionData.techDetails.items.structure?.score || 0}/25
- 结构化数据得分: ${detectionData.techDetails.items.schema?.score || 0}/25
- AI亲和性得分: ${detectionData.techDetails.items.aiFriendly?.score || 0}/25

## 待改进问题:
${detectionData.techDetails.issues.warn.map(i => `- ${i.title}: ${i.desc}`).join('\n')}
` : ''

  return `基于以下网站 GEO 检测结果，生成一份专业的改进方案报告。

## 检测数据
- 综合健康度得分: ${detectionData.combinedScore}分
- 可见度得分: ${detectionData.visibilityScore}分 (权重40%)
- 技术检测得分: ${detectionData.techScore}分 (权重60%)
- 品牌可见数量: ${detectionData.geoDetails.visibleCount}
- 品牌缺失数量: ${detectionData.geoDetails.missingCount}
- 检测平台数: ${detectionData.geoDetails.platformCount}
${techSection}
请按照以下JSON格式生成报告内容：
{
  "executiveSummary": "执行摘要",
  "criticalFindings": [{"severity": "critical/high/medium/low", "title": "标题", "description": "描述"}],
  "prioritizedImprovements": {
    "p0": [{"title": "标题", "description": "描述", "impact": "效果"}],
    "p1": [{"title": "标题", "description": "描述", "impact": "效果"}],
    "p2": [{"title": "标题", "description": "描述", "impact": "效果"}]
  },
  "impactForecast": {"visibilityImprovement": "15-25%", "technicalImprovement": "10-20%", "combinedImprovement": "12-22%", "note": "说明"},
  "actionRecommendations": [{"title": "标题", "steps": ["步骤1", "步骤2"]}]
}`
}
