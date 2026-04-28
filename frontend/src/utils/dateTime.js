/**
 * 全站面向用户的时间展示统一为东八区（Asia/Shanghai），
 * 与 API 的 ISO(UTC) 或无时区字符串解耦，避免跟浏览器系统时区走。
 */

export const TIME_ZONE_CN = 'Asia/Shanghai'

function parseDate(value) {
  if (value == null || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** sv-SE + Asia/Shanghai → 稳定拆出年月日时分（上海墙钟） */
function partsInShanghai(value) {
  const d = parseDate(value)
  if (!d) return null
  const s = d.toLocaleString('sv-SE', { timeZone: TIME_ZONE_CN })
  const [datePart, timePart = '00:00:00'] = s.split(' ')
  const [yStr, moStr, daStr] = datePart.split('-')
  const [hStr, miStr] = timePart.split(':')
  return {
    y: Number(yStr),
    mo: Number(moStr),
    da: Number(daStr),
    h: Number(hStr),
    mi: Number(miStr),
  }
}

/** 表格/详情常用：2025/04/24 14:30（与 zh-CN 习惯一致） */
export function formatZhCnDateTime(value, { seconds = false, empty = '-' } = {}) {
  const d = parseDate(value)
  if (!d) return empty
  const opts = {
    timeZone: TIME_ZONE_CN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }
  if (seconds) opts.second = '2-digit'
  return d.toLocaleString('zh-CN', opts)
}

export function nowZhCnDateTime(options) {
  return formatZhCnDateTime(new Date(), options)
}

/** M/D HH:mm — 历史卡片、发布队列等紧凑展示 */
export function formatZhCnMdHm(value) {
  const p = partsInShanghai(value)
  if (!p) return ''
  const { mo, da, h, mi } = p
  return `${mo}/${da} ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

/** YYYY-MM-DD HH:mm */
export function formatZhCnYmdHm(value) {
  const p = partsInShanghai(value)
  if (!p) return '-'
  const { y, mo, da, h, mi } = p
  return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

/** YYYY/M/D H:M（与旧 PublishHistory 一致） */
export function formatZhCnSlashYmdHm(value) {
  const p = partsInShanghai(value)
  if (!p) return '-'
  const { y, mo, da, h, mi } = p
  return `${y}/${mo}/${da} ${h}:${mi}`
}

/** 文件名等：上海日历日 YYYY-MM-DD */
export function formatZhCnYmd(value = new Date()) {
  const p = partsInShanghai(value)
  if (!p) return ''
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.da).padStart(2, '0')}`
}
