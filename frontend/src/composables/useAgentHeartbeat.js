import { onMounted, onUnmounted } from 'vue'
import api from '../utils/api'
import { getToken, AUTH_CHANGE_EVENT } from '../utils/auth.js'

const STATUS_REQUEST_TIMEOUT_MS = 2500
const POLL_VISIBLE_MS = 3000
const POLL_HIDDEN_MS = 12000

/**
 * 本地代理在线状态：短间隔轮询 + 短超时，标签可见时更灵敏
 */
export function useAgentHeartbeat(agentOnlineRef) {
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
      agentOnlineRef.value = data.online === true
    } catch {
      agentOnlineRef.value = false
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      void check()
      schedulePoll()
    } else {
      schedulePoll()
    }
  }

  const onBrowserOnline = () => {
    void check()
  }

  const onBrowserOffline = () => {
    agentOnlineRef.value = false
  }

  let timer = null

  const schedulePoll = () => {
    if (timer) clearInterval(timer)
    const ms = document.visibilityState === 'visible' ? POLL_VISIBLE_MS : POLL_HIDDEN_MS
    timer = setInterval(check, ms)
  }

  const onAuthChange = () => {
    if (!getToken()) {
      agentOnlineRef.value = false
      if (timer) clearInterval(timer)
      timer = null
      return
    }
    void check()
    schedulePoll()
  }

  onMounted(async () => {
    if (!getToken()) return
    await check()
    schedulePoll()
    window.addEventListener('pageshow', check)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', check)
    window.addEventListener('online', onBrowserOnline)
    window.addEventListener('offline', onBrowserOffline)
    window.addEventListener(AUTH_CHANGE_EVENT, onAuthChange)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
    window.removeEventListener('pageshow', check)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', check)
    window.removeEventListener('online', onBrowserOnline)
    window.removeEventListener('offline', onBrowserOffline)
    window.removeEventListener(AUTH_CHANGE_EVENT, onAuthChange)
  })

  return { checkAgentStatus: check }
}
