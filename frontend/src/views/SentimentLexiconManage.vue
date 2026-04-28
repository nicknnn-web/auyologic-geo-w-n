<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
      <div>
        <div class="text-lg font-bold">情感词管理</div>
        <div class="text-sm text-gray-500 mt-1">
          配置 AI 语义情绪判定口径，写入品牌体检「答案分析」Prompt；分三档：正面优势、中性描述、负面警示。
          修改后对新执行的分析生效，已入库的历史分析可重新跑任务分析以刷新。
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <el-button
          type="danger"
          plain
          :disabled="loading || selectedRows.length === 0"
          :loading="batchDeleting"
          @click="handleBatchDelete"
        >
          批量删除{{ selectedRows.length ? `（${selectedRows.length}）` : '' }}
        </el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon class="mr-1"><Plus /></el-icon>
          新增关键词
        </el-button>
      </div>
    </div>

    <el-tabs v-model="activeTier" class="sl-tabs">
      <el-tab-pane label="正面优势" name="positive" />
      <el-tab-pane label="中性描述" name="neutral" />
      <el-tab-pane label="负面警示" name="negative" />
    </el-tabs>

    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="tableData"
      row-key="id"
      stripe
      class="mt-2"
      style="width: 100%"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="48" align="center" />
      <el-table-column prop="keyword" label="关键词" min-width="200" show-overflow-tooltip />
      <el-table-column prop="enabled" label="启用" width="90" align="center">
        <template #default="{ row }">
          <el-switch v-model="row.enabled" @change="(v) => onToggle(row, v)" />
        </template>
      </el-table-column>
      <el-table-column prop="sort_order" label="排序" width="100" align="center" />
      <el-table-column label="操作" width="160" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-popconfirm title="确定删除该词？" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger" size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <AppPaginationBar
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
      :disabled="loading"
      @change="loadData"
    />

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑关键词' : '新增关键词'" width="480px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="关键词" prop="keyword">
          <el-input v-model="form.keyword" placeholder="如：性价比高、翻车、避雷" maxlength="128" show-word-limit />
        </el-form-item>
        <el-form-item label="层级" prop="tier">
          <el-select v-model="form.tier" class="w-full">
            <el-option label="正面优势" value="positive" />
            <el-option label="中性描述" value="neutral" />
            <el-option label="负面警示" value="negative" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序" prop="sortOrder">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" class="w-full" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import AppPaginationBar from '../components/AppPaginationBar.vue'
import { DEFAULT_PAGE_SIZE, unwrapListPayload, reloadPagedListAfterRemoval } from '../utils/pagedApi.js'

const API_BASE = window.VITE_API_URL || window.location.origin
const headers = { 'Content-Type': 'application/json', 'x-user-id': 'default_user' }

const loading = ref(false)
const saving = ref(false)
const batchDeleting = ref(false)
const tableRef = ref(null)
const selectedRows = ref([])
const tableData = ref([])
const activeTier = ref('positive')
const page = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const total = ref(0)

const loadData = async () => {
  loading.value = true
  try {
    const q = new URLSearchParams({
      tier: activeTier.value,
      page: String(page.value),
      pageSize: String(pageSize.value),
    })
    const res = await fetch(`${API_BASE}/api/sentiment-lexicon?${q}`, { headers })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '加载失败')
    const { list, total: t } = unwrapListPayload(data)
    tableData.value = list
    total.value = t
    await nextTick()
    clearSelection()
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
    tableData.value = []
    total.value = 0
    await nextTick()
    clearSelection()
  } finally {
    loading.value = false
  }
}

const clearSelection = () => {
  tableRef.value?.clearSelection?.()
  selectedRows.value = []
}

const onSelectionChange = (rows) => {
  selectedRows.value = rows || []
}

watch(activeTier, () => {
  page.value = 1
  clearSelection()
  loadData()
})

const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const form = ref({ id: null, keyword: '', tier: 'positive', sortOrder: 0 })

const rules = {
  keyword: [{ required: true, message: '请输入关键词', trigger: 'blur' }],
  tier: [{ required: true, message: '请选择层级', trigger: 'change' }],
}

const openCreate = () => {
  isEdit.value = false
  form.value = { id: null, keyword: '', tier: activeTier.value, sortOrder: 0 }
  dialogVisible.value = true
}

const openEdit = (row) => {
  isEdit.value = true
  form.value = {
    id: row.id,
    keyword: row.keyword,
    tier: row.tier,
    sortOrder: row.sort_order ?? 0,
  }
  dialogVisible.value = true
}

const submitForm = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      const res = await fetch(`${API_BASE}/api/sentiment-lexicon/${form.value.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          keyword: form.value.keyword.trim(),
          tier: form.value.tier,
          sortOrder: form.value.sortOrder,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || '保存失败')
      ElMessage.success('已保存')
    } else {
      const res = await fetch(`${API_BASE}/api/sentiment-lexicon`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          keyword: form.value.keyword.trim(),
          tier: form.value.tier,
          sortOrder: form.value.sortOrder,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || '创建失败')
      ElMessage.success('已添加')
    }
    dialogVisible.value = false
    await loadData()
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    saving.value = false
  }
}

const onToggle = async (row, enabled) => {
  try {
    const res = await fetch(`${API_BASE}/api/sentiment-lexicon/${row.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ enabled }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '更新失败')
  } catch (e) {
    row.enabled = !enabled
    ElMessage.error(e.message || '更新失败')
  }
}

const handleDelete = async (id) => {
  try {
    const res = await fetch(`${API_BASE}/api/sentiment-lexicon/${id}`, { method: 'DELETE', headers })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '删除失败')
    ElMessage.success('已删除')
    clearSelection()
    await reloadPagedListAfterRemoval({ page, list: tableData, loadData })
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

const handleBatchDelete = async () => {
  const rows = selectedRows.value
  if (!rows.length) {
    ElMessage.warning('请先勾选要删除的关键词')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${rows.length} 条关键词？删除后不可恢复。`,
      '批量删除',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const ids = rows.map((r) => r.id).filter((id) => id != null)
  batchDeleting.value = true
  try {
    const res = await fetch(`${API_BASE}/api/sentiment-lexicon/batch-delete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      ElMessage.error(data.error || '批量删除失败')
      return
    }
    const n = Number(data.deletedCount) || 0
    ElMessage.success(n > 0 ? `已删除 ${n} 条` : '没有可删除的记录')
    clearSelection()
    await reloadPagedListAfterRemoval({ page, list: tableData, loadData })
  } catch {
    ElMessage.error('网络错误')
  } finally {
    batchDeleting.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.sl-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
</style>
