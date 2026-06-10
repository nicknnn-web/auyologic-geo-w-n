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

const SUPPORTED = new Set(['小红书', '知乎', '微博', '今日头条', '百度百家号']);

export function normalizePublishPlatform(platform) {
  const raw = String(platform || '').trim();
  if (!raw) return '';
  if (SUPPORTED.has(raw)) return raw;
  const lower = raw.toLowerCase();
  if (ALIASES[raw]) return ALIASES[raw];
  if (ALIASES[lower]) return ALIASES[lower];
  return raw;
}

export function isSupportedPublishPlatform(platform) {
  return SUPPORTED.has(normalizePublishPlatform(platform));
}
