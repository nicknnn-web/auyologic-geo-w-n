<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex justify-between items-center mb-4">
      <div>
        <div class="text-lg font-bold">企业图库</div>
        <div class="text-sm text-gray-500">管理企业产品图片，用于AI创作配图</div>
      </div>
    </div>

    <!-- 上传区域 -->
    <div 
      class="border-2 border-dashed border-gray-300 rounded-lg p-8 mb-6 text-center hover:border-blue-400 transition-colors cursor-pointer"
      :class="{ 'border-blue-500 bg-blue-50': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
      @click="triggerUpload"
    >
      <input 
        ref="fileInput"
        type="file"
        class="hidden"
        multiple
        accept="image/*"
        @change="handleFileSelect"
      />
      <el-icon class="text-4xl text-gray-400 mb-3"><PictureFilled /></el-icon>
      <div class="text-gray-600 mb-2">
        <span class="text-blue-500 font-medium">点击上传</span> 或拖拽图片到此处
      </div>
      <div class="text-xs text-gray-400">
        支持 JPG、PNG、GIF、WebP、SVG 格式，单个文件最大 10MB
      </div>
    </div>

    <!-- 支持的文件类型标签 -->
    <div class="flex gap-2 mb-6 justify-center">
      <el-tag type="info" effect="plain">JPG</el-tag>
      <el-tag type="info" effect="plain">PNG</el-tag>
      <el-tag type="info" effect="plain">GIF</el-tag>
      <el-tag type="info" effect="plain">WebP</el-tag>
      <el-tag type="info" effect="plain">SVG</el-tag>
    </div>

    <!-- 上传进度列表 -->
    <div v-if="uploadingFiles.length > 0" class="mb-6">
      <div class="text-sm font-medium text-gray-600 mb-3">上传中...</div>
      <div class="space-y-2">
        <div 
          v-for="file in uploadingFiles" 
          :key="file.name"
          class="flex items-center gap-3 bg-gray-50 rounded-lg p-3"
        >
          <img 
            v-if="file.preview" 
            :src="file.preview" 
            class="w-10 h-10 object-cover rounded"
          />
          <div v-else class="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
            <el-icon class="text-gray-400"><PictureFilled /></el-icon>
          </div>
          <div class="flex-1">
            <div class="text-sm font-medium">{{ file.name }}</div>
            <el-progress 
              :percentage="file.progress" 
              :stroke-width="4"
              :show-text="false"
              class="mt-1"
            />
          </div>
          <el-tag size="small" :type="file.status === 'done' ? 'success' : 'warning'">
            {{ file.status === 'done' ? '完成' : `${file.progress}%` }}
          </el-tag>
        </div>
      </div>
    </div>

    <!-- 图片列表 -->
    <div v-if="tableData.length > 0">
      <div class="flex justify-between items-center mb-3">
        <div class="flex items-center gap-3">
          <div class="text-sm font-medium text-gray-600">图库图片 ({{ tableData.length }})</div>
          <el-button size="small" @click="toggleSelectAll">
            {{ selectedImages.length === tableData.length ? '取消全选' : '全选' }}
          </el-button>
        </div>
        <div class="flex items-center gap-2">
          <el-button 
            :type="viewMode === 'grid' ? 'primary' : 'default'" 
            size="small"
            @click="viewMode = 'grid'"
          >
            <el-icon><Grid /></el-icon>
          </el-button>
          <el-button 
            :type="viewMode === 'list' ? 'primary' : 'default'" 
            size="small"
            @click="viewMode = 'list'"
          >
            <el-icon><List /></el-icon>
          </el-button>
          <el-button 
            v-if="selectedImages.length > 0" 
            type="primary" 
            size="small"
            @click="handleBatchDownload"
          >
            批量下载 ({{ selectedImages.length }})
          </el-button>
          <el-button 
            v-if="selectedImages.length > 0" 
            type="danger" 
            size="small"
            @click="handleBatchDelete"
          >
            批量删除 ({{ selectedImages.length }})
          </el-button>
        </div>
      </div>
      
      <!-- 网格视图 -->
      <div v-if="viewMode === 'grid'" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div 
          v-for="img in tableData" 
          :key="img.id"
          class="group relative bg-gray-50 rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-400 transition-all cursor-pointer"
          :class="{ 'border-blue-500': selectedImages.some(s => s.id === img.id) }"
          @click="toggleSelect(img)"
        >
          <!-- 选择框 -->
          <div 
            class="absolute top-2 left-2 z-10"
            @click.stop
          >
            <el-checkbox 
              :model-value="selectedImages.some(s => s.id === img.id)"
              @change="toggleSelect(img)"
            />
          </div>
          
          <!-- 图片 -->
          <div 
            class="aspect-square overflow-hidden"
            @click.stop="handlePreview(img)"
          >
            <img 
              :src="img.preview" 
              :alt="img.name"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          </div>
          
          <!-- 信息 -->
          <div class="p-2 bg-white">
            <div class="text-xs font-medium truncate" :title="img.name">{{ img.name }}</div>
            <div class="text-xs text-gray-400">{{ formatFileSize(img.size) }}</div>
          </div>
          
          <!-- 删除按钮 -->
          <div 
            class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            @click.stop="handleDelete(img.id)"
          >
            <el-button link type="danger" size="small">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
      
      <!-- 列表视图 -->
      <div v-else>
        <el-table :data="tableData" @selection-change="handleSelectionChange">
          <el-table-column type="selection" width="50" />
          <el-table-column label="图片" width="80">
            <template #default="{ row }">
              <img :src="row.preview" class="w-12 h-12 object-cover rounded" />
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" />
          <el-table-column prop="size" label="大小" width="100">
            <template #default="{ row }">
              {{ formatFileSize(row.size) }}
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="上传时间" width="180" />
          <el-table-column label="操作" width="180" align="center">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="handlePreview(row)">预览</el-button>
              <el-button link type="success" size="small" @click="handleSingleDownload(row)">下载</el-button>
              <el-popconfirm title="确定删除吗?" @confirm="handleDelete(row.id)">
                <template #reference>
                  <el-button link type="danger" size="small">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty v-else description="暂无图片，请上传" />

    <!-- 预览弹窗 -->
    <el-dialog v-model="previewVisible" width="70%" top="5vh" destroy-on-close>
      <template #header>
        <div class="flex items-center gap-2">
          <el-icon><PictureFilled /></el-icon>
          <span>{{ currentPreview?.name }}</span>
        </div>
      </template>
      <div v-if="currentPreview" class="flex justify-center">
        <img 
          :src="currentPreview.preview" 
          :alt="currentPreview.name"
          class="max-h-[70vh] object-contain"
        />
      </div>
      <template #footer>
        <div class="flex justify-between items-center">
          <div class="text-sm text-gray-500">
            {{ currentPreview ? formatFileSize(currentPreview.size) : '' }}
          </div>
          <el-button @click="handlePreviewDownload">下载</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { PictureFilled, Delete, Grid, List } from '@element-plus/icons-vue'
import { imagesAPI } from '../utils/api'
import { uploadFile, deleteFromMinIO, downloadFromMinIO } from '../services/uploadService'

const fileInput = ref(null)
const isDragging = ref(false)
const uploadingFiles = ref([])
const tableData = ref([])
const selectedImages = ref([])
const previewVisible = ref(false)
const currentPreview = ref(null)
const viewMode = ref('grid') // 'grid' or 'list'

// localStorage 持久化
const STORAGE_KEY = 'auyologic-images'

const saveToStorage = () => {
  const data = JSON.stringify(tableData.value)
  if (data.length > 4 * 1024 * 1024) {
    throw new Error('数据过大')
  }
  localStorage.setItem(STORAGE_KEY, data)
}

const loadFromStorage = () => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      tableData.value = JSON.parse(saved)
    } catch (e) {
      console.error('加载图库数据失败', e)
    }
  }
}

onMounted(() => {
  loadImagesFromAPI()
})

// 从后端 API 加载图片
const loadImagesFromAPI = async () => {
  try {
    const data = await imagesAPI.list()
    if (Array.isArray(data) && data.length > 0) {
      tableData.value = data.map(img => ({
        id: img.id,
        name: img.title || img.name || '',
        preview: img.imagePath || img.image_path || img.preview || '',
        size: img.size || 0,
        createdAt: img.createdAt ? new Date(img.createdAt).toLocaleString('zh-CN') : (img.created_at ? new Date(img.created_at).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN'))
      }))
      // 同步到 localStorage
      saveToStorage()
      return
    }
  } catch (e) {
    console.warn('从后端加载图片失败:', e)
  }
  // 回退到 localStorage
  loadFromStorage()
}

const triggerUpload = () => {
  fileInput.value?.click()
}

const handleFileSelect = (event) => {
  const files = Array.from(event.target.files)
  processFiles(files)
  event.target.value = ''
}

const handleDrop = (event) => {
  isDragging.value = false
  const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'))
  processFiles(files)
}

const processFiles = (files) => {
  const validFiles = files.filter(file => {
    if (!file.type.startsWith('image/')) {
      ElMessage.warning('不支持非图片文件')
      return false
    }
    if (file.size > 10 * 1024 * 1024) {
      ElMessage.warning(`${file.name} 超过 10MB 限制`)
      return false
    }
    return true
  })

  validFiles.forEach(file => {
    uploadFileToMinIO(file)
  })
}

const uploadFileToMinIO = (file) => {
  const uploadingFile = {
    name: file.name,
    size: file.size,
    progress: 0,
    status: 'uploading',
    preview: ''
  }
  uploadingFiles.value.push(uploadingFile)

  // 生成预览图用于本地显示
  const reader = new FileReader()
  reader.onload = async (e) => {
    const preview = e.target?.result || ''
    uploadingFile.preview = preview
    
    try {
      // 上传到 MinIO
      const uploadResult = await uploadFile(file, (progress) => {
        uploadingFile.progress = progress
      })

      uploadingFile.progress = 100
      uploadingFile.status = 'done'
      
      const imageData = {
        id: Date.now() + Math.random(),
        name: file.name,
        size: file.size,
        preview: uploadResult.url,
        url: uploadResult.url,
        objectName: uploadResult.objectName,
        createdAt: new Date().toLocaleString('zh-CN')
      }
      tableData.value.unshift(imageData)
      
      // 保存到后端 API
      try {
        const savedImage = await imagesAPI.create({
          title: file.name,
          image_path: uploadResult.url, // 存储 MinIO 公开 URL
          size: file.size,
          tags: '图片'
        })
        console.log('图片记录保存成功:', savedImage)
        // 更新本地数据使用后端返回的真实ID
        imageData.id = savedImage.id
        ElMessage.success('图片已保存到服务器')
      } catch (e) {
        console.error('保存到后端失败:', e.message || e)
        ElMessage.warning('保存到服务器失败，仅保留在本地')
      }
      try {
        saveToStorage()
      } catch (e) {
        ElMessage.warning('localStorage 保存失败')
      }
      
    } catch (error) {
      console.error('上传失败:', error)
      ElMessage.error(`上传失败: ${error.message}`)
      uploadingFile.status = 'error'
    } finally {
      uploadingFiles.value = uploadingFiles.value.filter(f => f !== uploadingFile)
    }
  }
  
  reader.onerror = () => {
    ElMessage.error(`读取文件失败`)
    uploadingFiles.value = uploadingFiles.value.filter(f => f !== uploadingFile)
  }
  
  reader.readAsDataURL(file)
}

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const toggleSelect = (img) => {
  const index = selectedImages.value.findIndex(s => s.id === img.id)
  if (index === -1) {
    selectedImages.value.push(img)
  } else {
    selectedImages.value.splice(index, 1)
  }
}

const toggleSelectAll = () => {
  if (selectedImages.value.length === tableData.value.length) {
    selectedImages.value = []
  } else {
    selectedImages.value = [...tableData.value]
  }
}

const handlePreview = (img) => {
  currentPreview.value = img
  previewVisible.value = true
}

const handlePreviewDownload = () => {
  if (!currentPreview.value) return
  
  const a = document.createElement('a')
  a.href = currentPreview.value.preview
  a.download = currentPreview.value.name
  a.click()
  ElMessage.success('下载成功')
}

const handleSingleDownload = (row) => {
  const a = document.createElement('a')
  a.href = row.preview
  a.download = row.name
  a.click()
  ElMessage.success('下载成功')
}

const handleDelete = async (id) => {
  const image = tableData.value.find(item => item.id === id)
  
  // 尝试从 MinIO 删除文件
  if (image && image.url) {
    try {
      await deleteFromMinIO(image.url)
    } catch (e) {
      console.warn('从 MinIO 删除失败:', e)
    }
  }
  
  // 同步删除数据库记录
  try {
    await imagesAPI.delete(id)
  } catch (e) {
    console.warn('从数据库删除失败:', e)
  }
  tableData.value = tableData.value.filter(item => item.id !== id)
  selectedImages.value = selectedImages.value.filter(s => s.id !== id)
  saveToStorage()
  ElMessage.success('删除成功')
}

const handleBatchDelete = async () => {
  if (selectedImages.value.length === 0) {
    ElMessage.warning('请先选择要删除的图片')
    return
  }
  // 逐个删除，包括 MinIO 文件
  for (const img of selectedImages.value) {
    if (img.url) {
      try {
        await deleteFromMinIO(img.url)
      } catch (e) {
        console.warn(`从 MinIO 删除图片 ${img.name} 失败:`, e)
      }
    }
    
    try {
      await imagesAPI.delete(img.id)
    } catch (e) {
      console.warn(`从数据库删除图片 ${img.name} 失败:`, e)
    }
  }
  const ids = selectedImages.value.map(d => d.id)
  tableData.value = tableData.value.filter(item => !ids.includes(item.id))
  saveToStorage()
  selectedImages.value = []
  ElMessage.success(`已删除 ${ids.length} 张图片`)
}

const handleBatchDownload = () => {
  if (selectedImages.value.length === 0) {
    ElMessage.warning('请先选择要下载的图片')
    return
  }
  
  // 从 MinIO 下载
  selectedImages.value.forEach((img, idx) => {
    setTimeout(async () => {
      try {
        if (img.url) {
          // 从 MinIO 下载
          await downloadFromMinIO(img.url, img.name)
        } else {
          const a = document.createElement('a')
          a.href = img.preview
          a.download = img.name
          a.click()
        }
      } catch (e) {
        console.error(`下载图片 ${img.name} 失败:`, e)
        ElMessage.error(`下载 ${img.name} 失败`)
      }
    }, idx * 300) // 间隔 300ms 避免浏览器阻止
  })
  
  ElMessage.success(`正在下载 ${selectedImages.value.length} 张图片`)
}
</script>

<style scoped>
:deep(.el-dialog__body) {
  padding-top: 10px;
}
</style>
