<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex justify-between items-center mb-4">
      <div>
        <div class="text-lg font-bold">发布记录</div>
        <div class="text-sm text-gray-500">查看内容发布历史和状态</div>
      </div>
    </div>

    <el-table v-loading="loading" :data="tableData" style="width: 100%">
      <el-table-column label="序号" width="80" align="center">
        <template #default="{ $index }">
          {{ (page - 1) * pageSize + $index + 1 }}
        </template>
      </el-table-column>
      <el-table-column prop="draftTitle" label="文章标题" />
      <el-table-column prop="accountName" label="发布账号" width="140" />
      <el-table-column prop="platform" label="发布平台" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.platform" :type="getPlatformColor(row.platform)">{{ row.platform }}</el-tag>
          <span v-else class="text-gray-400">-</span>
        </template>
      </el-table-column>
      <el-table-column label="发布链接" min-width="200">
        <template #default="{ row }">
          <a v-if="row.publishedUrl" :href="row.publishedUrl" target="_blank" class="text-blue-500 hover:underline">查看帖子</a>
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
          {{ formatTime(row.createdAt) }}
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && tableData.length === 0" description="暂无发布记录" />

    <AppPaginationBar
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="total"
      @change="loadData"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { publishRecordsAPI } from '../utils/api'
import { DEFAULT_PAGE_SIZE } from '../utils/pagedApi.js'
import { formatZhCnSlashYmdHm } from '../utils/dateTime.js'
import AppPaginationBar from '../components/AppPaginationBar.vue'

const tableData = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const loading = ref(false)

const getPlatformColor = (platform) => {
  const map = { '微信公众号': 'success', '小红书': 'danger', '抖音': 'info', '微博': 'warning', '知乎': 'primary', 'B站': 'primary' }
  return map[platform] || 'info'
}

const formatTime = (ts) => (!ts ? '-' : formatZhCnSlashYmdHm(ts))

const loadData = async () => {
  loading.value = true
  try {
    const { list, total: t } = await publishRecordsAPI.list({
      page: page.value,
      pageSize: pageSize.value,
    })
    tableData.value = [...list].sort((a, b) => (b.id || 0) - (a.id || 0))
    total.value = t
  } catch (e) {
    tableData.value = []
    total.value = 0
    ElMessage.error('加载发布记录失败：' + e.message)
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadData() })
</script>
