<template>
  <div class="bg-white rounded-md p-5" style="min-height: calc(100vh - 86px);">
    <div class="flex justify-between items-center mb-4">
      <div>
        <div class="text-lg font-bold">企业知识库</div>
        <div class="text-sm text-gray-500">管理企业知识文档，用于AI创作参考</div>
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
        accept=".pdf,.txt,.doc,.docx,.html,.md,.mdx"
        @change="handleFileSelect"
      />
      <el-icon class="text-4xl text-gray-400 mb-3"><UploadFilled /></el-icon>
      <div class="text-gray-600 mb-2">
        <span class="text-blue-500 font-medium">点击上传</span> 或拖拽文件到此处
      </div>
      <div class="text-xs text-gray-400">
        支持 PDF、TXT、Word、HTML、Markdown 文件，单个文件最大 10MB
      </div>
    </div>

    <!-- 支持的文件类型标签 -->
    <div class="flex gap-2 mb-6 justify-center">
      <el-tag type="info" effect="plain">PDF</el-tag>
      <el-tag type="info" effect="plain">TXT</el-tag>
      <el-tag type="info" effect="plain">Word</el-tag>
      <el-tag type="info" effect="plain">HTML</el-tag>
      <el-tag type="info" effect="plain">Markdown</el-tag>
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
          <el-icon class="text-xl" :class="getFileIconClass(file.type)">
            <Document />
          </el-icon>
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

    <!-- 文档列表 -->
    <div v-if="tableData.length > 0">
      <div class="flex justify-between items-center mb-3">
        <div class="text-sm font-medium text-gray-600">知识库文档 ({{ tableData.length }})</div>
        <div class="flex gap-2">
          <el-button 
            type="success" 
            size="small"
            :loading="batchAnalyzing"
            @click="handleBatchAIAnalyze"
          >
            {{ batchAnalyzing ? '分析中...' : '批量AI分析' }}
          </el-button>
          <el-button 
            v-if="selectedDocs.length > 0" 
            type="danger" 
            size="small"
            @click="handleBatchDelete"
          >
            批量删除 ({{ selectedDocs.length }})
          </el-button>
        </div>
      </div>
      <el-table :data="tableData" style="width: 100%" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="50" />
        <el-table-column label="文档" min-width="200">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <el-icon class="text-lg" :class="getFileIconClass(row.type)">
                <Document />
              </el-icon>
              <span class="font-medium">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="getTypeTagType(row.type)" effect="plain">{{ row.type.toUpperCase() }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="size" label="大小" width="100">
          <template #default="{ row }">
            {{ formatFileSize(row.size) }}
          </template>
        </el-table-column>
        <el-table-column prop="words" label="字数" width="100" align="center" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.analyzedAt ? 'success' : 'warning'" size="small">
              {{ row.analyzedAt ? '已分析' : '未分析' }}
            </el-tag>
            <!-- 关键词 tooltip -->
            <el-tooltip 
              v-if="row.keywords && row.keywords.length > 0" 
              placement="top"
              effect="light"
            >
              <template #content>
                <div class="max-w-xs">
                  <div class="font-medium mb-1">关键词:</div>
                  <div class="flex flex-wrap gap-1">
                    <el-tag 
                      v-for="kw in row.keywords.slice(0, 10)" 
                      :key="kw" 
                      size="small" 
                      type="info"
                      class="mb-1"
                    >
                      {{ kw }}
                    </el-tag>
                  </div>
                  <div v-if="row.summary" class="mt-2 pt-2 border-t border-gray-200">
                    <div class="font-medium mb-1">摘要:</div>
                    <div class="text-sm">{{ row.summary }}</div>
                  </div>
                  <div v-if="row.keyPoints && row.keyPoints.length > 0" class="mt-2 pt-2 border-t border-gray-200">
                    <div class="font-medium mb-1">核心要点:</div>
                    <ul class="text-sm list-disc list-inside">
                      <li v-for="(point, idx) in row.keyPoints" :key="idx">{{ point }}</li>
                    </ul>
                  </div>
                </div>
              </template>
              <el-icon class="ml-1 text-gray-400 cursor-help"><InfoFilled /></el-icon>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="上传时间" width="180" />
        <el-table-column label="操作" width="220" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="handlePreview(row)">查看</el-button>
            <el-button link type="success" size="small" @click="handleDownload(row)">下载</el-button>
            <!-- AI 分析按钮 -->
            <el-button 
              link 
              type="warning" 
              size="small"
              :loading="analyzingIds.has(row.id)"
              :disabled="!!row.analyzedAt"
              @click="handleAIAnalyze(row)"
            >
              {{ row.analyzedAt ? '已分析' : 'AI分析' }}
            </el-button>
            <el-popconfirm title="确定删除吗?" @confirm="handleDelete(row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 空状态 -->
    <el-empty v-else description="暂无知识库文档，请上传文件" />

    <!-- 预览弹窗 -->
    <el-dialog v-model="previewVisible" title="文档预览" width="70%" top="5vh" destroy-on-close>
      <!-- Markdown/HTML 渲染 -->
      <div v-if="previewHtml" class="max-h-[80vh] overflow-auto">
        <div class="prose max-w-none p-6" v-html="previewHtml"></div>
      </div>
      <!-- 纯文本 -->
      <div v-else-if="previewContent" class="max-h-[80vh] overflow-auto bg-gray-50 rounded p-6 text-sm whitespace-pre-wrap">
        {{ previewContent }}
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Document, InfoFilled } from '@element-plus/icons-vue'
import { marked } from 'marked'
import { knowledgeAPI } from '../utils/api'

const fileInput = ref(null)
const isDragging = ref(false)
const uploadingFiles = ref([])
const tableData = ref([])
const previewVisible = ref(false)
const previewContent = ref('')
const selectedDocs = ref([])

// localStorage 持久化
const STORAGE_KEY = 'auyologic-knowledge'

const saveToStorage = () => {
  const data = JSON.stringify(tableData.value)
  // 检查大小，localStorage 限制约 5-10MB
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
      console.error('加载知识库数据失败', e)
    }
  }
}

onMounted(() => {
  loadKnowledgeDocs()
})

// 从后端 API 加载知识库文档（API优先，回退到localStorage）
const loadKnowledgeDocs = async () => {
  try {
    // 优先从后端 API 加载
    const data = await knowledgeAPI.list()
    if (Array.isArray(data) && data.length > 0) {
      tableData.value = data.map(doc => ({
        id: doc.id,
        name: doc.name || doc.filename || '未命名文档',
        type: doc.type || doc.fileType || 'txt',
        size: doc.size || 0,
        content: doc.content || '',
        words: (doc.content || '').toString().length,
        keywords: doc.keywords || [],
        summary: doc.summary || '',
        keyPoints: doc.keyPoints || [],
        analyzedAt: doc.analyzedAt || null,
        createdAt: doc.createdAt ? new Date(doc.createdAt).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN')
      }))
      // 同步到 localStorage 作为备份
      saveToStorage()
      return
    }
  } catch (e) {
    console.warn('从后端加载知识库失败，尝试从 localStorage 加载:', e)
  }
  // 回退到 localStorage
  loadFromStorage()
}

// 支持的文件类型
const allowedTypes = ['pdf', 'txt', 'doc', 'docx', 'html', 'md', 'mdx']

const triggerUpload = () => {
  fileInput.value?.click()
}

const handleFileSelect = (event) => {
  const files = Array.from(event.target.files)
  processFiles(files)
  event.target.value = '' // 清空以便重复上传
}

const handleDrop = (event) => {
  isDragging.value = false
  const files = Array.from(event.dataTransfer.files)
  processFiles(files)
}

const processFiles = (files) => {
  const validFiles = files.filter(file => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (!allowedTypes.includes(ext)) {
      ElMessage.warning(`不支持 ${ext} 格式文件`)
      return false
    }
    if (file.size > 10 * 1024 * 1024) {
      ElMessage.warning(`${file.name} 超过 10MB 限制`)
      return false
    }
    return true
  })

  validFiles.forEach(async file => {
    await uploadFile(file)
  })
}

const uploadFile = (file) => {
  return new Promise((resolve) => {
    const ext = file.name.split('.').pop().toLowerCase()
    const uploadingFile = {
      name: file.name,
      type: ext,
      size: file.size,
      progress: 0,
      status: 'uploading'
    }
    uploadingFiles.value.push(uploadingFile)

    // 用 FileReader 读取文件内容
    const reader = new FileReader()
    
    reader.onload = (e) => {
      const content = e.target?.result || ''
      
      // 模拟上传进度
      let progress = 0
      const timer = setInterval(() => {
        progress += Math.random() * 30
        if (progress >= 100) {
          progress = 100
          clearInterval(timer)
          uploadingFile.progress = 100
          uploadingFile.status = 'done'
          
          // 添加到表格，保存真实内容
          setTimeout(async () => {
            const fileData = {
              id: Date.now() + Math.random(),
              name: file.name,
              type: ext,
              size: file.size,
              content: content, // 保存文件内容
              words: content.toString().length,
              status: '已处理',
              createdAt: new Date().toLocaleString('zh-CN')
            }
            tableData.value.unshift(fileData)
            
            // 保存到后端 API（后台同步，失败不影响本地）
            try {
              console.log('正在上传知识库文档...', file.name)
              // 发送符合数据库字段名的数据
              const savedDoc = await knowledgeAPI.create({
                name: file.name,
                filename: file.name,
                type: ext,
                fileType: ext,
                size: file.size,
                content: content
              })
              console.log('知识库保存成功:', savedDoc)
              // 更新本地数据使用后端返回的真实ID
              fileData.id = savedDoc.id
              ElMessage.success('文档已保存到服务器')
            } catch (e) {
              console.error('保存到后端失败:', e.message || e)
              ElMessage.warning('保存到服务器失败，仅保留在本地')
            }
            
            // 保存到 localStorage 作为备份
            try {
              saveToStorage()
            } catch (e) {
              console.warn('localStorage 保存失败:', e)
              ElMessage.warning('文件内容过大，已上传但无法保存预览')
            }
            
            uploadingFiles.value = uploadingFiles.value.filter(f => f.name !== file.name)
            ElMessage.success(`${file.name} 上传成功`)
            resolve()
          }, 500)
        } else {
          uploadingFile.progress = Math.round(progress)
        }
      }, 200)
    }
    
    reader.onerror = () => {
      ElMessage.error(`读取 ${file.name} 失败`)
      uploadingFiles.value = uploadingFiles.value.filter(f => f.name !== file.name)
      resolve()
    }
    
    // 根据类型读取
    if (ext === 'txt' || ext === 'md' || ext === 'mdx') {
      reader.readAsText(file)
    } else if (ext === 'html') {
      reader.readAsText(file)
    } else {
      // PDF/Word 暂时无法前端解析
      reader.readAsText(file)
    }
  })
}

const getFileIconClass = (type) => {
  const iconMap = {
    'pdf': 'text-red-500',
    'txt': 'text-gray-500',
    'doc': 'text-blue-500',
    'docx': 'text-blue-500',
    'html': 'text-orange-500',
    'md': 'text-purple-500',
    'mdx': 'text-purple-500'
  }
  return iconMap[type] || 'text-gray-500'
}

const getTypeTagType = (type) => {
  const tagMap = {
    'pdf': 'danger',    // 红色
    'txt': 'info',      // 灰色
    'doc': 'primary',   // 蓝色
    'docx': 'primary',  // 蓝色
    'html': 'warning',  // 橙色
    'md': 'success',    // 绿色
    'mdx': 'success',   // 绿色
  }
  return tagMap[type] || 'info'
}

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ==================== AI 分析功能 ====================
// DeepSeek API 配置
const DEEPSEEK_API_KEY = 'sk-c8769ba486ee46d799a37a4b8e747159'
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1'
const DEEPSEEK_MODEL = 'deepseek-chat'

// AI 分析状态
const analyzingIds = ref(new Set()) // 正在分析的文档ID集合
const batchAnalyzing = ref(false) // 批量分析中

/**
 * 调用 DeepSeek API 分析文档内容
 * @param {string} content - 文档全文
 * @returns {Promise<{keywords: string[], summary: string, keyPoints: string[]}>}
 */
const analyzeWithDeepSeek = async (content) => {
  const prompt = `你是一个内容分析专家。请分析以下文档，提取用于AI创作的知识素材。

文档内容：
${content}

请以JSON格式返回：
{
  "keywords": ["关键词1", "关键词2", ...],  // 5-10个可用于GEO创作的关键词
  "summary": "100字内的摘要",  // 文档核心内容概述
  "keyPoints": ["要点1", "要点2", ...]  // 3-5个核心观点
}

要求：
- keywords 要能直接用于prompt匹配，覆盖品牌词、产品词、场景词、问题词
- summary 要包含品牌/产品的核心卖点
- keyPoints 是用户真正关心的价值点`

  const response = await fetch(`${DEEPSEEK_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1000
    })
  })

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status}`)
  }

  const data = await response.json()
  const resultText = data.choices?.[0]?.message?.content || ''
  
  // 解析 JSON 响应
  try {
    // 尝试提取 JSON 部分
    const jsonMatch = resultText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    throw new Error('无法解析API响应')
  } catch (e) {
    console.error('解析分析结果失败:', e, resultText)
    throw new Error('解析分析结果失败')
  }
}

/**
 * 单个文档 AI 分析
 * @param {Object} row - 文档记录
 */
const handleAIAnalyze = async (row) => {
  // 检查是否已有分析结果
  if (row.analyzedAt) {
    ElMessage.info('该文档已分析过')
    return
  }
  
  // 获取文档内容
  const content = row.content || ''
  if (!content || content.length < 10) {
    ElMessage.warning('文档内容为空或过短，无法分析')
    return
  }
  
  // 设置 loading 状态
  analyzingIds.value.add(row.id)
  
  try {
    const result = await analyzeWithDeepSeek(content)
    
    // 更新记录
    const index = tableData.value.findIndex(item => item.id === row.id)
    if (index !== -1) {
      const updatedDoc = {
        ...tableData.value[index],
        keywords: result.keywords || [],
        summary: result.summary || '',
        keyPoints: result.keyPoints || [],
        analyzedAt: new Date().toISOString()
      }
      tableData.value[index] = updatedDoc
      
      // 同步到后端 API
      try {
        await knowledgeAPI.update(row.id, {
          keywords: result.keywords || [],
          summary: result.summary || '',
          keyPoints: result.keyPoints || [],
          analyzedAt: updatedDoc.analyzedAt
        })
      } catch (e) {
        console.warn('同步分析结果到后端失败:', e)
      }
      
      saveToStorage()
      ElMessage.success('AI 分析完成')
    }
  } catch (error) {
    console.error('AI 分析失败:', error)
    ElMessage.error(`AI 分析失败: ${error.message}`)
  } finally {
    analyzingIds.value.delete(row.id)
  }
}

/**
 * 批量 AI 分析
 */
const handleBatchAIAnalyze = async () => {
  // 获取未分析的文档
  const docsToAnalyze = tableData.value.filter(doc => !doc.analyzedAt)
  
  if (docsToAnalyze.length === 0) {
    ElMessage.warning('所有文档都已分析完成')
    return
  }
  
  // 检查是否有选中的文档
  if (selectedDocs.value.length > 0) {
    // 只分析选中的未分析文档
    const selectedIds = selectedDocs.value.map(d => d.id)
    const selectedToAnalyze = tableData.value.filter(doc => 
      selectedIds.includes(doc.id) && !doc.analyzedAt
    )
    
    if (selectedToAnalyze.length === 0) {
      ElMessage.warning('所选文档都已分析完成')
      return
    }
    
    batchAnalyzing.value = true
    let successCount = 0
    
    for (const doc of selectedToAnalyze) {
      analyzingIds.value.add(doc.id)
      
      try {
        const content = doc.content || ''
        if (content && content.length >= 10) {
          const result = await analyzeWithDeepSeek(content)
          
          const index = tableData.value.findIndex(item => item.id === doc.id)
          if (index !== -1) {
            const analyzedAt = new Date().toISOString()
            tableData.value[index] = {
              ...tableData.value[index],
              keywords: result.keywords || [],
              summary: result.summary || '',
              keyPoints: result.keyPoints || [],
              analyzedAt: analyzedAt
            }
            successCount++
            
            // 同步到后端 API
            try {
              await knowledgeAPI.update(doc.id, {
                keywords: result.keywords || [],
                summary: result.summary || '',
                keyPoints: result.keyPoints || [],
                analyzedAt: analyzedAt
              })
            } catch (e) {
              console.warn(`同步文档 ${doc.name} 分析结果到后端失败:`, e)
            }
          }
        }
        
        // 间隔 2 秒避免 API 限流
        await new Promise(resolve => setTimeout(resolve, 2000))
      } catch (error) {
        console.error(`分析 ${doc.name} 失败:`, error)
      } finally {
        analyzingIds.value.delete(doc.id)
      }
    }
    
    saveToStorage()
    batchAnalyzing.value = false
    ElMessage.success(`批量分析完成，成功分析 ${successCount} 个文档`)
    selectedDocs.value = [] // 清空选择
  } else {
    // 分析所有未分析的文档
    batchAnalyzing.value = true
    let successCount = 0
    
    for (const doc of docsToAnalyze) {
      analyzingIds.value.add(doc.id)
      
      try {
        const content = doc.content || ''
        if (content && content.length >= 10) {
          const result = await analyzeWithDeepSeek(content)
          
          const index = tableData.value.findIndex(item => item.id === doc.id)
          if (index !== -1) {
            const analyzedAt = new Date().toISOString()
            tableData.value[index] = {
              ...tableData.value[index],
              keywords: result.keywords || [],
              summary: result.summary || '',
              keyPoints: result.keyPoints || [],
              analyzedAt: analyzedAt
            }
            successCount++
            
            // 同步到后端 API
            try {
              await knowledgeAPI.update(doc.id, {
                keywords: result.keywords || [],
                summary: result.summary || '',
                keyPoints: result.keyPoints || [],
                analyzedAt: analyzedAt
              })
            } catch (e) {
              console.warn(`同步文档 ${doc.name} 分析结果到后端失败:`, e)
            }
          }
        }
        
        // 间隔 2 秒避免 API 限流
        await new Promise(resolve => setTimeout(resolve, 2000))
      } catch (error) {
        console.error(`分析 ${doc.name} 失败:`, error)
      } finally {
        analyzingIds.value.delete(doc.id)
      }
    }
    
    saveToStorage()
    batchAnalyzing.value = false
    ElMessage.success(`批量分析完成，成功分析 ${successCount} 个文档`)
  }
}

// ==================== 原有功能 ====================
const previewHtml = ref('')

const handlePreview = async (row) => {
  // 读取真实文件内容
  const content = row.content || ''
  
  console.log('Preview:', row.type, content.length)
  
  if (!content) {
    ElMessage.warning('文件内容已丢失（可能因 localStorage 满），请重新上传')
    return
  }
  
  if (row.type === 'md' || row.type === 'mdx') {
    // Markdown 实时预览
    try {
      previewHtml.value = marked.parse(content)
      previewContent.value = ''
    } catch (e) {
      console.error('Markdown 解析失败:', e)
      ElMessage.error('解析 Markdown 失败')
    }
  } else if (row.type === 'txt') {
    // 纯文本直接显示
    previewContent.value = content
    previewHtml.value = ''
  } else if (row.type === 'html') {
    // HTML 渲染
    previewHtml.value = content
    previewContent.value = ''
  } else {
    // PDF/Word 提示
    previewContent.value = ''
    previewHtml.value = `<div class="text-center py-12 text-gray-400">
      <el-icon class="text-5xl mb-4"><Document /></el-icon>
      <p>暂支持预览 Markdown、TXT、HTML 格式</p>
      <p class="text-sm mt-2">PDF/Word 文件请下载后查看</p>
    </div>`
  }
  previewVisible.value = true
}

const handleDownload = (row) => {
  const content = row.content || ''
  if (!content) {
    ElMessage.warning('文件内容已丢失，请重新上传')
    return
  }
  
  // 创建下载
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = row.name
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('下载成功')
}

const handleDelete = async (id) => {
  // 尝试从后端删除
  try {
    await knowledgeAPI.delete(id)
  } catch (e) {
    console.warn('从后端删除失败，保留在本地:', e)
  }
  tableData.value = tableData.value.filter(item => item.id !== id)
  saveToStorage() // 保存到 localStorage
  ElMessage.success('删除成功')
}

const handleSelectionChange = (selection) => {
  selectedDocs.value = selection
}

const handleBatchDelete = async () => {
  if (selectedDocs.value.length === 0) {
    ElMessage.warning('请先选择要删除的文档')
    return
  }
  const ids = selectedDocs.value.map(d => d.id)
  
  // 尝试从后端批量删除
  for (const id of ids) {
    try {
      await knowledgeAPI.delete(id)
    } catch (e) {
      console.warn(`删除文档 ${id} 失败:`, e)
    }
  }
  
  tableData.value = tableData.value.filter(item => !ids.includes(item.id))
  saveToStorage()
  selectedDocs.value = []
  ElMessage.success(`已删除 ${ids.length} 个文档`)
}
</script>

<style scoped>
:deep(.el-table) {
  border-radius: 8px;
  overflow: hidden;
}

/* Markdown 预览样式 */
.prose {
  color: #374151;
  line-height: 1.7;
}
.prose h1 { font-size: 1.875rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
.prose h2 { font-size: 1.5rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.75rem; }
.prose h3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.5rem; }
.prose p { margin-bottom: 1rem; }
.prose ul, .prose ol { margin-bottom: 1rem; padding-left: 1.5rem; }
.prose li { margin-bottom: 0.25rem; }
.prose code { background: #f3f4f6; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-family: monospace; font-size: 0.875rem; }
.prose pre { background: #1f2937; color: #f9fafb; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin-bottom: 1rem; }
.prose pre code { background: transparent; padding: 0; }
.prose strong { font-weight: 600; }
.prose a { color: #3b82f6; text-decoration: underline; }
</style>
