/**
 * 系统字典：GET /api/sys-dict?dictType=xxx
 * 返回 [{ dataKey, dataValue, sortOrder }, ...]
 */
import { unwrapListPayload, DEFAULT_PAGE_SIZE } from './pagedApi.js'

export function getApiBase() {
  return window.VITE_API_URL || window.location.origin
}

export async function fetchDictList(dictType) {
  if (!dictType) return []
  try {
    const res = await fetch(
      `${getApiBase()}/api/sys-dict?dictType=${encodeURIComponent(dictType)}`
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** 根据字典列表生成 key -> 展示文案 */
export function dictLabelMap(list) {
  const m = {}
  for (const row of list || []) {
    const k = row.dataKey ?? row.data_key
    const v = row.dataValue ?? row.data_value
    if (k) m[k] = v || k
  }
  return m
}

/**
 * 旧版中文 / 旧英文 data_key → 当前规范键 01–06（与 dict_type 组合唯一）
 * 规范：01 品牌 02 产品 03 场景 04 企业 05 对比 06 价格
 */
export const KEYWORD_TYPE_LEGACY_MAP = {
  品牌: '01',
  产品: '02',
  场景: '03',
  企业: '04',
  对比词: '05',
  价格词: '06',
  brand: '01',
  product: '02',
  scene: '03',
  enterprise: '04'
}

export function normalizeKeywordTypeKey(val) {
  if (val === undefined || val === null) return ''
  const s = String(val).trim()
  if (!s) return ''
  return KEYWORD_TYPE_LEGACY_MAP[s] ?? s
}

/** 按 sortOrder 排序后的 data_key 列表；无字典时退回 01–04 */
export function keywordTypeKeysOrdered(list) {
  const rows = [...(list || [])].sort(
    (a, b) => (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0)
  )
  const keys = rows.map((r) => r.dataKey ?? r.data_key).filter(Boolean)
  if (keys.length) return keys
  return ['01', '02', '03', '04', '05', '06']
}

/** 接口不可用时前端兜底（与 sys_dict keyword_type 一致） */
export const KEYWORD_TYPE_DEFAULT_OPTIONS = [
  { dataKey: '01', dataValue: '品牌词', sortOrder: 10 },
  { dataKey: '02', dataValue: '产品词', sortOrder: 20 },
  { dataKey: '03', dataValue: '场景词', sortOrder: 30 },
  { dataKey: '04', dataValue: '企业词', sortOrder: 40 },
  { dataKey: '05', dataValue: '对比词', sortOrder: 50 },
  { dataKey: '06', dataValue: '价格词', sortOrder: 60 },
]

/** dict_type（英文标识）→ 中文名称；字典管理筛选/表单/表格展示用，可与后端种子扩展 */
export const DICT_TYPE_LABEL_ZH = {
  keyword_type: '关键词类型',
}

/** 是否有预设中文名 */
export function hasDictTypeLabelZh(key) {
  if (key == null || String(key).trim() === '') return false
  return Object.prototype.hasOwnProperty.call(DICT_TYPE_LABEL_ZH, String(key).trim())
}

/** 返回中文名；无映射时返回空字符串（便于区分「仅 key」） */
export function dictTypeLabelZh(key) {
  if (key == null || String(key).trim() === '') return ''
  const k = String(key).trim()
  return DICT_TYPE_LABEL_ZH[k] ?? ''
}

/** 表格/详情：有映射为「中文（key）」，否则仅 key */
export function dictTypeCellDisplay(key) {
  if (key == null || String(key).trim() === '') return '-'
  const k = String(key).trim()
  const zh = dictTypeLabelZh(k)
  return zh ? `${zh}（${k}）` : k
}

/**
 * 管理端：字典类型列表（来自 sys_dict_type）
 * @returns {Promise<{ dictTypeKey: string, dictTypeValue: string }[]>}
 */
export async function fetchDictTypes() {
  try {
    const res = await fetch(`${getApiBase()}/api/sys-dict/types`)
    if (!res.ok) return []
    const data = await res.json()
    const types = data.types
    if (!Array.isArray(types) || types.length === 0) return []
    if (typeof types[0] === 'object' && types[0] !== null) {
      return types.map((t) => ({
        dictTypeKey: t.dictTypeKey ?? t.dict_type_key ?? '',
        dictTypeValue: t.dictTypeValue ?? t.dict_type_value ?? '',
      }))
    }
    if (typeof types[0] === 'string') {
      return types.map((key) => ({ dictTypeKey: key, dictTypeValue: key }))
    }
    return []
  } catch {
    return []
  }
}

/** 管理端：条目列表（服务端分页），dictType 为空则不按类型筛选 */
export async function fetchDictEntries(dictType, { page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  try {
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    })
    if (dictType != null && dictType !== '') qs.set('dictType', dictType)
    const res = await fetch(`${getApiBase()}/api/sys-dict/entries?${qs}`)
    if (!res.ok) return { list: [], total: 0, page: 1, pageSize }
    const data = await res.json()
    return unwrapListPayload(data)
  } catch {
    return { list: [], total: 0, page: 1, pageSize }
  }
}
