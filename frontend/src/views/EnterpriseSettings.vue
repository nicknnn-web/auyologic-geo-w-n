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
        <p class="settings-subtitle">完善您的企业基本信息，AI创作时将自动参考这些内容</p>
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
              <!-- 加载动画 - Step 1: 搜索企业属性 -->
              <div v-if="kwSearching" class="kw-loading">
                <el-icon class="spinner" :size="28"><Loading /></el-icon>
                <span>{{ kwSearchingText }}</span>
              </div>
              <!-- 加载动画 - Step 2: 生成关键词 -->
              <div v-else-if="kwGenerating" class="kw-loading">
                <el-icon class="spinner" :size="28"><Loading /></el-icon>
                <span>正在基于行业分析生成关键词...</span>
              </div>
              <!-- 关键词分组 -->
              <div v-else class="kw-groups">
                <div v-for="group in kwGroups" :key="group.typeKey" class="kw-group">
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
                      :key="group.typeKey + '-' + kw.text"
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
import { getToken, getCurrentUserId } from '../utils/auth.js'
import { callAiGenerate } from '../utils/api.js'
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { OfficeBuilding, Aim, View, Edit, CircleCheck, ArrowRight, MagicStick, Search, Check, Close, Loading } from '@element-plus/icons-vue'
import { buildCoreKeywordsPrompt } from '../prompts/index.js'
import { normalizeKeywordTypeKey, KEYWORD_TYPE_DEFAULT_OPTIONS } from '../utils/sysDict.js'
import { useSysDictList } from '../composables/useSysDictList.js'


const API_BASE_URL = window.VITE_API_URL || window.location.origin

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
const kwSearching = ref(false)
const kwSearchingText = ref('')
const kwDialogVisible = ref(false)
const kwGroups = ref([])
const { rows: keywordTypeDictRows } = useSysDictList('keyword_type')

/** 与关键词管理、拓展问题一致：来自 sys_dict keyword_type */
const keywordTypeRows = computed(() => {
  const mapped = keywordTypeDictRows.value.map((r) => ({
    dataKey: r.dataKey ?? r.data_key,
    dataValue: r.dataValue ?? r.data_value ?? r.dataKey,
    sortOrder: r.sortOrder ?? r.sort_order ?? 0,
  }))
  return mapped.length ? mapped : [...KEYWORD_TYPE_DEFAULT_OPTIONS]
})

const getUserId = () => getCurrentUserId()

const loadData = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/settings`, {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    })
    if (res.ok) {
      const data = await res.json()
      form.value = {
        name: data.company_name || '',
        website: (data.website || '').replace('https://', ''),
        industry: data.industry || '',
        description: data.description || '',
        targetAudience: data.target_audience || ''
      }
    }
  } catch {
    console.warn('加载企业设置失败')
  }
}

onMounted(async () => {
  await loadData()
})

const triggerAutoSave = () => {
  clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify({
          company_name: form.value.name,
          website: form.value.website,
          industry: form.value.industry,
          description: form.value.description,
          target_audience: form.value.targetAudience
        })
      })
      lastSaved.value = new Date()
    } catch { /* silent */ }
  }, 800)
}

const handleSave = async () => {
  saving.value = true
  try {
    await fetch(`${API_BASE_URL}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({
        company_name: form.value.name,
        website: form.value.website,
        industry: form.value.industry,
        description: form.value.description,
        target_audience: form.value.targetAudience
      })
    })
    lastSaved.value = new Date()
    ElMessage.success({ message: '企业信息已保存', offset: 80 })
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
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

// 停用词表 - 过滤无意义的词汇
const STOP_WORDS = new Set([
  '有限公司', '股份有限公司', '科技有限公司', '集团有限公司',
  '公司', '企业', '集团', '品牌', '产品', '服务', '我们', '提供',
  '专业', '优质', '领先', '卓越', '高端', '信赖', '选择', '推荐',
  '采用', '运用', '基于', '通过', '为了', '关于', '可以', '能够',
  '以及', '并且', '同时', '并且', '或者', '还是', '但是', '然而',
  '什么', '这个', '那个', '这些', '那些', '一些', '某个', '各种',
  '非常', '特别', '十分', '比较', '相当', '更加', '最', '更', '很',
  '的', '了', '是', '在', '有', '和', '与', '或', '等', '为', '以',
  '及', '其', '所', '被', '将', '已', '曾', '正在', '要', '会', '能',
  '可能', '应该', '需要', '希望', '想要', '觉得', '认为', '知道',
  '了解', '发现', '找到', '使用', '进行', '完成', '实现', '建立',
  '包括', '包含', '拥有', '具有', '具备', '属于', '位于', '处于',
  '根据', '按照', '通过', '经过', '随着', '关于', '对于', '由于',
  '因此', '所以', '如果', '虽然', '但是', '而且', '并且', '或者',
  '还是', '不但', '而且', '既', '又', '也', '还', '仅', '只', '才',
  '就', '便', '则', '却', '并', '且', '或', '并', '且'
])

/** 过滤从正文硬切出的碎片词、半句话（如「合唱团是」「上海中高」） */
const isValidKeywordCandidate = (raw) => {
  const s = String(raw || '').trim()
  if (s.length < 2 || s.length > 24) return false
  if (STOP_WORDS.has(s)) return false
  const coreChars = (s.match(/[\u4e00-\u9fa5a-zA-Z0-9]/g) || []).length
  if (coreChars < Math.min(s.length, 4) * 0.55) return false
  if (/[的是了的在与被将及吗呢吧啊嘛]$/.test(s)) return false
  if (/^(的是在了有和与为以被将该此其某这那之一及几第每很最更)/.test(s)) return false
  if (/中高$|初小$|年级$/.test(s) && s.length <= 6) return false
  if (s.endsWith('是') && s.length <= 5) return false
  if (/(.)\1{3,}/.test(s)) return false
  if (/^[啊呀哦嗯哼诶]+$/.test(s)) return false
  return true
}

const sanitizeKeywords = (arr) => {
  const out = []
  const seen = new Set()
  for (const x of arr || []) {
    const w = String(x || '').trim()
    if (!isValidKeywordCandidate(w)) continue
    if (seen.has(w)) continue
    seen.add(w)
    out.push(w)
  }
  return out
}

/** 按标点切句后取短语，避免全文中滑动 2–4 字窗口产生垃圾词 */
const extractPhrasesFromDescription = (text) => {
  if (!text) return []
  const parts = text.split(/[,，。;；\n、]+/).map((p) => p.trim()).filter(Boolean)
  const out = []
  for (const seg of parts) {
    let t = seg.replace(/^[\d\s\-—–·.、（）()\[\]【】"'「」]+|[\s\-—–·.、（）()\[\]【】"'」]+$/g, '').trim()
    if (t.length < 2 || t.length > 14) continue
    if (t.length > 10) t = t.slice(0, 10)
    if (isValidKeywordCandidate(t)) out.push(t)
  }
  return [...new Set(out)]
}

// 构建对比/竞品检索词（字典 对比词）
const buildContrastKeywords = (name, industry, categoryWords) => {
  const keywords = new Set()
  if (name && name.length >= 2 && name.length <= 10) {
    keywords.add(`${name}对比`)
    keywords.add(`${name}和竞品`)
    keywords.add(`${name}哪家好`)
    keywords.add(`${name}选哪家`)
    ;['哪个好', '区别', '平替', '替代品', '同行对比', '二选一'].forEach((t) => {
      keywords.add(`${name}${t}`)
    })
  }
  if (categoryWords && categoryWords[0] && categoryWords[0].length >= 2) {
    const c = categoryWords[0]
    keywords.add(`${c}哪个好`)
    keywords.add(`${c}对比`)
  }
  if (industry && industry.length >= 2 && industry.length <= 8) {
    keywords.add(`${industry}公司排名`)
  }
  return [...keywords]
}

// 构建价格/预算类检索词（字典 价格词）
const buildPriceKeywords = (name, industry, categoryWords) => {
  const keywords = new Set([
    '性价比', '报价', '收费标准', '多少钱', '价位', '预算', '价格', '年费', '月费', '优惠信息', '折扣', '平价', '高端款',
  ])
  if (name && name.length >= 2 && name.length <= 10) {
    keywords.add(`${name}价格`)
    keywords.add(`${name}多少钱`)
    keywords.add(`${name}收费标准`)
  }
  if (categoryWords && categoryWords[0] && categoryWords[0].length >= 2) {
    keywords.add(`${categoryWords[0]}价格`)
    keywords.add(`${categoryWords[0]}报价`)
  }
  if (industry && industry.length >= 2 && industry.length <= 8) {
    keywords.add(`${industry}报价`)
  }
  return [...keywords]
}

// 行业关键词词库 - 根据行业生成相关词汇
const INDUSTRY_KEYWORDS = {
  '科技/互联网': {
    // 产品决策词根
    productDecision: ['功能', '性能', '评测', '对比', '区别', '哪个好', '怎么样', '参数', '配置', '价格', '报价', '收费', '免费', '试用'],
    // 场景需求词根  
    scenario: ['解决方案', '数字化转型', '企业服务', 'SaaS', '上云', '效率提升', '降低成本', '智能化', '自动化', '系统集成', 'GEO', 'SEO', '搜索优化', '搜索引擎优化', '谷歌优化', '海外营销', '跨境营销'],
    // 品类词
    category: ['软件', '系统', '平台', '工具', '解决方案', '服务', '应用', 'APP', '小程序', '网站', 'SEO', 'GEO', '独立站']
  },
  '消费品/零售': {
    productDecision: ['怎么样', '好不好', '推荐', '评测', '价格', '优惠', '折扣', '性价比', '质量', '真假', '区别', '哪个好'],
    scenario: ['自用', '送礼', '家用', '送礼佳品', '必备', '日常', '节日', '周年庆', '促销', '爆款', '新品'],
    category: ['产品', '商品', '好物', '礼物', '潮品', '爆款', '新品', '热销', '推荐']
  },
  '金融/保险': {
    productDecision: ['收益', '利率', '回报', '风险', '安全', '靠谱吗', '怎么样', '对比', '评测', '理财', '保险', '贷款'],
    scenario: ['理财', '投资', '资产配置', '财富管理', '风险管理', '保障', '养老', '教育金', '医疗保障', '家庭保障'],
    category: ['理财', '保险', '基金', '债券', '贷款', '信用卡', '金融', '投资', '财富']
  },
  '医疗/健康': {
    productDecision: ['效果', '安全吗', '有用吗', '怎么样', '有用么', '评测', '价格', '费用', '医保', '报销', '副作用'],
    scenario: ['养生', '保健', '康复', '治疗', '预防', '调理', '亚健康', '健康管理', '体检', '就医'],
    category: ['药品', '保健品', '医疗器械', '服务', '健康', '养生', '医疗', '护理', '康复']
  },
  '教育/培训': {
    productDecision: ['怎么样', '好吗', '效果', '学费', '价格', '师资', '课程', '培训', '就业', '升学', '考证'],
    scenario: ['学习', '培训', '提升', '考证', '升学', '就业', '技能', '职场', '考研', '留学', '少儿', 'K12'],
    category: ['课程', '培训', '教育', '学校', '机构', '老师', '学习', '辅导', '课程']
  },
  '制造业': {
    productDecision: ['参数', '规格', '型号', '工艺', '材质', '质量', '价格', '报价', '对比', '哪个好', '评测'],
    scenario: ['生产', '加工', '定制', '批发', '采购', '供应链', 'OEM', 'ODM', '代工', '产能'],
    category: ['产品', '设备', '机械', '零件', '配件', '原材料', '制品', '货品', '商品']
  },
  '房地产/建筑': {
    productDecision: ['价格', '户型', '面积', '地段', '配套', '物业', '开发商', '容积率', '绿化率', '怎么样', '好不好'],
    scenario: ['居住', '投资', '刚需', '改善', '置换', '租房', '买房', '装修', '建材', '家具'],
    category: ['房产', '楼盘', '住宅', '商铺', '写字楼', '公寓', '别墅', '新房', '二手房']
  },
  '传媒/文化': {
    productDecision: ['怎么样', '好吗', '内容', '质量', '创意', '策划', '报价', '价格', '案例', '服务', '效果'],
    scenario: ['品牌推广', '营销', '宣传', '活动', '策划', '执行', '运营', '传播', '引流', '获客'],
    category: ['内容', '媒体', '营销', '策划', '创意', '广告', '公关', '活动', '运营']
  },
  '其他': {
    productDecision: ['怎么样', '好吗', '推荐', '评测', '价格', '服务', '质量', '对比', '区别', '哪个好'],
    scenario: ['需求', '痛点', '问题', '解决', '方案', '服务', '体验', '使用', '选择'],
    category: ['服务', '产品', '方案', '解决', '体验']
  }
}

// 构建品牌核心词（关键词：品牌名 + 品类核心词 + 品牌相关词）
// 侧重：用户搜索品牌时用的词
const buildBrandKeywords = (name, industry, categoryWords, coreBusinessWords = [], searchKeywords = []) => {
  const keywords = new Set()
  
  // 1. 品牌名本身就是核心词（2-6字）
  if (name && name.length >= 2) {
    keywords.add(name)
    if (name.length > 2) {
      keywords.add(name.slice(0, Math.min(4, name.length)))
    }
  }
  
  // 2. 品类核心词（只取前3个，避免太泛）
  if (categoryWords && categoryWords.length > 0) {
    categoryWords.slice(0, 3).forEach(cat => {
      if (cat.length >= 2 && cat.length <= 6) {
        keywords.add(cat)
      }
    })
  }
  
  // 3. 核心业务词（只取前3个）
  if (coreBusinessWords && coreBusinessWords.length > 0) {
    coreBusinessWords.slice(0, 3).forEach(w => {
      if (w.length >= 2 && w.length <= 6) {
        keywords.add(w)
      }
    })
  }
  
  // 4. 搜索关键词（只取前2个）
  if (searchKeywords && searchKeywords.length > 0) {
    searchKeywords.slice(0, 2).forEach(kw => {
      if (kw.length >= 2 && kw.length <= 6) {
        keywords.add(kw)
      }
    })
  }
  
  return [...keywords]
}

// 构建场景需求词（关键词：使用场景 + 痛点问题 + 需求词）
// 侧重：用户描述使用场景/问题时的搜索词（不再使用全文 2–4 字滑动窗口，避免碎片词）
const buildScenarioKeywords = (name, industry, scenarioWords, extractedPhrases = [], coreBusinessWords = [], searchKeywords = []) => {
  const keywords = new Set()
  
  // 1. 场景词（取前5个，差异化核心）
  if (scenarioWords && scenarioWords.length > 0) {
    scenarioWords.slice(0, 5).forEach(sw => {
      if (sw.length >= 2 && sw.length <= 6) {
        keywords.add(sw)
      }
    })
  }
  
  // 2. 从简介按标点切出的短语（已过滤）
  if (extractedPhrases && extractedPhrases.length > 0) {
    extractedPhrases.slice(0, 5).forEach((w) => {
      if (w.length >= 2 && w.length <= 10) {
        keywords.add(w)
      }
    })
  }
  
  // 3. 核心业务词（取前2个，补充场景相关）
  if (coreBusinessWords && coreBusinessWords.length > 0) {
    coreBusinessWords.slice(0, 2).forEach(w => {
      if (w.length >= 2 && w.length <= 6) {
        keywords.add(w)
      }
    })
  }
  
  // 4. 搜索关键词（取前2个）
  if (searchKeywords && searchKeywords.length > 0) {
    searchKeywords.slice(0, 2).forEach(kw => {
      if (kw.length >= 2 && kw.length <= 6) {
        keywords.add(kw)
      }
    })
  }
  
  return [...keywords]
}

// 构建产品决策词（关键词：决策词 + 对比词 + 评价词）
// 侧重：用户在决策阶段搜索的词
const buildProductDecisionKeywords = (name, industry, productWords, categoryWords, coreBusinessWords = [], searchKeywords = []) => {
  const keywords = new Set()
  
  // 1. 产品决策词（取前5个，这是核心差异化）
  if (productWords && productWords.length > 0) {
    productWords.slice(0, 5).forEach(pw => {
      if (pw.length >= 2 && pw.length <= 6) {
        keywords.add(pw)
      }
    })
  }
  
  // 2. 品类词（取前3个）
  if (categoryWords && categoryWords.length > 0) {
    categoryWords.slice(0, 3).forEach(cat => {
      if (cat.length >= 2 && cat.length <= 6) {
        keywords.add(cat)
      }
    })
  }
  
  // 3. 核心业务词（取前2个）
  if (coreBusinessWords && coreBusinessWords.length > 0) {
    coreBusinessWords.slice(0, 2).forEach(w => {
      if (w.length >= 2 && w.length <= 6) {
        keywords.add(w)
      }
    })
  }
  
  // 4. 搜索关键词（取前2个）
  if (searchKeywords && searchKeywords.length > 0) {
    searchKeywords.slice(0, 2).forEach(kw => {
      if (kw.length >= 2 && kw.length <= 6) {
        keywords.add(kw)
      }
    })
  }
  
  return [...keywords]
}

// 构建企业关键词（针对公司/企业名类型的关键词）
// 侧重：公司口碑、行业评价、实力对比、专业程度
const buildEnterpriseKeywords = (name, industry, searchKeywords = []) => {
  const keywords = new Set()
  
  // 1. 公司名本身可能是搜索词（如"XX科技怎么样"）
  if (name && name.length >= 2) {
    // 不直接添加公司名，让AI生成问题时自然融入
  }
  
  // 2. 行业词（用户会搜索"XX行业哪家好"）
  if (industry && industry.length >= 2) {
    keywords.add(`${industry}公司`)
    keywords.add(`${industry}行业`)
    if (industry.length <= 4) {
      keywords.add(industry)
    }
  }
  
  // 3. 企业口碑相关词
  const repWords = ['口碑', '评价', '怎么样', '靠谱吗', '正规吗', '实力']
  repWords.forEach(w => {
    if (name && name.length >= 2 && name.length <= 6) {
      keywords.add(`${name}${w}`)
    }
  })
  
  // 4. 对比相关词
  if (name && name.length >= 2) {
    keywords.add(`${name}对比`)
    keywords.add(`${name}哪家强`)
  }
  
  // 5. 专业程度词
  const proWords = ['专业', '排名', '排行榜', 'top']
  proWords.forEach(w => {
    if (name && name.length >= 2 && name.length <= 6) {
      keywords.add(`${name}${w}`)
    }
    if (industry && industry.length >= 2) {
      keywords.add(`${industry}${w}`)
    }
  })
  
  return [...keywords].filter(k => k.length >= 2 && k.length <= 10)
}

// 从企业描述中提取核心业务词（包含专业术语如GEO、SEO等）
// 这些词直接来自企业对自己的描述，必须纳入关键词生成范围
const extractCoreBusinessWords = (description) => {
  if (!description) return []
  
  const coreWords = []
  
  // 常见业务词根（包含SEO、GEO等专业术语）
  const businessPatterns = [
    // SEO/GEO相关 - 放在最前面确保优先匹配
    'GEO', 'SEO', '搜索优化', '搜索引擎优化', '谷歌优化', '百度优化', 'Google优化', 'Bing优化',
    // 数字化营销
    '数字化', '数字化营销', '营销', '品牌营销', '内容营销', '社交媒体营销',
    '广告投放', 'SEM', '信息流', '竞价', '投放', '海外营销', '跨境营销',
    // 技术服务
    '软件开发', '小程序', 'APP开发', '网站开发', '系统开发', 'API',
    'SaaS', '云服务', '云计算', 'AI', '人工智能', '大数据', '数据分析',
    // 电商
    '电商', '跨境电商', 'Shopify', '独立站', '亚马逊', '跨境出海',
    // 其他专业术语
    '企业服务', 'B2B', 'B2C', 'SaaS平台', '管理系统', 'CRM', 'ERP',
    '品牌策划', '文案', '创意', '设计', 'VI', 'logo', '视觉设计'
  ]
  
  // 【修复】同时检查原始文本和uppercase版本，确保中英文都能匹配
  const descUpper = description.toUpperCase()
  businessPatterns.forEach(pattern => {
    // 检查原始文本和uppercase版本
    const patternUpper = pattern.toUpperCase()
    if (description.includes(pattern) || descUpper.includes(patternUpper)) {
      coreWords.push(pattern)
    }
  })
  
  // 额外提取2-4字的中文业务词（包含特定关键词根的）
  const chinesePatterns = description.match(/[\u4e00-\u9fa5]{2,4}/g) || []
  const additionalWords = chinesePatterns.filter((w) => isValidKeywordCandidate(w))

  // 【关键修复】如果描述中包含 GEO 或 SEO，强制添加相关词
  if (descUpper.includes('GEO')) {
    coreWords.push('GEO', '谷歌优化', 'Google优化')
  }
  if (descUpper.includes('SEO')) {
    coreWords.push('SEO', '搜索引擎优化', '搜索优化')
  }
  
  return [...new Set([...coreWords, ...additionalWords])]
}

// ===== Step 1: AI分析企业画像（替代Web搜索，解决CORS问题） =====
// 用 AI 代理分析企业描述，提取核心业务词
// 比 Web 搜索更可靠，不受跨域限制
const analyzeEnterpriseProfile = async (name, industry, description) => {
  const prompt = buildCoreKeywordsPrompt({ name, industry, description })

  try {
    const data = await callAiGenerate({
      prompt,
      temperature: 0.3,
      max_tokens: 500,
    })
    const content = data.content || ''

    // 解析关键词（每行一个），并过滤碎片词
    const keywords = sanitizeKeywords(
      content
        .split('\n')
        .map((l) => l.trim().replace(/^[0-9a-zA-Z.。、\-]+/, '').trim())
        .filter((l) => l.length >= 2 && l.length <= 16)
    )

    return keywords.length > 0 ? keywords : null
  } catch (error) {
    console.error('AI分析企业画像失败:', error)
    return null
  }
}

// 关键词生成：按 sys_dict keyword_type 分组（品牌/产品/场景/企业/对比/价格等）
const buildKeywordGroups = (f, searchKeywords = []) => {
  const name = f.name?.trim() || ''
  const industry = f.industry?.trim() || '其他'
  const description = f.description?.trim() || ''

  const skSafe = sanitizeKeywords(searchKeywords || [])
  const extractedPhrases = extractPhrasesFromDescription(description)
  const coreBusinessWords = extractCoreBusinessWords(description)

  const industryData = INDUSTRY_KEYWORDS[industry] || INDUSTRY_KEYWORDS['其他']
  const productDecisionWords = industryData.productDecision || []
  const scenarioWords = industryData.scenario || []
  const categoryWords = industryData.category || []

  const rows = [...(keywordTypeRows.value?.length ? keywordTypeRows.value : KEYWORD_TYPE_DEFAULT_OPTIONS)].sort(
    (a, b) => (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0)
  )

  const makeGroup = (keywords, typeKey, typeLabel) => {
    const list = sanitizeKeywords(keywords).slice(0, 15)
    if (!list.length) return null
    const tk = normalizeKeywordTypeKey(typeKey) || String(typeKey)
    return {
      typeKey: tk,
      type: typeLabel || tk,
      items: list.map((kw) => ({ text: kw, selected: false })),
      get selectedCount() {
        return this.items.filter((i) => i.selected).length
      },
    }
  }

  const groups = []
  for (const row of rows) {
    const rawKey = row.dataKey ?? row.data_key
    const tk = normalizeKeywordTypeKey(rawKey) || String(rawKey)
    const label = String(row.dataValue ?? row.data_value ?? rawKey ?? tk)

    let kws = []
    switch (tk) {
      case '01':
        kws = buildBrandKeywords(name, industry, categoryWords, coreBusinessWords, skSafe)
        break
      case '02':
        kws = buildProductDecisionKeywords(
          name,
          industry,
          productDecisionWords,
          categoryWords,
          coreBusinessWords,
          skSafe
        )
        break
      case '03':
        kws = buildScenarioKeywords(name, industry, scenarioWords, extractedPhrases, coreBusinessWords, skSafe)
        break
      case '04':
        kws = buildContrastKeywords(name, industry, categoryWords)
        break
      case '05':
        kws = buildPriceKeywords(name, industry, categoryWords)
        break
      default:
        kws = buildProductDecisionKeywords(
          name,
          industry,
          productDecisionWords,
          categoryWords,
          coreBusinessWords,
          skSafe
        )
    }
    const g = makeGroup(kws, tk, label)
    if (g) groups.push(g)
  }

  return groups
}

const handleGenerateKeywords = async () => {
  // 强制读取 localStorage 作为兜底（表单值优先）
  let savedData = {}
  try {
    const raw = localStorage.getItem('auyologic_data')
    if (raw) savedData = (JSON.parse(raw))['enterprise-settings'] || {}
  } catch {}

  // 优先使用表单中的最新值，如果为空则使用 localStorage 中的值
  const name = form.value.name || savedData.name || ''
  const industry = form.value.industry || savedData.industry || ''
  const description = form.value.description || savedData.description || ''
  
  if (!name) {
    ElMessage.warning('请先填写企业名称')
    return
  }
  if (!description) {
    ElMessage.warning('请先在"品牌简介"填写企业描述，再点击生成关键词')
    return
  }
  
  // 【修复】调试日志：确认 description 包含 GEO/SEO
  console.log('🔍 [关键词生成] 品牌简介内容:', description)
  console.log('🔍 [关键词生成] 是否包含GEO:', description.toUpperCase().includes('GEO'))
  console.log('🔍 [关键词生成] 是否包含SEO:', description.toUpperCase().includes('SEO'))
  
  kwGenerating.value = true
  kwSearching.value = true
  kwSearchingText.value = '🔍 正在分析企业属性（预计5-10秒）...'
  kwDialogVisible.value = true
  kwGroups.value = []

  // ===== Step 1: AI分析企业画像（替代Web搜索，解决CORS问题） =====
  let searchKeywords = []
  
  try {
    searchKeywords = await analyzeEnterpriseProfile(
      name,
      industry,
      description
    )
    if (searchKeywords && searchKeywords.length > 0) {
      console.log('🔍 AI识别到企业业务关键词:', searchKeywords)
      kwSearchingText.value = `✅ 已识别企业业务：${searchKeywords.slice(0, 5).join('、')}...`
    } else {
      kwSearchingText.value = '⚠️ 未能深度识别，将基于表单描述生成'
    }
  } catch (error) {
    console.error('AI分析失败:', error)
    kwSearchingText.value = '⚠️ AI分析失败，将基于表单描述生成'
    searchKeywords = []
  }

  // ===== Step 2: 基于业务画像生成关键词 =====
  await new Promise(r => setTimeout(r, 500))
  
  // 【修复】构建关键词组时使用同步后的数据
  const formData = { name, industry, description, targetAudience: form.value.targetAudience || savedData.targetAudience || '' }
  kwSearching.value = false
  kwGroups.value = buildKeywordGroups(formData, searchKeywords)
  
  // 【修复】调试日志：输出最终生成的关键词
  console.log('🔍 [关键词生成] 最终关键词组:', JSON.stringify(kwGroups.value))
  kwGenerating.value = false
}

const toggleGroup = (group, val) => {
  group.items.forEach(i => { i.selected = val })
}

const selectedKwCount = computed(() => {
  return kwGroups.value.reduce((sum, g) => sum + g.selectedCount, 0)
})

const confirmKeywords = async () => {
  const selected = kwGroups.value.flatMap(g => g.items.filter(i => i.selected))
  // 去重：按关键词文本去重，保留第一个选中的类别
  const seen = new Set()
  const uniqueSelected = []
  selected.forEach(kw => {
    if (!seen.has(kw.text)) {
      seen.add(kw.text)
      uniqueSelected.push(kw)
    }
  })
  
  let count = 0

  for (const kw of uniqueSelected) {
    const group = kwGroups.value.find((g) => g.items.includes(kw))
    const keywordType = group?.typeKey ? normalizeKeywordTypeKey(group.typeKey) || group.typeKey : '02'

    // 同时写入后端 API 和 localStorage
    try {
      const res = await fetch(`${API_BASE_URL}/api/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify({ keyword: kw.text, type: keywordType })
      })
      if (res.ok) {
        count++
      } else {
        throw new Error('API failed')
      }
    } catch {
      // 静默失败，避免中断批量添加流程
    }
  }
  
  kwDialogVisible.value = false
  const duplicateCount = selected.length - uniqueSelected.length
  if (duplicateCount > 0) {
    ElMessage.success({ message: `已添加 ${count} 个关键词（去重 ${duplicateCount} 个重复项）`, offset: 80 })
  } else {
    ElMessage.success({ message: `已添加 ${count} 个关键词到关键词管理页面`, offset: 80 })
  }
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
