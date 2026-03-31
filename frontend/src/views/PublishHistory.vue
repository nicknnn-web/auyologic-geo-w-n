<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex justify-between items-center mb-4">
      <div>
        <div class="text-lg font-bold">发布记录</div>
        <div class="text-sm text-gray-500">查看内容发布历史和状态</div>
      </div>
    </div>

    <el-table :data="sortedData" style="width: 100%">
      <el-table-column label="序号" width="80" align="center">
        <template #default="{ $index }">
          {{ $index + 1 }}
        </template>
      </el-table-column>
      <el-table-column prop="draft_title" label="文章标题" />
      <el-table-column prop="account_name" label="发布账号" width="140" />
      <el-table-column prop="platform" label="发布平台" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.platform" :type="getPlatformColor(row.platform)">{{ row.platform }}</el-tag>
          <span v-else class="text-gray-400">-</span>
        </template>
      </el-table-column>
      <el-table-column label="发布链接" min-width="200">
        <template #default="{ row }">
          <a v-if="row.published_url" :href="row.published_url" target="_blank" class="text-blue-500 hover:underline">查看帖子</a>
          <span v-else class="text-gray-400">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === '已发布' ? 'success' : 'warning'">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="发布时间" width="180">
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="sortedData.length === 0" description="暂无发布记录" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { publishRecordsAPI } from '../utils/api'

const tableData = ref([])

const sortedData = computed(() => {
  return [...tableData.value].sort((a, b) => b.id - a.id)
})

const getPlatformColor = (platform) => {
  const map = { '微信公众号': 'success', '小红书': 'danger', '抖音': 'info', '微博': 'warning', '知乎': 'primary', 'B站': 'primary' }
  return map[platform] || 'info'
}

const formatTime = (ts) => {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`
}

const loadData = async () => {
  try {
    const data = await publishRecordsAPI.list()
    tableData.value = Array.isArray(data) ? data : []
  } catch (e) {
    ElMessage.error('加载发布记录失败：' + e.message)
  }
}

onMounted(() => { loadData() })
</script>
