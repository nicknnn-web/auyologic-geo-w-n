<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <!-- 页头 -->
    <div class="flex items-center mb-5">
      <div>
        <div class="text-lg font-bold">自媒体账号管理</div>
        <div class="text-sm text-gray-500">管理各平台账号授权，授权后可一键发帖</div>
      </div>
      <div class="ml-auto flex items-center gap-3">
        <!-- 代理在线状态指示 -->
        <div class="flex items-center gap-1.5 text-sm">
          <span
            class="inline-block w-2 h-2 rounded-full"
            :class="agentOnline ? 'bg-green-500' : 'bg-gray-300'"
          />
          <span :class="agentOnline ? 'text-green-600' : 'text-gray-400'">
            {{ agentOnline ? '本地代理在线' : '本地代理离线' }}
          </span>
        </div>
        <el-button type="primary" @click="openAddDialog">
          <el-icon class="mr-1"><Plus /></el-icon>
          添加账号
        </el-button>
      </div>
    </div>

    <!-- 代理离线提示横幅 -->
    <div v-if="!agentOnline" class="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <el-icon class="text-amber-500 flex-shrink-0" size="18"><Warning /></el-icon>
      <div class="flex-1 text-sm text-amber-700">
        <span class="font-medium">本地代理未运行</span>
        — 账号授权与投放发布均需在您的电脑上运行本地代理。下载后解压，双击
        <code class="bg-amber-100 px-1 rounded text-xs">start-agent.bat</code>
        即可启动。
      </div>
      <el-button size="small" type="warning" plain @click="handleDownloadAgent">
        <el-icon class="mr-1"><Download /></el-icon>
        下载本地代理
      </el-button>
    </div>

    <!-- 账号卡片列表 -->
    <div v-if="accounts.length > 0" class="grid grid-cols-1 gap-4">
      <div
        v-for="account in accounts"
        :key="account.id"
        class="border rounded-lg p-4 flex items-center gap-4 hover:shadow-sm transition-shadow"
        :class="getCardBorderClass(account.auth_status)"
      >
        <!-- 平台图标 + 名称 -->
        <div class="flex items-center gap-3 w-48 flex-shrink-0">
          <div
            class="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
            :style="{ background: getPlatformColor(account.platform) }"
          >
            {{ account.platform.charAt(0) }}
          </div>
          <div>
            <div class="font-medium text-sm">{{ account.account_name || '未命名账号' }}</div>
            <div class="text-xs text-gray-400">{{ account.platform }}</div>
          </div>
        </div>

        <!-- 手机号 -->
        <div class="flex-1 text-sm text-gray-500">
          <span v-if="account.phone_number">
            <el-icon class="mr-1"><Phone /></el-icon>
            {{ maskPhone(account.phone_number) }}
          </span>
          <span v-else class="text-gray-300">未绑定手机号</span>
        </div>

        <!-- 授权状态 -->
        <div class="w-40 flex-shrink-0">
          <el-tag :type="getAuthTagType(account.auth_status)" size="small">
            {{ getAuthLabel(account.auth_status) }}
          </el-tag>
          <div v-if="account.auth_time" class="text-xs text-gray-400 mt-1">
            授权于 {{ formatTime(account.auth_time) }}
          </div>
          <div v-if="account.last_verified_at" class="text-xs text-gray-400">
            验证于 {{ formatTime(account.last_verified_at) }}
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex items-center gap-2 flex-shrink-0">
          <!-- 未授权 / 已过期：显示授权按钮 -->
          <el-button
            v-if="account.auth_status !== 'authorized'"
            type="primary"
            size="small"
            @click="openAuthDialog(account)"
          >
            <el-icon class="mr-1"><Key /></el-icon>
            {{ account.auth_status === 'expired' ? '重新授权' : '开始授权' }}
          </el-button>

          <!-- 已授权：显示验证 + 重新授权 -->
          <template v-else>
            <el-button
              size="small"
              :loading="verifyingId === account.id"
              @click="handleVerify(account)"
            >
              验证有效性
            </el-button>
            <el-button size="small" @click="openAuthDialog(account)">重新授权</el-button>
          </template>

          <!-- 编辑 -->
          <el-button link type="primary" size="small" @click="openEditDialog(account)">编辑</el-button>

          <!-- 删除 -->
          <el-popconfirm title="确定删除此账号？" @confirm="handleDelete(account.id)">
            <template #reference>
              <el-button link type="danger" size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>
    </div>

    <el-empty v-else description="暂无账号，请点击「添加账号」" />

    <!-- ===== 添加 / 编辑账号弹窗 test ===== -->
    <el-dialog
      v-model="accountDialogVisible"
      :title="isEdit ? '编辑账号' : '添加账号'"
      width="480px"
      @close="resetAccountForm"
    >
      <el-form :model="accountForm" :rules="accountRules" ref="accountFormRef" label-width="90px">
        <el-form-item label="平台" prop="platform">
          <el-select v-model="accountForm.platform" placeholder="请选择平台" style="width: 100%;" :disabled="isEdit">
            <el-option label="小红书" value="小红书" />
            <el-option label="抖音" value="抖音" />
            <el-option label="微博" value="微博" />
            <el-option label="知乎" value="知乎" />
            <el-option label="微信公众号" value="微信公众号" />
            <el-option label="B站" value="B站" />
          </el-select>
        </el-form-item>
        <el-form-item label="账号名称" prop="account_name">
          <el-input v-model="accountForm.account_name" placeholder="在平台上的昵称（可选）" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="accountForm.phone_number" placeholder="登录用手机号（可选，授权时自动填入）" maxlength="11" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="accountDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleAccountSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- ===== 授权流程弹窗 ===== -->
    <el-dialog
      v-model="authDialogVisible"
      title="账号授权"
      width="520px"
      :close-on-click-modal="false"
      @close="handleAuthDialogClose"
    >
      <!-- Step 0：填写手机号 + 启动 -->
      <div v-if="authStep === 0">
        <!-- 代理离线警告 -->
        <el-alert
          v-if="!agentOnline"
          type="error"
          :closable="false"
          class="mb-3"
          title="本地代理未运行，无法授权"
          description="请先启动本地代理程序（local-agent/），代理在线后再点击「打开授权浏览器」。"
        />
        <el-alert
          v-else
          type="info"
          :closable="false"
          class="mb-4"
          title="授权说明"
          description="点击「打开授权浏览器」后，本地代理将在您的电脑上弹出一个浏览器窗口并跳转到登录页。若提供了手机号，将自动填入并发送验证码；否则请在弹出的浏览器中手动完成登录。"
        />
        <el-form label-width="90px">
          <el-form-item label="平台">
            <el-tag :color="getPlatformColor(authAccount.platform)" effect="dark">
              {{ authAccount.platform }}
            </el-tag>
          </el-form-item>
          <el-form-item label="手机号">
            <el-input
              v-model="authPhoneNumber"
              placeholder="登录用手机号（可选）"
              maxlength="11"
              style="width: 240px;"
            />
            <div class="text-xs text-gray-400 mt-1">留空则需在弹出浏览器中手动登录</div>
          </el-form-item>
        </el-form>
      </div>

      <!-- Step 1：浏览器已打开，等待用户操作 -->
      <div v-if="authStep === 1">
        <el-alert
          :type="authSessionStatus === 'waiting_sms_code' ? 'warning' : 'success'"
          :closable="false"
          class="mb-4"
          :title="authSessionStatus === 'waiting_sms_code' ? '验证码已发送' : '浏览器已打开'"
          :description="authSessionStatus === 'waiting_sms_code'
            ? '请查看手机短信，将收到的验证码填入下方，或直接在弹出的浏览器中完成操作'
            : '请在弹出的浏览器窗口中完成登录，完成后点击下方「我已完成登录」按钮'"
        />

        <!-- 收到短信验证码时显示输入框 -->
        <div v-if="authSessionStatus === 'waiting_sms_code'" class="mb-4">
          <el-form label-width="90px">
            <el-form-item label="验证码">
              <el-input
                v-model="smsCode"
                placeholder="请输入短信验证码"
                maxlength="6"
                style="width: 200px;"
              />
              <el-button
                type="primary"
                plain
                size="small"
                class="ml-2"
                :loading="submittingCode"
                @click="handleSubmitCode"
              >
                提交验证码
              </el-button>
            </el-form-item>
          </el-form>
          <el-divider>或</el-divider>
          <div class="text-sm text-gray-500 text-center">在弹出的浏览器中手动完成登录后点击下方按钮</div>
        </div>

        <!-- 授权进度指示 -->
        <div class="flex items-center justify-center gap-2 py-2 text-sm text-gray-500">
          <el-icon class="is-loading" v-if="authSessionStatus !== 'authorized'"><Loading /></el-icon>
          <span>{{ getAuthProgressText(authSessionStatus) }}</span>
        </div>
      </div>

      <!-- Step 2：授权完成 -->
      <div v-if="authStep === 2" class="text-center py-6">
        <el-icon style="font-size: 48px; color: #67c23a;"><CircleCheck /></el-icon>
        <div class="text-lg font-medium mt-3 text-green-600">授权成功！</div>
        <div class="text-sm text-gray-500 mt-1">已成功保存登录状态，下次发帖时无需重新登录</div>
      </div>

      <template #footer>
        <!-- Step 0 -->
        <template v-if="authStep === 0">
          <el-button @click="authDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="authStarting" :disabled="!agentOnline" @click="handleAuthStart">
            打开授权浏览器
          </el-button>
        </template>

        <!-- Step 1 -->
        <template v-if="authStep === 1">
          <el-button @click="handleAuthCancel">取消授权</el-button>
          <el-button type="success" :loading="authCompleting" @click="handleAuthComplete">
            我已完成登录
          </el-button>
        </template>

        <!-- Step 2 -->
        <template v-if="authStep === 2">
          <el-button type="primary" @click="authDialogVisible = false">完成</el-button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Key, Phone, Loading, CircleCheck, Warning, Download } from '@element-plus/icons-vue'
import api from '../utils/api'
import { useAgentHeartbeat } from '../composables/useAgentHeartbeat'

const API = '/api/platform-accounts'

// ---- 代理在线状态 + 下载 ----
const agentOnline = ref(false)
useAgentHeartbeat(agentOnline)

const handleDownloadAgent = () => {
  const base = import.meta.env.VITE_API_URL || 'https://auyologic.zeabur.app'
  window.open(`${base}/api/agent/download`, '_blank')
}

// ---- 账号列表 ----
const accounts = ref([])
const verifyingId = ref(null)

const loadAccounts = async () => {
  try {
    const data = await api.get(API)
    accounts.value = Array.isArray(data) ? data : []
  } catch (err) {
    ElMessage.error('加载账号列表失败：' + err.message)
    accounts.value = []
  }
}

onMounted(() => {
  loadAccounts()
})

// ---- 添加 / 编辑账号 ----
const accountDialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const accountFormRef = ref(null)
const accountForm = ref({ platform: '', account_name: '', phone_number: '' })
const accountRules = {
  platform: [{ required: true, message: '请选择平台', trigger: 'change' }],
}
let editingId = null

const openAddDialog = () => {
  isEdit.value = false
  editingId = null
  accountForm.value = { platform: '', account_name: '', phone_number: '' }
  accountDialogVisible.value = true
}

const openEditDialog = (account) => {
  isEdit.value = true
  editingId = account.id
  accountForm.value = {
    platform: account.platform,
    account_name: account.account_name || '',
    phone_number: account.phone_number || '',
  }
  accountDialogVisible.value = true
}

const resetAccountForm = () => {
  accountFormRef.value?.resetFields()
}

const handleAccountSubmit = async () => {
  await accountFormRef.value?.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      if (isEdit.value) {
        await api.put(`${API}/${editingId}`, accountForm.value)
        ElMessage.success('账号信息已更新')
      } else {
        await api.post(API, accountForm.value)
        ElMessage.success('账号添加成功')
      }
      accountDialogVisible.value = false
      await loadAccounts()
    } catch (err) {
      ElMessage.error(err.message || '操作失败')
    } finally {
      submitting.value = false
    }
  })
}

const handleDelete = async (id) => {
  try {
    await api.delete(`${API}/${id}`)
    ElMessage.success('删除成功')
    await loadAccounts()
  } catch (err) {
    ElMessage.error(err.message || '删除失败')
  }
}

// ---- 授权流程 ----
const authDialogVisible = ref(false)
const authStep = ref(0)       // 0=准备, 1=等待登录, 2=完成
const authAccount = ref({})
const authPhoneNumber = ref('')
const authStarting = ref(false)
const authCompleting = ref(false)
const authSessionStatus = ref(null)
const smsCode = ref('')
const submittingCode = ref(false)
let pollTimer = null
let pollStartTime = null
const POLL_TIMEOUT_MS = 10 * 60 * 1000 // 10 分钟超时

const openAuthDialog = (account) => {
  authAccount.value = account
  authPhoneNumber.value = account.phone_number || ''
  authStep.value = 0
  authSessionStatus.value = null
  smsCode.value = ''
  authDialogVisible.value = true
}

const handleAuthStart = async () => {
  authStarting.value = true
  try {
    await api.post(`${API}/${authAccount.value.id}/auth-start`, {
      phone_number: authPhoneNumber.value || undefined,
    })
    authStep.value = 1
    startPolling()
    ElMessage.success('浏览器已打开，请完成登录')
  } catch (err) {
    ElMessage.error(err.message || '启动授权失败')
  } finally {
    authStarting.value = false
  }
}

const handleSubmitCode = async () => {
  if (!smsCode.value.trim()) { ElMessage.warning('请输入验证码'); return }
  submittingCode.value = true
  try {
    await api.post(`${API}/${authAccount.value.id}/auth-submit-code`, { code: smsCode.value.trim() })
    ElMessage.success('验证码已提交，请等待跳转完成后点击「我已完成登录」')
  } catch (err) {
    ElMessage.error(err.message || '提交失败')
  } finally {
    submittingCode.value = false
  }
}

const handleAuthComplete = async () => {
  authCompleting.value = true
  try {
    await api.post(`${API}/${authAccount.value.id}/auth-complete`)
    ElMessage.info('已通知代理捕获登录状态，请稍候...')
    // 代理捕获完成后轮询会自动检测到 authorized 并推进到 Step 2
  } catch (err) {
    ElMessage.error(err.message || '操作失败')
  } finally {
    authCompleting.value = false
  }
}

const handleAuthCancel = async () => {
  stopPolling()
  try {
    await api.post(`${API}/${authAccount.value.id}/auth-cancel`)
  } catch {}
  authDialogVisible.value = false
}

const handleAuthDialogClose = () => {
  stopPolling()
  if (authStep.value === 1) {
    api.post(`${API}/${authAccount.value.id}/auth-cancel`).catch(() => {})
  }
}

// 轮询授权进度（每 2 秒一次，最多 10 分钟）
const startPolling = () => {
  stopPolling()
  pollStartTime = Date.now()
  pollTimer = setInterval(async () => {
    // 超时自动停止（后端重启导致 session 丢失时不会永久卡住）
    if (Date.now() - pollStartTime > POLL_TIMEOUT_MS) {
      stopPolling()
      if (authStep.value === 1) {
        ElMessage.warning('授权会话已超时，请重新点击「打开授权浏览器」')
        authStep.value = 0
      }
      return
    }
    try {
      const data = await api.get(`${API}/${authAccount.value.id}/auth-status`)
      authSessionStatus.value = data.sessionStatus
      // 代理完成授权后自动推进到 Step 2
      if (data.sessionStatus === 'authorized' && authStep.value === 1) {
        stopPolling()
        authStep.value = 2
        await loadAccounts()
        ElMessage.success('授权成功！登录状态已保存')
      }
    } catch {}
  }, 2000)
}

const stopPolling = () => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  pollStartTime = null
}

onUnmounted(() => {
  stopPolling()
})

// ---- 校验 session 有效性 ----
const handleVerify = async (account) => {
  verifyingId.value = account.id
  try {
    const data = await api.post(`${API}/${account.id}/auth-verify`)
    if (data.valid) {
      ElMessage.success('Session 有效，可正常发帖')
    } else {
      ElMessage.warning('Session 已失效，请重新授权')
    }
    await loadAccounts()
  } catch (err) {
    ElMessage.error(err.message || '验证失败')
  } finally {
    verifyingId.value = null
  }
}

// ---- 工具函数 ----
const getPlatformColor = (platform) => {
  const map = {
    '小红书': '#FF2442',
    '抖音': '#000000',
    '微博': '#E6162D',
    '知乎': '#0084FF',
    '微信公众号': '#07C160',
    'B站': '#00A1D6',
  }
  return map[platform] || '#909399'
}

const getCardBorderClass = (authStatus) => {
  if (authStatus === 'authorized') return 'border-green-200 bg-green-50/30'
  if (authStatus === 'expired') return 'border-orange-200 bg-orange-50/30'
  return 'border-gray-200'
}

const getAuthTagType = (status) => {
  const map = { authorized: 'success', expired: 'warning', invalid: 'danger', pending: 'info' }
  return map[status] || 'info'
}

const getAuthLabel = (status) => {
  const map = { authorized: '已授权', expired: 'Session 已过期', invalid: '授权无效', pending: '未授权' }
  return map[status] || '未授权'
}

const getAuthProgressText = (status) => {
  const map = {
    waiting_agent: '等待本地代理接收任务…',
    opening: '代理正在启动浏览器…',
    browser_opened: '浏览器已打开，请在弹出窗口中完成登录',
    waiting_sms_code: '等待验证码提交…',
    submitting: '正在提交，等待跳转…',
    authorized: '正在捕获登录状态…',
    null: '等待中…',
  }
  return map[status] || '请在弹出的浏览器中完成登录'
}

const maskPhone = (phone) => {
  if (!phone || phone.length < 7) return phone
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

const formatTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>
