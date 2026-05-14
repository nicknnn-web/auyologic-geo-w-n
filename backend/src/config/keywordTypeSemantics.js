/**
 * 关键词类型 keyword_type（sys_dict）— 与品牌体检 inferCategory / 报告 KPI 对齐的**唯一**种子与 key 语义。
 * 业务展示文案以数据库 sys_dict 为准；此处仅：空库种子、无字典时的兜底行、无文案时的 data_key→报告 category。
 */

export const KEYWORD_TYPE_DICT_TYPE = 'keyword_type';

/** 空库 / bootstrap 写入 sys_dict 的初始行（与线上「01–05 五类」一致；改类型名请改库或字典管理） */
export const KEYWORD_TYPE_BOOTSTRAP_ROWS = [
  ['keyword_type', '01', '品牌词', 10],
  ['keyword_type', '02', '产品词', 20],
  ['keyword_type', '03', '场景词', 30],
  ['keyword_type', '04', '对比词', 40],
  ['keyword_type', '05', '价格词', 50],
];

/** geoHealthReport 等：接口无字典时的兜底行（仅 data_key / sort_order；文案与 BOOTSTRAP 一致） */
export function fallbackKeywordTypeRowsForReport() {
  return KEYWORD_TYPE_BOOTSTRAP_ROWS.map(([, dataKey, dataValue, sortOrder]) => ({
    data_key: dataKey,
    data_value: dataValue,
    sort_order: sortOrder,
  }));
}

/**
 * 无 sys_dict.data_value 时，按 data_key 归入报告三维 category（与 KPI「开放式=02/03/05」一致）
 */
export const KEYWORD_TYPE_KEY_TO_REPORT_CATEGORY = {
  '01': 'brand',
  '02': 'open',
  '03': 'open',
  '04': 'compare',
  '05': 'open',
  '06': 'open',
};
