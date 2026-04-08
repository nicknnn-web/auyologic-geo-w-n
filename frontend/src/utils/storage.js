// 数据存储工具
// 职责：仅存储 UI 偏好（侧栏状态、分页、筛选条件等）
// 所有业务数据统一走后端 API，不再使用 localStorage

const UI_STATE_KEY = 'auyologic_ui_state'

// ========== UI 偏好（纯本地，不走 API）==========

export const getUIState = (key, defaultValue = null) => {
  try {
    const data = localStorage.getItem(UI_STATE_KEY)
    if (!data) return defaultValue
    const parsed = JSON.parse(data)
    return parsed[key] !== undefined ? parsed[key] : defaultValue
  } catch {
    return defaultValue
  }
}

export const setUIState = (key, value) => {
  try {
    const data = localStorage.getItem(UI_STATE_KEY)
    const parsed = data ? JSON.parse(data) : {}
    parsed[key] = value
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(parsed))
  } catch {
    // ignore
  }
}

export const removeUIState = (key) => {
  try {
    const data = localStorage.getItem(UI_STATE_KEY)
    if (!data) return
    const parsed = JSON.parse(data)
    delete parsed[key]
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(parsed))
  } catch {
    // ignore
  }
}

// ========== API 缓存（可选，用于减少网络请求）==========

const API_CACHE_KEY = 'auyologic_api_cache'

export const getCache = (key, ttl = 5 * 60 * 1000) => {
  try {
    const data = localStorage.getItem(API_CACHE_KEY)
    if (!data) return null
    const parsed = JSON.parse(data)
    const cached = parsed[key]
    if (!cached) return null
    const age = Date.now() - cached.timestamp
    if (age > ttl) {
      // 过期，删除
      delete parsed[key]
      localStorage.setItem(API_CACHE_KEY, JSON.stringify(parsed))
      return null
    }
    return cached.data
  } catch {
    return null
  }
}

export const setCache = (key, data) => {
  try {
    const raw = localStorage.getItem(API_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    parsed[key] = { data, timestamp: Date.now() }
    localStorage.setItem(API_CACHE_KEY, JSON.stringify(parsed))
  } catch {
    // ignore
  }
}

export const invalidateCache = (key) => {
  try {
    if (!key) {
      localStorage.removeItem(API_CACHE_KEY)
      return
    }
    const data = localStorage.getItem(API_CACHE_KEY)
    if (!data) return
    const parsed = JSON.parse(data)
    delete parsed[key]
    localStorage.setItem(API_CACHE_KEY, JSON.stringify(parsed))
  } catch {
    // ignore
  }
}

export const clearAllUIState = () => {
  localStorage.removeItem(UI_STATE_KEY)
}
