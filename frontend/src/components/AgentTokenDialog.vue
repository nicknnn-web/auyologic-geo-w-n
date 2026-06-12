<template>
  <el-dialog v-model="visible" title="代理连接令牌" width="520px" @close="onClose">
    <p class="text-sm text-gray-600 mb-3 leading-relaxed">
      本地代理启动时需要此令牌（以 <code class="text-xs bg-gray-100 px-1 rounded">agy_</code> 开头）。
      <strong class="font-medium">须在您当前浏览器打开的同一套环境生成</strong>：连本地后端请在 localhost 网页生成，连线上请在生产域名生成（两套数据库不互通）。
      重新生成会使旧令牌失效。
    </p>

    <div v-if="tokenConfigured && !plainToken" class="text-sm text-green-700 mb-3">
      已配置代理令牌（出于安全不显示原文）。可重新生成覆盖。
    </div>

    <el-input
      v-if="plainToken"
      v-model="plainToken"
      type="textarea"
      :rows="3"
      readonly
      class="mb-3"
    />

    <div class="flex flex-wrap gap-2">
      <el-button type="primary" :loading="generating" @click="handleGenerate">
        {{ plainToken ? '重新生成' : '生成令牌' }}
      </el-button>
      <el-button v-if="plainToken" @click="copyToken">复制令牌</el-button>
      <el-button type="danger" plain :loading="revoking" @click="handleRevoke">
        作废令牌
      </el-button>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../utils/api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const plainToken = ref('')
const tokenConfigured = ref(false)
const generating = ref(false)
const revoking = ref(false)

watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
    if (v) loadStatus()
  }
)

watch(visible, (v) => emit('update:modelValue', v))

const loadStatus = async () => {
  try {
    const data = await api.get('/api/agent/token')
    tokenConfigured.value = !!data.configured
  } catch {
    tokenConfigured.value = false
  }
}

const onClose = () => {
  plainToken.value = ''
}

const handleGenerate = async () => {
  if (tokenConfigured.value && !plainToken.value) {
    try {
      await ElMessageBox.confirm('重新生成将使当前代理令牌失效，需在各设备上更新配置。是否继续？', '确认', {
        type: 'warning',
      })
    } catch {
      return
    }
  }
  generating.value = true
  try {
    const data = await api.post('/api/agent/token', {})
    plainToken.value = data.token || ''
    tokenConfigured.value = true
    ElMessage.success('令牌已生成，请立即复制保存（仅显示一次）')
  } catch (e) {
    ElMessage.error(e.message || '生成失败')
  } finally {
    generating.value = false
  }
}

const copyToken = async () => {
  if (!plainToken.value) return
  try {
    await navigator.clipboard.writeText(plainToken.value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败，请手动选择复制')
  }
}

const handleRevoke = async () => {
  try {
    await ElMessageBox.confirm('作废后所有代理将断开连接，需重新生成令牌。是否继续？', '作废令牌', {
      type: 'warning',
    })
  } catch {
    return
  }
  revoking.value = true
  try {
    await api.delete('/api/agent/token')
    plainToken.value = ''
    tokenConfigured.value = false
    ElMessage.success('令牌已作废')
  } catch (e) {
    ElMessage.error(e.message || '作废失败')
  } finally {
    revoking.value = false
  }
}
</script>
