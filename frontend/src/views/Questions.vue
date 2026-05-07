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
          type="primary"
          plain
          class="ml-0"
          :loading="exportQuestionsLoading"
          :disabled="total === 0 || listLoading || mutationLoading"
          @click="handleExportQuestions"
        >
          <el-icon class="mr-1"><Download /></el-icon>
          导出列表
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
          <el-tag :type="getTypeColor(row.keywordType)">
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
          共 {{ generatedQuestions.length }} 条，按类型分组排序；<strong>点击问题内容可修改</strong>，勾选后点「确定入库」保存到问题库
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
        <el-table-column label="问题内容" min-width="320">
          <template #default="{ row }">
            <div class="geo-q-edit-cell">
              <textarea
                v-if="geoQuestionEditingId === row.id"
                ref="geoQuestionEditInputRef"
                v-model="geoQuestionEditDraft"
                class="geo-q-edit-textarea"
                rows="2"
                @blur="commitGeoQuestionEdit"
                @keydown.escape.prevent="cancelGeoQuestionEdit"
              />
              <span
                v-else
                class="geo-q-edit-text"
                role="button"
                tabindex="0"
                title="点击编辑"
                @click="startGeoQuestionEdit(row)"
                @keydown.enter.prevent="startGeoQuestionEdit(row)"
              >{{ row.question }}</span>
            </div>
          </template>
        </el-table-column>
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
import { Plus, MagicStick, SortUp, SortDown, Rank, Delete, Promotion, Download } from '@element-plus/icons-vue'
import {
  fetchDictList,
  normalizeKeywordTypeKey,
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
import {
  buildBusinessTermsPrompt,
  buildGeoQuestionPrompt,
  buildGeoKeywordAnchoredPrompt,
} from '../prompts/index.js'
import * as XLSX from 'xlsx'

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
const exportQuestionsLoading = ref(false)

const keywordTypeOptions = ref([])

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

const buildQuestionsListExportUrl = (p, ps) => {
  const qs = new URLSearchParams({
    page: String(p),
    pageSize: String(ps),
  })
  if (filterKeywordType.value) qs.set('keywordType', filterKeywordType.value)
  if (filterStatus.value) qs.set('status', filterStatus.value)
  return `${API_BASE_URL}/api/questions?${qs}`
}

const handleExportQuestions = async () => {
  exportQuestionsLoading.value = true
  try {
    const userId = 'default_user'
    const rows = await fetchAllPages(buildQuestionsListExportUrl, {
      pageSize: 100,
      maxPages: 200,
      fetchOptions: { headers: { 'x-user-id': userId } },
    })
    if (!rows.length) {
      ElMessage.warning('当前筛选下没有可导出的数据')
      return
    }
    const aoa = [
      ['序号', '问题内容', '关键词类型', '来源关键词', '状态', '创建时间'],
      ...rows.map((row, i) => [
        i + 1,
        row.question || '',
        keywordTypeLabel(row.keywordType),
        row.sourceKeyword || '',
        row.status || '',
        formatDate(row.createdAt),
      ]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 6 }, { wch: 56 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 20 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '拓展问题')
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    XLSX.writeFile(wb, `拓展问题_${stamp}.xlsx`)
    ElMessage.success(`已导出 ${rows.length} 条`)
  } catch (e) {
    console.error(e)
    ElMessage.error('导出失败：' + (e.message || String(e)))
  } finally {
    exportQuestionsLoading.value = false
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

/** 解析 AI 返回中的 JSON（含 ```json 围栏）— GEO 弹窗与关键词批量生成共用 */
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

/** 从数据库 users（default_user）读取企业信息，对应 GET /api/settings */
const fetchEnterpriseSettingsFromDb = async () => {
  const res = await fetch(`${API_BASE_URL}/api/settings`)
  if (!res.ok) return null
  return res.json()
}

// deepseek 返回的 type → questions.keyword_type（data_key）：优先按当前 sys_dict 文案匹配，失败再用下列兜底（与库内 keyword_type 一致，价格词为 05）
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
  price: '05',
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

/** 将模型返回的 sourceKeyword 与库内词对齐，避免轻微差异导致整批被丢弃 */
const resolveKeywordEntryFromAiRow = (skRaw, questionText, keywordEntries) => {
  const sk = String(skRaw || '')
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
  const q = String(questionText || '').trim()
  if (!keywordEntries.length) return null

  let entry = keywordEntries.find((e) => e.keyword === sk)
  if (entry) return { entry, sourceKeyword: entry.keyword }

  const norm = (s) =>
    String(s || '')
      .trim()
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, '')

  const nsk = norm(sk)
  if (nsk) {
    entry = keywordEntries.find((e) => norm(e.keyword) === nsk)
    if (entry) return { entry, sourceKeyword: entry.keyword }
  }

  const byLen = [...keywordEntries].sort((a, b) => b.keyword.length - a.keyword.length)
  entry = byLen.find((e) => e.keyword && q.includes(e.keyword))
  if (entry) return { entry, sourceKeyword: entry.keyword }

  if (sk) {
    entry = byLen.find(
      (e) =>
        e.keyword &&
        (sk.includes(e.keyword) || e.keyword.includes(sk)) &&
        Math.abs(sk.length - e.keyword.length) <= 6
    )
    if (entry) return { entry, sourceKeyword: entry.keyword }
  }

  return null
}

/**
 * 关键词库批量生成：使用 prompts/geoQuestionGenerate.js 的 GEO 约束 + 关键词锚点（JSON）。
 * 企业信息不完整时返回 null（已提示用户）。
 */
const generateKeywordBatchFromGeoPrompt = async (keywords, searchKeywords = []) => {
  const local = getEnterpriseSettings()
  let brand = String(local.name || '').trim()
  let product = String(local.description || '').trim()
  let targetCustomer = String(local.targetAudience || '').trim()
  try {
    const row = await fetchEnterpriseSettingsFromDb()
    if (row) {
      brand = String(row.company_name ?? brand).trim() || brand
      product = String(row.description ?? product).trim() || product
      targetCustomer = String(row.target_audience ?? row.targetAudience ?? targetCustomer).trim() || targetCustomer
    }
  } catch (e) {
    console.warn('[关键词生成] 读取企业信息失败，使用本地缓存', e)
  }

  if (!brand || !product || !targetCustomer) {
    ElMessage.warning(
      '请先在「企业信息」中填写品牌名称、品牌描述（作为产品/服务说明）和目标受众，再生成问题'
    )
    return null
  }

  const keywordEntries = keywords
    .map((kw) => ({
      keyword: String(kw.keyword || '').trim(),
      typeKey: normalizeKeywordTypeKey(kw.type) || '02',
    }))
    .filter((e) => e.keyword)

  if (keywordEntries.length === 0) return []

  const n = keywordEntries.length
  const questionsPerKeyword = n > 14 ? Math.max(3, Math.floor(70 / n)) : 5

  const userId = 'default_user'
  let dedupeBlock = ''
  try {
    const allForDedupe = await fetchAllPages(
      (p, ps) => `${API_BASE_URL}/api/questions?page=${p}&pageSize=${ps}`,
      { pageSize: 100, fetchOptions: { headers: { 'x-user-id': userId } } }
    )
    const chunks = []
    for (const { keyword } of keywordEntries) {
      const existing = allForDedupe
        .filter((q) => q.sourceKeyword === keyword)
        .map((q) => q.question)
        .filter(Boolean)
      if (existing.length) {
        chunks.push(`「${keyword}」已有：${existing.slice(0, 12).join('；')}`)
      }
    }
    if (chunks.length) {
      dedupeBlock = '\n【去重】勿重复或仅微调下列已有问题：\n' + chunks.join('\n')
    }
  } catch (e) {
    console.warn('[关键词生成] 拉取已有问题失败，跳过去重提示', e)
  }

  const extraHints = [searchKeywords?.length ? `搜索辅助识别的业务词：${searchKeywords.join('、')}` : '', dedupeBlock]
    .filter(Boolean)
    .join('')

  const prompt = buildGeoKeywordAnchoredPrompt({
    brand,
    product,
    targetCustomer,
    keywordEntries,
    questionsPerKeyword,
    extraBusinessHints: extraHints,
  })

  const response = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      temperature: 0.65,
      max_tokens: 8192,
    }),
  })

  let data
  try {
    data = await response.json()
  } catch {
    data = {}
  }

  if (!response.ok) {
    const serverMsg = String(data?.error || data?.message || '').trim()
    throw new Error(serverMsg || `AI 请求失败（HTTP ${response.status}）`)
  }

  const rawContent = String(data?.content ?? '').trim()
  if (!rawContent) {
    throw new Error(String(data?.error || '').trim() || 'AI 返回内容为空')
  }

  const parsed = extractGeoJson(rawContent)
  const list = Array.isArray(parsed?.questions) ? parsed.questions : null

  if (!parsed || list === null) {
    console.warn('[关键词生成] JSON 解析失败，返回片段:', rawContent.slice(0, 240))
    throw new Error(
      '模型返回无法解析为合法 JSON（常见于一次生成的关键词过多、输出被截断）。请减少选中关键词数量后重试。'
    )
  }

  const out = []
  const seenQ = new Set()
  for (const item of list) {
    const q = String(item?.question || '').trim()
    if (!q || seenQ.has(q)) continue
    const skRaw = String(item?.sourceKeyword || '').trim()
    const resolved = resolveKeywordEntryFromAiRow(skRaw, q, keywordEntries)
    if (!resolved) continue
    const { entry, sourceKeyword } = resolved
    seenQ.add(q)
    out.push({
      question: q,
      keywordType: normalizeKeywordTypeKey(entry.typeKey) || '02',
      sourceKeyword,
    })
  }

  if (out.length === 0 && list.length > 0) {
    throw new Error(
      '模型返回的问题未能与关键词对齐（sourceKeyword 与库内不一致，且正文未包含对应关键词）。请重试生成。'
    )
  }

  if (out.length === 0) {
    throw new Error('模型未返回任何问题条目，请稍后重试或检查大模型连接。')
  }

  return out
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
    searchStatusText.value = '📝 正在按 GEO 规则批量生成问题…'
    let batchItems
    try {
      batchItems = await Promise.race([
        generateKeywordBatchFromGeoPrompt(keywords, searchKeywords),
        new Promise((_, reject) => setTimeout(() => reject(new Error('批量生成超时')), 120000)),
      ])
    } catch (error) {
      console.error('关键词批量生成失败:', error)
      if (route.query.keywordIds) {
        router.replace({ path: '/questions' })
      }
      const msg = String(error?.message || '')
      ElMessage.error(
        msg.includes('超时')
          ? '生成超时，请减少选中关键词数量后重试'
          : msg || '生成失败，请检查网络或API配置'
      )
      return
    }

    if (batchItems === null) {
      if (route.query.keywordIds) {
        router.replace({ path: '/questions' })
      }
      return
    }

    if (batchItems.length === 0) {
      if (route.query.keywordIds) {
        router.replace({ path: '/questions' })
      }
      ElMessage.error('未能解析到有效问题，请稍后重试')
      return
    }

    const userId = 'default_user'
    for (const item of batchItems) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/questions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
          },
          body: JSON.stringify({
            question: item.question,
            keywordType: item.keywordType,
            sourceKeyword: item.sourceKeyword,
            status: '待审核',
          }),
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

    // 清除URL参数
    if (route.query.keywordIds) {
      router.replace({ path: '/questions' })
    }

    if (successCount > 0) {
      ElMessage.success(`成功生成 ${successCount} 个问题${failCount > 0 ? `，${failCount} 个失败` : ''}`)
      await loadData()
    } else {
      ElMessage.error('问题未能入库，请检查网络或API配置')
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

/** GEO 结果表：问题内容点击编辑（对齐品牌体检报告「优化建议」交互） */
const geoQuestionEditingId = ref(null)
const geoQuestionEditDraft = ref('')
const geoQuestionEditInputRef = ref(null)

const commitGeoQuestionEdit = () => {
  const id = geoQuestionEditingId.value
  if (!id) return
  const row = generatedQuestions.value.find((r) => r.id === id)
  const next = String(geoQuestionEditDraft.value || '').trim()
  if (row) {
    if (!next) {
      ElMessage.warning('问题内容不能为空')
      geoQuestionEditDraft.value = String(row.question || '')
    } else {
      row.question = next
    }
  }
  geoQuestionEditingId.value = null
}

const cancelGeoQuestionEdit = () => {
  geoQuestionEditingId.value = null
}

const startGeoQuestionEdit = async (row) => {
  if (geoQuestionEditingId.value != null) {
    commitGeoQuestionEdit()
  }
  geoQuestionEditingId.value = row.id
  geoQuestionEditDraft.value = String(row.question || '')
  await nextTick()
  const el = geoQuestionEditInputRef.value
  if (el && typeof el.focus === 'function') el.focus()
  if (el && typeof el.select === 'function') el.select()
}

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
  geoQuestionEditingId.value = null
  if (geoResultTableRef.value) {
    try { geoResultTableRef.value.clearSelection() } catch {}
  }
  try {
    const prompt = buildGeoPrompt({ brand, product, targetCustomer })
    const res = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
  geoQuestionEditingId.value = null
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
        question: String(item.question || '').trim(),
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

.geo-q-edit-cell {
  width: 100%;
}
.geo-q-edit-text {
  display: block;
  line-height: 1.55;
  cursor: pointer;
  color: #303133;
  word-break: break-word;
  min-height: 1.5em;
  padding: 4px 6px;
  margin: -4px -6px;
  border-radius: 6px;
  outline: none;
}
.geo-q-edit-text:hover {
  background: #f5f7fa;
}
.geo-q-edit-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font: inherit;
  line-height: 1.5;
  resize: vertical;
  min-height: 48px;
  color: #303133;
}
.geo-q-edit-textarea:focus {
  border-color: #409eff;
  outline: none;
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.2);
}
</style>
