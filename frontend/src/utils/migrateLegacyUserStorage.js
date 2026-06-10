/**
 * 将旧版全局 localStorage（auyologic_data）迁移到 admin 账号（default_user）隔离空间，
 * 并在 admin 登录后把 GEO / 网站优化相关缓存同步到后端 API。
 */
import { getToken, getCurrentUserId } from './auth.js'
import { ADMIN_USER_ID, adminStorageKey, LEGACY_GLOBAL_KEY } from './userStorage.js'

const API_BASE = window.VITE_API_URL || window.location.origin
const LOCAL_MIGRATED_FLAG = '__legacy_global_storage_migrated_v1'
const BACKEND_SYNCED_FLAG = '__admin_scoped_backend_synced_v1'

function authHeaders(json = false) {
  const h = { Authorization: `Bearer ${getToken()}` }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key, data) {
  localStorage.setItem(key, JSON.stringify(data || {}))
}

/** 合并全局遗留数据到 admin 用户隔离键 */
function mergeScopedData(existing, legacy) {
  const merged = { ...legacy, ...existing }

  const mergeReports = (a = [], b = []) => {
    const map = new Map()
    for (const r of [...a, ...b]) {
      if (!r || typeof r !== 'object') continue
      const key = String(r.url || r.id || '').trim().toLowerCase()
      if (!key) continue
      const prev = map.get(key)
      const t = r.checkedAt ? new Date(r.checkedAt).getTime() : 0
      const pt = prev?.checkedAt ? new Date(prev.checkedAt).getTime() : 0
      if (!prev || t >= pt) map.set(key, r)
    }
    return [...map.values()].sort(
      (x, y) => new Date(y.checkedAt || 0) - new Date(x.checkedAt || 0)
    )
  }

  merged['website-reports'] = mergeReports(
    legacy['website-reports'],
    existing['website-reports']
  )

  const details = {
    ...(legacy['geo-detection-details'] || {}),
    ...(existing['geo-detection-details'] || {}),
  }
  for (const h of legacy['geo-detection-history'] || []) {
    if (!h || h.id == null) continue
    const k = String(h.id)
    details[k] = { ...(details[k] || {}), ...h }
  }
  if (Object.keys(details).length) merged['geo-detection-details'] = details
  delete merged['geo-detection-history']

  const legacyGeo = legacy['geo-report']
  const existingGeo = existing['geo-report']
  if (legacyGeo && existingGeo) {
    const lt = legacyGeo.generatedAt ? new Date(legacyGeo.generatedAt).getTime() : 0
    const et = existingGeo.generatedAt ? new Date(existingGeo.generatedAt).getTime() : 0
    merged['geo-report'] = lt >= et ? legacyGeo : existingGeo
  } else {
    merged['geo-report'] = existingGeo || legacyGeo || undefined
  }

  const legacyDash = legacy['dashboard-site-score']
  const existingDash = existing['dashboard-site-score']
  if (legacyDash && existingDash) {
    const lt = legacyDash.updatedAt ? new Date(legacyDash.updatedAt).getTime() : 0
    const et = existingDash.updatedAt ? new Date(existingDash.updatedAt).getTime() : 0
    merged['dashboard-site-score'] = lt >= et ? legacyDash : existingDash
  }

  const legacyKws = legacy['geo-custom-keywords'] || []
  const existingKws = existing['geo-custom-keywords'] || []
  if (legacyKws.length || existingKws.length) {
    merged['geo-custom-keywords'] = [...new Set([...legacyKws, ...existingKws])]
  }

  return merged
}

/**
 * 本地：全局 auyologic_data → auyologic_data:default_user
 * 无需登录，应用启动时执行一次
 */
export function migrateLegacyGlobalStorageToAdmin() {
  if (localStorage.getItem(LOCAL_MIGRATED_FLAG) === 'true') {
    return false
  }

  const legacy = readJson(LEGACY_GLOBAL_KEY)
  if (!legacy || typeof legacy !== 'object') {
    localStorage.setItem(LOCAL_MIGRATED_FLAG, 'true')
    return false
  }

  const adminKey = adminStorageKey()
  const existing = readJson(adminKey) || {}
  const merged = mergeScopedData(existing, legacy)
  writeJson(adminKey, merged)
  localStorage.removeItem(LEGACY_GLOBAL_KEY)
  localStorage.setItem(LOCAL_MIGRATED_FLAG, 'true')
  console.log('[迁移] 全局 localStorage 已归属 admin（default_user）')
  return true
}

async function syncWebsiteReports(headers, reports) {
  if (!Array.isArray(reports) || !reports.length) return

  let existing = []
  try {
    const res = await fetch(`${API_BASE}/api/website-reports`, { headers })
    if (res.ok) existing = await res.json()
  } catch (e) {
    console.warn('[迁移] 读取网站报告失败:', e)
    return
  }

  const byUrl = new Map(
    (Array.isArray(existing) ? existing : []).map((r) => [String(r.url || '').toLowerCase(), r])
  )

  for (const r of reports) {
    const url = String(r.url || '').trim()
    if (!url) continue
    const body = {
      url,
      score: r.score ?? r.overallScore ?? 0,
      items: r.items ?? {},
      issues: r.issues ?? { warn: [], pass: [] },
      details: r.details ?? [],
      checkedAt: r.checkedAt,
      famousSiteBonus: r.famousSiteBonus ?? null,
    }
    const hit = byUrl.get(url.toLowerCase())
    try {
      if (hit?.id) {
        await fetch(`${API_BASE}/api/website-reports/${hit.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
        })
      } else {
        const res = await fetch(`${API_BASE}/api/website-reports`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const row = await res.json()
          if (row?.id) byUrl.set(url.toLowerCase(), row)
        }
      }
    } catch (e) {
      console.warn('[迁移] 网站报告同步失败:', url, e)
    }
  }
}

async function syncGeoDetectionDetails(headers, detailsMap) {
  if (!detailsMap || typeof detailsMap !== 'object') return

  const entries = Object.values(detailsMap).filter((x) => x && typeof x === 'object')
  if (!entries.length) return

  const nextDetails = { ...detailsMap }
  for (const record of entries) {
    try {
      const res = await fetch(`${API_BASE}/api/geo-reports`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          keyword: record.platformNames?.join(',') || '',
          overallScore: record.overallScore ?? 0,
          overallGrade: record.overallGrade || 'D',
          visibleCount: record.visibleCount ?? 0,
          missingCount: record.missingCount ?? 0,
          platformData: {
            platformCount: record.platformCount ?? 0,
            questionCount: record.questionCount ?? 0,
            platformNames: record.platformNames || [],
          },
        }),
      })
      if (!res.ok) continue
      const row = await res.json()
      const backendId = row?.id
      if (!backendId) continue
      const oldKey = String(record.id)
      if (oldKey !== String(backendId)) {
        delete nextDetails[oldKey]
      }
      nextDetails[String(backendId)] = { ...record, id: backendId }
    } catch (e) {
      console.warn('[迁移] GEO 检测历史同步失败:', e)
    }
  }

  const adminKey = adminStorageKey()
  const scoped = readJson(adminKey) || {}
  scoped['geo-detection-details'] = nextDetails
  writeJson(adminKey, scoped)
}

/** 若数据库无企业信息，从 admin 隔离 localStorage 同步到 users 表 */
async function syncEnterpriseSettings(headers) {
  let current = {}
  try {
    const res = await fetch(`${API_BASE}/api/settings`, { headers })
    if (res.ok) current = await res.json()
  } catch {
    return
  }

  if (String(current.company_name || '').trim()) return

  const scoped = readJson(adminStorageKey()) || {}
  const ent = scoped['enterprise-settings'] || {}
  const companyName = String(ent.name || ent.companyName || '').trim()
  const website = String(ent.website || '').trim()
  const industry = String(ent.industry || '').trim()
  const description = String(ent.description || '').trim()
  const targetAudience = String(ent.targetAudience || ent.target_audience || '').trim()
  if (!companyName && !website && !industry && !description && !targetAudience) return

  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        company_name: companyName,
        website,
        industry,
        description,
        target_audience: targetAudience,
      }),
    })
    if (res.ok) {
      console.log('[迁移] 企业信息已从 localStorage 同步到数据库')
    }
  } catch (e) {
    console.warn('[迁移] 企业信息同步失败:', e)
  }
}

async function syncGeoImprovementReport(headers, geoReport) {
  if (!geoReport || typeof geoReport !== 'object') return
  const scores = geoReport.scores || {}
  try {
    await fetch(`${API_BASE}/api/geo-improvement-report`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        websiteReportIds: geoReport.websiteReportIds || geoReport.recordId
          ? String(geoReport.recordId || '')
              .split(',')
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => Number.isFinite(n))
          : [],
        visibilityScore: scores.visibility ?? 0,
        techScore: scores.tech ?? 0,
        combinedScore: scores.combined ?? 0,
        reportData: geoReport,
        generatedAt: geoReport.generatedAt || new Date().toISOString(),
      }),
    })
  } catch (e) {
    console.warn('[迁移] GEO 改进方案同步失败:', e)
  }
}

/**
 * admin 登录后：将 admin 隔离缓存中的 GEO / 网站数据推送到后端
 */
export async function syncAdminScopedStorageToBackend() {
  if (getCurrentUserId() !== ADMIN_USER_ID) return
  if (!getToken()) return

  const headers = authHeaders(true)
  const scoped = readJson(adminStorageKey()) || {}

  // 库内无企业名时从 localStorage 补齐（不受 GEO 同步标记影响）
  await syncEnterpriseSettings(headers)

  if (localStorage.getItem(BACKEND_SYNCED_FLAG) === 'true') return

  await syncWebsiteReports(headers, scoped['website-reports'])
  await syncGeoDetectionDetails(headers, scoped['geo-detection-details'])
  if (scoped['geo-report']) {
    await syncGeoImprovementReport(headers, scoped['geo-report'])
  }

  localStorage.setItem(BACKEND_SYNCED_FLAG, 'true')
  console.log('[迁移] admin GEO/网站缓存已同步到后端')
}

/** 应用启动 + 登录后统一入口 */
export async function runLegacyUserStorageMigration() {
  migrateLegacyGlobalStorageToAdmin()
  await syncAdminScopedStorageToBackend()
}
