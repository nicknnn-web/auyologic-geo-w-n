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
      <!-- ========== 快速场景快捷入口 ========== -->
      <div class="mb-6">
        <div class="text-sm text-gray-500 mb-3">快速开始（点击自动填充配置）</div>
        <div class="flex flex-wrap gap-3">
          <div
            v-for="scene in quickScenes"
            :key="scene.id"
            class="scene-card"
            :class="{ 'scene-card-active': activeScene === scene.id }"
            @click="applyScene(scene)"
          >
            <div class="font-medium text-sm">{{ scene.name }}</div>
            <div class="text-xs text-gray-400">{{ scene.desc }}</div>
          </div>
        </div>
      </div>

      <!-- 基础配置：默认展开 -->
      <div class="bg-gray-50 rounded-lg p-4 mb-4">
        <div class="text-sm font-medium text-gray-600 mb-3">基础配置</div>

        <el-form-item label="选择关键词">
          <el-select
            v-model="form.keywords"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="可选多个品牌/产品关键词"
            style="width: 220px;"
            @change="onKeywordChange"
          >
            <el-option v-for="kw in keywords" :key="kw.id" :label="kw.keyword" :value="kw.keyword" />
          </el-select>
          <span class="ml-2 text-sm text-gray-500">已选 {{ form.keywords?.length || 0 }} 个</span>
        </el-form-item>

        <el-form-item label="内容类型">
          <el-select v-model="form.command" placeholder="请选择内容类型" style="width: 300px;" @change="onCommandChange">
            <el-option v-for="cmd in commands" :key="cmd.id" :label="cmd.name" :value="cmd.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="目标受众">
          <el-select v-model="form.audience" placeholder="请选择目标受众" style="width: 300px;" clearable>
            <el-option
              v-for="opt in audienceSelectOpts"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="投放平台">
          <el-checkbox-group v-model="form.platforms" style="width: 500px;">
            <el-checkbox v-for="opt in platformSelectOpts" :key="opt.value" :label="opt.value">
              {{ opt.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </div>

      <!-- 高级配置：默认展开 -->
      <el-collapse class="mb-4" :model-value="['advanced']">
        <el-collapse-item title="高级配置（可选）" name="advanced">
          <el-form-item label="关联文档">
            <el-select
              v-model="form.selectedDocs"
              multiple
              placeholder="选择知识库文档(可多选)"
              style="width: 400px;"
              collapse-tags
              collapse-tags-tooltip
            >
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
            <el-input v-model="form.extra" type="textarea" :rows="3" placeholder="额外要求，如：重点突出性价比、语气要轻松活泼" style="width: 500px;" />
          </el-form-item>
        </el-collapse-item>
      </el-collapse>

      <!-- Step 5: UI/UX 打磨 - 进度条 -->
      <el-form-item v-if="isGenerating">
        <div style="width: 500px;">
          <el-progress :percentage="progressPercent" :status="progressStatus" :stroke-width="12" />
          <div class="text-sm text-gray-500 mt-1">{{ progressText }}</div>
        </div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="handleGenerate" :loading="isGenerating" size="large">
          {{ isGenerating ? '生成中...' : '开始生成' }}
        </el-button>
        <el-button @click="togglePromptPreview" :disabled="!selectedKeywordPhrase || !form.command" size="default">
          {{ showPromptPreview ? '隐藏预览' : '预览 prompt' }}
        </el-button>
      </el-form-item>

      <!-- 预览 prompt 面板 -->
      <el-form-item v-if="showPromptPreview">
        <div class="bg-gray-100 p-4 rounded-lg" style="width: 700px; max-height: 300px; overflow-y: auto;">
          <div class="text-sm font-bold mb-2 text-gray-600">实际发送给 AI 的完整 prompt（可自由编辑）：</div>
          <textarea
            v-model="previewPrompt"
            class="text-xs whitespace-pre-wrap text-gray-700 bg-transparent border-0 resize-none w-full outline-none"
            style="min-height: 200px; font-family: inherit;"
            placeholder="prompt 预览区"
          ></textarea>
        </div>
      </el-form-item>
    </el-form>

    <!-- ========== 生成结果区（原地编辑，不跳转）========== -->
    <div v-if="generatedContent" class="border border-purple-200 rounded-lg p-4 mb-4 bg-gradient-to-br from-purple-50 to-white">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-700">
            生成完成
          </span>
          <span class="text-sm text-gray-500">可在此处直接编辑</span>
        </div>

        <!-- 分段优化按钮 -->
        <div class="flex gap-2">
          <el-button size="small" type="info" plain @click="regenerateSection('开头')">重写开头</el-button>
          <el-button size="small" type="info" plain @click="regenerateSection('结尾')">重写结尾</el-button>
          <el-button size="small" type="info" plain @click="switchStyle">切换风格</el-button>
          <el-button size="small" type="info" plain @click="adjustLength('精简')">精简版</el-button>
          <el-button size="small" type="info" plain @click="adjustLength('扩展')">扩展版</el-button>
        </div>
      </div>

      <div class="flex gap-2 mb-3">
        <el-button size="small" @click="copyContent" type="primary" plain>
          <el-icon class="mr-1"><CopyDocument /></el-icon>复制
        </el-button>
        <el-button size="small" @click="openSaveDraftDialog('save')" type="success" plain>
          <el-icon class="mr-1"><Folder /></el-icon>保存草稿
        </el-button>
      </div>

      <!-- Step 5: 质量预估标签 -->
      <div class="flex gap-2 mb-3">
        <el-tag type="success" effect="plain" size="small">原创度: {{ qualityScores.originality }}%</el-tag>
        <el-tag type="warning" effect="plain" size="small">GEO评分: {{ qualityScores.geoScore }}</el-tag>
        <el-tag type="info" effect="plain" size="small">E-E-A-T: {{ qualityScores.eeat }}</el-tag>
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

      <!-- 选中文字重写提示 -->
      <div v-if="selectedText" class="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded flex items-center justify-between">
        <span class="text-sm text-yellow-700">已选中 {{ selectedText.length }} 字</span>
        <el-button size="small" type="warning" @click="regenerateSelection">AI重写选中文字</el-button>
      </div>

      <textarea
        v-model="generatedContent"
        ref="contentTextarea"
        class="text-gray-700 w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400"
        style="min-height: 300px; font-family: inherit; white-space: pre-wrap; resize: vertical;"
        placeholder="在这里直接编辑生成的内容..."
        @mouseup="checkSelection"
      ></textarea>
    </div>

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

    <el-empty v-else-if="!isGenerating" description="选择关键词和内容类型，点击开始生成" />

    <el-dialog
      v-model="saveDraftDialogVisible"
      title="保存到草稿箱"
      width="440px"
      destroy-on-close
      @open="onSaveDraftDialogOpen"
    >
      <p class="text-sm text-gray-500 mb-3">选择现有文件夹，或新建文件夹后保存</p>
      <div class="save-draft-new-folder flex gap-2 mb-4">
        <el-input
          v-model="newFolderName"
          clearable
          placeholder="输入新文件夹名称"
          maxlength="50"
          @keyup.enter="createFolderAndSelect"
        />
        <el-button plain :loading="newFolderCreating" @click="createFolderAndSelect">新建</el-button>
        <el-button
          type="primary"
          :loading="newFolderCreating || saveDraftSubmitting"
          @click="createFolderAndSave"
        >
          新建并保存
        </el-button>
      </div>
      <el-tree
        v-loading="saveDraftFolderLoading"
        class="save-draft-folder-tree"
        :data="saveDraftFolderTree"
        node-key="id"
        :props="{ label: 'label', children: 'children' }"
        highlight-current
        :expand-on-click-node="false"
        default-expand-all
        :current-node-key="saveDraftSelectedFolderId"
        @node-click="onSaveDraftFolderClick"
      >
        <template #default="{ node, data }">
          <span
            class="save-draft-folder-label"
            :class="{ 'is-disabled': data.id === '__all__' }"
          >
            {{ node.label }}
            <span v-if="data.id === '__all__'" class="text-xs text-gray-400 ml-1">（不可选）</span>
          </span>
        </template>
      </el-tree>
      <template #footer>
        <el-button @click="saveDraftDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saveDraftSubmitting" @click="confirmSaveDraft">
          保存到此文件夹
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

import { knowledgeAPI, historyAPI, draftFolderAPI } from '../utils/api'
import { fetchAllPages } from '../utils/pagedApi.js'
import { fetchDictList } from '../utils/sysDict.js'
import { toDataValueSelectOptions, resolveToDataValue } from '../utils/dictFieldMap.js'
import { Folder, FolderAdd, CopyDocument, Refresh, Clock, DocumentCopy } from '@element-plus/icons-vue'
import { formatZhCnDateTime, nowZhCnDateTime } from '../utils/dateTime.js'

// ========== API 配置 ==========
const API_BASE_URL = window.VITE_API_URL || window.location.origin
const AI_PROXY_URL = `${API_BASE_URL}/api/ai/generate`

const router = useRouter()
const route = useRoute()

const isRealFolderId = (id) => {
  const n = Number(id)
  return Number.isFinite(n) && n > 0
}

const resolveSaveFolderId = () => {
  const saved = form.value.saveFolderId
  if (saved != null && Number(saved) > 0) return Number(saved)
  const q = route.query.folderId
  const n = Number(q)
  return Number.isFinite(n) && n > 0 ? n : null
}

const saveDraftDialogVisible = ref(false)
const saveDraftFolderLoading = ref(false)
const saveDraftFolderTree = ref([])
const saveDraftSelectedFolderId = ref('__uncategorized__')
const saveDraftSubmitting = ref(false)
const newFolderName = ref('')
const newFolderCreating = ref(false)
/** 'save' 更新或新建；'asNew' 强制另存为新草稿 */
const saveDraftMode = ref('save')

const folderIdFromSelection = (selectedId) => {
  const id = selectedId ?? saveDraftSelectedFolderId.value
  if (id === '__uncategorized__' || id == null || id === '') return null
  if (isRealFolderId(id)) return Number(id)
  return null
}

const loadSaveDraftFolderTree = async () => {
  saveDraftFolderLoading.value = true
  try {
    const res = await draftFolderAPI.tree()
    saveDraftFolderTree.value = Array.isArray(res?.tree) ? res.tree : []
  } catch (e) {
    console.warn('加载草稿文件夹失败', e)
    saveDraftFolderTree.value = [
      { id: '__all__', label: '全部草稿', children: [] },
      { id: '__uncategorized__', label: '未分类', children: [] },
    ]
  } finally {
    saveDraftFolderLoading.value = false
  }
}

const onSaveDraftDialogOpen = async () => {
  await loadSaveDraftFolderTree()
  const existing = resolveSaveFolderId()
  saveDraftSelectedFolderId.value = existing ? String(existing) : '__uncategorized__'
}

const onSaveDraftFolderClick = (data) => {
  if (!data?.id || data.id === '__all__') {
    ElMessage.info('请选择具体文件夹或「未分类」')
    return
  }
  saveDraftSelectedFolderId.value = data.id
}

const createDraftFolder = async (name) => {
  let parentId = null
  if (isRealFolderId(saveDraftSelectedFolderId.value)) {
    parentId = Number(saveDraftSelectedFolderId.value)
  }
  const res = await draftFolderAPI.create({ name, parentId })
  const newId = res?.folder?.id
  if (!newId) throw new Error('创建文件夹失败')
  await loadSaveDraftFolderTree()
  saveDraftSelectedFolderId.value = String(newId)
  form.value.saveFolderId = Number(newId)
  newFolderName.value = ''
  return Number(newId)
}

const createFolderAndSelect = async () => {
  const name = newFolderName.value.trim()
  if (!name) {
    ElMessage.warning('请输入文件夹名称')
    return
  }
  newFolderCreating.value = true
  try {
    await createDraftFolder(name)
    ElMessage.success(`已创建文件夹「${name}」，可点击「保存到此文件夹」完成保存`)
  } catch (e) {
    ElMessage.error(e?.message || '新建文件夹失败')
  } finally {
    newFolderCreating.value = false
  }
}

const createFolderAndSave = async () => {
  const name = newFolderName.value.trim()
  if (!name) {
    ElMessage.warning('请输入文件夹名称')
    return
  }
  newFolderCreating.value = true
  saveDraftSubmitting.value = true
  try {
    const folderId = await createDraftFolder(name)
    const result = await performSaveDraft(folderId)
    if (saveDraftMode.value === 'asNew') form.value.editId = null
    const msg =
      result === 'updated'
        ? `草稿已更新并保存到新文件夹「${name}」`
        : `已保存到新文件夹「${name}」`
    ElMessage.success(msg)
    saveDraftDialogVisible.value = false
  } catch (e) {
    ElMessage.error(e?.message || '新建并保存失败')
  } finally {
    newFolderCreating.value = false
    saveDraftSubmitting.value = false
  }
}

const findFolderLabelInTree = (nodes, targetId) => {
  for (const n of nodes || []) {
    if (String(n.id) === String(targetId)) return n.label
    const child = findFolderLabelInTree(n.children, targetId)
    if (child) return child
  }
  return null
}

const openSaveDraftDialog = (mode = 'save') => {
  if (!generatedContent.value?.trim()) {
    ElMessage.warning('请先生成内容再保存草稿')
    return
  }
  saveDraftMode.value = mode
  saveDraftDialogVisible.value = true
}
const form = ref({
  keywords: [],
  audience: '',
  platforms: [],
  command: '',
  extra: '',
  editId: null,
  saveFolderId: null,
  selectedDocs: [],    // Step 2: 选中的知识库文档
  selectedImages: []   // Step 3: 选中的配图
})
/** 多选关键词拼成一句（用于 prompt、历史、草稿 brand 字段） */
const selectedKeywordPhrase = computed(() => uniqueKeywordStrings(form.value.keywords).join('、'))

/** 已选关键词去重（保持顺序） */
function uniqueKeywordStrings(list) {
  const seen = new Set()
  const out = []
  for (const item of list || []) {
    const k = String(item).trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

/** 下拉选项按 keyword 文本去重，避免同文案多 id 导致多选框重复选中 */
function dedupeKeywordOptions(rows) {
  const seen = new Set()
  return (rows || []).filter((kw) => {
    const text = String(kw?.keyword ?? '').trim()
    if (!text || seen.has(text)) return false
    seen.add(text)
    return true
  })
}

function parseKeywordsFromStored(raw) {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) {
    return uniqueKeywordStrings(raw.map((k) => String(k).trim()).filter(Boolean))
  }
  const s = String(raw).trim()
  if (!s) return []
  if (s.includes('、')) return uniqueKeywordStrings(s.split('、').map((x) => x.trim()))
  if (s.includes(',')) return uniqueKeywordStrings(s.split(',').map((x) => x.trim()))
  return [s]
}
const generatedContent = ref('')
const generatedTitle = ref('')
const isGenerating = ref(false)
const keywords = ref([])
const commands = ref([])
const selectedText = ref('')
const contentTextarea = ref(null)
const activeScene = ref(null)

const audienceDictRows = ref([])
const platformDictRows = ref([])

const audienceSelectOpts = computed(() => toDataValueSelectOptions(audienceDictRows.value))
const platformSelectOpts = computed(() => toDataValueSelectOptions(platformDictRows.value))

const loadContentDicts = async () => {
  const [a, p] = await Promise.all([
    fetchDictList('content_target_audience'),
    fetchDictList('publish_platform'),
  ])
  audienceDictRows.value = a
  platformDictRows.value = p
}

// ========== 快速场景快捷入口（平台选项来自字典，仅控制勾选数量，不写死具体平台名）==========
const quickScenes = [
  {
    id: 'xhs',
    name: '小红书种草',
    desc: '短平快，真实感',
    platformPickCount: 1,
    commandHint: '选择种草型模板',
  },
  {
    id: 'wxgzh',
    name: '公众号推文',
    desc: '深度内容，干货足',
    platformPickCount: 1,
    commandHint: '选择深度分析型模板',
  },
  {
    id: 'zh',
    name: '知乎问答',
    desc: '专业有料，有观点',
    platformPickCount: 1,
    commandHint: '选择知识科普型模板',
  },
  {
    id: 'pc',
    name: '产品评测',
    desc: '客观全面，数据驱动',
    platformPickCount: 2,
    commandHint: '选择评测对比型模板',
  },
  {
    id: 'gg',
    name: '品牌软文',
    desc: '润物无声，情怀足',
    platformPickCount: 2,
    commandHint: '选择品牌故事型模板',
  },
]

// 应用快速场景配置
const applyScene = (scene) => {
  activeScene.value = scene.id
  const keys = platformSelectOpts.value.map((o) => o.value).filter(Boolean)
  const n = Number(scene.platformPickCount) || 0
  form.value.platforms = n > 0 && keys.length ? keys.slice(0, Math.min(n, keys.length)) : []
  const suffix = form.value.platforms.length
    ? `已勾选前 ${form.value.platforms.length} 个投放平台（按字典排序）`
    : '未配置投放平台字典，未自动勾选'
  ElMessage.success(`已应用「${scene.name}」：${suffix}`)
}

// 关键词变化时去重并清除场景选中状态
const onKeywordChange = () => {
  activeScene.value = null
  const deduped = uniqueKeywordStrings(form.value.keywords)
  if (deduped.length !== (form.value.keywords?.length ?? 0)) {
    form.value.keywords = deduped
  }
}

// 内容类型变化时清除场景选中状态
const onCommandChange = () => {
  activeScene.value = null
}

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

// 加载历史记录（优先从后端 API，回退到 localStorage）
const loadHistory = async () => {
  // 优先从后端 API 加载
  try {
    const { list } = await historyAPI.list()
    if (Array.isArray(list) && list.length > 0) {
      generateHistory.value = list.map(item => ({
        id: item.id || item.localId || Date.now(),
        title: item.title || '',
        content: item.content || '',
        keyword: item.keyword || '',
        audience: item.audience || '',
        platforms: item.platforms || [],
        commandId: item.commandId || item.command_id || '',
        createdAt: item.createdAt ? formatZhCnDateTime(item.createdAt) : nowZhCnDateTime()
      }))
      // 同步到 localStorage 作为备份
      saveHistory()
      return
    }
  } catch (e) {
    console.warn('从后端加载历史记录失败，尝试从 localStorage 加载:', e)
  }

  // 回退到 localStorage
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

// 添加新记录到历史列表（同步到后端）
const addToHistory = async (title, content, keyword, audience, platforms, commandId) => {
  const newRecord = {
    id: Date.now(), // 用时间戳作为唯一ID
    title: title || '',
    content: content,
    keyword: keyword,
    audience: audience,
    platforms: platforms ? [...platforms] : [],
    commandId: commandId,
    createdAt: nowZhCnDateTime()
  }

  // 添加到列表顶部
  generateHistory.value.unshift(newRecord)

  // 超出数量限制时删除最早的记录
  if (generateHistory.value.length > MAX_HISTORY_COUNT) {
    generateHistory.value = generateHistory.value.slice(0, MAX_HISTORY_COUNT)
  }

  // 同步到后端 API
  try {
    await historyAPI.create({
      localId: newRecord.id,
      title: newRecord.title,
      content: newRecord.content,
      keyword: newRecord.keyword,
      audience: newRecord.audience,
      platforms: newRecord.platforms,
      commandId: newRecord.commandId
    })
  } catch (e) {
    console.warn('同步历史记录到后端失败:', e)
  }

  saveHistory()
}

// 删除历史记录（同步到后端）
const deleteHistory = async (id) => {
  // 同步删除后端数据
  try {
    await historyAPI.delete(id)
  } catch (e) {
    console.warn('从后端删除历史记录失败:', e)
  }

  generateHistory.value = generateHistory.value.filter(item => item.id !== id)
  saveHistory()
  ElMessage.success('已删除该历史记录')
}

// 加载历史记录到编辑区
const loadHistoryRecord = (record) => {
  // 恢复表单数据
  form.value.keywords = parseKeywordsFromStored(record.keyword)
  form.value.audience = resolveToDataValue(audienceDictRows.value, record.audience) || ''
  form.value.platforms = (record.platforms || [])
    .map((p) => resolveToDataValue(platformDictRows.value, p) || p)
    .filter(Boolean)
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
  const userId = 'default_user'

  await loadContentDicts()

  // 从后端 API 加载关键词（分页接口，多页合并）
  try {
    const rawKeywords = await fetchAllPages(
      (p, ps) => `${API_BASE_URL}/api/keywords?page=${p}&pageSize=${ps}`,
      { pageSize: 100, fetchOptions: { headers: { 'x-user-id': userId } } }
    )
    keywords.value = dedupeKeywordOptions(rawKeywords)
  } catch {
    keywords.value = []
    ElMessage.warning('关键词加载失败，请检查网络')
  }

  // 从后端 API 加载指令模板
  try {
    const tplList = await fetchAllPages(
      (p, ps) => `${API_BASE_URL}/api/instruction-templates?page=${p}&pageSize=${ps}`,
      { pageSize: 100, fetchOptions: { headers: { 'x-user-id': userId } } }
    )
    commands.value = migrateCommands(tplList)
  } catch {
    commands.value = []
    ElMessage.warning('指令模板加载失败，请检查网络')
  }

  // Step 2: 加载知识库文档
  await loadKnowledgeDocs()

  // Step 3: 加载图库
  loadImages()

  // 加载生成历史
  await loadHistory()

  const qFolder = route.query.folderId
  const qn = Number(qFolder)
  if (Number.isFinite(qn) && qn > 0) {
    form.value.saveFolderId = qn
  }

  // 检查是否有草稿要编辑
  const savedDraft = sessionStorage.getItem('editDraft')
  if (savedDraft) {
    try {
      const draft = JSON.parse(savedDraft)
      form.value.keywords = parseKeywordsFromStored(draft.brand)
      form.value.command = draft.commandId || ''
      form.value.audience = resolveToDataValue(audienceDictRows.value, draft.audience) || ''
      form.value.platforms = (draft.platforms || [])
        .map((p) => resolveToDataValue(platformDictRows.value, p) || p)
        .filter(Boolean)
      form.value.extra = draft.extra || ''
      generatedContent.value = draft.content || ''
      generatedTitle.value = draft.title || ''
      form.value.editId = draft.id
      const fid = draft.folderId ?? draft.folder_id
      form.value.saveFolderId =
        fid != null && Number(fid) > 0 ? Number(fid) : null
      // 恢复选中的文档和图片
      form.value.selectedDocs = draft.selectedDocs || []
      form.value.selectedImages = draft.selectedImages || []
      sessionStorage.removeItem('editDraft')
    } catch (e) {
      console.error('加载草稿失败', e)
    }
  }
})

// Step 2: 加载知识库文档 (从后端 API 读取，回退到 localStorage)
// 保留完整的分析结果数据：keywords、summary、keyPoints、analyzedAt
const loadKnowledgeDocs = async () => {
  // 优先从后端 API 加载
  try {
    const { list } = await knowledgeAPI.list()
    if (Array.isArray(list) && list.length > 0) {
      knowledgeDocs.value = list.map((doc, index) => ({
        docId: doc.id || doc.docId || `doc${index + 1}`,
        docName: doc.name || doc.filename || '未命名文档',
        docContent: doc.content || '',
        keywords: doc.keywords || [],
        summary: doc.summary || '',
        keyPoints: doc.keyPoints || [],
        analyzedAt: doc.analyzedAt || null
      }))
      return
    }
  } catch (e) {
    console.warn('从后端加载知识库失败，尝试从 localStorage 加载:', e)
  }

  // 回退到 localStorage
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
    knowledgeDocs.value = testDocs
  } else {
    const parsedDocs = JSON.parse(docs)
    // 转换 Knowledge.vue 存储的数据结构为 ContentCreate.vue 需要的格式
    // 保留完整的分析结果数据（keywords、summary、keyPoints、analyzedAt）
    knowledgeDocs.value = parsedDocs.map((doc, index) => ({
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
}

/**
 * 根据用户选择的关键词，构建精准的内容素材 prompt
 * 流程：用户选关键词 → 匹配知识库文档 keywords → 拿 summary + keyPoints
 */
const buildContentPrompt = () => {
  const userKws = (form.value.keywords || []).map((k) => String(k).trim()).filter(Boolean)
  const selectedDocIds = form.value.selectedDocs || []

  if (!userKws.length) return ''

  // 1. 找出所有已分析且有关键词匹配的文档（任一已选关键词命中文档关键词即算匹配）
  const matchedDocs = knowledgeDocs.value.filter((doc) => {
    if (!doc.analyzedAt) return false
    if (selectedDocIds.length > 0 && !selectedDocIds.includes(doc.docId)) return false
    const docKeywords = doc.keywords || []
    return docKeywords.some((kw) =>
      userKws.some(
        (uk) =>
          uk.toLowerCase().includes(String(kw).toLowerCase()) ||
          String(kw).toLowerCase().includes(uk.toLowerCase())
      )
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
    const prompt = cmd.prompt || cmd.content || ''

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
        newPrompt = getDefaultTypePrompt()
      }

      return { ...cmd, prompt: newPrompt }
    }

    return cmd
  })

  return migratedCmds
}

// 迁移后兜底描述（不绑定具体字典项文案）
const getDefaultTypePrompt = () =>
  '结构清晰、重点突出，并符合当前所选指令模板的写作要求'
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
  const phrase = selectedKeywordPhrase.value
  const audienceLabel = form.value.audience || '目标用户'
  const platformLabelsForPrompt = (form.value.platforms || []).filter(Boolean)
  const extra = form.value.extra || ''
  const templateName = cmd?.name || '软文'  // 模板名称 = 类型标签

  if (!phrase) {
    return '请先选择关键词'
  }

  const kws = (form.value.keywords || []).map((k) => String(k).trim()).filter(Boolean)
  const coreDriver =
    kws.length <= 1
      ? `请为【${phrase}】写一篇【${templateName}】`
      : `请围绕以下关键词/主题撰写一篇【${templateName}】：${phrase}。\n要求：自然融合多个主题，避免生硬堆砌；可适当分节或分场景展开。`

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
  const audienceConstraint = `\n\n## 👥 目标受众\n${audienceLabel}`

  // ===== 5. 投放平台（展示名来自字典，不写死平台枚举）=====
  let platformStyle = ''
  if (platformLabelsForPrompt.length) {
    platformStyle = `\n\n## 发布平台\n请兼顾以下平台的表达习惯与篇幅节奏：${platformLabelsForPrompt.join('、')}\n`
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

  // ===== 9. 创意约束：让每篇文章都不一样 =====
  const creativityConstraint = `
## 🎯 创意要求（关键！）
- 这篇文章的切入点必须与市面上同类文章不同
- 禁止使用"测评"、"横评"、"推荐"、"必看"等套路化标题
- 每个段落都要有不同的句式风格，不要用重复的模板
- 选择一个独特的视角来切入（比如：从业者视角、用户真实故事、行业观察等）

## 📋 结构要求
- 开头方式：自由选择（故事/数据/问题/对比/直接开炸/反常识观点均可，只要吸引人）
- 核心内容：自然选择2-3个模块，不要每次都用同样的结构
- 结尾：自由选择（数据印证/开放式留白/情感升华/自然收尾均可）

## 🚫 反模板约束
- 不要写成"开头-产品介绍-优缺点-总结"的八股文结构
- 不要每次都用"首先、其次、最后"这种机械化连接
- 禁止使用绝对化的表达（如"最值得"、"不容错过"、"必备"等）
- 避免与网上现有文章结构雷同`

  // ===== 10. GEO 技巧增强 =====
  const geoEnhancement = `

## 时间维度
统一使用"2026年当前"的时间视角撰写。

## 写作风格要求
${randomStyle}
要求：
- 去掉机械化的连接词（禁止"首先"、"其次"、"最后"、"综上所述"、"总的来说"）
- 使用自然的段落过渡，避免刻意的序号和编号
- 段落长度要有变化，不要均匀分布
- 可以适当使用口语化表达、缩写、俚语
- 加入真实细节和个人化表达

## E-E-A-T 要素
- Experience（经验）：加入真实使用场景和个人体验
- Expertise（专业）：引用数据和专业术语
- Authoritativeness（权威）：引用权威来源、用户口碑
- Trustworthiness（可信）：客观描述优缺点，不夸大

## 禁止事项（反AI检测）
- 禁止使用：首先、其次、最后、综上所述、总的来说、整体来看等机械化连接词
- 禁止对话式开头（如"大家好"、"今天我们来"等）
- 禁止过度营销用语
- 禁止虚假夸大宣传
- 避免完美的结构对称（不要每个部分都同等篇幅）
- 禁止使用"作为一名..."、"相信大家..."、"毋庸置疑..."等AI常用句式

## 加分技巧（让文章更像人写的）
- 用具体的小故事或细节开头
- 适当加入一点"私货"和个人偏好
- 可以在文中适当使用流行语或网络梗
- 偶尔用一下反问、设问增加互动感`

  // ===== 组合完整 prompt =====
  const geoPrompt = `${coreDriver}${templateStyle}${contextContent}${audienceConstraint}${extraConstraint}${imageContext}${platformStyle}${creativityConstraint}${geoEnhancement}

请直接输出文章内容，不要输出思考过程。`

  return geoPrompt
}
// ========== buildGeoPrompt 改造结束 ==========

// Step 1: AI 代理调用
const callDeepSeekAPI = async (prompt) => {
  try {
    const response = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        prompt,
        temperature: 0.7,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error?.message || `API请求失败: ${response.status}`)
    }

    const data = await response.json()
    return data.content || ''
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
  if (!title && selectedKeywordPhrase.value) {
    const k = selectedKeywordPhrase.value
    const titleOptions = [
      `深度测评：${k}到底值不值得买？`,
      `${form.value.audience || '目标用户'}必看：${k}使用体验分享`,
      `关于${k}，你需要知道的那些事`
    ]
    title = titleOptions[Math.floor(Math.random() * titleOptions.length)]
  }

  return { title, content }
}

// Step 1: 主要生成函数
const handleGenerate = async () => {
  if (!selectedKeywordPhrase.value || !form.value.command) {
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
      selectedKeywordPhrase.value,
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

// 检测文本选中
const checkSelection = () => {
  const selection = window.getSelection()
  const text = selection.toString()
  if (text && text.length > 5) {
    selectedText.value = text
  } else {
    selectedText.value = ''
  }
}

// AI 重写选中文字
const regenerateSelection = async () => {
  if (!selectedText.value) return

  isGenerating.value = true
  progressText.value = '正在重写选中文字...'

  try {
    // 提取选中文字在全文中的位置，获取上下文
    const content = generatedContent.value
    const selectStart = content.indexOf(selectedText.value)
    const selectEnd = selectStart + selectedText.value.length

    const before = content.slice(Math.max(0, selectStart - 100), selectStart)
    const after = content.slice(selectEnd, Math.min(content.length, selectEnd + 100))

    const prompt = `参考前文："${before}"
需要重写的段落："${selectedText.value}"
参考后文："${after}"

要求：保持前后文风格一致，重写这段文字使更吸引人。只输出重写后的内容，不要其他解释。`

    const result = await callDeepSeekAPI(prompt)

    // 替换选中的文字
    const newContent = content.slice(0, selectStart) + result.trim() + content.slice(selectEnd)
    generatedContent.value = newContent
    selectedText.value = ''

    ElMessage.success('重写完成')
  } catch (e) {
    ElMessage.error('重写失败：' + e.message)
  } finally {
    isGenerating.value = false
    progressText.value = '正在准备生成...'
  }
}

// 重写开头/结尾
const regenerateSection = async (section) => {
  if (!generatedContent.value) return

  isGenerating.value = true
  progressText.value = `正在重写${section}...`

  try {
    const content = generatedContent.value
    let prompt = ''

    if (section === '开头') {
      const firstPara = content.split('\n')[0]
      prompt = `请重写以下文案的开头部分，要求：\n1. 更加吸睛、有吸引力\n2. 与原文案风格一致\n3. 50字以内\n\n当前文案：\n${content}\n\n请只输出重写后的开头，不要输出其他内容。`
    } else if (section === '结尾') {
      prompt = `请重写以下文案的结尾部分，要求：\n1. 有行动号召或互动引导\n2. 与原文案风格一致\n3. 30字以内\n\n当前文案：\n${content}\n\n请只输出重写后的结尾，不要输出其他内容。`
    }

    const result = await callDeepSeekAPI(prompt)

    if (section === '开头') {
      const lines = content.split('\n')
      lines[0] = result.trim()
      generatedContent.value = lines.join('\n')
    } else {
      generatedContent.value = content.trim() + '\n\n' + result.trim()
    }

    ElMessage.success(`${section}重写完成`)
  } catch (e) {
    ElMessage.error('重写失败：' + e.message)
  } finally {
    isGenerating.value = false
    progressText.value = '正在准备生成...'
  }
}

// 切换风格
const switchStyle = async () => {
  if (!generatedContent.value) return

  isGenerating.value = true
  progressText.value = '正在切换风格...'

  try {
    const styles = [
      { name: '小红书种草', style: '口语化、真实感、emoji点缀、行动号召' },
      { name: '公众号深度', style: '专业冷静、数据说话、结构清晰、有深度' },
      { name: '知乎风格', style: '问题导向、干货充足、引用权威、逻辑性强' },
      { name: '品牌故事', style: '情感丰富、画面感强、情怀满满' }
    ]
    const target = styles[Math.floor(Math.random() * styles.length)]

    const prompt = `请将以下文案改写为【${target.name}】风格，要求：\n风格：${target.style}\n\n原文案：\n${generatedContent.value}\n\n请直接输出改写后的文案。`

    const result = await callDeepSeekAPI(prompt)
    generatedContent.value = result.trim()
    ElMessage.success(`已切换为${target.name}风格`)
  } catch (e) {
    ElMessage.error('切换风格失败：' + e.message)
  } finally {
    isGenerating.value = false
    progressText.value = '正在准备生成...'
  }
}

// 精简/扩展
const adjustLength = async (type) => {
  if (!generatedContent.value) return

  isGenerating.value = true
  progressText.value = `正在生成${type}版本...`

  try {
    let prompt = ''
    if (type === '精简') {
      prompt = `请将以下文案精简为简洁版本，要求：\n1. 保留核心信息\n2. 删除冗余表达\n3. 控制在100字以内\n\n原文案：\n${generatedContent.value}`
    } else {
      prompt = `请将以下文案扩展为更详细版本，要求：\n1. 增加更多细节和案例\n2. 丰富内容但不要啰嗦\n3. 控制在300字以内\n\n原文案：\n${generatedContent.value}`
    }

    const result = await callDeepSeekAPI(prompt)
    generatedContent.value = result.trim()
    ElMessage.success(`${type}版生成完成`)
  } catch (e) {
    ElMessage.error('调整长度失败：' + e.message)
  } finally {
    isGenerating.value = false
    progressText.value = '正在准备生成...'
  }
}

const performSaveDraft = async (folderId) => {
  const draftData = {
    title: generatedTitle.value || selectedKeywordPhrase.value + ' 软文',
    brand: selectedKeywordPhrase.value,
    content: generatedContent.value,
    audience: form.value.audience,
    platforms: form.value.platforms,
    commandId: form.value.command,
    extra: form.value.extra,
    selectedDocs: form.value.selectedDocs,
    selectedImages: form.value.selectedImages,
    status: '草稿',
    ...(folderId != null ? { folderId } : {}),
  }

  const userId = 'default_user'
  const headers = {
    'Content-Type': 'application/json',
    'x-user-id': userId,
  }

  const isUpdate =
    saveDraftMode.value === 'save' && form.value.editId != null && Number(form.value.editId) > 0

  if (isUpdate) {
    const editId = Number(form.value.editId)
    const res = await fetch(`${API_BASE_URL}/api/drafts/${editId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(draftData),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || '草稿更新失败')
    }
    return 'updated'
  }

  const res = await fetch(`${API_BASE_URL}/api/drafts`, {
    method: 'POST',
    headers,
    body: JSON.stringify(draftData),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || '保存失败')
  }
  const created = await res.json().catch(() => null)
  if (created?.id) form.value.editId = created.id
  return 'created'
}

const confirmSaveDraft = async () => {
  if (saveDraftSelectedFolderId.value === '__all__') {
    ElMessage.warning('请选择具体文件夹或「未分类」')
    return
  }
  const folderId = folderIdFromSelection()
  form.value.saveFolderId = folderId

  saveDraftSubmitting.value = true
  try {
    const result = await performSaveDraft(folderId)
    if (saveDraftMode.value === 'asNew') {
      form.value.editId = null
    }
    const folderLabel =
      saveDraftSelectedFolderId.value === '__uncategorized__'
        ? '未分类'
        : findFolderLabelInTree(saveDraftFolderTree.value, saveDraftSelectedFolderId.value) ||
          '所选文件夹'
    if (result === 'updated') {
      ElMessage.success(`草稿已更新并保存到「${folderLabel}」`)
    } else {
      ElMessage.success(`已保存到草稿箱「${folderLabel}」`)
    }
    saveDraftDialogVisible.value = false
  } catch (e) {
    ElMessage.error(e?.message || '保存失败，请重试')
  } finally {
    saveDraftSubmitting.value = false
  }
}

const handleSaveDraft = () => openSaveDraftDialog('save')

const handleSaveAsNew = () => openSaveDraftDialog('asNew')
</script>

<style scoped>
/* 快速场景卡片样式 */
.scene-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 20px;
  min-width: 100px;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.scene-card:hover {
  border-color: #8b5cf6;
  background: #f5f3ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
}

.scene-card-active {
  border-color: #8b5cf6;
  background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
}

.save-draft-folder-tree {
  max-height: 280px;
  overflow: auto;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 6px 4px;
  background: #fafbfc;
}
.save-draft-folder-tree :deep(.el-tree-node__content) {
  height: 32px;
}
.save-draft-folder-label.is-disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}
</style>
