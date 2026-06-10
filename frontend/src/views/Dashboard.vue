<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="mb-6">
      <div class="text-2xl font-bold mb-1">数据控制台</div>
      <div class="text-gray-400 text-sm">奥哟解决您的GEO智能营销一站式解决方案</div>
    </div>

    <!-- 快捷入口 -->
    <div class="section-title-bar">
      <span class="section-title-text">快捷操作</span>
    </div>
    <div class="grid grid-cols-4 gap-4 mb-6">
      <router-link to="/website-optimization" class="block">
        <div class="quick-card quick-orange">
          <div class="quick-icon"><el-icon size="22"><Monitor /></el-icon></div>
          <div class="quick-name">网站优化检测</div>
          <div class="quick-desc">GEO友好度分析</div>
        </div>
      </router-link>
      <router-link to="/keywords" class="block">
        <div class="quick-card quick-green">
          <div class="quick-icon"><el-icon size="22"><Search /></el-icon></div>
          <div class="quick-name">关键词管理</div>
          <div class="quick-desc">管理品牌关键词</div>
        </div>
      </router-link>
      <router-link to="/content-create" class="block">
        <div class="quick-card quick-purple">
          <div class="quick-icon"><el-icon size="22"><EditPen /></el-icon></div>
          <div class="quick-name">内容生成</div>
          <div class="quick-desc">AI软文创作</div>
        </div>
      </router-link>
      <router-link to="/publish-tasks" class="block">
        <div class="quick-card quick-blue">
          <div class="quick-icon"><el-icon size="22"><Promotion /></el-icon></div>
          <div class="quick-name">投放任务</div>
          <div class="quick-desc">发布内容到平台</div>
        </div>
      </router-link>
    </div>

    <!-- GEO可见度检测历史摘要 -->
    <div class="geo-history-section" v-if="geoHistory.length > 0">
      <div class="section-title-bar">
        <span class="section-title-text">最近可见度检测</span>
        <router-link to="/geo-detection" class="dash-card-more">前往检测 <el-icon><ArrowRight /></el-icon></router-link>
      </div>
      <div class="geo-history-cards">
        <div
          v-for="record in geoHistory.slice(0, 3)"
          :key="record.id"
          class="geo-history-card"
          @click="$router.push('/geo-detection?historyId=' + record.id)"
        >
          <div class="geo-history-score">{{ record.overallScore }}</div>
          <div class="geo-history-grade">{{ record.overallGrade }}级</div>
          <div class="geo-history-date">{{ formatHistoryDate(record.checkedAt) }}</div>
          <div class="geo-history-stats">
            <span>可见 {{ record.visibleCount }}</span>
            <span>缺失 {{ record.missingCount }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="geo-history-empty">
      <span>暂无检测记录</span>
      <router-link to="/geo-detection">去检测 →</router-link>
    </div>

    <!-- 第二行：网站健康度 + GEO收录 -->
    <div class="grid grid-cols-2 gap-5 mb-5">
      <!-- 网站健康度（仅展示「企业信息」中官网地址对应的检测记录，而非任意历史 URL） -->
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title-block">
            <div class="dash-card-title">
              <el-icon class="dash-icon" color="#f56c6c"><Monitor /></el-icon>
              网站健康度
            </div>
            <div class="dash-card-subhint">与企业信息中的官网一致</div>
          </div>
          <router-link
            v-if="siteHealthReady || hasEnterpriseWebsite"
            :to="websiteOptimizationLink"
            class="dash-card-more"
          >
            {{ siteHealthReady ? '查看详情' : '立即检测' }}
            <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>

        <template v-if="siteHealthReady">
          <div class="health-body">
            <div class="health-left">
              <div class="health-big-score" :class="healthGradeClass">{{ siteScore }}</div>
              <div class="health-big-label">综合得分</div>
              <div class="health-grade-tag" :class="healthGradeClass">{{ healthGrade }}</div>
            </div>
            <div class="health-right">
              <div
                v-for="dim in siteDimensions"
                :key="dim.name"
                class="dim-bar-item"
              >
                <div class="dim-bar-header">
                  <span class="dim-bar-name">{{ dim.name }}</span>
                  <span class="dim-bar-score" :style="{ color: dim.color }">{{ dim.score }}分</span>
                </div>
                <div class="dim-bar-track">
                  <div
                    class="dim-bar-fill"
                    :style="{ width: dim.score + '%', background: dim.color }"
                  />
                </div>
              </div>
            </div>
          </div>
          <div class="health-url-row" v-if="siteUrl">
            <el-icon size="12" color="#909399"><Link /></el-icon>
            <span class="health-url-text">{{ siteUrl }}</span>
          </div>
        </template>

        <template v-else-if="!hasEnterpriseWebsite">
          <div class="health-empty health-empty--cta">
            <div class="health-empty-text">尚未填写企业官网</div>
            <div class="health-empty-sub">请先在「企业信息」中填写官网地址，再前往网站优化检测获取健康度评分</div>
            <el-button type="primary" round class="health-cta-btn" @click="goEnterpriseSettings">
              去填写官网信息
            </el-button>
          </div>
        </template>

        <template v-else>
          <div class="health-empty health-empty--cta">
            <div class="health-empty-text">企业官网尚未检测</div>
            <div class="health-empty-sub">当前官网：<span class="health-preview-url">{{ enterpriseWebsite }}</span></div>
            <el-button type="primary" round class="health-cta-btn" @click="goWebsiteOptimization">
              进行网站优化检测
            </el-button>
          </div>
        </template>
      </div>

      <!-- GEO收录概览 -->
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">
            <el-icon class="dash-icon" color="#7070f0"><Histogram /></el-icon>
            GEO收录概览
          </div>
          <router-link to="/geo-detection" class="dash-card-more">
            详情 <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>
        <div class="geo-platforms">
          <div v-for="p in geoPlatforms" :key="p.name" class="geo-platform-item">
            <div class="geo-platform-top">
              <span class="geo-platform-name">{{ p.name }}</span>
              <span class="geo-platform-count" :style="{ color: p.color }">{{ p.count }}</span>
            </div>
            <div class="geo-platform-bar">
              <div
                class="geo-platform-fill"
                :style="{ width: p.pct + '%', background: p.color }"
              />
            </div>
          </div>
        </div>
        <div class="geo-summary">
          <div class="geo-summary-item">
            <span class="geo-summary-num">{{ totalCollected }}</span>
            <span class="geo-summary-label">总收录</span>
          </div>
          <div class="geo-summary-divider" />
          <div class="geo-summary-item">
            <span class="geo-summary-num">{{ totalQuestions }}</span>
            <span class="geo-summary-label">总问题</span>
          </div>
          <div class="geo-summary-divider" />
          <div class="geo-summary-item">
            <span class="geo-summary-num" :class="rateClass">{{ collectionRate }}%</span>
            <span class="geo-summary-label">收录率</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 第三行：关键词与问题 + 内容创作 -->
    <div class="grid grid-cols-2 gap-5">
      <!-- 关键词与问题 -->
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">
            <el-icon class="dash-icon" color="#67c23a"><ChatDotRound /></el-icon>
            关键词与问题
          </div>
          <router-link to="/keywords" class="dash-card-more">
            管理 <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>
        <div class="stat-two-col">
          <div class="stat-big-item">
            <div class="stat-big-num" style="color: #409eff;">{{ keywordStats.total }}</div>
            <div class="stat-big-label">关键词总数</div>
            <div class="stat-big-sub">
              <span class="stat-tag" style="color: #409eff;">{{ keywordStats.brand }} 品牌</span>
              <span class="stat-tag" style="color: #67c23a;">{{ keywordStats.product }} 产品</span>
              <span class="stat-tag" style="color: #e6a23c;">{{ keywordStats.industry }} 行业</span>
            </div>
          </div>
          <div class="stat-big-item">
            <div class="stat-big-num" style="color: #7070f0;">{{ keywordStats.questions }}</div>
            <div class="stat-big-label">拓展问题</div>
            <div class="stat-big-sub">
              <span class="stat-tag stat-tag-green">{{ keywordStats.questionsApproved }} 已审核</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 内容创作 -->
      <div class="dash-card">
        <div class="dash-card-header">
          <div class="dash-card-title">
            <el-icon class="dash-icon" color="#e6a23c"><Document /></el-icon>
            内容创作
          </div>
          <router-link to="/drafts" class="dash-card-more">
            草稿箱 <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>
        <div class="stat-two-col">
          <div class="stat-big-item">
            <div class="stat-big-num" style="color: #e6a23c;">{{ contentStats.drafts }}</div>
            <div class="stat-big-label">草稿</div>
            <div class="stat-big-sub">
              <span class="stat-tag stat-tag-gray">等待发布</span>
            </div>
          </div>
          <div class="stat-big-item">
            <div class="stat-big-num" style="color: #67c23a;">{{ contentStats.published }}</div>
            <div class="stat-big-label">已发布</div>
            <div class="stat-big-sub">
              <span class="stat-tag stat-tag-green">累计发布</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { getToken, getCurrentUserId } from '../utils/auth.js'
defineOptions({ name: 'Dashboard' })

import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Monitor, Search, EditPen, Promotion, ArrowRight,
  ChatDotRound, Document, Histogram, Link
} from '@element-plus/icons-vue'
import { formatZhCnMdHm } from '../utils/dateTime.js'

const router = useRouter()

// 后端 API 地址
const API_BASE_URL = window.VITE_API_URL || window.location.origin

// ===== 网站健康度（仅匹配「企业信息」官网 host 的 website_optimization 记录）=====
const siteScore = ref('--')
const siteUrl = ref('')
const enterpriseWebsite = ref('')

const hasEnterpriseWebsite = computed(() => String(enterpriseWebsite.value || '').trim() !== '')

const siteHealthReady = computed(() => siteScore.value !== '--')

const websiteOptimizationLink = computed(() => {
  const w = String(enterpriseWebsite.value || '').trim()
  if (!w) return '/website-optimization'
  return { path: '/website-optimization', query: { url: w } }
})

const healthGradeClass = computed(() => {
  const s = siteScore.value
  if (s === '--' || typeof s !== 'number') return 'grade-red'
  if (s >= 80) return 'grade-green'
  if (s >= 60) return 'grade-yellow'
  return 'grade-red'
})

const healthGrade = computed(() => {
  const s = siteScore.value
  if (s === '--' || typeof s !== 'number') return '需改进'
  if (s >= 80) return '优秀'
  if (s >= 70) return '良好'
  if (s >= 60) return '及格'
  return '需改进'
})

const siteDimensions = ref([
  { name: '技术基础', score: 0, color: '#409eff' },
  { name: '页面结构', score: 0, color: '#67c23a' },
  { name: '结构化数据', score: 0, color: '#e6a23c' },
  { name: 'AI亲和性', score: 0, color: '#7070f0' },
])

/** 与网站优化检测页分解权重一致，用于仅有 overall 时估算各条 */
const DIM_WEIGHTS = { tech: 0.22, structure: 0.28, schema: 0.22, ai: 0.28 }

function normalizeSiteHost(raw) {
  const t = String(raw || '').trim()
  if (!t) return ''
  try {
    let href = t
    if (!/^https?:\/\//i.test(href)) href = `https://${href}`
    return new URL(href).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return t
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split('?')[0]
      .replace(/^www\./i, '')
      .toLowerCase()
  }
}

function pickLatestReportForEnterpriseSite(reports, enterpriseUrl) {
  const h = normalizeSiteHost(enterpriseUrl)
  if (!h || !Array.isArray(reports)) return null
  for (const r of reports) {
    if (normalizeSiteHost(r.url) === h) return r
  }
  return null
}

function reportOverallScore(row) {
  if (!row) return null
  const n = Number(row.overallScore ?? row.score)
  return Number.isFinite(n) ? n : null
}

function applySiteDimensionsFromRow(row, overall) {
  let tech = Number(row.techScore ?? 0)
  let seo = Number(row.seoScore ?? 0)
  let ai = Number(row.aiScore ?? 0)
  let content = Number(row.contentScore ?? 0)
  const sum = tech + seo + ai + content
  const o = Math.min(100, Math.max(0, Number(overall) || 0))
  if (sum === 0 && o > 0) {
    tech = Math.round(o * DIM_WEIGHTS.tech)
    const structure = Math.round(o * DIM_WEIGHTS.structure)
    const schema = Math.round(o * DIM_WEIGHTS.schema)
    const aiF = Math.max(0, o - tech - structure - schema)
    siteDimensions.value = [
      { name: '技术基础', score: tech, color: '#409eff' },
      { name: '页面结构', score: structure, color: '#67c23a' },
      { name: '结构化数据', score: schema, color: '#e6a23c' },
      { name: 'AI亲和性', score: aiF, color: '#7070f0' },
    ]
    return
  }
  siteDimensions.value = [
    { name: '技术基础', score: Math.min(100, tech), color: '#409eff' },
    { name: '页面结构', score: Math.min(100, content), color: '#67c23a' },
    { name: '结构化数据', score: Math.min(100, seo), color: '#e6a23c' },
    { name: 'AI亲和性', score: Math.min(100, ai), color: '#7070f0' },
  ]
}

function goEnterpriseSettings() {
  router.push('/enterprise-settings')
}

function goWebsiteOptimization() {
  router.push(websiteOptimizationLink.value)
}

// ===== GEO收录 =====
const geoPlatforms = ref([
  { name: 'DeepSeek',  count: 0, pct: 0,  color: '#409eff' },
  { name: '豆包',      count: 0, pct: 0,  color: '#f56c6c' },
  { name: '腾讯元宝',  count: 0, pct: 0,  color: '#e6a23c' },
  { name: '通义千问',  count: 0, pct: 0,  color: '#7070f0' },
  { name: '文心一言',  count: 0, pct: 0,  color: '#67c23a' },
  { name: 'KIMI',      count: 0, pct: 0,  color: '#f56cbc' },
  { name: '智谱',      count: 0, pct: 0,  color: '#36cfc9' },
])

const totalCollected = computed(() => geoPlatforms.value.reduce((s, p) => s + p.count, 0))
const totalQuestions = ref(0)
const collectionRate = computed(() => {
  if (totalQuestions.value === 0) return 0
  return Math.round((totalCollected.value / totalQuestions.value) * 100)
})
const rateClass = computed(() => {
  if (collectionRate.value >= 60) return 'rate-green'
  if (collectionRate.value >= 30) return 'rate-yellow'
  return 'rate-red'
})

// ===== 关键词与问题 =====
const keywordStats = ref({
  total: 0,
  brand: 0,
  product: 0,
  industry: 0,
  questions: 0,
  questionsApproved: 0,
})

// ===== 内容创作 =====
const contentStats = ref({
  drafts: 0,
  published: 0,
})

// ===== GEO可见度检测历史 =====
const geoHistory = ref([])

const formatHistoryDate = (dateStr) => (!dateStr ? '' : formatZhCnMdHm(dateStr))

// 未启用 keep-alive：每次进入控制台都会重新挂载并拉取最新统计
// ===== 初始化 =====
onMounted(async () => {
  const userId = getCurrentUserId()

  // 网站健康度：企业官网 + 匹配 host 的检测记录（不按时间取任意 URL）
  siteScore.value = '--'
  siteUrl.value = ''
  try {
    const [settingsRes, reportsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/settings`, { headers: { 'Authorization': 'Bearer ' + getToken() } }),
      fetch(`${API_BASE_URL}/api/website-reports`, { headers: { 'Authorization': 'Bearer ' + getToken() } }),
    ])
    let website = ''
    if (settingsRes.ok) {
      const st = await settingsRes.json()
      website = String(st.website || '').trim()
      enterpriseWebsite.value = website
    } else {
      enterpriseWebsite.value = ''
    }

    if (website && reportsRes.ok) {
      const reports = await reportsRes.json()
      const matched = pickLatestReportForEnterpriseSite(
        Array.isArray(reports) ? reports : [],
        website
      )
      const overall = reportOverallScore(matched)
      if (matched && overall != null) {
        siteScore.value = overall
        siteUrl.value = String(matched.url || website).trim() || website
        applySiteDimensionsFromRow(matched, overall)
      }
    }
  } catch (e) {
    console.warn('获取网站健康度失败:', e)
  }

  // 关键词 / 问题 / 草稿 / 已发布 — 聚合统计（与列表分页无关）
  try {
    const res = await fetch(`${API_BASE_URL}/api/dashboard-stats`, {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    })
    if (res.ok) {
      const s = await res.json()
      keywordStats.value.total = s.keywordsTotal ?? 0
      keywordStats.value.brand = s.keywordBrand ?? 0
      keywordStats.value.product = s.keywordProduct ?? 0
      keywordStats.value.industry = s.keywordIndustry ?? 0
      keywordStats.value.questions = s.questionsTotal ?? 0
      keywordStats.value.questionsApproved = s.questionsApproved ?? 0
      totalQuestions.value = s.questionsTotal ?? 0
      contentStats.value.drafts = s.draftsTotal ?? 0
      contentStats.value.published = s.publishedTotal ?? 0
    }
  } catch (e) {
    console.warn('获取控制台统计失败:', e)
  }

  // GEO检测历史 - 从后端 API
  try {
    const res = await fetch(`${API_BASE_URL}/api/geo-tasks`, {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    })
    if (res.ok) {
      const data = await res.json()
      if (data && data.length > 0) {
        geoHistory.value = data.slice(-10).reverse()
      }
    }
  } catch (e) {
    console.warn('获取GEO检测历史失败:', e)
  }
})
</script>

<style scoped>
.section-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.section-title-text {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

/* 快捷入口 */
.quick-card {
  border-radius: 12px;
  padding: 18px;
  color: white;
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: pointer;
}

.quick-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.15);
}

.quick-orange { background: linear-gradient(135deg, #f56c6c, #e6a23c); }
.quick-green  { background: linear-gradient(135deg, #67c23a, #85ce61); }
.quick-purple { background: linear-gradient(135deg, #7070f0, #9090f5); }
.quick-blue   { background: linear-gradient(135deg, #409eff, #66b1ff); }

.quick-icon { margin-bottom: 10px; opacity: 0.9; }
.quick-name { font-size: 14px; font-weight: 700; margin-bottom: 3px; }
.quick-desc { font-size: 12px; opacity: 0.8; }

/* 卡片 */
.dash-card {
  background: #fafbfc;
  border: 1px solid #ebeef5;
  border-radius: 14px;
  padding: 20px;
}

.dash-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
  gap: 12px;
}

.dash-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.dash-card-title-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.dash-card-subhint {
  font-size: 11px;
  font-weight: 400;
  color: #909399;
  line-height: 1.3;
  padding-left: 24px;
}

.dash-icon { font-size: 16px; }

.dash-card-more {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: #909399;
  text-decoration: none;
  transition: color 0.2s;
  flex-shrink: 0;
  align-self: center;
}

.dash-card-more:hover { color: #409eff; }

/* 健康度 */
.health-body {
  display: flex;
  gap: 20px;
  align-items: center;
}

.health-left {
  text-align: center;
  min-width: 80px;
}

.health-big-score {
  font-size: 36px;
  font-weight: 900;
  line-height: 1;
}

.health-big-label {
  font-size: 12px;
  color: #909399;
  margin: 4px 0 6px;
}

.health-grade-tag {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 10px;
}

.health-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dim-bar-item {}

.dim-bar-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
}

.dim-bar-name {
  font-size: 12px;
  color: #606266;
}

.dim-bar-score {
  font-size: 12px;
  font-weight: 700;
}

.dim-bar-track {
  height: 6px;
  background: #ebeef5;
  border-radius: 3px;
  overflow: hidden;
}

.dim-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 1s ease;
}

.health-url-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.health-url-text {
  font-size: 12px;
  color: #909399;
}

.health-empty {
  text-align: center;
  padding: 16px 0;
}

.health-empty-icon { margin-bottom: 8px; }
.health-empty-text {
  font-size: 14px;
  font-weight: 600;
  color: #909399;
  margin-bottom: 4px;
}
.health-empty-sub {
  font-size: 12px;
  color: #c0c4cc;
}

.health-empty--cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 168px;
  padding: 20px 16px 24px;
  gap: 12px;
}

.health-empty--cta .health-empty-text {
  margin-bottom: 0;
  color: #606266;
}

.health-empty--cta .health-empty-sub {
  max-width: 280px;
  line-height: 1.5;
  color: #909399;
}

.health-cta-btn {
  min-width: 200px;
}

.health-preview-url {
  color: #409eff;
  word-break: break-all;
}

/* GEO */
.geo-platforms {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-bottom: 16px;
}

.geo-platform-item {}

.geo-platform-top {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.geo-platform-name {
  font-size: 12px;
  color: #606266;
}

.geo-platform-count {
  font-size: 13px;
  font-weight: 800;
}

.geo-platform-bar {
  height: 5px;
  background: #ebeef5;
  border-radius: 3px;
  overflow: hidden;
}

.geo-platform-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.8s ease;
}

.geo-summary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding-top: 14px;
  border-top: 1px solid #ebeef5;
}

.geo-summary-item {
  flex: 1;
  text-align: center;
}

.geo-summary-num {
  display: block;
  font-size: 22px;
  font-weight: 900;
  color: #303133;
  line-height: 1;
  margin-bottom: 4px;
}

.geo-summary-num.rate-green { color: #67c23a; }
.geo-summary-num.rate-yellow { color: #e6a23c; }
.geo-summary-num.rate-red { color: #f56c6c; }

.geo-summary-label {
  font-size: 11px;
  color: #909399;
}

.geo-summary-divider {
  width: 1px;
  height: 36px;
  background: #ebeef5;
}

/* 双列统计 */
.stat-two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.stat-big-item {
  background: white;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 16px;
  text-align: center;
}

.stat-big-num {
  font-size: 32px;
  font-weight: 900;
  line-height: 1;
  margin-bottom: 6px;
}

.stat-big-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-big-sub {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
}

.stat-tag {
  font-size: 11px;
  font-weight: 600;
}

.grade-green { color: #67c23a; }
.grade-yellow { color: #e6a23c; }
.grade-red { color: #f56c6c; }
.health-grade-tag.grade-green { background: #f0f9eb; }
.health-grade-tag.grade-yellow { background: #fdf6ec; }
.health-grade-tag.grade-red { background: #fef0f0; }

.stat-tag-green {
  color: #67c23a;
  background: #f0f9eb;
  padding: 1px 8px;
  border-radius: 8px;
  font-size: 11px;
}

.stat-tag-gray {
  color: #909399;
  background: #f5f7fa;
  padding: 1px 8px;
  border-radius: 8px;
  font-size: 11px;
}

/* GEO可见度检测历史 */
.geo-history-section { margin-bottom: 20px; }
.geo-history-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
.geo-history-card { background: #f5f7fa; border-radius: 10px; padding: 14px; cursor: pointer; border: 1px solid #e4e7ed; }
.geo-history-card:hover { border-color: #409eff; }
.geo-history-score { font-size: 28px; font-weight: 900; color: #303133; }
.geo-history-grade { font-size: 12px; color: #909399; }
.geo-history-date { font-size: 12px; color: #909399; margin-top: 4px; }
.geo-history-stats { display: flex; gap: 10px; margin-top: 6px; font-size: 12px; }
.geo-history-empty { text-align: center; padding: 24px; color: #909399; }
</style>
