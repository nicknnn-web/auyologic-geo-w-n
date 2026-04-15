/** 与前端 el-pagination 对齐：page 从 1 开始，默认每页 20 */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

export function parsePagination(req) {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
  let pageSize =
    parseInt(String(req.query.pageSize ?? req.query.page_size ?? ''), 10) ||
    DEFAULT_PAGE_SIZE
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE)
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset }
}

export function pagedResponse(list, total, page, pageSize) {
  return {
    list,
    total: Number(total) || 0,
    page,
    pageSize,
  }
}
