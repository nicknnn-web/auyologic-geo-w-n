import { onMounted, onUnmounted } from 'vue'
import api from '../utils/api'
import { getToken, AUTH_CHANGE_EVENT } from '../utils/auth.js'

const STATUS_REQUEST_TIMEOUT_MS = 2500
const POLL_VISIBLE_MS = 2000
const POLL_HIDDEN_MS = 8000

function applyStatusPayload(agentOnlineRef, data) {
  agentOnlineRef.value = data?.online === true
}

/**
 * 本地代理在线状态：SSE 即时推送 + 轮询兜底（按当前登录用户查库）
 */
export function useAgentHeartbeat(agentOnlineRef) {
  let timer = null
  let eventSource = null
  let sseRetryTimer = null

  const apiBase = () => window.VITE_API_URL || window.location.origin

  const check = async () => {
    if (!getToken()) {
      agentOnlineRef.value = false
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      agentOnlineRef.value = false
      return
    }
    try {
      const data = await api.get('/api/agent/status', { timeout: STATUS_REQUEST_TIMEOUT_MS })
      applyStatusPayload(agentOnlineRef, data)
    } catch {
      agentOnlineRef.value = false
    }
  }

  const closeSse = () => {
    if (sseRetryTimer) {
      clearTimeout(sseRetryTimer)
      sseRetryTimer = null
    }
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  }

  const connectSse = () => {
    closeSse()
    const token = getToken()
    if (!token) return

    const url = `${apiBase()}/api/agent/status/stream?token=${encodeURIComponent(token)}`
    try {
      eventSource = new EventSource(url)
      eventSource.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          applyStatusPayload(agentOnlineRef, data)
        } catch {
          /* ignore */
        }
      }
      eventSource.onerror = () => {
        closeSse()
        sseRetryTimer = setTimeout(connectSse, 5000)
      }
    } catch {
      /* EventSource 不可用则仅依赖轮询 */
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      void check()
      connectSse()
    }
    schedulePoll()
  }

  const onBrowserOnline = () => {
    void check()
    connectSse()
  }

  const onBrowserOffline = () => {
    agentOnlineRef.value = false
    closeSse()
  }

  const schedulePoll = () => {
    if (timer) clearInterval(timer)
    const ms = document.visibilityState === 'visible' ? POLL_VISIBLE_MS : POLL_HIDDEN_MS
    timer = setInterval(check, ms)
  }

  const onAuthChange = () => {
    if (!getToken()) {
      agentOnlineRef.value = false
      closeSse()
      if (timer) clearInterval(timer)
      timer = null
      return
    }
    void check()
    connectSse()
    schedulePoll()
  }

  const teardown = () => {
    if (timer) clearInterval(timer)
    timer = null
    closeSse()
    window.removeEventListener('pageshow', check)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', check)
    window.removeEventListener('online', onBrowserOnline)
    window.removeEventListener('offline', onBrowserOffline)
    window.removeEventListener(AUTH_CHANGE_EVENT, onAuthChange)
  }

  onMounted(async () => {
    if (!getToken()) return
    await check()
    connectSse()
    schedulePoll()
    window.addEventListener('pageshow', check)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', check)
    window.addEventListener('online', onBrowserOnline)
    window.addEventListener('offline', onBrowserOffline)
    window.addEventListener(AUTH_CHANGE_EVENT, onAuthChange)
  })

  onUnmounted(teardown)

  return { checkAgentStatus: check }
}
