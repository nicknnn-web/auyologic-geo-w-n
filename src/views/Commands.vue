<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex items-center mb-4">
      <div>
        <div class="text-lg font-bold">AI创作指令</div>
        <div class="text-sm text-gray-500">管理AI文章创作的提示词指令</div>
      </div>
      <div class="ml-auto">
        <el-button type="primary" @click="handleAdd">
        <el-icon class="mr-1"><Plus /></el-icon>
        添加指令
      </el-button>
      </div>
    </div>

    <el-table :data="sortedData" style="width: 100%" v-loading="loading">
      <el-table-column label="序号" width="80" align="center">
        <template #default="{ $index }">
          {{ $index + 1 }}
        </template>
      </el-table-column>
      <el-table-column prop="name" label="指令名称" />
      <el-table-column prop="type" label="创作类型" width="150">
        <template #default="{ row }">
          <el-tag :type="getTypeColor(row.type)">{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Prompt 预览" min-width="200">
        <template #default="{ row }">
          <el-tooltip :content="row.prompt" placement="top" :max-width="600" show-after="300">
            <span class="cursor-pointer text-blue-500 hover:underline">
              {{ row.prompt.length > 50 ? row.prompt.substring(0, 50) + '...' : row.prompt }}
            </span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="handleEdit(row)">编辑</el-button>
          <el-popconfirm title="确定删除吗?" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger" size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="sortedData.length === 0 && !loading" description="暂无创作指令，请添加" />

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑指令' : '添加指令'" width="500px">
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="指令名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入指令名称" />
        </el-form-item>
        <el-form-item label="创作类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择类型">
            <el-option v-for="item in PROMPT_TYPES" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="提示词内容" prop="prompt">
          <el-input v-model="form.prompt" type="textarea" :rows="6" placeholder="请输入AI提示词" />
          <div class="text-xs text-gray-400 mt-1">
            支持变量:
            <el-tooltip content="品牌名称，例：苹果、华为" placement="top"><el-tag size="small" class="mx-1 cursor-help">{brand}</el-tag></el-tooltip>
            <el-tooltip content="关键词，例：手机、耳机" placement="top"><el-tag size="small" class="mx-1 cursor-help">{keyword}</el-tag></el-tooltip>
            <el-tooltip content="目标受众群体" placement="top"><el-tag size="small" class="mx-1 cursor-help">{audience}</el-tag></el-tooltip>
            <el-tooltip content="投放平台，例：微信公众号、抖音" placement="top"><el-tag size="small" class="mx-1 cursor-help">{platforms}</el-tag></el-tooltip>
            <el-tooltip content="补充说明或特殊要求" placement="top"><el-tag size="small" class="mx-1 cursor-help">{extra}</el-tag></el-tooltip>
            <el-tooltip content="参考图片描述或URL" placement="top"><el-tag size="small" class="mx-1 cursor-help">{images}</el-tag></el-tooltip>
            <el-tooltip content="参考知识库内容" placement="top"><el-tag size="small" class="mx-1 cursor-help">{knowledge}</el-tag></el-tooltip>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!form.prompt || !form.name || !form.type" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { commandsAPI } from '../utils/api'

// 创作类型常量
const PROMPT_TYPES = [
  { label: '文章创作', value: '文章创作' },
  { label: '短视频文案', value: '短视频文案' },
  { label: '社交媒体', value: '社交媒体' }
]

const tableData = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const form = ref({ name: '', type: '', prompt: '' })

// 表单校验规则
const formRules = {
  name: [{ required: true, message: '请输入指令名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择创作类型', trigger: 'change' }],
  prompt: [{ required: true, message: '请输入 Prompt 内容', trigger: 'blur' }]
}

// 正序排列
const sortedData = computed(() => {
  return [...tableData.value].sort((a, b) => a.id - b.id)
})

const getTypeColor = (type) => {
  const map = {
    '文章创作': 'primary',
    '短视频文案': 'warning',
    '社交媒体': 'success'
  }
  return map[type] || 'info'
}

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN')
}

// 加载数据 - 使用后端 API
const loadData = async () => {
  loading.value = true
  try {
    const res = await commandsAPI.list()
    tableData.value = res.value || res || []
  } catch (err) {
    console.error('加载指令失败:', err)
    ElMessage.error('加载指令失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})

const handleAdd = () => {
  form.value = { name: '', type: '', prompt: '' }
  isEdit.value = false
  dialogVisible.value = true
}

const handleEdit = (row) => {
  form.value = { id: row.id, name: row.name, type: row.type, prompt: row.prompt }
  isEdit.value = true
  dialogVisible.value = true
}

const handleDelete = async (id) => {
  try {
    await commandsAPI.delete(id)
    tableData.value = tableData.value.filter(t => t.id !== id)
    ElMessage.success('删除成功')
  } catch (err) {
    ElMessage.error('删除失败')
  }
}

const handleSubmit = async () => {
  formRef.value.validate(async (valid) => {
    if (!valid) return
    
    try {
      if (isEdit.value) {
        await commandsAPI.update(form.value.id, form.value)
        ElMessage.success('编辑成功')
      } else {
        await commandsAPI.create(form.value)
        ElMessage.success('添加成功')
      }
      await loadData()
      dialogVisible.value = false
    } catch (err) {
      ElMessage.error('操作失败')
    }
  })
}
</script>
