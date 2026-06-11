import { imagesAPI } from './api.js'

const GALLERY_STORAGE_KEY = 'auyologic-images'

/** 解析草稿 selected_images / selected_docs（DB 为 JSON 文本） */
export function parseDraftImageUrls(value) {
  if (value == null || value === '') return []
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return []
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s)
        return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
      } catch {
        return []
      }
    }
    if (s.startsWith('{') && s.endsWith('}')) {
      return s
        .slice(1, -1)
        .split(',')
        .map((x) => x.trim().replace(/^"|"$/g, ''))
        .filter(Boolean)
    }
    return [s]
  }
  return []
}

/** 单条图库记录 → 下拉选项（与 Images.vue 字段一致） */
export function mapGalleryImageRow(img, index = 0) {
  const url = img.imagePath || img.image_path || img.preview || img.url || ''
  return {
    id: img.id ?? `local-${index}`,
    name: img.title || img.name || `图片 ${img.id ?? index + 1}`,
    url: String(url).trim(),
  }
}

function dedupeGalleryByUrl(items) {
  const seen = new Set()
  return items.filter((x) => {
    if (!x?.url || seen.has(x.url)) return false
    seen.add(x.url)
    return true
  })
}

/** 从 localStorage 读取企业图库（Images.vue 同步的 auyologic-images） */
export function loadGalleryFromLocalStorage() {
  try {
    const raw = localStorage.getItem(GALLERY_STORAGE_KEY) || localStorage.getItem('images')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return dedupeGalleryByUrl(
      parsed.map((img, i) => mapGalleryImageRow(img, i)).filter((x) => x.url)
    )
  } catch {
    return []
  }
}

/**
 * 企业图库选项：优先走后端 /api/images，与 Images.vue 一致；无数据时回退 localStorage
 */
export async function fetchGalleryImageOptions() {
  try {
    const { list } = await imagesAPI.list()
    if (Array.isArray(list) && list.length > 0) {
      return dedupeGalleryByUrl(
        list.map((img, i) => mapGalleryImageRow(img, i)).filter((x) => x.url)
      )
    }
  } catch (e) {
    console.warn('从企业图库 API 加载失败，尝试本地缓存:', e)
  }
  return loadGalleryFromLocalStorage()
}

/** 将草稿已选但不在图库列表中的 URL 补进下拉，避免选项缺失 */
export function mergeGalleryOptions(options, extraUrls = []) {
  const out = [...(options || [])]
  const known = new Set(out.map((x) => x.url))
  let n = 0
  for (const raw of extraUrls) {
    const url = String(raw || '').trim()
    if (!url || known.has(url)) continue
    known.add(url)
    n += 1
    out.push({ id: `selected-${n}`, name: `已选配图 ${n}`, url })
  }
  return out
}
