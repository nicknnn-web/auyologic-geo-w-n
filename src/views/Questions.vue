<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex items-center mb-4">
      <div>
        <div class="text-lg font-bold">拓展问题</div>
        <div class="text-sm text-gray-500">AI扩展的检测问题列表</div>
      </div>
      <div class="flex items-center filter-actions gap-4 ml-auto">
        <el-select v-model="filterKeywordType" placeholder="全部类型" class="w-28" clearable>
          <el-option label="全部类型" value="" />
          <el-option label="品牌" value="品牌" />
          <el-option label="产品" value="产品" />
          <el-option label="场景" value="场景" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="全部状态" class="w-28" clearable>
          <el-option label="全部状态" value="" />
          <el-option label="待审核" value="待审核" />
          <el-option label="已审核" value="已审核" />
          <el-option label="已拒绝" value="已拒绝" />
        </el-select>
        <el-button
          type="danger"
          class="ml-0"
          :disabled="selectedRows.length === 0"
          @click="handleBatchDelete"
        >
          批量删除 ({{ selectedRows.length }})
        </el-button>
        <el-button type="primary" class="ml-0" @click="handleAdd">
          <el-icon class="mr-1"><Plus /></el-icon>
          手动添加
        </el-button>
      </div>
    </div>

    <el-table :data="sortedData" style="width: 100%" @selection-change="handleSelectionChange">
      <el-table-column type="selection" width="50" />
      <el-table-column label="序号" width="80" align="center">
        <template #default="{ row }">
          {{ tableData.findIndex(t => t.id === row.id) + 1 }}
        </template>
      </el-table-column>
      <el-table-column prop="question" label="问题内容" />
      <el-table-column prop="keywordType" label="关键词类型" width="120">
        <template #default="{ row }">
          <el-tag :type="getTypeColor(row.keywordType)" @click="cycleKeywordType(row)" style="cursor:pointer">
            {{ row.keywordType }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sourceKeyword" label="来源关键词" width="120">
        <template #default="{ row }">
          {{ row.sourceKeyword || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="status" width="100">
        <template #header>
          <el-tooltip content="只有已审核的问题才会进入检测问题列表" placement="top" :show-after="300">
            <span>状态</span>
          </el-tooltip>
        </template>
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" @click="cycleStatus(row)" style="cursor:pointer">
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="180" />
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ row }">
          <el-popconfirm title="确定删除吗?" @confirm="handleDelete(row.id)">
            <template #reference>
              <el-button link type="danger" size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="sortedData.length === 0" :description="tableData.length === 0 ? '暂无问题，请先在蒸馏词页面添加关键词并生成问题' : '没有匹配筛选条件的问题'" />

    <el-dialog v-model="dialogVisible" title="手动添加问题" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="问题内容">
          <el-input v-model="form.question" type="textarea" :rows="3" placeholder="请输入问题" />
        </el-form-item>
        <el-form-item label="关键词类型">
          <el-select v-model="form.keywordType" placeholder="请选择类型">
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
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
import { getList, addItem, deleteItem, updateItem } from '../utils/storage'

const tableData = ref([])

// 正序（ oldest first / newest last）+ 筛选
const sortedData = computed(() => {
  let data = [...tableData.value]
  
  if (filterKeywordType.value) {
    data = data.filter(item => item.keywordType === filterKeywordType.value)
  }
  if (filterStatus.value) {
    data = data.filter(item => item.status === filterStatus.value)
  }
  
  return data
})

const dialogVisible = ref(false)
const form = ref({ question: '', keywordType: '' })
const filterKeywordType = ref('')
const filterStatus = ref('')
const selectedRows = ref([])

// 加载数据
const loadData = () => {
  tableData.value = getList('questions')
}

onMounted(() => {
  loadData()
  // 检查是否有传递过来的关键词ID
  if (route.query.keywordIds) {
    setTimeout(() => {
      handleAIExpand()
    }, 500)
  }
})

const getTypeColor = (type) => {
  const map = { '品牌': 'primary', '产品': 'success', '场景': 'warning' }
  return map[type] || 'info'
}

const getStatusType = (status) => {
  const map = { '待审核': 'warning', '已审核': 'success', '已拒绝': 'info' }
  return map[status] || 'info'
}

const handleAIExpand = () => {
  // 获取选中的关键词ID
  let keywords
  if (route.query.keywordIds) {
    const ids = route.query.keywordIds.split(',').map(Number)
    const allKeywords = getList('keywords')
    keywords = allKeywords.filter(k => ids.includes(k.id))
  } else {
    keywords = getList('keywords')
  }
  
  if (keywords.length === 0) {
    ElMessage.warning('请先在蒸馏词页面添加关键词')
    return
  }
  
  // 为每个关键词生成问题
  let count = 0
  keywords.forEach(kw => {
    // 每个关键词生成2个问题
    const questions = [
      `关于${kw.keyword}，哪个品牌最好？`,
      `${kw.keyword}品牌推荐`,
    ]
    
    questions.forEach(q => {
      tableData.value = addItem('questions', {
        question: q,
        keywordType: kw.type,
        sourceKeyword: kw.keyword,
        status: '待审核'
      })
      count++
    })
  })
  
  // 清除URL参数
  if (route.query.keywordIds) {
    router.replace({ path: '/questions' })
  }
  
  ElMessage.success(`已为 ${keywords.length} 个关键词生成 ${count} 个问题`)
}

const cycleStatus = (row) => {
  const statusOrder = ['待审核', '已审核', '已拒绝']
  const currentIndex = statusOrder.indexOf(row.status)
  const nextIndex = (currentIndex + 1) % statusOrder.length
  row.status = statusOrder[nextIndex]
  tableData.value = updateItem('questions', row.id, { status: row.status })
  ElMessage.success('状态已更新')
}

const cycleKeywordType = (row) => {
  const typeOrder = ['品牌', '产品', '场景']
  const currentIndex = typeOrder.indexOf(row.keywordType)
  const nextIndex = (currentIndex + 1) % typeOrder.length
  row.keywordType = typeOrder[nextIndex]
  tableData.value = updateItem('questions', row.id, { keywordType: row.keywordType })
  ElMessage.success('关键词类型已更新')
}

const handleSelectionChange = (selection) => {
  selectedRows.value = selection
}

const handleBatchDelete = () => {
  if (selectedRows.value.length === 0) return
  selectedRows.value.forEach(row => {
    tableData.value = deleteItem('questions', row.id)
  })
  ElMessage.success(`已删除 ${selectedRows.value.length} 条记录`)
  selectedRows.value = []
}

const handleAdd = () => {
  form.value = { question: '', keywordType: '' }
  dialogVisible.value = true
}

const handleSubmit = () => {
  if (!form.value.question || !form.value.keywordType) {
    ElMessage.warning('请填写完整信息')
    return
  }
  const exists = tableData.value.some(q => q.question === form.value.question)
  if (exists) {
    ElMessage.warning('该问题已存在')
    return
  }
  tableData.value = addItem('questions', {
    question: form.value.question,
    keywordType: form.value.keywordType,
    sourceKeyword: '-',
    status: '待审核'
  })
  ElMessage.success('添加成功')
  dialogVisible.value = false
}

const handleDelete = (id) => {
  tableData.value = deleteItem('questions', id)
  ElMessage.success('删除成功')
}
</script>

<style scoped>
.filter-actions :deep(.el-button + .el-button) {
  margin-left: 0 !important;
}
</style>
