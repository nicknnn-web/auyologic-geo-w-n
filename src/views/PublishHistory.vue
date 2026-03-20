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
      <el-table-column prop="title" label="文章标题" />
      <el-table-column prop="brand" label="品牌" width="120" />
      <el-table-column prop="platform" label="发布平台" width="120">
        <template #default="{ row }">
          <el-tag :type="getPlatformColor(row.platform)">{{ row.platform }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="url" label="发布链接" min-width="200">
        <template #default="{ row }">
          <a v-if="row.url" :href="row.url" target="_blank" class="text-blue-500 hover:underline">查看</a>
          <span v-else class="text-gray-400">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === '已发布' ? 'success' : 'warning'">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="publishedAt" label="发布时间" width="180" />
    </el-table>

    <el-empty v-if="sortedData.length === 0" description="暂无发布记录" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getList } from '../utils/storage'

const tableData = ref([])

const sortedData = computed(() => {
  return [...tableData.value].sort((a, b) => b.id - a.id)
})

const getPlatformColor = (platform) => {
  const map = { '微信公众号': 'green', '小红书': 'red', '抖音': 'dark', '微博': 'orange', '知乎': 'blue', 'B站': 'blue' }
  return map[platform] || 'info'
}

const loadData = () => {
  tableData.value = getList('publishHistory')
}

onMounted(() => { loadData() })
</script>
