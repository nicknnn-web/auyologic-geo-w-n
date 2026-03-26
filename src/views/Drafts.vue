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
      <el-table-column prop="keyword" label="关键词" width="150">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.keyword || '无' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === '已发布' ? 'success' : 'warning'">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="warning" size="small" @click="openPreview(row)">预览</el-button>
          <el-button link type="success" size="small" @click="handlePublish(row)">发布</el-button>
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
        <el-button type="primary" @click="openEdit(currentDraft); previewVisible = false">编辑</el-button>
        <el-button type="success" @click="handlePublish(currentDraft); previewVisible = false">发布</el-button>
      </template>
    </el-dialog>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editVisible" :title="`编辑草稿 - ${editForm.title}`" width="90%" top="3vh" destroy-on-close>
      <div class="edit-container">
        <!-- 标题 -->
        <el-input
          v-model="editForm.title"
          placeholder="请输入文章标题"
          size="large"
          class="title-input mb-4"
        />

        <!-- 编辑器工具栏 -->
        <div class="editor-toolbar mb-2">
          <el-button-group>
            <el-button size="small" @click="editor?.chain().focus().toggleBold().run()" :type="editor?.isActive('bold') ? 'primary' : ''"><b>B</b></el-button>
            <el-button size="small" @click="editor?.chain().focus().toggleItalic().run()" :type="editor?.isActive('italic') ? 'primary' : ''"><i>I</i></el-button>
            <el-button size="small" @click="editor?.chain().focus().toggleStrike().run()" :type="editor?.isActive('strike') ? 'primary' : ''"><s>S</s></el-button>
          </el-button-group>
          <el-divider direction="vertical" />
          <el-button-group>
            <el-button size="small" @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()" :type="editor?.isActive('heading', { level: 1 }) ? 'primary' : ''">H1</el-button>
            <el-button size="small" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()" :type="editor?.isActive('heading', { level: 2 }) ? 'primary' : ''">H2</el-button>
            <el-button size="small" @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()" :type="editor?.isActive('heading', { level: 3 }) ? 'primary' : ''">H3</el-button>
          </el-button-group>
          <el-divider direction="vertical" />
          <el-button-group>
            <el-button size="small" @click="editor?.chain().focus().toggleBulletList().run()" :type="editor?.isActive('bulletList') ? 'primary' : ''">
              <el-icon><Rank /></el-icon> 列表
            </el-button>
            <el-button size="small" @click="editor?.chain().focus().toggleOrderedList().run()" :type="editor?.isActive('orderedList') ? 'primary' : ''">
              <el-icon><List /></el-icon> 序号
            </el-button>
          </el-button-group>
          <el-button-group>
            <el-button size="small" @click="editor?.chain().focus().toggleBlockquote().run()" :type="editor?.isActive('blockquote') ? 'primary' : ''">
              <el-icon><ChatLineSquare /></el-icon> 引用
            </el-button>
            <el-button size="small" @click="editor?.chain().focus().setHorizontalRule().run()">分割线</el-button>
          </el-button-group>
          <el-divider direction="vertical" />
          <el-button-group>
            <el-button size="small" @click="editor?.chain().focus().undo().run()" :disabled="!editor?.can().undo()">撤销</el-button>
            <el-button size="small" @click="editor?.chain().focus().redo().run()" :disabled="!editor?.can().redo()">重做</el-button>
          </el-button-group>
          <el-divider direction="vertical" />
          <!-- 一键排版按钮 -->
          <el-button size="small" type="warning" @click="handleAutoFormat" :loading="formatting">
            <el-icon class="mr-1"><MagicStick /></el-icon>
            一键排版
          </el-button>
        </div>

        <!-- 富文本编辑器 -->
        <editor-content :editor="editor" class="editor-content" />
      </div>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button @click="handleSaveDraft" :loading="saving">保存</el-button>
        <el-button type="success" @click="handlePublish">发布</el-button>
      </template>
    </el-dialog>

    <el-empty v-if="tableData.length === 0" description="暂无草稿，请在内容生成页面创建" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { draftsAPI } from '../utils/api'
import { Delete, Plus, Rank, List, ChatLineSquare, MagicStick } from '@element-plus/icons-vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'

// 初始化 Turndown 用于 HTML 转 Markdown
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
})

// 配置 marked（使用 use 方法以兼容 v17）
marked.use({
  gfm: true,
  breaks: true
})

const router = useRouter()
const tableData = ref([])
const previewVisible = ref(false)
const editVisible = ref(false)
const currentDraft = ref(null)
const selectedRows = ref([])
const saving = ref(false)
const formatting = ref(false)

// 编辑相关
const editForm = ref({
  id: null,
  title: '',
  content: ''
})

// 富文本编辑器
const editor = useEditor({
  extensions: [StarterKit],
  content: '',
  onUpdate: ({ editor }) => {
    editForm.value.content = editor.getHTML()
  }
})

// 渲染 Markdown 为 HTML
const renderedContent = computed(() => {
  if (!currentDraft.value?.content) return ''
  const html = marked(currentDraft.value.content)
  return DOMPurify.sanitize(html)
})

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

// 加载数据
const loadData = async () => {
  try {
    const data = await draftsAPI.list()
    // 按 id 降序
    tableData.value = data.sort((a, b) => b.id - a.id)
  } catch (err) {
    ElMessage.error('加载草稿失败：' + err.message)
    tableData.value = []
  }
}

onMounted(() => {
  loadData()
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

// 打开编辑
const openEdit = (row) => {
  editForm.value = {
    id: row.id,
    title: row.title || '',
    content: row.content || ''
  }

  // 将 Markdown 转换为 HTML 再设置到编辑器
  let htmlContent = row.content || ''
  try {
    // 预处理：确保标题/内容/列表之间有空行，marked 才能正确解析
    htmlContent = htmlContent
      // 在标题标记（# 后直接跟文字）前加空行
      .replace(/\n(#{1,6}[^\n#])/g, '\n\n$1')
      // 标题：确保 # 后有空格
      .replace(/^#{1,6}([^\s#])/gm, '$& ')
      // 引用：确保 > 后有空格
      .replace(/^>([^\s])/gm, '> $1')
      // 在列表标记 - 前加空行
      .replace(/\n([-][^\n]+)/g, '\n\n$1')
      // 确保连续空行不超过2个
      .replace(/\n{3,}/g, '\n\n')

    htmlContent = marked.parse(htmlContent)
    // 清理危险标签，保留所有有用的格式标签
    htmlContent = DOMPurify.sanitize(htmlContent, {
      ALLOWED_TAGS: [
        'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'em', 'b', 'i', 'u', 's', 'del',
        'ul', 'ol', 'li',
        'blockquote', 'pre', 'code',
        'br', 'hr',
        'a', 'span', 'div'
      ],
      ALLOWED_ATTR: ['href', 'target', 'class', 'style']
    })
  } catch (e) {
    console.error('Markdown 解析失败:', e)
  }

  editor.value?.commands.setContent(htmlContent)
  editVisible.value = true
}

// 打开预览
const openPreview = (row) => {
  currentDraft.value = row
  previewVisible.value = true
}

// 一键排版 - 智能格式化内容
const handleAutoFormat = async () => {
  formatting.value = true

  try {
    if (!editor.value) {
      ElMessage.error('编辑器未初始化')
      formatting.value = false
      return
    }

    // 获取编辑器纯文本内容
    const text = editor.value.getText()

    if (!text || text.trim().length === 0) {
      ElMessage.warning('编辑器内容为空')
      formatting.value = false
      return
    }

    // 预处理：确保 marked 能正确识别标题/段落/列表
    // 关键：标题行、内容行、列表项之间必须有空行分隔，否则 marked 会把整行当标题
    let processed = text
      // 在标题标记（# 后直接跟文字）前加空行
      .replace(/\n(#{1,6}[^\n#])/g, '\n\n$1')
      // 标题：确保 # 后有空格
      .replace(/^#{1,6}([^\s#])/gm, '$& ')
      // 引用：确保 > 后有空格
      .replace(/^>([^\s])/gm, '> $1')
      // 在列表标记 - 前加空行（让前后内容被识别为段落而非标题）
      .replace(/\n([-][^\n]+)/g, '\n\n$1')
      // 确保连续空行不超过2个
      .replace(/\n{3,}/g, '\n\n')

    // 使用 marked 解析（marked.use 已配置 breaks: true）
    let formatted = marked.parse(processed)

    // 清理危险标签，保留所有有用的格式标签
    formatted = DOMPurify.sanitize(formatted, {
      ALLOWED_TAGS: [
        'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'em', 'b', 'i', 'u', 's', 'del',
        'ul', 'ol', 'li',
        'blockquote', 'pre', 'code',
        'br', 'hr',
        'a', 'span', 'div'
      ],
      ALLOWED_ATTR: ['href', 'target', 'class', 'style']
    })

    // 设置回编辑器
    editor.value.commands.setContent(formatted)

    ElMessage.success('排版完成！')
  } catch (e) {
    console.error('排版失败:', e)
    ElMessage.error('排版失败：' + e.message)
  } finally {
    formatting.value = false
  }
}

// 保存草稿
const handleSaveDraft = async () => {
  if (!editForm.value.id) {
    ElMessage.warning('草稿ID不存在')
    return
  }

  saving.value = true
  try {
    // 获取编辑器的 HTML 内容
    const htmlContent = editor.value.getHTML()
    // 将 HTML 转换为 Markdown 格式保存
    const markdownContent = turndownService.turndown(htmlContent)

    await draftsAPI.update(editForm.value.id, {
      title: editForm.value.title,
      content: markdownContent
    })
    ElMessage.success('保存成功')
    editVisible.value = false
    await loadData()
  } catch (e) {
    console.error('保存失败:', e)
    ElMessage.error('保存失败：' + e.message)
  } finally {
    saving.value = false
  }
}

// 发布
const handlePublish = (row) => {
  if (row) {
    // 从预览/编辑页来的发布
    editVisible.value = false
    previewVisible.value = false
    currentDraft.value = row
  }
  ElMessage.success('跳转到投放任务创建')
  router.push('/publish-tasks')
}

// 批量选择
const handleSelectionChange = (rows) => {
  selectedRows.value = rows
}

// 批量删除
const handleBatchDelete = async () => {
  if (selectedRows.value.length === 0) return
  const ids = selectedRows.value.map(row => row.id)
  try {
    for (const id of ids) {
      await draftsAPI.delete(id)
    }
    await loadData()
    selectedRows.value = []
    ElMessage.success(`已删除 ${ids.length} 条草稿`)
  } catch (err) {
    ElMessage.error('删除失败：' + err.message)
  }
}

// 单个删除
const handleDelete = async (id) => {
  try {
    await draftsAPI.delete(id)
    await loadData()
    ElMessage.success('删除成功')
  } catch (err) {
    ElMessage.error('删除失败：' + err.message)
  }
}
</script>

<style scoped>
.edit-container {
  height: 70vh;
  overflow-y: auto;
}

.title-input :deep(.el-input__inner) {
  font-size: 18px;
  font-weight: 600;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  border-radius: 10px;
  flex-wrap: wrap;
}

.editor-content {
  min-height: 500px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
}

.editor-content :deep(.ProseMirror) {
  min-height: 480px;
  padding: 20px;
  outline: none;
  font-size: 15px;
  line-height: 1.8;
}

.editor-content :deep(.ProseMirror p) {
  margin: 1em 0;
}

.editor-content :deep(.ProseMirror h1) {
  font-size: 1.8em;
  font-weight: 700;
  color: #1a1a1a;
  margin: 1.5em 0 0.8em;
  padding-bottom: 0.5em;
  border-bottom: 2px solid #8b5cf6;
}

.editor-content :deep(.ProseMirror h2) {
  font-size: 1.4em;
  font-weight: 600;
  color: #333;
  margin: 1.2em 0 0.6em;
}

.editor-content :deep(.ProseMirror h3) {
  font-size: 1.2em;
  font-weight: 600;
  color: #555;
  margin: 1em 0 0.5em;
}

.editor-content :deep(.ProseMirror blockquote) {
  border-left: 4px solid #8b5cf6;
  background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
  padding: 1em 1.5em;
  margin: 1.5em 0;
  border-radius: 0 12px 12px 0;
}

.editor-content :deep(.ProseMirror ul),
.editor-content :deep(.ProseMirror ol) {
  padding-left: 1.5em;
  margin: 1em 0;
}

.editor-content :deep(.ProseMirror li) {
  margin: 0.5em 0;
}

.editor-content :deep(.ProseMirror hr) {
  border: none;
  border-top: 2px dashed #e4e8f0;
  margin: 2em 0;
}

.editor-content :deep(.ProseMirror code) {
  background: #f3f4f6;
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
  color: #8b5cf6;
}

.editor-content :deep(.ProseMirror pre) {
  background: #1f2937;
  color: #e5e7eb;
  padding: 1em;
  border-radius: 8px;
  overflow-x: auto;
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
</style>
