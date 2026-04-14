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

      <!-- ===== 区块1：大模型可见度综合得分（横向滑动）===== -->
      <div class="section-model-visibility">
        <div class="mv-header">
          <div class="section-title-row">
            <h2 class="section-title">大模型可见度综合得分</h2>
            <span class="section-tag">AI VISIBILITY SCORE</span>
          </div>

          <span class="mv-scroll-hint">按住鼠标拖拽或左右滑动查看更多</span>
        </div>

        <div
          ref="mvScrollRef"
          class="mv-scroll"
          role="region"
          aria-label="各模型可见度得分"
          @pointerdown="onMvScrollPointerDown"
          @pointermove="onMvScrollPointerMove"
          @pointerup="onMvScrollPointerUp"
          @pointercancel="onMvScrollPointerUp"
          @lostpointercapture="onMvScrollLostPointerCapture"
        >
          <div
            v-for="m in modelVisibilityCards"
            :key="m.platformKey"
            class="mv-card"
          >
            <div class="mv-card-inner">
              <div class="mv-card-left">
                <div class="mv-plat-head">
                  <div class="mv-plat-icon" :style="{ background: m.brandColor }">{{ m.icon }}</div>
                  <div class="mv-plat-titles">
                    <div class="mv-plat-name">{{ m.name }}</div>
                    <span v-if="m.simulated" class="mv-plat-badge">AI 推断</span>
                  </div>
                </div>
                <ul class="mv-bullets">
                  <li
                    v-for="(b, bi) in m.bullets"
                    :key="'b'+m.platformKey+bi"
                    class="mv-bullet"
                    :class="'mv-bullet--' + (b.tone || 'neutral')"
                  >
                    <span class="mv-bullet-dot" aria-hidden="true" />
                    <span class="mv-bullet-text">{{ b.text }}</span>
                  </li>
                </ul>
              </div>
              <div class="mv-card-right">
                <div class="mv-score-widget">
                  <div class="mv-donut-wrap">
                    <svg viewBox="0 0 120 120" class="mv-donut-svg">
                      <circle cx="60" cy="60" r="44" class="mv-donut-bg" fill="none" stroke-width="10" />
                      <circle
                        cx="60" cy="60"
                        r="44"
                        class="mv-donut-fill"
                        :class="modelDonutStrokeClass(m.score)"
                        fill="none"
                        stroke-width="10"
                        stroke-linecap="round"
                        :stroke-dasharray="modelDonutDash(m.score)"
                        transform="rotate(-90 60 60)"
                      />
                    </svg>
                    <div class="mv-donut-center">
                      <span class="mv-donut-score">{{ m.score }}</span>
                      <span class="mv-donut-total">/ 100</span>
                    </div>
                  </div>
                  <div class="mv-score-side">
                    <div class="mv-status-pill" :class="'mv-pill--' + m.status">
                      <span v-if="m.status === 'good'" class="mv-pill-dot" />
                      {{ m.statusText }}
                    </div>
                    <div class="mv-score-caption">可见度得分</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
          title="未区分出与主关键词不同的非品牌词检测记录，下列核心指标的分母为全部检测记录。"
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

      <!-- ===== 区块3b：竞品拦截诊断 ===== -->
      <div class="section-competitor">
        <div class="section-title-row">
          <h2 class="section-title">竞品拦截诊断</h2>
          <span class="section-tag">COMPETITOR INTERCEPTION</span>
        </div>

        <p class="competitor-section-sub">抢夺本品牌 AI 流量的竞品排名</p>

        <div class="competitor-card">
          <div v-if="competitorMentions.length" class="competitor-rank-list">
            <div v-for="(row, idx) in competitorMentions" :key="'cm'+idx" class="competitor-rank-row">
              <div class="competitor-label">{{ row.name }}</div>
              <div class="competitor-bar-line">
                <div class="competitor-bar-track">
                  <div
                    class="competitor-bar-fill"
                    :class="competitorBarFillClass(row)"
                    :style="{ width: competitorBarWidth(row) + '%' }"
                  />
                </div>
                <span class="competitor-stat">{{ row.count }}次提及 ({{ row.pct }}%)</span>
              </div>
            </div>
          </div>
          <div v-else class="competitor-empty">暂无竞品提及样本，完成更多场景检测后自动汇总。</div>

          <div class="competitor-trigger-panel">
            <div class="trigger-head">
              <span class="trigger-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#909399"/></svg>
              </span>
              <span>导致用户流失的高频触发词</span>
              <span class="trigger-tag-label">(TRIGGER)</span>
            </div>
            <div v-if="normalizedLossTriggerTags.length" class="trigger-pills">
              <span
                v-for="(t, i) in normalizedLossTriggerTags"
                :key="'tg'+i"
                class="trigger-pill"
                :data-level="t.level"
                :title="t.count != null && t.count !== '' ? `出现 ${t.count} 次` : ''"
              >{{ t.text }}</span>
            </div>
            <div v-else class="competitor-empty subtle">暂无高频触发词</div>
          </div>
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

      <!-- ===== 区块4b：智能诊断与优化建议 ===== -->
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
                <li v-for="(line, li) in item.suggestions" :key="'sg'+li">{{ line }}</li>
              </ul>
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import 'echarts-wordcloud'
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

/** 环形进度周长（r=44） */
const MV_DONUT_LEN = 2 * Math.PI * 44

const modelVisibilityCards = ref([])
const mvScrollRef = ref(null)

/** 横向列表：鼠标按住拖拽滚动（触摸仍走系统原生滑动）；拖拽时关闭 scroll-snap，避免与 scrollLeft 对抗发涩 */
const mvDrag = {
  active: false,
  pointerId: null,
  startX: 0,
  startScrollLeft: 0,
}

const finishMvScrollDrag = (e) => {
  if (!mvDrag.active) return
  if (e?.pointerId != null && e.pointerId !== mvDrag.pointerId) return
  const el = mvScrollRef.value
  const pid = mvDrag.pointerId
  mvDrag.active = false
  mvDrag.pointerId = null
  if (el) {
    el.classList.remove('mv-scroll--grabbing')
    if (pid != null) {
      try {
        el.releasePointerCapture(pid)
      } catch (_) {
        /* ignore */
      }
    }
  }
}

const onMvScrollPointerDown = (e) => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return
  const el = mvScrollRef.value
  if (!el) return
  mvDrag.active = true
  mvDrag.pointerId = e.pointerId
  mvDrag.startX = e.clientX
  mvDrag.startScrollLeft = el.scrollLeft
  el.classList.add('mv-scroll--grabbing')
  try {
    el.setPointerCapture(e.pointerId)
  } catch (_) {
    /* ignore */
  }
}

const onMvScrollPointerMove = (e) => {
  if (!mvDrag.active || e.pointerId !== mvDrag.pointerId) return
  const el = mvScrollRef.value
  if (!el) return
  const dx = e.clientX - mvDrag.startX
  el.scrollLeft = mvDrag.startScrollLeft - dx
}

const onMvScrollPointerUp = (e) => finishMvScrollDrag(e)

const onMvScrollLostPointerCapture = (e) => finishMvScrollDrag(e)

const modelDonutDash = (score) => {
  const s = Math.min(100, Math.max(0, Number(score) || 0))
  const arc = (s / 100) * MV_DONUT_LEN
  return `${arc} ${MV_DONUT_LEN}`
}

const modelDonutStrokeClass = (score) => {
  const s = Number(score) || 0
  if (s >= 70) return 'mv-stroke-good'
  if (s >= 45) return 'mv-stroke-warn'
  return 'mv-stroke-bad'
}

// ===== KPI 卡片（动态计算）=====
const interceptRate = ref(0)
const blindIndex = ref(0)
const negativeRate = ref(0)
const authorityScoreVal = ref(0)
const kpiDenominator = ref('non_brand')

const kpiCards = computed(() => {
  const nb = kpiDenominator.value === 'non_brand'
  const denomHint = nb ? '（分母：非品牌词检测）' : '（分母：全部检测）'
  return [
    {
      key: 'intercept',
      icon: Aim,
      iconBg: 'rgba(103, 194, 58, 0.12)',
      label: '首行心智拦截率',
      value: interceptRate.value + '%',
      sub: `score≥80 的检测占比，近似「首位心智」露出强度${denomHint}`,
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
      sub: `未提及或不可见（visible=false 或 score=0）占比${denomHint}`,
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
      sub: `摘要命中负面词典的检测占比${denomHint}`,
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
      sub: '由检测均分推导的代理指标（非真实信源占比）',
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

// ===== 竞品 / 词云 / 诊断（API）=====
const competitorMentions = ref([])
const lossTriggerTags = ref([])
const sentimentWordCloud = ref([])
const diagnosticSuggestions = ref([])

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
    kpiDenominator.value = data.kpiDenominator === 'all_fallback' ? 'all_fallback' : 'non_brand'
    interceptRate.value = data.interceptRate || 0
    blindIndex.value = data.blindIndex || 0
    negativeRate.value = data.negativeRate || 0
    authorityScoreVal.value = data.authorityScore || 0

    // 填充矩阵
    if (data.matrixData) matrixData.value = data.matrixData
    if (data.intentPaths) intentPaths.value = data.intentPaths
    if (data.platforms) platforms.value = data.platforms

    competitorMentions.value = Array.isArray(data.competitorMentions) ? data.competitorMentions : []
    lossTriggerTags.value = Array.isArray(data.lossTriggerTags) ? data.lossTriggerTags : []
    sentimentWordCloud.value = Array.isArray(data.sentimentWordCloud) ? data.sentimentWordCloud : []
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
  window.addEventListener('resize', onWindowResizeForSentimentCloud)
  loadHealthReport()
})

onUnmounted(() => {
  sentimentWcScopeActive = false
  mvDrag.active = false
  window.removeEventListener('resize', onWindowResizeForSentimentCloud)
  disposeSentimentWordCloudChart()
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

/* ===== 区块3b：竞品拦截（稿式配色）===== */
.competitor-section-sub {
  margin: -6px 0 16px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.competitor-card {
  margin-top: 0;
}

.competitor-rank-list {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.competitor-rank-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.competitor-label {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.competitor-bar-line {
  display: flex;
  align-items: center;
  gap: 16px;
}

.competitor-bar-track {
  flex: 1;
  height: 11px;
  background: #eceff5;
  border-radius: 6px;
  overflow: hidden;
}

.competitor-bar-fill {
  height: 100%;
  border-radius: 6px;
  transition: width 0.8s ease;
}

.competitor-bar-fill.bar-fill--primary {
  background: #ff7a00;
}

.competitor-bar-fill.bar-fill--muted {
  background: #b8c5db;
}

.competitor-stat {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.competitor-empty {
  font-size: 13px;
  color: #909399;
  padding: 12px 0 8px;
}

.competitor-empty.subtle {
  padding-top: 4px;
  font-size: 12px;
}

.competitor-trigger-panel {
  margin-top: 26px;
  padding: 16px 18px 18px;
  background: #f7f8fa;
  border-radius: 12px;
  border: 1px solid #eef0f4;
}

.trigger-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #606266;
  margin-bottom: 14px;
}

.trigger-icon {
  display: flex;
  align-items: center;
}

.trigger-tag-label {
  margin-left: auto;
  font-size: 11px;
  letter-spacing: 0.05em;
  color: #909399;
  font-weight: 600;
}

.trigger-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  align-items: center;
}

.trigger-pill {
  display: inline-block;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 400;
  border-radius: 5px;
  line-height: 1.35;
  border: 1px solid #e4e7ed;
  color: #606266;
  background: #ffffff;
}

.trigger-pill[data-level='high'] {
  border-color: #ffb4b4;
  color: #e54757;
  background: #fffbfb;
}

.trigger-pill[data-level='orange'] {
  border-color: #ffd4a8;
  color: #ff7a00;
  background: #fffaf5;
}

.trigger-pill[data-level='neutral'] {
  border-color: #e4e7ed;
  color: #606266;
  background: #ffffff;
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

  .matrix-legend {
    flex-wrap: wrap;
  }
}
</style>
