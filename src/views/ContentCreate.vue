<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex items-center mb-4">
      <div>
        <div class="text-lg font-bold">AI 文章创作</div>
        <div class="text-sm text-gray-500">智能生成品牌营销文章</div>
      </div>
      <div class="ml-auto">
        <el-button @click="$router.push('/drafts')">
          <el-icon class="mr-1"><Folder /></el-icon>
          草稿箱
        </el-button>
      </div>
    </div>

    <el-form :model="form" label-width="100px" class="mb-6">
      <el-form-item label="选择关键词">
        <el-select v-model="form.keyword" placeholder="请选择品牌/产品关键词" style="width: 300px;">
          <el-option v-for="kw in keywords" :key="kw.id" :label="kw.keyword" :value="kw.keyword" />
        </el-select>
      </el-form-item>

      <el-form-item label="目标受众">
        <el-select v-model="form.audience" placeholder="请选择目标受众" style="width: 300px;">
          <el-option label="职场白领" value="职场白领" />
          <el-option label="年轻妈妈" value="年轻妈妈" />
          <el-option label="学生群体" value="学生群体" />
          <el-option label="科技爱好者" value="科技爱好者" />
        </el-select>
      </el-form-item>

      <el-form-item label="投放平台">
        <el-checkbox-group v-model="form.platforms" style="width: 500px;">
          <el-checkbox label="微信公众号">微信公众号</el-checkbox>
          <el-checkbox label="小红书">小红书</el-checkbox>
          <el-checkbox label="知乎">知乎</el-checkbox>
          <el-checkbox label="微博">微博</el-checkbox>
        </el-checkbox-group>
      </el-form-item>

      <el-form-item label="指令模板">
        <el-select v-model="form.command" placeholder="请选择指令模板" style="width: 400px;">
          <el-option v-for="cmd in commands" :key="cmd.id" :label="cmd.name" :value="cmd.id" />
        </el-select>
      </el-form-item>

      <!-- Step 2: 知识库文档集成 -->
      <el-form-item label="关联文档">
        <el-select 
          v-model="form.selectedDocs" 
          multiple 
          placeholder="选择知识库文档(可多选)" 
          style="width: 400px;"
          collapse-tags
          collapse-tags-tooltip
        >
          <!-- 选中后在输入框显示的标签 -->
          <template #label="{ label }">
            <div class="flex items-center gap-1">
              <el-tag 
                v-for="docId in form.selectedDocs" 
                :key="docId"
                :type="getDocAnalyzedType(docId)"
                size="small"
                effect="plain"
              >
                {{ getDocName(docId) }}
              </el-tag>
            </div>
          </template>
          <!-- 下拉选项 -->
          <el-option 
            v-for="doc in knowledgeDocs" 
            :key="doc.docId" 
            :label="doc.docName" 
            :value="doc.docId"
          >
            <div class="flex items-center justify-between w-full">
              <span>{{ doc.docName }}</span>
              <el-tag 
                v-if="doc.analyzedAt" 
                type="success" 
                size="small" 
                effect="plain"
              >
                已分析
              </el-tag>
              <el-tag 
                v-else 
                type="warning" 
                size="small" 
                effect="plain"
              >
                待分析
              </el-tag>
            </div>
          </el-option>
        </el-select>
        <span class="ml-2 text-sm text-gray-500">已选 {{ form.selectedDocs?.length || 0 }} 篇</span>
      </el-form-item>

      <!-- Step 3: 图库集成 -->
      <el-form-item label="选择配图">
        <el-select 
          v-model="form.selectedImages" 
          multiple 
          placeholder="选择配图(可多选)" 
          style="width: 400px;"
          collapse-tags
          collapse-tags-tooltip
        >
          <el-option 
            v-for="img in images" 
            :key="img.id" 
            :label="img.name || '图片 ' + img.id" 
            :value="img.url" 
          >
            <div class="flex items-center">
              <img :src="img.url" class="w-8 h-8 object-cover mr-2 rounded" />
              <span>{{ img.name || '图片 ' + img.id }}</span>
            </div>
          </el-option>
        </el-select>
        <span class="ml-2 text-sm text-gray-500">已选 {{ form.selectedImages?.length || 0 }} 张</span>
      </el-form-item>

      <el-form-item label="补充说明">
        <el-input v-model="form.extra" type="textarea" :rows="3" placeholder="额外要求" style="width: 500px;" />
      </el-form-item>

      <!-- Step 5: UI/UX 打磨 - 进度条 -->
      <el-form-item v-if="isGenerating">
        <div style="width: 500px;">
          <el-progress :percentage="progressPercent" :status="progressStatus" :stroke-width="12" />
          <div class="text-sm text-gray-500 mt-1">{{ progressText }}</div>
        </div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="handleGenerate" :loading="isGenerating">
          {{ isGenerating ? '生成中...' : '开始生成' }}
        </el-button>
        <el-button @click="togglePromptPreview" :disabled="!form.keyword || !form.command">
          {{ showPromptPreview ? '隐藏预览' : '预览 prompt' }}
        </el-button>
        <el-button @click="handleSaveDraft" :disabled="!generatedContent">保存草稿</el-button>
        <el-button @click="handleSaveAsNew" :disabled="!generatedContent" type="warning">另存为新</el-button>
      </el-form-item>

      <!-- 预览 prompt 面板 -->
      <el-form-item v-if="showPromptPreview">
        <div class="bg-gray-100 p-4 rounded-lg" style="width: 700px; max-height: 300px; overflow-y: auto;">
          <div class="text-sm font-bold mb-2 text-gray-600">📝 实际发送给 AI 的完整 prompt（可自由编辑）：</div>
          <textarea
            v-model="previewPrompt"
            class="text-xs whitespace-pre-wrap text-gray-700 bg-transparent border-0 resize-none w-full outline-none"
            style="min-height: 200px; font-family: inherit;"
            placeholder="prompt 预览区"
          ></textarea>
        </div>
      </el-form-item>
    </el-form>

    <!-- 生成历史记录面板 -->
    <el-collapse v-if="generateHistory.length > 0" class="mb-4">
      <el-collapse-item name="history">
        <template #title>
          <div class="flex items-center">
            <el-icon class="mr-2"><Clock /></el-icon>
            <span>生成历史 ({{ generateHistory.length }})</span>
          </div>
        </template>
        <div class="space-y-2">
          <div 
            v-for="item in generateHistory" 
            :key="item.id"
            class="flex items-center justify-between p-2 border rounded hover:bg-gray-50 cursor-pointer"
            @click="loadHistoryRecord(item)"
          >
            <div class="flex-1 min-w-0">
              <div class="text-sm text-gray-500">
                <span>{{ item.createdAt }}</span>
                <span class="mx-2">|</span>
                <span>{{ item.keyword }}</span>
              </div>
              <div class="text-base font-medium truncate">{{ item.title || '(无标题)' }}</div>
            </div>
            <el-button 
              size="small" 
              type="danger" 
              text
              @click.stop="deleteHistory(item.id)"
              class="ml-2"
            >
              删除
            </el-button>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>

    <!-- Step 5: UI/UX 打磨 - 质量预估标签 -->
    <div v-if="generatedContent" class="border rounded-lg p-4">
      <div class="flex items-center justify-between mb-2">
        <div class="font-bold">生成结果</div>
        <!-- Step 5: 质量预估标签 -->
        <div class="flex gap-2">
          <el-tag type="success" effect="plain">原创度: {{ qualityScores.originality }}%</el-tag>
          <el-tag type="warning" effect="plain">GEO评分: {{ qualityScores.geoScore }}</el-tag>
          <el-tag type="info" effect="plain">E-E-A-T: {{ qualityScores.eeat }}</el-tag>
        </div>
      </div>
      
      <div v-if="generatedTitle" class="text-lg font-bold text-purple-600 mb-3">{{ generatedTitle }}</div>
      
      <!-- Step 3: 图库集成 - 展示配图 -->
      <div v-if="form.selectedImages?.length" class="mb-4">
        <div class="text-sm text-gray-500 mb-2">配图预览：</div>
        <div class="flex flex-wrap gap-2">
          <img 
            v-for="(imgUrl, idx) in form.selectedImages" 
            :key="idx"
            :src="imgUrl" 
            class="w-32 h-32 object-cover rounded-lg border"
          />
        </div>
      </div>
      
      <!-- Step 5: 段落级编辑按钮 -->
      <div class="mb-3">
        <el-button size="small" @click="copyContent" type="primary" plain>
          <el-icon class="mr-1"><CopyDocument /></el-icon>复制全文
        </el-button>
        <el-button size="small" @click="regenerateParagraph" type="warning" plain>
          <el-icon class="mr-1"><Refresh /></el-icon>重写段落
        </el-button>
      </div>
      
      <textarea
        v-model="generatedContent"
        class="text-gray-700 w-full border rounded-lg p-3 outline-none focus:border-purple-400"
        style="min-height: 300px; font-family: inherit; white-space: pre-wrap; resize: vertical;"
      ></textarea>
    </div>

    <el-empty v-else description="填写上方表单开始AI创作" />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getList, addItem, saveList } from '../utils/storage'
import { Folder, CopyDocument, Refresh, Clock } from '@element-plus/icons-vue'

// ========== DeepSeek API 配置 ==========
const DEEPSEEK_API_KEY = 'sk-c8769ba486ee46d799a37a4b8e747159'
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1'
const DEEPSEEK_MODEL = 'deepseek-chat'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const router = useRouter()
const form = ref({
  keyword: '',
  audience: '',
  platforms: [],
  command: '',
  extra: '',
  editId: null,
  selectedDocs: [],    // Step 2: 选中的知识库文档
  selectedImages: []   // Step 3: 选中的配图
})
const generatedContent = ref('')
const generatedTitle = ref('')
const isGenerating = ref(false)
const keywords = ref([])
const commands = ref([])

// ========== 预览 prompt 功能 ==========
const showPromptPreview = ref(false)
const previewPrompt = ref('')

// 切换 prompt 预览显示
const togglePromptPreview = () => {
  if (!showPromptPreview.value) {
    previewPrompt.value = buildGeoPrompt()
  }
  showPromptPreview.value = !showPromptPreview.value
}

// 表单变化时自动刷新预览
watch(form, () => {
  if (showPromptPreview.value) {
    previewPrompt.value = buildGeoPrompt()
  }
}, { deep: true })
// ========== 预览 prompt 功能结束 ==========

// Step 2: 知识库文档列表
const knowledgeDocs = ref([])

// ========== 知识库文档 AI 分析状态校验 ==========
/**
 * 检查选中的文档是否都已做过AI分析
 * 返回：{ valid: true } 或 { valid: false, names: '未分析文档名称' }
 */
const checkDocsAnalyzed = () => {
  const selected = form.value.selectedDocs || []
  if (selected.length === 0) return { valid: true }
  
  // 筛选出未分析的文档
  const unanalyzed = knowledgeDocs.value.filter(doc => 
    selected.includes(doc.docId) && !doc.analyzedAt
  )
  
  if (unanalyzed.length > 0) {
    return {
      valid: false,
      names: unanalyzed.map(d => d.docName).join('、')
    }
  }
  return { valid: true }
}

// 获取文档名称（用于 label 显示）
const getDocName = (docId) => {
  const doc = knowledgeDocs.value.find(d => d.docId === docId)
  return doc?.docName || ''
}

// 获取文档分析状态类型（用于标签颜色）
const getDocAnalyzedType = (docId) => {
  const doc = knowledgeDocs.value.find(d => d.docId === docId)
  return doc?.analyzedAt ? 'success' : 'warning'
}
// ========== 校验函数结束 ==========

// Step 3: 图库列表
const images = ref([])

// ========== 生成历史功能 ==========
// localStorage key，避免冲突
const HISTORY_STORAGE_KEY = 'auyologic-generate-history'
const MAX_HISTORY_COUNT = 20

// 生成历史列表
const generateHistory = ref([])

// 加载历史记录（从 localStorage）
const loadHistory = () => {
  try {
    const historyData = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (historyData) {
      generateHistory.value = JSON.parse(historyData)
    }
  } catch (e) {
    console.error('加载生成历史失败', e)
    generateHistory.value = []
  }
}

// 保存历史记录到 localStorage
const saveHistory = () => {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(generateHistory.value))
  } catch (e) {
    console.error('保存生成历史失败', e)
  }
}

// 添加新记录到历史列表
const addToHistory = (title, content, keyword, audience, platforms, commandId) => {
  const newRecord = {
    id: Date.now(), // 用时间戳作为唯一ID
    title: title || '',
    content: content,
    keyword: keyword,
    audience: audience,
    platforms: platforms ? [...platforms] : [],
    commandId: commandId,
    createdAt: new Date().toLocaleString('zh-CN')
  }
  
  // 添加到列表顶部
  generateHistory.value.unshift(newRecord)
  
  // 超出数量限制时删除最早的记录
  if (generateHistory.value.length > MAX_HISTORY_COUNT) {
    generateHistory.value = generateHistory.value.slice(0, MAX_HISTORY_COUNT)
  }
  
  saveHistory()
}

// 删除历史记录
const deleteHistory = (id) => {
  generateHistory.value = generateHistory.value.filter(item => item.id !== id)
  saveHistory()
  ElMessage.success('已删除该历史记录')
}

// 加载历史记录到编辑区
const loadHistoryRecord = (record) => {
  // 恢复表单数据
  form.value.keyword = record.keyword || ''
  form.value.audience = record.audience || ''
  form.value.platforms = record.platforms ? [...record.platforms] : []
  form.value.command = record.commandId || ''
  
  // 恢复生成结果
  generatedTitle.value = record.title || ''
  generatedContent.value = record.content
  
  ElMessage.success('已加载历史记录')
}

// ========== 生成历史功能结束 ==========

// Step 5: 质量预估分数 (Mock数据)
const qualityScores = ref({
  originality: 85,
  geoScore: 'A+',
  eeat: '高'
})

// Step 5: 进度条相关
const progressPercent = ref(0)
const progressStatus = ref('')
const progressText = ref('正在准备生成...')

const selectedCommand = computed(() => {
  return commands.value.find(c => c.id === form.value.command)
})

onMounted(async () => {
  // 从后端 API 加载关键词
  try {
    const res = await fetch(`${API_BASE_URL}/api/keywords`)
    if (res.ok) {
      const data = await res.json()
      keywords.value = data
      // API 返回空但 localStorage 有数据时，合并
      if (data.length === 0) {
        const localKw = getList('keywords')
        if (localKw.length > 0) keywords.value = localKw
      }
      saveList('keywords', keywords.value)
    }
  } catch {
    // 失败则从 localStorage 读取
    keywords.value = getList('keywords')
  }

  // 从后端 API 加载指令模板
  try {
    const res = await fetch(`${API_BASE_URL}/api/instruction-templates`)
    if (res.ok) {
      const data = await res.json()
      commands.value = migrateCommands(data)
      // API 返回空但 localStorage 有数据时，合并（避免旧数据丢失）
      if (data.length === 0) {
        const localCmds = getList('commands')
        if (localCmds.length > 0) {
          commands.value = migrateCommands(localCmds)
          saveList('commands', localCmds)
        }
      } else {
        saveList('commands', data)
      }
    }
  } catch {
    // 网络错误则从 localStorage 读取
    commands.value = migrateCommands(getList('commands'))
  }
  
  // Step 2: 加载知识库文档
  loadKnowledgeDocs()
  
  // Step 3: 加载图库
  loadImages()
  
  // 加载生成历史
  loadHistory()
  
  // 检查是否有草稿要编辑
  const savedDraft = sessionStorage.getItem('editDraft')
  if (savedDraft) {
    try {
      const draft = JSON.parse(savedDraft)
      form.value.keyword = draft.brand || ''
      form.value.command = draft.commandId || ''
      form.value.audience = draft.audience || ''
      form.value.platforms = draft.platforms || []
      form.value.extra = draft.extra || ''
      generatedContent.value = draft.content || ''
      generatedTitle.value = draft.title || ''
      form.value.editId = draft.id
      // 恢复选中的文档和图片
      form.value.selectedDocs = draft.selectedDocs || []
      form.value.selectedImages = draft.selectedImages || []
      sessionStorage.removeItem('editDraft')
    } catch (e) {
      console.error('加载草稿失败', e)
    }
  }
})

// Step 2: 加载知识库文档 (从 localStorage 读取，兼容两种数据格式)
// 保留完整的分析结果数据：keywords、summary、keyPoints、analyzedAt
const loadKnowledgeDocs = () => {
  // 优先读取 Knowledge.vue 存储的 key
  let docs = localStorage.getItem('auyologic-knowledge')
  if (!docs) {
    // 兼容旧测试数据 key
    docs = localStorage.getItem('knowledgeDocs')
  }
  if (!docs) {
    // 创建测试数据（无分析结果，走老逻辑）
    const testDocs = [
      {
        docId: 'doc1',
        docName: '产品核心卖点分析',
        docContent: '本产品主打三大核心卖点：1. 高效节能，采用最新一代变频技术；2. 智能互联，支持手机APP远程控制；3. 极致静音，噪音低于25分贝。'
      },
      {
        docId: 'doc2',
        docName: '竞品对比数据',
        docContent: '与竞品A相比，本产品在性价比方面高出30%；与竞品B相比，在售后服务响应速度上快50%。'
      },
      {
        docId: 'doc3',
        docName: '用户口碑汇总',
        docContent: '根据电商平台评论数据，好评率达98%，用户最常提及的关键词：质量好、性价比高、售后完善。'
      },
      {
        docId: 'doc4',
        docName: '行业趋势报告',
        docContent: '2026年行业趋势：智能化、绿色环保、个性化定制将成为主流方向。'
      }
    ]
    localStorage.setItem('knowledgeDocs', JSON.stringify(testDocs))
    docs = testDocs
  } else {
    const parsedDocs = JSON.parse(docs)
    // 转换 Knowledge.vue 存储的数据结构为 ContentCreate.vue 需要的格式
    // 保留完整的分析结果数据（keywords、summary、keyPoints、analyzedAt）
    docs = parsedDocs.map((doc, index) => ({
      docId: doc.id || doc.docId || `doc${index + 1}`,
      docName: doc.name || doc.docName || '未命名文档',
      docContent: doc.content || doc.docContent || '',
      // 保留 AI 分析结果
      keywords: doc.keywords || [],
      summary: doc.summary || '',
      keyPoints: doc.keyPoints || [],
      analyzedAt: doc.analyzedAt || null
    }))
  }
  knowledgeDocs.value = docs
}

/**
 * 根据用户选择的关键词，构建精准的内容素材 prompt
 * 流程：用户选关键词 → 匹配知识库文档 keywords → 拿 summary + keyPoints
 */
const buildContentPrompt = () => {
  const selectedKeyword = form.value.keyword  // 用户选的关键词
  const selectedDocIds = form.value.selectedDocs || []
  
  if (!selectedKeyword) return ''
  
  // 1. 找出所有已分析且有关键词匹配的文档
  const matchedDocs = knowledgeDocs.value.filter(doc => {
    // 必须有分析结果才走精准匹配逻辑
    if (!doc.analyzedAt) return false
    // 如果用户手动选了文档，优先使用选中的文档
    if (selectedDocIds.length > 0 && !selectedDocIds.includes(doc.docId)) return false
    // 模糊匹配：文档关键词包含用户选的品牌词/产品词
    const docKeywords = doc.keywords || []
    return docKeywords.some(kw => 
      selectedKeyword.toLowerCase().includes(kw.toLowerCase()) ||
      kw.toLowerCase().includes(selectedKeyword.toLowerCase())
    )
  })
  
  // 2. 拼素材内容
  if (matchedDocs.length === 0) return ''  // 没有匹配则返回空
  
  const materials = matchedDocs.map(doc => {
    return `【${doc.docName}】
摘要：${doc.summary || ''}
核心要点：${(doc.keyPoints || []).join('、')}
关键词：${(doc.keywords || []).join('、')}`
  }).join('\n\n')
  
  return `\n\n## 参考知识素材\n${materials}`
}

// Step 3: 加载图库 (从 localStorage 读取，兼容两种数据格式)
const loadImages = () => {
  // 优先读取 Images.vue 存储的 key
  let imgs = localStorage.getItem('auyologic-images')
  if (!imgs) {
    // 兼容旧测试数据 key
    imgs = localStorage.getItem('images')
  }
  if (!imgs) {
    // 创建测试数据
    const testImages = [
      { id: 'img1', name: '产品正面图', url: 'https://picsum.photos/400/300?random=1' },
      { id: 'img2', name: '使用场景图', url: 'https://picsum.photos/400/300?random=2' },
      { id: 'img3', name: '细节展示图', url: 'https://picsum.photos/400/300?random=3' },
      { id: 'img4', name: '对比图', url: 'https://picsum.photos/400/300?random=4' },
      { id: 'img5', name: '用户评价截图', url: 'https://picsum.photos/400/300?random=5' }
    ]
    localStorage.setItem('images', JSON.stringify(testImages))
    imgs = testImages
  } else {
    const parsedImgs = JSON.parse(imgs)
    // 转换 Images.vue 存储的数据结构为 ContentCreate.vue 需要的格式
    // Images.vue 存的是 preview (base64)，ContentCreate.vue 需要 url
    imgs = parsedImgs.map((img, index) => ({
      id: img.id || `img${index + 1}`,
      name: img.name || `图片 ${index + 1}`,
      url: img.preview || img.url || ''
    }))
  }
  images.value = imgs
}

// ========== 迁移旧的 commands 数据 =====
/**
 * 将旧模板 prompt 转换为纯类型标签格式
 * 旧格式：包含 {brand}、{keyword} 等变量的完整 prompt
 * 新格式：只描述"类型特征"，不含具体话题
 */
const migrateCommands = (cmds) => {
  if (!cmds || cmds.length === 0) return []
  
  const migratedCmds = cmds.map(cmd => {
    const prompt = cmd.prompt || ''
    
    // 检查是否包含旧变量（需要迁移的标志）
    const hasOldVars = /\{(brand|keyword|knowledge|images)\}/.test(prompt)
    
    if (hasOldVars) {
      // 提取"写作风格/类型"相关的描述，移除具体变量
      let newPrompt = prompt
        .replace(/品牌\s*\{brand\}/gi, '')
        .replace(/关于\s*\{keyword\}/gi, '')
        .replace(/\{brand\}/gi, '')
        .replace(/\{keyword\}/gi, '')
        .replace(/参考知识:\s*\{knowledge\}/gi, '')
        .replace(/参考图片:\s*\{images\}/gi, '')
        .replace(/参考内容:\s*\{knowledge\}/gi, '')
        .replace(/\{knowledge\}/gi, '')
        .replace(/\{images\}/gi, '')
        .replace(/目标受众：\{audience\}/gi, '')
        .replace(/投放平台：\{platforms\}/gi, '')
        .replace(/补充说明：\{extra\}/gi, '')
        .replace(/\{audience\}/gi, '')
        .replace(/\{platforms\}/gi, '')
        .replace(/\{extra\}/gi, '')
        .trim()
      
      // 保留关于"怎么写"的描述（风格、结构、要求等）
      // 这些是纯类型特征，不是具体话题
      
      // 如果处理后为空或太短，提供一个默认类型描述
      if (!newPrompt || newPrompt.length < 20) {
        newPrompt = getDefaultTypePrompt(cmd.type)
      }
      
      return { ...cmd, prompt: newPrompt }
    }
    
    return cmd
  })
  
  return migratedCmds
}

// 根据类型获取默认的风格描述
const getDefaultTypePrompt = (type) => {
  const typePrompts = {
    '文章创作': '结构清晰，内容充实，语言流畅，有真情实感',
    '短视频文案': '简洁有力，节奏快，画面感强，适合口头表达',
    '社交媒体': '口语化，真实感强，便于互动传播',
    '默认': '专业、客观、有价值'
  }
  return typePrompts[type] || typePrompts['默认']
}
// ========== 迁移函数结束 ==========

// ========== 写作风格池（随机选择，减少AI感）==========
const WRITING_STYLES = [
  '知乎深度回答：专业有料，数据+案例驱动，不说教，有观点有态度',
  '公众号爆款：开头即爆点，层层递进，情绪价值拉满，引发共鸣',
  '小红书种草：真实体验代入，轻快有温度，语言活泼，emoji点缀',
  '专业测评：冷静客观，数据说话，结构清晰但不刻板，有理有据',
  '品牌故事：情怀+画面感，润物细无声，不硬广，有温度有深度'
]

// 随机获取一个写作风格（避免每次都是同一个）
const getRandomStyle = () => {
  const index = Math.floor(Math.random() * WRITING_STYLES.length)
  return WRITING_STYLES[index]
}

// 随机获取开头方式（增加多样性）
const INTRO_STYLES = [
  '故事引入：以一个真实场景或用户痛点故事开头',
  '数据开场：用惊人的数据或调研结果吸引注意力',
  '问题导向：以一个引发思考的问题开头',
  '对比冲击：通过对比制造认知反差引入主题',
  '直接开炸：开门见山，直击核心卖点'
]

const getRandomIntro = () => {
  const index = Math.floor(Math.random() * INTRO_STYLES.length)
  return INTRO_STYLES[index]
}

// 随机获取结尾方式
const OUTRO_STYLES = [
  '行动号召：明确告诉读者应该做什么',
  '开放式留白：引发读者思考和讨论',
  '情感升华：将产品价值上升到情感层面',
  '数据印证：用数据强化结论',
  '自然收尾：简洁有力，不刻意煽情'
]

const getRandomOutro = () => {
  const index = Math.floor(Math.random() * OUTRO_STYLES.length)
  return OUTRO_STYLES[index]
}

// ========== 改造后的 buildGeoPrompt - 以关键词为核心驱动 ==========
/**
 * 新流程：关键词 + 模板类型 + 知识库素材
 * - 关键词 = 文章主题（核心驱动）
 * - 模板类型 = 文章风格/类型（不含具体话题）
 * - 知识库素材 = 上下文参考
 */
const buildGeoPrompt = () => {
  const cmd = selectedCommand.value
  const keyword = form.value.keyword  // 关键词 = 文章主题（核心驱动）
  const audience = form.value.audience || '目标用户'
  const platforms = form.value.platforms
  const extra = form.value.extra || ''
  const templateName = cmd?.name || '软文'  // 模板名称 = 类型标签
  
  if (!keyword) {
    return '请先选择关键词'
  }
  
  // ===== 1. 核心驱动：关键词 = 文章要写什么 =====
  const coreDriver = `请为【${keyword}】写一篇【${templateName}】`
  
  // ===== 2. 知识库素材：根据关键词匹配 =====
  // 先尝试精准匹配：基于关键词匹配分析结果
  let contextContent = ''
  const matchedMaterial = buildContentPrompt()
  
  if (matchedMaterial) {
    // 有精准匹配结果，使用摘要+要点格式
    contextContent = `\n\n## 📚 知识库素材（参考）\n${matchedMaterial}`
  } else {
    // 无精准匹配结果，降级处理：使用原文内容（兼容没有分析过的文档）
    if (form.value.selectedDocs?.length) {
      const selectedDocContents = form.value.selectedDocs.map(docId => {
        const doc = knowledgeDocs.value.find(d => d.docId === docId)
        return doc ? `【${doc.docName}】\n${doc.docContent}` : ''
      }).filter(Boolean)
      
      if (selectedDocContents.length > 0) {
        contextContent = `\n\n## 📚 知识库文档（参考）\n${selectedDocContents.join('\n\n')}`
      }
    }
  }
  
  // ===== 3. 拼入选中的图片信息 =====
  let imageContext = ''
  if (form.value.selectedImages?.length) {
    imageContext = `\n\n## 🖼️ 配图要求\n请在适当位置插入以下配图（Markdown格式）：\n${form.value.selectedImages.map(url => `![](${url})`).join('\n')}`
  }
  
  // ===== 4. 目标受众约束 =====
  const audienceConstraint = `\n\n## 👥 目标受众\n${audience}`
  
  // ===== 5. 投放平台风格约束 =====
  let platformStyle = ''
  if (platforms.includes('小红书')) {
    platformStyle = `\n\n## 📕 小红书风格约束\n- 标题要吸睛，用 emoji 符号\n- 内容要口语化、真实感\n- 结尾加话题标签 #${keyword} #好物推荐\n- 300-500字为宜\n`
  } else if (platforms.includes('微信公众号')) {
    platformStyle = `\n\n## 📰 微信公众号风格约束\n- 标题要有吸引力\n- 内容要有深度，条理清晰\n- 可以适当引用数据增加权威性\n- 结尾引导关注和转发\n`
  } else if (platforms.includes('知乎')) {
    platformStyle = `\n\n## 💬 知乎风格约束\n- 以问题为导向开头\n- 内容要有干货、有见解\n- 适当引用权威来源和数据\n- 可以用对比表格增强说服力\n`
  }
  
  // ===== 6. 补充说明（额外要求）=====
  const extraConstraint = extra ? `\n\n## 📋 额外要求\n${extra}` : ''
  
  // ===== 7. 模板类型特征（只描述类型，不含具体话题）=====
  // 提取模板 prompt 中关于"怎么写"的描述，忽略变量替换
  let templateStyle = ''
  if (cmd?.prompt) {
    // 模板 prompt 描述的是"类型特征"，不是具体话题
    templateStyle = `\n\n## 📝 写作风格要求\n${cmd.prompt}`
  }
  
  // ===== 8. 随机获取写作风格和结构偏好 =====
  const randomStyle = getRandomStyle()
  const randomIntro = getRandomIntro()
  const randomOutro = getRandomOutro()

  // ===== 9. GEO 技巧增强 =====
  const geoEnhancement = `

## ⏰ 时间维度
统一使用"2026年当前"的时间视角撰写。

## 🎨 写作风格要求
${randomStyle}
要求：
- 去掉机械化的连接词（禁止"首先"、"其次"、"最后"、"综上所述"、"总的来说"）
- 使用自然的段落过渡，避免刻意的序号和编号
- 段落长度要有变化，不要均匀分布
- 可以适当使用口语化表达、缩写、俚语
- 加入真实细节和个人化表达

## 📋 文章结构要求（灵活处理）
开头方式：${randomIntro}

核心内容模块（根据内容自然选择3-4个，不要全部堆砌）：
- 产品亮点：核心卖点和使用价值
- 真实体验：个人使用感受和场景代入
- 对比分析：与竞品的差异化优势
- 购买建议：适合人群和选购要点

结尾方式：${randomOutro}

注意：不要每次都写完整的"标题→摘要→评测→对比表→榜单→Q&A"六大件，内容不够丰富就只写最核心的2-3个模块。

## 🌟 E-E-A-T 要素
- Experience（经验）：加入真实使用场景和个人体验
- Expertise（专业）：引用数据和专业术语
- Authoritativeness（权威）：引用权威来源、用户口碑
- Trustworthiness（可信）：客观描述优缺点，不夸大

## 🚫 禁止事项（反AI检测）
- 禁止使用：首先、其次、最后、综上所述、总的来说、整体来看等机械化连接词
- 禁止对话式开头（如"大家好"、"今天我们来"等）
- 禁止过度营销用语
- 禁止虚假夸大宣传
- 避免完美的结构对称（不要每个部分都同等篇幅）
- 禁止使用"作为一名..."、"相信大家..."、"毋庸置疑..."等AI常用句式

## ✨ 加分技巧（让文章更像人写的）
- 用具体的小故事或细节开头
- 适当加入一点"私货"和个人偏好
- 可以在文中适当使用流行语或网络梗
- 偶尔用一下反问、设问增加互动感`

  // ===== 组合完整 prompt =====
  const geoPrompt = `${coreDriver}${templateStyle}${contextContent}${audienceConstraint}${extraConstraint}${imageContext}${platformStyle}${geoEnhancement}

请直接输出文章内容，不要输出思考过程。`

  return geoPrompt
}
// ========== buildGeoPrompt 改造结束 ==========

// Step 1: DeepSeek API 调用
const callDeepSeekAPI = async (prompt) => {
  try {
    const response = await fetch(`${DEEPSEEK_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error?.message || `API请求失败: ${response.status}`)
    }
    
    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  } catch (error) {
    console.error('DeepSeek API 调用失败:', error)
    throw error
  }
}

// 解析 API 返回的内容，提取标题和正文
const parseGeneratedContent = (rawContent) => {
  let title = ''
  let content = rawContent
  
  // 尝试提取标题（通常是第一行或者用 # 标记的）
  const titleMatch = rawContent.match(/^#\s*(.+)$/m) || 
                     rawContent.match(/^标题[：:]\s*(.+)$/m) ||
                     rawContent.match(/^【(.+?)】$/m)
  
  if (titleMatch) {
    title = titleMatch[1].trim()
    // 移除标题行
    content = rawContent.replace(titleMatch[0], '').trim()
  }
  
  // 如果没有提取到标题，尝试生成一个
  if (!title && form.value.keyword) {
    const titleOptions = [
      `深度测评：${form.value.keyword}到底值不值得买？`,
      `${form.value.audience || '目标用户'}必看：${form.value.keyword}使用体验分享`,
      `关于${form.value.keyword}，你需要知道的那些事`
    ]
    title = titleOptions[Math.floor(Math.random() * titleOptions.length)]
  }
  
  return { title, content }
}

// Step 1: 主要生成函数
const handleGenerate = async () => {
  if (!form.value.keyword || !form.value.command) {
    ElMessage.warning('请填写必填信息')
    return
  }
  
  // ========== 检查文档是否都已AI分析 ==========
  const check = checkDocsAnalyzed()
  if (!check.valid) {
    ElMessage.warning(`以下文档还未AI分析，请先去知识库分析：${check.names}`)
    return
  }
  // ========== 校验结束 ==========
  
  isGenerating.value = true
  progressPercent.value = 10
  progressText.value = '正在准备内容...'
  
  try {
    // Step 4: 构建 GEO 增强后的 prompt
    progressPercent.value = 20
    progressText.value = '正在AI自动生成，请等待...'
    
    const geoPrompt = buildGeoPrompt()
    
    // Step 1: 调用 DeepSeek API
    const rawContent = await callDeepSeekAPI(geoPrompt)
    
    progressPercent.value = 80
    progressText.value = '正在整理内容...'
    
    // 解析内容
    const parsed = parseGeneratedContent(rawContent)
    generatedTitle.value = parsed.title
    generatedContent.value = parsed.content
    
    // Step 3: 在内容中加入配图（如果还没加入的话）
    if (form.value.selectedImages?.length && !rawContent.includes('![](')) {
      // 如果API返回的内容没有包含图片，在适当位置插入
      const imageMarkdown = '\n\n' + form.value.selectedImages.map(url => `![](${url})`).join('\n')
      generatedContent.value += imageMarkdown
    }
    
    progressPercent.value = 100
    progressStatus.value = 'success'
    progressText.value = '生成完成！'
    
    // 保存到生成历史
    addToHistory(
      parsed.title,
      parsed.content,
      form.value.keyword,
      form.value.audience,
      form.value.platforms,
      form.value.command
    )
    
    ElMessage.success('生成成功！点击上方「保存草稿」查看')
    
  } catch (error) {
    progressPercent.value = 0
    progressStatus.value = 'exception'
    progressText.value = '生成失败'
    
    console.error('生成失败:', error)
    ElMessage.error('生成失败: ' + error.message)
  } finally {
    // 重置进度条状态
    setTimeout(() => {
      isGenerating.value = false
      progressPercent.value = 0
      progressStatus.value = ''
      progressText.value = '正在准备生成...'
    }, 2000)
  }
}

// Step 5: 复制内容
const copyContent = () => {
  const text = generatedTitle.value ? `${generatedTitle.value}\n\n${generatedContent.value}` : generatedContent.value
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('已复制到剪贴板')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}

// Step 5: 重写段落（模拟功能）
const regenerateParagraph = () => {
  ElMessage.info('段落重写功能开发中...')
  // TODO: 实现段落级编辑功能
}

const handleSaveDraft = () => {
  if (form.value.editId) {
    const drafts = getList('drafts')
    const editId = Number(form.value.editId)
    const index = drafts.findIndex(d => Number(d.id) === editId)
    if (index !== -1) {
      drafts[index] = {
        ...drafts[index],
        title: generatedTitle.value || form.value.keyword + ' 软文',
        brand: form.value.keyword,
        content: generatedContent.value,
        audience: form.value.audience,
        platforms: form.value.platforms,
        commandId: form.value.command,
        extra: form.value.extra,
        selectedDocs: form.value.selectedDocs,
        selectedImages: form.value.selectedImages,
        updatedAt: new Date().toLocaleString('zh-CN')
      }
      saveList('drafts', drafts)
      ElMessage.success('草稿已更新')
    }
  } else {
    addItem('drafts', {
      title: generatedTitle.value || form.value.keyword + ' 软文',
      brand: form.value.keyword,
      content: generatedContent.value,
      audience: form.value.audience,
      platforms: form.value.platforms,
      commandId: form.value.command,
      extra: form.value.extra,
      selectedDocs: form.value.selectedDocs,
      selectedImages: form.value.selectedImages,
      status: '草稿'
    })
    ElMessage.success('已保存到草稿箱')
  }
  router.push('/drafts')
}

const handleSaveAsNew = () => {
  addItem('drafts', {
    title: generatedTitle.value || form.value.keyword + ' 软文',
    brand: form.value.keyword,
    content: generatedContent.value,
    audience: form.value.audience,
    platforms: form.value.platforms,
    commandId: form.value.command,
    extra: form.value.extra,
    selectedDocs: form.value.selectedDocs,
    selectedImages: form.value.selectedImages,
    status: '草稿'
  })
  ElMessage.success('已另存为新草稿')
  form.value.editId = null
  router.push('/drafts')
}
</script>
