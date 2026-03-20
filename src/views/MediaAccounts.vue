<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex items-center mb-4">
      <div>
        <div class="text-lg font-bold">自媒体账号管理</div>
        <div class="text-sm text-gray-500">管理公众号、小红书、抖音等自媒体账号</div>
      </div>
      <div class="ml-auto">
        <el-button type="primary" @click="dialogVisible = true">
          <el-icon class="mr-1"><Plus /></el-icon>
          添加账号
        </el-button>
      </div>
    </div>

    <el-table :data="tableData" style="width: 100%">
      <el-table-column label="序号" width="80" align="center">
        <template #default="{ $index }">
          {{ $index + 1 }}
        </template>
      </el-table-column>
      <el-table-column prop="platform" label="平台" width="120">
        <template #default="{ row }">
          <el-tag :type="getPlatformColor(row.platform)">{{ row.platform }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="account" label="账号" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="url" label="主页链接" min-width="200">
        <template #default="{ row }">
          <a v-if="row.url" :href="row.url" target="_blank" class="text-blue-500 hover:underline">{{ row.url }}</a>
          <span v-else class="text-gray-400">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="followers" label="粉丝数" width="100">
        <template #default="{ row }">
          {{ row.followers ? row.followers.toLocaleString() : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === '已授权' ? 'success' : 'warning'">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" align="center">
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

    <el-empty v-if="tableData.length === 0" description="暂无自媒体账号，请添加" />

    <!-- 添加/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑账号' : '添加账号'" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="平台">
          <el-select v-model="form.platform" placeholder="请选择平台" style="width: 100%;">
            <el-option label="微信公众号" value="微信公众号" />
            <el-option label="小红书" value="小红书" />
            <el-option label="抖音" value="抖音" />
            <el-option label="快手" value="快手" />
            <el-option label="微博" value="微博" />
            <el-option label="知乎" value="知乎" />
            <el-option label="B站" value="B站" />
            <el-option label="今日头条" value="今日头条" />
            <el-option label="百家号" value="百家号" />
            <el-option label="视频号" value="视频号" />
          </el-select>
        </el-form-item>
        <el-form-item label="账号">
          <el-input v-model="form.account" placeholder="请输入账号名称" />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="请输入账号显示名称（可选）" />
        </el-form-item>
        <el-form-item label="主页链接">
          <el-input v-model="form.url" placeholder="https://（可选）" />
        </el-form-item>
        <el-form-item label="粉丝数">
          <el-input-number v-model="form.followers" :min="0" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio label="已授权">已授权</el-radio>
            <el-radio label="待授权">待授权</el-radio>
          </el-radio-group>
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
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getList, addItem, deleteItem, updateItem } from '../utils/storage'
import { Plus } from '@element-plus/icons-vue'

const tableData = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const form = ref({
  platform: '',
  account: '',
  name: '',
  url: '',
  followers: 0,
  status: '待授权'
})

const sortedData = computed(() => {
  return [...tableData.value].sort((a, b) => a.id - b.id)
})

const getPlatformColor = (platform) => {
  const map = { 
    '微信公众号': 'green', 
    '小红书': 'red', 
    '抖音': 'dark', 
    '快手': 'orange', 
    '微博': 'orange', 
    '知乎': 'blue', 
    'B站': 'blue',
    '今日头条': 'orange'
  }
  return map[platform] || 'info'
}

const loadData = () => {
  // 合并 mediaSocial 和 mediaOfficial 的数据
  const social = getList('mediaSocial')
  const official = getList('mediaOfficial').filter(o => o.url) // 只取有链接的官方媒体
  const combined = [
    ...social.map(s => ({ ...s, type: 'social' })),
    ...official.map(o => ({ ...o, type: 'official' }))
  ]
  tableData.value = combined.sort((a, b) => a.id - b.id)
  
  // 首次加载添加默认数据
  if (tableData.value.length === 0) {
    const defaults = [
      { platform: '微信公众号', account: '企业官方', name: '官方公众号', url: '', followers: 10000, status: '已授权' },
      { platform: '小红书', account: '企业官方', name: '官方小红书', url: '', followers: 5000, status: '已授权' },
      { platform: '抖音', account: '企业官方', name: '官方抖音', url: '', followers: 0, status: '待授权' },
    ]
    defaults.forEach(item => addItem('mediaSocial', item))
    tableData.value = getList('mediaSocial').sort((a, b) => a.id - b.id)
  }
}

onMounted(() => { loadData() })

const handleEdit = (row) => {
  form.value = { ...row }
  isEdit.value = true
  dialogVisible.value = true
}

const handleDelete = (id) => {
  const list = getList('mediaSocial')
  const item = list.find(i => i.id === id)
  if (item) {
    deleteItem('mediaSocial', id)
    loadData()
  }
  ElMessage.success('删除成功')
}

const handleSubmit = () => {
  if (!form.value.platform || !form.value.account) {
    ElMessage.warning('请填写平台和账号')
    return
  }
  
  if (isEdit.value) {
    updateItem('mediaSocial', {
      id: form.value.id,
      platform: form.value.platform,
      account: form.value.account,
      name: form.value.name,
      url: form.value.url,
      followers: form.value.followers,
      status: form.value.status,
      createdAt: form.value.createdAt || new Date().toLocaleString('zh-CN')
    })
    ElMessage.success('更新成功')
  } else {
    addItem('mediaSocial', {
      platform: form.value.platform,
      account: form.value.account,
      name: form.value.name,
      url: form.value.url,
      followers: form.value.followers,
      status: form.value.status,
      createdAt: new Date().toLocaleString('zh-CN')
    })
    ElMessage.success('添加成功')
  }
  
  dialogVisible.value = false
  loadData()
  isEdit.value = false
  form.value = {
    platform: '',
    account: '',
    name: '',
    url: '',
    followers: 0,
    status: '待授权'
  }
}
</script>
