import { ElMessage } from 'element-plus'
import { getToken, clearAuth } from './auth.js'

/**
 * 下载本地代理 zip（须登录；window.open 无法带 Bearer，故用 fetch + blob）
 */
export async function downloadLocalAgent() {
  const token = getToken()
  if (!token) {
    ElMessage.warning('请先登录后再下载本地代理')
    return
  }

  const base = window.VITE_API_URL || window.location.origin
  try {
    const res = await fetch(`${base}/api/agent/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.status === 401) {
      clearAuth()
      ElMessage.error('登录已过期，请重新登录')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
      return
    }

    if (!res.ok) {
      let msg = `下载失败（${res.status}）`
      try {
        const data = await res.json()
        if (data?.error) msg = data.error
      } catch {
        /* zip 流或非 JSON */
      }
      ElMessage.error(msg)
      return
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'auyologic-local-agent.zip'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('[downloadLocalAgent]', e)
    ElMessage.error('下载失败，请检查网络或稍后重试')
  }
}
