// localStorage → 后端 API 迁移脚本
// 作用：将旧 localStorage 里的业务数据迁移到后端 API，然后清除本地业务数据
// 仅保留 UI 偏好（侧栏状态等）
// 调用方式：在 App.vue onMounted 里调用一次 migrateLocalStorage()
// 迁移完成后会设置 localStorage['__migrated'] = 'true'，防止重复执行

import { getToken, getCurrentUserId } from './auth.js'
import {
  adminStorageKey,
  ADMIN_USER_ID,
  LEGACY_GLOBAL_KEY,
} from './userStorage.js'
import {
  migrateLegacyGlobalStorageToAdmin,
  syncAdminScopedStorageToBackend,
} from './migrateLegacyUserStorage.js'

const API_BASE = window.VITE_API_URL || window.location.origin

/** 旧版中文类型 → 英文 key（与后端 sys_dict 一致） */
const LEGACY_KEYWORD_TYPE = {
  品牌: '01',
  产品: '02',
  场景: '03',
  企业: '04',
  brand: '01',
  product: '02',
  scene: '03',
  enterprise: '04'
}

function normalizeKeywordType(val, fallback) {
  if (!val) return fallback
  const s = String(val).trim()
  return LEGACY_KEYWORD_TYPE[s] || s || fallback
}

/** 旧版中文审核状态 → data_key（与 sys_dict question_status 一致） */
const LEGACY_QUESTION_STATUS = {
  待审核: 'pending',
  已审核: 'approved',
  已拒绝: 'rejected',
}

function normalizeQuestionStatus(val) {
  if (val == null || val === '') return 'pending'
  const s = String(val).trim()
  return LEGACY_QUESTION_STATUS[s] || s
}

async function migrateLocalStorage() {
  // 全局 localStorage → admin 隔离键（无需登录）
  migrateLegacyGlobalStorageToAdmin()

  const token = getToken()
  if (!token) {
    return
  }

  if (localStorage.getItem('__migrated') === 'true') {
    await syncAdminScopedStorageToBackend()
    return
  }

  // 仅 admin 可读 admin 隔离键；其他用户不得把 admin 本地缓存写入自己账号
  const raw =
    localStorage.getItem(LEGACY_GLOBAL_KEY) ||
    (getCurrentUserId() === ADMIN_USER_ID ? localStorage.getItem(adminStorageKey()) : null)
  if (!raw) {
    localStorage.setItem('__migrated', 'true')
    await syncAdminScopedStorageToBackend()
    return
  }

  let data
  try {
    data = JSON.parse(raw)
  } catch {
    localStorage.setItem('__migrated', 'true')
    await syncAdminScopedStorageToBackend()
    return
  }
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

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
            type: normalizeKeywordType(
              typeof kw === 'string' ? '' : kw.type,
              '01'
            ),
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
            keywordType: normalizeKeywordType(
              q.keywordType || q.type,
              '03'
            ),
            sourceKeyword: q.sourceKeyword || q.source || '-',
            status: normalizeQuestionStatus(q.status)
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

  // 清除已迁移的业务字段，保留 GEO 相关缓存供 admin 隔离键使用
  const geoKeep = {
    'website-reports': data['website-reports'],
    'geo-report': data['geo-report'],
    'geo-detection-result': data['geo-detection-result'],
    'geo-detection-details': data['geo-detection-details'],
    'geo-detection-history': data['geo-detection-history'],
    'geo-full-report': data['geo-full-report'],
    'dashboard-site-score': data['dashboard-site-score'],
    'geo-custom-keywords': data['geo-custom-keywords'],
    'enterprise-settings': data['enterprise-settings'],
  }
  const adminKey = adminStorageKey()
  let adminData = {}
  try {
    adminData = JSON.parse(localStorage.getItem(adminKey) || '{}')
  } catch {
    adminData = {}
  }
  for (const [k, v] of Object.entries(geoKeep)) {
    if (v != null && (Array.isArray(v) ? v.length : true)) adminData[k] = v
  }
  localStorage.setItem(adminKey, JSON.stringify(adminData))
  localStorage.removeItem(LEGACY_GLOBAL_KEY)

  localStorage.setItem('__migrated', 'true')
  await syncAdminScopedStorageToBackend()
  console.log('[迁移] 完成！旧 localStorage 业务数据已清除并归属 admin')
}

export default migrateLocalStorage
