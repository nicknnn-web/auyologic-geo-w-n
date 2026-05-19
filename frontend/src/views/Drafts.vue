<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex items-center mb-4">
      <div>
        <div class="text-lg font-bold">草稿箱</div>
        <div class="text-sm text-gray-500">管理 AI 创作的文章草稿；支持文件夹与搜索</div>
      </div>
    </div>

    <div class="drafts-layout">
      <aside class="drafts-sidebar">
        <div class="drafts-sidebar-search">
          <el-input
            v-model="draftSearchQ"
            clearable
            placeholder="搜索标题、品牌、正文…"
            @keyup.enter="onDraftSearch"
            @clear="onDraftSearch"
          >
            <template #append>
              <el-button :loading="loading" @click="onDraftSearch">搜索</el-button>
            </template>
          </el-input>
        </div>
        <div class="drafts-sidebar-actions">
          <el-button type="primary" size="small" plain @click="openCreateFolderDialog">
            <el-icon class="mr-1"><FolderAdd /></el-icon>
            新建文件夹
          </el-button>
          <el-button
            size="small"
            plain
            :disabled="!isRealFolderId(currentFolderId)"
            @click="openRenameFolderDialog"
          >
            重命名
          </el-button>
        </div>
        <el-tree
          v-loading="folderTreeLoading"
          class="drafts-folder-tree"
          :data="folderTreeData"
          node-key="id"
          :props="{ label: 'label', children: 'children' }"
          highlight-current
          :expand-on-click-node="false"
          default-expand-all
          :current-node-key="currentFolderId"
          @node-click="onFolderNodeClick"
        >
          <template #default="{ node, data }">
            <div class="folder-tree-node">
              <span class="folder-tree-node-label" :title="node.label">{{ node.label }}</span>
              <el-icon
                v-if="isRealFolderId(data.id)"
                class="folder-tree-node-delete"
                title="删除文件夹"
                @click.stop="handleDeleteFolderNode(data)"
              >
                <Delete />
              </el-icon>
            </div>
          </template>
        </el-tree>
      </aside>

      <div class="drafts-main">
        <div class="flex items-center mb-4">
          <div class="text-sm text-gray-600 flex-1">
            <span v-if="currentFolderLabel">{{ currentFolderLabel }}</span>
            <span v-else>全部草稿</span>
            <span class="text-gray-400"> · 共 {{ total }} 条</span>
          </div>
          <div class="flex items-center gap-2">
            <el-button
              type="danger"
              @click="handleBatchDelete"
              :disabled="selectedRows.length === 0"
              plain
            >
              <el-icon class="mr-1"><Delete /></el-icon>
              批量删除{{ selectedRows.length > 0 ? ` (${selectedRows.length})` : '' }}
            </el-button>
            <el-button type="primary" @click="goCreate">
              <el-icon class="mr-1"><Plus /></el-icon>
              新建创作
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
          <el-table-column prop="title" label="文章标题" min-width="180" show-overflow-tooltip />
          <el-table-column prop="brand" label="品牌" width="120" show-overflow-tooltip />
          <el-table-column label="文件夹" width="110" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.folderName || '未分类' }}
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === '已发布' ? 'success' : 'warning'">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="180">
            <template #default="{ row }">{{ formatCreatedAt(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="250" align="center" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="handlePreview(row)">查看</el-button>
              <el-button link type="success" size="small" @click="handleEdit(row)">编辑</el-button>
              <el-button link type="warning" size="small" @click="handlePublish(row)">发布</el-button>
              <el-popconfirm title="确定删除吗?" @confirm="handleDelete(row.id)">
                <template #reference>
                  <el-button link type="danger" size="small">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-if="!loading && tableData.length === 0" description="暂无草稿，请新建创作或切换文件夹" />

        <AppPaginationBar
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
          @change="loadData"
        />
      </div>
    </div>

    <!-- 预览弹窗 -->
    <el-dialog v-model="previewVisible" title="文章预览" width="70%" top="5vh">
      <div v-if="currentDraft" class="p-4 preview-content">
        <div class="text-xl font-bold text-purple-600 mb-4">{{ currentDraft.title }}</div>
        <div class="markdown-body" v-html="renderedContent" />
      </div>
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
        <el-button type="primary" @click="handleEdit(currentDraft); previewVisible = false">编辑</el-button>
        <el-button type="success" @click="handlePublish(currentDraft)">发布</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="folderDialogVisible"
      :title="folderDialogMode === 'create' ? '新建文件夹' : '重命名文件夹'"
      width="400px"
      destroy-on-close
      @closed="folderFormName = ''"
    >
      <el-input
        v-model="folderFormName"
        maxlength="255"
        show-word-limit
        placeholder="文件夹名称"
        @keyup.enter="submitFolderDialog"
      />
      <template #footer>
        <el-button @click="folderDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="folderDialogSubmitting" @click="submitFolderDialog">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, FolderAdd } from '@element-plus/icons-vue'
import { draftsAPI, draftFolderAPI } from '../utils/api'
import { DEFAULT_PAGE_SIZE, reloadPagedListAfterRemoval } from '../utils/pagedApi.js'
import AppPaginationBar from '../components/AppPaginationBar.vue'
import { formatZhCnDateTime } from '../utils/dateTime.js'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ breaks: true, gfm: true })

const API_BASE_URL = window.VITE_API_URL || window.location.origin
const router = useRouter()

const tableData = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const loading = ref(false)
const previewVisible = ref(false)
const currentDraft = ref(null)
const selectedRows = ref([])

const folderTreeLoading = ref(false)
const folderTreeData = ref([])
const currentFolderId = ref('__all__')
const draftSearchQ = ref('')
const folderDialogVisible = ref(false)
const folderDialogMode = ref('create')
const folderFormName = ref('')
const folderDialogSubmitting = ref(false)

const isRealFolderId = (id) => {
  const n = Number(id)
  return Number.isFinite(n) && n > 0
}

const resolveFolderIdForCreate = () => {
  if (isRealFolderId(currentFolderId.value)) return Number(currentFolderId.value)
  return null
}

const currentFolderLabel = computed(() => {
  const find = (nodes) => {
    for (const n of nodes || []) {
      if (String(n.id) === String(currentFolderId.value)) return n.label
      const c = find(n.children)
      if (c) return c
    }
    return null
  }
  return find(folderTreeData.value) || ''
})

const renderedContent = computed(() => {
  if (!currentDraft.value?.content) return ''
  const html = marked(currentDraft.value.content)
  return DOMPurify.sanitize(html)
})

const formatCreatedAt = (v) => (v ? formatZhCnDateTime(v) : '-')

const loadFolderTree = async () => {
  folderTreeLoading.value = true
  try {
    const res = await draftFolderAPI.tree()
    folderTreeData.value = Array.isArray(res?.tree) ? res.tree : []
  } catch (e) {
    console.warn('加载草稿文件夹失败', e)
    folderTreeData.value = [
      { id: '__all__', label: '全部草稿', children: [] },
      { id: '__uncategorized__', label: '未分类', children: [] },
    ]
  } finally {
    folderTreeLoading.value = false
  }
}

const onFolderNodeClick = (node) => {
  if (!node?.id) return
  currentFolderId.value = node.id
  draftSearchQ.value = ''
  page.value = 1
  loadData()
}

const onDraftSearch = () => {
  page.value = 1
  loadData()
}

const openCreateFolderDialog = () => {
  folderDialogMode.value = 'create'
  folderFormName.value = ''
  folderDialogVisible.value = true
}

const openRenameFolderDialog = () => {
  if (!isRealFolderId(currentFolderId.value)) return
  folderDialogMode.value = 'rename'
  folderFormName.value = currentFolderLabel.value || ''
  folderDialogVisible.value = true
}

const submitFolderDialog = async () => {
  const name = folderFormName.value.trim()
  if (!name) {
    ElMessage.warning('请输入文件夹名称')
    return
  }
  folderDialogSubmitting.value = true
  try {
    if (folderDialogMode.value === 'create') {
      let parentId = null
      if (isRealFolderId(currentFolderId.value)) parentId = Number(currentFolderId.value)
      await draftFolderAPI.create({ name, parentId })
      ElMessage.success('文件夹已创建')
    } else {
      await draftFolderAPI.update(Number(currentFolderId.value), { name })
      ElMessage.success('已重命名')
    }
    folderDialogVisible.value = false
    await loadFolderTree()
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
  } finally {
    folderDialogSubmitting.value = false
  }
}

const handleDeleteFolderNode = async (data) => {
  if (!isRealFolderId(data?.id)) return
  const id = Number(data.id)
  const label = data.label || ''
  try {
    await ElMessageBox.confirm(
      `确定删除文件夹「${label}」？其中草稿将变为未分类。`,
      '删除文件夹',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
    await draftFolderAPI.delete(id)
    ElMessage.success('已删除文件夹')
    if (String(currentFolderId.value) === String(id)) {
      currentFolderId.value = '__all__'
      page.value = 1
      await loadData()
    }
    await loadFolderTree()
  } catch (e) {
    if (e === 'cancel' || e?.message === 'cancel') return
    ElMessage.error(e?.message || '删除失败')
  }
}

const loadData = async () => {
  loading.value = true
  try {
    const params = {
      page: page.value,
      pageSize: pageSize.value,
      folderId: currentFolderId.value,
    }
    const q = draftSearchQ.value.trim()
    if (q) params.q = q
    const { list, total: t } = await draftsAPI.list(params)
    tableData.value = [...list].sort((a, b) => (a.id || 0) - (b.id || 0))
    total.value = t
  } catch (e) {
    console.warn('从后端加载草稿失败:', e)
    const backup = localStorage.getItem('drafts_backup')
    if (backup) {
      try {
        const parsed = JSON.parse(backup)
        tableData.value = Array.isArray(parsed) ? parsed : []
        total.value = tableData.value.length
      } catch {
        tableData.value = []
        total.value = 0
      }
    } else {
      tableData.value = []
      total.value = 0
    }
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadFolderTree()
  await loadData()
})

const goCreate = () => {
  const fid = resolveFolderIdForCreate()
  if (fid != null) {
    router.push({ path: '/content-create', query: { folderId: String(fid) } })
  } else {
    router.push('/content-create')
  }
}

const handleSelectionChange = (rows) => {
  selectedRows.value = rows
}

const handleBatchDelete = async () => {
  if (selectedRows.value.length === 0) return
  const ids = selectedRows.value.map((row) => row.id)
  const userId = 'default_user'
  for (const id of ids) {
    try {
      await fetch(`${API_BASE_URL}/api/drafts/${id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': userId },
      })
    } catch (e) {
      console.warn(`删除草稿 ${id} 失败:`, e)
    }
  }
  await reloadPagedListAfterRemoval({ page, list: tableData, loadData })
  selectedRows.value = []
  ElMessage.success(`已删除 ${ids.length} 条草稿`)
}

const handlePreview = (row) => {
  currentDraft.value = row
  previewVisible.value = true
}

const handleEdit = (row) => {
  router.push(`/drafts/${row.id}/edit`)
}

const handlePublish = () => {
  ElMessage.success('跳转到投放任务创建')
  router.push('/publish-tasks')
}

const handleDelete = async (id) => {
  const userId = 'default_user'
  try {
    await fetch(`${API_BASE_URL}/api/drafts/${id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': userId },
    })
  } catch (e) {
    console.warn(`删除草稿 ${id} 失败:`, e)
  }
  await reloadPagedListAfterRemoval({ page, list: tableData, loadData })
  ElMessage.success('删除成功')
}
</script>

<style scoped>
.drafts-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.drafts-sidebar {
  flex: 0 0 260px;
  max-width: 280px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  background: #fafbfc;
}
.drafts-sidebar-search {
  margin-bottom: 10px;
}
.drafts-sidebar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.drafts-folder-tree {
  max-height: calc(100vh - 320px);
  overflow: auto;
  background: #fff;
  border-radius: 6px;
  padding: 6px 4px;
}
.drafts-folder-tree :deep(.el-tree-node__content) {
  height: 32px;
}
.folder-tree-node {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding-right: 4px;
}
.folder-tree-node-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-tree-node-delete {
  flex-shrink: 0;
  margin-left: 6px;
  font-size: 14px;
  color: #909399;
  cursor: pointer;
  transition: color 0.15s;
}
.folder-tree-node-delete:hover {
  color: #f56c6c;
}
.drafts-main {
  flex: 1;
  min-width: 0;
}

.preview-content {
  max-height: 70vh;
  overflow-y: auto;
}

.markdown-body {
  color: #374151;
  line-height: 1.8;
  font-size: 15px;
}

.markdown-body :deep(h1) {
  font-size: 1.5em;
  font-weight: 700;
  margin: 1em 0 0.5em;
  color: #111;
}

.markdown-body :deep(h2) {
  font-size: 1.25em;
  font-weight: 600;
  margin: 1.2em 0 0.5em;
  color: #1a1a1a;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 0.3em;
}

.markdown-body :deep(h3) {
  font-size: 1.1em;
  font-weight: 600;
  margin: 1em 0 0.4em;
  color: #333;
}

.markdown-body :deep(p) {
  margin: 0.8em 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.5em;
  margin: 0.8em 0;
}

.markdown-body :deep(li) {
  margin: 0.3em 0;
}

.markdown-body :deep(blockquote) {
  border-left: 4px solid #a78bfa;
  padding: 0.5em 1em;
  margin: 1em 0;
  background: #f5f3ff;
  border-radius: 0 8px 8px 0;
  color: #4b5563;
}

.markdown-body :deep(code) {
  background: #f3f4f6;
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
  color: #7c3aed;
}

.markdown-body :deep(pre) {
  background: #1f2937;
  color: #e5e7eb;
  padding: 1em;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1em 0;
}

.markdown-body :deep(pre code) {
  background: none;
  color: inherit;
  padding: 0;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #e5e7eb;
  padding: 0.6em 1em;
  text-align: left;
}

.markdown-body :deep(th) {
  background: #f9fafb;
  font-weight: 600;
}

.markdown-body :deep(tr:nth-child(even)) {
  background: #f9fafb;
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 0.5em 0;
}

.markdown-body :deep(a) {
  color: #7c3aed;
  text-decoration: underline;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 1.5em 0;
}

.markdown-body :deep(strong) {
  font-weight: 600;
  color: #111;
}

.markdown-body :deep(em) {
  font-style: italic;
}
</style>
