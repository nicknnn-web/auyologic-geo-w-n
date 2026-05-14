/**
 * 关键词类型 data_key 顺序（展示文案一律以 GET /api/sys-dict?dictType=keyword_type 为准）。
 * 此处仅提供离线/首屏前的占位：dataValue 用 dataKey，避免在各页面重复写死五类中文名。
 */
export const KEYWORD_TYPE_DEFAULT_KEYS = [
  { dataKey: '01', sortOrder: 10 },
  { dataKey: '02', sortOrder: 20 },
  { dataKey: '03', sortOrder: 30 },
  { dataKey: '04', sortOrder: 40 },
  { dataKey: '05', sortOrder: 50 },
]

export function placeholderKeywordTypeOptions() {
  return KEYWORD_TYPE_DEFAULT_KEYS.map(({ dataKey, sortOrder }) => ({
    dataKey,
    dataValue: dataKey,
    sortOrder,
  }))
}

/** 与后端 inferCategory 无文案时一致（报告矩阵骨架） */
export const KEYWORD_TYPE_KEY_TO_REPORT_CATEGORY = {
  '01': 'brand',
  '02': 'open',
  '03': 'open',
  '04': 'compare',
  '05': 'open',
  '06': 'open',
}
