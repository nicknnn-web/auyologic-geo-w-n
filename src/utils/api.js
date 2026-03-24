import axios from 'axios'

// API 服务层 - 对接后端 Express API
const BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截：附加用户ID
api.interceptors.request.use(config => {
  const userId = localStorage.getItem('auyologic_user_id') || 'default_user'
  config.headers['x-user-id'] = userId
  return config
})

// 响应拦截：统一错误处理
api.interceptors.response.use(
  response => response.data,
  error => {
    const msg = error.response?.data?.error || error.message || '请求失败'
    console.error('API Error:', msg)
    throw new Error(msg)
  }
)

// ========== 通用 CRUD ==========
const createAPI = (path) => ({
  list: () => api.get(`/${path}`),
  get: (id) => api.get(`/${path}/${id}`),
  create: (data) => api.post(`/${path}`, data),
  update: (id, data) => api.put(`/${path}/${id}`, data),
  delete: (id) => api.delete(`/${path}/${id}`),
})

// ========== 各模块 API ==========
export const keywordsAPI = createAPI('keywords')
export const questionsAPI = createAPI('questions')
export const knowledgeAPI = createAPI('knowledge')
export const imagesAPI = createAPI('images')
export const commandsAPI = createAPI('instruction-templates')
export const draftsAPI = createAPI('drafts')
export const mediaAccountsAPI = createAPI('media_accounts')
export const publishTasksAPI = createAPI('publish_tasks')

// ========== 特殊 API ==========

// 用户设置
export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
}

// 文件上传
export const uploadAPI = {
  upload: (file, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    })
  },
}

// AI 生成
export const aiAPI = {
  generate: (prompt) => api.post('/ai/generate', { prompt, type: 'content' }),
}

// GEO 检测
export const geoDetectionAPI = {
  detect: (keywords, platforms) => api.post('/geo-detection/detect', { keywords, platforms }),
  saveReport: (data) => api.post('/geo-reports', data),
  getReports: () => api.get('/geo-reports'),
}

// 网站优化
export const websiteOptimizationAPI = {
  analyze: (url) => api.post('/website-optimization/analyze', { url }),
  saveReport: (data) => api.post('/website-optimization', data),
  getHistory: () => api.get('/website-optimization'),
}

export default api
