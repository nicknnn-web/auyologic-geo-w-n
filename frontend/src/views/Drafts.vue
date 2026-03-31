<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex items-center mb-4">
      <div>
        <div class="text-lg font-bold">草稿箱</div>
        <div class="text-sm text-gray-500">管理AI创作的文章草稿</div>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <el-button
          type="danger"
          @click="handleBatchDelete"
          :disabled="selectedRows.length === 0"
          plain
        >
          <el-icon class="mr-1"><Delete /></el-icon>
          批量删除{{ selectedRows.length > 0 ? ` (${selectedRows.length})` : '' }}
        </el-button>
        <el-button type="primary" @click="$router.push('/content-create')">
          <el-icon class="mr-1"><Plus /></el-icon>
          新建创作
        </el-button>
      </div>
    </div>

    <el-table :data="tableData" style="width: 100%" @selection-change="handleSelectionChange">
      <el-table-column type="selection" width="50" />
      <el-table-column label="序号" width="80" align="center">
        <template #default="{ $index }">
          {{ $index + 1 }}
        </template>
      </el-table-column>
      <el-table-column prop="title" label="文章标题" />
      <el-table-column prop="brand" label="品牌" width="120" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === '已发布' ? 'success' : 'warning'">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="180" />
      <el-table-column label="操作" width="250" align="center">
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

    <el-empty v-if="tableData.length === 0" description="暂无草稿，请在内容生成页面创建" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getList, deleteItem } from '../utils/storage'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true
})

const API_BASE_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://auyologic.zeabur.app'

const router = useRouter()
const tableData = ref([])
const previewVisible = ref(false)
const currentDraft = ref(null)
const selectedRows = ref([])

// 渲染 Markdown 为 HTML
const renderedContent = computed(() => {
  if (!currentDraft.value?.content) return ''
  const html = marked(currentDraft.value.content)
  return DOMPurify.sanitize(html)
})

const handleSelectionChange = (rows) => {
  selectedRows.value = rows
}

const handleBatchDelete = async () => {
  if (selectedRows.value.length === 0) return
  const ids = selectedRows.value.map(row => row.id)
  
  // 同步删除后端数据
  const userId = 'default_user'
  for (const id of ids) {
    try {
      await fetch(`${API_BASE_URL}/api/drafts/${id}`, { 
        method: 'DELETE',
        headers: { 'x-user-id': userId }
      })
    } catch (e) {
      console.warn(`删除草稿 ${id} 失败:`, e)
    }
  }
  
  // 同时从本地列表移除
  await loadData()
  selectedRows.value = []
  ElMessage.success(`已删除 ${ids.length} 条草稿`)
}

// 加载数据 - 优先从后端 API，失败则 fallback 到 localStorage
const loadData = async () => {
  const userId = 'default_user'
  try {
    const res = await fetch(`${API_BASE_URL}/api/drafts`, {
      headers: { 'x-user-id': userId }
    })
    if (res.ok) {
      const data = await res.json()
      if (data.length > 0) {
        tableData.value = [...data].sort((a, b) => a.id - b.id)
        // 保存到 localStorage 备份
        localStorage.setItem('drafts_backup', JSON.stringify(data))
        return
      }
    }
  } catch (e) {
    console.warn('从后端加载草稿失败:', e)
  }
  // API 返回空或失败，尝试从 localStorage 备份加载
  const backup = localStorage.getItem('drafts_backup')
  if (backup) {
    try {
      tableData.value = JSON.parse(backup)
    } catch {
      tableData.value = []
    }
  } else {
    tableData.value = []
  }
}

onMounted(() => {
  loadData()
})

const handlePreview = (row) => {
  currentDraft.value = row
  previewVisible.value = true
}

const handleEdit = (row) => {
  // 跳转到独立编辑页面
  router.push(`/drafts/${row.id}/edit`)
}

const handlePublish = (row) => {
  ElMessage.success('跳转到投放任务创建')
  router.push('/publish-tasks')
}

const handleDelete = async (id) => {
  // 同步删除后端数据
  const userId = 'default_user'
  try {
    await fetch(`${API_BASE_URL}/api/drafts/${id}`, { 
      method: 'DELETE',
      headers: { 'x-user-id': userId }
    })
  } catch (e) {
    console.warn(`删除草稿 ${id} 失败:`, e)
  }
  // 从本地列表移除
  await loadData()
  ElMessage.success('删除成功')
}

</script>

<style scoped>
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
