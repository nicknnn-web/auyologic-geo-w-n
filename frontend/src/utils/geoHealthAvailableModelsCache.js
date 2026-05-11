/**
 * 品牌体检「选择探针模型」弹窗：可用连接列表的 session 缓存。
 * 在「大模型接入」增删改 / 测连 / Logo 变更后须调用 invalidate，避免列表过期。
 */

export const GEO_HEALTH_MODELS_CACHE_TTL_MS = 3 * 60 * 1000

export function geoHealthAvailableModelsCacheKey(userId = 'default_user') {
  const uid = String(userId || 'default_user').trim() || 'default_user'
  return `geo_health_available_models_v1_${uid}`
}

export function readGeoHealthAvailableModelsCache(
  userId = 'default_user',
  ttlMs = GEO_HEALTH_MODELS_CACHE_TTL_MS
) {
  try {
    const key = geoHealthAvailableModelsCacheKey(userId)
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || typeof o.ts !== 'number' || !Array.isArray(o.list)) return null
    if (Date.now() - o.ts > ttlMs) return null
    return o
  } catch {
    return null
  }
}

export function writeGeoHealthAvailableModelsCache(list, userId = 'default_user') {
  try {
    sessionStorage.setItem(
      geoHealthAvailableModelsCacheKey(userId),
      JSON.stringify({ ts: Date.now(), list })
    )
  } catch {
    /* quota / 隐私模式 */
  }
}

export function invalidateGeoHealthAvailableModelsCache(userId = 'default_user') {
  try {
    sessionStorage.removeItem(geoHealthAvailableModelsCacheKey(userId))
  } catch {
    /* ignore */
  }
}
