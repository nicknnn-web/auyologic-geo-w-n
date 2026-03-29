<template>
  <div class="gr-page">
    <!-- 顶部标题 -->
    <div class="gr-header">
      <div class="gr-header-icon">
        <el-icon><DataAnalysis /></el-icon>
      </div>
      <div>
        <h1 class="gr-title">GEO 改进方案报告</h1>
        <p class="gr-subtitle">一键生成基于检测数据的定制化改进建议</p>
      </div>
      <div class="gr-header-actions">
        <el-button @click="goBack" plain>
          <el-icon class="mr-1"><ArrowLeft /></el-icon>返回
        </el-button>
        <el-button type="primary" @click="generateReport" :loading="generating">
          <el-icon class="mr-1"><RefreshRight /></el-icon>生成报告
        </el-button>
      </div>
    </div>

    <!-- 无数据提示 -->
    <div v-if="!hasData" class="gr-empty-card">
      <el-empty description="暂无检测数据，请先完成以下检测">
        <div class="empty-actions">
          <el-button type="primary" plain @click="goToGEODetection">可见度检测</el-button>
          <el-button type="success" plain @click="goToWebsiteOptimization">技术检测</el-button>
        </div>
      </el-empty>
    </div>

    <!-- 报告内容 -->
    <div v-else class="gr-report">
      <!-- 综合健康度 -->
      <div class="report-section health-section">
        <div class="section-header">
          <el-icon class="section-icon"><DataLine /></el-icon>
          <h2 class="section-title">综合 GEO 健康度</h2>
        </div>
        <div class="health-score-display">
          <div class="health-main-score" :class="healthGradeClass">
            <div class="score-value">{{ combinedScore }}</div>
            <div class="score-label">综合得分</div>
            <div class="score-grade">{{ healthGrade }}</div>
          </div>
          <div class="health-breakdown">
            <div class="breakdown-item">
              <div class="breakdown-label">可见度得分 ×40%</div>
              <div class="breakdown-value">{{ visibilityScore }}</div>
              <div class="breakdown-bar"><div class="bar-fill visibility-fill" :style="{ width: visibilityScore + '%' }"></div></div>
            </div>
            <div class="breakdown-item">
              <div class="breakdown-label">技术检测得分 ×60%</div>
              <div class="breakdown-value">{{ techScore }}</div>
              <div class="breakdown-bar"><div class="bar-fill tech-fill" :style="{ width: techScore + '%' }"></div></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 执行摘要 -->
      <div class="report-section" v-if="reportData.executiveSummary">
        <div class="section-header">
          <el-icon class="section-icon"><Document /></el-icon>
          <h2 class="section-title">执行摘要</h2>
        </div>
        <div class="summary-content">{{ reportData.executiveSummary }}</div>
      </div>

      <!-- 关键发现 -->
      <div class="report-section" v-if="reportData.criticalFindings && reportData.criticalFindings.length > 0">
        <div class="section-header">
          <el-icon class="section-icon"><WarningFilled /></el-icon>
          <h2 class="section-title">关键发现</h2>
        </div>
        <div class="findings-list">
          <div v-for="(finding, idx) in reportData.criticalFindings" :key="idx" class="finding-card" :class="'finding-' + finding.severity">
            <div class="finding-severity">
              <el-tag size="small" :type="getSeverityTagType(finding.severity)">{{ getSeverityName(finding.severity) }}</el-tag>
            </div>
            <div class="finding-title">{{ finding.title }}</div>
            <div class="finding-desc">{{ finding.description }}</div>
          </div>
        </div>
      </div>

      <!-- 优先级改进 -->
      <div class="report-section" v-if="reportData.prioritizedImprovements">
        <div class="section-header">
          <el-icon class="section-icon"><Flag /></el-icon>
          <h2 class="section-title">优先级改进建议</h2>
        </div>
        
        <div class="priority-block priority-p0" v-if="reportData.prioritizedImprovements.p0 && reportData.prioritizedImprovements.p0.length > 0">
          <div class="priority-header">
            <el-tag type="danger" size="large">P0 - 紧急</el-tag>
            <span class="priority-count">{{ reportData.prioritizedImprovements.p0.length }} 项</span>
          </div>
          <div class="priority-list">
            <div v-for="(item, idx) in reportData.prioritizedImprovements.p0" :key="idx" class="priority-item">
              <div class="priority-item-index">{{ idx + 1 }}</div>
              <div class="priority-item-content">
                <div class="priority-item-title">{{ item.title }}</div>
                <div class="priority-item-desc">{{ item.description }}</div>
                <div class="priority-item-impact">预期效果: {{ item.impact }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="priority-block priority-p1" v-if="reportData.prioritizedImprovements.p1 && reportData.prioritizedImprovements.p1.length > 0">
          <div class="priority-header">
            <el-tag type="warning" size="large">P1 - 高优先级</el-tag>
            <span class="priority-count">{{ reportData.prioritizedImprovements.p1.length }} 项</span>
          </div>
          <div class="priority-list">
            <div v-for="(item, idx) in reportData.prioritizedImprovements.p1" :key="idx" class="priority-item">
              <div class="priority-item-index">{{ idx + 1 }}</div>
              <div class="priority-item-content">
                <div class="priority-item-title">{{ item.title }}</div>
                <div class="priority-item-desc">{{ item.description }}</div>
                <div class="priority-item-impact">预期效果: {{ item.impact }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="priority-block priority-p2" v-if="reportData.prioritizedImprovements.p2 && reportData.prioritizedImprovements.p2.length > 0">
          <div class="priority-header">
            <el-tag type="info" size="large">P2 - 中优先级</el-tag>
            <span class="priority-count">{{ reportData.prioritizedImprovements.p2.length }} 项</span>
          </div>
          <div class="priority-list">
            <div v-for="(item, idx) in reportData.prioritizedImprovements.p2" :key="idx" class="priority-item">
              <div class="priority-item-index">{{ idx + 1 }}</div>
              <div class="priority-item-content">
                <div class="priority-item-title">{{ item.title }}</div>
                <div class="priority-item-desc">{{ item.description }}</div>
                <div class="priority-item-impact">预期效果: {{ item.impact }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 效果预估 -->
      <div class="report-section" v-if="reportData.impactForecast">
        <div class="section-header">
          <el-icon class="section-icon"><TrendCharts /></el-icon>
          <h2 class="section-title">效果预估</h2>
        </div>
        <div class="impact-forecast">
          <div class="forecast-grid">
            <div class="forecast-card">
              <div class="forecast-icon f-green"><el-icon><View /></el-icon></div>
              <div class="forecast-label">可见度提升</div>
              <div class="forecast-value">{{ reportData.impactForecast.visibilityImprovement || '15-25%' }}</div>
            </div>
            <div class="forecast-card">
              <div class="forecast-icon f-blue"><el-icon><Cpu /></el-icon></div>
              <div class="forecast-label">技术得分提升</div>
              <div class="forecast-value">{{ reportData.impactForecast.technicalImprovement || '10-20%' }}</div>
            </div>
            <div class="forecast-card">
              <div class="forecast-icon f-orange"><el-icon><DataLine /></el-icon></div>
              <div class="forecast-label">综合健康度提升</div>
              <div class="forecast-value">{{ reportData.impactForecast.combinedImprovement || '12-22%' }}</div>
            </div>
          </div>
          <div class="forecast-note">{{ reportData.impactForecast.note || '以上预估基于行业平均值，实际效果可能因行业竞争度、内容质量等因素有所差异。' }}</div>
        </div>
      </div>

      <!-- 行动建议 -->
      <div class="report-section" v-if="reportData.actionRecommendations">
        <div class="section-header">
          <el-icon class="section-icon"><List /></el-icon>
          <h2 class="section-title">行动建议</h2>
        </div>
        <div class="action-recommendations">
          <div v-for="(action, idx) in reportData.actionRecommendations" :key="idx" class="action-item">
            <div class="action-index">{{ idx + 1 }}</div>
            <div class="action-content">
              <div class="action-title">{{ action.title }}</div>
              <div class="action-steps" v-if="action.steps && action.steps.length > 0">
                <div v-for="(step, sIdx) in action.steps" :key="sIdx" class="action-step">
                  <span class="step-num">{{ sIdx + 1 }}.</span>
                  <span class="step-text">{{ step }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="report-actions" v-if="hasData">
        <el-button @click="goBack" plain>返回</el-button>
        <el-button @click="copyToClipboard" type="primary" plain>复制报告</el-button>
        <el-button @click="downloadReport">下载报告</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { DataAnalysis, Histogram, Monitor, RefreshRight, Document, WarningFilled, Flag, TrendCharts, View, Cpu, DataLine, List, DocumentCopy, Download, ArrowLeft } from '@element-plus/icons-vue'
import { getData, saveData } from '../utils/storage'

// API配置
const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://auyologic.zeabur.app'
const AI_PROXY_URL = `${API_BASE_URL}/api/ai/generate`

const router = useRouter()
const route = useRoute()

// 状态
const generating = ref(false)
const hasData = ref(false)
const visibilityScore = ref(0)
const techScore = ref(0)
const combinedScore = ref(0)
const reportData = ref({})

// 计算属性
const healthGrade = computed(() => {
  const score = combinedScore.value
  if (score >= 80) return '优秀'
  if (score >= 60) return '良好'
  if (score >= 40) return '及格'
  return '需改进'
})

const healthGradeClass = computed(() => {
  const score = combinedScore.value
  if (score >= 80) return 'grade-green'
  if (score >= 60) return 'grade-yellow'
  return 'grade-red'
})

// 方法
const getSeverityTagType = (severity) => {
  const map = { critical: 'danger', high: 'warning', medium: 'info', low: 'success' }
  return map[severity] || 'info'
}

const getSeverityName = (severity) => {
  const map = { critical: '严重', high: '高', medium: '中', low: '低' }
  return map[severity] || severity
}

// 加载检测数据
// recordId: 可选，逗号分隔的 website-reports 数组索引，支持单条或多条（多条的techScore取加权平均）
const loadDetectionData = (recordId) => {
  const allData = getData()
  const geoResult = allData['geo-detection-result'] || null
  if (geoResult) {
    visibilityScore.value = geoResult.overallScore || 0
  }
  
  const websiteReports = allData['website-reports'] || []
  
  if (recordId !== undefined && recordId !== null && recordId !== '') {
    // 有 recordId：精确加载指定记录（支持逗号分隔多ID，取加权平均）
    const ids = recordId.split(',').map(i => parseInt(i.trim())).filter(i => !isNaN(i) && websiteReports[i])
    if (ids.length > 0) {
      const totalWeight = ids.length
      const avgTechScore = ids.reduce((sum, i) => sum + (websiteReports[i].score || 0), 0) / totalWeight
      techScore.value = Math.round(avgTechScore)
    } else {
      // ID无效，兜底
      if (websiteReports.length > 0) {
        techScore.value = websiteReports[0].score || 0
      } else {
        const siteScore = allData['dashboard-site-score']
        techScore.value = siteScore ? siteScore.score || 0 : 0
      }
    }
  } else {
    // 无 recordId：兜底逻辑（取最新）
    if (websiteReports.length > 0) {
      techScore.value = websiteReports[0].score || 0
    } else {
      const siteScore = allData['dashboard-site-score']
      if (siteScore) {
        techScore.value = siteScore.score || 0
      }
    }
  }
  
  combinedScore.value = Math.round(visibilityScore.value * 0.4 + techScore.value * 0.6)
  hasData.value = visibilityScore.value > 0 || techScore.value > 0
}

// 生成报告
const generateReport = async () => {
  if (!hasData.value) {
    ElMessage.warning('请先完成检测')
    return
  }
  
  generating.value = true
  
  try {
    const allData = getData()
    const geoResult = allData['geo-detection-result'] || {}
    const websiteReports = allData['website-reports'] || []
    const recordId = route.query.recordId
    let techReportToUse = websiteReports[0] || null
    if (recordId) {
      const ids = recordId.split(',').map(i => parseInt(i.trim())).filter(i => !isNaN(i))
      if (ids.length > 0 && websiteReports[ids[0]]) {
        techReportToUse = websiteReports[ids[0]]
      }
    }
    
    const detectionData = {
      combinedScore: combinedScore.value,
      visibilityScore: visibilityScore.value,
      techScore: techScore.value,
      geoDetails: {
        visibleCount: geoResult.visibleCount || 0,
        missingCount: geoResult.missingCount || 0,
        platformCount: geoResult.platformCount || 0
      },
      techDetails: techReportToUse ? {
        items: techReportToUse.items || {},
        issues: techReportToUse.issues || { warn: [], pass: [] }
      } : null
    }
    
    const aiReport = await generateAIReport(detectionData)
    
    reportData.value = { ...aiReport, detectionData: detectionData }
    saveReportToStorage()
    
    ElMessage.success('报告生成成功')
  } catch (error) {
    console.error('生成报告失败:', error)
    ElMessage.error('生成报告失败，请重试')
  } finally {
    generating.value = false
  }
}

// AI生成报告
const generateAIReport = async (detectionData) => {
  const prompt = `基于以下网站 GEO 检测结果，生成一份专业的改进方案报告。

## 检测数据
- 综合健康度得分: ${detectionData.combinedScore}分
- 可见度得分: ${detectionData.visibilityScore}分 (权重40%)
- 技术检测得分: ${detectionData.techScore}分 (权重60%)
- 品牌可见数量: ${detectionData.geoDetails.visibleCount}
- 品牌缺失数量: ${detectionData.geoDetails.missingCount}
- 检测平台数: ${detectionData.geoDetails.platformCount}

${detectionData.techDetails ? `
## 技术检测详情
- 技术基础得分: ${detectionData.techDetails.items.tech?.score || 0}/25
- 页面结构得分: ${detectionData.techDetails.items.structure?.score || 0}/25
- 结构化数据得分: ${detectionData.techDetails.items.schema?.score || 0}/25
- AI亲和性得分: ${detectionData.techDetails.items.aiFriendly?.score || 0}/25

## 待改进问题:
${detectionData.techDetails.issues.warn.map(i => `- ${i.title}: ${i.desc}`).join('\n')}
` : ''}

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

  try {
    const response = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        systemPrompt: '你是一个专业的GEO优化顾问，擅长生成结构化的改进方案报告。请严格按照JSON格式返回。',
        prompt,
        temperature: 0.5,
        max_tokens: 3000
      })
    })
    
    if (!response.ok) throw new Error(`API请求失败: ${response.status}`)
    
    const data = await response.json()
    const content = data.content || ''
    if (!content) throw new Error('API返回内容为空')
    
    let result
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content)
    } catch (parseError) {
      console.error('解析JSON失败:', parseError)
      result = getDefaultReport(detectionData)
    }
    return result
  } catch (error) {
    console.error('AI代理调用失败:', error)
    return getDefaultReport(detectionData)
  }
}

// 默认报告
const getDefaultReport = (detectionData) => {
  const score = detectionData.combinedScore
  return {
    executiveSummary: `您的网站 GEO 综合健康度得分为 ${score} 分，${score >= 60 ? '整体表现良好，但仍存在部分可优化的空间。' : '需要重点改进可见度和技术优化。'} 建议优先处理品牌内容缺失和网站技术问题。`,
    criticalFindings: [
      { severity: detectionData.geoDetails.missingCount > 0 ? 'critical' : 'medium', title: '品牌内容缺口', description: `在 ${detectionData.geoDetails.missingCount} 个问题中品牌未被 AI 平台提及。` },
      { severity: detectionData.techScore < 60 ? 'high' : 'medium', title: '技术 SEO 优化空间', description: `技术检测得分为 ${detectionData.techScore} 分。` }
    ],
    prioritizedImprovements: {
      p0: [{ title: '补充品牌缺失内容', description: '针对未被 AI 提及的问题创作覆盖内容', impact: '可见度提升 10-15%' }],
      p1: [
        { title: '优化网站技术配置', description: '完善 robots.txt、Canonical 标签', impact: '技术得分提升 5-10%' },
        { title: '添加结构化数据', description: '为页面添加 JSON-LD Schema', impact: '收录效率提升 15-20%' }
      ],
      p2: [
        { title: '优化页面加载速度', description: '启用 Gzip 压缩、优化图片', impact: '用户体验提升' },
        { title: '增加 FAQ 内容', description: '添加常见问题解答板块', impact: 'AI 亲和性提升' }
      ]
    },
    impactForecast: { visibilityImprovement: '15-25%', technicalImprovement: '10-20%', combinedImprovement: '12-22%', note: '以上预估基于行业平均值，实际效果可能因行业竞争度等因素有所差异。' },
    actionRecommendations: [
      { title: '立即处理品牌内容缺口', steps: ['分析可见度检测结果', '生成覆盖内容', '重新检测验证效果'] },
      { title: '优化网站技术配置', steps: ['检查并创建 robots.txt', '添加 Canonical 标签', '添加 JSON-LD 结构化数据'] }
    ]
  }
}

// 保存报告
const saveReportToStorage = () => {
  const allData = getData()
  const recordId = route.query.recordId
  allData['geo-report'] = {
    ...reportData.value,
    generatedAt: new Date().toISOString(),
    scores: { combined: combinedScore.value, visibility: visibilityScore.value, tech: techScore.value },
    recordId: recordId || null // 记录关联的 website-reports 索引
  }
  saveData(allData)
}

// 复制报告
const copyToClipboard = async () => {
  try {
    const reportText = formatReportAsText()
    await navigator.clipboard.writeText(reportText)
    ElMessage.success('报告已复制到剪贴板')
  } catch (error) {
    ElMessage.error('复制失败，请重试')
  }
}

// 格式化报告
const formatReportAsText = () => {
  const data = reportData.value
  return `# GEO 改进方案报告
生成时间: ${new Date().toLocaleString('zh-CN')}

## 综合健康度
- 综合得分: ${combinedScore.value}分 (${healthGrade.value})
- 可见度得分: ${visibilityScore.value}分 × 40%
- 技术检测得分: ${techScore.value}分 × 60%

## 执行摘要
${data.executiveSummary || '无'}

## 关键发现
${(data.criticalFindings || []).map((f, i) => `${i + 1}. [${getSeverityName(f.severity)}] ${f.title}: ${f.description}`).join('\n')}

## 优先级改进建议
### P0 - 紧急
${(data.prioritizedImprovements?.p0 || []).map((p, i) => `${i + 1}. ${p.title}: ${p.description} (${p.impact})`).join('\n')}

### P1 - 高优先级
${(data.prioritizedImprovements?.p1 || []).map((p, i) => `${i + 1}. ${p.title}: ${p.description} (${p.impact})`).join('\n')}

### P2 - 中优先级
${(data.prioritizedImprovements?.p2 || []).map((p, i) => `${i + 1}. ${p.title}: ${p.description} (${p.impact})`).join('\n')}

## 效果预估
- 可见度提升: ${data.impactForecast?.visibilityImprovement || '-'}
- 技术得分提升: ${data.impactForecast?.technicalImprovement || '-'}
- 综合健康度提升: ${data.impactForecast?.combinedImprovement || '-'}
- 说明: ${data.impactForecast?.note || ''}

## 行动建议
${(data.actionRecommendations || []).map((a, i) => `${i + 1}. ${a.title}\n${(a.steps || []).map((s, si) => `   ${s}`).join('\n')}`).join('\n')}
`
}

// 下载报告
const downloadReport = () => {
  const reportText = formatReportAsText()
  const blob = new Blob([reportText], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `GEO改进方案报告_${new Date().toISOString().slice(0, 10)}.md`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('报告已下载')
}

// 返回上一页
const goBack = () => router.back()

// 跳转
const goToGEODetection = () => router.push('/geo-detection')
const goToWebsiteOptimization = () => router.push('/website-optimization')

// 初始化
onMounted(() => {
  const recordId = route.query.recordId
  loadDetectionData(recordId)
  const allData = getData()
  const savedReport = allData['geo-report']
  if (savedReport && savedReport.scores) {
    reportData.value = savedReport
  }
})
</script>

<style scoped>
.gr-page { max-width: 1100px; margin: 0 auto; padding: 28px 32px; font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; }
.gr-header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #ebeef5; }
.gr-header-icon { width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, #7070f0, #9090f5); display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; }
.gr-title { font-size: 20px; font-weight: 700; color: #1a1a1a; margin: 0 0 4px 0; }
.gr-subtitle { font-size: 13px; color: #909399; margin: 0; }
.gr-header-actions { margin-left: auto; }
.gr-empty-card { background: white; border: 1px solid #ebeef5; border-radius: 16px; padding: 60px 20px; }
.empty-actions { display: flex; gap: 12px; justify-content: center; margin-top: 20px; }
.gr-report { display: flex; flex-direction: column; gap: 20px; }
.report-section { background: white; border: 1px solid #ebeef5; border-radius: 16px; padding: 24px; }
.section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #f0f0f0; }
.section-icon { font-size: 20px; color: #7070f0; }
.section-title { font-size: 16px; font-weight: 600; color: #1a1a1a; margin: 0; }
.health-section { background: linear-gradient(135deg, #f8f9ff, #fff); border-color: #e0e4ff; }
.health-score-display { display: flex; align-items: center; gap: 40px; }
.health-main-score { width: 160px; height: 160px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: white; border: 4px solid #e4e7ed; flex-shrink: 0; }
.health-main-score.grade-green { border-color: #67c23a; }
.health-main-score.grade-yellow { border-color: #e6a23c; }
.health-main-score.grade-red { border-color: #f56c6c; }
.health-main-score .score-value { font-size: 48px; font-weight: 900; color: #303133; line-height: 1; }
.health-main-score .score-label { font-size: 13px; color: #909399; margin: 4px 0; }
.health-main-score .score-grade { font-size: 18px; font-weight: 700; }
.grade-green .score-grade { color: #67c23a; }
.grade-yellow .score-grade { color: #e6a23c; }
.grade-red .score-grade { color: #f56c6c; }
.health-breakdown { flex: 1; display: flex; flex-direction: column; gap: 20px; }
.breakdown-item { background: white; border-radius: 12px; padding: 16px; border: 1px solid #ebeef5; }
.breakdown-label { font-size: 13px; color: #606266; margin-bottom: 8px; }
.breakdown-value { font-size: 24px; font-weight: 700; color: #303133; }
.breakdown-bar { height: 6px; background: #f0f0f0; border-radius: 3px; margin-top: 10px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; transition: width 1s ease; }
.visibility-fill { background: linear-gradient(90deg, #67c23a, #85ce61); }
.tech-fill { background: linear-gradient(90deg, #409eff, #66b1ff); }
.summary-content { font-size: 14px; line-height: 1.8; color: #606266; }
.findings-list { display: flex; flex-direction: column; gap: 12px; }
.finding-card { background: #f9f9f9; border-radius: 10px; padding: 16px; border-left: 3px solid #e6a23c; }
.finding-critical { border-left-color: #f56c6c; background: #fef5f5; }
.finding-high { border-left-color: #e6a23c; background: #fdf6ec; }
.finding-medium { border-left-color: #409eff; background: #ecf5ff; }
.finding-low { border-left-color: #67c23a; background: #f0f9eb; }
.finding-severity { margin-bottom: 8px; }
.finding-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 6px; }
.finding-desc { font-size: 13px; color: #606266; line-height: 1.5; }
.priority-block { margin-bottom: 20px; }
.priority-block:last-child { margin-bottom: 0; }
.priority-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.priority-count { font-size: 13px; color: #909399; }
.priority-list { display: flex; flex-direction: column; gap: 10px; }
.priority-item { display: flex; gap: 12px; padding: 14px; background: #fafafa; border-radius: 10px; border: 1px solid #ebeef5; }
.priority-p0 .priority-item { background: #fef5f5; border-color: #fde2e2; }
.priority-p1 .priority-item { background: #fdf6ec; border-color: #f5dab1; }
.priority-item-index { width: 24px; height: 24px; border-radius: 50%; background: #dcdfe6; color: #606266; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
.priority-p0 .priority-item-index { background: #f56c6c; color: white; }
.priority-p1 .priority-item-index { background: #e6a23c; color: white; }
.priority-item-content { flex: 1; }
.priority-item-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 6px; }
.priority-item-desc { font-size: 13px; color: #606266; line-height: 1.5; margin-bottom: 8px; }
.priority-item-impact { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #67c23a; background: #f0f9eb; padding: 4px 10px; border-radius: 20px; }
.impact-forecast { display: flex; flex-direction: column; gap: 20px; }
.forecast-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.forecast-card { background: #f9f9f9; border-radius: 12px; padding: 20px; text-align: center; }
.forecast-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; font-size: 22px; color: white; }
.forecast-icon.f-green { background: linear-gradient(135deg, #67c23a, #85ce61); }
.forecast-icon.f-blue { background: linear-gradient(135deg, #409eff, #66b1ff); }
.forecast-icon.f-orange { background: linear-gradient(135deg, #e6a23c, #f5c97c); }
.forecast-label { font-size: 13px; color: #909399; margin-bottom: 8px; }
.forecast-value { font-size: 20px; font-weight: 700; color: #303133; }
.forecast-note { font-size: 13px; color: #909399; background: #f5f7fa; padding: 12px 16px; border-radius: 8px; line-height: 1.6; }
.action-recommendations { display: flex; flex-direction: column; gap: 16px; }
.action-item { display: flex; gap: 14px; padding: 16px; background: #fafafa; border-radius: 10px; border: 1px solid #ebeef5; }
.action-index { width: 28px; height: 28px; border-radius: 50%; background: #7070f0; color: white; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex-shrink: 0; }
.action-content { flex: 1; }
.action-title { font-size: 14px; font-weight: 600; color: #303133; margin-bottom: 10px; }
.action-steps { display: flex; flex-direction: column; gap: 6px; }
.action-step { display: flex; gap: 8px; font-size: 13px; color: #606266; }
.step-num { color: #909399; flex-shrink: 0; }
.step-text { line-height: 1.5; }
.report-actions { display: flex; justify-content: center; gap: 16px; padding: 20px 0; }
@media (max-width: 768px) {
  .health-score-display { flex-direction: column; text-align: center; }
  .forecast-grid { grid-template-columns: 1fr; }
}
</style>
