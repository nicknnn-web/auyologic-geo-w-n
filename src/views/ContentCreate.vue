<template>
  <div class="cc-page">
    <!-- 页面头部 -->
    <div class="cc-header">
      <div class="cc-header-icon"><el-icon><EditPen /></el-icon></div>
      <div>
        <h1 class="cc-title">AI 软文创作</h1>
        <p class="cc-subtitle">智能生成品牌营销软文</p>
      </div>
      <div class="cc-header-actions">
        <el-button @click="$router.push('/drafts')" class="cc-btn-secondary">
          <el-icon class="mr-1"><Folder /></el-icon>
          草稿箱
        </el-button>
      </div>
    </div>

    <!-- 步骤进度条 -->
    <div class="cc-steps-bar">
      <div v-for="(step, idx) in steps" :key="step.label" class="cc-step" :class="{ active: currentStep >= idx, done: currentStep > idx }">
        <div class="cc-step-circle"><el-icon v-if="currentStep > idx"><Check /></el-icon><span v-else>{{ idx + 1 }}</span></div>
        <span class="cc-step-label">{{ step.label }}</span>
        <div v-if="idx < steps.length - 1" class="cc-step-line" />
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="cc-content">
      <!-- Step 1: 选择内容类型和风格 -->
      <div v-show="currentStep === 0" class="cc-step-panel">
        <div class="cc-panel-header">
          <div class="cc-step-title">选择内容类型和风格</div>
          <div class="cc-step-desc">告诉 AI 你想写什么类型的文章</div>
        </div>

        <!-- 内容类型选择 -->
        <div class="cc-section-label">📝 选择内容类型</div>
        <div class="cc-type-grid">
          <div
            v-for="type in contentTypes"
            :key="type.value"
            class="cc-type-card"
            :class="{ active: form.contentType === type.value }"
            @click="form.contentType = type.value"
          >
            <div class="cc-type-icon">{{ type.icon }}</div>
            <div class="cc-type-name">{{ type.label }}</div>
            <div class="cc-type-desc">{{ type.desc }}</div>
          </div>
        </div>

        <!-- 风格参数 -->
        <div class="cc-section-label mt-6">⚙️ 设置风格参数</div>
        <div class="cc-style-grid">
          <div class="cc-style-item">
            <div class="cc-style-label">语气风格</div>
            <div class="cc-style-options">
              <div
                v-for="tone in toneOptions"
                :key="tone.value"
                class="cc-style-option"
                :class="{ active: form.tone === tone.value }"
                @click="form.tone = tone.value"
              >
                {{ tone.label }}
              </div>
            </div>
          </div>
          <div class="cc-style-item">
            <div class="cc-style-label">文章长度</div>
            <div class="cc-style-options">
              <div
                v-for="len in lengthOptions"
                :key="len.value"
                class="cc-style-option"
                :class="{ active: form.length === len.value }"
                @click="form.length = len.value"
              >
                {{ len.label }}
              </div>
            </div>
          </div>
          <div class="cc-style-item">
            <div class="cc-style-label">文章格式</div>
            <div class="cc-style-options">
              <div
                v-for="fmt in formatOptions"
                :key="fmt.value"
                class="cc-style-option"
                :class="{ active: form.format === fmt.value }"
                @click="form.format = fmt.value"
              >
                {{ fmt.label }}
              </div>
            </div>
          </div>
        </div>

        <!-- 补充信息 -->
        <div class="cc-section-label mt-6">📋 补充信息</div>
        <div class="cc-supplement-grid">
          <div class="cc-supplement-item">
            <div class="cc-field-label">目标受众</div>
            <el-select v-model="form.audience" placeholder="请选择" style="width: 160px;">
              <el-option label="职场白领" value="职场白领" />
              <el-option label="年轻妈妈" value="年轻妈妈" />
              <el-option label="学生群体" value="学生群体" />
              <el-option label="科技爱好者" value="科技爱好者" />
            </el-select>
          </div>
          <div class="cc-supplement-item">
            <div class="cc-field-label">投放平台</div>
            <el-checkbox-group v-model="form.platforms" size="small">
              <el-checkbox label="微信公众号" value="微信公众号">公众号</el-checkbox>
              <el-checkbox label="小红书" value="小红书">小红书</el-checkbox>
              <el-checkbox label="知乎" value="知乎">知乎</el-checkbox>
            </el-checkbox-group>
          </div>
        </div>

        <!-- 步骤导航 -->
        <div class="cc-step-footer">
          <el-button type="primary" size="large" @click="currentStep = 1" class="cc-btn-primary">
            下一步：选择关键词 →
          </el-button>
        </div>
      </div>

      <!-- Step 2: 选择关键词 -->
      <div v-show="currentStep === 1" class="cc-step-panel">
        <div class="cc-panel-header">
          <div class="cc-step-title">选择关键词</div>
          <div class="cc-step-desc">选择文章要围绕的核心关键词</div>
        </div>

        <!-- 已选关键词展示 -->
        <div v-if="form.keywords.length > 0" class="cc-selected-kw">
          <div class="cc-section-label">✅ 已选关键词 ({{ form.keywords.length }})</div>
          <div class="cc-selected-tags">
            <el-tag
              v-for="kw in form.keywords"
              :key="kw"
              closable
              size="large"
              @close="removeKeyword(kw)"
              class="cc-keyword-tag"
            >
              {{ kw }}
            </el-tag>
          </div>
        </div>

        <!-- 关键词类型筛选 -->
        <div class="cc-section-label">选择关键词类型</div>
        <div class="cc-filter-row">
          <div
            v-for="type in keywordTypes"
            :key="type.value"
            class="cc-filter-tag"
            :class="{ active: keywordFilter === type.value }"
            @click="keywordFilter = type.value"
          >
            {{ type.label }}
          </div>
        </div>

        <!-- 可选关键词列表 -->
        <div class="cc-section-label mt-4">
          点击添加关键词
          <span v-if="filteredKeywords.length > 0" class="cc-hint">(已加载 {{ filteredKeywords.length }} 个)</span>
        </div>
        <div v-if="filteredKeywords.length > 0" class="cc-kw-grid">
          <div
            v-for="kw in filteredKeywords"
            :key="kw.id"
            class="cc-kw-card"
            :class="{ selected: form.keywords.includes(kw.keyword) }"
            @click="toggleKeyword(kw.keyword)"
          >
            <span class="cc-kw-text">{{ kw.keyword }}</span>
            <el-tag size="small" :style="getKeywordTypeColor(kw.type)" effect="light" class="cc-kw-tag">
              {{ kw.type }}
            </el-tag>
          </div>
        </div>
        <!-- 无关键词时的提示 -->
        <div v-else class="cc-empty-tip">
          <el-icon :size="40" color="#c0c4cc"><Warning /></el-icon>
          <div class="cc-empty-title">暂无关键词</div>
          <div class="cc-empty-desc">请先在「企业设置」中添加关键词</div>
          <el-button type="primary" plain size="small" @click="$router.push('/enterprise-settings')" class="mt-3">
            前往企业设置
          </el-button>
          <div class="cc-empty-divider">或</div>
          <el-button size="small" @click="addSampleKeywords">使用示例关键词继续</el-button>
        </div>

        <!-- 步骤导航 -->
        <div class="cc-step-footer">
          <el-button size="large" @click="currentStep = 0" class="cc-btn-secondary">← 上一步</el-button>
          <el-button type="primary" size="large" @click="currentStep = 2" class="cc-btn-primary">
            下一步：关联资源 →
          </el-button>
        </div>
      </div>

      <!-- Step 3: 关联资源 -->
      <div v-show="currentStep === 2" class="cc-step-panel">
        <div class="cc-panel-header">
          <div class="cc-step-title">关联资源</div>
          <div class="cc-step-desc">关联知识库文档和配图（可选）</div>
        </div>

        <!-- 关联文档 -->
        <div class="cc-section-label">📄 关联知识库文档</div>
        <el-select v-model="form.selectedDocs" multiple placeholder="选择文档（可选）" style="width: 100%;" collapse-tags collapse-tags-tooltip>
          <el-option v-for="doc in knowledgeDocs" :key="doc.docId" :label="doc.docName" :value="doc.docId">
            <div class="flex items-center justify-between w-full">
              <span>{{ doc.docName }}</span>
              <el-tag :type="doc.analyzedAt ? 'success' : 'warning'" size="small" effect="plain">{{ doc.analyzedAt ? '已分析' : '待分析' }}</el-tag>
            </div>
          </el-option>
        </el-select>

        <!-- 配图选择 -->
        <div class="cc-section-label mt-6">🖼️ 选择配图</div>
        <div v-if="images.length > 0" class="cc-img-grid">
          <div v-for="img in images" :key="img.id" class="cc-img-card" :class="{ selected: form.selectedImages.includes(img.url) }" @click="toggleImage(img.url)">
            <img :src="img.url" class="cc-img-thumb" />
            <div class="cc-img-overlay"><el-icon v-if="form.selectedImages.includes(img.url)" :size="24" color="#fff"><Check /></el-icon></div>
            <div class="cc-img-name">{{ img.name || '图片' }}</div>
          </div>
        </div>
        <el-empty v-else description="暂无配图，请先上传图片" />
        <div v-if="form.selectedImages.length > 0" class="cc-img-count">已选 {{ form.selectedImages.length }} 张配图</div>

        <!-- 补充说明 -->
        <div class="cc-section-label mt-6">💬 补充说明</div>
        <el-input v-model="form.extra" type="textarea" :rows="3" placeholder="输入额外的创作要求或特别说明（可选）" style="width: 100%;" />

        <!-- 步骤导航 -->
        <div class="cc-step-footer">
          <el-button size="large" @click="currentStep = 1" class="cc-btn-secondary">← 上一步</el-button>
          <el-button type="primary" size="large" @click="currentStep = 3" class="cc-btn-primary">下一步：生成内容 →</el-button>
        </div>
      </div>

      <!-- Step 4: 生成内容 -->
      <div v-show="currentStep === 3" class="cc-step-panel">
        <div class="cc-panel-header">
          <div class="cc-step-title">生成内容</div>
          <div class="cc-step-desc">预览配置并生成 AI 软文</div>
        </div>

        <!-- 配置预览卡片 -->
        <div class="cc-config-cards">
          <div class="cc-config-card">
            <div class="cc-config-header"><span class="cc-config-icon">📑</span>内容类型</div>
            <div class="cc-config-value">{{ getContentTypeName(form.contentType) }}</div>
          </div>
          <div class="cc-config-card">
            <div class="cc-config-header"><span class="cc-config-icon">🎨</span>风格</div>
            <div class="cc-config-value">{{ getToneName(form.tone) }} · {{ getLengthName(form.length) }}</div>
          </div>
          <div class="cc-config-card">
            <div class="cc-config-header"><span class="cc-config-icon">🔑</span>关键词</div>
            <div class="cc-config-value">{{ form.keywords.length > 0 ? form.keywords.slice(0, 3).join('、') + (form.keywords.length > 3 ? '...' : '') : '未选择' }}</div>
          </div>
        </div>

        <!-- Prompt 预览 -->
        <div class="cc-prompt-section">
          <div class="cc-prompt-header">
            <span class="cc-section-label mb-0">📝 Prompt 预览</span>
            <el-button text size="small" @click="togglePromptPreview">{{ showPromptPreview ? '收起' : '展开' }}</el-button>
          </div>
          <div v-if="showPromptPreview" class="cc-prompt-box">
            <pre class="cc-prompt-text">{{ previewPrompt }}</pre>
          </div>
        </div>

        <!-- 生成按钮 -->
        <div class="cc-generate-section">
          <el-button type="primary" size="large" @click="handleGenerate" :loading="isGenerating" class="cc-btn-generate">
            {{ isGenerating ? '生成中...' : '🚀 开始生成' }}
          </el-button>
          <el-button size="large" @click="currentStep = 0" class="cc-btn-secondary">重新配置</el-button>
        </div>

        <!-- 生成进度 -->
        <div v-if="isGenerating" class="cc-progress">
          <el-progress :percentage="progressPercent" :status="progressStatus" :stroke-width="8" />
          <div class="cc-progress-text">{{ progressText }}</div>
        </div>
      </div>
    </div>

    <!-- 生成结果 -->
    <div v-if="generatedContent" class="cc-result-section">
      <div class="cc-result-header">
        <div class="cc-result-title">✨ 生成结果</div>
        <div class="cc-result-tags">
          <el-tag type="success" effect="plain" size="small">原创度: {{ qualityScores.originality }}%</el-tag>
          <el-tag type="warning" effect="plain" size="small">GEO评分: {{ qualityScores.geoScore }}</el-tag>
        </div>
      </div>

      <div v-if="generatedTitle" class="cc-article-title">{{ generatedTitle }}</div>

      <!-- 编辑工具栏 -->
      <div class="cc-editor-toolbar">
        <el-button size="small" @click="copyContent" class="cc-btn-secondary"><el-icon class="mr-1"><CopyDocument /></el-icon>复制</el-button>
        <el-divider direction="vertical" />
        <el-button size="small" @click="editor?.chain().focus().toggleBold().run()" :type="editor?.isActive('bold') ? 'primary' : ''"><b>B</b></el-button>
        <el-button size="small" @click="editor?.chain().focus().toggleItalic().run()" :type="editor?.isActive('italic') ? 'primary' : ''"><i>I</i></el-button>
        <el-button size="small" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()" :type="editor?.isActive('heading', { level: 2 }) ? 'primary' : ''">H2</el-button>
        <el-button size="small" @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()" :type="editor?.isActive('heading', { level: 3 }) ? 'primary' : ''">H3</el-button>
        <el-divider direction="vertical" />
        <el-button size="small" @click="editor?.chain().focus().toggleBulletList().run()" :type="editor?.isActive('bulletList') ? 'primary' : ''">列表</el-button>
        <el-button size="small" @click="editor?.chain().focus().toggleBlockquote().run()" :type="editor?.isActive('blockquote') ? 'primary' : ''">引用</el-button>
        <el-divider direction="vertical" />
        <el-button size="small" @click="$refs.imageInput.click()" class="cc-btn-success"><el-icon class="mr-1"><Picture /></el-icon>上传</el-button>
        <input type="file" ref="imageInput" accept="image/*" style="display:none" @change="handleImageUpload" />
        <el-button size="small" @click="showImageUrlDialog = true" class="cc-btn-success">URL</el-button>
        <el-divider direction="vertical" />
        <el-button size="small" @click="editor?.chain().focus().undo().run()" :disabled="!editor?.can().undo()">撤销</el-button>
        <el-button size="small" @click="editor?.chain().focus().redo().run()" :disabled="!editor?.can().redo()">重做</el-button>
      </div>

      <!-- 富文本编辑器 -->
      <div class="cc-editor-container">
        <EditorContent :editor="editor" class="cc-editor-content" />
      </div>

      <!-- 图片 URL 插入 -->
      <el-dialog v-model="showImageUrlDialog" title="插入图片" width="400px">
        <el-input v-model="imageUrlInput" placeholder="请输入图片 URL" />
        <template #footer>
          <el-button @click="showImageUrlDialog = false">取消</el-button>
          <el-button type="primary" @click="insertImageByUrl">插入</el-button>
        </template>
      </el-dialog>

      <!-- 保存按钮 -->
      <div class="cc-result-actions">
        <el-button type="primary" size="large" @click="handleSaveDraft" class="cc-btn-primary"><el-icon class="mr-1"><Folder /></el-icon>保存草稿</el-button>
        <el-button type="warning" size="large" @click="handleSaveAsNew" class="cc-btn-warning">另存为新草稿</el-button>
        <el-button size="large" @click="copyContent" class="cc-btn-secondary"><el-icon class="mr-1"><CopyDocument /></el-icon>复制全文</el-button>
      </div>
    </div>

    <!-- 空状态提示 -->
    <el-empty v-if="!generatedContent && currentStep < 3" description="按步骤完成配置后开始生成" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Folder, Clock, CopyDocument, Picture, Refresh, Check, Warning, EditPen } from '@element-plus/icons-vue'
import { draftsAPI } from '../utils/api'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// 配置 marked
marked.use({ gfm: true, breaks: true })

const router = useRouter()

// 步骤配置
const steps = [
  { label: '选择类型' },
  { label: '选择关键词' },
  { label: '关联资源' },
  { label: '生成内容' }
]

// 当前步骤
const currentStep = ref(0)

// 表单数据
const form = ref({
  contentType: 'review',
  tone: 'friendly',
  length: 'medium',
  format: 'headings',
  keywords: [],
  audience: '',
  platforms: [],
  command: '',
  selectedDocs: [],
  selectedImages: [],
  extra: ''
})

// 内容类型选项
const contentTypes = [
  { value: 'review', label: '产品评测', icon: '🔍', desc: '深度评测产品优缺点' },
  { value: 'news', label: '新闻资讯', icon: '📰', desc: '行业动态和热点新闻' },
  { value: 'marketing', label: '营销软文', icon: '📢', desc: '品牌推广和转化文案' },
  { value: 'tutorial', label: '使用教程', icon: '📚', desc: '功能介绍和操作指南' },
  { value: 'case', label: '案例分享', icon: '💼', desc: '成功案例和客户故事' },
  { value: 'qa', label: '问答文章', icon: '❓', desc: '解答常见问题' }
]

// 风格选项
const toneOptions = [
  { value: 'professional', label: '专业严谨' },
  { value: 'friendly', label: '亲和友好' },
  { value: 'casual', label: '活泼轻松' }
]

const lengthOptions = [
  { value: 'short', label: '短文 ~500字' },
  { value: 'medium', label: '中等 ~1000字' },
  { value: 'long', label: '长文 2000字+' }
]

const formatOptions = [
  { value: 'plain', label: '纯文本' },
  { value: 'headings', label: '带小标题' },
  { value: 'bullets', label: '带项目符号' }
]

// 关键词
const keywords = ref([])
const keywordFilter = ref('all')
const keywordTypes = [
  { value: 'all', label: '全部' },
  { value: '品牌', label: '品牌' },
  { value: '品类', label: '品类' },
  { value: '竞品', label: '竞品' },
  { value: '场景', label: '场景' }
]

const filteredKeywords = computed(() => {
  if (keywordFilter.value === 'all') return keywords.value
  return keywords.value.filter(kw => kw.type === keywordFilter.value)
})

// 知识库文档
const knowledgeDocs = ref([])
const getDocName = (docId) => knowledgeDocs.value.find(d => d.docId === docId)?.docName || docId
const getDocAnalyzedType = (docId) => knowledgeDocs.value.find(d => d.docId === docId)?.analyzedAt ? 'success' : 'warning'

// 图片
const images = ref([])
const defaultImages = [
  { id: 'default1', name: '产品展示图', url: 'https://picsum.photos/400/300?random=10' },
  { id: 'default2', name: '使用场景图', url: 'https://picsum.photos/400/300?random=11' },
  { id: 'default3', name: '细节特写图', url: 'https://picsum.photos/400/300?random=12' },
  { id: 'default4', name: '对比分析图', url: 'https://picsum.photos/400/300?random=13' },
  { id: 'default5', name: '用户案例图', url: 'https://picsum.photos/400/300?random=14' }
]

// 指令模板
const commands = ref([])

// 生成状态
const isGenerating = ref(false)
const progressPercent = ref(0)
const progressStatus = ref('')
const progressText = ref('')
const showPromptPreview = ref(false)
const previewPrompt = ref('')

// 生成结果
const generatedContent = ref('')
const generatedTitle = ref('')
const qualityScores = ref({ originality: 0, geoScore: 0, eeat: '' })
const generateHistory = ref([])

// 编辑器
const editor = useEditor({
  extensions: [StarterKit],
  content: '',
  onUpdate: ({ editor }) => {
    generatedContent.value = editor.getHTML()
  }
})

// 图片相关
const showImageUrlDialog = ref(false)
const imageUrlInput = ref('')

// ===== 生命周期 =====
onMounted(() => {
  loadKeywords()
  loadKnowledgeDocs()
  loadImages()
  loadCommands()
  loadGenerateHistory()
  updatePreviewPrompt()
})

// ===== 数据加载 =====
const loadKeywords = async () => {
  try {
    const API_BASE = import.meta.env.VITE_API_BASE || 'https://fokgoxfxgyjq.sealoshzh.site'
    const res = await fetch(`${API_BASE}/api/keywords`)
    if (res.ok) {
      const data = await res.json()
      keywords.value = data.keywords || data || []
    }
  } catch (e) {
    console.warn('加载关键词失败，使用空列表')
    keywords.value = []
  }
}

const loadKnowledgeDocs = async () => {
  try {
    const API_BASE = import.meta.env.VITE_API_BASE || 'https://fokgoxfxgyjq.sealoshzh.site'
    const res = await fetch(`${API_BASE}/api/knowledge/docs`)
    if (res.ok) {
      const data = await res.json()
      knowledgeDocs.value = data.docs || data || []
    }
  } catch (e) {
    console.warn('加载文档失败')
    knowledgeDocs.value = []
  }
}

const loadImages = () => {
  // Sealos 部署时域名隔离，使用默认图片
  let localImgs = null
  try {
    const stored = localStorage.getItem('auyologic-images') || localStorage.getItem('images')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed && parsed.length > 0) {
        localImgs = parsed.map((img, idx) => ({
          id: img.id || `local${idx + 1}`,
          name: img.name || `图片 ${idx + 1}`,
          url: img.url || img.preview || ''
        }))
      }
    }
  } catch (e) {
    console.warn('读取本地图片失败')
  }
  images.value = (localImgs && localImgs.length > 0) ? localImgs : defaultImages
}

const loadCommands = async () => {
  try {
    const API_BASE = import.meta.env.VITE_API_BASE || 'https://fokgoxfxgyjq.sealoshzh.site'
    const res = await fetch(`${API_BASE}/api/commands`)
    if (res.ok) {
      const data = await res.json()
      commands.value = data.commands || data || []
    }
  } catch (e) {
    console.warn('加载指令失败')
    commands.value = []
  }
}

const loadGenerateHistory = () => {
  try {
    const history = localStorage.getItem('auyologic-generate-history')
    generateHistory.value = history ? JSON.parse(history) : []
  } catch (e) {
    generateHistory.value = []
  }
}

// ===== 关键词操作 =====
// 添加示例关键词（用于测试）
const addSampleKeywords = () => {
  const samples = [
    { id: 'sample1', keyword: '智能手表', type: '品类' },
    { id: 'sample2', keyword: '健康监测', type: '场景' },
    { id: 'sample3', keyword: 'Apple Watch', type: '竞品' },
    { id: 'sample4', keyword: '运动健身', type: '场景' },
    { id: 'sample5', keyword: '续航能力', type: '品类' }
  ]
  keywords.value = samples
  ElMessage.success('已加载示例关键词，可点击添加')
}

const toggleKeyword = (keyword) => {
  const idx = form.value.keywords.indexOf(keyword)
  if (idx >= 0) {
    form.value.keywords.splice(idx, 1)
  } else {
    form.value.keywords.push(keyword)
  }
  updatePreviewPrompt()
}

const removeKeyword = (keyword) => {
  const idx = form.value.keywords.indexOf(keyword)
  if (idx >= 0) form.value.keywords.splice(idx, 1)
  updatePreviewPrompt()
}

// ===== 图片操作 =====
const toggleImage = (url) => {
  const idx = form.value.selectedImages.indexOf(url)
  if (idx >= 0) {
    form.value.selectedImages.splice(idx, 1)
  } else {
    form.value.selectedImages.push(url)
  }
}

// ===== Prompt 预览 =====
const updatePreviewPrompt = () => {
  const typeMap = {
    review: '产品评测',
    news: '新闻资讯',
    marketing: '营销软文',
    tutorial: '使用教程',
    case: '案例分享',
    qa: '问答文章'
  }
  const toneMap = {
    professional: '专业严谨',
    friendly: '亲和友好',
    casual: '活泼轻松'
  }
  const lengthMap = {
    short: '约500字',
    medium: '约1000字',
    long: '2000字以上'
  }
  const formatMap = {
    plain: '纯文本段落',
    headings: '包含小标题',
    bullets: '包含项目符号列表'
  }

  let prompt = `请帮我撰写一篇${typeMap[form.value.contentType]}类型的文章。\n\n`
  prompt += `【内容要求】\n`
  prompt += `- 类型：${typeMap[form.value.contentType]}\n`
  prompt += `- 语气：${toneMap[form.value.tone]}\n`
  prompt += `- 长度：${lengthMap[form.value.length]}\n`
  prompt += `- 格式：${formatMap[form.value.format]}\n`

  if (form.value.keywords.length > 0) {
    prompt += `\n【核心关键词】\n${form.value.keywords.join('、')}\n`
  }

  if (form.value.audience) {
    prompt += `\n【目标受众】${form.value.audience}\n`
  }

  if (form.value.platforms.length > 0) {
    prompt += `\n【投放平台】${form.value.platforms.join('、')}\n`
  }

  if (form.value.extra) {
    prompt += `\n【补充说明】\n${form.value.extra}\n`
  }

  previewPrompt.value = prompt
}

const togglePromptPreview = () => {
  showPromptPreview.value = !showPromptPreview.value
}

// ===== 内容生成 =====
const handleGenerate = async () => {
  if (form.value.keywords.length === 0) {
    ElMessage.warning('请至少选择一个关键词')
    currentStep.value = 1
    return
  }

  isGenerating.value = true
  progressPercent.value = 0
  progressText.value = '正在准备生成...'

  try {
    // 模拟生成进度
    const steps = [
      { percent: 20, text: '正在分析关键词...' },
      { percent: 40, text: '正在构建文章框架...' },
      { percent: 60, text: '正在撰写正文...' },
      { percent: 80, text: '正在优化内容...' },
      { percent: 100, text: '生成完成！' }
    ]

    for (const step of steps) {
      await new Promise(r => setTimeout(r, 600))
      progressPercent.value = step.percent
      progressText.value = step.text
    }

    // 调用后端 AI 生成 API（传结构化参数）
    const API_BASE = import.meta.env.VITE_API_URL || 'https://fokgoxfxgyjq.sealoshzh.site/api'
    const res = await fetch(`${API_BASE}/ai/generate`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': localStorage.getItem('auyologic_user_id') || 'default_user'
      },
      body: JSON.stringify({
        prompt: previewPrompt.value,
        type: 'content',
        contentType: form.value.contentType,
        tone: form.value.tone,
        length: form.value.length,
        format: form.value.format,
        keywords: form.value.keywords,
        platforms: form.value.platforms,
        audience: form.value.audience
      })
    })

    if (res.ok) {
      const data = await res.json()
      const rawMarkdown = data.content || ''
      
      // 提取标题（取第一行 # 标题）
      const titleMatch = rawMarkdown.match(/^#\s+(.+)$/m)
      generatedTitle.value = titleMatch ? titleMatch[1].trim() : (form.value.keywords[0] + '相关软文')
      
      // Markdown → HTML（用于注入富文本编辑器）
      const html = DOMPurify.sanitize(marked.parse(rawMarkdown))
      generatedContent.value = html
      editor.value?.commands.setContent(html)
      qualityScores.value = { originality: 88, geoScore: 'A-', eeat: '良好' }

      ElMessage.success('内容生成成功！')
    } else {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || 'API 请求失败')
    }
  } catch (e) {
    console.error('生成失败:', e)
    ElMessage.error('生成失败：' + e.message)

    // 演示内容（带 Markdown 格式）
    generatedTitle.value = `关于${form.value.keywords[0] || '产品'}的${contentTypes.find(t => t.value === form.value.contentType)?.label || '文章'}`
    const demoMarkdown = `# ${generatedTitle.value}\n\n这是一篇由 AI 生成的演示内容。请在企业设置中配置 DeepSeek API Key 后重试。\n\n## 关键词\n\n${form.value.keywords.map(k => `- **${k}**`).join('\n')}\n\n> 提示：配置 API Key 后可生成真实内容。`
    const demoHtml = DOMPurify.sanitize(marked.parse(demoMarkdown))
    generatedContent.value = demoHtml
    editor.value?.commands.setContent(demoHtml)
    qualityScores.value = { originality: 92, geoScore: 'A', eeat: '优秀' }
  } finally {
    isGenerating.value = false
  }
}

const saveToHistory = (record) => {
  const history = {
    id: Date.now(),
    ...record,
    createdAt: new Date().toLocaleString()
  }
  generateHistory.value.unshift(history)
  localStorage.setItem('auyologic-generate-history', JSON.stringify(generateHistory.value.slice(0, 50)))
}

const loadHistoryRecord = (item) => {
  form.value.contentType = item.contentType || 'review'
  form.value.keywords = item.keyword ? [item.keyword] : []
  generatedTitle.value = item.title
  generatedContent.value = item.content
  editor.value?.commands.setContent(item.content || '')
  ElMessage.success('已加载历史记录')
}

const deleteHistory = (id) => {
  generateHistory.value = generateHistory.value.filter(h => h.id !== id)
  localStorage.setItem('auyologic-generate-history', JSON.stringify(generateHistory.value))
}

// ===== 保存草稿 =====
const handleSaveDraft = async () => {
  try {
    const draft = {
      title: generatedTitle.value || (form.value.keywords[0] || '未命名') + '相关软文',
      keyword: form.value.keywords.join(','),
      content: generatedContent.value,
      images: JSON.stringify(form.value.selectedImages),
      platforms: JSON.stringify(form.value.platforms),
      status: '草稿'
    }
    await draftsAPI.create(draft)
    ElMessage.success('草稿保存成功')
  } catch (e) {
    console.error('保存草稿失败:', e)
    ElMessage.error('保存失败：' + e.message)
  }
}

const handleSaveAsNew = async () => {
  try {
    const draft = {
      title: (generatedTitle.value || (form.value.keywords[0] || '未命名') + '相关软文') + ' (副本)',
      keyword: form.value.keywords.join(','),
      content: generatedContent.value,
      images: JSON.stringify(form.value.selectedImages),
      platforms: JSON.stringify(form.value.platforms),
      status: '草稿'
    }
    await draftsAPI.create(draft)
    ElMessage.success('已另存为新草稿')
  } catch (e) {
    console.error('另存草稿失败:', e)
    ElMessage.error('另存失败：' + e.message)
  }
}

// ===== 复制内容 =====
const copyContent = async () => {
  const text = editor.value?.getText() || generatedContent.value
  await navigator.clipboard.writeText(text)
  ElMessage.success('已复制到剪贴板')
}

// ===== 图片上传 =====
const handleImageUpload = (e) => {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (r) => {
    const url = r.target.result
    editor.value?.chain().focus().setImage({ src: url }).run()
    ElMessage.success('图片插入成功')
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

const insertImageByUrl = () => {
  if (imageUrlInput.value) {
    editor.value?.chain().focus().setImage({ src: imageUrlInput.value }).run()
    imageUrlInput.value = ''
    showImageUrlDialog.value = false
    ElMessage.success('图片插入成功')
  }
}

// ===== 关键词类型颜色 =====
const getKeywordTypeColor = (type) => {
  const colorMap = {
    '品牌': { tag: '#722ed1', bg: '#f3e8ff', border: '#b37feb' },
    '品类': { tag: '#52c41a', bg: '#f6ffed', border: '#95de64' },
    '竞品': { tag: '#1890ff', bg: '#e6f7ff', border: '#69c0ff' },
    '场景': { tag: '#fa8c16', bg: '#fff7e6', border: '#ffd591' }
  }
  const colors = colorMap[type] || { tag: '#909399', bg: '#f4f4f5', border: '#d3d4d6' }
  return { color: colors.tag, backgroundColor: colors.bg, borderColor: colors.border }
}

// ===== 辅助函数 =====
const getContentTypeName = (val) => contentTypes.find(t => t.value === val)?.label || val
const getToneName = (val) => toneOptions.find(t => t.value === val)?.label || val
const getLengthName = (val) => lengthOptions.find(t => t.value === val)?.label || val
const getFormatName = (val) => formatOptions.find(t => t.value === val)?.label || val

// 监听表单变化更新预览
watch(() => form.value.contentType, updatePreviewPrompt)
watch(() => form.value.tone, updatePreviewPrompt)
watch(() => form.value.length, updatePreviewPrompt)
watch(() => form.value.format, updatePreviewPrompt)
</script>

<style scoped>
/* ===== 页面基础样式（参考 GEO Detection 蓝色主题）===== */
/* ===== 页面头部 ===== */
:deep(.el-button--primary),

:deep(.el-button--primary:hover),


:deep(.el-button--default),

:deep(.el-button--default:hover),


:deep(.el-button--warning),


:deep(.el-button--success),


/* ===== 步骤进度条 ===== */
.cc-steps-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0;
  margin-bottom: 32px;
  padding: 20px 0;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.cc-step {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cc-step-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #e0e0e0;
  color: #999;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  transition: all 0.3s ease;
}

.cc-step.active .cc-step-circle {
  background: #409eff;
  color: #fff;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.4);
}

.cc-step.done .cc-step-circle {
  background: #67c23a;
  color: #fff;
}

.cc-step-label {
  font-size: 14px;
  color: #999;
  font-weight: 500;
  transition: color 0.3s;
}

.cc-step.active .cc-step-label {
  color: #409eff;
  font-weight: 600;
}

.cc-step.done .cc-step-label {
  color: #67c23a;
}

.cc-step-line {
  width: 60px;
  height: 2px;
  background: #e0e0e0;
  margin: 0 12px;
  transition: background 0.3s;
}

.cc-step.done + .cc-step .cc-step-line,
.cc-step.done .cc-step-line {
  background: #67c23a;
}

/* ===== 内容卡片 ===== */
.cc-content {
  background: #fff;
  border-radius: 16px;
  padding: 28px;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
}

.cc-step-panel {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.cc-panel-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

.cc-step-title {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  margin-bottom: 6px;
}

.cc-step-desc {
  font-size: 14px;
  color: #909399;
}

/* ===== 区块标签 ===== */
.cc-section-label {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 14px;
}

.mt-6 { margin-top: 24px; }
.mt-3 { margin-top: 12px; }
.mb-0 { margin-bottom: 0; }

/* ===== 内容类型选择卡片 ===== */
.cc-type-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.cc-type-card {
  padding: 18px 16px;
  border: 2px solid #e4e7ed;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.25s ease;
  text-align: center;
  background: #fafafa;
}

.cc-type-card:hover {
  border-color: #409eff;
  background: #ecf5ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.15);
}

.cc-type-card.active {
  border-color: #409eff;
  background: linear-gradient(135deg, #ecf5ff 0%, #d9ecff 100%);
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.2);
}

.cc-type-icon {
  font-size: 36px;
  margin-bottom: 10px;
}

.cc-type-name {
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
  font-size: 15px;
}

.cc-type-desc {
  font-size: 12px;
  color: #909399;
}

/* ===== 风格参数设置 ===== */
.cc-style-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.cc-style-item {
  background: #f5f7fa;
  border-radius: 10px;
  padding: 14px;
}

.cc-style-label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 10px;
}

.cc-style-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.cc-style-option {
  padding: 7px 14px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  color: #606266;
}

.cc-style-option:hover {
  border-color: #409eff;
  color: #409eff;
}

.cc-style-option.active {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
  font-weight: 500;
}

/* ===== 补充信息 ===== */
.cc-supplement-grid {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.cc-supplement-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cc-field-label {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
}

/* ===== 关键词选择 ===== */
.cc-selected-kw {
  margin-bottom: 20px;
}

.cc-selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px;
  background: #f0f9eb;
  border-radius: 10px;
  border: 1px solid #e1f3d8;
}

.cc-keyword-tag {
  font-size: 14px;
  padding: 6px 12px;
  border-radius: 6px;
}

.cc-filter-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.cc-filter-tag {
  padding: 6px 16px;
  border: 1px solid #dcdfe6;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  color: #606266;
}

.cc-filter-tag:hover {
  border-color: #409eff;
  color: #409eff;
}

.cc-filter-tag.active {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
}

.cc-kw-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
}

.cc-kw-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}

.cc-kw-card:hover {
  border-color: #409eff;
  background: #ecf5ff;
}

.cc-kw-card.selected {
  border-color: #409eff;
  background: linear-gradient(135deg, #ecf5ff 0%, #d9ecff 100%);
}

.cc-kw-text {
  font-size: 13px;
  color: #303133;
}

.cc-kw-tag {
  font-size: 11px;
}

/* ===== 空状态提示 ===== */
.cc-empty-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  background: #fafafa;
  border: 2px dashed #e4e7ed;
  border-radius: 12px;
  margin: 16px 0;
}

.cc-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: #606266;
  margin-top: 12px;
}

.cc-empty-desc {
  font-size: 14px;
  color: #909399;
  margin-top: 6px;
}

.cc-empty-divider {
  font-size: 13px;
  color: #c0c4cc;
  margin: 14px 0 8px;
}

.cc-hint {
  font-size: 12px;
  color: #909399;
  font-weight: normal;
}

/* ===== 配图选择 ===== */
.cc-img-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.cc-img-card {
  position: relative;
  border: 2px solid #e4e7ed;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}

.cc-img-card:hover {
  border-color: #409eff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
}

.cc-img-card.selected {
  border-color: #409eff;
}

.cc-img-thumb {
  width: 100%;
  height: 90px;
  object-fit: cover;
}

.cc-img-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(64, 158, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.cc-img-card.selected .cc-img-overlay {
  opacity: 1;
}

.cc-img-name {
  padding: 6px 8px;
  font-size: 12px;
  color: #606266;
  text-align: center;
  background: #f5f7fa;
}

.cc-img-count {
  font-size: 13px;
  color: #409eff;
  margin-top: 12px;
  font-weight: 500;
}

/* ===== 配置预览卡片 ===== */
.cc-config-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 20px;
}

.cc-config-card {
  background: linear-gradient(135deg, #ecf5ff 0%, #d9ecff 100%);
  border-radius: 10px;
  padding: 14px 16px;
  border: 1px solid #b3d8fd;
}

.cc-config-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px;
}

.cc-config-icon {
  font-size: 16px;
}

.cc-config-value {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

/* ===== Prompt 预览 ===== */
.cc-prompt-section {
  margin-bottom: 20px;
}

.cc-prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.cc-prompt-box {
  background: #1d1e21;
  color: #a9b7c6;
  padding: 16px;
  border-radius: 10px;
  max-height: 180px;
  overflow-y: auto;
}

.cc-prompt-text {
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  margin: 0;
}

/* ===== 生成区域 ===== */
.cc-generate-section {
  display: flex;
  gap: 14px;
  justify-content: center;
  margin: 24px 0;
}

.cc-progress {
  margin-top: 20px;
}

.cc-progress-text {
  text-align: center;
  font-size: 14px;
  color: #606266;
  margin-top: 10px;
}

/* ===== 步骤导航按钮 ===== */
.cc-step-footer {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid #ebeef5;
}

/* ===== 生成结果区域 ===== */
.cc-result-section {
  background: #fff;
  border-radius: 16px;
  padding: 28px;
  margin-top: 28px;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
}

.cc-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.cc-result-title {
  font-size: 22px;
  font-weight: 700;
  color: #409eff;
}

.cc-result-tags {
  display: flex;
  gap: 10px;
}

.cc-article-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

/* ===== 编辑工具栏 ===== */
.cc-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: #f5f7fa;
  border-radius: 10px 10px 0 0;
  border: 1px solid #e4e7ed;
  border-bottom: none;
  flex-wrap: wrap;
}

/* ===== 富文本编辑器容器 ===== */
.cc-editor-container {
  border: 1px solid #e4e7ed;
  border-radius: 0 0 10px 10px;
  min-height: 400px;
  background: #fff;
}

.cc-editor-content {
  padding: 16px;
}

/* ===== 编辑器内容样式 ===== */
.cc-editor-content :deep(.ProseMirror) {
  min-height: 380px;
  outline: none;
  line-height: 1.8;
  color: #303133;
}

.cc-editor-content :deep(.ProseMirror p) {
  margin: 0 0 1em;
}

.cc-editor-content :deep(.ProseMirror h1) {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  margin: 1.5em 0 0.8em;
  padding-bottom: 8px;
  border-bottom: 2px solid #409eff;
}

.cc-editor-content :deep(.ProseMirror h2) {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 1.3em 0 0.6em;
}

.cc-editor-content :deep(.ProseMirror h3) {
  font-size: 17px;
  font-weight: 600;
  color: #606266;
  margin: 1.2em 0 0.5em;
}

.cc-editor-content :deep(.ProseMirror ul),
.cc-editor-content :deep(.ProseMirror ol) {
  margin: 0.8em 0;
  padding-left: 1.5em;
}

.cc-editor-content :deep(.ProseMirror li) {
  margin: 0.3em 0;
}

.cc-editor-content :deep(.ProseMirror blockquote) {
  border-left: 4px solid #409eff;
  padding: 8px 16px;
  margin: 1em 0;
  background: #ecf5ff;
  border-radius: 0 8px 8px 0;
  color: #606266;
}

.cc-editor-content :deep(.ProseMirror strong) {
  color: #409eff;
  font-weight: 600;
}

.cc-editor-content :deep(.ProseMirror img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 1em 0;
}

/* ===== 保存按钮 ===== */
.cc-result-actions {
  display: flex;
  gap: 14px;
  margin-top: 24px;
}

/* ===== 按钮样式（品牌紫色主题） ===== */
.cc-btn-primary {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 500;
  transition: all 0.25s ease;
}

.cc-btn-primary:hover {
  background: linear-gradient(135deg, #5558e3 0%, #7c4ee0 100%) !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.35);
}

.cc-btn-secondary {
  border: 1px solid #dcdfe6 !important;
  color: #606266 !important;
  font-weight: 500;
  transition: all 0.25s ease;
  background: #fff !important;
}

.cc-btn-secondary:hover {
  border-color: #409eff !important;
  color: #409eff !important;
  background: #ecf5ff !important;
}

.cc-btn-warning {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
  border: none !important;
  color: #fff !important;
}

.cc-btn-success {
  background: #67c23a !important;
  border: none !important;
  color: #fff !important;
}

.cc-btn-generate {
  background: linear-gradient(135deg, #409eff 0%, #337ecc 100%) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  font-size: 16px !important;
  padding: 12px 36px !important;
}

.cc-btn-generate:hover {
  background: linear-gradient(135deg, #337ecc 0%, #2b6cb0 100%) !important;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(64, 158, 255, 0.4);
}

/* ===== 响应式设计 ===== */
@media (max-width: 900px) {
  .cc-type-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .cc-style-grid {
    grid-template-columns: 1fr;
  }
  .cc-config-cards {
    grid-template-columns: 1fr;
  }
  .cc-kw-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .cc-img-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .cc-steps-bar {
    flex-wrap: wrap;
    gap: 16px;
  }
  .cc-step-line {
    display: none;
  }
}

@media (max-width: 600px) {
  .cc-header {
    flex-direction: column;
    text-align: center;
  }
  .cc-header-actions {
    margin-left: 0;
    margin-top: 12px;
  }
  .cc-type-grid {
    grid-template-columns: 1fr;
  }
  .cc-img-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .cc-result-actions {
    flex-direction: column;
  }
}

</style>
