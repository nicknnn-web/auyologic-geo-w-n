/**
 * 投放/授权用的平台名规范为中文展示名（与 sys_dict publish_platform 的 data_value 一致）
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
  baijiahao: '百度百家号',
  bjh: '百度百家号',
  '百家号': '百度百家号',
  '百度百家号': '百度百家号',
};

export const SUPPORTED_PUBLISH_PLATFORMS = ['小红书', '知乎', '微博', '今日头条', '百度百家号'];
const SUPPORTED = new Set(SUPPORTED_PUBLISH_PLATFORMS);

function cleanPlatformRaw(platform) {
  return String(platform || '')
    .trim()
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .normalize('NFKC');
}

export function normalizePublishPlatform(platform) {
  const raw = cleanPlatformRaw(platform);
  if (!raw) return '';
  if (SUPPORTED.has(raw)) return raw;
  const lower = raw.toLowerCase();
  if (ALIASES[raw]) return ALIASES[raw];
  if (ALIASES[lower]) return ALIASES[lower];
  for (const name of SUPPORTED_PUBLISH_PLATFORMS) {
    if (raw.includes(name) || name.includes(raw)) return name;
  }
  return raw;
}

export function isSupportedPublishPlatform(platform) {
  return SUPPORTED.has(normalizePublishPlatform(platform));
}
