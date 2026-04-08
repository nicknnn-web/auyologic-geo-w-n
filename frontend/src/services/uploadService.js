import axios from 'axios'

/**
 * 统一文件上传服务
 */

// 优先走前端代理（同源），fallback 直连后端
const BASE_URL = typeof window !== 'undefined' 
  ? (window.VITE_API_URL || window.location.origin)
  : 'https://auyologic.zeabur.app'

const uploadService = axios.create({
  baseURL: BASE_URL,
  timeout: 120000,
})

uploadService.interceptors.request.use(config => {
  config.headers['x-user-id'] = 'default_user'
  return config
})

uploadService.interceptors.response.use(
  response => response.data,
  error => {
    const msg = error.response?.data?.error || error.message || '上传失败'
    console.error('Upload Error:', msg)
    throw new Error(msg)
  }
)

/**
 * 上传文件
 * @param {File|File[]} fileOrFiles - File 对象或 File 数组
 * @param {Function} onProgress - 进度回调函数 (progress: number)
 * @returns {Promise<{url: string, filename: string, size: number, mimeType: string}>}
 */
export async function uploadFile(fileOrFiles, onProgress = null) {
  try {
    if (Array.isArray(fileOrFiles)) {
      return await uploadFiles(fileOrFiles, onProgress)
    }

    // 单文件上传
    const formData = new FormData()
    formData.append('files', fileOrFiles)

    const response = await uploadService.post('/api/minio/upload', formData, {
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          const progress = Math.round((e.loaded / e.total) * 100)
          onProgress(progress)
        }
      },
    })

    if (response.success) {
      return {
        url: response.url,
        filename: response.filename,
        size: response.size,
        mimeType: response.mimeType,
        objectName: response.objectName,
      }
    } else {
      throw new Error(response.error || '上传失败')
    }
  } catch (error) {
    console.error('文件上传失败:', error)
    throw error
  }
}

/**
 * 批量上传文件
 * @param {File[]} files - File 数组
 * @param {Function} onProgress - 进度回调函数 (index: number, progress: number)
 * @returns {Promise<Array<{url: string, filename: string, size: number, mimeType: string}>>}
 */
export async function uploadFiles(files, onProgress = null) {
  try {
    const formData = new FormData()
    
    files.forEach((file, index) => {
      formData.append('files', file)
    })

    const response = await uploadService.post('/api/minio/upload', formData, {
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          const progress = Math.round((e.loaded / e.total) * 100)
          onProgress(0, progress)
        }
      },
    })

    if (response.success && response.files) {
      return response.files.map((file, index) => ({
        url: file.url,
        filename: file.filename,
        size: file.size,
        mimeType: file.mimeType,
        objectName: file.objectName,
      }))
    } else if (response.success) {
      return [{
        url: response.url,
        filename: response.filename,
        size: response.size,
        mimeType: response.mimeType,
        objectName: response.objectName,
      }]
    } else {
      throw new Error(response.error || '上传失败')
    }
  } catch (error) {
    console.error('批量上传失败:', error)
    throw error
  }
}

/**
 * 从 MinIO URL 下载文件
 * @param {string} url - MinIO 公开访问 URL
 * @param {string} filename - 下载时的文件名（必填，确保正确的中文文件名）
 * @returns {Promise<void>}
 */
export async function downloadFromMinIO(url, filename) {
  if (!filename) {
    throw new Error('文件名不能为空')
  }
  
  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`)
    }
    
    const blob = await response.blob()

    const downloadFilename = filename
    
    // 创建下载链接
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = downloadFilename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()

    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    }, 100)
    
    console.log(`✅ 文件下载成功: ${downloadFilename}`)
  } catch (error) {
    console.error('文件下载失败:', error)
    throw error
  }
}

/**
 * 从 MinIO URL 获取文件内容（用于预览）
 * @param {string} url - MinIO 公开访问 URL
 * @returns {Promise<string>} 文件内容
 */
export async function fetchFromMinIO(url) {
  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`获取文件失败: ${response.status}`)
    }
    
    return await response.text()
  } catch (error) {
    console.error('获取 MinIO 文件失败:', error)
    throw error
  }
}

/**
 * 从 MinIO URL 获取二进制内容
 * @param {string} url - MinIO 公开访问 URL
 * @returns {Promise<Blob>} 文件 Blob
 */
export async function fetchBlobFromMinIO(url) {
  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`获取文件失败: ${response.status}`)
    }
    
    return await response.blob()
  } catch (error) {
    console.error('获取 MinIO 文件失败:', error)
    throw error
  }
}

/**
 * 删除 MinIO 中的文件
 * @param {string} url - MinIO 公开访问 URL
 * @returns {Promise<boolean>}
 */
export async function deleteFromMinIO(url) {
  try {
    const urlParts = url.split('/')
    const bucketIndex = urlParts.findIndex(part => part === 'zeabur')
    
    if (bucketIndex === -1) {
      throw new Error('无法从 URL 中提取 objectName')
    }
    const objectName = urlParts.slice(bucketIndex + 1).join('/').split('?')[0]
    
    const response = await uploadService.delete('/api/minio/delete', {
      data: { objectName }
    })
    
    if (response.success) {
      console.log(`✅ MinIO 文件删除成功: ${objectName}`)
      return true
    } else {
      throw new Error(response.error || '删除失败')
    }
  } catch (error) {
    console.error('MinIO 文件删除失败:', error)
    throw error
  }
}

/**
 * 验证文件类型
 * @param {File} file - 文件对象
 * @param {string[]} allowedTypes - 允许的文件类型数组
 * @returns {boolean}
 */
export function validateFileType(file, allowedTypes) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  return allowedTypes.includes(ext)
}

/**
 * 验证文件大小
 * @param {File} file - 文件对象
 * @param {number} maxSizeMB - 最大文件大小（MB）
 * @returns {boolean}
 */
export function validateFileSize(file, maxSizeMB = 10) {
  return file.size <= maxSizeMB * 1024 * 1024
}

/**
 * 初始化 MinIO Bucket（首次使用调用）
 */
export async function initializeMinIO() {
  try {
    const response = await axios.get(`${BASE_URL}/api/minio/init`, {
      headers: { 'x-user-id': 'default_user' },
      timeout: 30000,
    })
    return response.data
  } catch (error) {
    console.error('MinIO 初始化失败:', error)
    throw error
  }
}

export default {
  uploadFile,
  uploadFiles,
  downloadFromMinIO,
  fetchFromMinIO,
  fetchBlobFromMinIO,
  deleteFromMinIO,
  validateFileType,
  validateFileSize,
  initializeMinIO,
}
