<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex items-center mb-4">
      <div>
        <div class="text-lg font-bold">投放任务</div>
        <div class="text-sm text-gray-500">创建和管理内容投放任务</div>
      </div>
      <div class="ml-auto">
        <el-button type="primary" @click="dialogVisible = true">
          <el-icon class="mr-1"><Plus /></el-icon>
          新建任务
        </el-button>
      </div>
    </div>

    <el-table :data="sortedData" style="width: 100%">
      <el-table-column label="序号" width="80" align="center">
        <template #default="{ $index }">
          {{ $index + 1 }}
        </template>
      </el-table-column>
      <el-table-column prop="title" label="任务名称" />
      <el-table-column prop="draftTitle" label="内容标题" />
      <el-table-column prop="platforms" label="投放平台" width="200">
        <template #default="{ row }">
          <el-tag v-for="p in row.platforms" :key="p" size="small" class="mr-1">{{ p }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="scheduleType" label="发布时间" width="100">
        <template #default="{ row }">
          {{ row.scheduleType === 'now' ? '立即' : row.scheduleTime }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="180" />
      <el-table-column label="操作" width="180" align="center">
        <template #default="{ row }">
          <el-button v-if="row.status === '待执行'" link type="primary" size="small" @click="handleExecute(row)">执行</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建任务弹窗 -->
    <el-dialog v-model="dialogVisible" title="创建投放任务" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="任务名称">
          <el-input v-model="form.title" placeholder="如：新品发布推广" />
        </el-form-item>
        <el-form-item label="选择内容">
          <el-select v-model="form.draftId" placeholder="请选择草稿" style="width: 100%;">
            <el-option v-for="d in drafts" :key="d.id" :label="d.title" :value="d.id">
              <div class="flex justify-between">
                <span>{{ d.title }}</span>
                <span class="text-gray-400 text-sm">{{ d.brand }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="投放平台">
          <el-checkbox-group v-model="form.platforms">
            <el-checkbox label="微信公众号">微信公众号</el-checkbox>
            <el-checkbox label="小红书">小红书</el-checkbox>
            <el-checkbox label="抖音">抖音</el-checkbox>
            <el-checkbox label="微博">微博</el-checkbox>
            <el-checkbox label="知乎">知乎</el-checkbox>
            <el-checkbox label="B站">B站</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="发布时间">
          <el-radio-group v-model="form.scheduleType">
            <el-radio label="now">立即发布</el-radio>
            <el-radio label="schedule">定时发布</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.scheduleType === 'schedule'" label="选择时间">
          <el-date-picker v-model="form.scheduleTime" type="datetime" placeholder="选择发布时间" style="width: 100%;" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">创建任务</el-button>
      </template>
    </el-dialog>

    <el-empty v-if="sortedData.length === 0" description="暂无投放任务" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getList, addItem, deleteItem, updateItem as updateStorageItem } from '../utils/storage'
import { Plus } from '@element-plus/icons-vue'

const router = useRouter()
const tableData = ref([])
const drafts = ref([])
const dialogVisible = ref(false)
const form = ref({
  title: '',
  draftId: '',
  platforms: [],
  scheduleType: 'now',
  scheduleTime: ''
})

const sortedData = computed(() => {
  return [...tableData.value].sort((a, b) => b.id - a.id)
})

const getStatusType = (status) => {
  const map = { '待执行': 'warning', '执行中': 'primary', '已完成': 'success', '失败': 'danger' }
  return map[status] || 'info'
}

const loadData = () => {
  tableData.value = getList('publishTasks')
  drafts.value = getList('drafts')
}

onMounted(() => { loadData() })

const handleSubmit = () => {
  if (!form.value.title || !form.value.draftId || form.value.platforms.length === 0) {
    ElMessage.warning('请填写完整信息')
    return
  }
  
  const selectedDraft = drafts.value.find(d => d.id === form.value.draftId)
  const task = {
    title: form.value.title,
    draftId: form.value.draftId,
    draftTitle: selectedDraft?.title || '',
    content: selectedDraft?.content || '',
    brand: selectedDraft?.brand || '',
    platforms: form.value.platforms,
    scheduleType: form.value.scheduleType,
    scheduleTime: form.value.scheduleTime || '',
    status: '待执行',
    createdAt: new Date().toLocaleString('zh-CN')
  }
  
  addItem('publishTasks', task)
  ElMessage.success('任务创建成功')
  dialogVisible.value = false
  loadData()
  form.value = { title: '', draftId: '', platforms: [], scheduleType: 'now', scheduleTime: '' }
}

const handleExecute = (row) => {
  // 模拟执行发布
  row.status = '执行中'
  updateItem('publishTasks', row)
  
  // 模拟异步执行
  setTimeout(() => {
    row.status = '已完成'
    updateItem('publishTasks', row)
    
    // 添加到发布记录
    row.platforms.forEach(platform => {
      addItem('publishHistory', {
        title: row.draftTitle,
        content: row.content,
        brand: row.brand,
        platform: platform,
        url: 'https://example.com/published/' + Date.now(),
        status: '已发布',
        publishedAt: new Date().toLocaleString('zh-CN')
      })
    })
    ElMessage.success('发布完成')
    router.push('/publish-history')
  }, 2000)
}

const handleDelete = (id) => {
  tableData.value = deleteItem('publishTasks', id)
  ElMessage.success('删除成功')
}

// 简单的更新函数
const updateItem = (key, item) => {
  updateStorageItem(key, item.id, item)
}
</script>
