import axios from 'axios'

// API 服务层 - 直接连接后端（Zeabur 环境下）test
const BASE_URL = import.meta.env.VITE_API_URL || 'https://auyologic.zeabur.app'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截：附加用户ID
api.interceptors.request.use(config => {
  // 单用户模式：固定使用 default_user
  config.headers['x-user-id'] = 'default_user'
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
  list: () => api.get(`/api/${path}`),
  get: (id) => api.get(`/api/${path}/${id}`),
  create: (data) => api.post(`/api/${path}`, data),
  update: (id, data) => api.put(`/api/${path}/${id}`, data),
  delete: (id) => api.delete(`/api/${path}/${id}`),
})

// ========== 各模块 API ==========
export const keywordsAPI = createAPI('keywords')
export const questionsAPI = createAPI('questions')
export const knowledgeAPI = createAPI('knowledge')
export const imagesAPI = createAPI('images')
export const commandsAPI = createAPI('instruction-templates')
export const draftsAPI = createAPI('drafts')
export const historyAPI = createAPI('history')
export const mediaAccountsAPI = createAPI('platform-accounts')
export const publishTasksAPI = createAPI('publish-tasks')
export const publishRecordsAPI = createAPI('publish-records')

// ========== 特殊 API ==========

// 用户设置
export const settingsAPI = {
  get: () => api.get('/api/settings'),
  update: (data) => api.put('/api/settings', data),
}

// 文件上传
export const uploadAPI = {
  upload: (file, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/documents/upload', formData, {
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

export default api
