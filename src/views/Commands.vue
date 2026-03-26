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

    <el-table :data="sortedData" style="width: 100%">
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
      <el-table-column prop="createdAt" label="创建时间" width="180" />
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

    <el-empty v-if="tableData.length === 0" description="暂无创作指令，请添加" />

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
import { getList, addItem, deleteItem, updateItem } from '../utils/storage'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'


// P3: 创作类型常量
const PROMPT_TYPES = [
  { label: '文章创作', value: '文章创作' },
  { label: '短视频文案', value: '短视频文案' },
  { label: '社交媒体', value: '社交媒体' }
]

const tableData = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const form = ref({ name: '', type: '', prompt: '' })

// P2: 表单校验规则
const formRules = {
  name: [{ required: true, message: '请输入指令名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择创作类型', trigger: 'change' }],
  prompt: [{ required: true, message: '请输入 Prompt 内容', trigger: 'blur' }]
}

// 正序排列（新添加的在最后）
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

// 加载数据
const loadData = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/instruction-templates`)
    if (res.ok) {
      const data = await res.json()
      tableData.value = data
      saveList('commands', data)
      if (data.length === 0) {
        initDefaultCommands()
        tableData.value = getList('commands')
      }
    } else {
      tableData.value = getList('commands')
      if (tableData.value.length === 0) initDefaultCommands()
    }
  } catch {
    tableData.value = getList('commands')
    if (tableData.value.length === 0) initDefaultCommands()
  }
}

const initDefaultCommands = () => {
  const defaultCommands = [
    {
      name: '产品软文模板',
      type: '产品创作',
      desc: '专业产品评测类文章',
      prompt: `请为品牌 {brand} 撰写一篇关于 {keyword} 的产品评测类文章。

目标人群：{audience}
投放平台：{platforms}
补充说明：{extra}

参考图片: {images}

参考知识:
{knowledge}

要求：
1. 结构完整，包含产品功能、优势、用户体验、使用建议等板块。
2. 语言专业但不晦涩，代入感强，能引发读者共鸣。
3. 字数约800-1500字。
4. 突出产品亮点和差异化优势。
5. 适合{platforms}平台发布。`
    },
    {
      name: '品牌故事模板',
      type: '产品创作',
      desc: '品牌背景与情怀打造',
      prompt: `请为品牌 {brand} 撰写一篇关于 {keyword} 品牌故事类文章。

目标人群：{audience}
投放平台：{platforms}
补充说明：{extra}

品牌/产品背景：
{knowledge}

要求：
1. 结构：创始人故事→品牌理念→产品优势→未来展望。
2. 情感真实、语言自然、有代入感。
3. 字数约1000-2000字。
4. 突出品牌调性和价值观认同。
5. 适合{platforms}平台发布。`
    },
    {
      name: '种草推荐模板',
      type: '种草推荐',
      desc: '以第一人称真实体验分享',
      prompt: `以第一人称视角，为品牌 {brand} 撰写一篇关于 {keyword} 的种草推荐文章。

目标人群：{audience}
投放平台：{platforms}
补充说明：{extra}

参考图片: {images}

参考知识:
{knowledge}

要求：
1. 结构：真实使用场景引入→产品亮点→真实体验感受→推荐理由。
2. 语言真实自然，有代入感。
3. 字数约500-1000字。
4. 适合种草风格，口碑推广为主。
5. 适合{platforms}平台发布。`
    },
    {
      name: '短视频脚本模板',
      type: '短视频脚本',
      desc: '15-60秒的产品视频脚本',
      prompt: `请为品牌 {brand} 撰写一份 {keyword} 相关的短视频拍摄脚本。

目标人群：{audience}
投放平台：{platforms}
补充说明：{extra}

参考素材:
{knowledge}

脚本要求：
1. 总时长15-60秒。
2. 结构：开场(3秒)→使用场景(10秒)→产品展示(20秒)→结尾(7秒)。
3. 画面：或真人口播、或产品特写，有感染力。
4. 适合{platforms}平台发布。`
    },
    {
      name: '热点选题模板',
      type: '种草推荐',
      desc: '结合热点的营销文章',
      prompt: `结合当前热点，为品牌 {brand} 撰写一篇关于 {keyword} 的热点营销文章。

目标人群：{audience}
投放平台：{platforms}
补充说明：{extra}

参考热点背景：
{knowledge}

要求：
1. 结构热点切入→自然过渡到产品→产品亮点→行动号召。
2. 蹭热点要自然，不要生硬。
3. 字数约300-800字。
4. 热点要自然融入，不能生硬。
5. 适合{platforms}平台发布。`
    }
  ]

  defaultCommands.forEach(cmd => {
    addItem('commands', cmd)
  })
  tableData.value = getList('commands')
}

const handleAdd = () => {
  form.value = { name: '', type: '', prompt: '' }
  isEdit.value = false
  dialogVisible.value = true
}

const handleEdit = (row) => {
  form.value = { ...row }
  isEdit.value = true
  dialogVisible.value = true
}

const handleDelete = async (id) => {
  try {
    await fetch(`${API_BASE_URL}/api/instruction-templates/${id}`, { method: 'DELETE' })
  } catch { /* silent */ }
  tableData.value = tableData.value.filter(r => r.id !== id)
  ElMessage.success('删除成功')
}

const handleSubmit = async () => {
  try {
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid) return
    if (isEdit.value) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/instruction-templates/${form.value.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.value.name, content: form.value.prompt || form.value.content })
        })
        if (res.ok) {
          const updated = await res.json()
          const idx = tableData.value.findIndex(r => r.id === updated.id)
          if (idx > -1) tableData.value[idx] = updated
        }
      } catch { /* silent */ }
      ElMessage.success('编辑成功')
    } else {
      try {
        const res = await fetch(`${API_BASE_URL}/api/instruction-templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.value.name, content: form.value.prompt || form.value.content })
        })
        if (res.ok) {
          tableData.value.unshift(await res.json())
        }
      } catch { /* silent */ }
      ElMessage.success('添加成功')
    }
    dialogVisible.value = false
  } catch { /* silent */ }
}
</script>
