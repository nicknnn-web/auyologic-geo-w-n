<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex items-center mb-4">
      <div>
        <div class="text-lg font-bold">关键词管理</div>
        <div class="text-sm text-gray-500">管理品牌核心关键词</div>
      </div>
      <div class="flex items-center filter-actions gap-4 ml-auto">
        <el-select v-model="filterType" placeholder="全部类型" class="w-28" clearable @change="loadData">
          <el-option label="全部类型" value="" />
          <el-option label="品牌" value="品牌" />
          <el-option label="品类" value="品类" />
          <el-option label="竞品" value="竞品" />
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
      v-loading="loading"
    >
      <el-table-column type="selection" width="50" />
      <el-table-column label="序号" width="80" align="center">
        <template #default="{ row }">
          {{ sortedData.findIndex(t => t.id === row.id) + 1 }}
        </template>
      </el-table-column>
      <el-table-column prop="keyword" label="关键词" />
      <el-table-column prop="type" label="类型" width="120">
        <template #default="{ row }">
          <el-tag 
            :style="{ backgroundColor: getTypeBgColor(row.type), borderColor: getTypeBorderColor(row.type), color: getTypeTagColor(row.type) }"
            @click="cycleType(row)"
            style="cursor:pointer; font-weight: 500;"
          >
            {{ row.type }}
          </el-tag>
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

    <el-empty v-if="sortedData.length === 0 && !loading" description="暂无关键词，请添加" />

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑关键词' : '添加关键词'" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="关键词">
          <el-input v-model="form.keyword" placeholder="请输入关键词" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" placeholder="请选择类型">
            <el-option label="品牌" value="品牌" />
            <el-option label="品类" value="品类" />
            <el-option label="竞品" value="竞品" />
            <el-option label="场景" value="场景" />
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
import { keywordsAPI } from '../utils/api'

const router = useRouter()

const tableData = ref([])
const loading = ref(false)

// 正序 + 筛选
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

// 加载数据 - 使用后端 API
const loadData = async () => {
  loading.value = true
  try {
    const res = await keywordsAPI.list()
    // API 返回格式: { value: [...] } 或直接是数组
    tableData.value = res.value || res || []
  } catch (err) {
    console.error('加载关键词失败:', err)
    ElMessage.error('加载关键词失败')
  } finally {
    loading.value = false
  }
}

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN')
}

// 获取类型颜色 - 与 GEODetection 保持一致
const getTypeTagColor = (type) => {
  const colors = {
    '品牌': '#722ed1',  // 紫色
    '品类': '#52c41a',  // 绿色
    '竞品': '#1890ff',  // 蓝色
    '场景': '#fa8c16'   // 橙色
  }
  return colors[type] || '#909399'
}

const getTypeBgColor = (type) => {
  const colors = {
    '品牌': '#f3e8ff',  // 紫色浅
    '品类': '#f6ffed',  // 绿色浅
    '竞品': '#e6f7ff',  // 蓝色浅
    '场景': '#fff7e6'   // 橙色浅
  }
  return colors[type] || '#f4f4f5'
}

const getTypeBorderColor = (type) => {
  const colors = {
    '品牌': '#b37feb',
    '品类': '#95de64',
    '竞品': '#69c0ff',
    '场景': '#ffd591'
  }
  return colors[type] || '#d3d4d6'
}

// 循环切换类型
const cycleType = async (row) => {
  const typeOrder = ['品牌', '品类', '竞品', '场景']
  const currentIndex = typeOrder.indexOf(row.type)
  const nextIndex = (currentIndex + 1) % typeOrder.length
  const newType = typeOrder[nextIndex]
  
  try {
    await keywordsAPI.update(row.id, { type: newType })
    row.type = newType
    ElMessage.success('类型已更新')
  } catch (err) {
    ElMessage.error('更新失败')
  }
}

const handleSelectionChange = (selection) => {
  selectedKeywords.value = selection
}

const handleGenerateQuestions = () => {
  if (selectedKeywords.value.length === 0) {
    ElMessage.warning('请先选择要生成问题的关键词')
    return
  }
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
  form.value = { id: row.id, keyword: row.keyword, type: row.type }
  isEdit.value = true
  dialogVisible.value = true
}

const handleDelete = async (id) => {
  try {
    await keywordsAPI.delete(id)
    tableData.value = tableData.value.filter(t => t.id !== id)
    ElMessage.success('删除成功')
  } catch (err) {
    ElMessage.error('删除失败')
  }
}

const handleBatchDelete = async () => {
  if (selectedKeywords.value.length === 0) return
  
  try {
    for (const row of selectedKeywords.value) {
      await keywordsAPI.delete(row.id)
    }
    await loadData()
    ElMessage.success(`已删除 ${selectedKeywords.value.length} 条记录`)
    selectedKeywords.value = []
  } catch (err) {
    ElMessage.error('批量删除失败')
  }
}

const handleSubmit = async () => {
  if (!form.value.keyword || !form.value.type) {
    ElMessage.warning('请填写完整信息')
    return
  }
  
  const exists = tableData.value.some(k => k.keyword === form.value.keyword && k.id !== form.value.id)
  if (exists) {
    ElMessage.warning('该关键词已存在')
    return
  }
  
  try {
    if (isEdit.value) {
      await keywordsAPI.update(form.value.id, form.value)
      ElMessage.success('编辑成功')
    } else {
      await keywordsAPI.create(form.value)
      ElMessage.success('添加成功')
    }
    await loadData()
    dialogVisible.value = false
  } catch (err) {
    ElMessage.error('操作失败')
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.filter-actions :deep(.el-button + .el-button) {
  margin-left: 0 !important;
}
</style>
