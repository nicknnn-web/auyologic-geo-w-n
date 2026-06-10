<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
      <div>
        <div class="text-lg font-bold">情感词管理</div>
        <div class="text-sm text-gray-500 mt-1">
          词条来自当前最新已完成体检任务的词云结果；AI
          在分词时会将近义表达归为小类并以树形展示。主词可溯源原文片段，子词情感与主词一致。
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <el-button
          type="warning"
          plain
          :disabled="loading || rebuildingWc"
          :loading="rebuildingWc"
          @click="handleRebuildWordCloud"
        >
          重建词云
        </el-button>
        <el-button
          :disabled="loading || !canMergeSynonyms || mergeSynonymsSubmitting"
          :loading="mergeSynonymsSubmitting"
          @click="openMergeDialog"
        >
          合并同义词
        </el-button>
        <el-button
          :disabled="loading || !canBatchModifyTier || batchTierSubmitting"
          :loading="batchTierSubmitting"
          @click="openBatchTierDialog"
        >
          批量修改情感
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
        <el-button type="primary" @click="openCreate">
          <el-icon class="mr-1"><Plus /></el-icon>
          新增关键词
        </el-button>
      </div>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-2">
      <el-tabs v-model="activeTier" class="sl-tabs flex-1">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane label="正面优势" name="positive" />
        <el-tab-pane label="中性描述" name="neutral" />
        <el-tab-pane label="负面警示" name="negative" />
      </el-tabs>
      <el-input
        v-model="searchText"
        clearable
        placeholder="搜索关键词"
        class="sl-search"
        style="max-width: 240px"
      />
    </div>

    <el-table
      :key="tableRenderKey"
      ref="tableRef"
      v-loading="loading"
      :data="tableData"
      row-key="id"
      :tree-props="{ children: 'children' }"
      :row-class-name="slTableRowClassName"
      default-expand-all
      class="mt-2 sl-tree-table"
      style="width: 100%"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="48" align="center" />
      <el-table-column label="关键词 / 提取词" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          <span :class="row.parent_id ? 'sl-kw-child' : 'sl-kw-root'">{{ row.keyword }}</span>
        </template>
      </el-table-column>
      <el-table-column label="出现频次" width="120" align="center">
        <template #default="{ row }">
          <span>{{ row.hit_count > 0 ? row.hit_count : '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="AI 情感判定" min-width="160" align="center">
        <template #default="{ row }">
          <template v-if="!row.parent_id">
            <el-select
              :model-value="row.tier"
              size="small"
              class="sl-tier-select"
              @update:model-value="(v) => onTierChange(row, v)"
            >
              <el-option label="正面优势" value="positive" />
              <el-option label="中性描述" value="neutral" />
              <el-option label="负面警示" value="negative" />
            </el-select>
          </template>
          <span v-else class="text-sm text-gray-400">跟随主词</span>
        </template>
      </el-table-column>
      <el-table-column prop="enabled" label="启用" width="90" align="center">
        <template #default="{ row }">
          <el-switch v-model="row.enabled" @change="(v) => onToggle(row, v)" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openTrace(row)">溯源</el-button>
          <el-button v-if="row.parent_id" link type="warning" size="small" @click="unlinkRow(row)">移除</el-button>
          <el-button v-if="!row.parent_id" link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-popconfirm title="确定删除该词？" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger" size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && total === 0" class="mt-4" description="暂无词条，可重建词云或新增关键词" />

    <AppPaginationBar
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
      :disabled="loading"
      @change="loadData"
    />

    <el-dialog
      v-model="batchTierDialogVisible"
      title="批量修改 AI 情感"
      width="440px"
      destroy-on-close
      @closed="batchTierValue = 'positive'"
    >
      <p class="text-sm text-gray-600 mb-3">仅主词（根词条）会改档，子词随主词同步为所选情感。</p>
      <div class="text-sm font-medium text-gray-700 mb-2">选择目标情感</div>
      <el-select v-model="batchTierValue" class="w-full" placeholder="请选择情感档位">
        <el-option label="正面优势" value="positive" />
        <el-option label="中性描述" value="neutral" />
        <el-option label="负面警示" value="negative" />
      </el-select>
      <template #footer>
        <el-button @click="batchTierDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchTierSubmitting" @click="submitBatchTier">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="mergeDialogVisible"
      title="合并同义词"
      width="440px"
      destroy-on-close
      @closed="resetMergeDialog"
    >
      <p class="text-sm text-gray-600 mb-3">
        勾选为「来源」：有子主词会删除该主词节点并将其<span class="font-medium text-gray-800">全部</span>子级挂到目标下；无子主词整行改为目标下的子词；子词改挂目标。目标主词若在勾选内会自动排除。也可只勾选多个无子主词，在下方指定挂到哪个主词下。
      </p>
      <div class="text-sm font-medium text-gray-700 mb-2">主词</div>
      <el-select
        v-model="mergeTargetKeyword"
        class="w-full mb-4"
        filterable
        allow-create
        default-first-option
        clearable
        placeholder="选择已有主词或输入新主词"
      >
        <el-option v-for="o in mergeRootOptions" :key="o.id" :label="o.label" :value="o.value" />
      </el-select>
      <div class="text-sm font-medium text-gray-700 mb-2">AI 情感</div>
      <p v-if="mergeTargetRootId != null" class="text-xs text-gray-500 mb-2">已选列表中的主词为目标时，档位与目标主词一致，不可在此修改。</p>
      <el-select
        v-model="mergeTierValue"
        class="w-full"
        :disabled="mergeTargetRootId != null"
        placeholder="请选择情感档位"
      >
        <el-option label="正面优势" value="positive" />
        <el-option label="中性描述" value="neutral" />
        <el-option label="负面警示" value="negative" />
      </el-select>
      <template #footer>
        <el-button @click="mergeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="mergeSynonymsSubmitting" @click="submitMergeSynonyms">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑关键词' : '新增关键词'" width="480px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="关键词" prop="keyword">
          <el-input
            v-model="form.keyword"
            placeholder="2～4 字为宜，如：翻车、避雷、好评"
            maxlength="4"
            show-word-limit
          />
        </el-form-item>
        <el-form-item v-if="!isEdit" label="层级" prop="tier">
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

    <el-dialog v-model="traceVisible" title="原始文本片段" width="640px" destroy-on-close @closed="traceSnippets = []">
      <div v-if="traceLoading" class="text-center text-gray-500 py-8">加载中…</div>
      <div v-else-if="!traceSnippets.length" class="text-center text-gray-500 py-8">未在探针原文中检索到该词命中</div>
      <div v-else class="space-y-4 max-h-[60vh] overflow-y-auto">
        <div
          v-for="(s, idx) in traceSnippets"
          :key="`${s.analysis_id}-${idx}`"
          class="rounded border border-gray-100 bg-gray-50 p-3 text-sm"
        >
          <div class="text-xs text-gray-400 mb-2">分析记录 #{{ s.analysis_id }}</div>
          <div class="text-gray-800 leading-relaxed sl-excerpt" v-html="highlightKeyword(s.excerpt, traceKeyword)"></div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { getToken } from '../utils/auth.js'
import { ref, watch, onMounted, onDeactivated, nextTick, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { DEFAULT_PAGE_SIZE, reloadPagedListAfterRemoval, unwrapListPayload } from '../utils/pagedApi.js'
import AppPaginationBar from '../components/AppPaginationBar.vue'

const API_BASE = window.VITE_API_URL || window.location.origin
const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() }

const loading = ref(false)
const saving = ref(false)
const batchDeleting = ref(false)
const rebuildingWc = ref(false)
const tableRef = ref(null)
const selectedRows = ref([])
const tableData = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const activeTier = ref('all')
const searchText = ref('')

const traceVisible = ref(false)
const traceLoading = ref(false)
const traceKeyword = ref('')
const traceSnippets = ref([])

const tableRenderKey = ref(0)
const batchTierDialogVisible = ref(false)
const batchTierValue = ref('positive')
const batchTierSubmitting = ref(false)

const mergeDialogVisible = ref(false)
const mergeTargetKeyword = ref('')
const mergeTierValue = ref('positive')
const mergeTargetRootId = ref(null)
const mergeSynonymsSubmitting = ref(false)

const tierLabelZh = (t) =>
  ({ positive: '正面优势', neutral: '中性描述', negative: '负面警示' }[String(t)] || String(t))

const canBatchModifyTier = computed(
  () => selectedRows.value.length > 0 && selectedRows.value.every((r) => !r.parent_id)
)

/** 至少勾选一条即可打开合并；目标在弹窗中指定（可与勾选重叠，目标主词会从来源中排除） */
const canMergeSynonyms = computed(() => selectedRows.value.length > 0)

const mergeRootOptions = computed(() =>
  tableData.value
    .filter((r) => !r.parent_id)
    .map((r) => ({
      id: r.id,
      value: r.keyword,
      label: `${r.keyword}（${tierLabelZh(r.tier)}）`,
    }))
)

watch([mergeTargetKeyword, mergeTierValue], () => {
  const k = String(mergeTargetKeyword.value ?? '').trim()
  if (!k) {
    mergeTargetRootId.value = null
    return
  }
  const roots = tableData.value.filter((r) => !r.parent_id && String(r.keyword ?? '').trim() === k)
  if (!roots.length) {
    mergeTargetRootId.value = null
    return
  }
  const byTier = roots.find((r) => r.tier === mergeTierValue.value)
  if (byTier) {
    mergeTargetRootId.value = byTier.id
    return
  }
  if (roots.length === 1) {
    mergeTargetRootId.value = roots[0].id
    mergeTierValue.value = roots[0].tier
    return
  }
  mergeTargetRootId.value = null
})

/** 消费 response body 一次并安全解析 JSON，避免空体或非 JSON 时异常 */
const parseJsonResponse = async (res) => {
  const text = await res.text()
  if (!text?.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { success: false, error: '接口返回非 JSON（可能是网关错误或超时页）' }
  }
}

const REBUILD_WORDCLOUD_TIMEOUT_MS = 720000

let searchDebounceTimer = null
watch(searchText, () => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    page.value = 1
    loadData()
  }, 300)
})

const handleRebuildWordCloud = async () => {
  try {
    await ElMessageBox.confirm(
      '【按钮作用】根据当前企业下「最新一条已完成体检任务」的全部探针回答原文，重新调用词云大模型分批抽取短语，并覆盖写入本页管理的词云表。\n\n' +
        '【影响范围】会删除该任务下已有词条再写入新结果；您在本页手工增删改的词条也会一并丢失。\n\n' +
        '【耗时】回答较多时可能持续数分钟；若网关先断开，可稍后刷新列表确认是否已写入。\n\n' +
        '与任务分析完成后自动执行的词云入库逻辑相同。是否继续？',
      '确认：从探针回答重建词云',
      {
        type: 'warning',
        confirmButtonText: '开始重建',
        cancelButtonText: '取消',
        distinguishCancelAndClose: true,
      }
    )
  } catch {
    return
  }
  rebuildingWc.value = true
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), REBUILD_WORDCLOUD_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/api/sentiment-lexicon/rebuild-word-cloud`, {
      method: 'POST',
      headers,
      body: '{}',
      signal: ac.signal,
    })
    const data = await parseJsonResponse(res)
    if (!res.ok || !data.success) {
      ElMessage.error(data.error || `重建失败（HTTP ${res.status}）`)
      return
    }
    const n = Number(data.wordCount) || 0
    ElMessage.success(`重建完成，已写入 ${n} 条词条（任务 #${data.taskId}）。请重新打开体检报告以刷新词云缓存。`)
    await loadData()
  } catch (e) {
    if (e?.name === 'AbortError') {
      ElMessage.error('请求超时：词云可能仍在后台执行，请稍后刷新本页或查看服务器日志。')
    } else {
      ElMessage.error(e?.message || '网络错误')
    }
  } finally {
    clearTimeout(timer)
    rebuildingWc.value = false
  }
}

const loadData = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      tier: activeTier.value,
      page: String(page.value),
      pageSize: String(pageSize.value),
    })
    const q = String(searchText.value || '').trim()
    if (q) params.set('search', q)
    const res = await fetch(`${API_BASE}/api/sentiment-lexicon?${params}`, { headers })
    const data = await parseJsonResponse(res)
    if (!res.ok || !data.success) throw new Error(data.error || '加载失败')
    const { list, total: t } = unwrapListPayload(data)
    tableData.value = list
    total.value = t
    tableRenderKey.value += 1
    await nextTick()
    clearSelection()
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
    tableData.value = []
    total.value = 0
    tableRenderKey.value += 1
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

/** 树表行样式：主词略加重，子词略浅 */
const slTableRowClassName = ({ row }) => (row.parent_id ? 'sl-table-row-child' : 'sl-table-row-root')

const openBatchTierDialog = () => {
  if (!canBatchModifyTier.value) {
    ElMessage.warning('请仅勾选主词（根词条）。勾选中包含子词时无法批量修改情感。')
    return
  }
  batchTierValue.value = selectedRows.value[0]?.tier || 'positive'
  batchTierDialogVisible.value = true
}

const openMergeDialog = () => {
  if (!canMergeSynonyms.value) {
    ElMessage.warning('请先勾选至少一条词条。')
    return
  }
  mergeTargetKeyword.value = ''
  mergeTierValue.value = 'positive'
  mergeTargetRootId.value = null
  const rootsInSel = selectedRows.value.filter((r) => !r.parent_id)
  if (rootsInSel.length === 1) {
    const p = rootsInSel[0]
    mergeTargetKeyword.value = String(p.keyword ?? '').trim()
    mergeTierValue.value = p.tier || 'positive'
    mergeTargetRootId.value = p.id
  }
  mergeDialogVisible.value = true
}

const resetMergeDialog = () => {
  mergeTargetKeyword.value = ''
  mergeTierValue.value = 'positive'
  mergeTargetRootId.value = null
}

const submitMergeSynonyms = async () => {
  const kw = String(mergeTargetKeyword.value || '').trim()
  if (!kw) {
    ElMessage.warning('请选择或输入主词')
    return
  }
  const n = [...kw].length
  if (n < 1 || n > MAX_KW) {
    ElMessage.warning(`主词须为 1～${MAX_KW} 个字`)
    return
  }
  const selectedIds = selectedRows.value.map((r) => r.id).filter((x) => x != null)
  if (!selectedIds.length) {
    ElMessage.warning('没有可提交的勾选')
    return
  }
  if (
    mergeTargetRootId.value != null &&
    selectedIds.length === 1 &&
    selectedIds[0] === mergeTargetRootId.value
  ) {
    ElMessage.warning('请同时勾选至少一条要并入该主词的其它词条，或更换合并目标')
    return
  }
  mergeSynonymsSubmitting.value = true
  try {
    const body = {
      selectedIds,
      targetKeyword: kw,
      tier: mergeTierValue.value,
    }
    if (mergeTargetRootId.value != null) {
      body.targetRootId = mergeTargetRootId.value
    }
    const res = await fetch(`${API_BASE}/api/sentiment-lexicon/merge-synonyms`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const data = await parseJsonResponse(res)
    if (!res.ok || !data.success) {
      ElMessage.error(data.error || `合并失败（HTTP ${res.status}）`)
      return
    }
    const d = Number(data.deletedHeadCount) || 0
    const parts = []
    if (data.createdRoot) parts.push('已新建目标主词')
    if (d > 0) parts.push(`已删除 ${d} 个原主词节点`)
    parts.push('合并完成')
    ElMessage.success(parts.join('，'))
    mergeDialogVisible.value = false
    await loadData()
  } catch (e) {
    ElMessage.error(e?.message || '网络错误')
  } finally {
    mergeSynonymsSubmitting.value = false
  }
}

const submitBatchTier = async () => {
  const ids = selectedRows.value
    .filter((r) => !r.parent_id)
    .map((r) => r.id)
    .filter((x) => x != null)
  if (!ids.length) {
    ElMessage.warning('没有可提交的主词勾选')
    return
  }
  batchTierSubmitting.value = true
  try {
    const res = await fetch(`${API_BASE}/api/sentiment-lexicon/batch-tier`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids, tier: batchTierValue.value }),
    })
    const data = await parseJsonResponse(res)
    if (!res.ok || !data.success) {
      ElMessage.error(data.error || `批量改档失败（HTTP ${res.status}）`)
      return
    }
    const n = Number(data.updatedCount) || 0
    const roots = Number(data.rootCount) || 0
    ElMessage.success(`已更新 ${n} 条（涉及主词 ${roots} 个）`)
    batchTierDialogVisible.value = false
    await loadData()
  } catch (e) {
    ElMessage.error(e?.message || '网络错误')
  } finally {
    batchTierSubmitting.value = false
  }
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

const MAX_KW = 4

const rules = {
  keyword: [
    { required: true, message: '请输入关键词', trigger: 'blur' },
    {
      validator: (_r, v, cb) => {
        const s = String(v || '').trim()
        const n = [...s].length
        if (n < 1) cb(new Error('请输入关键词'))
        else if (n > MAX_KW) cb(new Error(`最多 ${MAX_KW} 个字`))
        else cb()
      },
      trigger: 'blur',
    },
  ],
  tier: [{ required: true, message: '请选择层级', trigger: 'change' }],
}

const openCreate = () => {
  isEdit.value = false
  form.value = { id: null, keyword: '', tier: activeTier.value === 'all' ? 'positive' : activeTier.value, sortOrder: 0 }
  dialogVisible.value = true
}

const openEdit = (row) => {
  if (row.parent_id) {
    ElMessage.warning('请先移除子词归属后再编辑为独立主词')
    return
  }
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
      const data = await parseJsonResponse(res)
      if (!res.ok || !data.success) throw new Error(data.error || '保存失败')
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
      const data = await parseJsonResponse(res)
      if (!res.ok || !data.success) throw new Error(data.error || '创建失败')
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
    const data = await parseJsonResponse(res)
    if (!res.ok || !data.success) throw new Error(data.error || '更新失败')
  } catch (e) {
    row.enabled = !enabled
    ElMessage.error(e.message || '更新失败')
  }
}

const onTierChange = async (row, tier) => {
  if (row.parent_id) return
  const prev = row.tier
  row.tier = tier
  try {
    const res = await fetch(`${API_BASE}/api/sentiment-lexicon/${row.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ tier }),
    })
    const data = await parseJsonResponse(res)
    if (!res.ok || !data.success) throw new Error(data.error || '更新失败')
    await loadData()
  } catch (e) {
    row.tier = prev
    ElMessage.error(e.message || '更新失败')
  }
}

const unlinkRow = async (row) => {
  if (!row?.id) return
  try {
    await ElMessageBox.confirm('确定将该子词从主词下移除？', '移除', {
      type: 'warning',
      confirmButtonText: '移除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    const res = await fetch(`${API_BASE}/api/sentiment-lexicon/${row.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ parentId: null }),
    })
    const data = await parseJsonResponse(res)
    if (!res.ok || !data.success) throw new Error(data.error || '移除失败')
    ElMessage.success('已移除归属')
    await loadData()
  } catch (e) {
    ElMessage.error(e.message || '移除失败')
  }
}

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const highlightKeyword = (excerpt, keyword) => {
  const e = escapeHtml(excerpt == null ? '' : excerpt)
  const k = escapeHtml(keyword || '')
  if (!k) return e
  return e.split(k).join(`<mark class="sl-mark">${k}</mark>`)
}

const openTrace = async (row) => {
  traceKeyword.value = String(row.keyword || '')
  traceVisible.value = true
  traceLoading.value = true
  traceSnippets.value = []
  try {
    const res = await fetch(`${API_BASE}/api/sentiment-lexicon/${row.id}/trace`, { headers })
    const data = await parseJsonResponse(res)
    if (!res.ok || !data.success) throw new Error(data.error || '加载失败')
    traceSnippets.value = Array.isArray(data.snippets) ? data.snippets : []
    if (data.keyword) traceKeyword.value = data.keyword
  } catch (e) {
    ElMessage.error(e.message || '溯源失败')
  } finally {
    traceLoading.value = false
  }
}

const handleDelete = async (id) => {
  try {
    const res = await fetch(`${API_BASE}/api/sentiment-lexicon/${id}`, { method: 'DELETE', headers })
    const data = await parseJsonResponse(res)
    if (!res.ok || !data.success) throw new Error(data.error || '删除失败')
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
      `确定删除选中的 ${rows.length} 条？删除主词将同时删除其下子词。`,
      '批量删除',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const ids = rows.map((r) => r.id).filter((x) => x != null)
  batchDeleting.value = true
  try {
    const res = await fetch(`${API_BASE}/api/sentiment-lexicon/batch-delete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
    })
    const data = await parseJsonResponse(res)
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

onDeactivated(() => {
  loading.value = false
})
</script>

<style scoped>
.sl-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.sl-tree-table :deep(.sl-table-row-root > td) {
  background-color: #fafafa;
}
.sl-tree-table :deep(.sl-table-row-child > td) {
  background-color: #fff;
}
.sl-kw-root {
  font-weight: 600;
  font-size: 14px;
  color: #111827;
  letter-spacing: 0.02em;
}
.sl-kw-child {
  font-weight: 400;
  font-size: 13px;
  color: #64748b;
}
.sl-tier-select {
  width: 130px;
}
.sl-mark {
  background: #fff3bf;
  padding: 0 2px;
  border-radius: 2px;
}
.sl-excerpt {
  word-break: break-word;
}
</style>
