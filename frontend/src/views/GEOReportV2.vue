<template>
  <div class="gr2-page">
    <div class="gr2-toolbar">
      <div>
        <h1 class="gr2-title">改进方案报告 2.0</h1>
        <p class="gr2-sub">
          数据口径：与「品牌体检报告」相同的最近一次已完成任务；官网为「企业设置」中的网址在网站优化检测历史中的<strong>最新一条</strong>匹配记录。
        </p>
      </div>
      <div class="gr2-toolbar-actions">
        <el-button type="primary" :loading="loading" @click="loadAll">
          <el-icon class="mr-1"><Refresh /></el-icon>
          刷新数据
        </el-button>
        <el-button plain @click="$router.push('/geo-health')">品牌体检报告</el-button>
        <el-button plain @click="$router.push('/website-optimization')">网站优化检测</el-button>
      </div>
    </div>

    <!-- Step 规划（可读流程） -->
    <div class="gr2-steps">
      <div class="gr2-step" :class="{ done: stepDone[0], err: stepErr[0] }">
        <span class="gr2-step-num">1</span>
        <div>
          <div class="gr2-step-title">企业信息</div>
          <div class="gr2-step-desc">{{ stepMsg[0] }}</div>
        </div>
      </div>
      <div class="gr2-step-arrow">→</div>
      <div class="gr2-step" :class="{ done: stepDone[1], err: stepErr[1] }">
        <span class="gr2-step-num">2</span>
        <div>
          <div class="gr2-step-title">品牌体检（最新任务）</div>
          <div class="gr2-step-desc">{{ stepMsg[1] }}</div>
        </div>
      </div>
      <div class="gr2-step-arrow">→</div>
      <div class="gr2-step" :class="{ done: stepDone[2], err: stepErr[2] }">
        <span class="gr2-step-num">3</span>
        <div>
          <div class="gr2-step-title">官网技术检测（匹配官网）</div>
          <div class="gr2-step-desc">{{ stepMsg[2] }}</div>
        </div>
      </div>
      <div class="gr2-step-arrow">→</div>
      <div class="gr2-step" :class="{ done: stepDone[3] }">
        <span class="gr2-step-num">4</span>
        <div>
          <div class="gr2-step-title">聚合视图</div>
          <div class="gr2-step-desc">{{ stepMsg[3] }}</div>
        </div>
      </div>
    </div>

    <div v-if="fatalError" class="gr2-banner gr2-banner--err">
      {{ fatalError }}
    </div>

    <!-- 顶栏：元数据 + 综合分 -->
    <div class="gr2-hero">
      <div class="gr2-hero-left">
        <div class="gr2-hero-badge">Auyo · 全域认知改进视图</div>
        <h2 class="gr2-hero-title">{{ enterprise.companyName || '未设置企业名称' }}</h2>
        <div class="gr2-hero-meta">
          <span>品牌任务 ID：<code>{{ health.rawData?.taskId ?? '—' }}</code></span>
          <span>体检时间：{{ health.checkTime || '—' }}</span>
          <span v-if="websiteMatch">官网检测：{{ formatTime(websiteMatch.checkedAt) }}</span>
          <span v-else>官网检测：未匹配到与企业官网 URL 一致的历史记录</span>
        </div>
        <div class="gr2-hero-meta gr2-hero-meta--small">
          企业官网（设置）：{{ enterprise.website || '未填写' }}
          <template v-if="websiteMatch"> · 匹配记录 URL：{{ websiteMatch.url }}</template>
        </div>
      </div>
      <div class="gr2-hero-score" :class="blendedGradeClass">
        <div class="gr2-hero-score-label">综合改进指数</div>
        <div class="gr2-hero-score-value">{{ blendedScore }}</div>
        <div class="gr2-hero-score-sub">{{ blendedLabel }}</div>
        <div class="gr2-hero-score-hint">
          品牌 AI 健康分 {{ health.healthScore ?? '—' }} ×55% + 官网技术分 {{ websiteScoreDisplay }} ×45%
        </div>
      </div>
    </div>

    <!-- KPI 四卡（与品牌体检口径一致） -->
    <div class="gr2-kpi-row">
      <div class="gr2-kpi" :class="toneForPercent(health.interceptRate)">
        <div class="gr2-kpi-label">首行心智拦截率</div>
        <div class="gr2-kpi-value">{{ health.interceptRate ?? 0 }}%</div>
        <div class="gr2-kpi-hint">开放式可见占比（与品牌报告 KPI 一致）</div>
      </div>
      <div class="gr2-kpi" :class="toneForBlind(health.blindModelCount, health.totalModelCount)">
        <div class="gr2-kpi-label">大模型盲区</div>
        <div class="gr2-kpi-value">{{ health.blindModelCount ?? 0 }}/{{ health.totalModelCount ?? 0 }}</div>
        <div class="gr2-kpi-hint">开放式全盲模型数 / 参与模型数</div>
      </div>
      <div class="gr2-kpi" :class="toneForNegative(health.negativeRatio)">
        <div class="gr2-kpi-label">负面事实关联度</div>
        <div class="gr2-kpi-value">{{ formatRatio(health.negativeRatio) }}</div>
        <div class="gr2-kpi-hint">{{ health.negativeRiskLevel || '—' }}</div>
      </div>
      <div class="gr2-kpi" :class="toneForAuthority(health.authorityScore)">
        <div class="gr2-kpi-label">信源权威覆盖</div>
        <div class="gr2-kpi-value">{{ health.authorityScore ?? 0 }}%</div>
        <div class="gr2-kpi-hint">可信信源引用占比（越高越好）</div>
      </div>
    </div>

    <!-- 双栏：站 / 牌 -->
    <div class="gr2-split">
      <div class="gr2-card">
        <div class="gr2-card-head">
          <el-icon><Monitor /></el-icon>
          <span>自有数字资产 · 官网技术扫描</span>
        </div>
        <template v-if="websiteMatch">
          <div class="gr2-metric">
            <span>综合技术分</span>
            <strong>{{ websiteMatch.score }}</strong>
          </div>
          <div class="gr2-metric" v-if="schemaScore != null">
            <span>结构化数据（Schema）</span>
            <span class="gr2-muted"><strong>{{ schemaScore }}</strong>/25</span>
          </div>
          <div class="gr2-metric" v-if="techDimScore != null">
            <span>技术基础</span>
            <span class="gr2-muted"><strong>{{ techDimScore }}</strong>/25</span>
          </div>
          <div class="gr2-metric" v-if="aiFriendlyScore != null">
            <span>AI 亲和性</span>
            <span class="gr2-muted"><strong>{{ aiFriendlyScore }}</strong>/25</span>
          </div>
          <div class="gr2-block-title">待改进（检测摘要）</div>
          <ul class="gr2-issue-list">
            <li v-for="(w, i) in websiteWarnTop" :key="i">{{ w.title }}：{{ w.desc }}</li>
            <li v-if="!websiteWarnTop.length" class="gr2-muted">暂无 warn 级别问题，或原始数据未含 issues。</li>
          </ul>
        </template>
        <div v-else class="gr2-muted gr2-pad">
          请在「企业设置」填写官网地址后，在「网站优化检测」对<strong>同一域名</strong>执行检测；系统将按 URL 匹配取最新一条。
        </div>
      </div>

      <div class="gr2-card">
        <div class="gr2-card-head">
          <el-icon><TrendCharts /></el-icon>
          <span>品牌语境 · 内容侧摘要</span>
        </div>
        <div class="gr2-metric" v-if="health.brandMentionRate != null">
          <span>开放式品牌提及率</span>
          <strong>{{ health.brandMentionRate }}%</strong>
        </div>
        <div class="gr2-metric" v-if="health.industryMentionRate != null">
          <span>行业提及基准（含竞品）</span>
          <strong>{{ health.industryMentionRate }}%</strong>
        </div>
        <div class="gr2-block-title">语境矩阵摘要</div>
        <p class="gr2-para">{{ matrixContextSummary }}</p>
        <div class="gr2-block-title">词云规模</div>
        <p class="gr2-para">本期任务词云词条 <strong>{{ wordCloudCount }}</strong> 条（与品牌报告数据源一致）</p>
        <div v-if="diagnosticHint" class="gr2-warn-box">{{ diagnosticHint }}</div>
      </div>
    </div>

    <!-- 矩阵 -->
    <div class="gr2-card gr2-matrix-wrap">
      <div class="gr2-card-head">
        <el-icon><DataLine /></el-icon>
        <span>全域可见度矩阵（关键词类型 × 大模型）</span>
      </div>
      <p class="gr2-matrix-hint">单元格状态与配色规则与「品牌体检报告」后端聚合一致。</p>
      <div v-if="!matrixRows.length || !platformCols.length" class="gr2-muted gr2-pad">
        暂无矩阵数据（需完成品牌体检且任务状态为已完成）。
      </div>
      <div v-else class="gr2-table-scroll">
        <table class="gr2-matrix">
          <thead>
            <tr>
              <th class="gr2-th-corner">意图 / 模型</th>
              <th v-for="p in platformCols" :key="p.key">{{ p.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in matrixRows" :key="row.key">
              <th>{{ row.label }}</th>
              <td v-for="p in platformCols" :key="row.key + '-' + p.key">
                <span class="gr2-cell" :class="cellClass(matrixData[row.key]?.[p.key])">
                  {{ matrixData[row.key]?.[p.key]?.label || '—' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { getToken, getCurrentUserId } from '../utils/auth.js'
import { ref, computed } from 'vue'
import { Refresh, Monitor, TrendCharts, DataLine } from '@element-plus/icons-vue'

const API_BASE_URL = window.VITE_API_URL || window.location.origin
const USER_ID = getCurrentUserId()

const loading = ref(false)
const fatalError = ref('')

const enterprise = ref({
  companyName: '',
  website: '',
})

const health = ref({
  checkTime: '',
  healthScore: 0,
  interceptRate: 0,
  blindModelCount: 0,
  totalModelCount: 0,
  negativeRatio: 0,
  negativeRiskLevel: '',
  authorityScore: 0,
  brandMentionRate: 0,
  industryMentionRate: 0,
  matrixData: {},
  intentPaths: [],
  platforms: [],
  sentimentWordCloud: [],
  diagnosticSuggestions: [],
  matrixContext: null,
  rawData: {},
})

const websiteReports = ref([])
const websiteMatch = ref(null)

const stepDone = ref([false, false, false, false])
const stepErr = ref([false, false, false, false])
const stepMsg = ref([
  '等待加载…',
  '等待加载…',
  '等待加载…',
  '等待展示…',
])

function hostKey(u) {
  let s = String(u || '')
    .trim()
    .toLowerCase()
  s = s.replace(/^https?:\/\//, '')
  s = s.split('/')[0]
  s = s.replace(/^www\./, '')
  return s
}

function parseWebsiteRow(r) {
  const rep = r.report && typeof r.report === 'object' ? r.report : {}
  let items = rep.items ?? r.items
  let issues = rep.issues ?? r.issues
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items || '{}')
    } catch {
      items = {}
    }
  }
  if (typeof issues === 'string') {
    try {
      issues = JSON.parse(issues || '{"warn":[],"pass":[]}')
    } catch {
      issues = { warn: [], pass: [] }
    }
  }
  const score = Number(r.score ?? r.overallScore ?? rep.score ?? 0)
  return {
    id: r.id,
    url: r.url || '',
    score,
    items: items || {},
    issues: issues || { warn: [], pass: [] },
    checkedAt: r.checkedAt || r.checked_at,
  }
}

function pickOfficialWebsiteReport(reports, officialWebsite) {
  const target = hostKey(officialWebsite)
  if (!target || !Array.isArray(reports)) return null
  for (const raw of reports) {
    const row = parseWebsiteRow(raw)
    if (hostKey(row.url) === target) return row
  }
  return null
}

async function loadEnterprise() {
  stepErr.value[0] = false
  try {
    const res = await fetch(`${API_BASE_URL}/api/settings`, {
      headers: { Authorization: 'Bearer ' + getToken() },
    })
    if (!res.ok) throw new Error(`企业信息 HTTP ${res.status}`)
    const data = await res.json()
    enterprise.value = {
      companyName: String(data.company_name ?? data.companyName ?? '').trim(),
      website: String(data.website ?? '').trim(),
    }
    stepDone.value[0] = true
    stepMsg.value[0] = enterprise.value.companyName
      ? `已加载：${enterprise.value.companyName}`
      : '已加载：企业名称为空'
  } catch (e) {
    stepErr.value[0] = true
    stepDone.value[0] = false
    stepMsg.value[0] = `失败：${e.message || e}`
    throw e
  }
}

async function loadHealth() {
  stepErr.value[1] = false
  const res = await fetch(`${API_BASE_URL}/api/geo-health-report`, {
    headers: { 'Authorization': 'Bearer ' + getToken() },
  })
  if (!res.ok) throw new Error(`品牌体检报告 HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success && data.error) throw new Error(data.error)

  const raw = data.rawData || {}
  const hasTask = Number(raw.taskId) > 0

  health.value = {
    checkTime: data.checkTime || '',
    healthScore: data.healthScore ?? 0,
    interceptRate: data.interceptRate ?? 0,
    blindModelCount: data.blindModelCount ?? 0,
    totalModelCount: data.totalModelCount ?? 0,
    negativeRatio: data.negativeRatio ?? 0,
    negativeRiskLevel: data.negativeRiskLevel || '',
    authorityScore: data.authorityScore ?? 0,
    brandMentionRate: data.brandMentionRate ?? 0,
    industryMentionRate: data.industryMentionRate ?? 0,
    matrixData: data.matrixData || {},
    intentPaths: Array.isArray(data.intentPaths) ? data.intentPaths : [],
    platforms: Array.isArray(data.platforms) ? data.platforms : [],
    sentimentWordCloud: Array.isArray(data.sentimentWordCloud) ? data.sentimentWordCloud : [],
    diagnosticSuggestions: Array.isArray(data.diagnosticSuggestions) ? data.diagnosticSuggestions : [],
    matrixContext: data.matrixContext ?? null,
    rawData: raw,
  }

  stepDone.value[1] = hasTask
  stepMsg.value[1] = hasTask
    ? `任务 #${raw.taskId ?? '?'} · ${data.checkTime || ''}`
    : '暂无已完成分析的品牌体检任务（与品牌报告页一致）'
  if (!hasTask) stepErr.value[1] = true
}

async function loadWebsiteList() {
  const res = await fetch(`${API_BASE_URL}/api/website-reports`, {
    headers: { 'Authorization': 'Bearer ' + getToken() },
  })
  if (!res.ok) throw new Error(`网站检测列表 HTTP ${res.status}`)
  const list = await res.json()
  websiteReports.value = Array.isArray(list) ? list : []
}

const blendedScore = computed(() => {
  const h = Number(health.value.healthScore) || 0
  const w = websiteMatch.value ? Number(websiteMatch.value.score) || 0 : 0
  if (!websiteMatch.value) return Math.round(h)
  return Math.min(100, Math.max(0, Math.round(h * 0.55 + w * 0.45)))
})

const blendedLabel = computed(() => {
  const s = blendedScore.value
  if (s >= 80) return '良好 · 保持迭代'
  if (s >= 60) return '中等 · 有改进空间'
  if (s >= 40) return '偏弱 · 建议优先修复'
  return '紧迫 · 建议立即处理短板'
})

const blendedGradeClass = computed(() => {
  const s = blendedScore.value
  if (s >= 60) return 'is-mid'
  if (s >= 40) return 'is-warn'
  return 'is-bad'
})

const websiteScoreDisplay = computed(() =>
  websiteMatch.value ? String(websiteMatch.value.score) : '—（无匹配官网检测）'
)

const schemaScore = computed(() => websiteMatch.value?.items?.schema?.score)
const techDimScore = computed(() => websiteMatch.value?.items?.tech?.score)
const aiFriendlyScore = computed(() => websiteMatch.value?.items?.aiFriendly?.score)

const websiteWarnTop = computed(() => {
  const warn = websiteMatch.value?.issues?.warn
  if (!Array.isArray(warn)) return []
  return warn.slice(0, 6)
})

const matrixData = computed(() => health.value.matrixData || {})
const platformCols = computed(() => health.value.platforms || [])

const matrixRows = computed(() => {
  const paths = health.value.intentPaths || []
  return paths.map((p) => ({
    key: p.key,
    label: p.label || p.type || p.key,
  }))
})

const wordCloudCount = computed(() => health.value.sentimentWordCloud?.length || 0)

const matrixContextSummary = computed(() => {
  const mc = health.value.matrixContext
  if (!mc) return '暂无矩阵语境摘要（无模型样本或未生成诊断）。'
  if (typeof mc === 'string') return mc
  if (mc.summary) return String(mc.summary)
  try {
    return JSON.stringify(mc).slice(0, 280) + (JSON.stringify(mc).length > 280 ? '…' : '')
  } catch {
    return '—'
  }
})

const diagnosticHint = computed(() => {
  const arr = health.value.diagnosticSuggestions
  if (!Array.isArray(arr) || !arr.length) return ''
  const first = arr[0]
  if (typeof first === 'string') return first
  if (first?.title && first?.detail) return `${first.title}：${first.detail}`
  return ''
})

function formatRatio(ratio) {
  const n = Number(ratio)
  if (Number.isNaN(n)) return '—'
  return n.toFixed(2)
}

function formatTime(t) {
  if (!t) return '—'
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return String(t)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function toneForPercent(p) {
  const n = Number(p) || 0
  if (n >= 50) return 'is-good'
  if (n >= 25) return 'is-warn'
  return 'is-bad'
}

function toneForBlind(blind, total) {
  const b = Number(blind) || 0
  const t = Number(total) || 1
  if (b === 0) return 'is-good'
  if (b < t) return 'is-warn'
  return 'is-bad'
}

function toneForNegative(ratio) {
  const n = Number(ratio) || 0
  if (n < 0.1) return 'is-good'
  if (n < 0.2) return 'is-warn'
  return 'is-bad'
}

function toneForAuthority(a) {
  const n = Number(a) || 0
  if (n >= 40) return 'is-good'
  if (n >= 20) return 'is-warn'
  return 'is-bad'
}

function cellClass(cell) {
  const st = cell?.state || 'no_data'
  if (['industry_first', 'precise_hit', 'brand_win'].includes(st)) return 'cell-g'
  if (['head_tier', 'tie'].includes(st)) return 'cell-y'
  if (['weak_awareness', 'info_bias', 'mentioned_tail', 'competitor_win'].includes(st)) return 'cell-o'
  if (['negative_risk', 'hijack_risk', 'mind_missing'].includes(st)) return 'cell-r'
  return 'cell-n'
}

async function loadAll() {
  loading.value = true
  fatalError.value = ''
  try {
    await loadEnterprise()
    await loadHealth()
    try {
      await loadWebsiteList()
    } catch (e) {
      stepErr.value[2] = true
      stepMsg.value[2] = `请求失败：${e?.message || e}`
      websiteReports.value = []
    }
    websiteMatch.value = pickOfficialWebsiteReport(websiteReports.value, enterprise.value.website)
    if (websiteMatch.value) {
      stepDone.value[2] = true
      stepMsg.value[2] = `已匹配：${websiteMatch.value.url}（得分 ${websiteMatch.value.score}）`
      stepErr.value[2] = false
    } else if (!enterprise.value.website) {
      stepDone.value[2] = false
      stepMsg.value[2] = '企业官网未设置，无法匹配'
      stepErr.value[2] = true
    } else {
      stepDone.value[2] = false
      stepMsg.value[2] = `未找到与「${hostKey(enterprise.value.website)}」一致的检测记录`
      stepErr.value[2] = true
    }
    stepDone.value[3] = true
    stepMsg.value[3] = '已渲染 KPI、双栏摘要与矩阵'
  } catch (e) {
    fatalError.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

loadAll()
</script>

<style scoped>
.gr2-page {
  min-height: 100%;
  background: linear-gradient(165deg, #0f172a 0%, #111827 40%, #0b1222 100%);
  color: #e5e7eb;
  border-radius: 12px;
  padding: 20px 22px 28px;
  box-sizing: border-box;
}

.gr2-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.gr2-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #f9fafb;
}

.gr2-sub {
  margin: 8px 0 0;
  font-size: 13px;
  color: #94a3b8;
  max-width: 720px;
  line-height: 1.55;
}

.gr2-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.gr2-steps {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 10px;
  margin-bottom: 20px;
  padding: 14px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 10px;
}

.gr2-step {
  flex: 1 1 160px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: rgba(30, 41, 59, 0.5);
}

.gr2-step.done {
  border-color: rgba(52, 211, 153, 0.45);
}

.gr2-step.err {
  border-color: rgba(248, 113, 113, 0.55);
}

.gr2-step-num {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  background: #334155;
  color: #e2e8f0;
}

.gr2-step.done .gr2-step-num {
  background: rgba(16, 185, 129, 0.25);
  color: #6ee7b7;
}

.gr2-step.err .gr2-step-num {
  background: rgba(248, 113, 113, 0.2);
  color: #fca5a5;
}

.gr2-step-title {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
}

.gr2-step-desc {
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.45;
}

.gr2-step-arrow {
  align-self: center;
  color: #64748b;
  font-size: 14px;
  padding: 0 4px;
}

.gr2-banner {
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 14px;
  font-size: 13px;
}

.gr2-banner--err {
  background: rgba(127, 29, 29, 0.35);
  border: 1px solid rgba(248, 113, 113, 0.45);
  color: #fecaca;
}

.gr2-hero {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 20px 18px;
  margin-bottom: 18px;
  border-radius: 12px;
  background: radial-gradient(1200px 400px at 10% 0%, rgba(99, 102, 241, 0.18), transparent),
    rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.22);
}

.gr2-hero-badge {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #a5b4fc;
  margin-bottom: 8px;
}

.gr2-hero-title {
  margin: 0 0 10px;
  font-size: 20px;
  color: #fff;
}

.gr2-hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  font-size: 12px;
  color: #94a3b8;
}

.gr2-hero-meta code {
  font-size: 11px;
  background: rgba(15, 23, 42, 0.8);
  padding: 2px 6px;
  border-radius: 4px;
  color: #e2e8f0;
}

.gr2-hero-meta--small {
  margin-top: 8px;
  font-size: 11px;
  color: #64748b;
}

.gr2-hero-score {
  min-width: 200px;
  text-align: right;
  padding: 8px 4px;
}

.gr2-hero-score-label {
  font-size: 12px;
  color: #94a3b8;
}

.gr2-hero-score-value {
  font-size: 48px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.gr2-hero-score.is-good .gr2-hero-score-value {
  color: #4ade80;
}
.gr2-hero-score.is-mid .gr2-hero-score-value {
  color: #fbbf24;
}
.gr2-hero-score.is-warn .gr2-hero-score-value {
  color: #fb923c;
}
.gr2-hero-score.is-bad .gr2-hero-score-value {
  color: #f87171;
}

.gr2-hero-score-sub {
  font-size: 13px;
  color: #e2e8f0;
  margin-top: 4px;
}

.gr2-hero-score-hint {
  margin-top: 8px;
  font-size: 11px;
  color: #64748b;
}

.gr2-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

@media (max-width: 1024px) {
  .gr2-kpi-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .gr2-kpi-row {
    grid-template-columns: 1fr;
  }
}

.gr2-kpi {
  border-radius: 10px;
  padding: 14px 14px 12px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.gr2-kpi-label {
  font-size: 12px;
  color: #94a3b8;
}

.gr2-kpi-value {
  margin-top: 8px;
  font-size: 26px;
  font-weight: 800;
}

.gr2-kpi-hint {
  margin-top: 8px;
  font-size: 11px;
  color: #64748b;
  line-height: 1.4;
}

.gr2-kpi.is-good .gr2-kpi-value {
  color: #4ade80;
}
.gr2-kpi.is-warn .gr2-kpi-value {
  color: #fbbf24;
}
.gr2-kpi.is-bad .gr2-kpi-value {
  color: #f87171;
}

.gr2-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

@media (max-width: 900px) {
  .gr2-split {
    grid-template-columns: 1fr;
  }
}

.gr2-card {
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  padding: 16px 16px 14px;
}

.gr2-matrix-wrap {
  padding-bottom: 10px;
}

.gr2-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
  margin-bottom: 14px;
}

.gr2-metric {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  color: #94a3b8;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(51, 65, 85, 0.85);
}

.gr2-metric strong {
  color: #f8fafc;
  font-size: 16px;
}

.gr2-muted {
  color: #64748b;
}

.gr2-block-title {
  margin: 14px 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.gr2-issue-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: #cbd5e1;
  line-height: 1.55;
}

.gr2-para {
  margin: 0;
  font-size: 13px;
  color: #cbd5e1;
  line-height: 1.55;
}

.gr2-warn-box {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(127, 29, 29, 0.35);
  border: 1px solid rgba(248, 113, 113, 0.4);
  color: #fecdd3;
  font-size: 12px;
  line-height: 1.5;
}

.gr2-pad {
  padding: 8px 0 4px;
}

.gr2-matrix-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: #64748b;
}

.gr2-table-scroll {
  overflow-x: auto;
  border-radius: 8px;
}

.gr2-matrix {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 520px;
}

.gr2-matrix th,
.gr2-matrix td {
  border: 1px solid rgba(51, 65, 85, 0.85);
  padding: 8px 10px;
  text-align: center;
}

.gr2-th-corner {
  text-align: left;
  background: rgba(30, 41, 59, 0.95);
  color: #94a3b8;
}

.gr2-matrix thead th {
  background: rgba(30, 41, 59, 0.95);
  color: #cbd5e1;
  font-weight: 600;
}

.gr2-matrix tbody th {
  text-align: left;
  background: rgba(15, 23, 42, 0.95);
  color: #e2e8f0;
  font-weight: 500;
  white-space: nowrap;
}

.gr2-cell {
  display: inline-block;
  min-width: 72px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.gr2-cell.cell-g {
  background: rgba(22, 163, 74, 0.25);
  color: #86efac;
}
.gr2-cell.cell-y {
  background: rgba(59, 130, 246, 0.22);
  color: #93c5fd;
}
.gr2-cell.cell-o {
  background: rgba(245, 158, 11, 0.22);
  color: #fcd34d;
}
.gr2-cell.cell-r {
  background: rgba(220, 38, 38, 0.3);
  color: #fecaca;
}
.gr2-cell.cell-n {
  background: rgba(51, 65, 85, 0.6);
  color: #94a3b8;
}

.mr-1 {
  margin-right: 4px;
}
</style>
