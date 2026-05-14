/**
 * 字典行映射工具：以接口返回为准，业务代码不写死具体字典项。
 * - 创作类型等：下拉存 data_key，展示用 labelByDataKey / toDataKeySelectOptions。
 * - 受众、投放平台：与历史/发帖链路一致，下拉存 data_value，见 toDataValueSelectOptions / resolveToDataValue。
 */
import { sortDictRows } from './sysDict.js'

export function normalizeDictRow(r) {
  if (!r || typeof r !== 'object') return null
  const dataKey = String(r.dataKey ?? r.data_key ?? '').trim()
  const dataValue = String(r.dataValue ?? r.data_value ?? '').trim()
  const sortOrder = Number(r.sortOrder ?? r.sort_order ?? 0)
  if (!dataKey && !dataValue) return null
  return { dataKey, dataValue, sortOrder }
}

export function normalizedDictRows(list) {
  return sortDictRows(list || [])
    .map(normalizeDictRow)
    .filter(Boolean)
}

/** 按 data_key 取展示文案 */
export function labelByDataKey(rows, dataKey) {
  const k = dataKey == null ? '' : String(dataKey).trim()
  if (!k) return ''
  const row = normalizedDictRows(rows).find((r) => r.dataKey === k)
  return row?.dataValue ?? ''
}

/** 按 data_value 反查 data_key */
export function dataKeyByValue(rows, dataValue) {
  const v = dataValue == null ? '' : String(dataValue).trim()
  if (!v) return ''
  const row = normalizedDictRows(rows).find((r) => r.dataValue === v)
  return row?.dataKey ?? ''
}

/**
 * 将接口里存的创作类型等字段规范为 data_key：
 * 若已是合法 key 则原样返回；否则尝试按 data_value 反查；再否则原样返回（兼容脏数据）。
 */
export function resolveToDataKey(rows, stored) {
  if (stored == null || String(stored).trim() === '') return ''
  const s = String(stored).trim()
  const list = normalizedDictRows(rows)
  if (list.some((r) => r.dataKey === s)) return s
  const byVal = list.find((r) => r.dataValue === s)
  return byVal?.dataKey ?? s
}

/** el-select：存/取 data_value（与历史数据、发帖代理等平台展示文案一致） */
export function toDataValueSelectOptions(rows) {
  return normalizedDictRows(rows).map((r) => ({
    value: r.dataValue,
    label: r.dataValue || r.dataKey,
  }))
}

/**
 * 将接口里存的值规范为当前字典的 data_value：
 * 若已是合法展示值则原样；若存的是 data_key 则换为对应 data_value。
 */
export function resolveToDataValue(rows, stored) {
  if (stored == null || String(stored).trim() === '') return ''
  const s = String(stored).trim()
  const list = normalizedDictRows(rows)
  const byVal = list.find((r) => r.dataValue === s)
  if (byVal) return byVal.dataValue
  const byKey = list.find((r) => r.dataKey === s)
  return byKey?.dataValue ?? s
}

/** el-select：value=dataKey, label=dataValue */
export function toDataKeySelectOptions(rows) {
  return normalizedDictRows(rows).map((r) => ({
    value: r.dataKey,
    label: r.dataValue || r.dataKey,
  }))
}

const EL_TAG_TYPES = ['primary', 'success', 'warning', 'info', 'danger']

/** 按字典行顺序为不同 data_key 分配 tag type（无业务含义，仅区分样式） */
export function elTagTypeByDataKey(rows, dataKey) {
  const list = normalizedDictRows(rows)
  const k = dataKey == null ? '' : String(dataKey).trim()
  const idx = list.findIndex((r) => r.dataKey === k)
  if (idx < 0) return 'info'
  return EL_TAG_TYPES[idx % EL_TAG_TYPES.length]
}

/** 任意字符串 → 稳定 tag type（用于平台名等非字典 key 的展示） */
export function elTagTypeFromString(s) {
  const str = String(s || '')
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return EL_TAG_TYPES[h % EL_TAG_TYPES.length]
}

const HEX_PALETTE = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399', '#00A1D6', '#722ed1']

/** 任意字符串 → 稳定 hex 色（用于平台图标等，不依赖预置平台名） */
export function stableHexColor(s) {
  const str = String(s || '')
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return HEX_PALETTE[h % HEX_PALETTE.length]
}
