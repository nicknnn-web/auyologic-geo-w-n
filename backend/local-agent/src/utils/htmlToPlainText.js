/** 常见 HTML 实体 */
const NAMED_ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

function decodeHtmlEntities(text) {
  let s = text;
  for (const [entity, ch] of Object.entries(NAMED_ENTITIES)) {
    s = s.split(entity).join(ch);
  }
  s = s.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return s;
}

/**
 * 将草稿/富文本 HTML 转为适合键盘输入的纯文本（段落换行保留）。
 * 无 HTML 标签时原样返回。
 */
export function htmlToPlainText(input) {
  if (input == null) return '';
  const raw = String(input).trim();
  if (!raw) return '';
  if (!/<[a-z][\s\S]*?>/i.test(raw)) return raw;

  let s = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<\/div>\s*<div[^>]*>/gi, '\n\n')
    .replace(/<\/h[1-6]>\s*<h[1-6][^>]*>/gi, '\n\n')
    .replace(/<\/li>\s*<li[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(?:p|div|h[1-6]|blockquote|section|article|pre|figure)(?:\s[^>]*)?>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  s = decodeHtmlEntities(s);
  s = s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return s;
}
