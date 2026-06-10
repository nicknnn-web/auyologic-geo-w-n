import axios from 'axios'
import { unwrapListPayload } from './pagedApi.js'
import { getToken, clearAuth, authJsonHeaders } from './auth.js'

// API 服务层 - 直接连接后端（Zeabur 环境下）test
const BASE_URL = window.VITE_API_URL || window.location.origin

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截：附加登录 token
api.interceptors.request.use(config => {
  const token = getToken()
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// 响应拦截：统一错误处理；401 时清缓存并跳转登录页
api.interceptors.response.use(
  response => response.data,
  error => {
    if (error.response?.status === 401) {
      clearAuth()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    const msg = error.response?.data?.error || error.message || '请求失败'
    console.error('API Error:', msg)
    throw new Error(msg)
  }
)

// ========== 通用 CRUD ==========
const createAPI = (path) => ({
  /** @param {Record<string, string|number>} [params] 查询参数，含 page、pageSize 等 */
  list: (params = {}) =>
    api.get(`/api/${path}`, { params }).then((data) => unwrapListPayload(data)),
  get: (id) => api.get(`/api/${path}/${id}`),
  create: (data) => api.post(`/api/${path}`, data),
  update: (id, data) => api.put(`/api/${path}/${id}`, data),
  delete: (id) => api.delete(`/api/${path}/${id}`),
})

// ========== 各模块 API ==========
export const keywordsAPI = createAPI('keywords')
export const questionsAPI = createAPI('questions')
const knowledgeBase = createAPI('knowledge')
/** 企业知识库：含 PDF/Word 正文抽取；list 支持 folderId、q */
export const knowledgeAPI = {
  ...knowledgeBase,
  list: (params = {}) =>
    api.get('/api/knowledge', { params }).then((data) => unwrapListPayload(data)),
  extractText: (id) =>
    api.post(`/api/knowledge/${encodeURIComponent(String(id))}/extract-text`, {}, { timeout: 120000 }),
}

/** 知识库文件夹 */
export const knowledgeFolderAPI = {
  tree: () => api.get('/api/knowledge-folders/tree'),
  create: (data) => api.post('/api/knowledge-folders', data),
  update: (id, data) => api.put(`/api/knowledge-folders/${id}`, data),
  delete: (id) => api.delete(`/api/knowledge-folders/${id}`),
}
export const imagesAPI = createAPI('images')
export const commandsAPI = createAPI('instruction-templates')
export const draftsAPI = createAPI('drafts')

/** 草稿箱文件夹 */
export const draftFolderAPI = {
  tree: () => api.get('/api/draft-folders/tree'),
  create: (data) => api.post('/api/draft-folders', data),
  update: (id, data) => api.put(`/api/draft-folders/${id}`, data),
  delete: (id) => api.delete(`/api/draft-folders/${id}`),
}
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

// AI 生成（走后端 /api/ai/generate，密钥来自「大模型接入」）
export const aiAPI = {
  generate: (body) => api.post('/ai/generate', body),
}

/**
 * 原生 fetch 调用 AI 代理（供未接入 axios 的页面使用）
 * @param {Record<string, unknown>} body prompt / temperature / max_tokens / systemPrompt / connectionId 等
 * @returns {Promise<{ content: string, vendorName?: string, model?: string }>}
 */
export async function callAiGenerate(body) {
  if (!getToken()) {
    throw new Error('未登录或登录已过期，请重新登录')
  }
  const res = await fetch(`${BASE_URL}/api/ai/generate`, {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify(body || {}),
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  if (!res.ok) {
    const err =
      (typeof data.error === 'string' && data.error) ||
      data.error?.message ||
      data.message ||
      `API请求失败: ${res.status}`
    throw new Error(err)
  }
  return data
}

export default api
