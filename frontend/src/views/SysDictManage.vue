<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
      <div>
        <div class="text-lg font-bold">字典管理</div>
        <div class="text-sm text-gray-500">
          字典类型分「标识 key」与「中文名 value」存库；条目为 data_key + 条目展示值
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <el-select
          v-model="filterDictType"
          placeholder="全部字典类型"
          clearable
          filterable
          allow-create
          default-first-option
          class="w-56"
          :disabled="loading"
          @change="onFilterDictTypeChange"
        >
          <el-option label="全部类型" value="" />
          <el-option
            v-for="opt in dictTypeSelectOptions"
            :key="opt.key"
            :label="opt.optionLabel"
            :value="opt.key"
          >
            <div class="flex justify-between gap-2 items-center">
              <span>{{ opt.labelZh }}</span>
              <span class="text-xs text-gray-400 font-mono shrink-0">{{ opt.key }}</span>
            </div>
          </el-option>
        </el-select>
        <el-button type="primary" :disabled="loading" @click="openCreate">
          <el-icon class="mr-1"><Plus /></el-icon>
          新增条目
        </el-button>
        <el-button :disabled="loading" @click="refresh">
          <el-icon class="mr-1"><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button
          type="danger"
          plain
          :disabled="loading || selectedRows.length === 0"
          :loading="batchDeleting"
          @click="handleBatchDelete"
        >
          批量删除{{ selectedRows.length ? `（${selectedRows.length}）` : '' }}
        </el-button>
      </div>
    </div>

    <el-table
      ref="tableRef"
      v-loading="loading"
      element-loading-text="更新列表中…"
      :data="tableData"
      row-key="id"
      stripe
      style="width: 100%"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="48" align="center" />
      <el-table-column prop="id" label="ID" width="70" align="center" />
      <el-table-column prop="dictType" label="类型标识(key)" min-width="130" show-overflow-tooltip />
      <el-table-column prop="dictTypeValue" label="类型名称(value)" min-width="130" show-overflow-tooltip />
      <el-table-column prop="dataKey" label="字典值key" min-width="110" show-overflow-tooltip />
      <el-table-column prop="dataValue" label="字典值value" min-width="120" show-overflow-tooltip />
      <el-table-column prop="sortOrder" label="排序" width="80" align="center" />
      <el-table-column label="启用" width="88" align="center">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
      <el-table-column prop="createdAt" label="创建时间" width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-popconfirm title="确定删除该字典项？" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger" size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && tableData.length === 0" description="暂无数据，可新增或调整筛选条件" />

    <AppPaginationBar
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
      :disabled="loading"
      @change="loadEntries"
    />

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑字典项' : '新增字典项'"
      width="520px"
      destroy-on-close
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="类型标识" prop="dictType">
          <el-select
            v-if="!isEdit"
            v-model="form.dictType"
            class="w-full"
            placeholder="选择已有类型，或输入新英文标识后回车"
            filterable
            allow-create
            clearable
          >
            <el-option
              v-for="opt in dictTypeSelectOptions"
              :key="opt.key"
              :label="opt.key"
              :value="opt.key"
            >
              <div class="flex justify-between gap-2 items-center">

                <span class="text-xs text-gray-400 font-mono shrink-0">{{ opt.key }}</span>
                <span>{{ opt.labelZh }}</span>
              </div>
            </el-option>
          </el-select>
          <el-input v-else v-model="form.dictType" disabled />
        </el-form-item>
        <el-form-item label="类型名称" prop="dictTypeValue">
          <el-input
            v-model="form.dictTypeValue"
            placeholder="中文名；选中有预设的类型会自动带出，也可自填或新建类型时必填"
            maxlength="255"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="字典值key" prop="dataKey">
          <el-input
            v-model="form.dataKey"
            placeholder="同一 dict_type 下唯一，如 01、02"
            :disabled="isEdit"
          />
        </el-form-item>
        <el-form-item label="字典值value" prop="dataValue">
          <el-input v-model="form.dataValue" placeholder="界面展示文案" />
        </el-form-item>
        <el-form-item label="排序" prop="sortOrder">
          <el-input-number v-model="form.sortOrder" :min="0" :max="999999" class="w-full" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onDeactivated, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import {
  fetchDictTypes,
  fetchDictEntries,
  suggestNextDictSortOrder,
  getApiBase,
  notifySysDictChanged,
} from '../utils/sysDict.js'
import { getToken } from '../utils/auth.js'
import { formatZhCnDateTime } from '../utils/dateTime.js'
import { DEFAULT_PAGE_SIZE, reloadPagedListAfterRemoval } from '../utils/pagedApi.js'
import AppPaginationBar from '../components/AppPaginationBar.vue'

const API_BASE = getApiBase()
const authHeaders = (json = false) => {
  const h = { Authorization: `Bearer ${getToken()}` }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

const loading = ref(false)
const submitting = ref(false)
const batchDeleting = ref(false)
const tableRef = ref(null)
const selectedRows = ref([])
const tableData = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)
/** 来自 sys_dict_type：{ dictTypeKey, dictTypeValue } */
const dictTypeDefs = ref([])
const filterDictType = ref('')

/** 筛选 / 表单下拉：中文（key） */
const dictTypeSelectOptions = computed(() =>
  [...dictTypeDefs.value]
    .map((d) => ({
      key: d.dictTypeKey,
      labelZh: d.dictTypeValue || d.dictTypeKey,
      optionLabel: `${d.dictTypeValue || d.dictTypeKey}（${d.dictTypeKey}）`,
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
)

const onFilterDictTypeChange = () => {
  page.value = 1
  loadEntries()
}

const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const form = ref({
  id: null,
  dictType: '',
  dictTypeValue: '',
  dataKey: '',
  dataValue: '',
  sortOrder: 0,
  enabled: true,
  remark: ''
})

const keyPattern = /^[a-zA-Z0-9_-]{1,64}$/

const rules = {
  dictType: [
    { required: true, message: '请选择或输入类型标识', trigger: 'change' },
    {
      validator: (_, v, cb) => {
        if (!keyPattern.test(v || '')) {
          cb(new Error('仅字母、数字、下划线、中划线，1–64 字符'))
        } else cb()
      },
      trigger: ['blur', 'change']
    }
  ],
  dataKey: [
    { required: true, message: '请输入键', trigger: 'blur' },
    {
      validator: (_, v, cb) => {
        if (!keyPattern.test(v || '')) {
          cb(new Error('仅字母、数字、下划线、中划线，1–64 字符'))
        } else cb()
      },
      trigger: 'blur'
    }
  ],
  dataValue: [{ required: true, message: '请输入展示值', trigger: 'blur' }],
  dictTypeValue: [
    { required: true, message: '请输入字典类型中文名', trigger: 'blur' },
    {
      validator: (_, v, cb) => {
        if (!String(v || '').trim()) {
          cb(new Error('字典类型中文名不能为空'))
        } else if (String(v).trim().length > 255) {
          cb(new Error('最多 255 字'))
        } else cb()
      },
      trigger: ['blur', 'change']
    }
  ]
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return formatZhCnDateTime(dateStr)
}

const loadTypes = async () => {
  dictTypeDefs.value = await fetchDictTypes()
}

/** 新增时：根据类型带出中文名，并自动计算排序 */
const applyCreateDictTypeDefaults = async (dictTypeKey) => {
  if (isEdit.value) return
  const key = (dictTypeKey || '').trim()
  if (!key) {
    form.value.dictTypeValue = ''
    form.value.sortOrder = 0
    return
  }
  const d = dictTypeDefs.value.find((x) => x.dictTypeKey === key)
  if (d?.dictTypeValue) {
    form.value.dictTypeValue = d.dictTypeValue
  } else if (!form.value.dictTypeValue) {
    form.value.dictTypeValue = ''
  }
  form.value.sortOrder = await suggestNextDictSortOrder(key)
}

watch(
  () => form.value.dictType,
  (k) => {
    applyCreateDictTypeDefaults(k)
  }
)

/** 仅拉取条目并写入表格（不含 loading，供并行请求复用） */
const onSelectionChange = (rows) => {
  selectedRows.value = rows || []
}

const loadEntriesCore = async () => {
  const { list, total: t } = await fetchDictEntries(filterDictType.value, {
    page: page.value,
    pageSize: pageSize.value,
  })
  tableData.value = list
  total.value = t
  tableRef.value?.clearSelection?.()
  selectedRows.value = []
}

const loadEntries = async () => {
  loading.value = true
  try {
    await loadEntriesCore()
  } finally {
    loading.value = false
  }
}

/** 保存成功后刷新类型 + 列表（由调用方控制 table loading） */
const reloadAfterMutation = async () => {
  await Promise.all([loadTypes(), loadEntriesCore()])
}

/** 进入页 / 手动刷新：全页 loading + 类型与条目并行 */
const refresh = async () => {
  loading.value = true
  try {
    await Promise.all([loadTypes(), loadEntriesCore()])
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  form.value = {
    id: null,
    dictType: filterDictType.value || '',
    dictTypeValue: '',
    dataKey: '',
    dataValue: '',
    sortOrder: 0,
    enabled: true,
    remark: ''
  }
  formRef.value?.clearValidate?.()
}

const openCreate = async () => {
  isEdit.value = false
  resetForm()
  const fk = (filterDictType.value || '').trim()
  form.value.dictType = fk
  if (fk) {
    await applyCreateDictTypeDefaults(fk)
  }
  dialogVisible.value = true
}

const openEdit = (row) => {
  isEdit.value = true
  form.value = {
    id: row.id,
    dictType: row.dictType || row.dict_type || '',
    dictTypeValue: row.dictTypeValue ?? row.dict_type_value ?? '',
    dataKey: row.dataKey || row.data_key || '',
    dataValue: row.dataValue || row.data_value || '',
    sortOrder: row.sortOrder ?? row.sort_order ?? 0,
    enabled: row.enabled !== false,
    remark: row.remark || ''
  }
  dialogVisible.value = true
}

const handleSubmit = async () => {
  const ok = await formRef.value?.validate?.().catch(() => false)
  if (!ok) return

  submitting.value = true
  try {
    if (isEdit.value) {
      const res = await fetch(`${API_BASE}/api/sys-dict/entries/${form.value.id}`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify({
          dictType: form.value.dictType,
          dictTypeValue: form.value.dictTypeValue?.trim(),
          dataKey: form.value.dataKey,
          dataValue: form.value.dataValue,
          sortOrder: form.value.sortOrder,
          enabled: form.value.enabled,
          remark: form.value.remark || null
        })
      })
      const errData = await res.json().catch(() => ({}))
      if (!res.ok) {
        ElMessage.error(errData.error || '保存失败')
        return
      }
      ElMessage.success('已保存')
      notifySysDictChanged(form.value.dictType)
    } else {
      const res = await fetch(`${API_BASE}/api/sys-dict/entries`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          dictType: form.value.dictType,
          dictTypeValue: form.value.dictTypeValue?.trim(),
          dataKey: form.value.dataKey,
          dataValue: form.value.dataValue,
          sortOrder: form.value.sortOrder,
          enabled: form.value.enabled,
          remark: form.value.remark || null
        })
      })
      const errData = await res.json().catch(() => ({}))
      if (!res.ok) {
        ElMessage.error(errData.error || '创建失败')
        return
      }
      ElMessage.success('已创建')
      notifySysDictChanged(form.value.dictType)
    }
    dialogVisible.value = false
    submitting.value = false
    loading.value = true
    try {
      await reloadAfterMutation()
    } finally {
      loading.value = false
    }
  } catch (e) {
    ElMessage.error('网络错误')
  } finally {
    submitting.value = false
  }
}

const handleDelete = async (id) => {
  const row = tableData.value.find((r) => r.id === id)
  const dictType = row?.dictType || row?.dict_type
  try {
    const res = await fetch(`${API_BASE}/api/sys-dict/entries/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    const errData = await res.json().catch(() => ({}))
    if (!res.ok) {
      ElMessage.error(errData.error || '删除失败')
      return
    }
    ElMessage.success('已删除')
    notifySysDictChanged(dictType)
    tableRef.value?.clearSelection?.()
    selectedRows.value = []
    await reloadPagedListAfterRemoval({ page, list: tableData, loadData: loadEntriesCore })
  } catch {
    ElMessage.error('网络错误')
  }
}

const handleBatchDelete = async () => {
  const rows = selectedRows.value
  if (!rows.length) {
    ElMessage.warning('请先勾选要删除的字典项')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${rows.length} 条字典项？删除后不可恢复。`,
      '批量删除',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const ids = rows.map((r) => r.id).filter((id) => id != null)
  batchDeleting.value = true
  try {
    const res = await fetch(`${API_BASE}/api/sys-dict/entries/batch-delete`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({ ids }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      ElMessage.error(data.error || '批量删除失败')
      return
    }
    const n = Number(data.deletedCount) || 0
    ElMessage.success(n > 0 ? `已删除 ${n} 条` : '没有可删除的记录')
    const changedTypes = [...new Set(rows.map((r) => r.dictType || r.dict_type).filter(Boolean))]
    changedTypes.forEach((t) => notifySysDictChanged(t))
    tableRef.value?.clearSelection?.()
    selectedRows.value = []
    await reloadPagedListAfterRemoval({ page, list: tableData, loadData: loadEntriesCore })
  } catch {
    ElMessage.error('网络错误')
  } finally {
    batchDeleting.value = false
  }
}

onMounted(() => {
  refresh()
})

onDeactivated(() => {
  loading.value = false
})
</script>

<style scoped>
.w-44 {
  width: 11rem;
}
</style>
