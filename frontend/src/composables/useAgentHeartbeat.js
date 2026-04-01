import { onMounted, onUnmounted } from 'vue'
import api from '../utils/api'

/**
 * 本地代理在线状态：进入页面立即检测，定时轮询，并在刷新/切回标签/窗口聚焦时重检
 */
export function useAgentHeartbeat(agentOnlineRef, intervalMs = 15000) {
  const check = async () => {
    try {
      const data = await api.get('/api/agent/status')
      agentOnlineRef.value = data.online === true
    } catch {
      agentOnlineRef.value = false
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') void check()
  }

  let timer = null

  onMounted(async () => {
    await check()
    timer = setInterval(check, intervalMs)
    window.addEventListener('pageshow', check)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', check)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
    window.removeEventListener('pageshow', check)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', check)
  })

  return { checkAgentStatus: check }
}
