/**
 * 按登录用户隔离的 localStorage 读写（避免切换账号后读到上一用户缓存）
 */
import { getCurrentUserId } from './auth.js'

export const LEGACY_GLOBAL_KEY = 'auyologic_data'
/** 历史数据与 setup-admin 脚本对齐的管理员 user_id */
export const ADMIN_USER_ID = 'default_user'

const LEGACY_KEY = LEGACY_GLOBAL_KEY

export function adminStorageKey() {
  return `${LEGACY_KEY}:${ADMIN_USER_ID}`
}

function storageKey() {
  const uid = getCurrentUserId()
  return uid ? `${LEGACY_KEY}:${uid}` : LEGACY_KEY
}

export function getUserLocalData() {
  try {
    const raw = localStorage.getItem(storageKey())
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function setUserLocalData(data) {
  localStorage.setItem(storageKey(), JSON.stringify(data || {}))
}

/** 浅合并 patch 到当前用户数据 */
export function patchUserLocalData(patch) {
  const prev = getUserLocalData()
  const next = { ...prev, ...patch }
  setUserLocalData(next)
  return next
}

/** 读取某个命名空间下的对象，如 geo-detection-details */
export function getUserLocalBucket(bucketKey) {
  const all = getUserLocalData()
  const bucket = all[bucketKey]
  return bucket && typeof bucket === 'object' ? bucket : {}
}

export function setUserLocalBucket(bucketKey, bucket) {
  patchUserLocalData({ [bucketKey]: bucket })
}
