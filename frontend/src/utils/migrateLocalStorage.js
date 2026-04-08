// localStorage → 后端 API 迁移脚本
// 作用：将旧 localStorage 里的业务数据迁移到后端 API，然后清除本地业务数据
// 仅保留 UI 偏好（侧栏状态等）
// 调用方式：在 App.vue onMounted 里调用一次 migrateLocalStorage()
// 迁移完成后会设置 localStorage['__migrated'] = 'true'，防止重复执行

const API_BASE = window.VITE_API_URL || window.location.origin

async function migrateLocalStorage() {
  if (localStorage.getItem('__migrated') === 'true') {
    console.log('[迁移] 已完成，跳过')
    return
  }

  const raw = localStorage.getItem('auyologic_data')
  if (!raw) {
    localStorage.setItem('__migrated', 'true')
    return
  }

  let data
  try {
    data = JSON.parse(raw)
  } catch {
    localStorage.setItem('__migrated', 'true')
    return
  }

  const userId = 'default_user'
  const headers = { 'Content-Type': 'application/json', 'x-user-id': userId }

  // 迁移关键词
  if (data.keywords && Array.isArray(data.keywords) && data.keywords.length > 0) {
    console.log(`[迁移] 准备迁移 ${data.keywords.length} 条关键词...`)
    for (const kw of data.keywords) {
      try {
        await fetch(`${API_BASE}/api/keywords`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            keyword: typeof kw === 'string' ? kw : kw.keyword,
            type: kw.type || '品牌',
            source: '迁移自localStorage'
          })
        })
      } catch (e) {
        console.warn('[迁移] 关键词迁移失败:', e)
      }
    }
  }

  // 迁移问题
  if (data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
    console.log(`[迁移] 准备迁移 ${data.questions.length} 条问题...`)
    for (const q of data.questions) {
      try {
        await fetch(`${API_BASE}/api/questions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            question: q.question || q.text || '',
            keywordType: q.keywordType || q.type || '场景',
            sourceKeyword: q.sourceKeyword || q.source || '-',
            status: q.status || '待审核'
          })
        })
      } catch (e) {
        console.warn('[迁移] 问题迁移失败:', e)
      }
    }
  }

  // 迁移草稿
  if (data.drafts && Array.isArray(data.drafts) && data.drafts.length > 0) {
    console.log(`[迁移] 准备迁移 ${data.drafts.length} 条草稿...`)
    for (const d of data.drafts) {
      try {
        await fetch(`${API_BASE}/api/drafts`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: d.title || '',
            brand: d.brand || '',
            content: d.content || '',
            audience: d.audience || '',
            platforms: d.platforms || [],
            status: d.status || '草稿'
          })
        })
      } catch (e) {
        console.warn('[迁移] 草稿迁移失败:', e)
      }
    }
  }

  // 标记迁移完成（保留 UI 状态，清除业务数据）
  const uiState = {
    sidebarCollapsed: data.sidebarCollapsed,
    // 其他 UI 偏好可以继续保留
  }
  localStorage.setItem('auyologic_ui_state', JSON.stringify(uiState))
  localStorage.removeItem('auyologic_data')
  localStorage.setItem('__migrated', 'true')
  console.log('[迁移] 完成！旧 localStorage 业务数据已清除')
}

export default migrateLocalStorage
