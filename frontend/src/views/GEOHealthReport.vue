<template>
  <div class="health-page">
    <!-- 无数据提示 -->
    <div v-if="!hasData && !loading" class="no-data-banner">
      <div class="no-data-content">
        <div class="no-data-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#dcdfe6" stroke-width="2"/>
            <path d="M24 14v12M24 32h.01" stroke="#909399" stroke-width="3" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="no-data-text">
          <h3>暂无体检数据</h3>
          <p>请先完成可见度检测，再生成品牌 AI 健康体检报告</p>
        </div>
        <el-button type="primary" @click="goToGEODetection">
          前往可见度检测
        </el-button>
      </div>
    </div>

    <div v-if="hasData || loading">
      <!-- 顶部导航 -->
      <div class="health-nav">
      <div class="nav-left">
        <div class="nav-logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="13" stroke="#7070f0" stroke-width="2"/>
            <path d="M8 14L12 18L20 10" stroke="#7070f0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="nav-brand">Auyologic</span>
        </div>
        <div class="nav-sep"></div>
        <span class="nav-module">品牌 AI 健康体检报告</span>
      </div>
      <div class="nav-right">
        <div class="nav-time">检测时间：{{ checkTime }}</div>
        <el-button size="small" @click="refreshReport" :loading="loading">
          <el-icon><RefreshRight /></el-icon>
          重新检测
        </el-button>
      </div>
    </div>

    <!-- 主报告体 -->
    <div class="report-body">

      <!-- ===== 区块1：品牌健康总览 ===== -->
      <div class="section-hero">
        <div class="hero-brand">
          <div class="brand-avatar">{{ brandName.charAt(0) }}</div>
          <div class="brand-info">
            <div class="brand-name">{{ brandName }}</div>
            <div class="brand-url">{{ brandDomain }}</div>
          </div>
        </div>

        <div class="hero-score-section">
          <div class="hero-score-ring" :class="scoreRingClass">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" class="ring-bg"/>
              <circle
                cx="60" cy="60" r="52"
                class="ring-fill"
                :stroke-dasharray="`${healthScore * 3.27} 327`"
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div class="ring-content">
              <div class="ring-score">{{ healthScore }}</div>
              <div class="ring-total">/100</div>
            </div>
          </div>

          <div class="hero-score-meta">
            <div class="score-status-badge" :class="scoreStatusClass">
              <span class="status-dot"></span>
              {{ scoreStatusText }}
            </div>
            <div class="score-subtitle">AI 可见度综合得分</div>
            <div class="score-compared">
              超越 <span class="compare-num">{{ comparePercent }}</span> 的被检测品牌
            </div>
          </div>
        </div>

        <div class="hero-ai-badge">
          <div class="ai-badge-label">数据来源</div>
          <div class="ai-badge-tags">
            <span class="ai-tag deepseek">
              <span class="ai-tag-dot"></span>DeepSeek 真实检索
            </span>
            <span class="ai-tag simulate">
              <span class="ai-tag-dot"></span>AI 模拟推断
            </span>
          </div>
        </div>
      </div>

      <!-- ===== 区块2：四大核心指标 ===== -->
      <div class="section-kpi">
        <div class="section-title-row">
          <h2 class="section-title">核心指标</h2>
          <span class="section-tag">KEY METRICS</span>
        </div>

        <div class="kpi-grid">
          <div v-for="kpi in kpiCards" :key="kpi.key" class="kpi-card" :class="kpi.status">
            <div class="kpi-header">
              <div class="kpi-icon-wrap" :style="{ background: kpi.iconBg }">
                <el-icon :size="18"><component :is="kpi.icon"/></el-icon>
              </div>
              <div class="kpi-trend" v-if="kpi.trend">
                <el-icon><Top /></el-icon>
                {{ kpi.trend }}
              </div>
            </div>
            <div class="kpi-value">{{ kpi.value }}</div>
            <div class="kpi-label">{{ kpi.label }}</div>
            <div class="kpi-bar">
              <div class="kpi-bar-fill" :style="{ width: kpi.pct + '%', background: kpi.color }"></div>
            </div>
            <div class="kpi-sub">{{ kpi.sub }}</div>
          </div>
        </div>
      </div>

      <!-- ===== 区块3：全域可见度矩阵 ===== -->
      <div class="section-matrix">
        <div class="section-title-row">
          <h2 class="section-title">全域可见度矩阵</h2>
          <span class="section-tag">AI PLATFORM VISIBILITY</span>
          <div class="matrix-legend">
            <span class="legend-item"><span class="leg-dot leg-1"></span>首位拦截</span>
            <span class="legend-item"><span class="leg-dot leg-2"></span>顺位2-3</span>
            <span class="legend-item"><span class="leg-dot leg-3"></span>竞品优势</span>
            <span class="legend-item"><span class="leg-dot leg-4"></span>未提及</span>
            <span class="legend-item"><span class="leg-dot leg-ai"></span>AI推断</span>
          </div>
        </div>

        <div class="matrix-container">
          <div class="matrix-table-wrap">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th class="th-path">提问意图路径</th>
                  <th v-for="plat in platforms" :key="plat.key" class="th-platform">
                    <div class="plat-header">
                      <span class="plat-icon" :style="{ backgroundColor: plat.color }">{{ plat.icon }}</span>
                      <span class="plat-name">{{ plat.name }}</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="path in intentPaths" :key="path.key">
                  <td class="td-path">
                    <div class="path-label">{{ path.label }}</div>
                    <div class="path-type">{{ path.type }}</div>
                  </td>
                  <td v-for="plat in platforms" :key="plat.key" class="td-result">
                    <div class="result-cell" :class="getCellClass(path, plat)">
                      <span class="result-text">{{ getCellText(path, plat) }}</span>
                      <span v-if="plat.simulated" class="cell-sim-tag">AI</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="matrix-summary">
            <div class="summary-stat">
              <span class="s-num">{{ interceptCount }}</span>
              <span class="s-label">次被拦截</span>
            </div>
            <div class="summary-stat">
              <span class="s-num">{{ blindCount }}</span>
              <span class="s-label">个盲区</span>
            </div>
            <div class="summary-stat">
              <span class="s-num">{{ competitorAdvantage }}</span>
              <span class="s-label">次竞品占优</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 区块4：AI 语义情绪分析 ===== -->
      <div class="section-emotion">
        <div class="section-title-row">
          <h2 class="section-title">AI 语义情绪关联</h2>
          <span class="section-tag">SENTIMENT ANALYSIS</span>
        </div>

        <div class="emotion-layout">
          <div class="emotion-chart">
            <div class="radar-wrap">
              <svg viewBox="0 0 300 300" class="radar-svg">
                <!-- 背景网格 -->
                <g v-for="level in 5" :key="'grid'+level">
                  <polygon
                    :points="getRadarPolygon(level * 20)"
                    fill="none"
                    stroke="#e4e7ed"
                    stroke-width="1"
                    :opacity="0.5 + level * 0.1"
                  />
                </g>
                <!-- 轴线 -->
                <line v-for="(axis, i) in emotionAxes" :key="'axis'+i"
                  :x1="150" :y1="150"
                  :x2="150 + 100 * Math.cos(axis.angle)"
                  :y2="150 + 100 * Math.sin(axis.angle)"
                  stroke="#e4e7ed" stroke-width="1"
                />
                <!-- 数据区域 -->
                <polygon
                  :points="getEmotionPolygon()"
                  fill="rgba(112, 112, 240, 0.2)"
                  stroke="#7070f0"
                  stroke-width="2"
                />
                <!-- 数据点 -->
                <circle v-for="(axis, i) in emotionAxes" :key="'dot'+i"
                  :cx="150 + (emotionData[i] / 100) * 100 * Math.cos(axis.angle)"
                  :cy="150 + (emotionData[i] / 100) * 100 * Math.sin(axis.angle)"
                  r="4" fill="#7070f0"
                />
                <!-- 标签 -->
                <text v-for="(axis, i) in emotionAxes" :key="'label'+i"
                  :x="150 + 115 * Math.cos(axis.angle)"
                  :y="150 + 115 * Math.sin(axis.angle)"
                  text-anchor="middle" dominant-baseline="middle"
                  font-size="11" fill="#606266"
                >{{ axis.label }}</text>
              </svg>
            </div>
          </div>

          <div class="emotion-details">
            <div v-for="(axis, i) in emotionAxes" :key="'ed'+i" class="emotion-item">
              <div class="emotion-item-left">
                <span class="emotion-dot" :style="{ background: emotionColors[i] }"></span>
                <span class="emotion-item-label">{{ axis.label }}</span>
              </div>
              <div class="emotion-bar-wrap">
                <div class="emotion-bar">
                  <div class="emotion-bar-fill" :style="{ width: emotionData[i] + '%', background: emotionColors[i] }"></div>
                </div>
                <span class="emotion-val">{{ emotionData[i] }}</span>
              </div>
            </div>

            <div class="emotion-summary">
              <div class="emo-tag" :class="sentimentTag.type">{{ sentimentTag.text }}</div>
              <div class="emo-summary-text">{{ sentimentSummary }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 区块5：信源权威穿透 ===== -->
      <div class="section-authority">
        <div class="section-title-row">
          <h2 class="section-title">底层信源溯源穿透</h2>
          <span class="section-tag">SOURCE TRACEABILITY</span>
        </div>

        <div class="authority-layout">
          <div class="authority-chart">
            <div class="source-bars">
              <div v-for="src in sourceData" :key="src.type" class="source-bar-item">
                <div class="source-meta">
                  <span class="source-type">{{ src.type }}</span>
                  <span class="source-count">{{ src.count }} 次引用</span>
                </div>
                <div class="source-bar-track">
                  <div
                    class="source-bar-fill"
                    :style="{ width: src.pct + '%', background: src.color }"
                  ></div>
                </div>
                <span class="source-pct">{{ src.pct }}%</span>
              </div>
            </div>
          </div>

          <div class="authority-pie-wrap">
            <svg viewBox="0 0 200 200" class="pie-svg">
              <g transform="translate(100,100)">
                <path v-for="(slice, i) in pieSlices" :key="'pie'+i"
                  :d="slice.path"
                  :fill="slice.color"
                  :opacity="0.85"
                />
                <circle r="45" fill="white"/>
                <text text-anchor="middle" dy="0.3em" font-size="12" fill="#909399">采信率</text>
                <text text-anchor="middle" dy="1.5em" font-size="18" font-weight="700" fill="#303133">{{ authorityScore }}</text>
              </g>
            </svg>
            <div class="pie-legend">
              <div v-for="(src, i) in sourceData" :key="'pl'+i" class="pie-legend-item">
                <span class="pie-legend-dot" :style="{ background: src.color }"></span>
                <span>{{ src.type }}</span>
                <span class="pie-legend-pct">{{ src.pct }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 区块6：商业流失漏斗 ===== -->
      <div class="section-funnel">
        <div class="section-title-row">
          <h2 class="section-title">商业流失漏斗预演</h2>
          <span class="section-tag">BUSINESS LOSS FUNNEL</span>
        </div>

        <div class="funnel-layout">
          <div class="funnel-chart">
            <div class="funnel-stages">
              <div v-for="(stage, i) in funnelStages" :key="stage.key" class="funnel-stage">
                <div class="funnel-bar-wrap">
                  <div
                    class="funnel-bar"
                    :style="{
                      width: stage.width + '%',
                      background: stage.color,
                      opacity: 1 - i * 0.12
                    }"
                  >
                    <span class="funnel-bar-label">{{ stage.label }}</span>
                    <span class="funnel-bar-val">{{ stage.value }}</span>
                  </div>
                </div>
                <div class="funnel-connector" v-if="i < funnelStages.length - 1">
                  <span class="funnel-loss" :style="{ color: stage.lossColor }">
                    ↓ {{ stage.lost }} 流失
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="funnel-risk">
            <div class="risk-header">
              <el-icon color="#f56c6c"><WarnTriangleFilled /></el-icon>
              <span>流失风险评估</span>
            </div>
            <div class="risk-level" :class="riskLevel">{{ riskLevelText }}</div>
            <div class="risk-items">
              <div v-for="risk in riskFactors" :key="risk.key" class="risk-item" :class="risk.level">
                <span class="risk-icon">{{ risk.level === 'high' ? '⚠' : risk.level === 'mid' ? '◆' : '●' }}</span>
                <span class="risk-text">{{ risk.text }}</span>
                <span class="risk-impact">{{ risk.impact }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 区块7：操作区 ===== -->
      <div class="section-actions">
        <el-button size="large" @click="goBack" plain>
          <el-icon class="mr-1"><ArrowLeft /></el-icon>返回
        </el-button>
        <el-button size="large" @click="exportReport" type="primary">
          <el-icon class="mr-1"><Download /></el-icon>导出报告
        </el-button>
        <el-button size="large" @click="shareReport" plain>
          <el-icon class="mr-1"><Share /></el-icon>分享链接
        </el-button>
      </div>

    </div>
  </div>
</div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  RefreshRight, Top, WarnTriangleFilled, ArrowLeft,
  Download, Share, Aim, Warning, List, DataLine, Document, View
} from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const hasData = ref(false)

// ===== API 配置 =====
const API_BASE_URL = window.VITE_API_URL || window.location.origin

// ===== 响应式数据（由真实 API 填充）=====

const brandName = ref('请先进行可见度检测')
const brandDomain = ref('')
const checkTime = ref(new Date().toLocaleString('zh-CN'))
const healthScore = ref(0)

const comparePercent = computed(() => Math.max(5, 100 - healthScore.value) + '%')

const scoreRingClass = computed(() => {
  if (healthScore.value >= 70) return 'ring-green'
  if (healthScore.value >= 45) return 'ring-yellow'
  return 'ring-red'
})

const scoreStatusClass = computed(() => {
  if (healthScore.value >= 70) return 'status-good'
  if (healthScore.value >= 45) return 'status-warn'
  return 'status-bad'
})

const scoreStatusText = computed(() => {
  if (healthScore.value >= 70) return '健康'
  if (healthScore.value >= 45) return '亚健康'
  return '高风险'
})

// ===== KPI 卡片（动态计算）=====
const interceptRate = ref(0)
const blindIndex = ref(0)
const negativeRate = ref(0)
const authorityScoreVal = ref(0)

const kpiCards = computed(() => [
  {
    key: 'intercept',
    icon: Aim,
    iconBg: 'rgba(103, 194, 58, 0.12)',
    label: '首行心智拦截率',
    value: interceptRate.value + '%',
    sub: '品牌被 AI 优先提及的比率',
    pct: interceptRate.value,
    color: '#67c23a',
    status: interceptRate.value >= 60 ? 'good' : interceptRate.value >= 30 ? 'warn' : 'danger',
    trend: null
  },
  {
    key: 'blind',
    icon: Warning,
    iconBg: 'rgba(245, 108, 108, 0.12)',
    label: '大模型盲区指数',
    value: blindIndex.value + '%',
    sub: '品牌完全未被提及的平台比例',
    pct: blindIndex.value,
    color: '#f56c6c',
    status: blindIndex.value >= 50 ? 'danger' : blindIndex.value >= 25 ? 'warn' : 'good',
    trend: null
  },
  {
    key: 'negative',
    icon: List,
    iconBg: 'rgba(230, 162, 60, 0.12)',
    label: '负面事实关联度',
    value: negativeRate.value + '%',
    sub: 'AI 回复中提及品牌负面信息的比例',
    pct: negativeRate.value,
    color: '#e6a23c',
    status: negativeRate.value >= 20 ? 'danger' : negativeRate.value >= 10 ? 'warn' : 'good',
    trend: null
  },
  {
    key: 'decay',
    icon: DataLine,
    iconBg: 'rgba(64, 158, 255, 0.12)',
    label: '信源权威指数',
    value: authorityScoreVal.value + '%',
    sub: 'AI 引用来源中权威媒体的占比',
    pct: authorityScoreVal.value,
    color: '#409eff',
    status: authorityScoreVal.value >= 60 ? 'good' : authorityScoreVal.value >= 30 ? 'warn' : 'danger',
    trend: null
  }
])

// ===== 可见度矩阵（由 API 填充）=====
const platforms = ref([
  { key: 'kimi',     name: 'Kimi',      icon: 'K',  color: '#06B6D4', simulated: true },
  { key: 'doubao',   name: '豆包',      icon: '豆', color: '#EA580C', simulated: true },
  { key: 'yuanbao',  name: '腾讯元宝',   icon: '元', color: '#0EA5E9', simulated: true },
  { key: 'tongyi',   name: '通义千问',   icon: '通', color: '#8B5CF6', simulated: true },
  { key: 'yiyan',    name: '文心一言',   icon: '文', color: '#EF4444', simulated: true },
  { key: 'deepseek', name: 'DeepSeek',  icon: 'D',  color: '#4F46E5', simulated: false },
  { key: 'zhipu',    name: '智谱清言',   icon: '智', color: '#10B981', simulated: true },
  { key: 'spark',    name: '讯飞星火',   icon: '讯', color: '#F59E0B', simulated: true },
])

const intentPaths = ref([
  { key: 'core', label: '核心词', type: '品牌词' },
  { key: 'scene', label: '场景词', type: '需求词' },
  { key: 'compare', label: '对比词', type: '竞品词' },
  { key: 'feature', label: '功能词', type: '产品词' },
  { key: 'price', label: '价格词', type: '决策词' },
])

const matrixData = ref({})

const getCellClass = (path, plat) => {
  const result = matrixData.value[path.key]?.[plat.key]
  return `cell-${result || 'none'}`
}

const getCellText = (path, plat) => {
  const result = matrixData.value[path.key]?.[plat.key]
  const map = {
    top1: '首位',
    top2: '顺位2',
    mention: '有提及',
    competitor: '竞品优',
    none: '未提及'
  }
  return map[result] || '—'
}

const interceptCount = computed(() => {
  let count = 0
  const md = matrixData.value
  for (const pathKey of Object.keys(md)) {
    for (const platKey of Object.keys(md[pathKey] || {})) {
      if (md[pathKey][platKey] === 'top1' || md[pathKey][platKey] === 'top2') count++
    }
  }
  return count
})

const blindCount = computed(() => {
  let count = 0
  const md = matrixData.value
  for (const pathKey of Object.keys(md)) {
    for (const platKey of Object.keys(md[pathKey] || {})) {
      if (md[pathKey][platKey] === 'none') count++
    }
  }
  return count
})

const competitorAdvantage = computed(() => {
  let count = 0
  const md = matrixData.value
  for (const pathKey of Object.keys(md)) {
    for (const platKey of Object.keys(md[pathKey] || {})) {
      if (md[pathKey][platKey] === 'competitor') count++
    }
  }
  return count
})

// ===== 情绪雷达图 =====
const emotionAxes = [
  { label: '专业度', angle: -Math.PI / 2 },
  { label: '信任度', angle: -Math.PI / 6 },
  { label: '中立性', angle: Math.PI / 6 },
  { label: '权威感', angle: Math.PI / 2 },
  { label: '可用性', angle: 5 * Math.PI / 6 },
  { label: '独特性', angle: 7 * Math.PI / 6 },
]

const emotionData = ref([50, 50, 50, 50, 50, 50])
const emotionColors = ['#67c23a', '#409eff', '#e6a23c', '#f56c6c', '#7070f0', '#909399']

const getRadarPolygon = (r) => {
  return emotionAxes.map(axis =>
    `${150 + r * Math.cos(axis.angle)},${150 + r * Math.sin(axis.angle)}`
  ).join(' ')
}

const getEmotionPolygon = () => {
  return emotionData.value.map((val, i) =>
    `${150 + (val / 100) * 100 * Math.cos(emotionAxes[i].angle)},${150 + (val / 100) * 100 * Math.sin(emotionAxes[i].angle)}`
  ).join(' ')
}

const sentimentTag = computed(() => {
  const avg = emotionData.value.reduce((a, b) => a + b, 0) / emotionData.value.length
  if (avg >= 70) return { type: 'good', text: '正向偏中' }
  if (avg >= 50) return { type: 'warn', text: '中性偏正' }
  return { type: 'bad', text: '需关注' }
})

const sentimentSummary = computed(() => {
  const negatives = emotionData.value.filter((v, i) => i >= 4 && v < 50)
  if (negatives.length >= 2) return '在可用性和独特性方面认知偏低，建议加强差异化内容输出'
  return '品牌在主流 AI 平台整体认知偏正面，建议维持现状并扩大优势'
})

// ===== 信源权威 =====
const sourceData = ref([
  { type: '权威媒体', count: 0, pct: 0, color: '#67c23a' },
  { type: '行业垂直', count: 0, pct: 0, color: '#409eff' },
  { type: '自媒体', count: 0, pct: 0, color: '#e6a23c' },
  { type: 'UGC / 社区', count: 0, pct: 0, color: '#909399' },
])

const authorityScore = computed(() => {
  const w = sourceData.value.reduce((s, d) => s + d.pct * (d.type === '权威媒体' ? 1 : d.type === '行业垂直' ? 0.7 : 0.3), 0)
  return Math.round(w / 100 * 100)
})

const pieSlices = computed(() => {
  let startAngle = 0
  return sourceData.value.map(src => {
    const angle = (src.pct / 100) * 2 * Math.PI
    const x1 = 70 * Math.cos(startAngle)
    const y1 = 70 * Math.sin(startAngle)
    startAngle += angle
    const x2 = 70 * Math.cos(startAngle)
    const y2 = 70 * Math.sin(startAngle)
    const largeArc = angle > Math.PI ? 1 : 0
    return { path: `M 0 0 L ${x1} ${y1} A 70 70 0 ${largeArc} 1 ${x2} ${y2} Z`, color: src.color }
  })
})

// ===== 商业流失漏斗 =====
const funnelStages = ref([
  { key: 'aware', label: '品牌认知', value: '0', width: 80, lost: 0, lossColor: '#f56c6c', color: '#67c23a' },
  { key: 'interest', label: '产生兴趣', value: '0', width: 60, lost: 0, lossColor: '#e6a23c', color: '#409eff' },
  { key: 'consider', label: '考虑选择', value: '0', width: 45, lost: 0, lossColor: '#f56c6c', color: '#7070f0' },
  { key: 'purchase', label: '付费转化', value: '0', width: 30, lost: 0, lossColor: '#909399', color: '#e6a23c' },
])

const riskLevel = computed(() => {
  if (blindIndex.value >= 50 || negativeRate.value >= 30) return 'risk-high'
  if (blindIndex.value >= 30 || negativeRate.value >= 15) return 'risk-mid'
  return 'risk-low'
})

const riskLevelText = computed(() => {
  if (riskLevel.value === 'risk-high') return '⚠ 高风险 — 存在显著流失点'
  if (riskLevel.value === 'risk-mid') return '◆ 中风险 — 部分环节待优化'
  return '● 低风险 — 转化路径基本健康'
})

const riskFactors = computed(() => [
  {
    key: 'blind',
    text: `品牌盲区较大（${blindCount.value} 个组合未覆盖）`,
    level: blindIndex.value >= 40 ? 'high' : blindIndex.value >= 20 ? 'mid' : 'low',
    impact: `-${Math.round(blindIndex.value * 0.5)}% 转化`
  },
  {
    key: 'competitor',
    text: `竞品在关键场景占优（${competitorAdvantage.value} 次）`,
    level: competitorAdvantage.value >= 5 ? 'high' : 'mid',
    impact: `-${Math.round(competitorAdvantage.value * 0.3)}% 转化`
  },
  {
    key: 'authority',
    text: `信源权威性有提升空间`,
    level: authorityScoreVal.value < 50 ? 'mid' : 'low',
    impact: `-${Math.round((100 - authorityScoreVal.value) * 0.1)}% 转化`
  },
])

// ===== 加载真实数据 =====
const loadHealthReport = async () => {
  loading.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/api/geo-health-report`, {
      headers: { 'x-user-id': 'default_user' }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    if (!data.success) throw new Error(data.error || '加载失败')

    // 填充基础数据
    brandName.value = data.brandName || '品牌'
    brandDomain.value = data.brandDomain || ''
    checkTime.value = data.checkTime ? new Date(data.checkTime).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN')
    healthScore.value = data.healthScore || 0

    // 填充 KPI
    interceptRate.value = data.interceptRate || 0
    blindIndex.value = data.blindIndex || 0
    negativeRate.value = data.negativeRate || 0
    authorityScoreVal.value = data.authorityScore || 0

    // 填充矩阵
    if (data.matrixData) matrixData.value = data.matrixData
    if (data.intentPaths) intentPaths.value = data.intentPaths
    if (data.platforms) platforms.value = data.platforms

    // 填充情绪雷达
    if (data.emotionData) emotionData.value = data.emotionData

    // 填充信源权威
    if (data.sourceData) sourceData.value = data.sourceData

    // 填充漏斗
    if (data.funnelStages) funnelStages.value = data.funnelStages

    hasData.value = (data.rawData?.totalChecks || 0) > 0 || (data.rawData?.reportsCount || 0) > 0

    if (!hasData.value) {
      ElMessage.warning('暂无检测数据，请先进行可见度检测')
    }
  } catch (err) {
    console.error('加载健康报告失败:', err)
    ElMessage.error('加载体检报告失败：' + err.message)
  } finally {
    loading.value = false
  }
}

// ===== 操作方法 =====
const refreshReport = async () => {
  ElMessage.info('正在跳转到可见度检测...')
  router.push('/geo-detection')
}

const goBack = () => router.back()
const goToGEODetection = () => router.push('/geo-detection')

const exportReport = () => {
  ElMessage.success('报告导出功能开发中')
}

const shareReport = () => {
  ElMessage.success('分享链接已复制到剪贴板')
}

onMounted(() => {
  loadHealthReport()
})
</script>

<style scoped>
/* ===== 全局 ===== */
.health-page {
  min-height: 100vh;
  background: #f5f6fa;
  font-family: 'PingFang SC', 'Microsoft YaHei', -apple-system, sans-serif;
}

/* ===== 无数据提示 ===== */
.no-data-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  padding: 40px 24px;
}

.no-data-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  text-align: center;
  max-width: 400px;
}

.no-data-icon {
  opacity: 0.6;
}

.no-data-text h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 700;
  color: #303133;
}

.no-data-text p {
  margin: 0;
  font-size: 14px;
  color: #909399;
  line-height: 1.5;
}

/* ===== 导航 ===== */
.health-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  background: white;
  border-bottom: 1px solid #ebeef5;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.nav-logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-brand {
  font-size: 15px;
  font-weight: 700;
  color: #303133;
}

.nav-sep {
  width: 1px;
  height: 20px;
  background: #e4e7ed;
}

.nav-module {
  font-size: 13px;
  color: #909399;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.nav-time {
  font-size: 12px;
  color: #c0c4cc;
}

/* ===== 报告主体 ===== */
.report-body {
  max-width: 1100px;
  margin: 0 auto;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.section-title {
  font-size: 17px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.section-tag {
  font-size: 11px;
  font-weight: 600;
  color: #c0c4cc;
  letter-spacing: 1px;
}

/* ===== 区块1：Hero 总览 ===== */
.section-hero {
  background: linear-gradient(135deg, #1a1a2e 0%, #2d2b55 50%, #1a1a2e 100%);
  border-radius: 20px;
  padding: 32px 36px;
  color: white;
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 32px;
  align-items: center;
}

.hero-brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.brand-avatar {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: linear-gradient(135deg, #7070f0, #9090ff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 800;
  color: white;
  box-shadow: 0 4px 16px rgba(112, 112, 240, 0.4);
}

.brand-name {
  font-size: 22px;
  font-weight: 800;
  margin-bottom: 4px;
}

.brand-url {
  font-size: 13px;
  color: rgba(255,255,255,0.6);
}

.hero-score-section {
  display: flex;
  align-items: center;
  gap: 24px;
}

.hero-score-ring {
  width: 120px;
  height: 120px;
  position: relative;
}

.ring-bg {
  fill: none;
  stroke: rgba(255,255,255,0.1);
  stroke-width: 10;
}

.ring-fill {
  fill: none;
  stroke: #67c23a;
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dasharray 1.5s ease;
}

.ring-green .ring-fill { stroke: #67c23a; }
.ring-yellow .ring-fill { stroke: #e6a23c; }
.ring-red .ring-fill { stroke: #f56c6c; }

.ring-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.ring-score {
  font-size: 36px;
  font-weight: 900;
  line-height: 1;
  color: white;
}

.ring-total {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  margin-top: 2px;
}

.hero-score-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.score-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  width: fit-content;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2s infinite;
}

.status-good { background: rgba(103,194,58,0.2); color: #67c23a; }
.status-warn { background: rgba(230,162,60,0.2); color: #e6a23c; }
.status-bad { background: rgba(245,108,108,0.2); color: #f56c6c; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.score-subtitle {
  font-size: 13px;
  color: rgba(255,255,255,0.7);
}

.score-compared {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
}

.compare-num {
  font-weight: 800;
  color: white;
  font-size: 14px;
}

.hero-ai-badge {
  border-left: 1px solid rgba(255,255,255,0.15);
  padding-left: 24px;
}

.ai-badge-label {
  font-size: 11px;
  color: rgba(255,255,255,0.4);
  margin-bottom: 8px;
}

.ai-badge-tags {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255,255,255,0.7);
}

.ai-tag-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.ai-tag.deepseek .ai-tag-dot { background: #67c23a; }
.ai-tag.simulate .ai-tag-dot { background: #e6a23c; }

/* ===== 区块2：KPI ===== */
.section-kpi,
.section-matrix,
.section-emotion,
.section-authority,
.section-funnel {
  background: white;
  border-radius: 16px;
  padding: 24px 28px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.kpi-card {
  background: #f9fafb;
  border-radius: 14px;
  padding: 18px 16px;
  border: 1px solid #ebeef5;
  transition: box-shadow 0.2s, transform 0.2s;
}

.kpi-card:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  transform: translateY(-2px);
}

.kpi-card.warn { border-color: rgba(230,162,60,0.3); }
.kpi-card.danger { border-color: rgba(245,108,108,0.3); }
.kpi-card.good { border-color: rgba(103,194,58,0.3); }

.kpi-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.kpi-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.kpi-trend {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: #67c23a;
  font-weight: 600;
}

.kpi-value {
  font-size: 28px;
  font-weight: 900;
  color: #1a1a1a;
  line-height: 1;
  margin-bottom: 4px;
}

.kpi-label {
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 10px;
}

.kpi-bar {
  height: 4px;
  background: #ebeef5;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}

.kpi-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 1.2s ease;
}

.kpi-sub {
  font-size: 11px;
  color: #909399;
  line-height: 1.4;
}

/* ===== 区块3：可见度矩阵 ===== */
.matrix-legend {
  display: flex;
  gap: 12px;
  margin-left: auto;
  font-size: 11px;
  color: #909399;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.leg-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.leg-1 { background: #67c23a; }
.leg-2 { background: #409eff; }
.leg-3 { background: #e6a23c; }
.leg-4 { background: #f0f0f0; border: 1px solid #dcdfe6; }
.leg-ai { background: #e6a23c; border-radius: 3px; width: 10px; height: 10px; }

.matrix-table-wrap {
  overflow-x: auto;
  border-radius: 10px;
  border: 1px solid #ebeef5;
}

.matrix-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.matrix-table th,
.matrix-table td {
  padding: 10px 12px;
  text-align: center;
  border-bottom: 1px solid #f0f0f0;
}

.matrix-table th {
  background: #f5f7fa;
  font-weight: 600;
  color: #606266;
}

.matrix-table tr:last-child td {
  border-bottom: none;
}

.matrix-table tr:hover td {
  background: #fafafa;
}

.th-path {
  text-align: left !important;
  min-width: 140px;
}

.plat-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.plat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  color: white;
}

.plat-name {
  font-size: 12px;
}

.td-path {
  text-align: left !important;
}

.path-label {
  font-weight: 600;
  color: #303133;
  font-size: 13px;
}

.path-type {
  font-size: 11px;
  color: #c0c4cc;
}

.result-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  min-width: 60px;
}

.cell-top1 { background: rgba(103,194,58,0.15); color: #67c23a; }
.cell-top2 { background: rgba(64,158,255,0.15); color: #409eff; }
.cell-mention { background: rgba(112,112,240,0.1); color: #7070f0; }
.cell-competitor { background: rgba(230,162,60,0.15); color: #e6a23c; }
.cell-none { background: #f5f5f5; color: #c0c4cc; }

.result-text { }

.cell-sim-tag {
  font-size: 9px;
  background: rgba(230,162,60,0.2);
  color: #e6a23c;
  padding: 1px 3px;
  border-radius: 3px;
  font-weight: 700;
}

.matrix-summary {
  display: flex;
  gap: 24px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.summary-stat {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.s-num {
  font-size: 22px;
  font-weight: 900;
  color: #303133;
}

.s-label {
  font-size: 12px;
  color: #909399;
}

/* ===== 区块4：情绪雷达 ===== */
.emotion-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 32px;
  align-items: center;
}

.radar-wrap {
  background: #fafafa;
  border-radius: 16px;
  padding: 10px;
}

.radar-svg {
  width: 100%;
}

.emotion-details {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.emotion-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.emotion-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 70px;
}

.emotion-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.emotion-item-label {
  font-size: 13px;
  color: #606266;
}

.emotion-bar-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.emotion-bar {
  flex: 1;
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
}

.emotion-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 1s ease;
}

.emotion-val {
  font-size: 13px;
  font-weight: 700;
  color: #303133;
  min-width: 28px;
  text-align: right;
}

.emotion-summary {
  margin-top: 8px;
  padding: 14px 16px;
  background: #f5f7fa;
  border-radius: 10px;
}

.emo-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
}

.emo-tag.good { background: rgba(103,194,58,0.15); color: #67c23a; }
.emo-tag.warn { background: rgba(230,162,60,0.15); color: #e6a23c; }
.emo-tag.bad { background: rgba(245,108,108,0.15); color: #f56c6c; }

.emo-summary-text {
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
}

/* ===== 区块5：信源权威 ===== */
.authority-layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 32px;
  align-items: center;
}

.source-bars {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.source-bar-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.source-meta {
  min-width: 80px;
  display: flex;
  flex-direction: column;
}

.source-type {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.source-count {
  font-size: 11px;
  color: #c0c4cc;
}

.source-bar-track {
  flex: 1;
  height: 10px;
  background: #f0f0f0;
  border-radius: 5px;
  overflow: hidden;
}

.source-bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 1s ease;
}

.source-pct {
  font-size: 13px;
  font-weight: 700;
  color: #303133;
  min-width: 36px;
  text-align: right;
}

.pie-svg {
  width: 160px;
}

.pie-legend {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pie-legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #606266;
}

.pie-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pie-legend-pct {
  margin-left: auto;
  font-weight: 600;
  color: #303133;
}

/* ===== 区块6：流失漏斗 ===== */
.funnel-layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 32px;
  align-items: center;
}

.funnel-stages {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.funnel-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.funnel-bar-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
}

.funnel-bar {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-radius: 8px;
  transition: width 1s ease;
  min-width: 40%;
}

.funnel-bar-label {
  font-size: 13px;
  font-weight: 600;
  color: white;
}

.funnel-bar-val {
  font-size: 13px;
  font-weight: 700;
  color: white;
  opacity: 0.85;
}

.funnel-connector {
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.funnel-loss {
  font-weight: 600;
  opacity: 0.8;
}

.funnel-risk {
  background: #fafafa;
  border-radius: 14px;
  padding: 20px;
  border: 1px solid #ebeef5;
}

.risk-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.risk-level {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 14px;
}

.risk-level.risk-high { background: rgba(245,108,108,0.12); color: #f56c6c; }
.risk-level.risk-mid { background: rgba(230,162,60,0.12); color: #e6a23c; }
.risk-level.risk-low { background: rgba(103,194,58,0.12); color: #67c23a; }

.risk-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.risk-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 8px 10px;
  border-radius: 8px;
}

.risk-item.high { background: rgba(245,108,108,0.08); color: #f56c6c; }
.risk-item.mid { background: rgba(230,162,60,0.08); color: #e6a23c; }
.risk-item.low { background: rgba(103,194,58,0.08); color: #67c23a; }

.risk-icon { flex-shrink: 0; }

.risk-text {
  flex: 1;
  line-height: 1.4;
}

.risk-impact {
  font-weight: 600;
  white-space: nowrap;
  opacity: 0.8;
}

/* ===== 区块7：操作区 ===== */
.section-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 8px 0;
}

/* ===== 响应式 ===== */
@media (max-width: 900px) {
  .section-hero {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .emotion-layout,
  .authority-layout,
  .funnel-layout {
    grid-template-columns: 1fr;
  }

  .hero-ai-badge {
    border-left: none;
    border-top: 1px solid rgba(255,255,255,0.15);
    padding-left: 0;
    padding-top: 16px;
  }

  .matrix-legend {
    flex-wrap: wrap;
  }
}
</style>
