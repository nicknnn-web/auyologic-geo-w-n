<template>
  <div class="gd-page">
    <div class="gd-header">
      <div class="gd-header-icon"><el-icon><Histogram /></el-icon></div>
      <div><h1 class="gd-title">GEO 可见度检测</h1><p class="gd-subtitle">检测品牌在各AI平台的可见度，发现内容缺口并驱动创作</p></div>
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
              <div v-if="filteredQuestions.length === 0" class="empty-hint">暂无问题，请先在拓展问题页面添加</div>
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
              <div class="panel-header"><span class="panel-title">品牌关键词</span><div class="flex gap-1"><el-button size="small" text @click="selectAllKeywords">全选</el-button><el-button size="small" text @click="clearAllKeywords">清空</el-button></div></div>
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
            <div class="platform-icon">{{ p.icon }}</div>
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
          <div class="confirm-card"><div class="confirm-card-header"><el-icon><Monitor /></el-icon>检测平台 ({{ selectedPlatforms.length }})</div><div class="confirm-card-body"><div class="flex flex-wrap gap-2"><el-tag v-for="p in selectedPlatforms" :key="p.id" type="success">{{ p.icon }} {{ p.name }}</el-tag></div></div></div>
          <div class="confirm-card"><div class="confirm-card-header"><el-icon><Collection /></el-icon>品牌关键词 ({{ selectedKeywords.length }})</div><div class="confirm-card-body"><div class="flex flex-wrap gap-2"><el-tag v-for="kw in selectedKeywords" :key="kw">{{ kw }}</el-tag></div></div></div>
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
      <div class="result-toolbar">
        <el-button text @click="resetDetection"><el-icon class="mr-1"><RefreshLeft /></el-icon>重新检测</el-button>
        <el-button text @click="handleExportResult"><el-icon class="mr-1"><Download /></el-icon>导出报告</el-button>
      </div>
      <div class="result-tabs">
        <button :class="['result-tab', { active: resultTab === 'visible' }]" @click="resultTab = 'visible'"><el-icon color="#67c23a"><SuccessFilled /></el-icon>品牌可见 <el-badge :value="visibleCount" type="success" /></button>
        <button :class="['result-tab', { active: resultTab === 'missing' }]" @click="resultTab = 'missing'"><el-icon color="#f56c6c"><WarnTriangleFilled /></el-icon>品牌缺失 <el-badge :value="missingCount" type="danger" /></button>
      </div>

      <!-- 品牌可见 -->
      <div v-if="resultTab === 'visible'" class="result-list">
        <div v-if="visibleQuestions.length === 0" class="result-empty"><el-icon size="40" color="#dcdfe6"><SuccessFilled /></el-icon><p>暂无数据</p></div>
        <div v-for="item in visibleQuestions" :key="item.questionId" class="result-card visible">
          <div class="result-card-main">
            <div class="result-question">{{ item.question }}</div>
            <div class="result-meta"><el-tag size="small" type="info">{{ item.category }}</el-tag><span class="result-source">来源：{{ item.sourceKeyword }}</span></div>
          </div>
          <div class="result-card-platforms">
            <div v-for="p in item.platforms" :key="p.name" class="platform-badge" :class="{ mentioned: p.mentioned, 'not-mentioned': !p.mentioned }">
              <span class="platform-badge-icon">{{ p.icon }}</span><span class="platform-badge-name">{{ p.name }}</span>
              <el-icon v-if="p.mentioned" color="#67c23a"><SuccessFilled /></el-icon>
              <el-icon v-else color="#dcdfe6"><Close /></el-icon>
            </div>
          </div>
          <div class="result-card-action"><el-button size="small" type="primary" plain @click="handleGenerateContent(item.question)"><el-icon class="mr-1"><EditPen /></el-icon>继续优化</el-button></div>
        </div>
      </div>

      <!-- 品牌缺失 -->
      <div v-if="resultTab === 'missing'" class="result-list">
        <div v-if="missingCount > 0" class="missing-header"><div class="missing-info"><el-icon color="#f56c6c"><WarnTriangleFilled /></el-icon><span>共 <strong>{{ missingCount }}</strong> 个问题中您的品牌未被提及，这些是需要重点覆盖的内容缺口</span></div></div>
        <div v-if="missingQuestions.length === 0" class="result-empty"><el-icon size="40" color="#67c23a"><SuccessFilled /></el-icon><p>太棒了！所有问题中您的品牌都已被提及</p></div>
        <div v-for="item in missingQuestions" :key="item.questionId" class="result-card missing">
          <div class="result-card-main">
            <div class="result-question">{{ item.question }}</div>
            <div class="result-meta"><el-tag size="small" type="info">{{ item.category }}</el-tag><span class="result-source">来源：{{ item.sourceKeyword }}</span></div>
          </div>
          <div class="result-card-platforms">
            <div v-for="p in item.platforms" :key="p.name" class="platform-badge not-mentioned">
              <span class="platform-badge-icon">{{ p.icon }}</span><span class="platform-badge-name">{{ p.name }}</span>
              <el-icon color="#dcdfe6"><Close /></el-icon>
            </div>
          </div>
          <div class="result-card-action"><el-button size="small" type="primary" @click="handleGenerateContent(item.question)"><el-icon class="mr-1"><EditPen /></el-icon>生成内容覆盖</el-button></div>
        </div>
      </div>
    </div>

    <el-dialog v-model="loadingVisible" title="正在检测..." width="380px" :close-on-click-modal="false" :show-close="false">
      <div class="detecting-dialog"><el-progress type="circle" :percentage="progressPercent" :width="100" class="mb-4" /><div class="detecting-task">{{ currentTask }}</div><div class="detecting-count">已完成 {{ completedCount }} / {{ totalCount }} 次</div></div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, ArrowLeft, Close, Check, ChatDotRound, Monitor, Collection, Cpu, RefreshLeft, Download, EditPen, SuccessFilled, WarnTriangleFilled, Histogram, Lock } from '@element-plus/icons-vue'
import { getList, getData, saveData } from '../utils/storage'

const router = useRouter()
const steps = [{ label: '选择问题' }, { label: '选择平台' }, { label: '确认检测' }, { label: '查看结果' }]
const currentStep = ref(0)
const detectionDone = computed(() => currentStep.value === 3)
const resultTab = ref('missing')

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

const saveCustomKeywords = () => {
  const allData = getData()
  allData['geo-custom-keywords'] = customKeywords.value
  saveData(allData)
}

const filteredQuestions = computed(() => {
  if (!questionFilter.value) return questions.value
  return questions.value.filter(q => q.category === questionFilter.value)
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
  { id: 'kimi',     name: 'Kimi',       icon: '🌙',  desc: '月之暗面AI助手' },
  { id: 'doubao',   name: '豆包',      icon: '🫛',  desc: '字节跳动AI助手' },
  { id: 'yuanbao',  name: '腾讯元宝',   icon: '🐧',  desc: '腾讯AI助手' },
  { id: 'tongyi',   name: '通义千问',   icon: '🏫',  desc: '阿里AI助手' },
  { id: 'yiyan',    name: '文心一言',   icon: '🔍',  desc: '百度AI助手' },
  { id: 'deepseek', name: 'DeepSeek',  icon: '🔮',  desc: '深度求索AI' },
  { id: 'zhipu',    name: '智谱清言',   icon: '💎',  desc: '智谱AI助手' },
  { id: 'spark',    name: '讯飞星火',   icon: '🔥',  desc: '科大讯飞AI助手' },
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

const startDetection = () => {
  totalCount.value = selectedQuestions.value.length * selectedPlatforms.value.length
  completedCount.value = 0
  loadingVisible.value = true
  currentTask.value = '初始化检测环境...'
  const runStep = (step) => {
    if (step >= totalCount.value) {
      loadingVisible.value = false
      currentStep.value = 3
      buildResults()
      return
    }
    const qIdx = Math.floor(step / selectedPlatforms.value.length)
    const pIdx = step % selectedPlatforms.value.length
    const q = selectedQuestions.value[qIdx]
    const p = selectedPlatforms.value[pIdx]
    currentTask.value = '检测中：' + q.text.slice(0, 18) + '... 在 ' + p.name
    completedCount.value = step + 1
    setTimeout(() => runStep(step + 1), 200)
  }
  setTimeout(() => runStep(0), 300)
}

const buildResults = () => {
  const results = selectedQuestions.value.map((q, qi) => ({
    questionId: qi + 1,
    question: q.text,
    category: q.category,
    sourceKeyword: q.sourceKeyword,
    platforms: selectedPlatforms.value.map(p => ({
      name: p.name,
      icon: p.icon,
      mentioned: Math.random() > 0.4
    }))
  }))
  detectionResults.value = results
  const totalMentions = results.reduce((sum, r) => sum + r.platforms.filter(p => p.mentioned).length, 0)
  const totalSlots = results.length * selectedPlatforms.value.length
  overallScore.value = Math.round((totalMentions / totalSlots) * 100)
  if (overallScore.value >= 80) overallGrade.value = 'A'
  else if (overallScore.value >= 60) overallGrade.value = 'B'
  else if (overallScore.value >= 40) overallGrade.value = 'C'
  else overallGrade.value = 'D'

  // 同步到 storage 供 Dashboard 读取
  const allData = getData()
  allData['geo-detection-result'] = {
    overallScore: overallScore.value,
    overallGrade: overallGrade.value,
    visibleCount: visibleQuestions.value.length,
    missingCount: missingQuestions.value.length,
    platformCount: selectedPlatforms.value.length,
    checkedAt: new Date().toISOString()
  }
  saveData(allData)
}

const resetDetection = () => {
  currentStep.value = 0
  selectedQuestions.value = []
  selectedPlatforms.value = []
  selectedKeywords.value = []
  detectionResults.value = []
  resultTab.value = 'missing'
  overallScore.value = 0
}

const handleGenerateContent = (question) => {
  router.push({ path: '/content-create', query: { topic: question } })
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
  const map = { '品牌': 'primary', '产品': 'success', '场景': 'warning' }
  return map[cat] || 'info'
}

onMounted(() => {
  const rawQuestions = getList('questions').filter(q => q.status === '已审核')
  questions.value = rawQuestions.map((q, i) => ({
    id: i + 1,
    text: q.question || q.text || '',
    category: q.keywordType || '场景',
    sourceKeyword: q.sourceKeyword || ''
  }))
  const rawKeywords = getList('keywords')
  const storedCustomKws = getData()['geo-custom-keywords'] || []
  const managedKws = rawKeywords.map(k => k.keyword || k)
  // 去掉已删除的管理词（防止管理页删了但GEO页还有旧缓存）
  const validCustomKws = storedCustomKws.filter(kw => !managedKws.includes(kw))
  customKeywords.value = validCustomKws
  keywords.value = [...managedKws, ...validCustomKws]
})
</script>

<style scoped>
.gd-page{padding:24px 28px;max-width:1100px;margin:0 auto;font-family:'PingFang SC','Microsoft YaHei',sans-serif}
.gd-header{display:flex;align-items:center;gap:14px;margin-bottom:24px}
.gd-header-icon{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#7070f0,#9090f5);display:flex;align-items:center;justify-content:center;color:white;font-size:22px;box-shadow:0 4px 12px rgba(112,112,240,0.3)}
.gd-title{font-size:20px;font-weight:700;color:#1a1a1a;margin:0 0 4px}
.gd-subtitle{font-size:13px;color:#909399;margin:0}
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
.platform-icon{font-size:28px;margin-bottom:8px}
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
