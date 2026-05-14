<template>
  <div class="wo-page">
    <!-- 顶部标题 -->
    <div class="wo-header">
      <div class="wo-header-icon">
        <el-icon><Monitor /></el-icon>
      </div>
      <div>
        <h1 class="wo-title">网站优化检测</h1>
        <p class="wo-subtitle">分析网站技术 GEO 与 AI 抓取友好度，获取可执行的改进建议</p>
      </div>
    </div>

    <!-- ===== 检测模式 ===== -->
    <div v-if="!report" class="wo-check-card">
      <div class="wo-check-intro">
        <h2 class="section-title">输入网站地址</h2>
        <p class="section-desc">系统将从 4 个维度分析您的网站，评估其被 AI 搜索引擎收录的友好程度</p>
      </div>

      <div class="wo-input-row">
        <el-input
          v-model="inputUrl"
          placeholder="输入网址，如 www.yoursite.com"
          size="large"
          class="wo-url-input"
          @keyup.enter="handleStartCheck"
          :disabled="checking"
        >
          <template #prepend>
            <span class="input-scheme">https://</span>
          </template>
        </el-input>
        <el-button
          type="primary"
          size="large"
          class="wo-check-btn"
          @click="handleStartCheck"
          :loading="checking"
          :disabled="!inputUrl.trim()"
        >
          {{ checking ? '检测中...' : '开始检测' }}
        </el-button>
      </div>

      <!-- 检测维度说明 -->
      <div class="wo-dimensions">
        <div
          v-for="dim in dimensions"
          :key="dim.key"
          class="wo-dim-item"
          :class="{ done: dim.done, active: dim.active }"
        >
          <div class="wo-dim-icon">
            <el-icon v-if="dim.done"><Check /></el-icon>
            <el-icon v-else-if="dim.active"><Loading /></el-icon>
            <span v-else>{{ dim.index + 1 }}</span>
          </div>
          <div class="wo-dim-text">
            <div class="wo-dim-name">{{ dim.name }}</div>
            <div class="wo-dim-desc">{{ dim.desc }}</div>
          </div>
        </div>
      </div>

      <!-- 历史报告 -->
      <div v-if="reportHistory.length > 0" class="wo-history">
        <div class="wo-history-header">
          <div class="section-title">历史报告</div>
          <div class="wo-history-actions">
            <el-button
              size="small"
              type="primary"
              :disabled="selectedHistory.length === 0"
              @click="generateReport"
            >
              <el-icon class="mr-1"><Document /></el-icon>
              生成GEO报告 ({{ selectedHistory.length }})
            </el-button>
            <el-button
              size="small"
              type="warning"
              :disabled="selectedHistory.length !== 1"
              @click="handleRecheckSelected"
            >
              <el-icon class="mr-1"><RefreshRight /></el-icon>
              重新检测
            </el-button>
            <el-button
              size="small"
              type="danger"
              :disabled="selectedHistory.length === 0"
              @click="handleBatchDelete"
            >
              删除选中 ({{ selectedHistory.length }})
            </el-button>
            <el-button size="small" @click="handleClearHistory">清空全部</el-button>
          </div>
        </div>
        <div class="wo-history-list">
          <div
            v-for="(r, idx) in reportHistory"
            :key="idx"
            class="wo-history-item"
            :class="{ selected: selectedHistory.includes(idx) }"
            @click="handleViewReport(r)"
          >
            <el-checkbox
              :model-value="selectedHistory.includes(idx)"
              @click.stop
              @change="toggleSelect(idx)"
              class="history-checkbox"
            />
            <el-button size="small" type="primary" link @click.stop="handleRecheck(r.url)" class="history-recheck-btn">
              <el-icon><RefreshRight /></el-icon>
            </el-button>
            <div class="wo-history-score" :class="getScoreClass(r.score)">
              {{ r.score }}
            </div>
            <div class="wo-history-info">
              <div class="wo-history-url">{{ r.url }}</div>
              <div class="wo-history-time">{{ formatTime(r.checkedAt) }}</div>
            </div>
            <div class="wo-history-grade">
              <el-tag size="small" :type="getGradeTagType(r.score)" round>
                {{ getGradeName(r.score) }}
              </el-tag>
            </div>
            <div class="wo-history-geo-badge" v-if="hasGeoReport(r)" title="已有GEO报告">
              <el-icon color="#7070f0"><Document /></el-icon>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 报告模式 ===== -->
    <div v-else class="wo-report">
      <!-- 操作栏 -->
      <div class="wo-report-toolbar">
        <el-button text @click="handleNewCheck" class="back-btn">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <div class="wo-report-url">
          <el-icon><Link /></el-icon>
          <span>{{ report.url }}</span>
        </div>
        <div class="wo-report-time">
          <el-icon><Clock /></el-icon>
          <span>{{ formatTime(report.checkedAt) }}</span>
        </div>
        <div class="wo-report-actions">
          <el-button @click="handleExportReport">
            <el-icon class="mr-1"><Download /></el-icon>
            导出报告
          </el-button>
          <el-button type="primary" @click="handleSaveReport">
            <el-icon class="mr-1"><FolderOpened /></el-icon>
            保存报告
          </el-button>
        </div>
      </div>

      <!-- 综合得分 -->
      <div class="wo-score-section">
        <div class="wo-score-circle" :class="scoreClass">
          <svg viewBox="0 0 120 120" class="score-ring">
            <circle cx="60" cy="60" r="52" class="ring-bg" />
            <circle
              cx="60" cy="60" r="52"
              class="ring-fill"
              :stroke-dasharray="`${report.score * 3.27} 327`"
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div class="score-inner">
            <div class="score-number">{{ report.score }}</div>
            <div class="score-total">/100</div>
          </div>
        </div>
        <div class="wo-score-grade">
          <div class="grade-label">综合评级</div>
          <div class="grade-name" :class="gradeClass">{{ gradeName }}</div>
          <div class="grade-desc">{{ gradeDesc }}</div>
        </div>

        <!-- 知名网站保底提示 -->
        <div v-if="famousSiteBonus" class="famous-bonus-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>{{ famousSiteBonus.name }}为知名{{ famousSiteBonus.type }}网站，已获得+{{ famousSiteBonus.bonus }}分保底分数</span>
        </div>

        <!-- 评分说明 -->
        <div class="score-explain-tip">
          <el-icon><InfoFilled /></el-icon>
          <span>本评分基于网站技术指标（SEO配置、结构化数据、AI抓取友好度），不反映品牌知名度</span>
        </div>

        <!-- 维度得分 -->
        <div class="wo-dim-scores">
          <div
            v-for="(item, key) in report.items"
            :key="key"
            class="wo-dim-score-card"
            :style="{ '--accent': dimColors[key] }"
          >
            <div class="dim-score-num">{{ item.score }}</div>
            <div class="dim-score-label">{{ dimLabels[key] }}</div>
            <div class="dim-score-bar">
              <div class="dim-score-fill" :style="{ width: item.score + '%' }" />
            </div>
            <div class="dim-score-detail">{{ item.checked }} / {{ item.total }} 项通过</div>
          </div>
        </div>
      </div>

      <!-- 问题与建议 -->
      <div class="wo-issues-section">
        <div class="issues-tabs">
          <button
            v-for="tab in issueTabs"
            :key="tab.key"
            :class="['issue-tab', { active: activeIssueTab === tab.key }]"
            @click="activeIssueTab = tab.key"
          >
            <el-icon :class="'tab-icon-' + tab.key"><component :is="tab.icon" /></el-icon>
            {{ tab.label }}
            <el-badge :value="report.issues[tab.key].length" :type="tab.key === 'warn' ? 'warning' : 'success'" />
          </button>
        </div>

        <div class="issues-list">
          <div
            v-for="(issue, idx) in report.issues[activeIssueTab]"
            :key="idx"
            class="issue-card"
            :class="'issue-' + issue.level"
          >
            <div class="issue-icon">
              <el-icon v-if="issue.level === 'warn'"><WarnTriangleFilled /></el-icon>
              <el-icon v-else><CircleCheckFilled /></el-icon>
            </div>
            <div class="issue-body">
              <div class="issue-title">{{ issue.title }}</div>
              <div class="issue-desc">{{ issue.desc }}</div>
              <div class="issue-fix" v-if="issue.fix">
                <el-icon><Key /></el-icon>
                {{ issue.fix }}
              </div>
            </div>
            <div class="issue-score-impact">
              <span :class="'impact-badge impact-' + issue.level">
                {{ issue.level === 'warn' ? '-' + issue.impact : '+' + issue.impact }}分
              </span>
            </div>
          </div>

          <div v-if="report.issues[activeIssueTab].length === 0" class="issues-empty">
            <el-icon size="36" class="text-gray-300 mb-2"><CircleCheck /></el-icon>
            <p>该维度暂无问题，继续保持</p>
          </div>
        </div>
      </div>

      <!-- 维度详细数据 -->
      <div class="wo-details-section">
        <div class="details-title">检测明细</div>
        <el-table :data="detailTableData" stripe class="wo-details-table">
          <el-table-column prop="dimension" label="检测维度" width="140" />
          <el-table-column prop="item" label="检测项" />
          <el-table-column prop="result" label="检测结果" width="120">
            <template #default="{ row }">
              <el-tag :type="row.result === 'pass' ? 'success' : 'danger'" size="small" round>
                {{ row.result === 'pass' ? '通过' : '未通过' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="value" label="实际值" width="180" />
          <el-table-column prop="suggestion" label="建议" />
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElNotification } from 'element-plus'
import {
  Monitor, Check, Loading, Link, Clock, RefreshRight, Download,
  WarnTriangleFilled, CircleCheckFilled, Key, CircleCheck, FolderOpened, ArrowLeft, InfoFilled, Document
} from '@element-plus/icons-vue'
import { formatZhCnYmdHm, formatZhCnYmd } from '../utils/dateTime.js'

const API_BASE_URL = window.VITE_API_URL || window.location.origin
const WEBSITE_REPORTS_API = `${API_BASE_URL}/api/website-reports`

const router = useRouter()
const route = useRoute()

// ===== 常量 =====
const dimLabels = {
  tech: '技术基础',
  structure: '页面结构',
  schema: '结构化数据',
  aiFriendly: 'AI亲和性'
}

const dimColors = {
  tech: '#409eff',
  structure: '#67c23a',
  schema: '#e6a23c',
  aiFriendly: '#7070f0'
}

// ===== 状态 =====
const inputUrl = ref('')

const checking = ref(false)
const report = ref(null)
const activeIssueTab = ref('warn')
const reportHistory = ref([])
const selectedHistory = ref([])

const issueTabs = [
  { key: 'warn', label: '待改进', icon: 'WarnTriangleFilled' },
  { key: 'pass', label: '已通过', icon: 'CircleCheckFilled' }
]

// ===== 检测进度维度 =====
const dimensions = ref([
  { key: 'tech', name: '技术基础', desc: 'HTTPS / robots.txt / 加载速度', index: 0, done: false, active: false },
  { key: 'structure', name: '页面渲染', desc: 'SSR / CSR / 加载速度', index: 1, done: false, active: false },
  { key: 'schema', name: '结构化数据', desc: 'JSON-LD / OpenGraph / Schema', index: 2, done: false, active: false },
  { key: 'ai', name: 'AI亲和性', desc: '爬虫友好度 / FAQ内容 / AI深度分析', index: 3, done: false, active: false }
])

// 知名网站保底分数提示
const famousSiteBonus = computed(() => {
  if (!report.value?.famousSiteBonus) return null
  return report.value.famousSiteBonus
})

// ===== 计算属性 =====
const detailTableData = computed(() => {
  if (!report.value) return []
  return report.value.details
})

const scoreClass = computed(() => {
  if (!report.value) return ''
  if (report.value.score >= 80) return 'score-green'
  if (report.value.score >= 60) return 'score-yellow'
  return 'score-red'
})

const gradeClass = computed(() => {
  if (!report.value) return ''
  if (report.value.score >= 80) return 'grade-green'
  if (report.value.score >= 60) return 'grade-yellow'
  return 'grade-red'
})

const gradeName = computed(() => {
  if (!report.value) return ''
  if (report.value.score >= 70) return '优秀'
  if (report.value.score >= 55) return '良好'
  if (report.value.score >= 40) return '及格'
  return '需改进'
})

const gradeDesc = computed(() => {
  if (!report.value) return ''
  if (report.value.score >= 70) return '您的网站容易被AI引用，技术配置良好'
  if (report.value.score >= 55) return '网站AI友好度不错，部分细节可优化'
  if (report.value.score >= 40) return '网站基础合格，建议按提示优化AI抓取友好度'
  return '网站AI抓取有待提升，建议重点优化AI亲和性'
})

// ===== 方法 =====
// 进度更新回调
const updateProgress = (progress, dimension) => {
  if (!dimension || dimension === 'complete') {
    dimensions.value.forEach(d => { d.done = true; d.active = false })
    return
  }
  const dimMap = { tech: 0, structure: 1, schema: 2, aiFriendly: 3 }
  const dimIndex = dimMap[dimension]
  if (dimIndex !== undefined) {
    dimensions.value.forEach((d, i) => {
      if (i < dimIndex) { d.done = true; d.active = false }
      else if (i === dimIndex) { d.active = true; d.done = false }
      else { d.done = false; d.active = false }
    })
  }
}

// 根据检测项获取维度
const getDimByItem = (itemName) => {
  const dimMap = {
    'HTTPS 协议': '技术基础', 'robots.txt': '技术基础', 'Canonical 标签': '技术基础',
    'Title 标签': '页面结构', 'Meta Description': '页面结构', 'H1 标签': '页面结构',
    'H2-H6层级': '页面结构', '内容长度': '页面结构', '图片Alt标签': '页面结构',
    'JSON-LD Schema': '结构化数据', 'OpenGraph标签': '结构化数据',
    '服务端渲染': 'AI亲和性', 'FAQ内容': 'AI亲和性', 'AI爬虫权限': 'AI亲和性',
    'AI内容质量': 'AI亲和性', 'AI结构化程度': 'AI亲和性', 'AI实体提及': 'AI亲和性', 'GEO优化要素': 'AI亲和性'
  }
  return dimMap[itemName] || ''
}

const handleStartCheck = async () => {
  if (!isValidUrl(inputUrl.value)) {
    ElMessage.error("请检查网站格式！")
    return
  }

  report.value = null
  dimensions.value.forEach(d => { d.done = false; d.active = false })
  checking.value = true
  ElNotification({
    title: '正在检测',
    type: 'info',
    duration: 3000,
    position: 'top-right',
    offset: 60
  })

  try {
    // 通过后端 API 检测（解决浏览器 CORS 问题）
    const res = await fetch(`${API_BASE_URL}/api/website-analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        apiKey: 'dummy' // 后端服务目前不需要真实 key
      })
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '检测失败' }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }

    const result = await res.json()
    if (!result.success) {
      throw new Error(result.error || '检测服务异常')
    }

    const emptyDim = () => ({ score: 0, checked: 0, total: 0, items: [] })
    const dimMap = {
      tech: result.tech || emptyDim(),
      structure: result.structure || emptyDim(),
      schema: result.schema || emptyDim(),
      aiFriendly: result.aiFriendly || emptyDim(),
    }

    let totalScore = Math.min(
      100,
      Number(result.overallScore) ||
        Math.round(
          dimMap.tech.score * 0.22 +
            dimMap.structure.score * 0.28 +
            dimMap.schema.score * 0.22 +
            dimMap.aiFriendly.score * 0.28
        )
    )

    const rawDetails = Array.isArray(result.details) ? result.details : []
    const detailsNormalized = rawDetails.map((d) => ({
      dimension: d.dimension || '',
      item: d.item ?? d.name ?? '',
      result: d.result === 'pass' ? 'pass' : 'fail',
      value: d.value ?? '',
      suggestion: d.suggestion || (d.result === 'pass' ? '保持现状' : '建议优化'),
    }))

    report.value = {
      url: result.url || targetUrl,
      score: totalScore,
      items: dimMap,
      issues: result.issues &&
        typeof result.issues === 'object' &&
        Array.isArray(result.issues.warn) &&
        Array.isArray(result.issues.pass)
        ? result.issues
        : { warn: [], pass: [] },
      checkedAt: result.checkedAt || new Date().toISOString(),
      famousSiteBonus: result.famousSiteBonus || null,
      details:
        detailsNormalized.length > 0
          ? detailsNormalized
          : [
              ...(dimMap.tech.items || []).map((i) => ({ ...i, dimension: '技术基础', item: i.name })),
              ...(dimMap.structure.items || []).map((i) => ({ ...i, dimension: '页面结构', item: i.name })),
              ...(dimMap.schema.items || []).map((i) => ({ ...i, dimension: '结构化数据', item: i.name })),
              ...(dimMap.aiFriendly.items || []).map((i) => ({ ...i, dimension: 'AI亲和性', item: i.name })),
            ].map((row) => ({
              dimension: row.dimension,
              item: row.item || row.name,
              result: row.result === 'pass' ? 'pass' : 'fail',
              value: row.value ?? '',
              suggestion: row.result === 'pass' ? '保持现状' : '建议优化',
            })),
    }

    updateProgress(0, 'complete')
  } catch (error) {
    console.error('检测失败:', error)
    ElMessage.error({ message: '检测失败: ' + error.message, offset: 80 })
  }
  checking.value = false
  if (report.value) {
    syncToDashboard()
    // 自动保存到后端
    await autoSaveReport()
  }
}
function isValidUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);

    // 只允许 http 和 https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    return true;
  } catch (err) {
    return false;
  }
}
// 自动保存报告到后端
const autoSaveReport = async () => {
  if (!report.value) return

  const userId = 'default_user'
  const reportData = {
    url: report.value.url,
    score: report.value.score,
    items: JSON.stringify(report.value.items),
    issues: JSON.stringify(report.value.issues),
    details: JSON.stringify(report.value.details),
    checkedAt: report.value.checkedAt
  }

  try {
    // 先检查是否已存在相同 URL 的记录
    const checkRes = await fetch(WEBSITE_REPORTS_API, {
      headers: { 'x-user-id': userId }
    })
    let existingId = null
    if (checkRes.ok) {
      const existingReports = await checkRes.json()
      const existing = existingReports.find(r => r.url === report.value.url)
      existingId = existing?.id
    }

    let res
    if (existingId) {
      // 存在则更新
      res = await fetch(`${WEBSITE_REPORTS_API}/${existingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify(reportData)
      })
    } else {
      // 不存在则新增
      res = await fetch(WEBSITE_REPORTS_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        },
        body: JSON.stringify(reportData)
      })
    }

    if (res.ok) {
      console.log('✅ 报告已保存到后端')
      await loadHistory()
    }
  } catch (e) {
    console.warn('自动保存失败:', e)
  }
}

const handleNewCheck = () => {
  report.value = null
  inputUrl.value = ''
  selectedHistory.value = []
}

const handleSaveReport = async () => {
  const allData = JSON.parse(localStorage.getItem('auyologic_data') || '{}')

  // 保存到历史记录
  if (!allData['website-reports']) allData['website-reports'] = []
  allData['website-reports'].unshift({ ...report.value })
  if (allData['website-reports'].length > 20) allData['website-reports'].pop()

  // 同步最新得分到 Dashboard
  allData['dashboard-site-score'] = {
    score: report.value.score,
    url: report.value.url,
    updatedAt: report.value.checkedAt
  }

  localStorage.setItem('auyologic_data', JSON.stringify(allData))
  loadHistory()

  // 同时保存到后端
  await autoSaveReport()

  ElMessage.success({ message: '报告已保存', offset: 80 })
}

const handleExportReport = () => {
  const data = JSON.stringify(report.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `网站优化检测_${report.value.url}_${formatZhCnYmd()}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success({ message: '报告已导出', offset: 80 })
}

const handleViewReport = (r) => {
  report.value = r
  inputUrl.value = String(r.url || '').trim().replace(/^https?:\/\//i, '')
  selectedHistory.value = []
}

// 重新检测选中的记录
const handleRecheckSelected = async () => {
  if (selectedHistory.value.length === 0) {
    ElMessage.warning('请先选择要重新检测的记录')
    return
  }
  if (selectedHistory.value.length > 1) {
    ElMessage.warning('每次只能重新检测一个网址，请只选择一个')
    return
  }
  // 获取选中的记录
  const idx = selectedHistory.value[0]
  const record = reportHistory.value[idx]
  await handleRecheck(record.url)
}

const handleRecheck = async (url) => {
  inputUrl.value = String(url || '').trim().replace(/^https?:\/\//i, '')
  await handleStartCheck()
}

const handleClearHistory = async () => {
  const userId = 'default_user'
  // 同步删除后端全部记录
  try {
    await fetch(WEBSITE_REPORTS_API, {
      method: 'DELETE',
      headers: { 'x-user-id': userId }
    })
  } catch (e) {
    console.warn('从后端删除失败:', e)
  }

  const allData = JSON.parse(localStorage.getItem('auyologic_data') || '{}')
  allData['website-reports'] = []
  localStorage.setItem('auyologic_data', JSON.stringify(allData))
  selectedHistory.value = []
  loadHistory()
  ElMessage.success({ message: '历史已清空', offset: 80 })
}

const loadHistory = async () => {
  const userId = 'default_user'
  try {
    const res = await fetch(WEBSITE_REPORTS_API, {
      headers: { 'x-user-id': userId }
    })
    if (res.ok) {
      const data = await res.json()
      // 转换后端数据格式
      reportHistory.value = Array.isArray(data) ? data.map(r => ({
        id: r.id, // 后端返回的记录ID
        url: r.url,
        score: r.score,
        items: JSON.parse(r.items || '{}'),
        issues: JSON.parse(r.issues || '{"warn":[],"pass":[]}'),
        details: JSON.parse(r.details || '[]'),
        checkedAt: r.checkedAt
      })) : []
      return
    }
  } catch (e) {
    console.error('从后端加载历史失败:', e)
    ElMessage.error({ message: '加载历史记录失败，请刷新重试', offset: 80 })
    reportHistory.value = []
  }
}

const toggleSelect = (idx) => {
  const pos = selectedHistory.value.indexOf(idx)
  if (pos === -1) {
    selectedHistory.value.push(idx)
  } else {
    selectedHistory.value.splice(pos, 1)
  }
}

const handleBatchDelete = async () => {
  const userId = 'default_user'

  // 从后端删除选中的记录
  const idsToDelete = selectedHistory.value.map(i => reportHistory.value[i].id).filter(Boolean)
  for (const id of idsToDelete) {
    try {
      await fetch(`${API_BASE_URL}/api/website-reports/${id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': userId }
      })
    } catch (e) {
      console.warn('从后端删除失败:', e)
    }
  }

  const allData = JSON.parse(localStorage.getItem('auyologic_data') || '{}')
  const filtered = (allData['website-reports'] || []).filter((_, i) => !selectedHistory.value.includes(i))
  allData['website-reports'] = filtered
  localStorage.setItem('auyologic_data', JSON.stringify(allData))
  selectedHistory.value = []
  loadHistory()
  ElMessage.success({ message: '已删除选中的报告', offset: 80 })
}

// 检查指定记录是否有GEO报告
const hasGeoReport = (record) => {
  const allData = JSON.parse(localStorage.getItem('auyologic_data') || '{}')
  const geoReport = allData['geo-report']
  if (!geoReport || !geoReport.generatedAt) return false
  const geoTime = new Date(geoReport.generatedAt).getTime()
  const recordTime = record.checkedAt ? new Date(record.checkedAt).getTime() : 0
  return geoTime >= recordTime - 5000 // 报告生成时间晚于记录时间（5秒容差）
}

// 跳转到GEO报告（绑定当前选中的历史记录）
const generateReport = () => {
  if (selectedHistory.value.length === 0) return
  const recordIds = selectedHistory.value.join(',')
  router.push(`/geo-report?recordId=${recordIds}`)
}

const getScoreClass = (score) => {
  if (score >= 80) return 'score-green'
  if (score >= 60) return 'score-yellow'
  return 'score-red'
}

const getGradeName = (score) => {
  if (score >= 80) return '优秀'
  if (score >= 70) return '良好'
  if (score >= 60) return '及格'
  return '需改进'
}

const getGradeTagType = (score) => {
  if (score >= 70) return 'success'
  if (score >= 60) return 'warning'
  return 'danger'
}

const syncToDashboard = () => {
  const allData = JSON.parse(localStorage.getItem('auyologic_data') || '{}')
  allData['dashboard-site-score'] = {
    score: report.value.score,
    url: report.value.url,
    updatedAt: report.value.checkedAt
  }
  localStorage.setItem('auyologic_data', JSON.stringify(allData))
}

const formatTime = (isoString) => formatZhCnYmdHm(isoString)

watch(
  () => [route.query.url, route.query.prefill],
  () => {
    const q = route.query.url ?? route.query.prefill
    if (q != null && String(q).trim()) {
      inputUrl.value = String(q).trim().replace(/^https?:\/\//i, '')
    }
  },
  { immediate: true }
)

onMounted(() => {
  loadHistory()
})
</script>

<style scoped>
/* ===== 页面 ===== */
.wo-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 28px 32px;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

/* ===== 标题 ===== */
.wo-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 28px;
}

.wo-header-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, #409eff, #667eea);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 24px;
  box-shadow: 0 4px 14px rgba(64, 158, 255, 0.35);
}

.wo-title {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 4px 0;
}

.wo-subtitle {
  font-size: 13px;
  color: #909399;
  margin: 0;
}

/* ===== 历史报告 ===== */
.wo-history {
  margin-top: 24px;
  background: white;
  border: 1px solid #ebeef5;
  border-radius: 16px;
  padding: 24px;
}

.wo-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.wo-history-actions {
  display: flex;
  gap: 8px;
}

.wo-history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wo-history-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: #f9f9f9;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.wo-history-item:hover {
  background: #f0f7ff;
  border-color: #409eff;
}

.wo-history-item.selected {
  background: #ecf5ff;
  border-color: #409eff;
}

.history-checkbox {
  margin-right: 10px;
  flex-shrink: 0;
}

.history-recheck-btn {
  flex-shrink: 0;
  color: #409eff;
}

.wo-history-score {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 800;
  color: white;
  flex-shrink: 0;
}

.wo-history-score.score-green { background: linear-gradient(135deg, #67c23a, #85ce61); }
.wo-history-score.score-yellow { background: linear-gradient(135deg, #e6a23c, #f5c97c); }
.wo-history-score.score-red { background: linear-gradient(135deg, #f56c6c, #f78989); }

.wo-history-info {
  flex: 1;
  min-width: 0;
}

.wo-history-url {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wo-history-time {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.wo-history-grade {
  flex-shrink: 0;
}

.wo-history-geo-badge {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #f0efff;
}

/* ===== 检测卡片 ===== */
.wo-check-card {
  background: white;
  border: 1px solid #ebeef5;
  border-radius: 16px;
  padding: 32px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 8px 0;
}

.section-desc {
  font-size: 13px;
  color: #909399;
  margin: 0 0 24px 0;
}

.wo-input-row {
  display: flex;
  gap: 12px;
  margin-bottom: 28px;
}

.wo-url-input {
  flex: 1;
}

:deep(.wo-url-input .el-input__wrapper) {
  border-radius: 10px 0 0 10px;
  border: 1.5px solid #e4e7ed;
  box-shadow: none;
  font-size: 15px;
}

:deep(.wo-url-input .el-input__wrapper:hover) {
  border-color: #c0c4cc;
}

:deep(.wo-url-input .el-input__wrapper.is-focus) {
  border-color: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.1);
}

.input-scheme {
  font-size: 13px;
  color: #909399;
}

.wo-check-btn {
  border-radius: 10px;
  font-size: 15px;
  padding: 0 28px;
  background: linear-gradient(135deg, #409eff, #3a8bff);
  border: none;
  height: 42px;
}

:deep(.wo-check-btn:hover) {
  background: linear-gradient(135deg, #66b1ff, #3a8bff);
}

/* ===== 维度进度 ===== */
.wo-dimensions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.wo-dim-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: #f5f7fa;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: all 0.3s;
}

.wo-dim-item.active {
  background: #ecf5ff;
  border-color: #409eff;
}

.wo-dim-item.done {
  background: #f0f9eb;
  border-color: #67c23a;
}

.wo-dim-icon {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: white;
  border: 2px solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: #909399;
  flex-shrink: 0;
  transition: all 0.3s;
}

.wo-dim-item.active .wo-dim-icon {
  border-color: #409eff;
  color: #409eff;
}

.wo-dim-item.done .wo-dim-icon {
  background: #67c23a;
  border-color: #67c23a;
  color: white;
}

.wo-dim-name {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 2px;
}

.wo-dim-desc {
  font-size: 11px;
  color: #909399;
}

/* ===== 报告 ===== */
.wo-report-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  background: white;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 20px;
}

.back-btn {
  color: #409eff;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  border: none;
  background: none;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.back-btn:hover {
  background: #ecf5ff;
}

.wo-report-url {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #409eff;
}

.wo-report-time {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #909399;
  margin-left: auto;
}

.wo-report-actions {
  display: flex;
  gap: 8px;
}

/* ===== 得分区 ===== */
.wo-score-section {
  background: white;
  border: 1px solid #ebeef5;
  border-radius: 16px;
  padding: 28px 32px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 32px;
}

.wo-score-circle {
  position: relative;
  width: 140px;
  height: 140px;
  flex-shrink: 0;
}

.score-ring {
  width: 140px;
  height: 140px;
}

.ring-bg {
  fill: none;
  stroke: #f0f0f0;
  stroke-width: 10;
}

.ring-fill {
  fill: none;
  stroke: #409eff;
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dasharray 1s ease;
}

.wo-score-circle.score-green .ring-fill { stroke: #67c23a; }
.wo-score-circle.score-yellow .ring-fill { stroke: #e6a23c; }
.wo-score-circle.score-red .ring-fill { stroke: #f56c6c; }

.score-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.score-number {
  font-size: 36px;
  font-weight: 800;
  color: #1a1a1a;
  line-height: 1;
}

.score-total {
  font-size: 14px;
  color: #909399;
  margin-top: 2px;
}

.wo-score-grade {
  flex: 1;
}

.grade-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}

.grade-name {
  font-size: 28px;
  font-weight: 800;
  margin-bottom: 6px;
}

.grade-name.grade-green { color: #67c23a; }
.grade-name.grade-yellow { color: #e6a23c; }
.grade-name.grade-red { color: #f56c6c; }

.grade-desc {
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
}

/* 知名网站保底提示 */
.famous-bonus-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #f0f9eb, #e1f3d8);
  border: 1px solid #a6d97e;
  border-radius: 8px;
  font-size: 12px;
  color: #529b2e;
  margin-top: 8px;
}

/* 评分说明 */
.score-explain-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 8px;
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}

/* 维度得分卡 */
.wo-dim-scores {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 280px;
}

.wo-dim-score-card {
  background: #f9f9f9;
  border-radius: 10px;
  padding: 12px 14px;
  border-left: 3px solid var(--accent);
}

.dim-score-num {
  font-size: 20px;
  font-weight: 800;
  color: var(--accent);
  display: inline-block;
}

.dim-score-label {
  font-size: 12px;
  color: #606266;
  display: inline-block;
  margin-left: 6px;
  vertical-align: middle;
}

.dim-score-bar {
  height: 4px;
  background: #e4e7ed;
  border-radius: 2px;
  margin: 6px 0 4px;
}

.dim-score-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 1s ease;
}

.dim-score-detail {
  font-size: 11px;
  color: #909399;
}

/* ===== 问题区 ===== */
.wo-issues-section {
  background: white;
  border: 1px solid #ebeef5;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 20px;
}

.issues-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  background: #f5f7fa;
  border-radius: 10px;
  padding: 4px;
}

.issue-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  color: #909399;
  cursor: pointer;
  transition: all 0.2s;
}

.issue-tab.active {
  background: white;
  color: #303133;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.issue-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid #ebeef5;
  background: #fafafa;
  transition: box-shadow 0.2s;
}

.issue-card:hover {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}

.issue-warn {
  border-left: 3px solid #e6a23c;
  background: #fdf6ec;
}

.issue-pass {
  border-left: 3px solid #67c23a;
  background: #f0f9eb;
}

.issue-icon {
  font-size: 18px;
  flex-shrink: 0;
  padding-top: 1px;
}

.issue-warn .issue-icon { color: #e6a23c; }
.issue-pass .issue-icon { color: #67c23a; }

.issue-body {
  flex: 1;
}

.issue-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.issue-desc {
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
  margin-bottom: 6px;
}

.issue-fix {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #409eff;
  background: #ecf5ff;
  padding: 4px 8px;
  border-radius: 4px;
  display: inline-flex;
}

.impact-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 20px;
  flex-shrink: 0;
}

.impact-warn {
  background: #fef0f0;
  color: #f56c6c;
}

.impact-pass {
  background: #f0f9eb;
  color: #67c23a;
}

.issues-empty {
  text-align: center;
  padding: 32px 0;
  color: #909399;
  font-size: 13px;
}

/* ===== 明细表 ===== */
.wo-details-section {
  background: white;
  border: 1px solid #ebeef5;
  border-radius: 16px;
  padding: 24px;
}

.details-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 16px;
}

:deep(.wo-details-table) {
  border-radius: 8px;
  overflow: hidden;
}

:deep(.wo-details-table .el-table__header-wrapper th) {
  background: #f5f7fa;
  color: #606266;
  font-weight: 600;
  font-size: 13px;
}
</style>
