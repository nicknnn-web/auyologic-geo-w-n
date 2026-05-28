/**
 * 与 backend/src/utils/publishPlatformNormalize.js 保持一致
 */
const ALIASES = {
  xiaohongshu: '小红书',
  xhs: '小红书',
  '小红书': '小红书',
  zhihu: '知乎',
  '知乎': '知乎',
  weibo: '微博',
  '微博': '微博',
  toutiao: '今日头条',
  '头条': '今日头条',
  '头条号': '今日头条',
  '今日头条': '今日头条',
  jinritoutiao: '今日头条',
};

const SUPPORTED = new Set(['小红书', '知乎', '微博', '今日头条']);

export function normalizePublishPlatform(platform) {
  const raw = String(platform || '').trim();
  if (!raw) return '';
  if (SUPPORTED.has(raw)) return raw;
  const lower = raw.toLowerCase();
  if (ALIASES[raw]) return ALIASES[raw];
  if (ALIASES[lower]) return ALIASES[lower];
  return raw;
}
