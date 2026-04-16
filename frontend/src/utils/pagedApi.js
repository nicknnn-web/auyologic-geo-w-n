/** 与后端分页接口一致，默认与 el-pagination 常用值对齐 */
export const DEFAULT_PAGE_SIZE = 20

/**
 * 解析 GET 列表返回：新格式 { list, total, page, pageSize } 或旧格式纯数组
 */
export function unwrapListPayload(data) {
  if (data && Array.isArray(data.list)) {
    return {
      list: data.list,
      total: Number(data.total) || 0,
      page: Number(data.page) || 1,
      pageSize: Number(data.pageSize) || DEFAULT_PAGE_SIZE,
      approvedTotal: data.approvedTotal != null ? Number(data.approvedTotal) : undefined,
    }
  }
  const arr = Array.isArray(data) ? data : []
  return {
    list: arr,
    total: arr.length,
    page: 1,
    pageSize: arr.length || DEFAULT_PAGE_SIZE,
  }
}

/**
 * 分页拉取直到拿全（用于下拉、GEO 选问题等；每页不超过后端 MAX_PAGE_SIZE）
 */
export async function fetchAllPages(buildUrl, { pageSize = 100, maxPages = 100, fetchOptions = {} } = {}) {
  const all = []
  let total = Infinity
  let page = 1
  while (all.length < total && page <= maxPages) {
    const url = buildUrl(page, pageSize)
    const res = await fetch(url, fetchOptions)
    if (!res.ok) break
    const data = await res.json()
    const { list, total: t } = unwrapListPayload(data)
    total = t
    all.push(...list)
    if (!list.length) break
    page += 1
  }
  return all
}

/**
 * 删除后刷新列表：先请求当前页；若当前页无数据且页码 > 1，则逐页回退直到有数据或回到第 1 页。
 * @param {{ page: { value: number }, list: { value: unknown[] }, loadData: () => Promise<void> }} opts
 */
export async function reloadPagedListAfterRemoval(opts) {
  const { page, list, loadData } = opts
  await loadData()
  while (Array.isArray(list.value) && list.value.length === 0 && page.value > 1) {
    page.value -= 1
    await loadData()
  }
}
