<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex items-center mb-4">
      <div>
        <div class="text-lg font-bold">关键词管理</div>
        <div class="text-sm text-gray-500">管理品牌核心关键词</div>
      </div>
      <div class="flex items-center filter-actions gap-4 ml-auto">
        <el-select v-model="filterType" placeholder="全部类型" class="w-28" clearable @change="onFilterTypeChange">
          <el-option label="全部类型" value="" />
          <el-option
            v-for="d in keywordTypeOptions"
            :key="d.dataKey"
            :label="d.dataValue"
            :value="d.dataKey"
          />
        </el-select>
        <el-button type="success" class="ml-0" @click="handleGenerateQuestions" :disabled="selectedKeywords.length === 0">
          <el-icon class="mr-1"><MagicStick /></el-icon>
          生成问题 ({{ selectedKeywords.length }})
        </el-button>
        <el-button type="danger" class="ml-0" :disabled="selectedKeywords.length === 0" @click="handleBatchDelete">
          批量删除 ({{ selectedKeywords.length }})
        </el-button>
        <el-button type="danger" plain class="ml-0" :disabled="loading" @click="handleClearAll">
          清空全部
        </el-button>
        <el-button type="primary" class="ml-0" @click="handleAdd">
          <el-icon class="mr-1"><Plus /></el-icon>
          添加词
        </el-button>
      </div>
    </div>

    <el-table
      v-loading="loading"
      :data="tableData"
      style="width: 100%"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="50" />
      <el-table-column label="序号" width="80" align="center">
        <template #default="{ $index }">
          {{ (page - 1) * pageSize + $index + 1 }}
        </template>
      </el-table-column>
      <el-table-column prop="keyword" label="关键词" />
      <el-table-column prop="type" label="类型" width="120">
        <template #default="{ row }">
          <el-tag :type="getTypeColor(row.type)">
            {{ keywordTypeLabel(row.type) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="150" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="handleEdit(row)">编辑</el-button>
          <el-popconfirm
            title="确定删除该关键词吗？"
            confirm-button-text="删除"
            cancel-button-text="取消"
            @confirm="() => handleDelete(row.id)"
          >
            <template #reference>
              <el-button link type="danger" size="small" @click.stop>删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!loading && tableData.length === 0"
      :description="total === 0 ? '暂无关键词，请添加' : '没有匹配筛选条件的关键词'"
    />

    <AppPaginationBar
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
      @change="loadData"
    />

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑关键词' : '添加关键词'" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="关键词">
          <el-input v-model="form.keyword" placeholder="请输入关键词" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" placeholder="请选择类型">
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  fetchDictList,
  normalizeKeywordTypeKey,
  KEYWORD_TYPE_DEFAULT_OPTIONS
} from '../utils/sysDict.js'
import { unwrapListPayload, DEFAULT_PAGE_SIZE, reloadPagedListAfterRemoval } from '../utils/pagedApi.js'
import { formatZhCnDateTime } from '../utils/dateTime.js'
import AppPaginationBar from '../components/AppPaginationBar.vue'

const API_BASE_URL = window.VITE_API_URL || window.location.origin

const readJsonSafe = async (res) => {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

const router = useRouter()

const tableData = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const loading = ref(false)

const onFilterTypeChange = () => {
  page.value = 1
  loadData()
}
const selectedKeywords = ref([])
const dialogVisible = ref(false)
const filterType = ref('')
const isEdit = ref(false)
const form = ref({ keyword: '', type: '' })

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

// 加载数据（服务端分页 + 类型筛选）
const loadData = async () => {
  const userId = 'default_user'
  loading.value = true
  try {
    const qs = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize.value),
    })
    if (filterType.value) qs.set('type', filterType.value)
    const res = await fetch(`${API_BASE_URL}/api/keywords?${qs}`, {
      headers: { 'x-user-id': userId },
    })
    if (res.ok) {
      const data = await res.json()
      const { list, total: t } = unwrapListPayload(data)
      tableData.value = list
      total.value = t
    } else {
      tableData.value = []
      total.value = 0
      ElMessage.error('加载关键词失败')
    }
  } catch {
    tableData.value = []
    total.value = 0
    ElMessage.error('加载关键词失败，请检查网络')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadData(), loadKeywordTypeDict()])
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

const formatDate = (dateStr) => {
  if (!dateStr || dateStr === '{}') return '-'
  return formatZhCnDateTime(dateStr)
}

const handleSelectionChange = (selection) => {
  selectedKeywords.value = selection.map(s => {
    return tableData.value.find(t => t.id === s.id)
  }).filter(Boolean)
}

const handleGenerateQuestions = () => {
  if (selectedKeywords.value.length === 0) {
    ElMessage.warning('请先选择要生成问题的关键词')
    return
  }
  // 把选中的关键词ID传到问题页面
  const ids = selectedKeywords.value.map(k => k.id).join(',')
  ElMessage.success(`已选择 ${selectedKeywords.value.length} 个关键词，生成问题中...`)
  router.push({ path: '/questions', query: { keywordIds: ids } })
}

const handleAdd = () => {
  form.value = { keyword: '', type: '' }
  isEdit.value = false
  dialogVisible.value = true
}

const handleEdit = (row) => {
  form.value = { ...row }
  isEdit.value = true
  dialogVisible.value = true
}

const handleDelete = async (id) => {
  if (id == null || id === '') {
    ElMessage.error('无法删除：缺少记录 ID')
    return
  }
  const userId = 'default_user'
  try {
    const res = await fetch(`${API_BASE_URL}/api/keywords/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-user-id': userId },
    })
    const data = await readJsonSafe(res)
    if (!res.ok) {
      ElMessage.error(data.error || `删除失败（${res.status}）`)
      return
    }
    ElMessage.success('删除成功')
    selectedKeywords.value = []
    await reloadPagedListAfterRemoval({ page, list: tableData, loadData })
  } catch {
    ElMessage.error('删除失败，请检查网络')
  }
}

const handleBatchDelete = async () => {
  if (selectedKeywords.value.length === 0) return
  const userId = 'default_user'
  const ids = selectedKeywords.value.map((r) => r.id).filter((x) => x != null && x !== '')
  if (ids.length === 0) {
    ElMessage.warning('所选记录无效')
    return
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/keywords/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify({ ids }),
    })
    const data = await readJsonSafe(res)
    if (!res.ok || !data.ok) {
      ElMessage.error(data.error || '批量删除失败')
      return
    }
    const n = Number(data.deletedCount) || 0
    ElMessage.success(n > 0 ? `已删除 ${n} 条` : '没有可删除的记录')
    selectedKeywords.value = []
    await reloadPagedListAfterRemoval({ page, list: tableData, loadData })
  } catch {
    ElMessage.error('批量删除失败，请检查网络')
  }
}

const handleClearAll = async () => {
  try {
    await ElMessageBox.confirm(
      '将删除关键词库中的全部关键词（含当前列表筛选条件之外的所有词），且不可恢复。确定继续？',
      '清空全部',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const userId = 'default_user'
  try {
    const res = await fetch(`${API_BASE_URL}/api/keywords/delete-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    })
    const data = await readJsonSafe(res)
    if (!res.ok || !data.ok) {
      ElMessage.error(data.error || '清空失败')
      return
    }
    const n = Number(data.deletedCount) || 0
    if (n === 0) {
      ElMessage.info('当前没有关键词')
    } else {
      ElMessage.success(`已清空 ${n} 条关键词`)
    }
    page.value = 1
    selectedKeywords.value = []
    await loadData()
  } catch {
    ElMessage.error('清空失败，请检查网络')
  }
}

const handleSubmit = async () => {
  if (!form.value.keyword || !form.value.type) {
    ElMessage.warning('请填写完整信息')
    return
  }
  const exists = tableData.value.some(k => k.keyword === form.value.keyword && k.id !== form.value.id)
  if (exists) {
    ElMessage.warning('该关键词已存在')
    return
  }
  const userId = 'default_user'
  if (isEdit.value) {
    try {
      await fetch(`${API_BASE_URL}/api/keywords/${form.value.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ keyword: form.value.keyword, type: form.value.type })
      })
    } catch { /* silent */ }
    await loadData()
    ElMessage.success('编辑成功')
  } else {
    try {
      await fetch(`${API_BASE_URL}/api/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ keyword: form.value.keyword, type: form.value.type })
      })
    } catch { /* silent */ }
    await loadData()
    ElMessage.success('添加成功')
  }
  dialogVisible.value = false
}
</script>

<style scoped>
/* Override Element Plus default adjacent button margin */
.filter-actions :deep(.el-button + .el-button) {
  margin-left: 0 !important;
}
</style>
