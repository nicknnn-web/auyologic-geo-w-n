/**
 * 前端统一认证工具
 * - token 存在 localStorage 的 auyologic_token
 * - user 信息（userId、username）存在 auyologic_auth_user（JSON）
 * 所有模块需要 userId / token 时统一从这里取，不再硬编码 default_user
 */

const TOKEN_KEY = 'auyologic_token'
const USER_KEY = 'auyologic_auth_user'
const REMEMBER_KEY = 'auyologic_remember'
const AUTH_CHANGE_EVENT = 'auyologic-auth-change'

/** 主动退出登录过程中为 true，避免 401 误弹「未登录」类提示 */
let loggingOut = false

function notifyAuthChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
  }
}

export { AUTH_CHANGE_EVENT }

/**
 * 解析 JWT payload（不校验签名，仅前端展示用）
 */
function parseJwtPayload(token) {
  try {
    const base64 = token.split('.')[1]
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * 保存登录信息
 */
export function saveAuth({ token, user, remember = true }) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, 'true')
  }
  notifyAuthChange()
}

/**
 * 清除登录信息（退出登录）
 */
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(REMEMBER_KEY)
  // 清除 API 缓存，防止用户切换时读到旧缓存
  localStorage.removeItem('auyologic_api_cache')
  notifyAuthChange()
}

/**
 * 获取当前 token，不存在或已过期返回 null
 */
export function getToken() {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return null

  // 检查过期
  const payload = parseJwtPayload(token)
  if (!payload) return null
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    clearAuth()
    return null
  }
  return token
}

/**
 * 获取当前登录的 user_id
 * 优先从 token payload 解析，fallback 读 localStorage 的 user 对象
 * 未登录时返回 null
 */
export function getCurrentUserId() {
  const token = getToken()
  if (!token) return null

  const payload = parseJwtPayload(token)
  if (payload?.userId) return payload.userId

  // fallback: 从保存的 user 对象读
  try {
    const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    return user?.userId || null
  } catch {
    return null
  }
}

/**
 * 获取当前登录用户的展示信息
 */
export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

/**
 * 是否已登录（token 存在且未过期）
 */
export function isLoggedIn() {
  return !!getToken()
}

export function beginLogout() {
  loggingOut = true
}

export function endLogout() {
  loggingOut = false
}

export function isLoggingOut() {
  return loggingOut
}

/** 401 / 退出登录后的 API 失败不必再 toast */
export function shouldSuppressApiError(err) {
  if (loggingOut) return true
  if (err?.code === 'UNAUTHORIZED') return true
  if (!getToken()) return true
  return false
}

/** 带 Bearer 的 fetch 请求头；json=true 时附加 Content-Type */
export function authHeaders(json = false, extra = {}) {
  const h = { ...extra }
  const token = getToken()
  if (token) h.Authorization = `Bearer ${token}`
  if (json) h['Content-Type'] = 'application/json'
  return h
}

export function authJsonHeaders(extra = {}) {
  return authHeaders(true, extra)
}
