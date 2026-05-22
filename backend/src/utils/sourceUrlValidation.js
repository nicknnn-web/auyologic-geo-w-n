/**
 * 品牌体检信源 URL 校验：仅允许真实可点击的 http(s) 链接入库与展示。
 */

const PLACEHOLDER_HOST_SUFFIXES = [
  'example.com',
  'example.org',
  'example.net',
  'example.cn',
  'test.com',
  'test.org',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'placeholder.com',
  'yourdomain.com',
  'your-domain.com',
  'domain.com',
  'sample.com',
];

/**
 * 是否为占位/示例域名（含子域）
 * @param {string} host
 */
export function isPlaceholderSourceHost(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.test') || h.endsWith('.invalid')) {
    return true;
  }
  for (const suffix of PLACEHOLDER_HOST_SUFFIXES) {
    if (h === suffix || h.endsWith(`.${suffix}`)) return true;
  }
  return false;
}

/**
 * 信源是否可采用：完整 http(s)、非 hash 占位、非 example 等虚构域。
 * @param {unknown} url
 */
export function isAcceptableSourceUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw || /^hash:/i.test(raw)) return false;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (!parsed.hostname || isPlaceholderSourceHost(parsed.hostname)) return false;
  // 拒绝明显模板路径（模型常编造 example.com/xxx）
  const pathHost = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  if (/example\.(com|org|net|cn)/i.test(pathHost)) return false;
  return true;
}
