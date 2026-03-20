<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex items-center mb-4">
      <div>
        <div class="text-lg font-bold">AI 软文创作</div>
        <div class="text-sm text-gray-500">智能生成品牌营销软文</div>
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
          <el-option 
            v-for="doc in knowledgeDocs" 
            :key="doc.docId" 
            :label="doc.docName" 
            :value="doc.docId" 
          />
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
        <el-button @click="handleSaveDraft" :disabled="!generatedContent">保存草稿</el-button>
        <el-button @click="handleSaveAsNew" :disabled="!generatedContent" type="warning">另存为新</el-button>
      </el-form-item>
    </el-form>

    <!-- Step 5: UI/UX 打磨 - 质量预估标签 -->
    <div v-if="generatedContent" class="border rounded-lg p-4">
      <div class="flex items-center justify-between mb-2">
        <div class="font-bold">生成结果</div>
        <!-- Step 5: 质量预估标签 -->
        <div class="flex gap-2">
          <el-tag type="success" effect="plain">原创度: {{ qualityScores.originality }}%</el-tag>
          <el-tag type="warning" effect="plain">SEO评分: {{ qualityScores.seoScore }}</el-tag>
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
      
      <div class="text-gray-700 whitespace-pre-wrap">{{ generatedContent }}</div>
    </div>

    <el-empty v-else description="填写上方表单开始AI创作" />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getList, addItem, saveList } from '../utils/storage'
import { Folder, CopyDocument, Refresh } from '@element-plus/icons-vue'

// ========== DeepSeek API 配置 ==========
const DEEPSEEK_API_KEY = 'sk-c8769ba486ee46d799a37a4b8e747159'
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1'
const DEEPSEEK_MODEL = 'deepseek-chat'

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

// Step 2: 知识库文档列表
const knowledgeDocs = ref([])

// Step 3: 图库列表
const images = ref([])

// Step 5: 质量预估分数 (Mock数据)
const qualityScores = ref({
  originality: 85,
  seoScore: 'A+',
  eeat: '高'
})

// Step 5: 进度条相关
const progressPercent = ref(0)
const progressStatus = ref('')
const progressText = ref('正在准备生成...')

const selectedCommand = computed(() => {
  return commands.value.find(c => c.id === form.value.command)
})

onMounted(() => {
  keywords.value = getList('keywords')
  commands.value = getList('commands')
  
  // Step 2: 加载知识库文档
  loadKnowledgeDocs()
  
  // Step 3: 加载图库
  loadImages()
  
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

// Step 2: 加载知识库文档 (从 localStorage 读取，没有则创建测试数据)
const loadKnowledgeDocs = () => {
  let docs = localStorage.getItem('knowledgeDocs')
  if (!docs) {
    // 创建测试数据
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
    docs = JSON.parse(docs)
  }
  knowledgeDocs.value = docs
}

// Step 3: 加载图库 (从 localStorage 读取，没有则创建测试数据)
const loadImages = () => {
  let imgs = localStorage.getItem('images')
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
    imgs = JSON.parse(imgs)
  }
  images.value = imgs
}

// Step 4: GEO Prompt 技巧融合 - 处理 prompt
const buildGeoPrompt = () => {
  const cmd = selectedCommand.value
  const brand = form.value.keyword
  const audience = form.value.audience || '目标用户'
  const platforms = form.value.platforms
  const extra = form.value.extra || ''
  
  // Step 2: 拼入知识库文档内容作为 context
  let contextContent = ''
  if (form.value.selectedDocs?.length) {
    const selectedDocContents = form.value.selectedDocs.map(docId => {
      const doc = knowledgeDocs.value.find(d => d.docId === docId)
      return doc ? `【${doc.docName}】\n${doc.docContent}` : ''
    }).filter(Boolean)
    
    if (selectedDocContents.length > 0) {
      contextContent = `\n\n## 参考知识库文档\n${selectedDocContents.join('\n\n')}`
    }
  }
  
  // Step 3: 拼入选中的图片信息
  let imageContext = ''
  if (form.value.selectedImages?.length) {
    imageContext = `\n\n## 配图要求\n请在适当位置插入以下配图（Markdown格式）：\n${form.value.selectedImages.map(url => `![](${url})`).join('\n')}`
  }
  
  // Step 4: 检测投放平台，添加对应的风格约束
  let platformStyle = ''
  if (platforms.includes('小红书')) {
    platformStyle = `\n\n## 小红书风格约束\n- 标题要吸睛，用 emoji 符号\n- 内容要口语化、真实感\n- 结尾加话题标签 #品牌名 #好物推荐\n- 300-500字为宜\n`
  } else if (platforms.includes('微信公众号')) {
    platformStyle = `\n\n## 微信公众号风格约束\n- 标题要有吸引力\n- 内容要有深度，条理清晰\n- 可以适当引用数据增加权威性\n- 结尾引导关注和转发\n`
  } else if (platforms.includes('知乎')) {
    platformStyle = `\n\n## 知乎风格约束\n- 以问题为导向开头\n- 内容要有干货、有见解\n- 适当引用权威来源和数据\n- 可以用对比表格增强说服力\n`
  }
  
  // Step 4: 构建增强后的 prompt
  const basePrompt = cmd?.prompt || `请为 ${brand} 撰写一篇推广软文，目标受众是 ${audience}。${extra ? '额外要求：' + extra : ''}`
  
  // GEO 技巧增强
  const geoPrompt = `${basePrompt}

## 时间维度
统一使用"2026年当前"的时间视角撰写。

## 文章结构要求
请按以下结构撰写：
1. 标题（简洁有力）
2. 摘要（100字内概括核心）
3. 评测/体验（真实使用感受）
4. 对比表（如有竞品）
5. 榜单推荐（如适用）
6. Q&A（常见问题解答）

## E-E-A-T 要素
- Experience（经验）：加入真实使用场景和个人体验
- Expertise（专业）：引用数据和专业术语
- Authoritativeness（权威）：引用权威来源、用户口碑
- Trustworthiness（可信）：客观描述优缺点，不夸大

## 禁止事项
- 禁止对话式开头（如"大家好"、"今天我们来"等）
- 禁止过度营销用语
- 禁止虚假夸大宣传${contextContent}${imageContext}${platformStyle}

请直接输出文章内容，不要输出思考过程。`

  return geoPrompt
}

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
  
  isGenerating.value = true
  progressPercent.value = 10
  progressText.value = '正在构建 Prompt...'
  
  try {
    // Step 4: 构建 GEO 增强后的 prompt
    progressPercent.value = 20
    progressText.value = '正在调用 DeepSeek API...'
    
    const geoPrompt = buildGeoPrompt()
    
    // Step 1: 调用 DeepSeek API
    const rawContent = await callDeepSeekAPI(geoPrompt)
    
    progressPercent.value = 80
    progressText.value = '正在解析生成结果...'
    
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
