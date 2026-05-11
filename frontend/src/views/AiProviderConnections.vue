<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
      <div>
        <div class="text-lg font-bold">大模型接入</div>
        <div class="text-sm text-gray-500 mt-1">
          管理中国区与 OpenAI 兼容接口；API Key 以密文写入数据库。部署须配置环境变量
          <code class="text-xs bg-gray-100 px-1 rounded">AI_CREDENTIALS_SECRET</code>（至少 16 位）。
          业务探针若仍使用环境变量中的 Key，可与本页并存，后续可再关联本表。
        </div>
      </div>
      <el-button
        type="primary"
        :disabled="hasAllProviderTypes"
        :title="hasAllProviderTypes ? '已配置全部厂商类型' : ''"
        @click="openCreate"
      >
        <el-icon class="mr-1"><Plus /></el-icon>
        新增接入
      </el-button>
    </div>

    <el-alert
      v-if="encryptionWarning"
      type="warning"
      :closable="false"
      show-icon
      class="mb-3"
      title="当前请求返回 503：请在后端 .env 中设置 AI_CREDENTIALS_SECRET 后重启服务。"
    />

    <el-table v-loading="loading" :data="tableData" row-key="id" stripe style="width: 100%">
      <el-table-column label="Logo" width="100" align="center">
        <template #default="{ row }">
          <div
            class="apc-logo-cell"
            :style="{ background: row.logoBgColor || 'rgba(243,244,246,0.9)' }"
          >
            <img v-if="row.logoUrl" :src="absUploadUrl(row.logoUrl)" alt="" class="apc-logo-cell-img" />
            <span v-else class="apc-logo-cell-empty">—</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="vendorName" label="厂家名称" min-width="140" show-overflow-tooltip />
      <el-table-column prop="providerKey" label="类型" width="120" />
      <el-table-column label="API Key" width="140">
        <template #default="{ row }">
          <span class="text-gray-600">{{ keyMask(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="defaultModel" label="模型" min-width="120" show-overflow-tooltip />
      <el-table-column prop="enabled" label="启用" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最近测连" min-width="200">
        <template #default="{ row }">
          <span v-if="row.lastTestStatus === 'ok'" class="text-emerald-600">成功</span>
          <span v-else-if="row.lastTestStatus === 'fail'" class="text-red-600">失败</span>
          <span v-else class="text-gray-400">未测</span>
          <span v-if="row.lastTestMessage" class="text-xs text-gray-500 ml-1 block truncate max-w-xs" :title="row.lastTestMessage">
            {{ row.lastTestMessage }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" :loading="testingId === row.id" @click="testOne(row)">
            测试连接
          </el-button>
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-popconfirm title="确定删除该接入？" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger" size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑接入' : '新增接入'"
      width="520px"
      destroy-on-close
      @closed="onDialogClosed"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="厂家名称" prop="vendorName">
          <el-input v-model="form.vendorName" placeholder="如：公司生产 DeepSeek" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="厂商类型" prop="providerKey">
          <el-select
            v-model="form.providerKey"
            class="w-full"
            filterable
            placeholder="选择预设或自定义"
            @change="onProviderChange"
          >
            <el-option
              v-for="p in presetOptions"
              :key="p.providerKey"
              :label="`${p.label}（${p.providerKey}）`"
              :value="p.providerKey"
              :disabled="isProviderTypeDisabled(p.providerKey)"
            />
          </el-select>
          <p v-if="!isEdit && hasAllProviderTypes" class="text-xs text-amber-600 mt-1">已添加全部厂商类型，无法再新增；可编辑或删除已有记录后再试。</p>
          <p v-else-if="!isEdit && usedProviderKeySet.size" class="text-xs text-gray-400 mt-1">灰色选项为已添加的类型，同类型仅允许一条接入。</p>
        </el-form-item>
        <el-form-item v-if="form.providerKey === 'custom'" label="Base URL" prop="baseUrlOverride">
          <el-input
            v-model="form.baseUrlOverride"
            placeholder="如：https://api.openai.com/v1 或平台提供的兼容地址"
            type="textarea"
            :rows="2"
          />
        </el-form-item>
        <el-form-item v-else label="覆盖 Base URL">
          <el-input
            v-model="form.baseUrlOverride"
            placeholder="留空则使用预设地址；需代理或专属网关时填写"
            type="textarea"
            :rows="2"
          />
        </el-form-item>
        <el-form-item label="模型名" prop="defaultModel">
          <el-input v-model="form.defaultModel" placeholder="留空则使用该厂商默认模型" maxlength="128" />
        </el-form-item>
        <el-form-item :label="isEdit ? '新 API Key' : 'API Key'" :prop="isEdit ? undefined : 'apiKey'">
          <el-input
            v-model="form.apiKey"
            type="password"
            show-password
            :placeholder="isEdit ? '不修改请留空' : '仅写入数据库密文，不在此回显'"
            autocomplete="off"
          />
        </el-form-item>
        <el-form-item label="启用" prop="enabled">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="Logo 底色">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <el-color-picker v-model="form.logoBgColor" show-alpha clearable />
            <span class="text-xs text-gray-500">体检报告里模型图标区域背景；须与「厂家名称」和探针一致方可匹配</span>
          </div>
        </el-form-item>
        <el-form-item v-if="isEdit" label="Logo 图">
          <div class="flex flex-wrap items-center gap-2">
            <el-upload
              :action="logoUploadAction"
              name="logo"
              :headers="uploadHeaders"
              :show-file-list="false"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              :on-success="onLogoUploadOk"
              :before-upload="beforeLogoUpload"
            >
              <el-button size="small" type="primary" plain>上传 / 更换</el-button>
            </el-upload>
            <el-button
              v-if="form.logoUrl"
              size="small"
              type="danger"
              plain
              :loading="logoRemoving"
              @click="removeLogo"
            >
              移除图片
            </el-button>
            <div
              v-if="form.logoUrl"
              class="apc-logo-cell apc-logo-cell--form"
              :style="{ background: form.logoBgColor || 'rgba(243,244,246,0.9)' }"
            >
              <img :src="absUploadUrl(form.logoUrl)" alt="" class="apc-logo-cell-img" />
            </div>
          </div>
        </el-form-item>
        <p v-else class="text-xs text-gray-400 -mt-2 mb-0 pl-[110px]">保存接入后，可再编辑并上传 Logo 图。</p>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { invalidateGeoHealthAvailableModelsCache } from '../utils/geoHealthAvailableModelsCache.js'

const API_BASE = window.VITE_API_URL || window.location.origin
const headers = { 'Content-Type': 'application/json', 'x-user-id': 'default_user' }
const APC_USER_ID = String(headers['x-user-id'] || 'default_user').trim() || 'default_user'

const loading = ref(false)
const saving = ref(false)
const testingId = ref(null)
const tableData = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const formRef = ref(null)
const presetOptions = ref([])
const encryptionWarning = ref(false)

const form = ref({
  vendorName: '',
  providerKey: 'deepseek',
  baseUrlOverride: '',
  defaultModel: '',
  apiKey: '',
  enabled: true,
  logoBgColor: null,
  logoUrl: null,
})

const uploadHeaders = { 'x-user-id': 'default_user' }
const logoRemoving = ref(false)

const logoUploadAction = computed(() =>
  editId.value != null ? `${API_BASE}/api/ai-provider-connections/${editId.value}/logo` : ''
)

const absUploadUrl = (u) => {
  if (!u) return ''
  const s = String(u)
  if (/^https?:\/\//i.test(s)) return s
  const base = API_BASE.replace(/\/$/, '')
  const path = s.startsWith('/') ? s : `/${s}`
  return `${base}${path}`
}

const onLogoUploadOk = (res) => {
  if (res?.success && res.data) {
    form.value.logoUrl = res.data.logoUrl
    if (res.data.logoBgColor !== undefined) {
      form.value.logoBgColor = res.data.logoBgColor
    }
    invalidateGeoHealthAvailableModelsCache(APC_USER_ID)
    ElMessage.success('Logo 已更新')
  } else {
    ElMessage.error(res?.error || '上传失败')
  }
  loadData()
}

const beforeLogoUpload = (file) => {
  const max = 2 * 1024 * 1024
  if (file.size > max) {
    ElMessage.error('图片需小于 2MB')
    return false
  }
  return true
}

const removeLogo = async () => {
  if (editId.value == null) return
  logoRemoving.value = true
  try {
    const res = await fetch(`${API_BASE}/api/ai-provider-connections/${editId.value}/logo`, {
      method: 'DELETE',
      headers: uploadHeaders,
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '移除失败')
    form.value.logoUrl = data.data?.logoUrl ?? null
    await loadData()
    invalidateGeoHealthAvailableModelsCache(APC_USER_ID)
    ElMessage.success('已移除 Logo 图')
  } catch (e) {
    ElMessage.error(e.message || '移除失败')
  } finally {
    logoRemoving.value = false
  }
}

const rules = computed(() => {
  const base = {
    vendorName: [{ required: true, message: '请填写厂家名称', trigger: 'blur' }],
    providerKey: [{ required: true, message: '请选择类型', trigger: 'change' }],
  }
  if (!isEdit.value) {
    base.apiKey = [{ required: true, message: '请填写 API Key', trigger: 'blur' }]
  }
  if (form.value.providerKey === 'custom') {
    base.baseUrlOverride = [{ required: true, message: '请填写 Base URL', trigger: 'blur' }]
  }
  return base
})

const keyMask = (row) => {
  if (row.keyLast4) return `****${row.keyLast4}`
  return '已配置'
}

/** 已有接入的厂商类型（同类型仅一条） */
const usedProviderKeySet = computed(() => {
  const s = new Set()
  for (const r of tableData.value) {
    if (r.providerKey) s.add(r.providerKey)
  }
  return s
})

const hasAllProviderTypes = computed(() => {
  if (!presetOptions.value.length) return false
  return presetOptions.value.every((p) => usedProviderKeySet.value.has(p.providerKey))
})

/** 新增：该类型已有记录则不可再选；编辑：仅其他行占用的类型不可选 */
const isProviderTypeDisabled = (pk) => {
  if (isEdit.value && editId.value != null) {
    return tableData.value.some((r) => r.providerKey === pk && r.id !== editId.value)
  }
  return tableData.value.some((r) => r.providerKey === pk)
}

const firstAvailableProviderKey = () => {
  const available = presetOptions.value.find(
    (p) => !tableData.value.some((r) => r.providerKey === p.providerKey)
  )
  if (available) return available.providerKey
  return presetOptions.value[0]?.providerKey || 'deepseek'
}

const loadPresets = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/ai-provider-connections/presets`, { headers })
    const data = await res.json()
    if (data.success && Array.isArray(data.presets)) {
      presetOptions.value = data.presets
    }
  } catch {
    presetOptions.value = []
  }
}

const loadData = async () => {
  loading.value = true
  encryptionWarning.value = false
  try {
    const res = await fetch(`${API_BASE}/api/ai-provider-connections`, { headers })
    const data = await res.json()
    if (res.status === 503 || (data.error || '').includes('AI_CREDENTIALS_SECRET')) {
      encryptionWarning.value = true
    }
    if (!data.success) throw new Error(data.error || '加载失败')
    tableData.value = data.list || []
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
    tableData.value = []
  } finally {
    loading.value = false
  }
}

const applyPresetDefaults = (pk) => {
  const p = presetOptions.value.find((x) => x.providerKey === pk)
  if (!p) return
  if (!isEdit.value || !form.value.defaultModel) {
    form.value.defaultModel = p.defaultModel || ''
  }
}

const onProviderChange = (pk) => {
  form.value.baseUrlOverride = ''
  applyPresetDefaults(pk)
}

const openCreate = () => {
  isEdit.value = false
  editId.value = null
  form.value = {
    vendorName: '',
    providerKey: 'deepseek',
    baseUrlOverride: '',
    defaultModel: '',
    apiKey: '',
    enabled: true,
    logoBgColor: null,
    logoUrl: null,
  }
  // 在预设加载完成后，默认选第一个尚未添加的类型
  form.value.providerKey = firstAvailableProviderKey()
  applyPresetDefaults(form.value.providerKey)
  dialogVisible.value = true
}

const openEdit = (row) => {
  isEdit.value = true
  editId.value = row.id
  form.value = {
    vendorName: row.vendorName,
    providerKey: row.providerKey,
    baseUrlOverride: row.baseUrlOverride || '',
    defaultModel: row.defaultModel || '',
    apiKey: '',
    enabled: !!row.enabled,
    logoBgColor: row.logoBgColor ?? null,
    logoUrl: row.logoUrl ?? null,
  }
  dialogVisible.value = true
}

const onDialogClosed = () => {
  formRef.value?.resetFields?.()
}

const submitForm = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    const body = {
      vendorName: form.value.vendorName.trim(),
      providerKey: form.value.providerKey,
      baseUrlOverride: form.value.baseUrlOverride.trim(),
      defaultModel: form.value.defaultModel.trim(),
      enabled: form.value.enabled,
      logoBgColor:
        form.value.logoBgColor == null || form.value.logoBgColor === '' ? null : form.value.logoBgColor,
    }
    if (!isEdit.value) {
      body.apiKey = form.value.apiKey
    } else if (form.value.apiKey.trim()) {
      body.apiKey = form.value.apiKey
    }

    const url = isEdit.value
      ? `${API_BASE}/api/ai-provider-connections/${editId.value}`
      : `${API_BASE}/api/ai-provider-connections`
    const res = await fetch(url, {
      method: isEdit.value ? 'PUT' : 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (res.status === 503) {
      encryptionWarning.value = true
      throw new Error(data.error || '请先配置 AI_CREDENTIALS_SECRET')
    }
    if (!data.success) throw new Error(data.error || '保存失败')
    invalidateGeoHealthAvailableModelsCache(APC_USER_ID)
    ElMessage.success('已保存')
    dialogVisible.value = false
    await loadData()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const testOne = async (row) => {
  testingId.value = row.id
  try {
    const res = await fetch(`${API_BASE}/api/ai-provider-connections/${row.id}/test`, {
      method: 'POST',
      headers,
    })
    const data = await res.json()
    if (!data.success && res.status >= 400) {
      throw new Error(data.error || '测试失败')
    }
    if (data.ok) {
      ElMessage.success(data.message || '连接成功')
    } else {
      ElMessage.error(data.message || '连接失败')
    }
    await loadData()
  } catch (e) {
    ElMessage.error(e.message || '测试失败')
  } finally {
    testingId.value = null
    invalidateGeoHealthAvailableModelsCache(APC_USER_ID)
  }
}

const handleDelete = async (id) => {
  try {
    const res = await fetch(`${API_BASE}/api/ai-provider-connections/${id}`, {
      method: 'DELETE',
      headers,
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '删除失败')
    invalidateGeoHealthAvailableModelsCache(APC_USER_ID)
    ElMessage.success('已删除')
    await loadData()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

onMounted(async () => {
  await loadPresets()
  await loadData()
})
</script>

<style scoped>
.apc-logo-cell {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.apc-logo-cell--form {
  width: 48px;
  height: 48px;
  margin: 0;
}
.apc-logo-cell-img {
  max-width: 80%;
  max-height: 80%;
  object-fit: contain;
  display: block;
}
.apc-logo-cell-empty {
  color: #c0c4cc;
  font-size: 12px;
  line-height: 1;
}
</style>
