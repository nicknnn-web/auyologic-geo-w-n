<template>
  <div class="gd-page">
    <div class="gd-header">
      <div class="gd-header-icon"><el-icon><Histogram /></el-icon></div>
      <div><h1 class="gd-title">GEO 可见度检测</h1><p class="gd-subtitle">检测品牌在各AI平台的可见度，发现内容缺口并驱动创作</p></div>
    </div>

    <!-- 历史检测记录 - 横向滚动卡片 -->
    <div class="gd-history-section" v-if="geoDetectionHistory.length > 0 && currentStep !== 3">
      <div class="gd-history-header">
        <span class="gd-history-title">历史检测</span>
        <router-link to="/dashboard" class="gd-history-more">查看全部</router-link>
      </div>
      <div class="gd-history-scroll">
        <div
          v-for="(record, idx) in geoDetectionHistory.slice(0, 5)"
          :key="record.id"
          class="gd-history-card"
          :class="getHistoryGradeClass(record.overallGrade)"
          @click="handleHistoryCardClick(record.id)"
        >
          <div class="gd-history-card-top">
            <span class="gd-history-score">{{ record.overallScore }}</span>
            <span class="gd-history-grade" :class="getHistoryGradeClass(record.overallGrade)">{{ record.overallGrade }}</span>
          </div>
          <div class="gd-history-date">{{ formatHistoryDate(record.checkedAt) }}</div>
          <div class="gd-history-meta">
            <span class="gd-history-stat visible">{{ record.visibleCount }} 可见</span>
            <span class="gd-history-stat missing">{{ record.missingCount }} 缺失</span>
          </div>
          <div class="gd-history-platforms">{{ record.platformNames.join('、') }}</div>
          <div v-if="idx === 0" class="gd-history-new-tag">最新</div>
        </div>
      </div>
    </div>

    <div class="gd-overview-grid" v-if="detectionDone">
      <div class="overview-score-card" :class="overallGradeClass">
        <div class="overview-score-num">{{ overallScore }}</div>
        <div class="overview-score-label">综合得分</div>
        <div class="overview-grade-badge" :class="overallGradeClass">{{ overallGrade }}</div>
      </div>
      <div class="overview-stat-card"><div class="overview-stat-num" style="color:#67c23a">{{ visibleCount }}</div><div class="overview-stat-label">品牌可见</div><div class="overview-stat-sub">被正确提及</div></div>
      <div class="overview-stat-card"><div class="overview-stat-num" style="color:#f56c6c">{{ missingCount }}</div><div class="overview-stat-label">品牌缺失</div><div class="overview-stat-sub">未被提及</div></div>
      <div class="overview-stat-card"><div class="overview-stat-num" style="color:#409eff">{{ detectionPlatforms.length }}</div><div class="overview-stat-label">检测平台</div><div class="overview-stat-sub">个AI平台</div></div>
    </div>

    <div class="gd-steps-bar">
      <div v-for="(step, idx) in steps" :key="step.label" class="gd-step" :class="{ active: currentStep >= idx, done: currentStep > idx }">
        <div class="gd-step-circle"><el-icon v-if="currentStep > idx"><Check /></el-icon><span v-else>{{ idx + 1 }}</span></div>
        <span class="gd-step-label">{{ step.label }}</span>
        <div v-if="idx < steps.length - 1" class="gd-step-line" />
      </div>
    </div>

    <!-- 步骤1 -->
    <div v-if="currentStep === 0" class="gd-content">
      <div class="step-panel">
        <div class="step-panel-header"><div class="step-title">选择检测问题</div><div class="step-desc">从拓展问题中选择，系统将检测品牌在各平台的可见度</div></div>
        <div class="question-layout">
          <div class="question-list-panel">
            <div class="panel-header"><span class="panel-title">问题列表</span><el-tag size="small" type="info">{{ filteredQuestions.length }} 条</el-tag></div>
            <div class="filter-row">
              <el-select v-model="questionFilter" placeholder="全部分类" size="small" style="width:130px"><el-option label="全部分类" value="" /><el-option label="品牌" value="品牌" /><el-option label="产品" value="产品" /><el-option label="场景" value="场景" /></el-select>
              <el-checkbox v-model="selectAllCurrent" @change="handleSelectAllQuestions" label="本页全选" size="small" />
            </div>
            <div class="question-scroll">
              <div v-for="q in filteredQuestions" :key="q.id" class="question-item" :class="{ selected: isQuestionSelected(q.id) }" @click="toggleQuestion(q)">
                <el-checkbox :model-value="isQuestionSelected(q.id)" @click.stop />
                <span class="question-text">{{ q.text }}</span>
                <el-tag size="small" :type="getCategoryColor(q.category)">{{ q.category }}</el-tag>
              </div>
              <div v-if="filteredQuestions.length === 0" class="empty-hint" style="color:#e6a23c;background:#fdf6ec;border:1px solid #f5dab1;border-radius:8px;padding:12px;">
                暂无已审核的问题可检测，请先前往「<b>拓展问题</b>」页面添加并审核问题后再来
              </div>
            </div>
          </div>
          <div class="question-right">
            <div class="selected-panel">
              <div class="panel-header"><span class="panel-title">已选问题</span><el-tag size="small" type="success">{{ selectedQuestions.length }}/50</el-tag></div>
              <div v-if="selectedQuestions.length === 0" class="empty-hint">从左侧选择问题</div>
              <div v-else class="selected-scroll">
                <div v-for="q in selectedQuestions" :key="q.id" class="selected-item"><span class="truncate flex-1 mr-2">{{ q.text }}</span><el-icon class="remove-icon" @click="removeQuestion(q.id)"><Close /></el-icon></div>
              </div>
              <el-button v-if="selectedQuestions.length > 0" size="small" class="w-full mt-2" @click="clearAllQuestions">清空全部</el-button>
            </div>
            <div class="keyword-panel">
              <div class="panel-header"><span class="panel-title">命中关键词</span><div class="flex gap-1"><el-button size="small" text @click="selectAllKeywords">全选</el-button><el-button size="small" text @click="clearAllKeywords">清空</el-button></div></div>
              <div class="keyword-hint">已从关键词管理页面加载，点击选择要检测的关键词</div>
              <el-input v-model="newKeyword" placeholder="手动添加关键词..." size="small" class="mb-3" @keyup.enter="addKeyword"><template #append><el-button @click="addKeyword">添加</el-button></template></el-input>
              <div class="keyword-chips">
                <div v-for="kw in keywords" :key="kw" class="keyword-chip" :class="{ selected: isKeywordSelected(kw), 'kw-managed': !isCustom(kw) }" @click="toggleKeyword(kw)">
                  <el-icon v-if="isKeywordSelected(kw)" class="check-icon"><Check /></el-icon>{{ kw }}
                  <el-tooltip v-if="!isCustom(kw)" content="请到关键词管理页删除" placement="top" :show-after="300">
                    <el-icon class="kw-managed-icon"><Lock /></el-icon>
                  </el-tooltip>
                  <el-icon v-else class="kw-delete-icon" @click.stop="removeCustomKeyword(kw)"><Close /></el-icon>
                </div>
              </div>
              <div class="keyword-count">已选 {{ selectedKeywords.length }} / {{ keywords.length }} 个</div>
            </div>
          </div>
        </div>
        <div class="step-footer"><el-button type="primary" size="large" :disabled="selectedQuestions.length === 0" @click="nextStep">下一步：选择平台 <el-icon class="ml-1"><ArrowRight /></el-icon></el-button></div>
      </div>
    </div>

    <!-- 步骤2 -->
    <div v-if="currentStep === 1" class="gd-content">
      <div class="step-panel">
        <div class="step-panel-header"><div class="step-title">选择AI平台</div><div class="step-desc">选择要检测的AI平台</div></div>
        <div class="platform-grid">
          <div v-for="p in platforms" :key="p.id" class="platform-card" :class="{ selected: isPlatformSelected(p.id) }" @click="togglePlatform(p)">
            <div class="platform-icon" :style="{ backgroundColor: p.color }">{{ p.icon }}</div>
            <div class="platform-name">{{ p.name }}</div>
            <div class="platform-desc">{{ p.desc }}</div>
            <div class="platform-check" v-if="isPlatformSelected(p.id)"><el-icon><Check /></el-icon></div>
          </div>
        </div>
        <div class="step-footer">
          <el-button size="large" @click="prevStep"><el-icon class="mr-1"><ArrowLeft /></el-icon>上一步</el-button>
          <el-button type="primary" size="large" :disabled="selectedPlatforms.length === 0" @click="nextStep">下一步：确认检测 <el-icon class="ml-1"><ArrowRight /></el-icon></el-button>
        </div>
      </div>
    </div>

    <!-- 步骤3 -->
    <div v-if="currentStep === 2" class="gd-content">
      <div class="step-panel">
        <div class="step-panel-header"><div class="step-title">确认检测配置</div><div class="step-desc">确认后系统将开始执行检测</div></div>
        <div class="confirm-cards">
          <div class="confirm-card"><div class="confirm-card-header"><el-icon><ChatDotRound /></el-icon>检测问题 ({{ selectedQuestions.length }})</div><div class="confirm-card-body"><div v-for="q in selectedQuestions.slice(0,5)" :key="q.id" class="confirm-line">{{ q.text }}</div><div v-if="selectedQuestions.length > 5" class="confirm-more">还有 {{ selectedQuestions.length - 5 }} 个问题...</div></div></div>
          <div class="confirm-card"><div class="confirm-card-header"><el-icon><Monitor /></el-icon>检测平台 ({{ selectedPlatforms.length }})</div><div class="confirm-card-body"><div class="flex flex-wrap gap-2"><span v-for="p in selectedPlatforms" :key="p.id" class="platform-badge-icon" :style="{ backgroundColor: p.color, padding: '2px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: p.color, border: `1px solid ${p.color}` }"><span style="color: white; font-weight: 600;">{{ p.icon }}</span>{{ p.name }}</span></div></div></div>
          <div class="confirm-card"><div class="confirm-card-header"><el-icon><Collection /></el-icon>命中关键词 ({{ selectedKeywords.length }})</div><div class="confirm-card-body"><div class="flex flex-wrap gap-2"><el-tag v-for="kw in selectedKeywords" :key="kw">{{ kw }}</el-tag></div></div></div>
        </div>
        <div class="confirm-summary"><div class="summary-row"><span class="summary-label">检测组合</span><span class="summary-value">{{ selectedQuestions.length }} × {{ selectedPlatforms.length }} = {{ selectedQuestions.length * selectedPlatforms.length }} 次</span></div><div class="summary-row"><span class="summary-label">预计耗时</span><span class="summary-value">约 {{ Math.ceil(selectedQuestions.length * selectedPlatforms.length * 0.5) }} 分钟</span></div></div>
        <div class="step-footer">
          <el-button size="large" @click="prevStep"><el-icon class="mr-1"><ArrowLeft /></el-icon>上一步</el-button>
          <el-button type="primary" size="large" @click="startDetection"><el-icon class="mr-1"><Cpu /></el-icon>开始执行检测</el-button>
        </div>
      </div>
    </div>

    <!-- 步骤4：结果 -->
    <div v-if="currentStep === 3" class="gd-content gd-result-panel">
      <!-- 顶部概览卡片 -->
      <div class="result-overview">
        <div class="overview-left">
          <div class="overview-main-score" :class="overallGradeClass">
            <div class="main-score-num">{{ overallScore }}</div>
            <div class="main-score-label">综合得分</div>
            <div class="main-grade-badge" :class="overallGradeClass">{{ overallGrade }}级</div>
          </div>
          <div class="overview-stats">
            <div class="stat-item success">
              <div class="stat-num">{{ visibleCount }}</div>
              <div class="stat-label">品牌可见</div>
            </div>
            <div class="stat-item danger">
              <div class="stat-num">{{ missingCount }}</div>
              <div class="stat-label">品牌缺失</div>
            </div>
            <div class="stat-item info">
              <div class="stat-num">{{ detectionPlatforms.length }}</div>
              <div class="stat-label">检测平台</div>
            </div>
          </div>
        </div>
        <!-- 雷达图 -->
        <div class="overview-radar">
          <div class="radar-title">关键词得分分布</div>
          <RadarChart :data="radarChartData" />
        </div>
      </div>

      <!-- 工具栏 -->
      <div class="result-toolbar">
        <el-button text @click="resetDetection"><el-icon class="mr-1"><RefreshLeft /></el-icon>重新检测</el-button>
        <el-button type="primary" @click="handleGenerateReport"><el-icon class="mr-1"><Document /></el-icon>生成详细报告</el-button>
        <el-button text @click="handleExportResult"><el-icon class="mr-1"><Download /></el-icon>导出报告</el-button>
      </div>

      <!-- 问题类型筛选 -->
      <div class="result-filter-bar">
        <el-radio-group v-model="categoryFilter" size="small">
          <el-radio-button label="">全部 ({{ detectionResults.length }})</el-radio-button>
          <el-radio-button label="品牌">品牌 ({{ categoryCounts['品牌'] || 0 }})</el-radio-button>
          <el-radio-button label="产品">产品 ({{ categoryCounts['产品'] || 0 }})</el-radio-button>
          <el-radio-button label="场景">场景 ({{ categoryCounts['场景'] || 0 }})</el-radio-button>
        </el-radio-group>
      </div>

      <div class="result-tabs">
        <button :class="['result-tab', { active: resultTab === 'visible' }]" @click="resultTab = 'visible'"><el-icon color="#67c23a"><SuccessFilled /></el-icon>品牌可见 <el-badge :value="filteredVisibleCount" type="success" /></button>
        <button :class="['result-tab', { active: resultTab === 'missing' }]" @click="resultTab = 'missing'"><el-icon color="#f56c6c"><WarnTriangleFilled /></el-icon>品牌缺失 <el-badge :value="filteredMissingCount" type="danger" /></button>
      </div>

      <!-- 品牌可见 -->
      <div v-if="resultTab === 'visible'" class="result-list">
        <div v-if="filteredVisibleQuestions.length === 0" class="result-empty"><el-icon size="40" color="#dcdfe6"><SuccessFilled /></el-icon><p>暂无数据</p></div>
        <div v-for="item in filteredVisibleQuestions" :key="item.questionId" class="result-card visible" :class="'cat-' + (item.category === '品牌' ? 'brand' : item.category === '产品' ? 'product' : item.category === '企业' ? 'enterprise' : 'scene')">
          <div class="result-card-header">
            <el-tag size="small" :class="'cat-tag-' + (item.category === '品牌' ? 'brand' : item.category === '产品' ? 'product' : item.category === '企业' ? 'enterprise' : 'scene')">{{ item.category }}</el-tag>
            <div class="result-score" :class="getScoreClass(item.avgScore)">
              <span class="score-num">{{ item.avgScore }}</span>
              <span class="score-label">分</span>
            </div>
          </div>
          <div class="result-card-main">
            <div class="result-question">{{ item.question }}</div>
            <div class="result-meta"><span class="result-source">关键词：{{ item.sourceKeyword }}</span></div>
          </div>
          <!-- 得分明细 -->
          <div class="result-score-detail">
            <div class="score-item"><span class="score-item-label">提及率</span><el-progress :percentage="getMentionRate(item)" :stroke-width="6" :show-text="false" /><span class="score-item-val">{{ getMentionRate(item) }}%</span></div>
            <div class="score-item"><span class="score-item-label">位置得分</span><el-progress :percentage="getPositionScore(item)" :stroke-width="6" :show-text="false" /><span class="score-item-val">{{ getPositionScore(item) }}</span></div>
            <div class="score-item"><span class="score-item-label">情感倾向</span><el-progress :percentage="getSentimentScore(item)" :stroke-width="6" :show-text="false" :color="getSentimentColor(item)" /><span class="score-item-val" :style="{ color: getSentimentColor(item) }">{{ getSentimentLabel(item) }}</span></div>
          </div>
          <div class="result-card-platforms">
            <div v-for="p in item.platforms" :key="p.name" class="platform-badge" :class="{ mentioned: p.mentioned, 'not-mentioned': !p.mentioned }">
              <span class="platform-badge-icon" :style="{ backgroundColor: p.color }">{{ p.icon }}</span><span class="platform-badge-name">{{ p.name }}</span>
              <el-icon v-if="p.mentioned" color="#67c23a"><SuccessFilled /></el-icon>
              <el-icon v-else color="#dcdfe6"><Close /></el-icon>
            </div>
          </div>
          <div class="result-card-action"><el-button size="small" type="primary" plain @click="handleGenerateContent(item.question)"><el-icon class="mr-1"><EditPen /></el-icon>继续优化</el-button><el-button v-if="item.platforms.some(p => p.name === 'DeepSeek')" size="small" plain @click="openRawAnswer(item.platforms.find(p => p.name === 'DeepSeek').rawAnswer)"><el-icon class="mr-1"><Document /></el-icon>查看 DeepSeek 原文</el-button></div>
        </div>
      </div>

      <!-- 品牌缺失 -->
      <div v-if="resultTab === 'missing'" class="result-list">
        <div v-if="filteredMissingCount > 0" class="missing-header"><div class="missing-info"><el-icon color="#f56c6c"><WarnTriangleFilled /></el-icon><span>共 <strong>{{ filteredMissingCount }}</strong> 个问题中您的品牌未被提及，这些是需要重点覆盖的内容缺口</span></div></div>
        <div v-if="filteredMissingQuestions.length === 0" class="result-empty"><el-icon size="40" color="#67c23a"><SuccessFilled /></el-icon><p>太棒了！该类型问题中您的品牌都已被提及</p></div>
        <div v-for="item in filteredMissingQuestions" :key="item.questionId" class="result-card missing" :class="'cat-' + (item.category === '品牌' ? 'brand' : item.category === '产品' ? 'product' : item.category === '企业' ? 'enterprise' : 'scene')">
          <div class="result-card-header">
            <el-tag size="small" :class="'cat-tag-' + (item.category === '品牌' ? 'brand' : item.category === '产品' ? 'product' : item.category === '企业' ? 'enterprise' : 'scene')">{{ item.category }}</el-tag>
            <div class="result-score missing-score">
              <span class="score-num">0</span>
              <span class="score-label">分</span>
            </div>
          </div>
          <div class="result-card-main">
            <div class="result-question">{{ item.question }}</div>
            <div class="result-meta"><span class="result-source">关键词：{{ item.sourceKeyword }}</span></div>
          </div>
          <div class="result-card-platforms">
            <div v-for="p in item.platforms" :key="p.name" class="platform-badge not-mentioned">
              <span class="platform-badge-icon" :style="{ backgroundColor: p.color }">{{ p.icon }}</span><span class="platform-badge-name">{{ p.name }}</span>
              <el-icon color="#dcdfe6"><Close /></el-icon>
            </div>
          </div>
          <div class="result-card-action"><el-button size="small" type="primary" @click="handleGenerateContent(item.question)"><el-icon class="mr-1"><EditPen /></el-icon>生成内容覆盖</el-button></div>
        </div>
      </div>
    </div>

    <el-dialog v-model="loadingVisible" title="正在检测" width="380px" :close-on-click-modal="false" :show-close="false">
      <div class="detecting-dialog"><el-icon class="is-loading" style="font-size: 64px; color: #409eff; margin-bottom: 16px;"><Loading /></el-icon><div class="detecting-task">检测中，请稍候...</div><div class="detecting-task" style="font-size:13px;color:#909399;margin-top:6px">{{ currentTask }}</div><div class="detecting-count">已完成 {{ completedCount }} / {{ totalCount }} 次</div></div>
    </el-dialog>

    <el-dialog v-model="rawAnswerDialogVisible" title="DeepSeek 原始回答" width="600px">
      <div style="font-size:14px;color:#303133;line-height:1.8;white-space:pre-wrap;max-height:60vh;overflow-y:auto;">{{ currentRawAnswer }}</div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, ArrowLeft, Close, Check, ChatDotRound, Monitor, Collection, Cpu, RefreshLeft, Download, EditPen, SuccessFilled, WarnTriangleFilled, Histogram, Lock, Document, Loading } from '@element-plus/icons-vue'


/**
 * 雷达图组件 - 用SVG实现
 * 显示4个维度：提及率、位置得分、情感得分、相关性得分
 * 按关键词类型配色：品牌=紫色、产品=绿色、场景=橙色
 */
const RadarChart = {
  props: {
    data: {
      type: Object,
      default: () => ({})
    }
  },
  setup(props) {
    const size = 180
    const center = size / 2
    const maxRadius = 70
    const levels = 4
    
    // 计算点的位置
    const getPointPosition = (angle, value) => {
      const radian = (angle - 90) * Math.PI / 180
      const radius = (value / 100) * maxRadius
      return {
        x: center + radius * Math.cos(radian),
        y: center + radius * Math.sin(radian)
      }
    }
    
    // 获取多边形路径
    const getPolygonPath = (values) => {
      const angles = [0, 90, 180, 270]
      const points = angles.map((angle, idx) => {
        const pos = getPointPosition(angle, values[idx] || 0)
        return `${pos.x},${pos.y}`
      })
      return `M ${points.join(' L ')} Z`
    }
    
    // 标签位置
    const getLabelPosition = (angle) => {
      const radian = (angle - 90) * Math.PI / 180
      const labelRadius = maxRadius + 20
      return {
        x: center + labelRadius * Math.cos(radian),
        y: center + labelRadius * Math.sin(radian)
      }
    }
    
    const labels = ['提及率', '位置得分', '情感得分', '相关性']
    const angles = [0, 90, 180, 270]
    
    return () => h('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` }, [
      // 背景网格
      h('g', { class: 'radar-grid' }, [
        // 层级圆
        ...Array.from({ length: levels }, (_, i) => {
          const r = ((i + 1) / levels) * maxRadius
          return h('circle', {
            cx: center, cy: center, r,
            fill: 'none', stroke: '#e4e7ed', 'stroke-dasharray': '3,3'
          })
        }),
        // 轴线
        ...angles.map(angle => {
          const pos = getPointPosition(angle, 100)
          return h('line', {
            x1: center, y1: center, x2: pos.x, y2: pos.y,
            stroke: '#e4e7ed'
          })
        })
      ]),
      // 数据多边形
      h('polygon', {
        points: getPolygonPath([
          props.data.mention || 0,
          props.data.position || 0,
          props.data.sentiment || 0,
          props.data.relevance || 0
        ]),
        fill: 'rgba(64, 158, 255, 0.2)',
        stroke: '#409eff',
        'stroke-width': 2
      }),
      // 数据点
      ...angles.map((angle, idx) => {
        const values = [props.data.mention || 0, props.data.position || 0, props.data.sentiment || 0, props.data.relevance || 0]
        const pos = getPointPosition(angle, values[idx])
        return h('circle', {
          cx: pos.x, cy: pos.y, r: 4,
          fill: '#409eff'
        })
      }),
      // 标签
      ...labels.map((label, idx) => {
        const pos = getLabelPosition(angles[idx])
        return h('text', {
          x: pos.x, y: pos.y + 4,
          'text-anchor': 'middle',
          fill: '#606266',
          'font-size': '11'
        }, label)
      }),
      // 鼠标悬停提示区域（透明）
      h('g', { class: 'radar-tooltip' }, [
        ...angles.map((angle, idx) => {
          const values = [props.data.mention || 0, props.data.position || 0, props.data.sentiment || 0, props.data.relevance || 0]
          const pos = getPointPosition(angle, values[idx])
          return h('title', {}, `${labels[idx]}: ${values[idx]}`)
        })
      ])
    ])
  }
}

// ==================== AI 代理配置 ====================
const AI_PROXY_URL = `${window.VITE_API_URL || window.location.origin}/api/ai/generate`

// ==================== 权威网站白名单 ====================
// 这些是行业知名品牌官网，检测时有额外加权
const AUTHORIZED_WEBSITES = {
  // 手机/科技行业
  'apple.com': { name: 'Apple', brand: '苹果', weight: 25 },
  'huawei.com': { name: 'Huawei', brand: '华为', weight: 22 },
  'xiaomi.com': { name: 'Xiaomi', brand: '小米', weight: 20 },
  'samsung.com': { name: 'Samsung', brand: '三星', weight: 22 },
  'oppo.com': { name: 'OPPO', brand: 'OPPO', weight: 18 },
  'vivo.com': { name: 'vivo', brand: 'vivo', weight: 18 },
  'oneplus.com': { name: 'OnePlus', brand: '一加', weight: 15 },
  'google.com': { name: 'Google', brand: '谷歌', weight: 25 },
  'microsoft.com': { name: 'Microsoft', brand: '微软', weight: 25 },
  
  // 汽车行业
  'tesla.com': { name: 'Tesla', brand: '特斯拉', weight: 23 },
  'byd.com': { name: 'BYD', brand: '比亚迪', weight: 20 },
  'nio.com': { name: 'NIO', brand: '蔚来', weight: 18 },
  'xpeng.com': { name: 'XPeng', brand: '小鹏', weight: 17 },
  'li-auto.com': { name: 'Li Auto', brand: '理想', weight: 17 },
  'bmw.com': { name: 'BMW', brand: '宝马', weight: 22 },
  'mercedes-benz.com': { name: 'Mercedes-Benz', brand: '奔驰', weight: 22 },
  'audi.com': { name: 'Audi', brand: '奥迪', weight: 21 },
  
  // 电商/互联网
  'amazon.com': { name: 'Amazon', brand: '亚马逊', weight: 25 },
  'taobao.com': { name: 'Taobao', brand: '淘宝', weight: 22 },
  'jd.com': { name: 'JD', brand: '京东', weight: 22 },
  'pinduoduo.com': { name: 'Pinduoduo', brand: '拼多多', weight: 18 },
  'alibaba.com': { name: 'Alibaba', brand: '阿里巴巴', weight: 23 },
  'tmall.com': { name: 'Tmall', brand: '天猫', weight: 22 },
  
  // 社交/内容平台
  'facebook.com': { name: 'Facebook', brand: 'Facebook', weight: 24 },
  'twitter.com': { name: 'Twitter', brand: 'Twitter', weight: 22 },
  'instagram.com': { name: 'Instagram', brand: 'Instagram', weight: 22 },
  'youtube.com': { name: 'YouTube', brand: 'YouTube', weight: 24 },
  'tiktok.com': { name: 'TikTok', brand: 'TikTok', weight: 23 },
  'douyin.com': { name: 'Douyin', brand: '抖音', weight: 22 },
  'bilibili.com': { name: 'Bilibili', brand: 'B站', weight: 20 },
  'xiaohongshu.com': { name: 'Xiaohongshu', brand: '小红书', weight: 20 },
  
  // 中国本土品牌
  'baidu.com': { name: 'Baidu', brand: '百度', weight: 23 },
  'tencent.com': { name: 'Tencent', brand: '腾讯', weight: 24 },
  'alipay.com': { name: 'Alipay', brand: '支付宝', weight: 22 },
  'weibo.com': { name: 'Weibo', brand: '微博', weight: 20 },
  'zhihu.com': { name: 'Zhihu', brand: '知乎', weight: 18 },
  
  // 更多科技品牌
  'nvidia.com': { name: 'NVIDIA', brand: '英伟达', weight: 24 },
  'intel.com': { name: 'Intel', brand: '英特尔', weight: 22 },
  'amd.com': { name: 'AMD', brand: 'AMD', weight: 21 },
  'sony.com': { name: 'Sony', brand: '索尼', weight: 22 },
  'canon.com': { name: 'Canon', brand: '佳能', weight: 20 },
  'nikon.com': { name: 'Nikon', brand: '尼康', weight: 20 },
  
  // 运动/时尚
  'nike.com': { name: 'Nike', brand: '耐克', weight: 22 },
  'adidas.com': { name: 'Adidas', brand: '阿迪达斯', weight: 21 },
  'lululemon.com': { name: 'Lululemon', brand: 'Lululemon', weight: 18 },
  
  // 食品/饮料
  'coca-cola.com': { name: 'Coca-Cola', brand: '可口可乐', weight: 20 },
  'pepsi.com': { name: 'Pepsi', brand: '百事', weight: 18 },
  'starbucks.com': { name: 'Starbucks', brand: '星巴克', weight: 20 },
  'mcdonalds.com': { name: 'McDonalds', brand: '麦当劳', weight: 18 },
  'kfc.com': { name: 'KFC', brand: '肯德基', weight: 17 },
}

/**
 * 获取网站知名度权重
 * @param {string} url - 网站URL
 * @returns {object|null} 匹配的品牌信息或null
 */
const getWebsiteAuthority = (url) => {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    // 精确匹配或域名后缀匹配
    for (const [domain, info] of Object.entries(AUTHORIZED_WEBSITES)) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return info
      }
    }
    return null
  } catch (e) {
    return null
  }
}

/**
 * 计算带知名度的调整得分
 * @param {number} baseScore - 基础得分
 * @param {string} url - 相关网站URL（如果有）
 * @param {object} detection - 检测结果
 * @returns {number} 调整后的得分
 */
const calculateScoreWithAuthority = (baseScore, url, detection) => {
  // 如果基础得分已经很高，不需要额外加权
  if (baseScore >= 70) return baseScore
  
  // 检查是否是权威网站
  const authority = getWebsiteAuthority(url)
  if (!authority) return baseScore
  
  // 如果关键词未被提及，但网站是权威网站
  if (!detection.mentioned) {
    // 保底分数 = 基础权重 * 0.4（确保至少有保底分）
    const floorScore = Math.round(authority.weight * 0.4)
    return Math.max(baseScore, floorScore)
  }
  
  // 如果关键词被提及，给予额外加权
  // 额外加分 = 权重 * 0.5，但最高不超过100
  const bonus = Math.round(authority.weight * 0.5)
  return Math.min(100, baseScore + bonus)
}

// ==================== 缓存配置 ====================
const CACHE_KEY = 'geo_detection_cache'
const CACHE_DAYS = 7

/**
 * 获取缓存的检测结果
 * @param {string} question - 问题内容
 * @param {string} keyword - 关键词
 * @param {string} platformId - 平台ID
 * @returns {object|null} 缓存的检测结果或null
 */
const getCachedResult = (question, keyword, platformId) => {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY)
    if (!cacheStr) return null
    
    const cache = JSON.parse(cacheStr)
    const cacheKey = `${question}_${keyword}_${platformId}`
    const cached = cache[cacheKey]
    
    if (!cached) return null
    
    // 检查是否过期
    const cachedTime = new Date(cached.timestamp)
    const now = new Date()
    const daysDiff = (now - cachedTime) / (1000 * 60 * 60 * 24)
    
    if (daysDiff > CACHE_DAYS) {
      // 缓存过期，删除
      delete cache[cacheKey]
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
      return null
    }
    
    return cached.result
  } catch (e) {
    console.error('读取缓存失败:', e)
    return null
  }
}

/**
 * 保存检测结果到缓存
 * @param {string} question - 问题内容
 * @param {string} keyword - 关键词
 * @param {string} platformId - 平台ID
 * @param {object} result - 检测结果
 */
const setCachedResult = (question, keyword, platformId, result) => {
  try {
    let cache = {}
    const cacheStr = localStorage.getItem(CACHE_KEY)
    if (cacheStr) {
      cache = JSON.parse(cacheStr)
    }
    
    const cacheKey = `${question}_${keyword}_${platformId}`
    cache[cacheKey] = {
      timestamp: new Date().toISOString(),
      result: result
    }
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (e) {
    console.error('保存缓存失败:', e)
  }
}

/**
 * 真实检测：直接将问题发给 DeepSeek，从真实回答中分析关键词可见度
 * @param {string} question - 用户问题
 * @param {string} keyword - 品牌关键词
 * @returns {Promise<object>} 检测结果
 */
const detectDeepseekReal = async (question, keywords) => {
  try {
    // 直接将用户问题发给 AI 代理，不做任何分析指令
    const response = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        prompt: question,
        temperature: 0.7,
        max_tokens: 800
      })
    })

    if (!response.ok) {
      throw new Error(`AI代理请求失败: ${response.status}`)
    }

    const data = await response.json()
    const answerText = data.content || ''

    if (!answerText) {
      throw new Error('DeepSeek 返回内容为空')
    }

    console.log(`[GEO真实检测] DeepSeek 回答: ${answerText.slice(0, 80)}...`)

    // ===== 纯前端文本分析（支持多关键词：任一命中即算可见） =====
    const text = answerText
    const lowerText = text.toLowerCase()
    const keyword = keywords[0] || ''
    const lowerKeyword = keyword.toLowerCase()

    // 任一关键词提及就算 mentioned（最简单的多关键词逻辑）
    const mentioned = keywords.some(kw => lowerText.includes(kw.toLowerCase()))

    // 2. mentionType - 简化：使用第一个命中的关键词判断
    let mentionType = 'none'
    if (mentioned) {
      const firstKw = keywords.find(kw => lowerText.includes(kw.toLowerCase())) || ''
      if (firstKw) {
        const escaped = firstKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const exactPattern = new RegExp(`\\b${escaped}\\b`, 'i')
        mentionType = exactPattern.test(text) ? 'explicit' : 'implicit'
      }
    }

    // 3. firstMentionPosition - 使用第一个关键词
    let firstMentionPosition = 1.0
    if (mentioned) {
      const firstKw = keywords.find(kw => lowerText.includes(kw.toLowerCase())) || ''
      const idx = lowerText.indexOf(firstKw.toLowerCase())
      firstMentionPosition = idx / text.length
    }

    // 4. positionRank - 位置等级
    let positionRank = 'below_fold'
    if (mentioned) {
      if (firstMentionPosition < 0.1) positionRank = 'top'
      else if (firstMentionPosition < 0.5) positionRank = 'above_fold'
      else positionRank = 'below_fold'
    }

    // 5. sentiment - 情感分析（基于第一个命中的关键词）
    let sentiment = 'neutral'
    if (mentioned) {
      const firstKw = keywords.find(kw => lowerText.includes(kw.toLowerCase())) || ''
      const idx = lowerText.indexOf(firstKw.toLowerCase())
      const contextStart = Math.max(0, idx - 50)
      const contextEnd = Math.min(text.length, idx + firstKw.length + 50)
      const context = text.slice(contextStart, contextEnd)

      const positiveWords = ['推荐', '优秀', '最好', '领先', '强大', '创新', '值得', '赞', '好', '棒', '不错', '出色', '优质', '信赖', '喜欢', '支持', '首选', '推荐', '最佳', '第一']
      const negativeWords = ['差', '问题', '坑', '烂', '失望', '后悔', '不推荐', '避雷', '骗局', '垃圾', '缺点', '失败', '糟糕', '差劲', '投诉']

      const posCount = positiveWords.filter(w => context.includes(w)).length
      const negCount = negativeWords.filter(w => context.includes(w)).length

      if (posCount > negCount) sentiment = 'positive'
      else if (negCount > posCount) sentiment = 'negative'
      else sentiment = 'neutral'
    }

    // 6. semanticRelevance - 简化为所有关键词总数
    let semanticRelevance = 0
    if (mentioned) {
      let totalCount = 0
      keywords.forEach(kw => {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        totalCount += (lowerText.match(new RegExp(escaped, 'gi')) || []).length
      })
      const density = totalCount / (text.length / 100)
      semanticRelevance = Math.min(1.0, density * 0.8)
    }

    // 7. competitivePosition 和 8. competitorsMentioned（简化检测）
    let competitivePosition = null
    const competitorsMentioned = []

    const competitorKeywords = ['苹果', 'Apple', '华为', 'Huawei', '小米', 'Xiaomi', '三星', 'Samsung', 'OPPO', 'vivo', '一加', 'OnePlus', '荣耀', 'Honor', '谷歌', 'Google', '微软', 'Microsoft', '特斯拉', 'Tesla', '比亚迪', 'BYD']
    competitorKeywords.forEach(comp => {
      if (comp.toLowerCase() !== lowerKeyword && lowerText.includes(comp.toLowerCase())) {
        competitorsMentioned.push(comp)
      }
    })

    if (competitorsMentioned.length > 0 && mentioned) {
      // 检查关键词与竞品的相对位置
      const keywordIdx = lowerText.indexOf(lowerKeyword)
      const compIdx = lowerText.indexOf(competitorsMentioned[0].toLowerCase())
      if (keywordIdx < compIdx) {
        competitivePosition = 'winner'
      } else {
        competitivePosition = 'loser'
      }
    } else if (mentioned) {
      competitivePosition = 'mentioned'
    }

    const result = {
      mentioned,
      mentionType,
      firstMentionPosition,
      positionRank,
      sentiment,
      semanticRelevance: Math.round(semanticRelevance * 100) / 100,
      competitivePosition,
      competitorsMentioned,
      rawAnswer: answerText
    }

    console.log(`[GEO真实检测] 分析结果:`, result)
    return result

  } catch (error) {
    console.error('DeepSeek 真实检测失败:', error)
    throw error
  }
}

/**
 * 调用 DeepSeek API 进行可见度检测
 * @param {string} question - 用户问题
 * @param {string[]} keywords - 关键词数组
 * @param {string} platformId - 平台ID
 * @returns {Promise<object>} 检测结果
 */
const detectWithDeepSeek = async (question, keywords, platformId) => {
  // 检查缓存 - 用第一个关键词作为缓存键
  const keyword = keywords[0] || ''
  const cached = getCachedResult(question, keyword, platformId)
  if (cached) {
    console.log(`[GEO检测] 缓存命中: ${question.slice(0, 20)}... @ ${platformId}`)
    return cached
  }

  // ===== 真实检测：DeepSeek 平台直接发问题并分析回答 =====
  if (platformId === 'deepseek') {
    const result = await detectDeepseekReal(question, keywords)
    setCachedResult(question, keyword, platformId, result)
    console.log(`[GEO检测] DeepSeek 真实检测完成: ${question.slice(0, 20)}...`)
    return result
  }

  // ===== 模拟检测：其他平台暂无API，使用分析prompt（模拟逻辑）=====
  // 构建提示词
  const prompt = `你是一个AI平台内容分析专家。请分析以下问题在AI平台回答中的品牌可见度。

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

  try {
    const response = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        systemPrompt: '你是一个专业的AI内容分析助手，擅长分析品牌在AI平台回答中的可见度。',
        prompt,
        temperature: 0.3,
        max_tokens: 1000
      })
    })
    
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`)
    }
    
    const data = await response.json()
    const content = data.content || ''
    
    if (!content) {
      throw new Error('API返回内容为空')
    }
    
    // 解析JSON响应
    let result
    try {
      // 尝试提取JSON（处理可能的markdown格式）
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        result = JSON.parse(content)
      }
    } catch (parseError) {
      console.error('解析JSON失败:', parseError, content)
      // 如果解析失败，返回默认结果
      result = {
        mentioned: false,
        mentionType: 'none',
        firstMentionPosition: 1.0,
        positionRank: 'below_fold',
        sentiment: 'neutral',
        semanticRelevance: 0,
        competitivePosition: null,
        competitorsMentioned: []
      }
    }
    
    // 缓存结果
    setCachedResult(question, keyword, platformId, result)
    console.log(`[GEO检测] API调用成功: ${question.slice(0, 20)}... @ ${platformId}`)
    
    return result
  } catch (error) {
    console.error('AI代理调用失败:', error)
    throw error
  }
}

/**
 * 计算综合得分（按关键词类型加权）
 * @param {object} detection - 检测结果
 * @param {string} keywordType - 关键词类型 (品牌/产品/场景)
 * @param {string} keyword - 关键词（用于检测权威网站）
 * @returns {number} 综合得分 0-100
 */
const calculateScore = (detection, keywordType, keyword = '') => {
  const weights = {
    '品牌': { mention: 0.4, position: 0.3, sentiment: 0.2, relevance: 0.1 },
    '产品': { mention: 0.3, position: 0.25, sentiment: 0.25, relevance: 0.2 },
    '场景': { mention: 0.3, position: 0.2, sentiment: 0.1, relevance: 0.4 }
  }
  
  const w = weights[keywordType] || weights['场景']
  
  // 提及得分
  const mentionScore = detection.mentioned ? 100 : 0
  
  // 位置得分
  let positionScore = 0
  if (detection.positionRank === 'top') positionScore = 100
  else if (detection.positionRank === 'above_fold') positionScore = 70
  else if (detection.positionRank === 'below_fold') positionScore = 40
  
  // 情感得分
  let sentimentScore = 50
  if (detection.sentiment === 'positive') sentimentScore = 100
  else if (detection.sentiment === 'neutral') sentimentScore = 50
  else if (detection.sentiment === 'negative') sentimentScore = 20
  
  // 相关性得分
  const relevanceScore = detection.semanticRelevance * 100
  
  // 计算加权总分
  let totalScore = 
    mentionScore * w.mention +
    positionScore * w.position +
    sentimentScore * w.sentiment +
    relevanceScore * w.relevance
  
  totalScore = Math.round(totalScore)
  
  // ==================== 知名网站加权 ====================
  // 如果检测到了权威网站，给予额外加权
  const authority = getWebsiteAuthority(keyword)
  if (authority) {
    if (detection.mentioned) {
      // 关键词被提及：额外加分
      const bonus = Math.round(authority.weight * 0.5)
      totalScore = Math.min(100, totalScore + bonus)
    } else {
      // 关键词未被提及：保底分数
      const floorScore = Math.round(authority.weight * 0.4)
      totalScore = Math.max(totalScore, floorScore)
    }
  }
  
  return totalScore
}

const router = useRouter()
const route = useRoute()
const steps = [{ label: '选择问题' }, { label: '选择平台' }, { label: '确认检测' }, { label: '查看结果' }]

// ===== 历史检测记录 =====
const geoDetectionHistory = ref([])

const loadHistory = async () => {
  try {
    const res = await fetch(`${window.VITE_API_URL || window.location.origin}/api/geo-reports`)
    if (res.ok) {
      const data = await res.json()
      geoDetectionHistory.value = data.map(r => ({
        id: r.id,
        checkedAt: r.checkedAt,
        overallScore: r.overallScore,
        overallGrade: r.overallGrade,
        visibleCount: r.visibleCount,
        missingCount: r.missingCount,
        platformCount: r.platformCount,
        platformNames: r.platformNames || [],
        results: r.results || []  // 本地保留 results，前端展示用
      }))
    }
  } catch (e) {
    console.warn('加载检测历史失败:', e)
    geoDetectionHistory.value = []
  }
}

const saveHistory = async (record) => {
  // 保存完整结果到 localStorage（供前端详情展示）
  const allData = {}
  try {
    const raw = localStorage.getItem('auyologic_data')
    if (raw) Object.assign(allData, JSON.parse(raw))
  } catch {}
  const history = allData['geo-detection-history'] || []
  history.unshift(record)
  if (history.length > 10) history.splice(10)
  allData['geo-detection-history'] = history
  localStorage.setItem('auyologic_data', JSON.stringify(allData))
  geoDetectionHistory.value = history

  // 同步到后端（仅存汇总字段，results 太大存本地）
  try {
    await fetch(`${window.VITE_API_URL || window.location.origin}/api/geo-reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: record.platformNames?.join(',') || '',
        overallScore: record.overallScore,
        overallGrade: record.overallGrade,
        visibleCount: record.visibleCount,
        missingCount: record.missingCount,
        platformData: { platformCount: record.platformCount, questionCount: record.questionCount }
      })
    })
  } catch (e) {
    console.warn('同步历史到后端失败:', e)
  }
}

const loadHistoryRecord = async (id) => {
  // 优先从本地 history 读取（包含完整 results）
  const allData = {}
  try {
    const raw = localStorage.getItem('auyologic_data')
    if (raw) Object.assign(allData, JSON.parse(raw))
  } catch {}
  const history = allData['geo-detection-history'] || []
  return history.find(h => h.id === Number(id)) || null
}

const getHistoryGradeClass = (grade) => {
  if (grade === 'A') return 'grade-green'
  if (grade === 'B') return 'grade-yellow'
  return 'grade-red'
}

const formatHistoryDate = (isoString) => {
  const d = new Date(isoString)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours().toString().padStart(2, '0')
  const minute = d.getMinutes().toString().padStart(2, '0')
  return `${month}/${day} ${hour}:${minute}`
}

const handleHistoryCardClick = async (id) => {
  router.replace({ path: '/geo-detection', query: { historyId: id } })
  const record = await loadHistoryRecord(id)
  if (record) {
    loadedHistoryRecord.value = record
    detectionResults.value = record.results || []
    overallScore.value = record.overallScore
    overallGrade.value = record.overallGrade
    currentStep.value = 3
    resultTab.value = 'missing'
  }
}

const loadedHistoryRecord = ref(null)

const resetDetection = () => {
  currentStep.value = 0
  selectedQuestions.value = []
  selectedPlatforms.value = []
  selectedKeywords.value = []
  detectionResults.value = []
  resultTab.value = 'missing'
  overallScore.value = 0
  loadedHistoryRecord.value = null
  router.replace({ path: '/geo-detection' })
}
const currentStep = ref(0)
const detectionDone = computed(() => currentStep.value === 3)
const resultTab = ref('missing')
const categoryFilter = ref('')

// 关键词类型颜色配置
const categoryColors = {
  '品牌': { tag: '#722ed1', bg: '#f3e8ff', border: '#b37feb' },  // 紫色
  '产品': { tag: '#52c41a', bg: '#f6ffed', border: '#95de64' },   // 绿色
  '场景': { tag: '#fa8c16', bg: '#fff7e6', border: '#ffd591' }    // 橙色
}

// 计算雷达图数据（按类型聚合）
const radarChartData = computed(() => {
  if (detectionResults.value.length === 0) return { mention: 0, position: 0, sentiment: 0, relevance: 0 }
  
  let totalMention = 0, totalPosition = 0, totalSentiment = 0, totalRelevance = 0
  let count = 0
  
  detectionResults.value.forEach(item => {
    item.platforms.forEach(p => {
      if (p.mentioned) {
        totalMention += 100
        // 位置得分
        totalPosition += p.semanticRelevance ? 70 : 40
        // 情感得分
        if (p.sentiment === 'positive') totalSentiment += 100
        else if (p.sentiment === 'neutral') totalSentiment += 50
        else totalSentiment += 20
        // 相关性得分
        totalRelevance += (p.semanticRelevance || 0) * 100
        count++
      }
    })
  })
  
  if (count === 0) return { mention: 0, position: 0, sentiment: 0, relevance: 0 }
  
  return {
    mention: Math.round(totalMention / count),
    position: Math.round(totalPosition / count),
    sentiment: Math.round(totalSentiment / count),
    relevance: Math.round(totalRelevance / count)
  }
})

// 按类型统计数量
const categoryCounts = computed(() => {
  const counts = {}
  detectionResults.value.forEach(item => {
    counts[item.category] = (counts[item.category] || 0) + 1
  })
  return counts
})

// 筛选后的可见问题
const filteredVisibleQuestions = computed(() => {
  let list = visibleQuestions.value
  if (categoryFilter.value) {
    list = list.filter(item => item.category === categoryFilter.value)
  }
  return list
})

// 筛选后的缺失问题
const filteredMissingQuestions = computed(() => {
  let list = missingQuestions.value
  if (categoryFilter.value) {
    list = list.filter(item => item.category === categoryFilter.value)
  }
  return list
})

const filteredVisibleCount = computed(() => filteredVisibleQuestions.value.length)
const filteredMissingCount = computed(() => filteredMissingQuestions.value.length)

// 计算提及率
const getMentionRate = (item) => {
  const mentioned = item.platforms.filter(p => p.mentioned).length
  return Math.round((mentioned / item.platforms.length) * 100)
}

// 计算位置得分
const getPositionScore = (item) => {
  const scores = item.platforms.filter(p => p.mentioned).map(p => p.semanticRelevance ? 70 : 40)
  return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
}

// 计算情感得分
const getSentimentScore = (item) => {
  const sentiments = item.platforms.filter(p => p.mentioned).map(p => {
    if (p.sentiment === 'positive') return 100
    if (p.sentiment === 'neutral') return 50
    return 20
  })
  return sentiments.length > 0 ? Math.round(sentiments.reduce((a, b) => a + b, 0) / sentiments.length) : 50
}

// 获取情感标签
const getSentimentLabel = (item) => {
  const sentiments = item.platforms.filter(p => p.mentioned).map(p => p.sentiment)
  if (sentiments.length === 0) return '未知'
  const positive = sentiments.filter(s => s === 'positive').length
  if (positive > sentiments.length / 2) return '正面'
  const negative = sentiments.filter(s => s === 'negative').length
  if (negative > sentiments.length / 2) return '负面'
  return '中性'
}

// 获取情感颜色
const getSentimentColor = (item) => {
  const label = getSentimentLabel(item)
  if (label === '正面') return '#67c23a'
  if (label === '负面') return '#f56c6c'
  return '#909399'
}

// 获取得分样式类
const getScoreClass = (score) => {
  if (score >= 80) return 'score-high'
  if (score >= 60) return 'score-mid'
  return 'score-low'
}

const questions = ref([])
const selectedQuestions = ref([])
const questionFilter = ref('')
const selectAllCurrent = ref(false)
const newKeyword = ref('')
const keywords = ref([])
const selectedKeywords = ref([])
const customKeywords = ref([])

const isCustom = (kw) => customKeywords.value.includes(kw)

const removeCustomKeyword = (kw) => {
  customKeywords.value = customKeywords.value.filter(k => k !== kw)
  keywords.value = keywords.value.filter(k => k !== kw)
  selectedKeywords.value = selectedKeywords.value.filter(k => k !== kw)
  saveCustomKeywords()
}

const saveCustomKeywords = async () => {
  // 保存到本地
  try {
    const raw = localStorage.getItem('auyologic_data')
    const allData = raw ? JSON.parse(raw) : {}
    allData['geo-custom-keywords'] = customKeywords.value
    localStorage.setItem('auyologic_data', JSON.stringify(allData))
  } catch {}

  // 同时保存到后端数据库
  const userId = 'default_user'
  const lastKw = customKeywords.value[customKeywords.value.length - 1]
  if (lastKw) {
    try {
      await fetch(`${window.VITE_API_URL || window.location.origin}/api/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ keyword: lastKw, type: '品牌', source: 'geo手动添加' })
      })
    } catch (e) {
      console.warn('保存关键词到后端失败:', e)
    }
  }
}

const filteredQuestions = computed(() => {
  if (!questionFilter.value) return questions.value
  return questions.value.filter(q => q.category === questionFilter.value)
})

// 是否有待审核的问题（用于提醒用户先去 Questions 页面审核）
const hasPendingQuestions = computed(() => {
  return questions.value.some(q => q.status === '待审核')
})

const isQuestionSelected = (id) => {
  return selectedQuestions.value.some(q => q.id === id)
}

const toggleQuestion = (q) => {
  const idx = selectedQuestions.value.findIndex(x => x.id === q.id)
  if (idx === -1) {
    if (selectedQuestions.value.length < 50) selectedQuestions.value.push(q)
  } else {
    selectedQuestions.value.splice(idx, 1)
  }
}

const removeQuestion = (id) => {
  const idx = selectedQuestions.value.findIndex(x => x.id === id)
  if (idx !== -1) selectedQuestions.value.splice(idx, 1)
}

const clearAllQuestions = () => {
  selectedQuestions.value = []
}

const handleSelectAllQuestions = (val) => {
  if (val) {
    filteredQuestions.value.forEach(q => {
      if (!isQuestionSelected(q.id) && selectedQuestions.value.length < 50) {
        selectedQuestions.value.push(q)
      }
    })
  } else {
    filteredQuestions.value.forEach(q => removeQuestion(q.id))
  }
}

const selectAllKeywords = () => {
  selectedKeywords.value = [...keywords.value]
}

const clearAllKeywords = () => {
  selectedKeywords.value = []
}

const isKeywordSelected = (kw) => {
  return selectedKeywords.value.includes(kw)
}

const toggleKeyword = (kw) => {
  const idx = selectedKeywords.value.indexOf(kw)
  if (idx === -1) {
    selectedKeywords.value.push(kw)
  } else {
    selectedKeywords.value.splice(idx, 1)
  }
}

const addKeyword = () => {
  if (newKeyword.value && !keywords.value.includes(newKeyword.value)) {
    keywords.value.push(newKeyword.value)
    customKeywords.value.push(newKeyword.value)
    selectedKeywords.value.push(newKeyword.value)
    newKeyword.value = ''
    saveCustomKeywords()
  }
}

const platforms = ref([
  { id: 'kimi',     name: 'Kimi',       icon: 'K',  color: '#06B6D4', desc: '月之暗面AI助手' },
  { id: 'doubao',   name: '豆包',      icon: '豆', color: '#EA580C', desc: '字节跳动AI助手' },
  { id: 'yuanbao',  name: '腾讯元宝',   icon: '元', color: '#0EA5E9', desc: '腾讯AI助手' },
  { id: 'tongyi',   name: '通义千问',   icon: '通', color: '#8B5CF6', desc: '阿里AI助手' },
  { id: 'yiyan',    name: '文心一言',   icon: '文', color: '#EF4444', desc: '百度AI助手' },
  { id: 'deepseek', name: 'DeepSeek',  icon: 'D',  color: '#4F46E5', desc: '深度求索AI' },
  { id: 'zhipu',    name: '智谱清言',   icon: '智', color: '#10B981', desc: '智谱AI助手' },
  { id: 'spark',    name: '讯飞星火',   icon: '讯', color: '#F59E0B', desc: '科大讯飞AI助手' },
])

const selectedPlatforms = ref([])

const isPlatformSelected = (id) => {
  return selectedPlatforms.value.some(p => p.id === id)
}

const togglePlatform = (p) => {
  const idx = selectedPlatforms.value.findIndex(x => x.id === p.id)
  if (idx === -1) {
    selectedPlatforms.value.push(p)
  } else {
    selectedPlatforms.value.splice(idx, 1)
  }
}

const loadingVisible = ref(false)
const completedCount = ref(0)
const totalCount = ref(0)
const currentTask = ref('')
const detectionResults = ref([])
const overallScore = ref(0)
const overallGrade = ref('')
const rawAnswerDialogVisible = ref(false)
const currentRawAnswer = ref('')

const detectionPlatforms = computed(() => selectedPlatforms.value)
const visibleQuestions = computed(() => detectionResults.value.filter(r => r.platforms.some(p => p.mentioned)))
const missingQuestions = computed(() => detectionResults.value.filter(r => !r.platforms.some(p => p.mentioned)))
const visibleCount = computed(() => visibleQuestions.value.length)
const missingCount = computed(() => missingQuestions.value.length)

const overallGradeClass = computed(() => {
  if (overallScore.value >= 80) return 'grade-green'
  if (overallScore.value >= 60) return 'grade-yellow'
  return 'grade-red'
})

const nextStep = () => {
  if (currentStep.value < 3) currentStep.value++
}

const prevStep = () => {
  if (currentStep.value > 0) currentStep.value--
}

const progressPercent = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((completedCount.value / totalCount.value) * 100)
})

/**
 * 开始执行可见度检测（真实API调用版本）
 */
const startDetection = async () => {
  // 检查是否选择了关键词
  if (selectedKeywords.value.length === 0) {
    ElMessage.warning('请先选择至少一个命中关键词')
    return
  }
  
  totalCount.value = selectedQuestions.value.length * selectedPlatforms.value.length
  completedCount.value = 0
  loadingVisible.value = true
  currentTask.value = '初始化检测环境...'
  
  // 存储所有检测结果
  const allDetectionResults = []
  let hasError = false
  let errorMessage = ''
  
  // 遍历每个问题-平台组合
  for (let qIdx = 0; qIdx < selectedQuestions.value.length; qIdx++) {
    const q = selectedQuestions.value[qIdx]
    
    for (let pIdx = 0; pIdx < selectedPlatforms.value.length; pIdx++) {
      const p = selectedPlatforms.value[pIdx]
      currentTask.value = '检测中：' + q.text.slice(0, 18) + '... 在 ' + p.name
      
      try {
        // 调用 DeepSeek API 进行真实检测
        const keywords = selectedKeywords.value
        const detection = await detectWithDeepSeek(q.text, keywords, p.id)
        
        allDetectionResults.push({
          questionId: qIdx + 1,
          question: q.text,
          category: q.category,
          sourceKeyword: keywords.join(', '),
          platform: p,
          detection: detection,
          score: calculateScore(detection, q.category, keywords[0] || '')
        })
      } catch (error) {
        console.error(`检测失败: ${q.text} @ ${p.name}`, error)
        // 单平台失败不影响整体，使用默认结果
        allDetectionResults.push({
          questionId: qIdx + 1,
          question: q.text,
          category: q.category,
          sourceKeyword: q.sourceKeyword,
          platform: p,
          detection: {
            mentioned: false,
            mentionType: 'none',
            firstMentionPosition: 1.0,
            positionRank: 'below_fold',
            sentiment: 'neutral',
            semanticRelevance: 0,
            competitivePosition: null,
            competitorsMentioned: []
          },
          score: 0,
          error: true
        })
        hasError = true
        errorMessage = `部分检测失败: ${error.message}`
      }
      
      completedCount.value++
    }
  }
  
  // 处理完成
  loadingVisible.value = false
  if (hasError) {
    ElMessage.warning({ message: errorMessage || '部分检测结果可能不准确', offset: 80 })
  } else {
    ElMessage.success({ message: '检测完成', offset: 80 })
  }
  
  // 构建结果
  buildResultsFromAPI(allDetectionResults)
  currentStep.value = 3
}

/**
 * 从API结果构建展示数据
 * @param {Array} apiResults - API检测结果
 */
const buildResultsFromAPI = (apiResults) => {
  // 按问题分组
  const groupedByQuestion = {}
  
  apiResults.forEach(result => {
    const qKey = result.question
    if (!groupedByQuestion[qKey]) {
      groupedByQuestion[qKey] = {
        questionId: result.questionId,
        question: result.question,
        category: result.category,
        sourceKeyword: result.sourceKeyword,
        platforms: [],
        scores: []
      }
    }
    
    // 添加平台检测结果
    groupedByQuestion[qKey].platforms.push({
      name: result.platform.name,
      icon: result.platform.icon,
      mentioned: result.detection.mentioned,
      mentionType: result.detection.mentionType,
      sentiment: result.detection.sentiment,
      semanticRelevance: result.detection.semanticRelevance,
      competitivePosition: result.detection.competitivePosition,
      competitorsMentioned: result.detection.competitorsMentioned,
      rawAnswer: result.detection.rawAnswer || null,
      error: result.error || false
    })
    
    // 记录得分
    if (!result.error) {
      groupedByQuestion[qKey].scores.push(result.score)
    }
  })
  
  // 转换为数组
  const results = Object.values(groupedByQuestion).map(gq => ({
    ...gq,
    avgScore: gq.scores.length > 0 
      ? Math.round(gq.scores.reduce((a, b) => a + b, 0) / gq.scores.length)
      : 0
  }))
  
  detectionResults.value = results
  
  // 计算整体得分
  const allScores = results.flatMap(r => r.platforms.map(p => {
    // 根据是否提及计算基础得分
    if (p.mentioned) return 70  // 提及但没有详细分数时给70分
    return 0
  }))
  
  const totalMentions = results.reduce((sum, r) => sum + r.platforms.filter(p => p.mentioned).length, 0)
  const totalSlots = results.length * selectedPlatforms.value.length
  overallScore.value = totalSlots > 0 ? Math.round((totalMentions / totalSlots) * 100) : 0
  
  if (overallScore.value >= 80) overallGrade.value = 'A'
  else if (overallScore.value >= 60) overallGrade.value = 'B'
  else if (overallScore.value >= 40) overallGrade.value = 'C'
  else overallGrade.value = 'D'

  // 保存到历史记录
  saveHistory({
    id: Date.now(),
    checkedAt: new Date().toISOString(),
    overallScore: overallScore.value,
    overallGrade: overallGrade.value,
    visibleCount: visibleQuestions.value.length,
    missingCount: missingQuestions.value.length,
    platformCount: selectedPlatforms.value.length,
    questionCount: results.length,
    platformNames: selectedPlatforms.value.map(p => p.name),
    results: results
  })

  // 同步到 storage 供 Dashboard 读取（本地保留）
  const allData = {}
  try {
    const raw = localStorage.getItem('auyologic_data')
    if (raw) Object.assign(allData, JSON.parse(raw))
  } catch {}
  allData['geo-detection-result'] = {
    overallScore: overallScore.value,
    overallGrade: overallGrade.value,
    visibleCount: visibleQuestions.value.length,
    missingCount: missingQuestions.value.length,
    platformCount: selectedPlatforms.value.length,
    checkedAt: new Date().toISOString()
  }
  localStorage.setItem('auyologic_data', JSON.stringify(allData))
}



const handleGenerateContent = (question) => {
  router.push({ path: '/content-create', query: { topic: question } })
}

const openRawAnswer = (rawAnswer) => {
  currentRawAnswer.value = rawAnswer || '暂无原文内容'
  rawAnswerDialogVisible.value = true
}

/**
 * 生成详细报告 - 跳转到Dashboard展示
 */
const handleGenerateReport = () => {
  // 保存完整报告数据到storage
  const allData = JSON.parse(localStorage.getItem('auyologic_data') || '{}')
  allData['geo-full-report'] = {
    overallScore: overallScore.value,
    overallGrade: overallGrade.value,
    visibleCount: visibleQuestions.value.length,
    missingCount: missingQuestions.value.length,
    platformCount: selectedPlatforms.value.length,
    categoryCounts: categoryCounts.value,
    radarData: radarChartData.value,
    results: detectionResults.value,
    checkedAt: new Date().toISOString()
  }
  localStorage.setItem('auyologic_data', JSON.stringify(allData))

  // 跳转到Dashboard
  router.push('/dashboard')
  ElMessage.success({
    message: '报告已生成，正在跳转到Dashboard',
    offset: 80
  })
}

const handleExportResult = () => {
  const data = {
    exportedAt: new Date().toISOString(),
    questions: selectedQuestions.value,
    platforms: selectedPlatforms.value,
    keywords: selectedKeywords.value,
    results: detectionResults.value,
    overallScore: overallScore.value,
    overallGrade: overallGrade.value
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'GEO检测报告_' + new Date().toISOString().slice(0, 10) + '.json'
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success({ message: '报告已导出', offset: 80 })
}

const getCategoryColor = (cat) => {
  const map = { '品牌': 'primary', '产品': 'success', '场景': 'warning', '企业': 'danger' }
  return map[cat] || 'info'
}

onMounted(async () => {
  // 加载历史记录
  await loadHistory()

  // 检查是否有 historyId 参数
  const historyId = route.query.historyId
  if (historyId) {
    await handleHistoryCardClick(historyId)
  }

  // 从后端 API 加载关键词（优先）
  await loadKeywordsFromAPI()

  // 从后端 API 加载已审核的问题
  await loadQuestionsFromAPI()

  // 补充本地自定义关键词
  try {
    const raw = localStorage.getItem('auyologic_data')
    const stored = raw ? JSON.parse(raw) : {}
    const storedCustomKws = stored['geo-custom-keywords'] || []
    const managedKws = keywords.value
    const validCustomKws = storedCustomKws.filter(kw => !managedKws.includes(kw))
    customKeywords.value = validCustomKws
    keywords.value = [...managedKws, ...validCustomKws]
  } catch {}
})

// 从后端 API 加载关键词
const loadKeywordsFromAPI = async () => {
  const userId = 'default_user'
  try {
    const res = await fetch(`${window.VITE_API_URL || window.location.origin}/api/keywords`, {
      headers: { 'x-user-id': userId }
    })
    if (res.ok) {
      const data = await res.json()
      keywords.value = data.map(k => k.keyword || '').filter(k => k)
    }
  } catch (e) {
    console.warn('从后端加载关键词失败:', e)
    keywords.value = []
  }
}

// 从后端 API 加载问题
const loadQuestionsFromAPI = async () => {
  const userId = 'default_user'
  try {
    const res = await fetch(`${window.VITE_API_URL || window.location.origin}/api/questions`, {
      headers: { 'x-user-id': userId }
    })
    if (res.ok) {
      const data = await res.json()
      const approvedQuestions = data.filter(q => q.status === '已审核')
      questions.value = approvedQuestions.map((q, i) => ({
        id: q.id || i + 1,
        text: q.question || q.text || '',
        category: q.keywordType || q.keyword_type || '场景',
        sourceKeyword: q.sourceKeyword || q.source_keyword || ''
      }))
    }
  } catch (e) {
    console.warn('从后端加载问题失败:', e)
    questions.value = []
  }
}

</script>

<style scoped>
.gd-page{padding:24px 28px;max-width:1100px;margin:0 auto;font-family:'PingFang SC','Microsoft YaHei',sans-serif}
.gd-header{display:flex;align-items:center;gap:14px;margin-bottom:24px}

/* 历史检测记录 */
.gd-history-section{margin-bottom:20px}
.gd-history-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.gd-history-title{font-size:13px;font-weight:600;color:#606266}
.gd-history-more{font-size:12px;color:#409eff;text-decoration:none}
.gd-history-more:hover{text-decoration:underline}
.gd-history-scroll{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}
.gd-history-scroll::-webkit-scrollbar{height:4px}
.gd-history-scroll::-webkit-scrollbar-thumb{background:#e4e7ed;border-radius:2px}
.gd-history-card{position:relative;flex-shrink:0;width:140px;padding:14px;border-radius:12px;border:1px solid #ebeef5;background:#fafbfc;cursor:pointer;transition:all .2s}
.gd-history-card:hover{box-shadow:0 4px 12px rgba(0,0,0,0.1);transform:translateY(-2px)}
.gd-history-card-top{display:flex;align-items:baseline;gap:6px;margin-bottom:6px}
.gd-history-score{font-size:28px;font-weight:900;line-height:1;color:#303133}
.gd-history-grade{font-size:13px;font-weight:800;padding:2px 8px;border-radius:10px}
.gd-history-card.grade-green .gd-history-grade{background:#e1f3d8;color:#67c23a}
.gd-history-card.grade-yellow .gd-history-grade{background:#faecd8;color:#e6a23c}
.gd-history-card.grade-red .gd-history-grade{background:#fde2e2;color:#f56c6c}
.gd-history-date{font-size:11px;color:#909399;margin-bottom:8px}
.gd-history-meta{display:flex;gap:6px;margin-bottom:6px}
.gd-history-stat{font-size:11px;font-weight:600;padding:1px 6px;border-radius:8px}
.gd-history-stat.visible{background:#f0f9eb;color:#67c23a}
.gd-history-stat.missing{background:#fef0f0;color:#f56c6c}
.gd-history-platforms{font-size:10px;color:#c0c4cc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gd-history-new-tag{position:absolute;top:8px;right:8px;background:#ff4d4f;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px}
.gd-header-icon{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#7070f0,#9090f5);display:flex;align-items:center;justify-content:center;color:white;font-size:22px;box-shadow:0 4px 12px rgba(112,112,240,0.3)}
.gd-title{font-size:20px;font-weight:700;color:#1a1a1a;margin:0 0 4px}
.gd-subtitle{font-size:13px;color:#909399;margin:0}

/* 结果页顶部概览 */
.result-overview{display:flex;gap:24px;margin-bottom:20px;padding:20px;background:linear-gradient(135deg,#f8f9fc,#fff);border-radius:14px;border:1px solid #ebeef5}
.overview-left{flex:1;display:flex;flex-direction:column;gap:16px}
.overview-main-score{display:flex;align-items:center;gap:16px;padding:20px;background:white;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06)}
.main-score-num{font-size:48px;font-weight:900;line-height:1}
.main-score-label{font-size:14px;color:#909399}
.main-grade-badge{font-size:16px;font-weight:800;padding:4px 16px;border-radius:20px}
.overview-main-score.grade-green .main-score-num{color:#67c23a}
.overview-main-score.grade-green .main-grade-badge{background:#e1f3d8;color:#67c23a}
.overview-main-score.grade-yellow .main-score-num{color:#e6a23c}
.overview-main-score.grade-yellow .main-grade-badge{background:#faecd8;color:#e6a23c}
.overview-main-score.grade-red .main-score-num{color:#f56c6c}
.overview-main-score.grade-red .main-grade-badge{background:#fde2e2;color:#f56c6c}
.overview-stats{display:flex;gap:12px}
.stat-item{flex:1;padding:14px;background:white;border-radius:10px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.04)}
.stat-num{font-size:26px;font-weight:800;line-height:1}
.stat-label{font-size:12px;color:#909399;margin-top:4px}
.stat-item.success .stat-num{color:#67c23a}
.stat-item.danger .stat-num{color:#f56c6c}
.stat-item.info .stat-num{color:#409eff}

/* 雷达图区域 */
.overview-radar{width:220px;padding:16px;background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.04)}
.radar-title{font-size:13px;font-weight:600;color:#303133;text-align:center;margin-bottom:8px}

/* 工具栏 */
.result-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #ebeef5}

/* 筛选栏 */
.result-filter-bar{margin-bottom:12px}

.result-tabs{display:flex;gap:4px;background:#f5f7fa;border-radius:10px;padding:4px;margin-bottom:16px}
.result-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 16px;background:transparent;border:none;border-radius:7px;font-size:13px;font-weight:500;color:#909399;cursor:pointer;transition:all .2s}
.result-tab.active{background:white;color:#303133;box-shadow:0 1px 4px rgba(0,0,0,0.08)}

.result-list{display:flex;flex-direction:column;gap:12px}
.result-empty{text-align:center;padding:48px 0;color:#909399}
.result-empty p{margin-top:12px;font-size:14px}

/* 改进的结果卡片 */
.result-card{background:#fafbfc;border:1px solid #ebeef5;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:12px;transition:all .2s}
.result-card:hover{box-shadow:0 4px 12px rgba(0,0,0,0.08)}
.result-card.missing{border-left:3px solid #f56c6c;background:#fef9f9}
.result-card.visible{border-left:3px solid #67c23a}

/* 按类型的差异化样式 */
.result-card.cat-brand{border-left-color:#b37feb}
.result-card.cat-product{border-left-color:#52c41a}
.result-card.cat-scene{border-left-color:#fa8c16}
.result-card.cat-enterprise{border-left-color:#f89898}

/* 卡片头部 */
.result-card-header{display:flex;justify-content:space-between;align-items:center}
.cat-tag-brand{background:#f3e8ff;color:#722ed1;border-color:#b37feb}
.cat-tag-product{background:#f6ffed;color:#52c41a;border-color:#95de64}
.cat-tag-scene{background:#fff7e6;color:#fa8c16;border-color:#ffd591}
.cat-tag-enterprise{background:#fef0f0;color:#f56c6c;border-color:#f89898}

/* 得分显示 */
.result-score{display:flex;align-items:baseline;gap:2px;padding:4px 12px;border-radius:20px;background:#f0f9eb}
.result-score .score-num{font-size:20px;font-weight:800}
.result-score .score-label{font-size:12px;color:#909399}
.result-score.score-high{background:#e1f3d8;color:#67c23a}
.result-score.score-mid{background:#faecd8;color:#e6a23c}
.result-score.score-low{background:#fde2e2;color:#f56c6c}
.result-score.missing-score{background:#f5f7fa;color:#909399}

.result-question{font-size:15px;font-weight:600;color:#303133;line-height:1.5}
.result-meta{display:flex;align-items:center;gap:10px}
.result-source{font-size:12px;color:#909399}

/* 得分明细 */
.result-score-detail{display:flex;gap:16px;padding:10px;background:white;border-radius:8px}
.result-score-detail .score-item{flex:1;display:flex;flex-direction:column;gap:4px}
.result-score-detail .score-item-label{font-size:11px;color:#909399}
.result-score-detail .score-item-val{font-size:12px;font-weight:600;text-align:right}

.result-card-platforms{display:flex;flex-wrap:wrap;gap:8px}
.platform-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:12px;border:1px solid #e4e7ed;background:white}
.platform-badge.mentioned{border-color:#67c23a;background:#f0f9eb;color:#67c23a}
.platform-badge.not-mentioned{color:#c0c4cc}
.platform-badge-icon{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;font-size:11px;font-weight:600;color:white}
.platform-badge-name{font-size:12px}
.result-card-action{display:flex;justify-content:flex-end}

.missing-header{background:#fef0f0;border:1px solid #fde2e2;border-radius:10px;padding:12px 16px;margin-bottom:4px}
.missing-info{display:flex;align-items:center;gap:8px;font-size:13px;color:#f56c6c}
.gd-overview-grid{display:grid;grid-template-columns:160px 1fr 1fr 1fr;gap:14px;margin-bottom:24px}
.overview-score-card{border-radius:14px;padding:20px;text-align:center;background:#fafbfc;border:1px solid #ebeef5}
.overview-score-card.grade-green{background:linear-gradient(135deg,#f0f9eb,#fff);border-color:#c2e7b0}
.overview-score-card.grade-yellow{background:linear-gradient(135deg,#fdf6ec,#fff);border-color:#f5dab1}
.overview-score-card.grade-red{background:linear-gradient(135deg,#fef0f0,#fff);border-color:#fbc4c4}
.overview-score-num{font-size:36px;font-weight:900;color:#303133;line-height:1}
.overview-score-label{font-size:12px;color:#909399;margin:4px 0}
.overview-grade-badge{display:inline-block;font-size:13px;font-weight:800;padding:2px 12px;border-radius:20px;background:#f0f0f0;color:#606266}
.overview-grade-badge.grade-green{background:#d4edda;color:#155724}
.overview-grade-badge.grade-yellow{background:#fff3cd;color:#856404}
.overview-grade-badge.grade-red{background:#f8d7da;color:#721c24}
.overview-stat-card{border-radius:14px;padding:16px 20px;background:#fafbfc;border:1px solid #ebeef5;text-align:center}
.overview-stat-num{font-size:28px;font-weight:900;line-height:1;margin-bottom:4px}
.overview-stat-label{font-size:13px;font-weight:600;color:#303133;margin-bottom:2px}
.overview-stat-sub{font-size:11px;color:#909399}
.gd-steps-bar{display:flex;align-items:center;justify-content:center;margin-bottom:24px;padding:16px 0}
.gd-step{display:flex;align-items:center;gap:8px}
.gd-step-circle{width:32px;height:32px;border-radius:50%;background:#e4e7ed;color:#909399;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;transition:all .3s}
.gd-step.active .gd-step-circle{background:#409eff;color:white}
.gd-step.done .gd-step-circle{background:#67c23a;color:white}
.gd-step-label{font-size:13px;color:#909399;transition:color .3s}
.gd-step.active .gd-step-label{color:#303133;font-weight:600}
.gd-step.done .gd-step-label{color:#67c23a}
.gd-step-line{width:48px;height:2px;background:#e4e7ed;margin:0 12px}
.gd-content{background:white;border:1px solid #ebeef5;border-radius:16px;overflow:hidden}
.step-panel{padding:28px}
.step-panel-header{margin-bottom:24px}
.step-title{font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:6px}
.step-desc{font-size:13px;color:#909399}
.step-footer{display:flex;justify-content:center;gap:12px;margin-top:28px;padding-top:20px;border-top:1px solid #f0f0f0}
.question-layout{display:grid;grid-template-columns:1fr 340px;gap:20px}
.question-list-panel,.selected-panel,.keyword-panel{background:#fafbfc;border:1px solid #ebeef5;border-radius:12px;padding:16px}
.panel-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.panel-title{font-size:13px;font-weight:600;color:#303133}
.filter-row{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.question-scroll{max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}
.question-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;border:1px solid transparent;cursor:pointer;transition:all .15s}
.question-item:hover{background:#f0f4ff}
.question-item.selected{background:#ecf5ff;border-color:#409eff}
.question-text{flex:1;font-size:13px;color:#303133;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty-hint{text-align:center;color:#c0c4cc;font-size:13px;padding:24px 0}
.question-right{display:flex;flex-direction:column;gap:16px}
.selected-scroll{max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}
.selected-item{display:flex;align-items:center;gap:6px;padding:6px 8px;background:white;border:1px solid #ebeef5;border-radius:6px;font-size:12px}
.remove-icon{color:#c0c4cc;cursor:pointer;flex-shrink:0}
.remove-icon:hover{color:#f56c6c}
.keyword-hint{font-size:12px;color:#909399;margin-bottom:8px}
.keyword-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.keyword-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:12px;cursor:pointer;border:1px solid #e4e7ed;color:#606266;background:white;transition:all .15s}
.keyword-chip:hover{border-color:#409eff;color:#409eff}
.keyword-chip.selected{background:#409eff;border-color:#409eff;color:white}
.check-icon{font-size:10px}
.kw-managed{opacity:.7}
.kw-managed:hover{opacity:1}
.kw-managed-icon{font-size:10px;margin-left:2px;color:#c0c4cc;cursor:default}
.kw-delete-icon{font-size:10px;margin-left:2px;color:#c0c4cc;cursor:pointer}
.kw-delete-icon:hover{color:#f56c6c}
.keyword-count{font-size:11px;color:#909399}
.platform-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.platform-card{background:#fafbfc;border:2px solid #ebeef5;border-radius:12px;padding:16px;text-align:center;cursor:pointer;transition:all .2s;position:relative}
.platform-card:hover{border-color:#c0c4cc}
.platform-card.selected{border-color:#409eff;background:#ecf5ff}
.platform-icon{width:48px;height:48px;margin:0 auto 8px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:white}
.platform-name{font-size:14px;font-weight:600;color:#303133;margin-bottom:4px}
.platform-desc{font-size:11px;color:#909399}
.platform-check{position:absolute;top:8px;right:8px;width:20px;height:20px;border-radius:50%;background:#409eff;color:white;display:flex;align-items:center;justify-content:center}
.confirm-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px}
.confirm-card{background:#fafbfc;border:1px solid #ebeef5;border-radius:10px;padding:14px}
.confirm-card-header{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#303133;margin-bottom:10px}
.confirm-card-body{font-size:12px;color:#606266}
.confirm-line{padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:12px;color:#606266;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.confirm-line:last-child{border-bottom:none}
.confirm-more{color:#409eff;padding:5px 0}
.confirm-summary{background:#ecf5ff;border-radius:10px;padding:14px 20px;margin-top:16px}
.summary-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px}
.summary-label{color:#606266}
.summary-value{font-weight:600;color:#409eff}
.gd-result-panel{padding:24px}
.result-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #ebeef5}
.result-tabs{display:flex;gap:4px;background:#f5f7fa;border-radius:10px;padding:4px;margin-bottom:20px}
.result-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 16px;background:transparent;border:none;border-radius:7px;font-size:13px;font-weight:500;color:#909399;cursor:pointer;transition:all .2s}
.result-tab.active{background:white;color:#303133;box-shadow:0 1px 4px rgba(0,0,0,0.08)}
.result-list{display:flex;flex-direction:column;gap:12px}
.result-empty{text-align:center;padding:48px 0;color:#909399}
.result-empty p{margin-top:12px;font-size:14px}
.result-card{background:#fafbfc;border:1px solid #ebeef5;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:14px}
.result-card.missing{border-left:3px solid #f56c6c;background:#fef9f9}
.result-card.visible{border-left:3px solid #67c23a}
.result-question{font-size:15px;font-weight:600;color:#303133;margin-bottom:8px;line-height:1.5}
.result-meta{display:flex;align-items:center;gap:10px}
.result-source{font-size:12px;color:#909399}
.result-card-platforms{display:flex;flex-wrap:wrap;gap:8px}
.platform-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:12px;border:1px solid #e4e7ed;background:white}
.platform-badge.mentioned{border-color:#67c23a;background:#f0f9eb;color:#67c23a}
.platform-badge.not-mentioned{color:#c0c4cc}
.platform-badge-icon{font-size:13px}
.platform-badge-name{font-size:12px}
.result-card-action{display:flex;justify-content:flex-end}
.missing-header{background:#fef0f0;border:1px solid #fde2e2;border-radius:10px;padding:12px 16px;margin-bottom:4px}
.missing-info{display:flex;align-items:center;gap:8px;font-size:13px;color:#f56c6c}
.detecting-dialog{text-align:center;padding:16px 0}
.detecting-task{font-size:14px;font-weight:500;color:#303133;margin-bottom:8px}
.detecting-count{font-size:13px;color:#909399}
</style>
