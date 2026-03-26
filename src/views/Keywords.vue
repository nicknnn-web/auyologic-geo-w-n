<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex items-center mb-4">
      <div>
        <div class="text-lg font-bold">关键词管理</div>
        <div class="text-sm text-gray-500">管理品牌核心关键词</div>
      </div>
      <div class="flex items-center filter-actions gap-4 ml-auto">
        <el-select v-model="filterType" placeholder="全部类型" class="w-28" clearable>
          <el-option label="全部类型" value="" />
          <el-option label="品牌" value="品牌" />
          <el-option label="产品" value="产品" />
          <el-option label="场景" value="场景" />
        </el-select>
        <el-button type="success" class="ml-0" @click="handleGenerateQuestions" :disabled="selectedKeywords.length === 0">
          <el-icon class="mr-1"><MagicStick /></el-icon>
          生成问题 ({{ selectedKeywords.length }})
        </el-button>
        <el-button type="danger" class="ml-0" :disabled="selectedKeywords.length === 0" @click="handleBatchDelete">
          批量删除 ({{ selectedKeywords.length }})
        </el-button>
        <el-button type="primary" class="ml-0" @click="handleAdd">
          <el-icon class="mr-1"><Plus /></el-icon>
          添加词
        </el-button>
      </div>
    </div>

    <el-table 
      :data="sortedData" 
      style="width: 100%"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="50" />
      <el-table-column label="序号" width="80" align="center">
        <template #default="{ row }">
          {{ tableData.findIndex(t => t.id === row.id) + 1 }}
        </template>
      </el-table-column>
      <el-table-column prop="keyword" label="关键词" />
      <el-table-column prop="type" label="类型" width="120">
        <template #default="{ row }">
          <el-tag :type="getTypeColor(row.type)" @click="cycleType(row)" style="cursor:pointer">
            {{ row.type }}
          </el-tag>
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

    <el-empty v-if="sortedData.length === 0" :description="tableData.length === 0 ? '暂无关键词，请添加' : '没有匹配筛选条件的关键词'" />

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑关键词' : '添加关键词'" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="关键词">
          <el-input v-model="form.keyword" placeholder="请输入关键词" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" placeholder="请选择类型">
            <el-option label="品牌词" value="品牌" />
            <el-option label="产品词" value="产品" />
            <el-option label="场景词" value="场景" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getList, addItem, deleteItem, updateItem } from '../utils/storage'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

const router = useRouter()

const tableData = ref([])

// 正序（ oldest first / newest last）+ 筛选
const sortedData = computed(() => {
  let data = [...tableData.value]
  
  if (filterType.value) {
    data = data.filter(item => item.type === filterType.value)
  }
  
  return data
})
const selectedKeywords = ref([])
const dialogVisible = ref(false)
const filterType = ref('')
const isEdit = ref(false)
const form = ref({ keyword: '', type: '' })

// 加载数据
const loadData = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/keywords`)
    if (res.ok) {
      tableData.value = await res.json()
    } else {
      tableData.value = getList('keywords')
    }
  } catch {
    tableData.value = getList('keywords')
  }
}

onMounted(() => {
  loadData()
})

const getTypeColor = (type) => {
  const map = { '品牌': 'primary', '产品': 'success', '场景': 'warning' }
  return map[type] || 'info'
}

const cycleType = async (row) => {
  const typeOrder = ['品牌', '产品', '场景']
  const currentIndex = typeOrder.indexOf(row.type)
  const nextIndex = (currentIndex + 1) % typeOrder.length
  row.type = typeOrder[nextIndex]
  try {
    await fetch(`${API_BASE_URL}/api/keywords/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: row.type })
    })
  } catch { /* silent */ }
  ElMessage.success('类型已更新')
}

const handleSelectionChange = (selection) => {
  // selection 是从 sortedData 选中的，需要找回原始对象
  selectedKeywords.value = selection.map(s => {
    return tableData.value.find(t => t.id === s.id)
  }).filter(Boolean)
}

const handleGenerateQuestions = () => {
  if (selectedKeywords.value.length === 0) {
    ElMessage.warning('请先选择要生成问题的关键词')
    return
  }
  // 把选中的关键词ID传到问题页面
  const ids = selectedKeywords.value.map(k => k.id).join(',')
  ElMessage.success(`已选择 ${selectedKeywords.value.length} 个关键词，生成问题中...`)
  router.push({ path: '/questions', query: { keywordIds: ids } })
}

const handleAdd = () => {
  form.value = { keyword: '', type: '' }
  isEdit.value = false
  dialogVisible.value = true
}

const handleEdit = (row) => {
  form.value = { ...row }
  isEdit.value = true
  dialogVisible.value = true
}

const handleDelete = (id) => {
  try {
    await fetch(`${API_BASE_URL}/api/keywords/${id}`, { method: 'DELETE' })
  } catch { /* silent */ }
  tableData.value = tableData.value.filter(r => r.id !== id)
  ElMessage.success('删除成功')
}

const handleBatchDelete = async () => {
  if (selectedKeywords.value.length === 0) return
  const ids = selectedKeywords.value.map(r => r.id)
  for (const id of ids) {
    try {
      await fetch(`${API_BASE_URL}/api/keywords/${id}`, { method: 'DELETE' })
    } catch { /* silent */ }
  }
  tableData.value = tableData.value.filter(r => !ids.includes(r.id))
  ElMessage.success(`已删除 ${selectedKeywords.value.length} 条记录`)
  selectedKeywords.value = []
}

const handleSubmit = () => {
  if (!form.value.keyword || !form.value.type) {
    ElMessage.warning('请填写完整信息')
    return
  }
  const exists = tableData.value.some(k => k.keyword === form.value.keyword && k.id !== form.value.id)
  if (exists) {
    ElMessage.warning('该关键词已存在')
    return
  }
  if (isEdit.value) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/keywords/${form.value.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: form.value.keyword, type: form.value.type })
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
      const res = await fetch(`${API_BASE_URL}/api/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: form.value.keyword, type: form.value.type })
      })
      if (res.ok) {
        tableData.value.unshift(await res.json())
      }
    } catch { /* silent */ }
    ElMessage.success('添加成功')
  }
  dialogVisible.value = false
}
</script>

<style scoped>
/* Override Element Plus default adjacent button margin */
.filter-actions :deep(.el-button + .el-button) {
  margin-left: 0 !important;
}
</style>
