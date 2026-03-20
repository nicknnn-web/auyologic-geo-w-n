<template>
  <div class="settings-page">
    <!-- 顶部标题栏 -->
    <div class="settings-header">
      <div class="settings-header-left">
        <div class="settings-breadcrumb">
          <span class="breadcrumb-item">设置</span>
          <el-icon class="breadcrumb-sep"><ArrowRight /></el-icon>
          <span class="breadcrumb-current">企业信息</span>
        </div>
        <h1 class="settings-title">企业信息</h1>
        <p class="settings-subtitle">完善企业基本信息，AI创作时将自动参考这些内容</p>
      </div>
      <div class="settings-header-right">
        <div class="save-indicator" :class="saveState">
          <div class="save-dot" />
          <span>{{ saveStateText }}</span>
        </div>
      </div>
    </div>

    <!-- 表单区域 -->
    <div class="settings-content">
      <div class="settings-layout">

        <!-- 左侧表单 -->
        <div class="settings-main">

          <!-- 基本信息卡片 -->
          <div class="card">
            <div class="card-header">
              <div class="card-header-icon">
                <el-icon><OfficeBuilding /></el-icon>
              </div>
              <div class="card-header-text">
                <h3 class="card-title">基本信息</h3>
                <p class="card-desc">您的企业或品牌核心标识</p>
              </div>
            </div>
            <div class="card-body">
              <div class="form-grid">
                <div class="form-item">
                  <label class="form-label">
                    企业/品牌名称
                    <span class="form-required">*</span>
                  </label>
                  <el-input
                    v-model="form.name"
                    placeholder="输入您的企业或品牌名称"
                    size="large"
                    class="premium-input"
                    @change="triggerAutoSave"
                  />
                </div>
                <div class="form-item">
                  <label class="form-label">企业官网</label>
                  <el-input
                    v-model="form.website"
                    placeholder="www.example.com"
                    size="large"
                    class="premium-input"
                    @change="triggerAutoSave"
                  >
                    <template #prepend>
                      <span class="input-prefix">https://</span>
                    </template>
                  </el-input>
                </div>
                <div class="form-item form-item-full">
                  <label class="form-label">所属行业</label>
                  <el-select
                    v-model="form.industry"
                    placeholder="选择所属行业"
                    size="large"
                    class="premium-select"
                    @change="triggerAutoSave"
                  >
                    <el-option label="科技/互联网" value="科技/互联网" />
                    <el-option label="消费品/零售" value="消费品/零售" />
                    <el-option label="金融/保险" value="金融/保险" />
                    <el-option label="医疗/健康" value="医疗/健康" />
                    <el-option label="教育/培训" value="教育/培训" />
                    <el-option label="制造业" value="制造业" />
                    <el-option label="房地产/建筑" value="房地产/建筑" />
                    <el-option label="传媒/文化" value="传媒/文化" />
                    <el-option label="其他" value="其他" />
                  </el-select>
                </div>
              </div>
            </div>
          </div>

          <!-- 品牌定位卡片 -->
          <div class="card">
            <div class="card-header">
              <div class="card-header-icon icon-purple">
                <el-icon><Aim /></el-icon>
              </div>
              <div class="card-header-text">
                <h3 class="card-title">品牌定位</h3>
                <p class="card-desc">帮助AI更精准地理解您的品牌调性和目标用户</p>
              </div>
            </div>
            <div class="card-body">
              <div class="form-stack">
                <div class="form-item">
                  <label class="form-label">品牌简介</label>
                  <el-input
                    v-model="form.description"
                    type="textarea"
                    :rows="4"
                    placeholder="用一段话描述您的品牌核心价值、产品优势和差异化特点"
                    class="premium-textarea"
                    maxlength="300"
                    show-word-limit
                    @change="triggerAutoSave"
                  />
                  <div class="form-hint">AI创作时会以此为参考，生成更贴合品牌调性的内容</div>
                </div>
                <div class="form-item">
                  <label class="form-label">目标受众</label>
                  <el-input
                    v-model="form.targetAudience"
                    type="textarea"
                    :rows="3"
                    placeholder="描述您的目标用户特征：年龄、职业、需求痛点、消费习惯等"
                    class="premium-textarea"
                    maxlength="200"
                    show-word-limit
                    @change="triggerAutoSave"
                  />
                  <div class="form-hint">越详细的受众描述，AI生成的内容越精准触达目标用户</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 底部操作栏 -->
          <div class="settings-actions">
            <el-button size="large" @click="handleReset">重置</el-button>
            <el-button type="primary" size="large" @click="handleSave" :loading="saving">
              保存全部
            </el-button>
            <el-button
              type="primary"
              size="large"
              class="btn-keywords"
              @click="handleGenerateKeywords"
              :loading="kwGenerating"
              :disabled="!form.name"
            >
              <el-icon class="mr-1"><MagicStick /></el-icon>
              生成行业关键词
            </el-button>
          </div>

          <!-- 关键词生成结果卡片 -->
          <div class="card kw-card" v-if="kwDialogVisible">
            <div class="card-header">
              <div class="card-header-icon icon-green">
                <el-icon><Search /></el-icon>
              </div>
              <div class="card-header-text">
                <h3 class="card-title">生成行业关键词</h3>
                <p class="card-desc">已基于企业信息生成以下关键词，请勾选要添加的词</p>
              </div>
              <div class="kw-dialog-actions">
                <el-button size="small" @click="kwDialogVisible = false">取消</el-button>
                <el-button size="small" type="primary" @click="confirmKeywords" :disabled="selectedKwCount === 0">
                  确认添加 ({{ selectedKwCount }})
                </el-button>
              </div>
            </div>
            <div class="card-body">
              <!-- 加载动画 -->
              <div v-if="kwGenerating" class="kw-loading">
                <el-icon class="spinner" :size="28"><Loading /></el-icon>
                <span>正在从 Bing 搜索行业关键词...</span>
              </div>
              <!-- 关键词分组 -->
              <div v-else class="kw-groups">
                <div v-for="group in kwGroups" :key="group.type" class="kw-group">
                  <div class="kw-group-header">
                    <span class="kw-group-name">{{ group.type }}</span>
                    <el-checkbox
                      :model-value="group.selectedCount > 0 && group.selectedCount === group.items.length"
                      :indeterminate="group.selectedCount > 0 && group.selectedCount < group.items.length"
                      @change="val => toggleGroup(group, val)"
                    >全选</el-checkbox>
                  </div>
                  <div class="kw-chips">
                    <div
                      v-for="kw in group.items"
                      :key="kw.text"
                      class="kw-chip"
                      :class="{ selected: kw.selected }"
                      @click="kw.selected = !kw.selected"
                    >
                      <el-icon v-if="kw.selected" class="kw-check"><Check /></el-icon>
                      {{ kw.text }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧预览 -->
        <div class="settings-sidebar">
          <div class="sidebar-card">
            <div class="sidebar-card-header">
              <el-icon class="sidebar-icon"><View /></el-icon>
              <span>实时预览</span>
            </div>
            <div class="preview-card" :class="{ 'preview-empty': !hasData }">
              <template v-if="hasData">
                <div class="preview-brand-mark">
                  <div class="preview-avatar">{{ brandInitial }}</div>
                  <div class="preview-brand-name">{{ form.name }}</div>
                  <div class="preview-badge" v-if="form.industry">{{ form.industry }}</div>
                </div>
                <div class="preview-divider" />
                <div class="preview-fields">
                  <div class="preview-field" v-if="form.website">
                    <span class="preview-field-label">官网</span>
                    <span class="preview-field-value preview-link">{{ form.website }}</span>
                  </div>
                  <div class="preview-field" v-if="form.description">
                    <span class="preview-field-label">简介</span>
                    <span class="preview-field-value">{{ form.description }}</span>
                  </div>
                  <div class="preview-field" v-if="form.targetAudience">
                    <span class="preview-field-label">受众</span>
                    <span class="preview-field-value">{{ form.targetAudience }}</span>
                  </div>
                </div>
              </template>
              <div class="preview-empty-state" v-else>
                <el-icon class="preview-empty-icon"><Edit /></el-icon>
                <p>填写左侧表单<br>实时预览效果</p>
              </div>
            </div>
          </div>

          <!-- 数据状态 -->
          <div class="sidebar-card mt-4">
            <div class="sidebar-card-header">
              <el-icon class="sidebar-icon"><CircleCheck /></el-icon>
              <span>数据状态</span>
            </div>
            <div class="status-list">
              <div class="status-item">
                <span class="status-label">保存状态</span>
                <el-tag :type="lastSaved ? 'success' : 'info'" size="small" round>
                  {{ lastSaved ? '已保存' : '未保存' }}
                </el-tag>
              </div>
              <div class="status-item">
                <span class="status-label">信息完整度</span>
                <div class="completeness">
                  <el-progress :percentage="completeness" :show-text="false" :stroke-width="4" />
                  <span class="completeness-text">{{ completeness }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { OfficeBuilding, Aim, View, Edit, CircleCheck, ArrowRight, MagicStick, Search, Check, Close, Loading } from '@element-plus/icons-vue'
import { getData, saveData, addItem } from '../utils/storage'

const form = ref({
  name: '',
  website: '',
  industry: '',
  description: '',
  targetAudience: ''
})

const saving = ref(false)
const lastSaved = ref(null)
let autoSaveTimer = null

// 关键词生成
const kwGenerating = ref(false)
const kwDialogVisible = ref(false)
const kwGroups = ref([])

const loadData = () => {
  const allData = getData()
  if (allData['enterprise-settings']) {
    form.value = { ...form.value, ...allData['enterprise-settings'] }
    if (form.value.website && form.value.website.startsWith('https://')) {
      form.value.website = form.value.website.replace('https://', '')
    }
  }
  if (allData['enterprise-settings']?.lastSaved) {
    lastSaved.value = new Date(allData['enterprise-settings'].lastSaved)
  }
}

loadData()

const triggerAutoSave = () => {
  clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    const allData = getData()
    allData['enterprise-settings'] = { ...form.value, lastSaved: new Date().toISOString() }
    saveData(allData)
    lastSaved.value = new Date()
  }, 800)
}

const handleSave = async () => {
  saving.value = true
  await new Promise(r => setTimeout(r, 400))
  const allData = getData()
  allData['enterprise-settings'] = { ...form.value, lastSaved: new Date().toISOString() }
  saveData(allData)
  lastSaved.value = new Date()
  saving.value = false
  ElMessage.success({ message: '企业信息已保存', offset: 80 })
}

const handleReset = () => {
  form.value = {
    name: '',
    website: '',
    industry: '',
    description: '',
    targetAudience: ''
  }
  triggerAutoSave()
}

// 关键词生成算法
const buildKeywordGroups = (f) => {
  const desc = f.description || ''
  const name = f.name || ''

  // 从描述中提取中文词（2-4字）
  const extractWords = (text) => {
    const matches = text.match(/[\u4e00-\u9fa5]{2,4}/g) || []
    return [...new Set(matches)]
  }

  const descWords = extractWords(desc)
  const coreWords = descWords.length > 0 ? descWords : [name]

  // 词根模板
  const brandRoots = ['品牌', '哪个好', '推荐', '排行榜', '十大品牌', '口碑']
  const productRoots = ['评测', '怎么样', '功能', '对比', '区别', '参数']
  const scenarioRoots = ['适用人群', '使用场景', '能解决', '痛点', '多少钱', '价格']

  const makeGroup = (roots, type) => ({
    type,
    items: roots.flatMap(r => coreWords.map(w => ({ text: `${w}${r}`, selected: false }))),
    get selectedCount() { return this.items.filter(i => i.selected).length }
  })

  return [
    makeGroup(brandRoots, '品牌'),
    makeGroup(productRoots, '产品'),
    makeGroup(scenarioRoots, '场景')
  ]
}

const handleGenerateKeywords = async () => {
  if (!form.value.name) {
    ElMessage.warning('请先填写企业名称')
    return
  }
  kwGenerating.value = true
  kwDialogVisible.value = true
  kwGroups.value = []

  // 模拟 Bing 搜索延迟
  await new Promise(r => setTimeout(r, 1800))

  kwGroups.value = buildKeywordGroups(form.value)
  kwGenerating.value = false
}

const toggleGroup = (group, val) => {
  group.items.forEach(i => { i.selected = val })
}

const selectedKwCount = computed(() => {
  return kwGroups.value.reduce((sum, g) => sum + g.selectedCount, 0)
})

const confirmKeywords = () => {
  const selected = kwGroups.value.flatMap(g => g.items.filter(i => i.selected))
  let count = 0
  selected.forEach(kw => {
    const group = kwGroups.value.find(g => g.items.includes(kw))
    addItem('keywords', {
      keyword: kw.text,
      type: group ? group.type : '品牌',
      createdAt: new Date().toLocaleString()
    })
    count++
  })
  kwDialogVisible.value = false
  ElMessage.success({ message: `已添加 ${count} 个关键词到关键词管理页面`, offset: 80 })
}

const hasData = computed(() => {
  return form.value.name || form.value.website || form.value.industry ||
    form.value.description || form.value.targetAudience
})

const brandInitial = computed(() => {
  return form.value.name ? form.value.name.slice(0, 1).toUpperCase() : '?'
})

const completeness = computed(() => {
  const fields = ['name', 'website', 'industry', 'description', 'targetAudience']
  const filled = fields.filter(f => form.value[f]).length
  return Math.round((filled / fields.length) * 100)
})

const saveState = computed(() => {
  if (saving.value) return 'saving'
  return lastSaved.value ? 'saved' : 'unsaved'
})

const saveStateText = computed(() => {
  if (saving.value) return '保存中...'
  if (!lastSaved.value) return '未保存'
  const diff = Math.round((Date.now() - lastSaved.value) / 1000)
  if (diff < 10) return '已保存'
  if (diff < 60) return `${diff}秒前保存`
  return `${Math.round(diff / 60)}分钟前保存`
})
</script>

<style scoped>
/* ===== 页面基础 ===== */
.settings-page {
  min-height: calc(100vh - 86px);
  background: #f5f6f8;
}

.settings-header {
  background: white;
  border-bottom: 1px solid #ebeef5;
  padding: 28px 32px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.settings-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #909399;
  margin-bottom: 10px;
}

.breadcrumb-item {
  color: #909399;
}

.breadcrumb-current {
  color: #303133;
  font-weight: 500;
}

.breadcrumb-sep {
  font-size: 12px;
  color: #c0c4cc;
}

.settings-title {
  font-size: 22px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 6px 0;
  line-height: 1.2;
}

.settings-subtitle {
  font-size: 14px;
  color: #909399;
  margin: 0;
}

.save-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid transparent;
  transition: all 0.3s;
}

.save-indicator.unsaved {
  color: #909399;
  background: #f5f7fa;
  border-color: #ebeef5;
}

.save-indicator.saving {
  color: #e6a23c;
  background: #fdf6ec;
  border-color: #f5dab1;
}

.save-indicator.saved {
  color: #67c23a;
  background: #f0f9eb;
  border-color: #c2e7b0;
}

.save-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.save-indicator.saving .save-dot {
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ===== 布局 ===== */
.settings-content {
  padding: 28px 32px;
}

.settings-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  align-items: start;
}

.settings-main {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ===== 卡片 ===== */
.card {
  background: white;
  border-radius: 14px;
  border: 1px solid #ebeef5;
  overflow: hidden;
  transition: box-shadow 0.2s;
}

.card:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  border-bottom: 1px solid #f0f2f5;
  background: #fafbfc;
}

.card-header-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, #409eff, #3a8bff);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 18px;
  flex-shrink: 0;
}

.card-header-icon.icon-purple {
  background: linear-gradient(135deg, #7070f0, #9090f5);
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 3px 0;
}

.card-desc {
  font-size: 13px;
  color: #909399;
  margin: 0;
}

.card-body {
  padding: 24px;
}

/* ===== 表单 ===== */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-item-full {
  grid-column: 1 / -1;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 8px;
}

.form-required {
  color: #f56c6c;
  margin-left: 2px;
}

.form-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 6px;
  line-height: 1.5;
}

/* Premium Input Styles */
:deep(.premium-input .el-input__wrapper),
:deep(.premium-textarea .el-textarea__inner) {
  border-radius: 8px;
  border: 1.5px solid #e4e7ed;
  box-shadow: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  font-size: 14px;
}

:deep(.premium-input .el-input__wrapper:hover),
:deep(.premium-textarea .el-textarea__inner:hover) {
  border-color: #c0c4cc;
}

:deep(.premium-input .el-input__wrapper.is-focus),
:deep(.premium-textarea .el-textarea__inner:focus) {
  border-color: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.1);
}

:deep(.premium-select .el-select__wrapper) {
  border-radius: 8px;
  border: 1.5px solid #e4e7ed;
  box-shadow: none;
  min-height: 40px;
  font-size: 14px;
}

:deep(.premium-select .el-select__wrapper:hover) {
  border-color: #c0c4cc;
}

:deep(.premium-select .el-select__wrapper.is-focused) {
  border-color: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.1);
}

.input-prefix {
  font-size: 13px;
  color: #909399;
}

/* ===== 底部操作 ===== */
.settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 4px 0;
}

:deep(.el-button--large) {
  height: 40px;
  border-radius: 8px;
  font-size: 14px;
  padding: 0 24px;
}

:deep(.el-button--primary) {
  background: linear-gradient(135deg, #409eff, #3a8bff);
  border: none;
}

:deep(.el-button--primary:hover) {
  background: linear-gradient(135deg, #66b1ff, #3a8bff);
}

/* ===== 右侧侧边栏 ===== */
.settings-sidebar {
  position: sticky;
  top: 24px;
}

.sidebar-card {
  background: white;
  border-radius: 14px;
  border: 1px solid #ebeef5;
  overflow: hidden;
}

.sidebar-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  background: #fafbfc;
  border-bottom: 1px solid #f0f2f5;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

.sidebar-icon {
  color: #409eff;
  font-size: 14px;
}

.preview-card {
  padding: 20px;
  min-height: 160px;
}

.preview-card.preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-empty-state {
  text-align: center;
  color: #c0c4cc;
  font-size: 13px;
  line-height: 1.6;
}

.preview-empty-icon {
  font-size: 28px;
  margin-bottom: 8px;
  color: #dcdfe6;
}

.preview-brand-mark {
  text-align: center;
  margin-bottom: 16px;
}

.preview-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #409eff 0%, #667eea 100%);
  color: white;
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 10px;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);
}

.preview-brand-name {
  font-size: 15px;
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 6px;
}

.preview-badge {
  display: inline-block;
  font-size: 12px;
  color: #7070f0;
  background: #f0f0ff;
  padding: 2px 10px;
  border-radius: 10px;
}

.preview-divider {
  height: 1px;
  background: #f0f0f0;
  margin: 16px 0;
}

.preview-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-field-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #909399;
  display: block;
  margin-bottom: 3px;
}

.preview-field-value {
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
  word-break: break-all;
}

.preview-link {
  color: #409eff;
}

/* ===== 关键词生成卡片 ===== */
.kw-card {
  border-left: 3px solid #67c23a;
}

.card-header-icon.icon-green {
  background: linear-gradient(135deg, #67c23a, #85ce61);
}

.card-header-icon.icon-purple {
  background: linear-gradient(135deg, #7070f0, #9090f5);
}

.kw-dialog-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  align-items: center;
}

.kw-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;
  color: #909399;
  font-size: 14px;
}

.spinner {
  animation: spin 1s linear infinite;
  color: #67c23a;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.kw-groups {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.kw-group {}

.kw-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.kw-group-name {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.kw-group-name::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 12px;
  background: #409eff;
  border-radius: 2px;
  margin-right: 6px;
  vertical-align: middle;
}

.kw-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.kw-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  border: 1.5px solid #e4e7ed;
  color: #606266;
  background: white;
  transition: all 0.15s;
  user-select: none;
}

.kw-chip:hover {
  border-color: #67c23a;
  color: #67c23a;
}

.kw-chip.selected {
  background: #67c23a;
  border-color: #67c23a;
  color: white;
}

.kw-check {
  font-size: 12px;
}

/* ===== 关键词生成按钮 ===== */
:deep(.btn-keywords) {
  background: linear-gradient(135deg, #67c23a, #85ce61) !important;
  border: none !important;
}

:deep(.btn-keywords:hover) {
  background: linear-gradient(135deg, #85ce61, #67c23a) !important;
}

:deep(.btn-keywords.is-disabled) {
  background: #e4e7ed !important;
  color: #c0c4cc !important;
}

/* ===== 数据状态 ===== */
.status-list {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.status-label {
  font-size: 13px;
  color: #606266;
}

.completeness {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  margin-left: 12px;
}

:deep(.completeness .el-progress__text) {
  display: none;
}

.completeness-text {
  font-size: 12px;
  color: #909399;
  width: 30px;
  text-align: right;
}
</style>
