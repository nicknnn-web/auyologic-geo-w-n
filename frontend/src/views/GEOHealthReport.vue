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
        <div class="nav-module-block">
          <span class="nav-module">品牌 AI 健康体检报告</span>
          <span
            v-if="enterpriseSettings.companyName"
            class="nav-enterprise-hint"
            title="来自「企业信息」设置（/api/settings）"
          >
            {{ enterpriseSettings.companyName }}
            <template v-if="enterpriseSettings.industry"> · {{ enterpriseSettings.industry }}</template>
          </span>
        </div>
      </div>
      <div class="nav-right">
        <div class="nav-time">检测时间：{{ checkTime }}</div>
        <el-button
          size="small"
          type="primary"
          :loading="generating || loading"
          :disabled="generating || loading"
          @click="generateHealthReport"
        >
          <el-icon><MagicStick /></el-icon>
          {{ generating ? generatingText : '生成体检报告' }}
        </el-button>
      </div>
    </div>

    <!-- 主报告体 -->
    <div class="report-body">

      <!-- ===== 区块1：大模型可见度综合得分（全部模型柱状图）===== -->
      <div class="section-model-visibility">
        <div v-if="modelVisibilitySorted.length" class="mv-rest-chart-block" role="region" aria-label="各模型可见度得分">
          <div class="mv-rest-chart-head">
            <div class="section-title-row">
              <h2 class="section-title">大模型可见度综合得分</h2>
              <span class="section-tag">AI VISIBILITY SCORE</span>
            </div>
          </div>
          <div ref="mvRestChartDom" class="mv-rest-chart-echarts" />
        </div>
      </div>

      <!-- ===== 区块2：四大核心指标 ===== -->
      <div class="section-kpi">
        <div class="section-title-row">
          <h2 class="section-title">核心指标</h2>
          <span class="section-tag">KEY METRICS</span>
        </div>

        <el-alert
          v-if="kpiDenominator === 'all_fallback' && hasData"
          type="info"
          :closable="false"
          show-icon
          class="kpi-denominator-alert"
          title="未检测到开放式提问（场景词/功能词/价格词）记录，首行心智拦截率的分母已降级为全部检测记录。"
        />

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

        <!-- 品牌提及率 vs 行业基准线 -->
        <div class="mention-rate-card" v-if="hasData">
          <div class="mention-rate-header">
            <div class="mention-rate-title-group">
              <span class="mention-rate-title">品牌提及率 vs 行业基准线</span>
              <span class="mention-rate-tag">MENTION RATE</span>
            </div>
            <span class="mention-rate-scope">仅开放式提问（场景词 / 功能词 / 价格词）· 共 {{ openMentionTotal }} 题</span>
          </div>

          <div class="mention-rate-rows">
            <!-- 指标 A：品牌提及率 -->
            <div class="mention-rate-row">
              <div class="mention-rate-label-wrap">
                <span class="mr-dot mr-dot--brand"></span>
                <span class="mr-label">品牌提及率</span>
                <el-tooltip
                  content="回答中提到了客户品牌的开放式问题数 / 开放式提问总数"
                  placement="top"
                  :show-after="200"
                >
                  <span class="mr-hint-icon">?</span>
                </el-tooltip>
              </div>
              <div class="mr-bar-track">
                <div class="mr-bar-fill mr-bar--brand" :style="{ width: brandMentionRate + '%' }"></div>
              </div>
              <span class="mr-value mr-value--brand">{{ brandMentionRate }}%</span>
            </div>

            <!-- 指标 B：行业基准线 -->
            <div class="mention-rate-row">
              <div class="mention-rate-label-wrap">
                <span class="mr-dot mr-dot--industry"></span>
                <span class="mr-label">行业基准线</span>
                <el-tooltip
                  content="回答中提及了任意行业品牌（含本品牌或竞品）的开放式问题数 / 开放式提问总数"
                  placement="top"
                  :show-after="200"
                >
                  <span class="mr-hint-icon">?</span>
                </el-tooltip>
              </div>
              <div class="mr-bar-track">
                <div class="mr-bar-fill mr-bar--industry" :style="{ width: industryMentionRate + '%' }"></div>
              </div>
              <span class="mr-value mr-value--industry">{{ industryMentionRate }}%</span>
            </div>
          </div>

          <!-- 差值解读 -->
          <div class="mention-rate-gap" v-if="openMentionTotal > 0">
            <template v-if="industryMentionRate > brandMentionRate">
              <span class="gap-icon gap-warn">↓</span>
              品牌提及率低于行业基准 <b>{{ industryMentionRate - brandMentionRate }}%</b>，有 {{ industryMentionRate - brandMentionRate }}% 的开放式回答提到了行业但未提到本品牌
            </template>
            <template v-else-if="brandMentionRate >= industryMentionRate && industryMentionRate > 0">
              <span class="gap-icon gap-good">✓</span>
              品牌提及率达到或超过行业基准，品牌在开放式提问中具备较强曝光
            </template>
            <template v-else>
              <span class="gap-icon gap-neutral">–</span>
              开放式回答中均未检测到行业品牌提及，建议增加相关检测样本
            </template>
          </div>
        </div>
      </div>

      <!-- ===== 区块3：全域可见度矩阵 ===== -->
      <div class="section-matrix">
        <div class="section-title-row">
          <h2 class="section-title">全域可见度矩阵</h2>
          <span class="section-tag">AI PLATFORM VISIBILITY</span>
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
                    <el-tooltip
                      :content="getCellTooltip(path, plat)"
                      placement="top"
                      :show-after="200"
                      :disabled="!getCellTooltip(path, plat)"
                      popper-class="matrix-cell-tooltip-popper"
                    >
                      <div
                        class="result-cell"
                        :class="[getCellClass(path, plat), { 'result-cell--has-tip': !!getCellTooltip(path, plat) }]"
                      >
                        <span class="result-text">{{ getCellText(path, plat) }}</span>
                      </div>
                    </el-tooltip>
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

      <!-- ===== 区块3b：竞品拦截诊断（帕累托图）===== -->
      <div class="section-competitor">
        <div class="section-title-row">
          <h2 class="section-title">竞品拦截诊断</h2>
          <span class="section-tag">COMPETITOR INTERCEPTION</span>
        </div>

        <p class="competitor-section-sub">帕累托分析 · X轴：竞品 · 左Y：提及次数 · 右Y：累计占比 — 红虚线为80%阈值</p>

        <div class="competitor-card">
          <div v-if="competitorMentions.length">
            <!-- 帕累托图 -->
            <div ref="competitorParetoChartDom" class="competitor-pareto-chart" />

            <!-- 点击竞品后展示详情 -->
            <transition name="comp-detail-fade">
              <div v-if="selectedCompetitor" class="competitor-detail-panel">
                <div class="competitor-detail-header">
                  <div class="competitor-detail-name-wrap">
                    <span class="competitor-detail-name">{{ selectedCompetitor.name }}</span>
                    <span class="competitor-detail-badge">{{ selectedCompetitor.count }} 次提及 · {{ selectedCompetitor.pct }}%</span>
                  </div>
                  <button class="competitor-detail-close" title="关闭" @click="selectedCompetitor = null">×</button>
                </div>
                <div class="competitor-detail-body">
                  <div class="competitor-detail-row">
                    <span class="competitor-detail-label">出现在哪些问题</span>
                    <div class="competitor-detail-tags">
                      <span
                        v-for="qt in selectedCompetitor.questionTypes"
                        :key="qt"
                        class="competitor-detail-tag tag-question"
                      >{{ QUESTION_TYPE_LABEL[qt] || qt }}</span>
                      <span v-if="!selectedCompetitor.questionTypes.length" class="comp-no-data">—</span>
                    </div>
                  </div>
                  <div class="competitor-detail-row">
                    <span class="competitor-detail-label">被哪些模型提及</span>
                    <div class="competitor-detail-tags">
                      <span
                        v-for="m in selectedCompetitor.models"
                        :key="m"
                        class="competitor-detail-tag tag-model"
                      >{{ MODEL_NAME_LABEL[m] || m }}</span>
                      <span v-if="!selectedCompetitor.models.length" class="comp-no-data">—</span>
                    </div>
                  </div>
                  <div class="competitor-detail-row">
                    <span class="competitor-detail-label">情感倾向分布</span>
                    <div class="competitor-detail-sentiment">
                      <span class="sent-pill sent-win">品牌占优 {{ selectedCompetitor.win }}</span>
                      <span class="sent-pill sent-neutral">势均力敌 {{ selectedCompetitor.neutral }}</span>
                      <span class="sent-pill sent-lose">竞品占优 {{ selectedCompetitor.lose }}</span>
                      <span v-if="selectedCompetitor.negCount" class="sent-pill sent-neg">负面 {{ selectedCompetitor.negCount }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <p v-else class="competitor-click-hint">👆 点击柱子查看竞品详情</p>
            </transition>
          </div>
          <div v-else class="competitor-empty">暂无竞品提及样本，完成更多场景检测后自动汇总。</div>
        </div>
      </div>

      <!-- ===== 区块4：AI 语义情绪（词云）===== -->
      <div class="section-emotion">
        <div class="section-title-row sentiment-head-row">
          <div class="section-title-row">
            <h2 class="section-title">AI 语义情绪关联</h2>
            <span class="section-tag">SENTIMENT ANALYSIS</span>
          </div>

          <div class="sentiment-legend-inline">
            <span class="leg-i"><i class="dot dot-pos"></i>正面优势</span>
            <span class="leg-i"><i class="dot dot-neu"></i>中性描述</span>
            <span class="leg-i"><i class="dot dot-neg"></i>负面/警示</span>
          </div>
        </div>

        <div v-if="!sentimentWordCloud.length" class="sentiment-cloud-empty sentiment-cloud-empty-standalone">
          暂无足够摘要词频，完成检测后将基于 AI 回复摘要生成词云。
        </div>
        <div v-else class="sentiment-cloud-card">
          <div
            ref="sentimentCloudDom"
            class="sentiment-cloud-echarts"
            role="img"
            aria-label="语义情绪词云"
          />
        </div>

<!--        <div class="emotion-summary sentiment-summary-below">-->
<!--          <div class="emo-tag" :class="sentimentTag.type">{{ sentimentTag.text }}</div>-->
<!--          <div class="emo-summary-text">{{ sentimentSummary }}</div>-->
<!--        </div>-->
      </div>
      <!-- ===== 区块4：信源权威穿透 ===== -->
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

      <!-- ===== 区块5：智能诊断与优化建议 ===== -->
      <div v-if="diagnosticSuggestions.length" class="section-diagnosis">
        <div class="diagnosis-header-bar">
          <svg class="diagnosis-bolt" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" fill="blue" opacity="0.95"/>
          </svg>
          <h2 class="section-title">智能诊断总结与优化建议</h2>
        </div>
        <div class="diagnosis-card-list">
          <div
            v-for="(item, idx) in diagnosticSuggestions"
            :key="item.id"
            class="diagnosis-item"
          >
            <div class="diagnosis-num" :class="'num-' + (item.accent || 'rose')">{{ idx + 1 }}</div>
            <div class="diagnosis-body">
              <div class="diagnosis-title">{{ item.title }}</div>
              <p class="diagnosis-p">{{ item.diagnosis }}</p>
              <div class="diagnosis-suggest-head">💡 优化建议：</div>
              <ul class="diagnosis-ul">
                <li
                  v-for="(line, li) in item.suggestions"
                  :key="'sg' + item.id + '-' + li"
                  class="diagnosis-suggest-li"
                >
                  <textarea
                    v-if="suggestionEditingKey === suggestionKey(item.id, li)"
                    ref="suggestionEditInputRef"
                    v-model="suggestionEditDraft"
                    class="diagnosis-suggest-input"
                    rows="2"
                    @blur="commitSuggestionEdit"
                    @keydown.escape.prevent="cancelSuggestionEdit"
                  />
                  <span
                    v-else
                    class="diagnosis-suggest-text"
                    role="button"
                    tabindex="0"
                    title="点击编辑"
                    @click="startSuggestionEdit(item, li)"
                    @keydown.enter.prevent="startSuggestionEdit(item, li)"
                  >{{ suggestionDisplayText(item, li) }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>



      <!-- ===== 区块6：商业流失漏斗 ===== -->
<!--      <div class="section-funnel">-->
<!--        <div class="section-title-row">-->
<!--          <h2 class="section-title">商业流失漏斗预演</h2>-->
<!--          <span class="section-tag">BUSINESS LOSS FUNNEL</span>-->
<!--        </div>-->

<!--        <div class="funnel-layout">-->
<!--          <div class="funnel-chart">-->
<!--            <div class="funnel-stages">-->
<!--              <div v-for="(stage, i) in funnelStages" :key="stage.key" class="funnel-stage">-->
<!--                <div class="funnel-bar-wrap">-->
<!--                  <div-->
<!--                    class="funnel-bar"-->
<!--                    :style="{-->
<!--                      width: stage.width + '%',-->
<!--                      background: stage.color,-->
<!--                      opacity: 1 - i * 0.12-->
<!--                    }"-->
<!--                  >-->
<!--                    <span class="funnel-bar-label">{{ stage.label }}</span>-->
<!--                    <span class="funnel-bar-val">{{ stage.value }}</span>-->
<!--                  </div>-->
<!--                </div>-->
<!--                <div class="funnel-connector" v-if="i < funnelStages.length - 1">-->
<!--                  <span class="funnel-loss" :style="{ color: stage.lossColor }">-->
<!--                    ↓ {{ stage.lost }} 流失-->
<!--                  </span>-->
<!--                </div>-->
<!--              </div>-->
<!--            </div>-->
<!--          </div>-->

<!--          <div class="funnel-risk">-->
<!--            <div class="risk-header">-->
<!--              <el-icon color="#f56c6c"><WarnTriangleFilled /></el-icon>-->
<!--              <span>流失风险评估</span>-->
<!--            </div>-->
<!--            <div class="risk-level" :class="riskLevel">{{ riskLevelText }}</div>-->
<!--            <div class="risk-items">-->
<!--              <div v-for="risk in riskFactors" :key="risk.key" class="risk-item" :class="risk.level">-->
<!--                <span class="risk-icon">{{ risk.level === 'high' ? '⚠' : risk.level === 'mid' ? '◆' : '●' }}</span>-->
<!--                <span class="risk-text">{{ risk.text }}</span>-->
<!--                <span class="risk-impact">{{ risk.impact }}</span>-->
<!--              </div>-->
<!--            </div>-->
<!--          </div>-->
<!--        </div>-->
<!--      </div>-->

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
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import 'echarts-wordcloud'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  RefreshRight, Top, WarnTriangleFilled, ArrowLeft,
  Download, Share, Aim, Warning, List, DataLine, Document, View, Histogram,
  MagicStick
} from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const hasData = ref(false)

// ===== API 配置 =====
const API_BASE_URL = window.VITE_API_URL || window.location.origin

/**
 * 企业信息（数据库 users 表，GET /api/settings）
 * 后端：backend/src/index.js 里 app.get('/api/settings', ...)
 * 在模板或其它逻辑中可直接使用：enterpriseSettings.companyName / .website / .industry / .description / .targetAudience
 */
const enterpriseSettings = ref({
  companyName: '',
  website: '',
  industry: '',
  description: '',
  targetAudience: '',
})

const loadEnterpriseSettings = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/settings`)
    if (!res.ok) return
    const data = await res.json()
    enterpriseSettings.value = {
      companyName: String(data.company_name ?? data.companyName ?? '').trim(),
      website: String(data.website ?? '').trim(),
      industry: String(data.industry ?? '').trim(),
      description: String(data.description ?? '').trim(),
      targetAudience: String(data.target_audience ?? data.targetAudience ?? '').trim(),
    }
  } catch (e) {
    console.warn('[GEOHealthReport] 加载企业信息 /api/settings 失败', e)
  }
}

/** 报告 API 未返回品牌名/域名时，用企业设置补齐（便于页内展示与后续逻辑） */
const applyEnterpriseContextToReport = () => {
  const ent = enterpriseSettings.value
  if (ent.companyName) {
    const cur = String(brandName.value || '')
    if (!cur || cur === '品牌' || cur === '请先进行可见度检测') {
      brandName.value = ent.companyName
    }
  }
  if (ent.website && !String(brandDomain.value || '').trim()) {
    brandDomain.value = ent.website
  }
}

// ===== 响应式数据（由真实 API 填充）=====

const brandName = ref('请先进行可见度检测')
const brandDomain = ref('')
const checkTime = ref(new Date().toLocaleString('zh-CN'))
const healthScore = ref(0)

const modelVisibilityCards = ref([])

/** 按得分降序；柱状图展示全部模型 */
const modelVisibilitySorted = computed(() =>
  [...modelVisibilityCards.value].sort(
    (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)
  )
)

const mvRestChartDom = ref(null)
let mvRestChart = null

const disposeMvRestChart = () => {
  if (mvRestChart) {
    try {
      if (!mvRestChart.isDisposed()) mvRestChart.dispose()
    } catch (_) {
      /* ignore */
    }
    mvRestChart = null
  }
}

/** 各模型柱状图：白底、蓝柱、仅横向网格、无柱顶数字 */
const MV_REST_BAR_BLUE = '#5B8FF9'

const buildMvRestBarOption = (rows) => {
  if (!rows?.length) return {}
  const names = rows.map((r) => r.name || r.platformKey || '')
  const scores = rows.map((r) => Math.min(100, Math.max(0, Number(r.score) || 0)))
  const longLabel = names.some((n) => String(n).length > 5)
  const bottomPad = longLabel ? 52 : names.length > 8 ? 48 : 36
  const useZoom = names.length > 8
  return {
    backgroundColor: '#ffffff',
    grid: {
      left: 44,
      right: useZoom ? 24 : 16,
      top: useZoom ? 36 : 28,
      bottom: useZoom ? bottomPad + 36 : bottomPad,
      containLabel: false,
    },
    dataZoom: useZoom
      ? [
          {
            type: 'slider',
            show: true,
            xAxisIndex: 0,
            height: 22,
            bottom: 8,
            borderColor: 'transparent',
            fillerColor: 'rgba(64, 158, 255, 0.15)',
            handleStyle: { color: '#409eff' },
            textStyle: { color: '#909399', fontSize: 11 },
          },
        ]
      : [],
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
        shadowStyle: { color: 'rgba(64, 158, 255, 0.15)' },
      },
      confine: true,
      backgroundColor: 'rgba(255, 255, 255, 0.98)',
      borderColor: '#e4e7ed',
      borderWidth: 1,
      padding: [10, 12],
      extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.08);',
      textStyle: { color: '#303133', fontSize: 12 },
      formatter(params) {
        const p = Array.isArray(params) ? params[0] : params
        const idx = p?.dataIndex
        const row = rows[idx]
        if (!row) return ''
        const bullets = Array.isArray(row.bullets) ? row.bullets : []
        let html = `<div style="font-weight:600;margin-bottom:6px;color:#303133">${row.name || ''}</div>`
        html += `<div style="color:#606266;margin-bottom:8px">可见度得分：<b>${row.score}</b> / 100</div>`
        if (bullets.length) {
          html +=
            '<div style="border-top:1px solid #ebeef5;padding-top:8px;line-height:1.55;text-align:left">'
          bullets.forEach((b) => {
            const tone = b?.tone || 'neutral'
            const col =
              tone === 'bad'
                ? '#f56c6c'
                : tone === 'warn'
                  ? '#e6a23c'
                  : tone === 'good'
                    ? '#67c23a'
                    : '#606266'
            html += `<div style="margin-top:4px;color:${col}">• ${b?.text || ''}</div>`
          })
          html += '</div>'
        }
        return html
      },
    },
    xAxis: {
      type: 'category',
      data: names,
      axisLine: { lineStyle: { color: '#DCDFE6' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#606266',
        rotate: names.some((n) => String(n).length > 6) ? 28 : 0,
        interval: 0,
        fontSize: 11,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      interval: 20,
      splitLine: {
        show: true,
        lineStyle: { color: '#EBEEF5', width: 1, type: 'solid' },
      },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#909399',
        fontSize: 11,
      },
    },
    series: [
      {
        type: 'bar',
        data: scores.map((s) => ({
          value: s,
          itemStyle: {
            color: MV_REST_BAR_BLUE,
            borderRadius: [3, 3, 0, 0],
          },
        })),
        barMaxWidth: 32,
        barGap: '26%',
        barCategoryGap: '42%',
        label: { show: false },
        emphasis: {
          focus: 'series',
          itemStyle: {
            shadowBlur: 8,
            shadowColor: 'rgba(91, 143, 249, 0.35)',
          },
        },
      },
    ],
  }
}

const syncMvRestBarChart = () => {
  const rows = modelVisibilitySorted.value
  const el = mvRestChartDom.value
  if (!rows.length) {
    disposeMvRestChart()
    return
  }
  if (!el || !el.isConnected) {
    disposeMvRestChart()
    return
  }
  const domInst = echarts.getInstanceByDom(el)
  if (domInst && !domInst.isDisposed()) {
    mvRestChart = domInst
  } else {
    disposeMvRestChart()
    mvRestChart = echarts.init(el, undefined, { renderer: 'canvas' })
  }
  const chart = mvRestChart
  if (!chart || chart.isDisposed()) return
  try {
    chart.setOption(buildMvRestBarOption(rows), true)
    if (el.clientWidth > 0 && el.clientHeight > 0) chart.resize()
  } catch (_) {
    disposeMvRestChart()
  }
}

watch(modelVisibilitySorted, syncMvRestBarChart, { deep: true, flush: 'post' })

// ===== KPI 卡片（动态计算）=====
const interceptRate = ref(0)
const blindIndex = ref(0)
const blindModelCount = ref(0)
const totalModelCount = ref(0)
const negativeRate = ref(0)
const negativeRatio = ref(0)
const negativeRiskLevel = ref('健康')
const negativeCount = ref(0)
const negativeTotal = ref(0)
const authorityScoreVal = ref(0)
const kpiDenominator = ref('open_only')

// 品牌提及率 vs 行业基准线
const brandMentionRate = ref(0)
const industryMentionRate = ref(0)
const openMentionTotal = ref(0)

// 负面关联度风险等级 → 颜色
const NEGATIVE_RISK_COLOR = {
  '健康':    '#67c23a',
  '亚健康':  '#e6a23c',
  '低风险':  '#e6a23c',
  '高风险':  '#f56c6c',
  '超高风险':'#f56c6c',
}
const NEGATIVE_RISK_STATUS = {
  '健康':    'good',
  '亚健康':  'warn',
  '低风险':  'warn',
  '高风险':  'danger',
  '超高风险':'danger',
}

const kpiCards = computed(() => {
  const nb = kpiDenominator.value === 'open_only'
  const denomHint = nb ? '（分母：开放式提问）' : '（分母：全部检测）'

  // 盲区展示值：X/Y 分数（X=盲区模型数，Y=总模型数）
  const blindDisplay = totalModelCount.value > 0
    ? `${blindModelCount.value}/${totalModelCount.value}`
    : '—'
  const blindStatus = blindModelCount.value === 0
    ? 'good'
    : blindModelCount.value >= totalModelCount.value
      ? 'danger'
      : 'warn'

  // 负面关联度展示值：小数形式，附风险等级
  const negRatio = negativeRatio.value
  const negDisplay = negativeTotal.value > 0
    ? negRatio.toFixed(4)
    : '0'
  const negLevel = negativeRiskLevel.value
  const negColor = NEGATIVE_RISK_COLOR[negLevel] || '#e6a23c'
  const negStatus = NEGATIVE_RISK_STATUS[negLevel] || 'warn'

  return [
    {
      key: 'intercept',
      icon: Aim,
      iconBg: 'rgba(103, 194, 58, 0.12)',
      label: '首行心智拦截率',
      value: interceptRate.value + '%',
      sub: `品牌在 AI 回答中有效露出的比例${denomHint}`,
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
      value: blindDisplay,
      sub: `在所有开放式提问中均未提及品牌的模型数 / 总检测模型数`,
      pct: blindIndex.value,
      color: '#f56c6c',
      status: blindStatus,
      trend: null
    },
    {
      key: 'negative',
      icon: List,
      iconBg: 'rgba(230, 162, 60, 0.12)',
      label: '负面事实关联度',
      value: negDisplay,
      sub: `含品牌负面内容的回答数（${negativeCount.value}）/ 总提问数（${negativeTotal.value}）· 风险等级：${negLevel}`,
      pct: negativeRate.value,
      color: negColor,
      status: negStatus,
      trend: null
    },
    {
      key: 'decay',
      icon: DataLine,
      iconBg: 'rgba(64, 158, 255, 0.12)',
      label: '信源权威指数',
      value: authorityScoreVal.value + '%',
      sub: '引用了官网/媒体/百科等可信信源的回答占比',
      pct: authorityScoreVal.value,
      color: '#409eff',
      status: authorityScoreVal.value >= 60 ? 'good' : authorityScoreVal.value >= 30 ? 'warn' : 'danger',
      trend: null
    }
  ]
})

// ===== 可见度矩阵（由 API 填充）=====
const platforms = ref([
  { key: 'kimi',     name: 'Kimi',      icon: 'K',  color: '#06B6D4', simulated: true },
  { key: 'doubao',   name: '豆包',      icon: '豆', color: '#EA580C', simulated: true },
  { key: 'yuanbao',  name: '腾讯元宝',   icon: '元', color: '#0EA5E9', simulated: true },
  { key: 'tongyi',   name: '通义千问',   icon: '通', color: '#8B5CF6', simulated: true },
  { key: 'yiyan',    name: '文心一言',   icon: '文', color: '#EF4444', simulated: true },
  { key: 'deepseek', name: 'DeepSeek',  icon: 'D',  color: '#4F46E5', simulated: false },
  // { key: 'zhipu',    name: '智谱清言',   icon: '智', color: '#10B981', simulated: true },
  // { key: 'spark',    name: '讯飞星火',   icon: '讯', color: '#F59E0B', simulated: true },
])

/**
 * 默认 5 行（在无数据时占位；有数据时由后端覆盖）
 * key 对齐 sys_dict.keyword_type 的 data_key
 */
const intentPaths = ref([
  { key: '01', label: '核心词', type: '品牌词',   category: 'brand' },
  { key: '03', label: '场景词', type: '需求/场景', category: 'open' },
  { key: '02', label: '对比词', type: '竞品对比',  category: 'compare' },
  { key: '04', label: '功能词', type: '产品功能',  category: 'open' },
  { key: '05', label: '价格词', type: '决策/价格', category: 'open' },
])

const matrixData = ref({})

/** 从 cell 提取 state 字符串（后端新格式是 {state,label,total,avgScore}，兼容旧字符串） */
const getCellState = (path, plat) => {
  const raw = matrixData.value[path.key]?.[plat.key]
  if (!raw) return 'no_data'
  return typeof raw === 'string' ? raw : (raw.state || 'no_data')
}

const getCellClass = (path, plat) => {
  return `cell-${getCellState(path, plat)}`
}

/**
 * 矩阵单元状态标签
 * 开放式：industry_first / head_tier / weak_awareness / mind_missing
 * 品牌词：precise_hit / info_bias / mentioned_tail
 * 对比词：brand_win / tie / competitor_win
 * 风险强制：negative_risk / hijack_risk
 * no_data：无数据
 */
const MATRIX_CELL_LABEL = {
  industry_first: '行业首位',
  head_tier:      '头部梯队',
  weak_awareness: '认知偏少',
  mind_missing:   '心智缺失',
  precise_hit:    '精准命中',
  info_bias:      '信息偏差',
  mentioned_tail: '未提及',
  brand_win:      '品牌占优',
  tie:            '势均力敌',
  competitor_win: '竞品占优',
  negative_risk:  '负面风险',
  hijack_risk:    '竞品挟持',
  no_data:        '—',
  // 向后兼容旧值
  rank_tail:      '排名末尾',
  none:           '未提及',
  precise:        '精准命中',
  second:         '次位呈现',
  not_priority:   '未优先推',
  mid_tier:       '中游位置',
}

const MATRIX_CELL_TOOLTIP = {
  industry_first: '行业首位：开放式提问中，AI 回答将品牌列为首位推荐',
  head_tier:      '头部梯队：品牌被推荐但非首位',
  weak_awareness: '认知偏少：品牌偶尔被提及，整体曝光不足',
  mind_missing:   '心智缺失：本意图下 AI 回答完全未提到品牌',
  precise_hit:    '精准命中：搜品牌词时 AI 回答准确、聚焦本品牌',
  info_bias:      '信息偏差：提及品牌但存在幻觉 / 事实错误 / 信息陈旧',
  mentioned_tail: '未提及：品牌词问题下 AI 回答未围绕本品牌',
  brand_win:      '品牌占优：对比中 AI 更倾向推荐本品牌',
  tie:            '势均力敌：对比分析客观中立，未明确倾向',
  competitor_win: '竞品占优：对比中 AI 更倾向推荐竞品',
  negative_risk:  '负面风险：回答中出现品牌负面信息，需立即优化语料',
  hijack_risk:    '竞品挟持：AI 主动引导至竞品 / 竞品占比更高',
  no_data:        '该单元暂无数据',
  rank_tail:      '排名末尾/负面：品牌位置靠后，或出现负面描述',
  none:           '未提及：本题 AI 回答中完全未出现品牌名',
  precise:        '精准命中：用户搜该品牌时，AI 首位直接推荐',
  second:         '次位呈现：品牌出现在回答第二推荐位',
  not_priority:   '未优先推：品牌未被优先推荐，位置靠后但仍可见',
  mid_tier:       '中游提及：品牌被提及，但不在推荐重点位置',
}

const getCellText = (path, plat) => {
  const state = getCellState(path, plat)
  return MATRIX_CELL_LABEL[state] || '—'
}

const getCellTooltip = (path, plat) => {
  const state = getCellState(path, plat)
  const base = MATRIX_CELL_TOOLTIP[state] || ''
  const raw = matrixData.value[path.key]?.[plat.key]
  if (raw && typeof raw === 'object' && raw.total) {
    return `${base}\n样本：${raw.total} 题，均分：${raw.avgScore}`
  }
  return base
}

/** 强露出格子数（绿色 + 蓝色） */
const STRONG_STATES = new Set([
  'industry_first', 'head_tier', 'precise_hit', 'brand_win',
  'precise', 'second',
])
/** 盲区格子数（未提及 / 心智缺失类） */
const BLIND_STATES = new Set(['mind_missing', 'mentioned_tail', 'no_data', 'none'])
/** 竞品占优 / 风险格子数 */
const WEAK_STATES = new Set([
  'competitor_win', 'negative_risk', 'hijack_risk',
  'rank_tail', 'not_priority',
])

const interceptCount = computed(() => {
  let count = 0
  const md = matrixData.value
  for (const pathKey of Object.keys(md)) {
    for (const platKey of Object.keys(md[pathKey] || {})) {
      const state = (typeof md[pathKey][platKey] === 'string')
        ? md[pathKey][platKey]
        : md[pathKey][platKey]?.state
      if (STRONG_STATES.has(state)) count++
    }
  }
  return count
})

const blindCount = computed(() => {
  let count = 0
  const md = matrixData.value
  for (const pathKey of Object.keys(md)) {
    for (const platKey of Object.keys(md[pathKey] || {})) {
      const state = (typeof md[pathKey][platKey] === 'string')
        ? md[pathKey][platKey]
        : md[pathKey][platKey]?.state
      if (BLIND_STATES.has(state)) count++
    }
  }
  return count
})

const competitorAdvantage = computed(() => {
  let count = 0
  const md = matrixData.value
  for (const pathKey of Object.keys(md)) {
    for (const platKey of Object.keys(md[pathKey] || {})) {
      const state = (typeof md[pathKey][platKey] === 'string')
        ? md[pathKey][platKey]
        : md[pathKey][platKey]?.state
      if (WEAK_STATES.has(state)) count++
    }
  }
  return count
})

// ===== 竞品帕累托图 =====
const QUESTION_TYPE_LABEL = {
  '01': '核心词', '02': '对比词', '03': '场景词', '04': '功能词', '05': '价格词',
}

const MODEL_NAME_LABEL = {
  'deepseek-chat':     'DeepSeek',
  'deepseek-reasoner': 'DeepSeek R1',
  'qwen-max':          '通义千问',
  'qwen-plus':         '通义千问+',
  'moonshot-v1-8k':    'Kimi',
  'moonshot-v1-32k':   'Kimi 32k',
  'glm-4':             '智谱GLM',
  'glm-4-flash':       'GLM Flash',
  'gpt-4o-mini':       'GPT-4o mini',
  'gpt-4o':            'GPT-4o',
}

const competitorParetoChartDom = ref(null)
let competitorParetoChart = null
const selectedCompetitor = ref(null)

const disposeCompetitorParetoChart = () => {
  if (competitorParetoChart) {
    try { if (!competitorParetoChart.isDisposed()) competitorParetoChart.dispose() } catch (_) {}
    competitorParetoChart = null
  }
}

const buildCompetitorParetoOption = (mentions) => {
  if (!mentions.length) return {}
  const names = mentions.map(r => r.name)
  const counts = mentions.map(r => r.count)
  const total = counts.reduce((s, c) => s + c, 0) || 1

  let cumSum = 0
  const cumPcts = counts.map(c => {
    cumSum += c
    return Math.round((cumSum / total) * 1000) / 10  // 保留1位小数
  })

  // 找到 80% 分界索引（哪个竞品后累计超过 80%）
  const paretoIdx = cumPcts.findIndex(p => p >= 80)

  const barColors = counts.map((_, i) =>
    paretoIdx < 0 || i <= paretoIdx ? '#ff7a00' : '#ffc18a'
  )

  const longLabel = names.some(n => String(n).length > 4)
  const useZoom = names.length > 10

  return {
    backgroundColor: '#ffffff',
    grid: {
      left: 56, right: 64,
      top: 32, bottom: useZoom ? 72 : 56,
      containLabel: false,
    },
    ...(useZoom ? {
      dataZoom: [{
        type: 'slider', show: true, xAxisIndex: 0,
        height: 18, bottom: 6,
        borderColor: 'transparent',
        fillerColor: 'rgba(255, 122, 0, 0.12)',
        handleStyle: { color: '#ff7a00' },
        textStyle: { color: '#909399', fontSize: 10 },
      }],
    } : {}),
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', crossStyle: { color: '#ddd' } },
      confine: true,
      backgroundColor: 'rgba(255,255,255,0.98)',
      borderColor: '#e4e7ed',
      borderWidth: 1,
      padding: [10, 14],
      extraCssText: 'box-shadow: 0 4px 14px rgba(0,0,0,0.1);',
      textStyle: { color: '#303133', fontSize: 12 },
      formatter(params) {
        const bar = params.find(p => p.seriesIndex === 0)
        const line = params.find(p => p.seriesIndex === 1)
        if (!bar) return ''
        const idx = bar.dataIndex
        const m = mentions[idx]
        let html = `<div style="font-weight:700;margin-bottom:6px">${m.name}</div>`
        html += `<div>提及次数：<b>${m.count}</b></div>`
        if (line) html += `<div>累计占比：<b>${line.value}%</b></div>`
        html += `<div style="color:#909399;font-size:11px;margin-top:4px">点击查看详情 →</div>`
        return html
      }
    },
    xAxis: {
      type: 'category',
      data: names,
      axisLine: { lineStyle: { color: '#DCDFE6' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#606266',
        fontSize: 11,
        rotate: longLabel ? 28 : 0,
        interval: 0,
      },
      splitLine: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        name: '提及次数',
        nameTextStyle: { color: '#909399', fontSize: 11 },
        position: 'left',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#EBEEF5' } },
        axisLabel: { color: '#909399', fontSize: 11 },
      },
      {
        type: 'value',
        name: '累计占比',
        nameTextStyle: { color: '#4F46E5', fontSize: 11 },
        position: 'right',
        min: 0,
        max: 100,
        interval: 20,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: '#4F46E5', fontSize: 11, formatter: '{value}%' },
      },
    ],
    series: [
      {
        name: '提及次数',
        type: 'bar',
        yAxisIndex: 0,
        data: counts.map((c, i) => ({
          value: c,
          itemStyle: { color: barColors[i], borderRadius: [3, 3, 0, 0] },
        })),
        barMaxWidth: 36,
        barCategoryGap: '38%',
        label: {
          show: counts.length <= 12,
          position: 'top',
          fontSize: 10,
          color: '#606266',
          formatter: '{c}',
        },
        emphasis: { focus: 'self', itemStyle: { shadowBlur: 8, shadowColor: 'rgba(255,122,0,0.3)' } },
      },
      {
        name: '累计占比',
        type: 'line',
        yAxisIndex: 1,
        data: cumPcts,
        smooth: false,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#4F46E5', width: 2 },
        itemStyle: { color: '#4F46E5', borderWidth: 2, borderColor: '#fff' },
        emphasis: { itemStyle: { symbolSize: 9 } },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{ yAxis: 80 }],
          lineStyle: { color: '#f56c6c', type: 'dashed', width: 1.5 },
          label: {
            formatter: '80%',
            position: 'insideEndBottom',
            color: '#f56c6c',
            fontSize: 11,
            fontWeight: 600,
          },
        },
      },
    ],
  }
}

const syncCompetitorParetoChart = () => {
  const mentions = competitorMentions.value
  const el = competitorParetoChartDom.value
  if (!mentions.length) {
    disposeCompetitorParetoChart()
    return
  }
  if (!el || !el.isConnected) {
    disposeCompetitorParetoChart()
    return
  }
  const domInst = echarts.getInstanceByDom(el)
  if (domInst && !domInst.isDisposed()) {
    competitorParetoChart = domInst
  } else {
    disposeCompetitorParetoChart()
    competitorParetoChart = echarts.init(el, undefined, { renderer: 'canvas' })
    // 绑定点击事件
    competitorParetoChart.on('click', (params) => {
      if (params.componentType === 'series' && params.seriesIndex === 0) {
        selectedCompetitor.value = competitorMentions.value[params.dataIndex] || null
      }
    })
  }
  const chart = competitorParetoChart
  if (!chart || chart.isDisposed()) return
  try {
    chart.setOption(buildCompetitorParetoOption(mentions), true)
    if (el.clientWidth > 0 && el.clientHeight > 0) chart.resize()
  } catch (_) {
    disposeCompetitorParetoChart()
  }
}

// ===== 竞品 / 词云 / 诊断（API）=====
const competitorMentions = ref([])

watch(competitorMentions, () => {
  selectedCompetitor.value = null
  nextTick(syncCompetitorParetoChart)
}, { deep: true, flush: 'post' })
const lossTriggerTags = ref([])
const sentimentWordCloud = ref([])
const diagnosticSuggestions = ref([])

const suggestionOverrides = ref({})
const suggestionEditingKey = ref(null)
const suggestionEditDraft = ref('')
const suggestionEditInputRef = ref(null)

const suggestionKey = (itemId, li) => `${itemId}::${li}`

const suggestionDisplayText = (item, li) => {
  const k = suggestionKey(item.id, li)
  if (Object.prototype.hasOwnProperty.call(suggestionOverrides.value, k)) {
    return suggestionOverrides.value[k]
  }
  const raw = item.suggestions?.[li]
  return raw != null ? String(raw) : ''
}

const startSuggestionEdit = async (item, li) => {
  suggestionEditingKey.value = suggestionKey(item.id, li)
  suggestionEditDraft.value = suggestionDisplayText(item, li)
  await nextTick()
  const el = suggestionEditInputRef.value
  if (el && typeof el.focus === 'function') el.focus()
  if (el && typeof el.select === 'function') el.select()
}

const commitSuggestionEdit = () => {
  const key = suggestionEditingKey.value
  if (key) {
    suggestionOverrides.value = {
      ...suggestionOverrides.value,
      [key]: suggestionEditDraft.value,
    }
  }
  suggestionEditingKey.value = null
}

const cancelSuggestionEdit = () => {
  suggestionEditingKey.value = null
}

/** ECharts 词云：与 DOM/卸载时序解耦，避免 dispose 后仍 resize */
const sentimentCloudDom = ref(null)
let sentimentWordCloudChart = null
let sentimentWordCloudResizeObserver = null
let sentimentWcObservedEl = null
let sentimentWcScopeActive = true

/** 参考稿式：绿/红/灰分层 + 大字加粗；全横向 */
const wordCloudStyleForPolarity = (pol, strength) => {
  const s = Math.min(1, Math.max(0, Number(strength) || 0))
  if (pol === 'positive') {
    if (s >= 0.72) return { color: '#05ec9e', fontWeight: 700 }
    if (s >= 0.38) return { color: '#04e185', fontWeight: 600 }
    return { color: '#07aa7c', fontWeight: 500 }
  }
  if (pol === 'negative') {
    if (s >= 0.5) return { color: '#FF4D4F', fontWeight: 700 }
    return { color: '#ff8787', fontWeight: 500 }
  }
  if (s >= 0.42) return { color: '#595959', fontWeight: 600 }
  return { color: '#BFBFBF', fontWeight: 400 }
}

const buildSentimentWordCloudOption = (list) => {
  const data = list.map((w) => {
    const pol =
      w.polarity === 'positive' ? 'positive' : w.polarity === 'negative' ? 'negative' : 'neutral'
    const strength = Number(w.weight) || 0
    const style = wordCloudStyleForPolarity(pol, strength)
    return {
      name: w.text,
      value: Math.max(1, Math.round(strength * 100)),
      textStyle: {
        color: style.color,
        fontWeight: style.fontWeight,
      },
    }
  })
  return {
    animationDurationUpdate: 480,
    tooltip: {
      confine: true,
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e4e7ed',
      borderWidth: 1,
      textStyle: { color: '#303133', fontSize: 12 },
      formatter(p) {
        const row = list.find((x) => x.text === p.name)
        const polLabel =
          row?.polarity === 'positive'
            ? '正面优势'
            : row?.polarity === 'negative'
              ? '负面/警示'
              : '中性描述'
        return `${p.name}\n${polLabel}\n相对权重 ${p.value}`
      },
    },
    series: [
      {
        type: 'wordCloud',
        shape: 'card',
        gridSize: 10,
        sizeRange: [23, 72],
        rotationRange: [0, 0],
        left: 'center',
        top: 'center',
        width: '94%',
        height: '90%',
        drawOutOfBound: false,
        layoutAnimation: true,
        textStyle: {
          fontFamily: '"Microsoft YaHei", "PingFang SC", system-ui, -apple-system, sans-serif',
        },
        emphasis: {
          textStyle: {
            textShadowBlur: 6,
            textShadowColor: 'rgba(0,0,0,0.1)',
          },
        },
        data,
      },
    ],
  }
}

const disposeSentimentWordCloudChart = () => {
  sentimentWcObservedEl = null
  if (sentimentWordCloudResizeObserver) {
    sentimentWordCloudResizeObserver.disconnect()
    sentimentWordCloudResizeObserver = null
  }
  if (sentimentWordCloudChart) {
    if (!sentimentWordCloudChart.isDisposed()) {
      try {
        sentimentWordCloudChart.dispose()
      } catch (_) {
        /* ignore */
      }
    }
    sentimentWordCloudChart = null
  }
}

const ensureSentimentWcResizeObserver = (el) => {
  if (typeof ResizeObserver === 'undefined' || !el || !sentimentWordCloudChart) return
  if (sentimentWordCloudResizeObserver && sentimentWcObservedEl === el) return
  if (sentimentWordCloudResizeObserver) {
    sentimentWordCloudResizeObserver.disconnect()
    sentimentWordCloudResizeObserver = null
  }
  sentimentWcObservedEl = el
  sentimentWordCloudResizeObserver = new ResizeObserver(() => {
    const c = sentimentWordCloudChart
    if (!sentimentWcScopeActive || !c || c.isDisposed()) return
    try {
      c.resize()
    } catch (_) {
      /* ignore */
    }
  })
  sentimentWordCloudResizeObserver.observe(el)
}

const syncSentimentWordCloudChart = () => {
  if (!sentimentWcScopeActive) return
  const list = sentimentWordCloud.value
  if (!list.length) {
    disposeSentimentWordCloudChart()
    return
  }
  const el = sentimentCloudDom.value
  if (!el || !el.isConnected) return

  const domInst = echarts.getInstanceByDom(el)
  if (domInst && !domInst.isDisposed()) {
    sentimentWordCloudChart = domInst
  } else {
    disposeSentimentWordCloudChart()
    sentimentWordCloudChart = echarts.init(el, undefined, { renderer: 'canvas' })
  }

  ensureSentimentWcResizeObserver(el)

  const chart = sentimentWordCloudChart
  if (!chart || chart.isDisposed() || !sentimentWcScopeActive) return
  try {
    chart.setOption(buildSentimentWordCloudOption(list), true)
    if (el.clientWidth > 0 && el.clientHeight > 0) chart.resize()
  } catch (_) {
    disposeSentimentWordCloudChart()
  }
}

const onWindowResizeForSentimentCloud = () => {
  const c = sentimentWordCloudChart
  if (!sentimentWcScopeActive || !c || c.isDisposed()) return
  try {
    c.resize()
  } catch (_) {
    /* ignore */
  }
  if (mvRestChart && !mvRestChart.isDisposed()) {
    try { mvRestChart.resize() } catch (_) {}
  }
  if (competitorParetoChart && !competitorParetoChart.isDisposed()) {
    try { competitorParetoChart.resize() } catch (_) {}
  }
}

watch(sentimentWordCloud, syncSentimentWordCloudChart, { deep: true, flush: 'post' })

const sentimentTag = computed(() => {
  const list = sentimentWordCloud.value
  if (!list.length) return { type: 'warn', text: '待观测' }
  let pos = 0
  let neg = 0
  for (const w of list) {
    if (w.polarity === 'positive') pos++
    else if (w.polarity === 'negative') neg++
  }
  const n = list.length
  if (pos / n >= 0.38) return { type: 'good', text: '正向词占优' }
  if (neg / n >= 0.28) return { type: 'bad', text: '风险词偏多' }
  return { type: 'warn', text: '中性为主' }
})

const sentimentSummary = computed(() => {
  const list = sentimentWordCloud.value
  if (!list.length) return '完成更多检测后，将基于摘要词频与极性生成解读。'
  const pos = list.filter((w) => w.polarity === 'positive').length
  const neg = list.filter((w) => w.polarity === 'negative').length
  const neu = list.length - pos - neg
  return `词云基于检测摘要：正面词约 ${pos} 个、中性 ${neu} 个、负面/警示 ${neg} 个；建议结合「智能诊断」优先处理负面触发场景。`
})

/** 与右侧「(pct%)」一致：占全部竞品提及次数合计的比例 */
const competitorBarWidth = (row) => {
  const p = Number(row?.pct)
  if (!Number.isFinite(p)) return 0
  return Math.min(100, Math.max(0, Math.round(p)))
}

const competitorBarFillClass = (row) => {
  if (row?.barTone === 'muted') return 'bar-fill--muted'
  return 'bar-fill--primary'
}

/** 与后端一致：>50 红，30–50 橙，小于 30 灰 */
const levelFromTriggerCount = (c) => {
  const n = Number(c) || 0
  if (n > 50) return 'high'
  if (n >= 30) return 'orange'
  return 'neutral'
}

const inferTriggerLevel = (text) => {
  const u = String(text || '')
  if (/平替|便宜|缺陷|差评|丑闻|欺骗|失败|有没有|排队|暂缺|差劲|负面|警示|漏洞/.test(u)) return 'high'
  if (/免费|对比|能力|限|窗口|可用|代码|多模态|上下文|更新|体验|接口|开源|数学|频率/.test(u)) return 'orange'
  return 'neutral'
}

const normalizeTagLevel = (raw) => {
  if (raw == null) return 'neutral'
  if (typeof raw === 'string') return inferTriggerLevel(raw)
  let level = raw.level ?? raw.Level
  if (level === 'mid' || level === 'warn') level = 'orange'
  if (level === 'high' || level === 'orange' || level === 'neutral') return level
  const text = raw.text != null ? String(raw.text) : ''
  return inferTriggerLevel(text)
}

const normalizedLossTriggerTags = computed(() => {
  const list = lossTriggerTags.value
  if (!Array.isArray(list)) return []
  return list.map((item) => {
    if (typeof item === 'string') {
      return { text: item, count: null, level: inferTriggerLevel(item) }
    }
    const text = item.text != null ? String(item.text) : ''
    const countRaw = item.count != null ? item.count : item.hitCount
    const count = countRaw != null && countRaw !== '' ? Number(countRaw) : null
    if (count != null && Number.isFinite(count)) {
      return { text, count, level: levelFromTriggerCount(count) }
    }
    return { text, count: null, level: normalizeTagLevel(item) }
  })
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
  // 盲区：有盲区模型 / 负面：按小数阈值
  const hasBlind = blindModelCount.value > 0
  const highNeg = negativeRatio.value >= 0.2
  const midNeg  = negativeRatio.value >= 0.1
  if (hasBlind && blindModelCount.value >= totalModelCount.value || highNeg) return 'risk-high'
  if (hasBlind || midNeg) return 'risk-mid'
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
    text: blindModelCount.value > 0
      ? `存在盲区模型（${blindModelCount.value}/${totalModelCount.value} 个模型开放式提问不可见）`
      : '无盲区模型（各模型均在开放式提问中提及品牌）',
    level: blindModelCount.value === 0 ? 'low' : blindModelCount.value >= totalModelCount.value ? 'high' : 'mid',
    impact: blindModelCount.value > 0 ? `-${Math.round((blindModelCount.value / Math.max(totalModelCount.value, 1)) * 30)}% 触达` : '无损耗'
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

    if (Array.isArray(data.modelVisibilityCards) && data.modelVisibilityCards.length) {
      modelVisibilityCards.value = data.modelVisibilityCards
    } else if (Array.isArray(data.platforms) && data.platforms.length) {
      modelVisibilityCards.value = data.platforms.map((p) => ({
        platformKey: p.key,
        name: p.name,
        icon: p.icon,
        brandColor: p.color,
        simulated: !!p.simulated,
        score: 0,
        status: 'high',
        statusText: '高风险',
        bullets: [
          { tone: 'neutral', text: '暂无该平台检测样本' },
          { tone: 'neutral', text: '完成可见度检测后展示得分与要点' },
        ],
      }))
    } else {
      modelVisibilityCards.value = []
    }

    // 填充 KPI
    kpiDenominator.value = data.kpiDenominator === 'all_fallback' ? 'all_fallback' : 'open_only'
    interceptRate.value = data.interceptRate || 0
    // 盲区指数（分数形式）
    blindModelCount.value = data.blindModelCount ?? 0
    totalModelCount.value = data.totalModelCount ?? 0
    blindIndex.value = data.blindIndex || 0
    // 负面关联度（小数形式 + 风险等级）
    negativeRatio.value = data.negativeRatio ?? 0
    negativeRate.value = data.negativeRate || 0
    negativeRiskLevel.value = data.negativeRiskLevel || '健康'
    negativeCount.value = data.negativeCount ?? 0
    negativeTotal.value = data.negativeTotal ?? 0
    authorityScoreVal.value = data.authorityScore || 0

    // 品牌提及率 vs 行业基准线
    brandMentionRate.value    = data.brandMentionRate    ?? 0
    industryMentionRate.value = data.industryMentionRate ?? 0
    openMentionTotal.value    = data.openMentionTotal    ?? 0

    // 填充矩阵
    if (data.matrixData) matrixData.value = data.matrixData
    if (data.intentPaths) intentPaths.value = data.intentPaths
    if (data.platforms) platforms.value = data.platforms

    competitorMentions.value = Array.isArray(data.competitorMentions) ? data.competitorMentions : []
    lossTriggerTags.value = Array.isArray(data.lossTriggerTags) ? data.lossTriggerTags : []
    sentimentWordCloud.value = Array.isArray(data.sentimentWordCloud) ? data.sentimentWordCloud : []
    suggestionOverrides.value = {}
    suggestionEditingKey.value = null
    diagnosticSuggestions.value = Array.isArray(data.diagnosticSuggestions) ? data.diagnosticSuggestions : []

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
    applyEnterpriseContextToReport()
  }
}

// ===== 操作方法 =====
const generating = ref(false)
const generatingText = ref('生成中...')

/**
 * 任务持久化：把 taskId 写到 localStorage，页面切出再切回/刷新都能恢复轮询。
 * 切换用户时应清空（这里简单用固定 key，如果后面多账号可按 userId 拼 key）。
 */
const ACTIVE_TASK_KEY = 'geo_health_active_task_id'
const activeTaskId = ref(null)
// 组件销毁时用来中断轮询循环，避免 off-screen 后继续无谓请求
let pollAbort = { cancelled: false }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 轮询指定 taskId 的进度，直到完成/失败或被中断。
 * 内部统一更新 generating / generatingText / activeTaskId 等状态。
 */
const pollTaskProgress = async (taskId) => {
  generating.value = true
  activeTaskId.value = taskId
  localStorage.setItem(ACTIVE_TASK_KEY, String(taskId))
  pollAbort = { cancelled: false }
  const abortRef = pollAbort

  let lastStatus = ''
  let lastProgress = null
  let firstCheck = true

  try {
    for (let i = 0; i < 600; i++) {
      if (abortRef.cancelled) return { aborted: true }
      // 第一次不等，后续 2s 轮询
      if (!firstCheck) await sleep(2000)
      firstCheck = false

      let progress = null
      try {
        const pr = await fetch(
          `${API_BASE_URL}/api/geo-brand/tasks/${taskId}/progress`,
          { headers: { 'x-user-id': 'default_user' } }
        )
        progress = await pr.json().catch(() => null)
      } catch (e) {
        console.warn('[geo-brand] progress 请求异常，继续轮询:', e)
        continue
      }
      if (!progress?.success) continue

      const done = (progress.successCount || 0) + (progress.failedCount || 0)
      const t = progress.totalQuestions || 1
      lastStatus = progress.status || lastStatus
      lastProgress = progress

      if (progress.status === 'analyzing') {
        const aDone = progress.analysisDone || 0
        const aTotal = progress.analysisTotal || t
        generatingText.value = `分析中 ${aDone}/${aTotal}`
      } else if (progress.status === 'completed') {
        generatingText.value = `已完成`
      } else if (progress.status === 'failed') {
        generatingText.value = `已失败`
      } else {
        generatingText.value = `探针中 ${done}/${t}`
      }

      if (
        progress.status === 'completed' ||
        progress.status === 'failed' ||
        (progress.pendingCount === 0 && done >= t && progress.status !== 'analyzing')
      ) {
        break
      }
    }

    if (lastStatus === 'failed') {
      const taskErr = lastProgress?.errorText
      if (taskErr) {
        ElMessage.warning({ message: taskErr, duration: 6000, showClose: true })
      } else {
        ElMessage.warning(`任务 #${taskId} 部分失败，请查看 geo_health_answer.error_text`)
      }
    } else {
      ElMessage.success(`任务 #${taskId} 已完成`)
    }

    generatingText.value = '刷新报告...'
    await loadHealthReport()
    return { aborted: false, status: lastStatus }
  } finally {
    if (!abortRef.cancelled) {
      generating.value = false
      activeTaskId.value = null
      localStorage.removeItem(ACTIVE_TASK_KEY)
    }
  }
}

/**
 * 生成体检报告：
 * 1) POST /api/geo-brand/tasks 创建任务（后端自动从 questions 按 sys_dict.keyword_type 每类抽样，50 题）
 * 2) pollTaskProgress 轮询，直到 completed / failed
 * 3) 完成后 loadHealthReport() 重新加载
 */
const generateHealthReport = async () => {
  if (generating.value) {
    ElMessage.info('已有任务正在执行，请等待当前任务完成')
    return
  }
  generating.value = true
  generatingText.value = '抽取问题中...'
  try {
    const createRes = await fetch(`${API_BASE_URL}/api/geo-brand/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'default_user' },
      body: JSON.stringify({}),
    })
    const createData = await createRes.json().catch(() => ({}))

    // 后端互斥返回 409 + TASK_ALREADY_RUNNING：直接接管已有任务继续轮询
    if (createRes.status === 409 && createData?.code === 'TASK_ALREADY_RUNNING' && createData.taskId) {
      ElMessage.info(`已有任务正在执行（#${createData.taskId}），接管进度跟踪`)
      await pollTaskProgress(createData.taskId)
      return
    }

    if (!createRes.ok || !createData?.success) {
      throw new Error(createData?.error || `创建任务失败（HTTP ${createRes.status}）`)
    }
    const taskId = createData.taskId
    const total = createData.totalQuestions || 0
    ElMessage.success(`任务已创建（#${taskId}），共 ${total} 题，后台探针中...`)
    generatingText.value = `探针中 0/${total || '?'}`

    await pollTaskProgress(taskId)
  } catch (err) {
    console.error('生成体检报告失败:', err)
    ElMessage.error('生成失败：' + (err.message || err))
    generating.value = false
    activeTaskId.value = null
    localStorage.removeItem(ACTIVE_TASK_KEY)
  }
}

/**
 * 页面进入时尝试恢复：
 * - localStorage 有未完成的 taskId → 校验其 progress，若还在跑就继续轮询
 * - 若任务已结束/不存在 → 清理本地状态
 */
const resumeActiveTaskIfAny = async () => {
  const cached = localStorage.getItem(ACTIVE_TASK_KEY)
  if (!cached) return
  const taskId = Number(cached)
  if (!taskId) {
    localStorage.removeItem(ACTIVE_TASK_KEY)
    return
  }
  try {
    const pr = await fetch(
      `${API_BASE_URL}/api/geo-brand/tasks/${taskId}/progress`,
      { headers: { 'x-user-id': 'default_user' } }
    )
    const progress = await pr.json().catch(() => null)
    if (!progress?.success) {
      localStorage.removeItem(ACTIVE_TASK_KEY)
      return
    }
    const status = progress.status
    if (status === 'completed' || status === 'failed') {
      localStorage.removeItem(ACTIVE_TASK_KEY)
      return
    }
    ElMessage.info(`检测到正在进行的任务 #${taskId}，已恢复进度跟踪`)
    await pollTaskProgress(taskId)
  } catch (e) {
    console.warn('[geo-brand] 恢复任务状态失败:', e)
    localStorage.removeItem(ACTIVE_TASK_KEY)
  }
}

const refreshReport = generateHealthReport

const goBack = () => router.back()
const goToGEODetection = () => router.push('/geo-detection')

const exportReport = () => {
  ElMessage.success('报告导出功能开发中')
}

const shareReport = () => {
  ElMessage.success('分享链接已复制到剪贴板')
}

onMounted(async () => {
  window.addEventListener('resize', onWindowResizeForSentimentCloud)
  await loadEnterpriseSettings()
  await loadHealthReport()
  // 切回来时恢复未完成的任务轮询
  resumeActiveTaskIfAny()
})

onUnmounted(() => {
  sentimentWcScopeActive = false
  window.removeEventListener('resize', onWindowResizeForSentimentCloud)
  disposeSentimentWordCloudChart()
  disposeMvRestChart()
  disposeCompetitorParetoChart()
  if (pollAbort) pollAbort.cancelled = true
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

.nav-module-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.3;
}

.nav-enterprise-hint {
  font-size: 12px;
  color: #c0c4cc;
  font-weight: 400;
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
  color: #c0c4cc;
  margin: 0;
}

.section-tag {
  font-size: 11px;
  font-weight: 600;
  color: #c0c4cc;
  letter-spacing: 1px;
}

/* ===== 区块1：大模型可见度综合得分 ===== */
.section-model-visibility {
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.92);
}

.mv-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 0 4px 0 2px;
}

.mv-title {
  margin: 0 0 4px 0;
  font-size: 17px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.95);
  letter-spacing: 0.02em;
}

.mv-en-tag {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.38);
  letter-spacing: 1px;
}

.mv-brand-line {
  margin-top: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

.mv-brand-sub {
  color: rgba(255, 255, 255, 0.35);
}

.mv-scroll-hint {
  flex-shrink: 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.38);
  padding-top: 4px;
  white-space: nowrap;
}

.mv-scroll {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding: 4px 2px 10px;
  scroll-snap-type: x mandatory;
  scroll-behavior: auto;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.2) transparent;
  cursor: grab;
}

/* 拖拽时关闭 snap 与卡片 hit-test：与拖动滚动条一致的一比一跟手，松手后再由浏览器对齐 snap */
.mv-scroll.mv-scroll--grabbing {
  scroll-snap-type: none;
  scroll-behavior: auto;
  cursor: grabbing;
  user-select: none;
}

.mv-scroll.mv-scroll--grabbing .mv-card {
  pointer-events: none;
}

.mv-scroll::-webkit-scrollbar {
  height: 6px;
}

.mv-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 4px;
}

.mv-card {
  flex: 0 0 min(340px, 88vw);
  scroll-snap-align: start;
  min-width: 280px;
}

.mv-card-inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 18px 18px 20px;
  border-radius: 16px;
  background: linear-gradient(165deg, rgba(40, 46, 68, 0.95) 0%, rgba(28, 32, 48, 0.98) 100%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.mv-card-left {
  flex: 1;
  min-width: 0;
}

.mv-plat-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.mv-plat-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}

.mv-plat-titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.mv-plat-name {
  font-size: 17px;
  font-weight: 800;
  color: #fff;
  line-height: 1.2;
}

.mv-plat-badge {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 200, 120, 0.95);
  letter-spacing: 0.04em;
}

.mv-bullets {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mv-bullet {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.72);
}

.mv-bullet-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-top: 5px;
  background: rgba(255, 255, 255, 0.35);
}

.mv-bullet--bad .mv-bullet-dot {
  background: #ff5c5c;
  box-shadow: 0 0 0 3px rgba(255, 60, 60, 0.15);
}

.mv-bullet--warn .mv-bullet-dot {
  background: #ff9f43;
}

.mv-bullet--good .mv-bullet-dot {
  background: #00c853;
}

.mv-bullet--neutral .mv-bullet-dot {
  background: rgba(255, 255, 255, 0.35);
}

.mv-card-right {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 14px;
}

.mv-score-widget {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.mv-donut-wrap {
  position: relative;
  width: 100px;
  height: 100px;
  flex-shrink: 0;
}

.mv-donut-svg {
  width: 100%;
  height: 100%;
}

.mv-donut-bg {
  stroke: rgba(255, 255, 255, 0.08);
}

.mv-donut-fill {
  fill: none;
  stroke-linecap: round;
  transition: stroke-dasharray 0.9s ease;
}

.mv-stroke-good { stroke: #00c853; }
.mv-stroke-warn { stroke: #ffb020; }
.mv-stroke-bad { stroke: #ff3b30; }

.mv-donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  pointer-events: none;
}

.mv-donut-score {
  font-size: 26px;
  font-weight: 900;
  color: #fff;
  line-height: 1;
}

.mv-donut-total {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  margin-top: 2px;
}

.mv-score-side {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.mv-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
}

.mv-pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #00c853;
}

.mv-pill--good {
  background: rgba(0, 200, 83, 0.18);
  color: #5ee4a1;
}

.mv-pill--mid {
  background: rgba(255, 176, 32, 0.15);
  color: #ffc266;
}

.mv-pill--high {
  background: rgba(255, 59, 48, 0.18);
  color: #ff8a80;
}

.mv-score-caption {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.42);
}

/* P2：白底卡片 + 标题旁图标，与下方 KPI 区块一致 */
.mv-rest-chart-block {
  margin-top: 18px;
  padding: 20px 22px 16px;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid #ebeef5;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.mv-rest-chart-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.mv-rest-chart-icon {
  color: #409eff;
  flex-shrink: 0;
}

.mv-rest-chart-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  letter-spacing: 0.02em;
  margin: 0;
  padding: 0;
}

.mv-rest-chart-echarts {
  width: 100%;
  height: min(420px, 52vh);
  min-height: 280px;
  background: #fff;
  border-radius: 8px;
}

/* ===== 区块2：KPI ===== */
.section-kpi,
.section-matrix,
.section-competitor,
.section-emotion,
.section-diagnosis,
.section-authority,
.section-funnel {
  background: white;
  border-radius: 16px;
  padding: 24px 28px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.kpi-denominator-alert {
  margin-bottom: 14px;
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

/* ===== 品牌提及率 vs 行业基准线 ===== */
.mention-rate-card {
  margin-top: 20px;
  padding: 18px 20px 16px;
  background: #f8f9fc;
  border-radius: 14px;
  border: 1px solid #ebeef5;
}

.mention-rate-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.mention-rate-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mention-rate-title {
  font-size: 14px;
  font-weight: 700;
  color: #303133;
}

.mention-rate-tag {
  font-size: 10px;
  font-weight: 600;
  color: #c0c4cc;
  letter-spacing: 0.08em;
}

.mention-rate-scope {
  font-size: 11px;
  color: #c0c4cc;
}

.mention-rate-rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
}

.mention-rate-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mention-rate-label-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 96px;
  flex-shrink: 0;
}

.mr-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.mr-dot--brand    { background: #4F46E5; }
.mr-dot--industry { background: #06B6D4; }

.mr-label {
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  white-space: nowrap;
}

.mr-hint-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #e4e7ed;
  color: #909399;
  font-size: 10px;
  font-weight: 700;
  cursor: help;
  flex-shrink: 0;
}

.mr-bar-track {
  flex: 1;
  height: 10px;
  background: #ebeef5;
  border-radius: 5px;
  overflow: hidden;
}

.mr-bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 1s ease;
}

.mr-bar--brand    { background: linear-gradient(90deg, #4F46E5, #818CF8); }
.mr-bar--industry { background: linear-gradient(90deg, #06B6D4, #67E8F9); }

.mr-value {
  font-size: 15px;
  font-weight: 800;
  min-width: 42px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.mr-value--brand    { color: #4F46E5; }
.mr-value--industry { color: #0e7490; }

.mention-rate-gap {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #ebeef5;
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
}

.gap-icon {
  font-size: 14px;
  font-weight: 800;
  flex-shrink: 0;
}

.gap-warn    { color: #f56c6c; }
.gap-good    { color: #67c23a; }
.gap-neutral { color: #909399; }

/* ===== 区块3：可见度矩阵 ===== */
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
  cursor: default;
}

.result-cell--has-tip {
  cursor: help;
}

/**
 * 矩阵单元色阶：
 *   绿色高亮：industry_first / precise_hit / brand_win
 *   蓝色安全：head_tier
 *   黄色提醒：weak_awareness / info_bias / tie
 *   灰色风险：mind_missing / mentioned_tail / competitor_win / no_data
 *   强制红 ：negative_risk / hijack_risk
 * 保留旧状态类名做兼容。
 */
.cell-industry_first,
.cell-precise_hit,
.cell-brand_win,
.cell-precise {
  background: rgba(103, 194, 58, 0.15);
  color: #67c23a;
}
.cell-head_tier,
.cell-second {
  background: rgba(64, 158, 255, 0.15);
  color: #409eff;
}
.cell-weak_awareness,
.cell-info_bias,
.cell-tie,
.cell-mid_tier,
.cell-not_priority {
  background: rgba(230, 162, 60, 0.15);
  color: #e6a23c;
}
.cell-mind_missing,
.cell-mentioned_tail,
.cell-competitor_win,
.cell-rank_tail,
.cell-none,
.cell-no_data {
  background: #f5f5f5;
  color: #c0c4cc;
}
.cell-negative_risk,
.cell-hijack_risk {
  background: rgba(245, 108, 108, 0.18);
  color: #f56c6c;
  font-weight: 700;
}

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

/* ===== 区块3b：竞品拦截帕累托图 ===== */
.competitor-section-sub {
  margin: -6px 0 16px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.competitor-card {
  margin-top: 0;
}

.competitor-pareto-chart {
  width: 100%;
  height: min(360px, 48vw);
  min-height: 260px;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #ebeef5;
}

/* 点击提示 */
.competitor-click-hint {
  margin: 14px 0 0;
  font-size: 12px;
  color: #c0c4cc;
  text-align: center;
  letter-spacing: 0.02em;
}

/* 竞品详情面板 */
.competitor-detail-panel {
  margin-top: 16px;
  border-radius: 12px;
  border: 1px solid #e8ecf5;
  background: #f8f9fc;
  overflow: hidden;
}

.competitor-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(90deg, #ff7a00 0%, #ff9a40 100%);
}

.competitor-detail-name-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.competitor-detail-name {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}

.competitor-detail-badge {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.18);
  padding: 2px 8px;
  border-radius: 20px;
  white-space: nowrap;
}

.competitor-detail-close {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.competitor-detail-close:hover {
  background: rgba(255, 255, 255, 0.35);
}

.competitor-detail-body {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.competitor-detail-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.competitor-detail-label {
  flex-shrink: 0;
  min-width: 88px;
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  padding-top: 3px;
}

.competitor-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
}

.competitor-detail-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.tag-question {
  background: rgba(79, 70, 229, 0.1);
  color: #4F46E5;
  border: 1px solid rgba(79, 70, 229, 0.2);
}

.tag-model {
  background: rgba(6, 182, 212, 0.1);
  color: #0e7490;
  border: 1px solid rgba(6, 182, 212, 0.2);
}

.comp-no-data {
  font-size: 12px;
  color: #c0c4cc;
  padding-top: 3px;
}

.competitor-detail-sentiment {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
}

.sent-pill {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.sent-win    { background: rgba(103, 194, 58, 0.12); color: #67c23a; border: 1px solid rgba(103,194,58,0.25); }
.sent-neutral{ background: rgba(144, 147, 153, 0.1);  color: #909399; border: 1px solid #e4e7ed; }
.sent-lose   { background: rgba(245, 108, 108, 0.12); color: #f56c6c; border: 1px solid rgba(245,108,108,0.25); }
.sent-neg    { background: rgba(230,   0,   0, 0.1);  color: #c0392b; border: 1px solid rgba(230,0,0,0.2); }

/* 进场动画 */
.comp-detail-fade-enter-active,
.comp-detail-fade-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.comp-detail-fade-enter-from,
.comp-detail-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.competitor-empty {
  font-size: 13px;
  color: #909399;
  padding: 12px 0 8px;
}

/* ===== 区块4：语义词云 ===== */
.sentiment-head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.sentiment-title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sentiment-legend-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 18px;
  font-size: 12px;
  color: #606266;
  padding-top: 4px;
}

.sentiment-legend-inline .leg-i {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sentiment-legend-inline .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.dot-pos { background: #00B578; }
.dot-neu { background: #595959; }
.dot-neg { background: #FF4D4F; }

.sentiment-cloud-card {
  max-width: 100%;
  margin: 16px auto 0;
  padding: 28px 32px 32px;
  background: #f4f5f7;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.sentiment-cloud-empty {
  font-size: 13px;
  color: #909399;
  text-align: center;
  padding: 40px 20px;
}

.sentiment-cloud-empty-standalone {
  max-width: 640px;
  margin: 16px auto 0;
  padding: 36px 24px;
  background: #f4f5f7;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.sentiment-cloud-echarts {
  width: 100%;
  height: min(320px, 42vw);
  min-height: 240px;
}

.sentiment-summary-below {
  margin-top: 18px;
}

.emotion-summary {
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

/* ===== 智能诊断 ===== */
.section-diagnosis {
  padding: 0;
  overflow: hidden;
}

.diagnosis-header-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 24px;
  background:  #e3edff;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.diagnosis-bolt {
  flex-shrink: 0;
}

.diagnosis-card-list {
  padding: 20px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: #e3edff;
}

.diagnosis-item {
  display: flex;
  gap: 14px;
  background: #fff;
  border-radius: 12px;
  padding: 18px 18px 18px 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.diagnosis-num {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}

.diagnosis-num.num-rose {
  background: #ec6b9a;
}

.diagnosis-num.num-orange {
  background: #f24a63;
}

.diagnosis-body {
  flex: 1;
  min-width: 0;
}

.diagnosis-title {
  font-size: 15px;
  font-weight: 700;
  color: #303133;
  line-height: 1.45;
  margin-bottom: 10px;
}

.diagnosis-p {
  margin: 0 0 12px;
  font-size: 13px;
  color: #606266;
  line-height: 1.65;
}

.diagnosis-suggest-head {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.diagnosis-ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #606266;
  line-height: 1.7;
}

.diagnosis-suggest-li {
  margin-bottom: 6px;
}

.diagnosis-suggest-li:last-child {
  margin-bottom: 0;
}

.diagnosis-suggest-text {
  cursor: text;
  border-bottom: 1px dashed transparent;
  transition: border-color 0.15s ease, background 0.15s ease;
  padding: 2px 0;
  display: inline-block;
  max-width: 100%;
  word-break: break-word;
}

.diagnosis-suggest-text:hover {
  border-bottom-color: #c0c4cc;
  background: rgba(64, 158, 255, 0.06);
  border-radius: 4px;
}

.diagnosis-suggest-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  line-height: 1.65;
  color: #606266;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  resize: vertical;
  min-height: 44px;
  background: #fff;
}

.diagnosis-suggest-input:focus {
  outline: none;
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
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
  .mv-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .mv-scroll-hint {
    white-space: normal;
  }

  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .sentiment-head-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .sentiment-legend-inline {
    width: 100%;
  }

  .sentiment-cloud-card {
    padding: 20px 18px 24px;
  }

  .authority-layout,
  .funnel-layout {
    grid-template-columns: 1fr;
  }

}
</style>

<style>
/* 矩阵词条释义（tooltip 挂载到 body，需非 scoped） */
.matrix-cell-tooltip-popper {
  max-width: 320px;
  line-height: 1.55;
  font-size: 12px;
  box-sizing: border-box;
}
</style>
