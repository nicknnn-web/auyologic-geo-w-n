<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex items-center mb-5">
      <div>
        <div class="text-lg font-bold">投放任务</div>
        <div class="text-sm text-gray-500">执行发布由本机代理完成，请保持与账号授权相同的本地代理运行</div>
      </div>
      <div class="ml-auto flex items-center gap-3">
        <div class="flex items-center gap-1.5 text-sm">
          <span class="inline-block w-2 h-2 rounded-full" :class="agentOnline ? 'bg-green-500' : 'bg-gray-300'" />
          <span :class="agentOnline ? 'text-green-600' : 'text-gray-400'">
            {{ agentOnline ? '本地代理在线' : '本地代理离线' }}
          </span>
        </div>
        <el-button type="primary" @click="openCreateDialog">
          <el-icon class="mr-1"><Plus /></el-icon>
          新建任务
        </el-button>
      </div>
    </div>

    <!-- 代理离线提示横幅 -->
    <div v-if="!agentOnline" class="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <el-icon class="text-amber-500 flex-shrink-0" size="18"><Warning /></el-icon>
      <div class="flex-1 text-sm text-amber-700">
        <span class="font-medium">本地代理未运行</span>
        — 账号授权与投放发布均需在您的电脑上运行本地代理。下载后解压：Windows 双击
        <code class="bg-amber-100 px-1 rounded text-xs">start-agent.bat</code>；Mac 双击
        <code class="bg-amber-100 px-1 rounded text-xs">start-agent.command</code>；Linux 执行
        <code class="bg-amber-100 px-1 rounded text-xs">start-agent.sh</code>。
      </div>
      <el-button size="small" type="warning" plain @click="handleDownloadAgent">
        <el-icon class="mr-1"><Download /></el-icon>
        下载本地代理
      </el-button>
    </div>

    <el-table v-loading="tasksLoading" :data="tasks" style="width: 100%">
      <el-table-column label="序号" width="60" align="center">
        <template #default="{ $index }">{{ (page - 1) * pageSize + $index + 1 }}</template>
      </el-table-column>
      <el-table-column prop="task_name" label="任务名称" min-width="140" />
      <el-table-column prop="draft_title" label="内容标题" min-width="160" />
      <el-table-column label="平台 / 账号" width="160">
        <template #default="{ row }">
          <div>
            <el-tag size="small" :color="getPlatformColor(row.platform)" effect="dark" class="mr-1">
              {{ row.platform }}
            </el-tag>
          </div>
          <div class="text-xs text-gray-400 mt-1">{{ row.account_name || '-' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="getStatusType(resolveTaskStatus(row))" size="small">{{ getStatusLabel(resolveTaskStatus(row)) }}</el-tag>
          <div v-if="resolveTaskStatus(row) === 'running'" class="mt-1">
            <el-progress :percentage="100" :stroke-width="3" :show-text="false" status="striped" striped-flow />
          </div>
        </template>
      </el-table-column>
      <el-table-column label="发布链接" min-width="120">
        <template #default="{ row }">
          <a v-if="row.published_url" :href="row.published_url" target="_blank"
             class="text-blue-500 hover:underline text-sm">查看帖子</a>
          <el-tooltip v-else-if="row.error_message" :content="row.error_message" placement="top">
            <span class="text-red-400 text-sm cursor-pointer">查看错误</span>
          </el-tooltip>
          <span v-else class="text-gray-300 text-sm">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="170">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" align="center">
        <template #default="{ row }">
          <el-button
            v-if="resolveTaskStatus(row) === 'pending' || resolveTaskStatus(row) === 'failed'"
            link type="primary" size="small"
            :loading="executingId === row.id"
            :disabled="!agentOnline"
            @click="handleExecute(row)"
          >
            {{ resolveTaskStatus(row) === 'failed' ? '重试' : '执行' }}
          </el-button>
          <el-button
            v-if="resolveTaskStatus(row) === 'queued_local'"
            link type="warning" size="small"
            @click="openLogAndPoll(row)"
          >
            查看队列
          </el-button>
          <el-button
            v-if="resolveTaskStatus(row) === 'running'"
            link type="info" size="small"
            @click="openLogDialog(row)"
          >
            查看进度
          </el-button>
          <el-button
            v-if="resolveTaskStatus(row) === 'done' || resolveTaskStatus(row) === 'failed'"
            link :type="resolveTaskStatus(row) === 'done' ? 'success' : 'info'" size="small"
            @click="openLogDialog(row)"
          >
            查看日志
          </el-button>
          <el-popconfirm title="确定删除此任务？" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger" size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!tasksLoading && tasks.length === 0" description="暂无投放任务" />

    <AppPaginationBar
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="taskTotal"
      @change="loadTasks"
    />

    <!-- ===== 创建任务弹窗 ===== -->
    <el-dialog v-model="createDialogVisible" title="新建投放任务" width="600px" @close="resetForm">
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="任务名称" prop="task_name">
          <el-input v-model="form.task_name" placeholder="如：新品发布推广" />
        </el-form-item>

        <el-form-item label="选择内容" prop="draft_id">
          <el-select v-model="form.draft_id" placeholder="请选择草稿" style="width: 100%;"
                     @change="handleDraftChange">
            <el-option v-for="d in drafts" :key="d.id" :label="d.title" :value="d.id">
              <div class="flex justify-between">
                <span>{{ d.title }}</span>
                <span class="text-gray-400 text-sm ml-4">{{ d.brand }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="发帖标题" prop="title">
          <el-input
            v-model="form.title"
            :maxlength="formTitleMaxLength"
            show-word-limit
            :placeholder="formTitlePlaceholder"
          />
          <div class="text-xs text-gray-400 mt-1">{{ formTitleHint }}</div>
        </el-form-item>

        <el-form-item label="发布平台" prop="platform">
          <el-select v-model="form.platform" placeholder="请选择平台" style="width: 100%;"
                     @change="handlePlatformChange">
            <el-option v-for="p in availablePlatforms" :key="p.value" :label="p.label" :value="p.value">
              <div class="flex items-center gap-2">
                <span class="inline-block w-2 h-2 rounded-full"
                      :style="{ background: getPlatformColor(p.value) }"></span>
                <span>{{ p.label }}</span>
                <el-tag v-if="p.accountCount === 0" size="small" type="danger" class="ml-auto">无已授权账号</el-tag>
                <span v-else class="text-gray-400 text-xs ml-auto">{{ p.accountCount }} 个账号</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-alert
          v-if="selectedPlatformMeta?.publishHint"
          type="warning"
          :closable="false"
          show-icon
          class="mb-3"
          :title="`${form.platform} 发布须知`"
          :description="selectedPlatformMeta.publishHint"
        />

        <el-form-item label="发布账号" prop="account_id">
          <el-select v-model="form.account_id" placeholder="请先选择平台" style="width: 100%;"
                     :disabled="!form.platform">
            <el-option
              v-for="acc in filteredAccounts"
              :key="acc.id"
              :label="acc.account_name || acc.platform"
              :value="acc.id"
            >
              <div class="flex items-center justify-between">
                <span>{{ acc.account_name || '未命名账号' }}</span>
                <el-tag size="small" type="success" class="ml-4">已授权</el-tag>
              </div>
            </el-option>
            <template v-if="filteredAccounts.length === 0 && form.platform" #empty>
              <div class="text-center py-3 text-gray-400 text-sm">
                该平台暂无已授权账号，
                <el-button link type="primary" @click="goToAccounts">去授权</el-button>
              </div>
            </template>
          </el-select>
        </el-form-item>

        <el-form-item v-if="formTagsVisible" label="话题标签">
          <el-input v-model="form.tags" placeholder="如：好物推荐,生活方式（逗号分隔，最多5个）" />
          <div class="text-xs text-gray-400 mt-1">发布时自动添加为帖子话题，不填则跳过</div>
        </el-form-item>

        <el-form-item v-if="isBaijiahaoPlatform" label="封面图（可选）">
          <el-select
            v-model="form.cover_image_url"
            clearable
            placeholder="不设置封面"
            style="width: 100%;"
            :disabled="coverImageOptions.length === 0"
          >
            <el-option
              v-for="img in coverImageOptions"
              :key="img.url"
              :label="img.name"
              :value="img.url"
            >
              <div class="flex items-center gap-2">
                <img :src="img.url" class="w-10 h-10 object-cover rounded flex-shrink-0" alt="" />
                <span class="truncate">{{ img.name }}</span>
              </div>
            </el-option>
          </el-select>
          <div v-if="coverImageOptions.length === 0" class="text-xs text-amber-600 mt-1">
            企业图库暂无图片，请先在「企业图库」上传或在草稿编辑页添加配图
          </div>
          <div v-else class="text-xs text-gray-400 mt-1 space-y-0.5">
            <div>可选企业图库全部图片；草稿已选配图会一并列出</div>
            <div>将自动上传至百家号；若失败，可在发布打开的浏览器中手动选择封面</div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建任务</el-button>
      </template>
    </el-dialog>

    <!-- ===== 执行进度弹窗 ===== -->
    <el-dialog v-model="logDialogVisible" :title="logDialogTitle" width="580px"
               @close="stopStatusPoll">
      <div class="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400"
           style="min-height: 220px; max-height: 380px; overflow-y: auto;" ref="logBoxRef">
        <div v-if="isPublishInProgress"
             class="text-amber-300 flex items-center gap-2 text-sm mb-3 pb-2 border-b border-gray-700">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>{{ currentStatus === 'queued_local' ? '已加入队列，等待本地代理执行…' : '正在发布中…' }}</span>
          <span v-if="currentPlatform" class="text-gray-500 text-xs">（{{ currentPlatform }}）</span>
        </div>
        <template v-if="currentLog">
          <div v-for="(line, i) in currentLog.split('\n').filter(Boolean)" :key="i" class="mb-1">
            {{ line }}
          </div>
        </template>
        <div v-else-if="!isPublishInProgress" class="text-gray-500">暂无详细日志</div>
        <div v-else class="text-gray-500 text-xs">等待代理开始执行，日志将在此实时更新…</div>
      </div>

      <div v-if="currentStatus === 'done'" class="mt-3 p-3 bg-green-50 rounded-lg flex items-center gap-2">
        <el-icon class="text-green-500"><CircleCheck /></el-icon>
        <span class="text-green-700 text-sm">发布成功！</span>
        <a v-if="currentPublishedUrl" :href="currentPublishedUrl" target="_blank"
           class="text-blue-500 hover:underline text-sm ml-2">点击查看帖子 →</a>
      </div>

      <div v-if="currentStatus === 'failed'" class="mt-3 p-3 bg-red-50 rounded-lg">
        <div class="text-red-600 text-sm font-medium">发布失败</div>
        <div class="text-red-500 text-xs mt-1">{{ currentErrorMessage }}</div>
        <el-button v-if="currentErrorMessage?.includes('失效') || currentErrorMessage?.includes('授权')"
                   type="primary" plain size="small" class="mt-2" @click="goToAccounts">
          去重新授权
        </el-button>
      </div>

      <template #footer>
        <el-button
          v-if="isPublishInProgress"
          type="danger"
          plain
          :loading="cancelling"
          @click="handleAbandonPublish"
        >
          放弃投放
        </el-button>
        <el-button v-if="isPublishInProgress" type="warning" plain @click="logDialogVisible = false">
          后台运行（不中断）
        </el-button>
        <el-button v-else @click="logDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { getToken } from '../utils/auth.js'
import { ref, computed, onMounted, onActivated, onUnmounted, onDeactivated, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {Plus, CircleCheck, Loading, Download, Warning} from '@element-plus/icons-vue'
import api, { publishTasksAPI } from '../utils/api'
import { fetchAllPages, DEFAULT_PAGE_SIZE, reloadPagedListAfterRemoval } from '../utils/pagedApi.js'
import AppPaginationBar from '../components/AppPaginationBar.vue'
import { useAgentHeartbeat } from '../composables/useAgentHeartbeat'
import { formatZhCnMdHm } from '../utils/dateTime.js'
import { fetchDictList } from '../utils/sysDict.js'
import { toDataValueSelectOptions, resolveToDataValue } from '../utils/dictFieldMap.js'
import { normalizePublishPlatform } from '../utils/publishPlatformNormalize.js'
import { getPlatformHexColor } from '../utils/publishPlatformUi.js'
import {
  getPlatformAuthMeta,
  getPlatformTitleMaxLength,
  platformSupportsTags,
} from '../utils/platformAuthMeta.js'
import { downloadLocalAgent } from '../utils/downloadLocalAgent.js'
import {
  parseDraftImageUrls,
  fetchGalleryImageOptions,
  mergeGalleryOptions,
} from '../utils/draftMedia.js'

const router = useRouter()
const route = useRoute()

const API_ORIGIN = window.VITE_API_URL || window.location.origin

const TASKS_API = '/api/publish-tasks'
const ACCOUNTS_API = '/api/platform-accounts'

const agentOnline = ref(false)
useAgentHeartbeat(agentOnline)
const handleDownloadAgent = () => downloadLocalAgent()
// ---- 数据 ----
const tasks = ref([])
const taskTotal = ref(0)
const page = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const tasksLoading = ref(false)
const drafts = ref([])
const authorizedAccounts = ref([])   // 只存已授权账号（下拉用，分页拉全）

const platformDictRows = ref([])

const loadPlatformDict = async () => {
  platformDictRows.value = await fetchDictList('publish_platform')
}

const publishPlatformValues = computed(() =>
  toDataValueSelectOptions(platformDictRows.value)
    .map((o) => o.value)
    .filter(Boolean)
)

/** 账号平台与下拉选项对齐（兼容 data_key / 别名 / 字典展示值） */
const canonicalPlatform = (name) => {
  const fromDict = resolveToDataValue(platformDictRows.value, name)
  return normalizePublishPlatform(fromDict || name)
}

const platformMatches = (accountPlatform, selectedPlatform) =>
  canonicalPlatform(accountPlatform) === canonicalPlatform(selectedPlatform)

const selectedPlatformMeta = computed(() => getPlatformAuthMeta(form.value.platform || ''))

const formTitleMaxLength = computed(() =>
  form.value.platform ? getPlatformTitleMaxLength(form.value.platform) : 100
)

const formTitlePlaceholder = computed(() => {
  const p = form.value.platform
  if (p === '小红书') return '小红书标题最多 20 字'
  if (p === '今日头条' || p === '百度百家号') return '文章标题最多 30 字'
  return '请输入标题'
})

const formTitleHint = computed(() => {
  const p = form.value.platform
  const meta = getPlatformAuthMeta(p)
  if (p === '小红书') return '小红书超出 20 字将在发布时自动截断'
  if (meta?.publishHint) return meta.publishHint
  return '按所选平台限制填写标题'
})

const formTagsVisible = computed(() => platformSupportsTags(form.value.platform))

const isBaijiahaoPlatform = computed(
  () => canonicalPlatform(form.value.platform) === '百度百家号'
)

const galleryCoverOptions = ref([])

const loadCoverGalleryOptions = async () => {
  galleryCoverOptions.value = await fetchGalleryImageOptions()
}

const coverImageOptions = computed(() => {
  const draft = drafts.value.find((d) => d.id === form.value.draft_id)
  const draftUrls = parseDraftImageUrls(draft?.selectedImages)
  return mergeGalleryOptions(galleryCoverOptions.value, draftUrls)
})

function sliceTitleForPlatform(platform, title) {
  const max = getPlatformTitleMaxLength(platform)
  return String(title || '').slice(0, max)
}

// 当前正在执行轮询的任务ID
const executingId = ref(null)
let pollTimer = null

const listFetchHeaders = { 'Authorization': 'Bearer ' + getToken() }

// ---- 加载数据 ----
const loadTasks = async () => {
  tasksLoading.value = true
  try {
    const { list, total } = await publishTasksAPI.list({
      page: page.value,
      pageSize: pageSize.value,
    })
    tasks.value = list
    taskTotal.value = total
  } catch (err) {
    ElMessage.error('加载任务列表失败：' + err.message)
    tasks.value = []
    taskTotal.value = 0
  } finally {
    tasksLoading.value = false
  }
}

const loadAccounts = async () => {
  try {
    const all = await fetchAllPages(
      (p, ps) =>
        `${API_ORIGIN}${ACCOUNTS_API}?page=${p}&pageSize=${ps}&authStatus=authorized`,
      { pageSize: 100, fetchOptions: { headers: listFetchHeaders } }
    )
    authorizedAccounts.value = all
  } catch {
    authorizedAccounts.value = []
  }
}

const loadDrafts = async () => {
  try {
    const all = await fetchAllPages(
      (p, ps) =>
        `${API_ORIGIN}/api/drafts?page=${p}&pageSize=${ps}`,
      { pageSize: 100, fetchOptions: { headers: listFetchHeaders } }
    )
    drafts.value = all
  } catch {
    drafts.value = []
  }
}

const refreshPageData = async () => {
  await Promise.all([loadTasks(), loadAccounts(), loadDrafts()])
}

onMounted(async () => {
  await loadPlatformDict()
  await refreshPageData()
  // 支持从草稿箱跳转时带 draftId
  if (route.query.draftId) {
    const id = Number(route.query.draftId)
    const draft = drafts.value.find(d => d.id === id)
    if (draft) {
      createDialogVisible.value = true
      form.value.draft_id = id
      form.value.title = (draft.title || '').slice(0, 100)
      form.value.task_name = `${draft.title || ''}投放`
      loadCoverGalleryOptions()
    }
  }
})

onActivated(() => {
  refreshPageData()
})

onDeactivated(() => {
  stopStatusPoll()
})

onUnmounted(() => {
  stopStatusPoll()
})

// ---- 创建任务 ----
const createDialogVisible = ref(false)
const creating = ref(false)
const formRef = ref(null)
const form = ref({
  task_name: '', draft_id: null, title: '',
  platform: '', account_id: null, tags: '',
  cover_image_url: '',
})
const formRules = {
  task_name: [{ required: true, message: '请填写任务名称', trigger: 'blur' }],
  draft_id:  [{ required: true, message: '请选择发布内容', trigger: 'change' }],
  title:     [{ required: true, message: '请填写发帖标题', trigger: 'blur' }],
  platform:  [{ required: true, message: '请选择平台', trigger: 'change' }],
  account_id:[{ required: true, message: '请选择发布账号', trigger: 'change' }],
}

const availablePlatforms = computed(() => {
  return publishPlatformValues.value.map((p) => ({
    value: p,
    label: p,
    accountCount: authorizedAccounts.value.filter((a) => platformMatches(a.platform, p)).length,
  }))
})

const filteredAccounts = computed(() =>
  authorizedAccounts.value.filter((a) => platformMatches(a.platform, form.value.platform))
)

const openCreateDialog = async () => {
  form.value = {
    task_name: '', draft_id: null, title: '',
    platform: '', account_id: null, tags: '',
    cover_image_url: '',
  }
  createDialogVisible.value = true
  await Promise.all([loadAccounts(), loadCoverGalleryOptions()])
}

const resetForm = () => {
  formRef.value?.resetFields()
}

const handleDraftChange = (id) => {
  const draft = drafts.value.find(d => d.id === id)
  if (draft) {
    const max = form.value.platform ? getPlatformTitleMaxLength(form.value.platform) : 100
    if (!form.value.title) form.value.title = (draft.title || '').slice(0, max)
    if (!form.value.task_name) form.value.task_name = `${draft.title || ''}投放`
  }
  const urls = new Set(coverImageOptions.value.map((x) => x.url))
  if (form.value.cover_image_url && !urls.has(form.value.cover_image_url)) {
    form.value.cover_image_url = ''
  }
}

const handlePlatformChange = () => {
  form.value.account_id = null
  if (form.value.platform && form.value.title) {
    form.value.title = sliceTitleForPlatform(form.value.platform, form.value.title)
  }
  if (!platformSupportsTags(form.value.platform)) {
    form.value.tags = ''
  }
  if (!isBaijiahaoPlatform.value) {
    form.value.cover_image_url = ''
  } else {
    loadCoverGalleryOptions()
  }
}

const handleCreate = async () => {
  await formRef.value?.validate(async (valid) => {
    if (!valid) return
    if (filteredAccounts.value.length === 0) {
      ElMessage.warning(`${form.value.platform} 暂无已授权账号，请先去账号管理页授权`)
      return
    }
    creating.value = true
    try {
      const draft = drafts.value.find(d => d.id === form.value.draft_id)
      await api.post(TASKS_API, {
        task_name: form.value.task_name,
        draft_id: form.value.draft_id,
        draft_title: draft?.title || '',
        platform: form.value.platform,
        account_id: form.value.account_id,
        content: draft?.content || '',
        title: sliceTitleForPlatform(form.value.platform, form.value.title),
        tags: platformSupportsTags(form.value.platform) ? form.value.tags : '',
        cover_image_url:
          isBaijiahaoPlatform.value && form.value.cover_image_url
            ? form.value.cover_image_url
            : '',
      })
      ElMessage.success('任务创建成功')
      createDialogVisible.value = false
      page.value = 1
      await loadTasks()
    } catch (err) {
      ElMessage.error(err.message || '创建失败')
    } finally {
      creating.value = false
    }
  })
}

// ---- 执行任务 ----
const handleExecute = async (row) => {
  if (!agentOnline.value) {
    ElMessage.warning('请先启动本地代理后再执行发布')
    return
  }
  executingId.value = row.id

  try {
    await api.post(`${TASKS_API}/${row.id}/execute`)
    ElMessage.success('已加入本地发布队列，请保持代理运行')
    await loadTasks()
    const updated = tasks.value.find(t => t.id === row.id) || row
    openLogDialog(updated)
    startStatusPoll(row.id)
  } catch (err) {
    ElMessage.error(err.message || '启动失败')
    await loadTasks()
  } finally {
    executingId.value = null
  }
}

const openLogAndPoll = (row) => {
  openLogDialog(row)
  startStatusPoll(row.id)
}

const handleDelete = async (id) => {
  try {
    await api.delete(`${TASKS_API}/${id}`)
    ElMessage.success('删除成功')
    await reloadPagedListAfterRemoval({ page, list: tasks, loadData: loadTasks })
  } catch (err) {
    ElMessage.error(err.message || '删除失败')
  }
}

/** 已放弃但库内仍为 running 时，按失败处理 */
const resolveTaskStatus = (row) => {
  if (!row) return ''
  if (row.cancel_requested && (row.status === 'running' || row.status === 'queued_local')) {
    return 'failed'
  }
  return row.status
}

// ---- 进度弹窗 ----
const logDialogVisible = ref(false)
const logDialogTitle = ref('发布日志')
const currentTaskName = ref('')
const currentLog = ref('')
const currentStatus = ref('')
const currentPublishedUrl = ref('')
const currentPlatform = ref('')
const currentErrorMessage = ref('')
const logBoxRef = ref(null)
const cancelling = ref(false)
let pollingTaskId = null

const isPublishInProgress = computed(
  () => currentStatus.value === 'running' || currentStatus.value === 'queued_local'
)

const syncLogDialogTitle = (status) => {
  const prefix = status === 'running' || status === 'queued_local' ? '发布进度' : '发布日志'
  logDialogTitle.value = `${prefix} - ${currentTaskName.value}`
}

const openLogDialog = (row) => {
  stopStatusPoll()
  const status = resolveTaskStatus(row)
  currentTaskName.value = row.task_name || ''
  syncLogDialogTitle(status)
  currentLog.value = row.task_log || ''
  currentStatus.value = status
  currentPlatform.value = row.platform || ''
  currentPublishedUrl.value = row.published_url || ''
  currentErrorMessage.value = row.error_message || ''
  logDialogVisible.value = true
  if (status === 'running' || status === 'queued_local') {
    startStatusPoll(row.id)
  }
}

const startStatusPoll = (taskId) => {
  stopStatusPoll()
  pollingTaskId = taskId
  pollTimer = setInterval(async () => {
    try {
      const data = await api.get(`${TASKS_API}/${taskId}/status`)
      currentLog.value = data.log || ''
      currentErrorMessage.value = data.errorMessage || ''
      if (data.publishedUrl) currentPublishedUrl.value = data.publishedUrl

      const logFailed = /❌|用户已放弃投放/.test(data.log || '')
      const terminal = data.status === 'done' || data.status === 'failed' || logFailed
      if (terminal) {
        currentStatus.value = data.status === 'done' ? 'done' : 'failed'
        if (!currentErrorMessage.value && currentStatus.value === 'failed') {
          currentErrorMessage.value = logFailed ? '发布失败，任务已终止' : '任务已结束'
        }
        syncLogDialogTitle(currentStatus.value)
        stopStatusPoll()
        await loadTasks()
        return
      }

      currentStatus.value = data.status
      await nextTick()
      if (logBoxRef.value) logBoxRef.value.scrollTop = logBoxRef.value.scrollHeight
    } catch {}
  }, 2000)
}

const handleAbandonPublish = async () => {
  if (!pollingTaskId) return
  try {
    await ElMessageBox.confirm(
      '确定放弃本次投放？将关闭浏览器窗口并立即停止任务。',
      '放弃投放',
      { type: 'warning', confirmButtonText: '放弃', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  cancelling.value = true
  try {
    await api.post(`${TASKS_API}/${pollingTaskId}/cancel`)
    ElMessage.success('已放弃投放，正在关闭浏览器…')
    currentStatus.value = 'failed'
    currentErrorMessage.value = '用户已放弃投放'
    stopStatusPoll()
    await loadTasks()
  } catch (err) {
    ElMessage.error(err.message || '放弃失败')
  } finally {
    cancelling.value = false
  }
}

const stopStatusPoll = () => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  pollingTaskId = null
}

// ---- 工具函数 ----
const goToAccounts = () => {
  createDialogVisible.value = false
  logDialogVisible.value = false
  router.push('/media-accounts')
}

const getPlatformColor = (platform) => getPlatformHexColor(platform)

const getStatusType = (status) => {
  const map = {
    pending: 'warning',
    queued_local: 'warning',
    running: 'primary',
    done: 'success',
    failed: 'danger',
  }
  return map[status] || 'info'
}

const getStatusLabel = (status) => {
  const map = {
    pending: '待执行',
    queued_local: '排队中',
    running: '执行中',
    done: '已完成',
    failed: '失败',
  }
  return map[status] || status
}

const formatTime = (ts) => (!ts ? '-' : formatZhCnMdHm(ts))
</script>
