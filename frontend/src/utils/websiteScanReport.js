/** 官网技术扫描：与改进方案报告 2 / 网站优化检测历史对齐 */

export function hostKey(u) {
  let s = String(u || '')
    .trim()
    .toLowerCase()
  s = s.replace(/^https?:\/\//, '')
  s = s.split('/')[0]
  s = s.replace(/^www\./, '')
  return s
}

export function parseWebsiteRow(r) {
  const rep = r.report && typeof r.report === 'object' ? r.report : {}
  let items = rep.items ?? r.items
  let issues = rep.issues ?? r.issues
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items || '{}')
    } catch {
      items = {}
    }
  }
  if (typeof issues === 'string') {
    try {
      issues = JSON.parse(issues || '{"warn":[],"pass":[]}')
    } catch {
      issues = { warn: [], pass: [] }
    }
  }
  const score = Number(r.score ?? r.overallScore ?? rep.score ?? 0)
  return {
    id: r.id,
    url: r.url || '',
    score,
    items: items || {},
    issues: issues || { warn: [], pass: [] },
    checkedAt: r.checkedAt || r.checked_at,
  }
}

/** 按企业设置官网域名匹配检测历史（取列表中第一条匹配，列表宜为时间倒序） */
export function pickOfficialWebsiteReport(reports, officialWebsite) {
  const target = hostKey(officialWebsite)
  if (!target || !Array.isArray(reports)) return null
  for (const raw of reports) {
    const row = parseWebsiteRow(raw)
    if (hostKey(row.url) === target) return row
  }
  return null
}

export function websiteScoreTone(score) {
  const s = Number(score)
  if (!Number.isFinite(s)) return 'muted'
  if (s >= 80) return 'good'
  if (s >= 60) return 'mid'
  if (s >= 40) return 'warn'
  return 'bad'
}
