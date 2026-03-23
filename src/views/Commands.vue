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
const loadData = () => {
  tableData.value = getList('commands')
  
  // 如果没有指令，添加示例模板
  if (tableData.value.length === 0) {
    const defaultCommands = [
      {
        name: '产品测评软文',
        type: '文章创作',
        desc: '专业产品测评文章',
        prompt: `请为品牌 {brand} 撰写一篇关于 {keyword} 的产品测评软文。

目标受众：{audience}
投放平台：{platforms}
补充说明：{extra}

参考图片: {images}

参考知识:
{knowledge}

要求:
1. 结构：开篇引入→产品介绍→核心评测→使用体验→总结推荐
2. 风格：专业严谨但亲切易懂
3. 字数：800-1500字
4. 突出产品优势和差异化卖点
5. 适合在{platforms}发布`
      },
      {
        name: '品牌故事软文',
        type: '文章创作',
        desc: '品牌背后故事文章',
        prompt: `请为品牌 {brand} 撰写一篇关于 {keyword} 的品牌故事软文。

目标受众：{audience}
投放平台：{platforms}
补充说明：{extra}

品牌/产品背景：
{knowledge}

要求:
1. 结构：背景→创始故事→发展历程→核心价值观→未来展望
2. 风格：温情、有深度、能引发共鸣
3. 字数：1000-2000字
4. 突出品牌情怀和价值主张
5. 适合在{platforms}发布`
      },
      {
        name: '亲身体验分享',
        type: '社交媒体',
        desc: '第一人称体验笔记',
        prompt: `请以第一人称视角，为品牌 {brand} 撰写一篇关于 {keyword} 的亲身体验分享。

目标受众：{audience}
投放平台：{platforms}
补充说明：{extra}

参考图片: {images}

参考知识:
{knowledge}

要求:
1. 结构：场景引入→使用过程→真实感受→推荐理由
2. 风格：真实、自然、有代入感
3. 字数：500-1000字
4. 多用第一人称，增加可信度
5. 适合在小红书、微博等平台发布`
      },
      {
        name: '短视频脚本',
        type: '短视频文案',
        desc: '15-60秒短视频文案',
        prompt: `请为品牌 {brand} 撰写一段 {keyword} 主题的短视频脚本。

目标受众：{audience}
投放平台：{platforms}
补充说明：{extra}

参考内容:
{knowledge}

脚本要求:
1. 总时长：15-60秒
2. 结构：钩子(3秒)→痛点/场景(10秒)→产品展示(20秒)→引导(7秒)
3. 风格：活泼、接地气、有感染力
4. 适合在{platforms}发布`
      },
      {
        name: '热点蹭稿',
        type: '社交媒体',
        desc: '蹭热点营销文案',
        prompt: `请结合当前热点，为品牌 {brand} 撰写一篇关于 {keyword} 的蹭热点软文。

目标受众：{audience}
投放平台：{platforms}
补充说明：{extra}

参考热点背景：
{knowledge}

要求:
1. 结构：热点引入→自然过渡→产品关联→观点输出
2. 风格：紧跟热点、观点独特
3. 字数：300-800字
4. 蹭热点要自然，不能生硬
5. 适合在{platforms}发布`
      }
    ]
    
    defaultCommands.forEach(cmd => {
      addItem('commands', cmd)
    })
    tableData.value = getList('commands')
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
  form.value = { ...row }
  isEdit.value = true
  dialogVisible.value = true
}

const handleDelete = (id) => {
  tableData.value = deleteItem('commands', id)
  ElMessage.success('删除成功')
}

const handleSubmit = () => {
  formRef.value.validate((valid) => {
    if (!valid) return
    if (isEdit.value) {
      tableData.value = updateItem('commands', form.value.id, form.value)
      ElMessage.success('编辑成功')
    } else {
      tableData.value = addItem('commands', form.value)
      ElMessage.success('添加成功')
    }
    dialogVisible.value = false
  })
}
</script>
