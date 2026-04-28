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
      <el-button type="primary" @click="openCreate">
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
            />
          </el-select>
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

const API_BASE = window.VITE_API_URL || window.location.origin
const headers = { 'Content-Type': 'application/json', 'x-user-id': 'default_user' }

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
})

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
  }
  applyPresetDefaults('deepseek')
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
