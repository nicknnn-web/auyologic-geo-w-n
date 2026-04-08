<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <!-- 页面头部 -->
    <div class="flex items-center mb-6">
      <el-button link @click="$router.back()" class="mr-4">
        <el-icon><ArrowLeft /></el-icon> 返回
      </el-button>
      <div>
        <div class="text-xl font-bold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
          编辑草稿
        </div>
        <div class="text-sm text-gray-500">{{ draft?.title || '加载中...' }}</div>
      </div>
      <div class="ml-auto flex gap-3">
        <el-button @click="handleSaveAsNew" :loading="saving" type="warning">
          <el-icon class="mr-1"><DocumentCopy /></el-icon>
          另存为新
        </el-button>
        <el-button @click="handleSave" :loading="saving" class="btn-primary">
          <el-icon class="mr-1"><Check /></el-icon>
          保存
        </el-button>
        <el-button @click="handlePublish" class="btn-success">
          <el-icon class="mr-1"><Promotion /></el-icon>
          发布
        </el-button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <el-spin size="large" />
      <span class="ml-4 text-gray-500">加载中...</span>
    </div>

    <!-- 编辑器 -->
    <div v-else-if="draft" class="editor-wrapper">
      <!-- 标题输入 -->
      <el-input
        v-model="editTitle"
        placeholder="请输入文章标题"
        size="large"
        class="title-input mb-4"
      >
        <template #prefix>
          <el-icon><Edit /></el-icon>
        </template>
      </el-input>

      <!-- 富文本编辑器 -->
      <div class="mb-4">
        <div class="section-label mb-2">正文内容</div>
        <div class="editor-toolbar mb-2">
          <el-button size="small" @click="editor?.chain().focus().toggleBold().run()" :type="editor?.isActive('bold') ? 'primary' : ''"><b>B</b></el-button>
          <el-button size="small" @click="editor?.chain().focus().toggleItalic().run()" :type="editor?.isActive('italic') ? 'primary' : ''"><i>I</i></el-button>
          <el-button size="small" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()" :type="editor?.isActive('heading', { level: 2 }) ? 'primary' : ''">H2</el-button>
          <el-button size="small" @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()" :type="editor?.isActive('heading', { level: 3 }) ? 'primary' : ''">H3</el-button>
          <el-divider direction="vertical" />
          <el-button size="small" @click="editor?.chain().focus().toggleBulletList().run()" :type="editor?.isActive('bulletList') ? 'primary' : ''">列表</el-button>
          <el-button size="small" @click="editor?.chain().focus().toggleOrderedList().run()" :type="editor?.isActive('orderedList') ? 'primary' : ''">序号</el-button>
          <el-button size="small" @click="editor?.chain().focus().toggleBlockquote().run()" :type="editor?.isActive('blockquote') ? 'primary' : ''">引用</el-button>
          <el-divider direction="vertical" />
          <el-button size="small" @click="editor?.chain().focus().undo().run()" :disabled="!editor?.can().undo()">撤销</el-button>
          <el-button size="small" @click="editor?.chain().focus().redo().run()" :disabled="!editor?.can().redo()">重做</el-button>
        </div>
        <editor-content :editor="editor" class="editor-content" />
      </div>

      <!-- 元信息 -->
      <div class="meta-section">
        <div class="section-label mb-2">文章信息</div>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="关键词">
            <el-tag v-for="kw in keywords" :key="kw" size="small" class="mr-1">{{ kw }}</el-tag>
            <span v-if="keywords.length === 0" class="text-gray-400">无</span>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="draft.status === '已发布' ? 'success' : 'warning'">{{ draft.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDate(draft.created_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDate(draft.updated_at) }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </div>

    <div v-else class="flex items-center justify-center py-20">
      <el-spin size="large" />
      <span class="ml-4 text-gray-500">加载中...</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { draftsAPI } from '../utils/api'
import { ArrowLeft, Check, Edit, Promotion, DocumentCopy } from '@element-plus/icons-vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// 配置 marked
marked.use({ gfm: true, breaks: true })

// 判断内容是否为 Markdown 并解析
const parseContent = (content) => {
  if (!content) return ''
  // 如果内容已经包含 HTML 标签（<p>, <h1> 等），认为是 HTML 直接返回
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return content
  }
  // 否则认为是 Markdown，转换为 HTML
  const html = marked.parse(content)
  return DOMPurify.sanitize(html)
}

const router = useRouter()
const route = useRoute()

const draft = ref(null)
const editTitle = ref('')
const keywords = ref([])
const saving = ref(false)
const loading = ref(true)

// 编辑器
const editor = useEditor({
  extensions: [StarterKit],
  content: '',
  onUpdate: ({ editor }) => {
    if (draft.value) {
      draft.value.content = editor.getHTML()
    }
  }
})

onMounted(async () => {
  const draftId = route.params.id || route.query.id
  if (draftId) {
    try {
      // 添加超时处理
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('请求超时')), 10000)
      )
      const dataPromise = draftsAPI.get(draftId)
      
      const data = await Promise.race([dataPromise, timeoutPromise])
      draft.value = data
      editTitle.value = data.title || ''
      loading.value = false
      
      // 解析关键词
      if (data.keyword) {
        keywords.value = data.keyword.split(',').filter(k => k.trim())
      }
      
      // 设置编辑器内容
      editor.value?.commands.setContent(parseContent(data.content) || '')
    } catch (e) {
      console.error('加载草稿失败:', e)
      // 尝试从 sessionStorage 读取
      const stored = sessionStorage.getItem('editDraft')
      if (stored) {
        try {
          const data = JSON.parse(stored)
          draft.value = data
          editTitle.value = data.title || ''
          loading.value = false
          if (data.form?.keywords) {
            keywords.value = Array.isArray(data.form.keywords) ? data.form.keywords : [data.form.keywords]
          }
          // 支持 localStorage 中的 content（旧格式）
          if (!data.content && data.generatedContent) {
            data.content = data.generatedContent
          }
          editor.value?.commands.setContent(parseContent(data.content) || '')
          sessionStorage.removeItem('editDraft')
          ElMessage.warning('从会话缓存加载草稿')
        } catch {
          ElMessage.error('加载草稿失败：' + e.message)
          loading.value = false
          router.back()
        }
      } else {
        ElMessage.error('加载草稿失败：' + e.message)
        loading.value = false
        router.back()
      }
    }
  } else {
    // 从 sessionStorage 读取
    const stored = sessionStorage.getItem('editDraft')
    if (stored) {
      const data = JSON.parse(stored)
      draft.value = data
      editTitle.value = data.title || ''
      loading.value = false
      
      if (data.form?.keywords) {
        keywords.value = Array.isArray(data.form.keywords) ? data.form.keywords : [data.form.keywords]
      }
      
      editor.value?.commands.setContent(parseContent(data.content) || '')
      sessionStorage.removeItem('editDraft')
    } else {
      ElMessage.error('未找到草稿')
      loading.value = false
      router.back()
    }
  }
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

const handleSave = async () => {
  saving.value = true
  try {
    // 如果没有 id（从缓存加载的草稿），先创建再更新
    if (!draft.value?.id) {
      // 创建新草稿
      const newDraft = await draftsAPI.create({
        title: editTitle.value,
        content: draft.value?.content || '',
        status: draft.value?.status || '草稿'
      })
      draft.value = { ...draft.value, id: newDraft.id }
      ElMessage.success('保存成功（已创建新草稿）')
    } else {
      // 更新已有草稿
      await draftsAPI.update(draft.value.id, {
        title: editTitle.value,
        content: draft.value.content,
        status: draft.value.status
      })
      ElMessage.success('保存成功')
    }
  } catch (e) {
    console.error('保存失败:', e)
    ElMessage.error('保存失败，请检查网络')
  } finally {
    saving.value = false
  }
}

const handleSaveAsNew = async () => {
  saving.value = true
  try {
    // 创建新草稿（不更新现有记录）
    const newDraft = await draftsAPI.create({
      title: editTitle.value + ' (副本)',
      content: draft.value?.content || '',
      status: '草稿'
    })
    draft.value = { ...draft.value, id: newDraft.id }
    ElMessage.success('已另存为新草稿')
    // 跳转到新草稿的编辑页
    router.replace(`/drafts/${newDraft.id}/edit`)
  } catch (e) {
    console.error('另存失败:', e)
    ElMessage.error('另存失败：' + e.message)
  } finally {
    saving.value = false
  }
}

const handlePublish = () => {
  ElMessage.info('跳转到发布页面')
  router.push('/publish-tasks')
}
</script>

<style scoped>
.title-input :deep(.el-input__inner) {
  font-size: 18px;
  font-weight: 600;
}

.editor-wrapper {
  max-width: 900px;
  margin: 0 auto;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 8px;
}

.editor-content {
  min-height: 400px;
  padding: 16px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
}

.editor-content :deep(.ProseMirror) {
  min-height: 380px;
  outline: none;
}

.editor-content :deep(.ProseMirror p) {
  margin: 0.8em 0;
}

.editor-content :deep(.ProseMirror h2) {
  font-size: 1.5em;
  font-weight: 700;
  margin: 1em 0 0.5em;
}

.editor-content :deep(.ProseMirror h3) {
  font-size: 1.25em;
  font-weight: 600;
  margin: 1em 0 0.5em;
}

.editor-content :deep(.ProseMirror blockquote) {
  border-left: 4px solid #a78bfa;
  padding-left: 1em;
  margin: 1em 0;
  color: #666;
}

.editor-content :deep(.ProseMirror ul),
.editor-content :deep(.ProseMirror ol) {
  padding-left: 1.5em;
  margin: 0.8em 0;
}

.meta-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #ebeef5;
}

.section-label {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

/* 按钮样式 */
:deep(.btn-primary) {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  border: none !important;
  color: white !important;
}

:deep(.btn-primary:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

:deep(.btn-success) {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
  border: none !important;
  color: white !important;
}

:deep(.btn-success:hover) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}
</style>
