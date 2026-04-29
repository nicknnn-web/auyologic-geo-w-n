<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex items-center mb-4">
      <div>
        <div class="text-lg font-bold">拓展问题</div>
        <div class="text-sm text-gray-500">AI扩展的检测问题列表（共 {{ total }} 条，已审核 {{ approvedTotal }} 条）</div>
      </div>
      <div class="flex items-center filter-actions gap-4 ml-auto">
        <el-select
          v-model="filterKeywordType"
          placeholder="全部类型"
          class="w-28"
          clearable
          :disabled="mutationLoading"
          @change="onFilterChange"
        >
          <el-option label="全部类型" value="" />
          <el-option
            v-for="d in keywordTypeOptions"
            :key="d.dataKey"
            :label="d.dataValue"
            :value="d.dataKey"
          />
        </el-select>
        <el-select
          v-model="filterStatus"
          placeholder="全部状态"
          class="w-28"
          clearable
          :disabled="mutationLoading"
          @change="onFilterChange"
        >
          <el-option label="全部状态" value="" />
          <el-option label="待审核" value="待审核" />
          <el-option label="已审核" value="已审核" />
          <el-option label="已拒绝" value="已拒绝" />
        </el-select>
        <el-button
          type="danger"
          class="ml-0"
          :disabled="selectedRows.length === 0 || isLoading || mutationLoading || listLoading"
          :loading="mutationLoading"
          @click="handleBatchDelete"
        >
          批量删除 ({{ selectedRows.length }})
        </el-button>
        <el-button
          type="info"
          plain
          class="ml-2"
          @click="handleClearAll"
          :disabled="total === 0 || isLoading || mutationLoading || listLoading"
          :loading="mutationLoading"
        >
          <el-icon class="mr-1"><Delete /></el-icon>
          清空全部
        </el-button>
        <el-button
          type="warning"
          class="ml-0"
          :disabled="mutationLoading"
          @click="openGeoDialog"
        >
          <el-icon class="mr-1"><Promotion /></el-icon>
          GEO问题生成
        </el-button>
<!--        <el-button-->
<!--          type="success"-->
<!--          class="ml-0"-->
<!--          @click="handleAIExpand"-->
<!--          :loading="isLoading"-->
<!--          :disabled="isLoading"-->
<!--        >-->
<!--          <el-icon class="mr-1" v-if="!isLoading"><MagicStick /></el-icon>-->
<!--          {{ isSearching ? searchStatusText : (isLoading ? 'AI生成中...' : (selectedRows.length === 1 ? 'AI改写问题' : 'AI拓展问题')) }}-->
<!--        </el-button>-->
        <el-button type="primary" class="ml-0" :disabled="mutationLoading" @click="handleAdd">
          <el-icon class="mr-1"><Plus /></el-icon>
          手动添加
        </el-button>
      </div>
    </div>

    <el-table
      v-loading="listLoading || mutationLoading"
      :element-loading-text="tableLoadingText"
      :data="displayRows"
      style="width: 100%"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="50" />
      <el-table-column label="序号" width="80" align="center">
        <template #default="{ $index }">
          {{ (page - 1) * pageSize + $index + 1 }}
        </template>
      </el-table-column>
      <el-table-column prop="question" label="问题内容" sortable :sort-by="(row) => row.question">
        <template #header>
          <span @click="toggleQuestionSort" style="cursor:pointer;user-select:none;">
            问题内容
            <el-icon v-if="questionSortOrder === 'asc'" style="color:#409eff"><SortUp /></el-icon>
            <el-icon v-else-if="questionSortOrder === 'desc'" style="color:#409eff"><SortDown /></el-icon>
            <el-icon v-else style="color:#c0c4cc"><Rank /></el-icon>
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="keywordType" label="关键词类型" width="120">
        <template #default="{ row }">
          <el-tag :type="getTypeColor(row.keywordType)" @click.stop="cycleKeywordType(row)" style="cursor:pointer">
            {{ keywordTypeLabel(row.keywordType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sourceKeyword" label="来源关键词" width="120">
        <template #default="{ row }">
          {{ row.sourceKeyword || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="status" width="100">
        <template #header>
          <el-tooltip content="只有已审核的问题才会进入检测问题列表" placement="top" :show-after="300">
            <span>状态</span>
          </el-tooltip>
        </template>
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" @click.stop="cycleStatus(row)" style="cursor:pointer">
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ row }">
          <el-popconfirm title="确定删除吗?" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger" size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!listLoading && !mutationLoading && displayRows.length === 0"
      :description="total === 0 ? '暂无问题，请先在蒸馏词页面添加关键词并生成问题' : '没有匹配筛选条件的问题'"
    />

    <AppPaginationBar
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
      :disabled="mutationLoading"
      @change="loadData"
    />

    <el-dialog v-model="dialogVisible" title="手动添加问题" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="问题内容">
          <el-input v-model="form.question" type="textarea" :rows="3" placeholder="请输入问题" />
        </el-form-item>
        <el-form-item label="关键词类型">
          <el-select v-model="form.keywordType" placeholder="请选择类型">
            <el-option
              v-for="d in keywordTypeOptions"
              :key="d.dataKey"
              :label="d.dataValue"
              :value="d.dataKey"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="geoDialogVisible"
      title="GEO问题生成"
      width="520px"
      :close-on-click-modal="false"
      :close-on-press-escape="!geoGenerating"
      :show-close="!geoGenerating"
    >
      <el-form v-loading="geoPrefillLoading" element-loading-text="正在从数据库读取企业信息…" :model="geoForm" label-width="110px">
        <el-form-item label="品牌名称" required>
          <el-input v-model="geoForm.brand" placeholder="请输入品牌名称" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="销售产品" required>
          <el-input
            v-model="geoForm.product"
            type="textarea"
            :rows="3"
            placeholder="默认从数据库读取「品牌简介」，可按需改写成具体产品/服务类型"
            maxlength="300"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="客户群体描述" required>
          <el-input
            v-model="geoForm.targetCustomer"
            type="textarea"
            :rows="3"
            placeholder="请描述目标客户群体（行业/规模/画像等）"
            maxlength="300"
            show-word-limit
          />
        </el-form-item>
        <div v-if="geoGenerating" class="text-xs text-gray-500" style="margin-left:110px;">
          正在调用大模型生成 50 个 GEO 问题，预计 20-40 秒，请耐心等待...
        </div>
      </el-form>
      <template #footer>
        <el-button @click="geoDialogVisible = false" :disabled="geoGenerating">取消</el-button>
        <el-button type="primary" :loading="geoGenerating" :disabled="geoPrefillLoading" @click="submitGeoGenerate">
          {{ geoGenerating ? '生成中...' : '确定' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="geoResultDialogVisible"
      title="GEO问题生成结果"
      width="880px"
      :close-on-click-modal="false"
      top="6vh"
      @closed="onGeoResultDialogClosed"
    >
      <div class="flex items-center mb-2" style="gap:8px;flex-wrap:wrap;">
        <span class="text-sm text-gray-500">
          共 {{ generatedQuestions.length }} 条，按类型分组排序，勾选后点「确定入库」保存到问题库
        </span>
        <span class="ml-auto text-sm" style="color:#409eff;">
          已选 {{ geoSelectedGenerated.length }} / {{ generatedQuestions.length }}
        </span>
      </div>
      <div class="mb-2" style="display:flex;gap:8px;flex-wrap:wrap;">
        <el-button size="small" @click="selectAllGenerated">全选</el-button>
        <el-button size="small" @click="clearSelectedGenerated">清空选择</el-button>
        <el-button
          v-for="grp in generatedGroups"
          :key="grp.typeKey"
          size="small"
          plain
          @click="selectGeoGroup(grp.typeKey)"
        >
          勾选「{{ grp.label }}」（{{ grp.rows.length }}）
        </el-button>
      </div>
      <el-table
        ref="geoResultTableRef"
        :data="generatedQuestions"
        style="width: 100%"
        height="480"
        row-key="id"
        @selection-change="onGeoSelectionChange"
      >
        <el-table-column type="selection" width="50" />
        <el-table-column label="序号" width="70" align="center">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag :type="getTypeColor(row.typeKey)">{{ keywordTypeLabel(row.typeKey) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="question" label="问题内容" />
      </el-table>
      <template #footer>
        <el-button @click="geoResultDialogVisible = false" :disabled="geoSaving">取消</el-button>
        <el-button
          type="primary"
          :loading="geoSaving"
          :disabled="geoSelectedGenerated.length === 0"
          @click="saveGeoSelected"
        >确定入库（{{ geoSelectedGenerated.length }}）</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, MagicStick, SortUp, SortDown, Rank, Delete, Promotion } from '@element-plus/icons-vue'
import {
  fetchDictList,
  normalizeKeywordTypeKey,
  keywordTypeKeysOrdered,
  KEYWORD_TYPE_DEFAULT_OPTIONS
} from '../utils/sysDict.js'
import {
  unwrapListPayload,
  DEFAULT_PAGE_SIZE,
  fetchAllPages,
  reloadPagedListAfterRemoval,
} from '../utils/pagedApi.js'
import AppPaginationBar from '../components/AppPaginationBar.vue'
import { formatZhCnDateTime } from '../utils/dateTime.js'
import { buildBusinessTermsPrompt, buildGeoQuestionPrompt } from '../prompts/index.js'

const route = useRoute()
const router = useRouter()


const API_BASE_URL = window.VITE_API_URL || window.location.origin

const formatDate = (dateStr) => {
  if (!dateStr || dateStr === '{}') return '-'
  return formatZhCnDateTime(dateStr)
}

const tableData = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const listLoading = ref(false)
/** 批量/清空/行删除等写操作，与 loadData 的 listLoading 区分，避免无反馈 */
const mutationLoading = ref(false)
const tableLoadingText = computed(() => (mutationLoading.value ? '正在删除…' : '加载中…'))
const approvedTotal = ref(0)
const questionSortOrder = ref('') // '' | 'asc' | 'desc' — 仅对当前页排序

const onFilterChange = () => {
  page.value = 1
  loadData()
}

const displayRows = computed(() => {
  const data = [...tableData.value]
  if (questionSortOrder.value === 'asc') {
    data.sort((a, b) => String(a.question || '').localeCompare(String(b.question || ''), 'zh-CN'))
  } else if (questionSortOrder.value === 'desc') {
    data.sort((a, b) => String(b.question || '').localeCompare(String(a.question || ''), 'zh-CN'))
  }
  return data
})

const toggleQuestionSort = () => {
  const o = questionSortOrder.value
  questionSortOrder.value = o === '' ? 'asc' : o === 'asc' ? 'desc' : ''
}

const dialogVisible = ref(false)
const form = ref({ question: '', keywordType: '' })
const filterKeywordType = ref('')
const filterStatus = ref('')
const selectedRows = ref([])

const keywordTypeOptions = ref([])
const keywordTypeKeys = computed(() => keywordTypeKeysOrdered(keywordTypeOptions.value))

const KEYWORD_TYPE_FALLBACK_LABEL = {
  '01': '品牌词',
  '02': '产品词',
  '03': '场景词',
  '04': '企业词'
}

const keywordTypeLabel = (raw) => {
  const k = normalizeKeywordTypeKey(raw)
  const row = keywordTypeOptions.value.find((x) => (x.dataKey || x.data_key) === k)
  if (row?.dataValue || row?.data_value) return row.dataValue || row.data_value
  if (KEYWORD_TYPE_FALLBACK_LABEL[k]) return KEYWORD_TYPE_FALLBACK_LABEL[k]
  return raw || '-'
}

const loadKeywordTypeDict = async () => {
  const list = await fetchDictList('keyword_type')
  const mapped = list.map((r) => ({
    dataKey: r.dataKey ?? r.data_key,
    dataValue: r.dataValue ?? r.data_value ?? r.dataKey,
    sortOrder: r.sortOrder ?? r.sort_order ?? 0
  }))
  keywordTypeOptions.value = mapped.length ? mapped : [...KEYWORD_TYPE_DEFAULT_OPTIONS]
}

// 加载数据（服务端分页 + 筛选；已审核总数由接口 approvedTotal 提供）
const loadData = async () => {
  const userId = 'default_user'
  listLoading.value = true
  try {
    const qs = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize.value),
    })
    if (filterKeywordType.value) qs.set('keywordType', filterKeywordType.value)
    if (filterStatus.value) qs.set('status', filterStatus.value)
    const res = await fetch(`${API_BASE_URL}/api/questions?${qs}`, {
      headers: { 'x-user-id': userId },
    })
    if (res.ok) {
      const data = await res.json()
      const { list, total: t, approvedTotal: at } = unwrapListPayload(data)
      tableData.value = list
      total.value = t
      if (at != null) approvedTotal.value = at
    } else {
      tableData.value = []
      total.value = 0
      ElMessage.error('加载问题列表失败')
    }
  } catch {
    tableData.value = []
    total.value = 0
    ElMessage.error('加载问题列表失败，请检查网络')
  } finally {
    listLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadData(), loadKeywordTypeDict()])
  // 检查是否有传递过来的关键词ID（只执行一次，执行后清除参数）
  if (route.query.keywordIds) {
    setTimeout(() => {
      handleAIExpand().then(() => {
        // 生成完成后清除 URL 参数，避免刷新时重复生成
        router.replace({ path: '/questions' })
      })
    }, 500)
  }
})

const getTypeColor = (type) => {
  const k = normalizeKeywordTypeKey(type)
  const map = {
    '01': 'primary',
    '02': 'success',
    '03': 'warning',
    '04': 'danger'
  }
  return map[k] || 'info'
}

const getStatusType = (status) => {
  const map = { '待审核': 'warning', '已审核': 'success', '已拒绝': 'info' }
  return map[status] || 'info'
}

// ===== Step 1: AI分析企业画像（替代Web搜索，解决CORS问题） =====
const AI_PROXY_URL = `${window.VITE_API_URL || window.location.origin}/api/ai/generate`

const analyzeEnterpriseProfileForQuestions = async (name, industry, description) => {
  try {
    const prompt = buildBusinessTermsPrompt({ name, industry, description })

    const response = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        prompt,
        temperature: 0.3,
        max_tokens: 300
      })
    })

    if (!response.ok) return null

    const data = await response.json()
    const content = data.content || ''

    const keywords = content
      .split('\n')
      .map(l => l.trim().replace(/^[0-9a-zA-Z.、]+/, '').trim())
      .filter(l => l.length >= 2 && l.length <= 10)

    return keywords.length > 0 ? keywords : null
  } catch (error) {
    console.error('AI分析企业画像失败:', error)
    return null
  }
}

// 从 storage 读取企业设置
const getEnterpriseSettings = () => {
  try {
    const raw = localStorage.getItem('auyologic_data')
    const allData = raw ? JSON.parse(raw) : {}
    return allData['enterprise-settings'] || {}
  } catch {
    return {}
  }
}

// 从企业描述中提取核心业务词（如SEO、GEO、数字化营销等专业术语）
// 这些词是企业自己描述的核心业务，生成问题时必须纳入考虑
const extractCoreBusinessWordsForQuestions = (description) => {
  if (!description) return []

  const coreWords = []

  // 常见业务词根（包含SEO、GEO等专业术语）
  const businessPatterns = [
    // SEO/GEO相关
    'SEO', 'GEO', '搜索优化', '搜索引擎优化', '谷歌优化', '百度优化',
    // 数字化营销
    '数字化', '数字化营销', '营销', '品牌营销', '内容营销', '社交媒体营销',
    '广告投放', 'SEM', '信息流', '竞价', '投放',
    // 技术服务
    '软件开发', '小程序', 'APP开发', '网站开发', '系统开发', 'API',
    'SaaS', '云服务', '云计算', 'AI', '人工智能', '大数据', '数据分析',
    // 电商
    '电商', '跨境电商', 'Shopify', '独立站', '亚马逊', '跨境出海',
    // 其他专业术语
    '企业服务', 'B2B', 'B2C', 'SaaS平台', '管理系统', 'CRM', 'ERP',
    '品牌策划', '文案', '创意', '设计', 'VI', 'logo', '视觉设计'
  ]

  // 检查描述中是否包含这些业务词
  const descUpper = description.toUpperCase()
  businessPatterns.forEach(pattern => {
    if (descUpper.includes(pattern.toUpperCase())) {
      coreWords.push(pattern)
    }
  })

  return coreWords
}

// 构建企业上下文（给 AI 用的企业画像）
// 关键改进：明确提取并传递企业描述中的核心业务词 + 搜索结果
const buildEnterpriseContext = (searchKeywords = []) => {
  const enterprise = getEnterpriseSettings()
  const name = enterprise.name || '未设置'
  const industry = enterprise.industry || '未设置'
  const description = enterprise.description || '未设置'
  const targetAudience = enterprise.targetAudience || '未设置'

  // 【关键改进】从企业描述中提取核心业务词
  const coreBusinessWords = extractCoreBusinessWordsForQuestions(description)
  const coreBusinessWordsStr = coreBusinessWords.length > 0
    ? `\n【核心业务词】（企业描述中明确提到的业务，必须在生成的问题中体现）：${coreBusinessWords.join('、')}`
    : ''

  // 【新增】加入Web搜索识别的企业业务关键词
  const searchKeywordsStr = searchKeywords && searchKeywords.length > 0
    ? `\n【搜索识别业务】（通过搜索识别出的企业业务范围）：${searchKeywords.join('、')}`
    : ''

  // 业务范围根据行业默认
  const businessScopeMap = {
    '科技/互联网': '提供软件开发、互联网服务、技术解决方案',
    '消费品/零售': '生产和销售消费品，提供零售服务',
    '金融/保险': '提供金融理财、保险服务',
    '医疗/健康': '提供医疗、健康管理服务',
    '教育/培训': '提供教育培训服务',
    '制造业': '从事产品制造和生产',
    '房地产/建筑': '房地产开发和建筑服务',
    '传媒/文化': '提供媒体、文化创意服务',
    '其他': '提供专业服务'
  }
  const businessScope = businessScopeMap[industry] || '提供专业服务'

  return `【企业背景】
企业名称：${name}
所属行业：${industry}
品牌描述：${description}
目标受众：${targetAudience}
业务范围：${businessScope}${coreBusinessWordsStr}${searchKeywordsStr}

请基于以上企业信息生成问题，问题要符合该企业的业务范围。生成的问题中必须体现【核心业务词】和【搜索识别业务】中提到的业务。`
}

// 根据关键词类型生成对应的 prompt（加入企业上下文 + 去重 + 真实搜索行为）
const generatePrompt = (keyword, type, enterpriseContext, existingQuestions = []) => {
  // 构建已有问题约束
  const existingConstraint = existingQuestions.length > 0
    ? `\n已有类似问题（请生成不同角度的，不要重复）：
${existingQuestions.join('、')}`
    : ''

  // 真实用户搜索特点约束
  const searchBehaviorConstraint = `
\n\n真实用户搜索行为特点（必须遵守）：
- 口语化、碎片化（如"xxx怎么样"、"xxx好用吗"）
- 带情绪（如"xxx坑不坑"、"xxx值不值"）
- 决策导向（如"xxx和xxx哪个好"、"xxx推荐"）
- 问题简短（不超过20字）
- 禁止写成正式提问（如"请分析xxx的优缺点"）`

  const k = normalizeKeywordTypeKey(type) || '02'
  const typePrompts = {
    '01': `请基于以下企业背景，针对品牌"${keyword}"生成用户真实会搜索的问题。${enterpriseContext}${existingConstraint}${searchBehaviorConstraint}

要求：
- 生成5个不同角度的问题
- 每个不超过20字
- 侧重：品牌口碑、对比推荐、用户体验
直接输出问题列表，每行一个，不要编号。`,

    '02': `请基于以下企业背景，针对产品/服务"${keyword}"生成用户真实会搜索的问题。${enterpriseContext}${existingConstraint}${searchBehaviorConstraint}

要求：
- 生成5个不同角度的问题
- 每个不超过20字
- 侧重：产品性能、选购决策、真实体验
直接输出问题列表，每行一个，不要编号。`,

    '03': `请基于以下企业背景，针对使用场景"${keyword}"生成用户真实会搜索的问题。${enterpriseContext}${existingConstraint}${searchBehaviorConstraint}

要求：
- 生成5个不同角度的问题
- 每个不超过20字
- 侧重：场景需求、痛点解决、用户决策
直接输出问题列表，每行一个，不要编号。`,

    '04': `请基于以下企业背景，针对企业/公司"${keyword}"生成用户真实会搜索的问题。${enterpriseContext}${existingConstraint}${searchBehaviorConstraint}

要求：
- 生成5个不同角度的问题
- 每个不超过20字
- 侧重：公司口碑、行业评价、实力对比、专业程度
- 注意：公司名可能包含"科技"、"集团"等后缀，生成问题时要自然融入，不能写成"XX这个牌子"、"XX牌子怎么样"
直接输出问题列表，每行一个，不要编号。`
  }

  return typePrompts[k] || typePrompts['02']
}

// 调用 AI 代理生成问题（加入企业上下文 + 搜索结果 + 去重）
const generateQuestionsFromAI = async (keyword, type, searchKeywords = []) => {
  const userId = 'default_user'
  const allForDedupe = await fetchAllPages(
    (p, ps) => `${API_BASE_URL}/api/questions?page=${p}&pageSize=${ps}`,
    { pageSize: 100, fetchOptions: { headers: { 'x-user-id': userId } } }
  )
  const existingQuestions = allForDedupe
    .filter((q) => q.sourceKeyword === keyword)
    .map((q) => q.question)

  // 先读取企业信息，构建上下文
  const enterpriseContext = buildEnterpriseContext(searchKeywords)
  const prompt = generatePrompt(keyword, type, enterpriseContext, existingQuestions)

  const response = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      prompt,
      temperature: 0.7,
      max_tokens: 500
    })
  })

  if (!response.ok) {
    throw new Error(`API请求失败: ${response.status}`)
  }

  const data = await response.json()
  const content = data.content || ''

  // 解析返回的问题列表
  const questions = content
    .split('\n')
    .map(q => q.trim())
    .filter(q => q.length > 0 && q.length <= 30)
    .slice(0, 5) // 最多5个问题

  return questions
}

// 根据原问题生成1-5个替代表述（不硬凑，质量优先）
const generateParaphrasesFromAI = async (originalQuestion) => {
  const prompt = `请为以下问题生成1到5个不同的表达方式，保持原意但不重复原话。

原问题：${originalQuestion}

要求：
- 生成1到5个替代表述（不硬凑，没有合适的就不生成）
- 每种表达方式要有明显不同的问法
- 保持问题的核心意思不变
- 口语化、简短（不超过25字）

直接输出替代表述，每行一个，不要编号，不要解释。`

  const response = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      prompt,
      temperature: 0.7,
      max_tokens: 400
    })
  })

  if (!response.ok) return []

  const data = await response.json()
  const content = data.content || ''

  const paraphrases = content
    .split('\n')
    .map(q => q.trim())
    .filter(q => q.length > 0 && q.length <= 25 && q !== originalQuestion)
    // 不设固定上限，让AI决定生成多少（质量优先）

  return paraphrases
}

const isLoading = ref(false)
const isSearching = ref(false)
const searchStatusText = ref('')

const handleAIExpand = async () => {
  // ===== 改写模式：恰好选中1个问题 =====
  if (selectedRows.value.length === 1) {
    const original = selectedRows.value[0]
    isLoading.value = true
    searchStatusText.value = '🤔 正在改写问题...'
    try {
      const paraphrases = await generateParaphrasesFromAI(original.question)
      if (paraphrases.length === 0) {
        ElMessage.warning('未能为该问题生成有效的替代表述')
        return
      }
      let successCount = 0
      for (const pq of paraphrases) {
        const newItem = {
          question: pq,
          keywordType: normalizeKeywordTypeKey(original.keywordType) || '01',
          sourceKeyword: original.sourceKeyword || original.question,
          status: '待审核'
        }
        // 写后端
        try {
          const res = await fetch(`${API_BASE_URL}/api/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-id': 'default_user' },
            body: JSON.stringify(newItem)
          })
          if (res.ok) {
            successCount++
          }
        } catch (e) {
          console.warn('同步到后端失败:', e)
        }
      }
      ElMessage.success(`生成 ${successCount} 个替代表述，已添加`)
      selectedRows.value = []
      await loadData()
    } finally {
      isLoading.value = false
      searchStatusText.value = ''
    }
    return
  }

  if (selectedRows.value.length > 1) {
    ElMessage.warning('请只选择一个问题进行改写')
    return
  }

  // ===== 扩展模式：基于关键词生成新问题 =====
  // 获取选中的关键词ID
  let keywords
  if (route.query.keywordIds) {
    const ids = route.query.keywordIds.split(',').map(Number)

    // 优先从 API 获取关键词
    try {
      const allKeywords = await fetchAllPages(
        (p, ps) => `${API_BASE_URL}/api/keywords?page=${p}&pageSize=${ps}`,
        { pageSize: 100, fetchOptions: { headers: { 'x-user-id': 'default_user' } } }
      )
      keywords = allKeywords.filter((k) => ids.includes(k.id))
    } catch (e) {
      console.warn('从 API 获取关键词失败，尝试从 localStorage', e)
    }

    // 如果 API 失败，报错提示
    if (!keywords || keywords.length === 0) {
      ElMessage.error('无法加载关键词，请检查网络')
      return
    }
  } else {
    // 无 keywordIds 参数时，尝试加载全部关键词
    try {
      keywords = await fetchAllPages(
        (p, ps) => `${API_BASE_URL}/api/keywords?page=${p}&pageSize=${ps}`,
        { pageSize: 100, fetchOptions: { headers: { 'x-user-id': 'default_user' } } }
      )
    } catch {
      keywords = []
    }
    if (keywords.length === 0) {
      ElMessage.error('无法加载关键词，请检查网络')
      return
    }
  }

  if (keywords.length === 0) {
    ElMessage.warning('请先在关键词页面添加关键词')
    return
  }

  // ===== Step 1: AI分析企业画像 =====
  const enterprise = getEnterpriseSettings()
  let searchKeywords = []

  isLoading.value = true
  isSearching.value = true
  searchStatusText.value = '🔍 正在分析企业属性（预计5-10秒）...'

  try {
    searchKeywords = await Promise.race([
      analyzeEnterpriseProfileForQuestions(
        enterprise.name || '',
        enterprise.industry || '',
        enterprise.description || ''
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI分析超时')), 10000))
    ])
    if (searchKeywords && searchKeywords.length > 0) {
      console.log('🔍 AI识别到企业业务关键词:', searchKeywords)
      searchStatusText.value = `✅ 已识别企业业务：${searchKeywords.slice(0, 5).join('、')}... 正在生成问题`
    } else {
      searchStatusText.value = '⚠️ 未能深度识别，将基于表单描述生成问题'
    }
  } catch (error) {
    console.error('AI分析失败:', error)
    searchStatusText.value = '⚠️ AI分析失败，将基于表单描述生成问题'
    searchKeywords = []
  }

  // 等待一下让用户看到分析状态
  await new Promise(r => setTimeout(r, 800))
  isSearching.value = false

  // ===== Step 2: AI生成问题 =====
  let successCount = 0
  let failCount = 0

  try {
    // 为每个关键词生成问题（每个最多等15秒，超时跳过）
    for (const kw of keywords) {
      try {
        const questions = await Promise.race([
          generateQuestionsFromAI(
            kw.keyword,
            normalizeKeywordTypeKey(kw.type) || '02',
            searchKeywords
          ),
          new Promise((_, reject) => setTimeout(() => reject(new Error('单关键词生成超时')), 15000))
        ])

        if (questions.length === 0) {
          failCount++
          continue
        }

        for (const q of questions) {
          const newQuestion = {
            question: q,
            keywordType: normalizeKeywordTypeKey(kw.type) || '02',
            sourceKeyword: kw.keyword,
            status: '待审核'
          }

          const userId = 'default_user'
          try {
            const res = await fetch(`${API_BASE_URL}/api/questions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-user-id': userId
              },
              body: JSON.stringify(newQuestion)
            })
            if (res.ok) {
              successCount++
            } else {
              failCount++
            }
          } catch (e) {
            console.warn('保存问题失败:', e)
            failCount++
          }
        }
      } catch (error) {
        console.error(`生成关键词"${kw.keyword}"的问题失败:`, error)
        failCount++
      }
    }

    // 清除URL参数
    if (route.query.keywordIds) {
      router.replace({ path: '/questions' })
    }

    if (successCount > 0) {
      ElMessage.success(`成功生成 ${successCount} 个问题${failCount > 0 ? `，${failCount} 个失败` : ''}`)
      // 刷新列表，确保显示所有问题（包括之前生成的）
      await loadData()
    } else {
      ElMessage.error('生成问题失败，请检查网络或API配置')
    }
  } finally {
    isLoading.value = false
  }
}

const cycleStatus = async (row) => {
  const statusOrder = ['待审核', '已审核', '已拒绝']
  const currentIndex = statusOrder.indexOf(row.status)
  const nextIndex = (currentIndex + 1) % statusOrder.length
  const newStatus = statusOrder[nextIndex]

  const userId = 'default_user'
  // 同步到后端
  try {
    await fetch(`${API_BASE_URL}/api/questions/${row.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify({ status: newStatus })
    })
  } catch (e) {
    console.warn('同步到后端失败:', e)
  }

  row.status = newStatus
  await loadData()
  ElMessage.success('状态已更新')
}

const cycleKeywordType = async (row) => {
  const typeOrder = keywordTypeKeys.value
  if (!typeOrder.length) return
  const current = normalizeKeywordTypeKey(row.keywordType)
  let currentIndex = typeOrder.indexOf(current)
  if (currentIndex < 0) currentIndex = -1
  const nextIndex = (currentIndex + 1) % typeOrder.length
  const newType = typeOrder[nextIndex]

  const userId = 'default_user'
  // 同步到后端
  try {
    await fetch(`${API_BASE_URL}/api/questions/${row.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify({ keywordType: newType })
    })
  } catch (e) {
    console.warn('同步到后端失败:', e)
  }

  row.keywordType = newType
  await loadData()
  ElMessage.success('关键词类型已更新')
}

const handleSelectionChange = (selection) => {
  selectedRows.value = selection
}

const handleBatchDelete = async () => {
  if (selectedRows.value.length === 0) return
  const userId = 'default_user'
  const idsToDelete = selectedRows.value.map((r) => r.id)

  mutationLoading.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/api/questions/batch-delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ ids: idsToDelete }),
    })
    let data = {}
    try {
      data = await res.json()
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      ElMessage.error(data.error || '批量删除失败')
      return
    }
    const deleted = data.deletedCount ?? idsToDelete.length
    selectedRows.value = []
    await reloadPagedListAfterRemoval({ page, list: tableData, loadData })
    ElMessage.success(`已删除 ${deleted} 条记录`)
  } catch (e) {
    console.warn(e)
    ElMessage.error('批量删除失败，请检查网络')
  } finally {
    mutationLoading.value = false
  }
}

// 清空全部：与列表相同筛选条件，后端一条 SQL 删除
const handleClearAll = async () => {
  if (total.value === 0) return

  try {
    await ElMessageBox.confirm(
      `确定要清空当前筛选下全部 ${total.value} 条问题吗？此操作不可恢复！`,
      '清空确认',
      {
        confirmButtonText: '确认清空',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    )
  } catch {
    return
  }

  const userId = 'default_user'
  const body = {}
  if (filterKeywordType.value) body.keywordType = filterKeywordType.value
  if (filterStatus.value) body.status = filterStatus.value

  mutationLoading.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/api/questions/delete-matching`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify(body),
    })
    let data = {}
    try {
      data = await res.json()
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      ElMessage.error(data.error || '清空失败')
      return
    }
    page.value = 1
    selectedRows.value = []
    await loadData()
    ElMessage.success(`已清空 ${data.deletedCount ?? 0} 条问题`)
  } catch (e) {
    console.warn(e)
    ElMessage.error('清空失败，请检查网络')
  } finally {
    mutationLoading.value = false
  }
}

const handleAdd = () => {
  form.value = { question: '', keywordType: '' }
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!form.value.question || !form.value.keywordType) {
    ElMessage.warning('请填写完整信息')
    return
  }
  const exists = tableData.value.some(q => q.question === form.value.question)
  if (exists) {
    ElMessage.warning('该问题已存在')
    return
  }

  const userId = 'default_user'
  const newItem = {
    question: form.value.question,
    keywordType: form.value.keywordType,
    sourceKeyword: '-',
    status: '待审核'
  }

  // 同步到后端
  try {
    const res = await fetch(`${API_BASE_URL}/api/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify(newItem)
    })
    if (res.ok) {
      page.value = 1
      await loadData()
      ElMessage.success('添加成功')
    } else {
      ElMessage.error('添加失败，请重试')
      return
    }
  } catch (e) {
    ElMessage.error('添加失败，请检查网络')
    return
  }

  dialogVisible.value = false
}

const handleDelete = async (id) => {
  const userId = 'default_user'
  mutationLoading.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/api/questions/${id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': userId },
    })
    let data = {}
    try {
      data = await res.json()
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      ElMessage.error(data.error || '删除失败')
      return
    }
    await reloadPagedListAfterRemoval({ page, list: tableData, loadData })
    ElMessage.success('删除成功')
  } catch (e) {
    console.warn(e)
    ElMessage.error('删除失败，请检查网络')
  } finally {
    mutationLoading.value = false
  }
}

// ===================== GEO 问题生成 =====================
const geoDialogVisible = ref(false)
const geoGenerating = ref(false)
const geoPrefillLoading = ref(false)
const geoForm = ref({ brand: '', product: '', targetCustomer: '' })

const geoResultDialogVisible = ref(false)
const geoResultTableRef = ref(null)
const generatedQuestions = ref([])
const geoSelectedGenerated = ref([])
const geoSaving = ref(false)

// 生成问题按 typeKey 分组（用于「批量勾选某类型」按钮）
const generatedGroups = computed(() => {
  const map = new Map()
  for (const row of generatedQuestions.value) {
    if (!map.has(row.typeKey)) {
      map.set(row.typeKey, { typeKey: row.typeKey, label: keywordTypeLabel(row.typeKey), rows: [] })
    }
    map.get(row.typeKey).rows.push(row)
  }
  return Array.from(map.values())
})

// deepseek 返回的 type 到字典 keyword_type 的映射
const GEO_TYPE_TO_ZH = {
  brand: '品牌',
  product: '产品',
  scenario: '场景',
  enterprise: '企业',
  price: '价格',
}
const GEO_TYPE_FALLBACK_KEY = {
  brand: '01',
  product: '02',
  scenario: '03',
  enterprise: '04',
  price: '06',
}

const resolveGeoTypeToDictKey = (geoType) => {
  const t = String(geoType || '').toLowerCase().trim()
  const zh = GEO_TYPE_TO_ZH[t]
  if (zh) {
    const row = keywordTypeOptions.value.find((x) => String(x.dataValue || '').includes(zh))
    if (row?.dataKey) return row.dataKey
  }
  return GEO_TYPE_FALLBACK_KEY[t] || '02'
}

/** 从数据库 users（default_user）读取企业信息，对应 GET /api/settings */
const fetchEnterpriseSettingsFromDb = async () => {
  const res = await fetch(`${API_BASE_URL}/api/settings`)
  if (!res.ok) return null
  return res.json()
}

const openGeoDialog = async () => {
  geoDialogVisible.value = true
  geoPrefillLoading.value = true
  geoForm.value = { brand: '', product: '', targetCustomer: '' }
  const local = getEnterpriseSettings()
  try {
    const row = await fetchEnterpriseSettingsFromDb()
    const brand =
      String(row?.company_name ?? '').trim() ||
      String(local.name ?? '').trim()
    const product =
      String(row?.description ?? '').trim() ||
      String(local.description ?? '').trim()
    const targetCustomer =
      String(row?.target_audience ?? row?.targetAudience ?? '').trim() ||
      String(local.targetAudience ?? '').trim()
    geoForm.value = { brand, product, targetCustomer }
    if (!row && !brand && !product && !targetCustomer) {
      ElMessage.warning('未读取到企业信息：请检查网络，或先在「企业信息」页保存后再试')
    } else if (row && !brand && !product && !targetCustomer) {
      ElMessage.info('数据库中企业信息为空，请在「企业信息」保存后重试，或手动填写下方表单')
    }
  } catch (e) {
    console.warn('[GEO] 读取 /api/settings 失败，回退本地缓存', e)
    geoForm.value = {
      brand: String(local.name || '').trim(),
      product: String(local.description || '').trim(),
      targetCustomer: String(local.targetAudience || '').trim(),
    }
    ElMessage.warning('无法连接服务端读取企业信息，已使用本机缓存（若有）')
  } finally {
    geoPrefillLoading.value = false
  }
}

// buildGeoPrompt 已迁至 frontend/src/prompts/geoQuestionGenerate.js（buildGeoQuestionPrompt）
const buildGeoPrompt = buildGeoQuestionPrompt

const extractGeoJson = (text) => {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw
  try {
    return JSON.parse(candidate)
  } catch {
    const s = candidate.indexOf('{')
    const e = candidate.lastIndexOf('}')
    if (s >= 0 && e > s) {
      try { return JSON.parse(candidate.slice(s, e + 1)) } catch { return null }
    }
    return null
  }
}

const submitGeoGenerate = async () => {
  const brand = (geoForm.value.brand || '').trim()
  const product = (geoForm.value.product || '').trim()
  const targetCustomer = (geoForm.value.targetCustomer || '').trim()
  if (!brand || !product || !targetCustomer) {
    ElMessage.warning('请完整填写：品牌名称 / 销售产品 / 客户群体描述')
    return
  }

  geoGenerating.value = true
  // 开始新一轮生成前，先彻底清空上一次的内存数据与 el-table 选择集
  generatedQuestions.value = []
  geoSelectedGenerated.value = []
  if (geoResultTableRef.value) {
    try { geoResultTableRef.value.clearSelection() } catch {}
  }
  try {
    const prompt = buildGeoPrompt({ brand, product, targetCustomer })
    const res = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        prompt,
        temperature: 0.7,
        max_tokens: 6000,
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`AI请求失败（${res.status}）${txt.slice(0, 120)}`)
    }
    const data = await res.json()
    const parsed = extractGeoJson(data?.content)
    const list = Array.isArray(parsed?.questions) ? parsed.questions : []
    if (list.length === 0) {
      ElMessage.error('未能解析到问题，请检查模型返回或稍后重试')
      return
    }

    const seen = new Set()
    const rows = []
    list.forEach((item, idx) => {
      const q = String(item?.question || '').trim()
      const t = String(item?.type || '').toLowerCase().trim()
      if (!q || seen.has(q)) return
      seen.add(q)
      rows.push({
        id: `geo-${Date.now()}-${idx}`,
        geoType: t,
        typeKey: resolveGeoTypeToDictKey(t),
        question: q,
      })
    })
    rows.sort((a, b) => {
      if (a.typeKey !== b.typeKey) return String(a.typeKey).localeCompare(String(b.typeKey))
      return String(a.question).localeCompare(String(b.question), 'zh-CN')
    })

    generatedQuestions.value = rows
    geoSelectedGenerated.value = []
    geoDialogVisible.value = false
    geoResultDialogVisible.value = true
    // 等 dialog + table 渲染完成后再默认全选，避免与上次选择集叠加
    await nextTick()
    if (geoResultTableRef.value) {
      geoResultTableRef.value.clearSelection()
      selectAllGenerated()
    }
    ElMessage.success(`已生成 ${rows.length} 条问题`)
  } catch (e) {
    console.error('GEO 问题生成失败:', e)
    ElMessage.error(e?.message || '生成失败，请稍后重试')
  } finally {
    geoGenerating.value = false
  }
}

const onGeoSelectionChange = (sel) => {
  geoSelectedGenerated.value = sel
}

const onGeoResultDialogClosed = () => {
  if (geoResultTableRef.value) {
    try { geoResultTableRef.value.clearSelection() } catch {}
  }
  generatedQuestions.value = []
  geoSelectedGenerated.value = []
}

const selectAllGenerated = () => {
  const t = geoResultTableRef.value
  if (!t) return
  generatedQuestions.value.forEach((row) => t.toggleRowSelection(row, true))
}

const clearSelectedGenerated = () => {
  const t = geoResultTableRef.value
  if (!t) return
  t.clearSelection()
}

const selectGeoGroup = (typeKey) => {
  const t = geoResultTableRef.value
  if (!t) return
  generatedQuestions.value
    .filter((row) => row.typeKey === typeKey)
    .forEach((row) => t.toggleRowSelection(row, true))
}

const saveGeoSelected = async () => {
  const list = geoSelectedGenerated.value
  if (!list.length) return
  geoSaving.value = true
  const userId = 'default_user'
  const sourceKeyword = (geoForm.value.brand || '').trim() || 'GEO生成'
  let ok = 0
  let fail = 0
  try {
    for (const item of list) {
      const payload = {
        question: item.question,
        keywordType: item.typeKey,
        sourceKeyword,
        status: '待审核',
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
          body: JSON.stringify(payload),
        })
        if (res.ok) ok++
        else fail++
      } catch {
        fail++
      }
    }
    if (ok > 0) {
      ElMessage.success(`已入库 ${ok} 条${fail > 0 ? `，失败 ${fail} 条` : ''}`)
      page.value = 1
      await loadData()
      geoResultDialogVisible.value = false
    } else {
      ElMessage.error('入库失败，请检查网络')
    }
  } finally {
    geoSaving.value = false
  }
}
</script>

<style scoped>
.filter-actions :deep(.el-button + .el-button) {
  margin-left: 0 !important;
}
</style>
