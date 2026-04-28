/**
 * 品牌体检信源四分类（域名兜底，与 Prompt 的 category 枚举对齐）。
 * 值存 geo_health_article.source_category，报告层再映射中文展示。
 */

export const SOURCE_CATEGORY = {
  AUTHORITY_MEDIA: 'authority_media',
  INDUSTRY_VERTICAL: 'industry_vertical',
  OFFICIAL_MEDIA: 'official_media',
  UGC_COMMUNITY: 'ugc_community',
};

/** 报告 / 前端展示用（阶段 4 可统一引用） */
export const SOURCE_CATEGORY_LABEL = {
  [SOURCE_CATEGORY.AUTHORITY_MEDIA]: '权威媒体',
  [SOURCE_CATEGORY.INDUSTRY_VERTICAL]: '行业垂直',
  [SOURCE_CATEGORY.OFFICIAL_MEDIA]: '官方自媒体',
  [SOURCE_CATEGORY.UGC_COMMUNITY]: 'UGC / 社区',
};

function stripWww(host) {
  const h = String(host || '').toLowerCase();
  return h.startsWith('www.') ? h.slice(4) : h;
}

/** 从用户填写的官网字段解析出用于匹配的根域名 */
export function hostnameFromBrandWebsite(website) {
  const s = String(website || '').trim();
  if (!s) return '';
  try {
    const u = s.includes('://') ? new URL(s) : new URL(`https://${s}`);
    return stripWww(u.hostname);
  } catch {
    return stripWww(s.replace(/^https?:\/\//i, '').split('/')[0] || '');
  }
}

function hostMatchesSuffix(host, suffix) {
  const h = stripWww(host);
  const s = stripWww(suffix);
  if (!h || !s) return false;
  return h === s || h.endsWith(`.${s}`);
}

function matchesAnySuffix(host, suffixes) {
  return suffixes.some((s) => hostMatchesSuffix(host, s));
}

/** 主流 UGC / 社区 / 内容平台 */
const UGC_SUFFIXES = [
  'zhihu.com',
  'xiaohongshu.com',
  'bilibili.com',
  'weibo.com',
  'douyin.com',
  'tiktok.com',
  'kuaishou.com',
  'douban.com',
  'reddit.com',
  'twitter.com',
  'x.com',
  'jianshu.com',
  'tieba.baidu.com',
  'mp.weixin.qq.com',
  'youtube.com',
  'instagram.com',
  'facebook.com',
  'linkedin.com',
  'discord.com',
  't.me',
  'stackoverflow.com',
  'github.com',
];

/** 权威 / 综合新闻媒体（避免过宽根域如 *.qq.com） */
const AUTHORITY_SUFFIXES = [
  'xinhuanet.com',
  'news.cn',
  'people.com.cn',
  'chinadaily.com.cn',
  'chinanews.com.cn',
  'cctv.com',
  'gmw.cn',
  'china.com.cn',
  'scmp.com',
  'reuters.com',
  'bbc.com',
  'bbc.co.uk',
  'nytimes.com',
  'theguardian.com',
  'bloomberg.com',
  'wsj.com',
  'ft.com',
  'economist.com',
  'caixin.com',
  'thepaper.cn',
  'yicai.com',
  'jiemian.com',
  'stcn.com',
  'hexun.com',
  'ce.cn',
  'news.qq.com',
  'news.163.com',
  'news.sina.com.cn',
  'huanqiu.com',
  'guancha.cn',
  'theinitium.com',
];

/** 行业 / 科技 / 开发者垂直媒体 */
const INDUSTRY_SUFFIXES = [
  '36kr.com',
  'infoq.cn',
  'infoq.com',
  'leiphone.com',
  'ithome.com',
  'geekpark.net',
  'sspai.com',
  'oschina.net',
  'segmentfault.com',
  'juejin.cn',
  'csdn.net',
  'cnblogs.com',
  'v2ex.com',
  'huxiu.com',
  'tmtpost.com',
  'pingwest.com',
  'iheima.com',
  'donews.com',
  'krasia.com',
  'eastmoney.com',
];

/**
 * @param {string} url - 文章 url；hash: 占位或非 http 返回 null
 * @param {{ brandWebsite?: string }} [opts]
 * @returns {string|null} SOURCE_CATEGORY 之一或 null
 */
const VALID_CATEGORY = new Set(Object.values(SOURCE_CATEGORY));

/**
 * 将模型输出的 category 规范为四枚举之一；无法识别则 null。
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeAiSourceCategory(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const compact = s.toLowerCase().replace(/[\s-]+/g, '_');
  if (VALID_CATEGORY.has(compact)) return compact;
  const alnum = s.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (VALID_CATEGORY.has(alnum)) return alnum;
  if (/权威|央媒|党媒|主流媒体|新闻门户/.test(s)) return SOURCE_CATEGORY.AUTHORITY_MEDIA;
  if (/行业|垂直|专业媒体/.test(s)) return SOURCE_CATEGORY.INDUSTRY_VERTICAL;
  if (/官方|自媒体|企业号|品牌号|订阅号/.test(s)) return SOURCE_CATEGORY.OFFICIAL_MEDIA;
  if (/ugc|社区|论坛|用户生成|问答平台/i.test(s)) return SOURCE_CATEGORY.UGC_COMMUNITY;
  return null;
}

/**
 * 域名侧解析：brand=官网；ugc/authority/industry=名单命中；default=未命中名单的 http；none=无 host。
 * @returns {{ category: string|null, rule: 'brand'|'ugc'|'authority'|'industry'|'default'|'none' }}
 */
export function resolveDomainSourceRule(url, opts = {}) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('hash:')) {
    return { category: null, rule: 'none' };
  }
  let host = '';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { category: null, rule: 'none' };
    }
    host = u.hostname.toLowerCase();
  } catch {
    return { category: null, rule: 'none' };
  }

  const officialRoot = hostnameFromBrandWebsite(opts.brandWebsite);
  if (officialRoot && hostMatchesSuffix(host, officialRoot)) {
    return { category: SOURCE_CATEGORY.OFFICIAL_MEDIA, rule: 'brand' };
  }
  if (matchesAnySuffix(host, UGC_SUFFIXES)) {
    return { category: SOURCE_CATEGORY.UGC_COMMUNITY, rule: 'ugc' };
  }
  if (matchesAnySuffix(host, AUTHORITY_SUFFIXES)) {
    return { category: SOURCE_CATEGORY.AUTHORITY_MEDIA, rule: 'authority' };
  }
  if (matchesAnySuffix(host, INDUSTRY_SUFFIXES)) {
    return { category: SOURCE_CATEGORY.INDUSTRY_VERTICAL, rule: 'industry' };
  }
  return { category: SOURCE_CATEGORY.INDUSTRY_VERTICAL, rule: 'default' };
}

/**
 * 阶段 3：AI category + 域名兜底合并。
 * - 官网域名：强制 official_media。
 * - 名单内域名：以域名为准（避免模型把知乎标成权威媒体等）。
 * - 其余 http：模型给出合法枚举则采用，否则 industry_vertical。
 * - hash/无效链接：仅采纳合法 AI 枚举，否则 null。
 */
export function mergeAiAndDomainSourceCategory(url, aiRaw, opts = {}) {
  const { category: domCat, rule } = resolveDomainSourceRule(url, opts);
  const ai = normalizeAiSourceCategory(aiRaw);
  if (rule === 'brand') return domCat;
  if (rule === 'ugc' || rule === 'authority' || rule === 'industry') return domCat;
  if (rule === 'default') return ai || domCat;
  if (rule === 'none') return ai || null;
  return domCat;
}

export function classifyGeoHealthSource(url, opts = {}) {
  const { category } = resolveDomainSourceRule(url, opts);
  return category;
}
