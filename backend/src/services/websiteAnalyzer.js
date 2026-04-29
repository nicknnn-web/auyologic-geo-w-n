// 网站优化检测 — 四维：技术基础 / 页面结构 / 结构化数据 / AI 亲和性
// 与前端 WebsiteOptimization.vue 的 dimLabels（tech/structure/schema/aiFriendly）一致

const USER_AGENT = 'Mozilla/5.0 (compatible; Auyologic-GEO-Analyzer/1.2)';

const FAMOUS_HOSTS = {
  'baidu.com': { name: '百度', type: '搜索', bonus: 12, aiBonus: 8 },
  'google.com': { name: 'Google', type: '搜索', bonus: 12, aiBonus: 8 },
  'qq.com': { name: '腾讯', type: '门户', bonus: 10, aiBonus: 6 },
  'taobao.com': { name: '淘宝', type: '电商', bonus: 10, aiBonus: 6 },
  'zhihu.com': { name: '知乎', type: '社区', bonus: 8, aiBonus: 5 },
  'bilibili.com': { name: 'B站', type: '视频', bonus: 8, aiBonus: 5 },
};

function normalizeUrlInput(url) {
  let u = String(url || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    return new URL(u).href;
  } catch {
    return null;
  }
}

function getFamousSiteBonus(url) {
  try {
    const { hostname } = new URL(url);
    const h = hostname.toLowerCase().replace(/^www\./, '');
    for (const [suffix, meta] of Object.entries(FAMOUS_HOSTS)) {
      if (h === suffix || h.endsWith(`.${suffix}`)) {
        return { name: meta.name, type: meta.type, bonus: meta.bonus, aiBonus: meta.aiBonus || 0 };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchText(href) {
  try {
    const res = await fetch(href, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,*/*' },
      redirect: 'follow',
    });
    const text = await res.text();
    return { ok: res.ok, text, status: res.status };
  } catch (e) {
    return { ok: false, text: '', status: 0, error: e.message };
  }
}

async function checkRobots(baseUrl) {
  let status = 'missing';
  try {
    const u = new URL(baseUrl);
    const robotsUrl = `${u.origin}/robots.txt`;
    const r = await fetch(robotsUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (!r.ok) {
      return { status, raw: '', snippet: '无法获取' };
    }
    const raw = await r.text();
    const lower = raw.toLowerCase();
    if (lower.includes('user-agent: *') && /disallow:\s*\//.test(lower)) {
      status = 'blocked';
    } else {
      status = 'allowed';
    }
    return { status, raw };
  } catch {
    return { status, raw: '' };
  }
}

function countMatches(re, html) {
  return (html.match(re) || []).length;
}

function stripTags(html) {
  return String(html || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreItems(items, weights) {
  const w = weights || items.map(() => 1);
  const maxW = w.reduce((a, b) => a + b, 0);
  let earned = 0;
  items.forEach((it, i) => {
    if (it.result === 'pass') earned += w[i] || 1;
  });
  return maxW > 0 ? Math.round((earned / maxW) * 100) : 0;
}

function countChecked(items) {
  return items.filter((i) => i.result === 'pass').length;
}

function buildTechDimension(url, html, robots) {
  const items = [];
  const isHttps = url.startsWith('https://');
  items.push({
    name: 'HTTPS 协议',
    result: isHttps ? 'pass' : 'fail',
    value: isHttps ? '已启用' : '未启用',
  });

  const rb =
    robots.status === 'allowed' ? '允许抓取' : robots.status === 'blocked' ? '可能限制抓取' : '未检测/无文件';
  items.push({
    name: 'robots.txt',
    result: robots.status === 'allowed' ? 'pass' : 'fail',
    value: rb,
  });

  const hasCanonical = /rel=["']canonical["']/i.test(html) || /<link[^>]+canonical/i.test(html);
  items.push({
    name: 'Canonical 标签',
    result: hasCanonical ? 'pass' : 'fail',
    value: hasCanonical ? '已设置' : '未设置',
  });

  const hasViewport = /name=["']viewport["']/i.test(html);
  items.push({
    name: '移动端视口',
    result: hasViewport ? 'pass' : 'fail',
    value: hasViewport ? '已配置 viewport' : '未配置',
  });

  const sizeKb = Buffer.byteLength(html, 'utf8') / 1024;
  const sizeOk = sizeKb < 800;
  items.push({
    name: '首屏 HTML 体积',
    result: sizeOk ? 'pass' : 'fail',
    value: `约 ${Math.round(sizeKb)} KB`,
  });

  const weights = [2, 2, 1, 1, 1];
  const score = scoreItems(items, weights);
  return {
    score,
    checked: countChecked(items),
    total: items.length,
    items: items.map((i) => ({ name: i.name, result: i.result, value: i.value })),
  };
}

function buildStructureDimension(html) {
  const items = [];

  const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const hasTitle = !!(titleM && titleM[1].trim());
  items.push({
    name: 'Title 标签',
    result: hasTitle ? 'pass' : 'fail',
    value: hasTitle ? `${titleM[1].trim().slice(0, 60)}` : '未设置',
  });

  const descM =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const hasDesc = !!(descM && descM[1].trim());
  items.push({
    name: 'Meta Description',
    result: hasDesc ? 'pass' : 'fail',
    value: hasDesc ? `${descM[1].trim().slice(0, 80)}` : '未设置',
  });

  const h1n = countMatches(/<h1[^>]*>/gi, html);
  const h1ok = h1n === 1;
  items.push({
    name: 'H1 标签',
    result: h1ok ? 'pass' : 'fail',
    value: h1n === 0 ? '缺少' : `${h1n} 个`,
  });

  const h2n = countMatches(/<h2[^>]*>/gi, html);
  const h3n = countMatches(/<h3[^>]*>/gi, html);
  const hierarchyOk = h2n >= 1 && h3n >= 1;
  items.push({
    name: 'H2-H6 层级',
    result: hierarchyOk ? 'pass' : 'fail',
    value: `H2:${h2n} H3:${h3n}`,
  });

  const plain = stripTags(html);
  const words = plain.split(/[\s\u3000]+/).filter((w) => w.length > 1);
  const wc = words.length;
  const lenOk = wc >= 200;
  items.push({
    name: '内容长度',
    result: lenOk ? 'pass' : 'fail',
    value: `约 ${wc} 词`,
  });

  const imgTags = html.match(/<img[^>]*>/gi) || [];
  let withoutAlt = 0;
  for (const tag of imgTags) {
    if (!/\balt\s*=\s*["'][^"']*["']/i.test(tag) && !/\balt\s*=\s*[^\s>]+/i.test(tag)) withoutAlt++;
  }
  const totalImg = imgTags.length || 1;
  const altRatio = totalImg ? ((totalImg - withoutAlt) / totalImg) * 100 : 100;
  const altOk = totalImg === 0 || altRatio >= 70;
  items.push({
    name: '图片 Alt 标签',
    result: altOk ? 'pass' : 'fail',
    value: totalImg ? `${Math.round(altRatio)}% 有 alt` : '无图片',
  });

  const weights = [2, 2, 2, 1, 2, 2];
  const score = scoreItems(items, weights);
  return {
    score,
    checked: countChecked(items),
    total: items.length,
    items: items.map((i) => ({ name: i.name, result: i.result, value: i.value })),
  };
}

function buildSchemaDimension(html) {
  const items = [];

  const hasJsonLd =
    /application\/ld\+json/i.test(html) ||
    /<script[^>]*type=["']application\/ld\+json["']/i.test(html);
  const typeHints = [];
  if (hasJsonLd) {
    if (/FAQPage|QAPage/i.test(html)) typeHints.push('FAQ/Q&A');
    if (/Organization|Corporation/i.test(html)) typeHints.push('Organization');
    if (/Article|BlogPosting|NewsArticle/i.test(html)) typeHints.push('Article');
    if (/Product|Offer/i.test(html)) typeHints.push('Product');
  }
  items.push({
    name: 'JSON-LD Schema',
    result: hasJsonLd ? 'pass' : 'fail',
    value: hasJsonLd ? (typeHints.length ? typeHints.join('、') : '已检测到') : '未检测到',
  });

  const ogTitle = /property=["']og:title["']/i.test(html);
  const ogDesc = /property=["']og:description["']/i.test(html);
  const ogOk = ogTitle && ogDesc;
  items.push({
    name: 'Open Graph',
    result: ogOk ? 'pass' : 'fail',
    value: ogOk ? 'og:title + og:description' : '不完整或未设置',
  });

  const tw = /name=["']twitter:card["']/i.test(html) || /property=["']twitter:title["']/i.test(html);
  items.push({
    name: 'Twitter / 社交图',
    result: tw ? 'pass' : 'fail',
    value: tw ? '已配置' : '未配置',
  });

  const weights = [3, 2, 1];
  const score = scoreItems(items, weights);
  return {
    score,
    checked: countChecked(items),
    total: items.length,
    items: items.map((i) => ({ name: i.name, result: i.result, value: i.value })),
  };
}

function buildAiFriendlyDimension(html, robots) {
  const items = [];

  const semantic = ['article', 'section', 'nav', 'header', 'footer', 'main'];
  let semCount = 0;
  for (const t of semantic) {
    if (new RegExp(`<${t}[^>]*>`, 'i').test(html)) semCount++;
  }
  const semOk = semCount >= 3;
  items.push({
    name: '语义化 HTML',
    result: semOk ? 'pass' : 'fail',
    value: `使用 ${semCount}/6 类语义标签`,
  });

  const len = html.length || 1;
  const textLen = stripTags(html).length;
  const ratio = textLen / len;
  const ratioOk = ratio > 0.12;
  items.push({
    name: '正文信息密度',
    result: ratioOk ? 'pass' : 'fail',
    value: `${Math.round(ratio * 100)}% 文本占比`,
  });

  const faqPattern =
    /faq|常见问题|问与答|q\s*[&＆]\s*a/i.test(html) ||
    /FAQPage|QAPage/i.test(html);
  items.push({
    name: 'FAQ 内容',
    result: faqPattern ? 'pass' : 'fail',
    value: faqPattern ? '检测到 FAQ 线索或 Schema' : '未检测',
  });

  const lists = countMatches(/<ul[\s>]/gi, html) + countMatches(/<ol[\s>]/gi, html);
  const listOk = lists >= 1;
  items.push({
    name: '列表与要点',
    result: listOk ? 'pass' : 'fail',
    value: `${lists} 个列表`,
  });

  let renderHint = '静态/未知';
  if (/\bid=["']__next|__NEXT_DATA__|next\.js/i.test(html)) renderHint = 'Next.js（多为 SSR/SSG）';
  else if (/nuxt|__NUXT__|data-v-/i.test(html)) renderHint = 'Nuxt/Vue';
  else if (/react/.test(html) && /<div\s+id=["']root["']/i.test(html)) renderHint = 'SPA 倾向';
  items.push({
    name: '渲染形态线索',
    result: /__NEXT_DATA__|ssr|server/i.test(html) ? 'pass' : 'fail',
    value: renderHint,
  });

  const crawlOk = robots.status === 'allowed';
  items.push({
    name: 'AI 爬虫友好（robots）',
    result: crawlOk ? 'pass' : 'fail',
    value: crawlOk ? '未全局禁止' : '可能受限',
  });

  const weights = [2, 2, 2, 1, 1, 2];
  const score = scoreItems(items, weights);
  return {
    score,
    checked: countChecked(items),
    total: items.length,
    items: items.map((i) => ({ name: i.name, result: i.result, value: i.value })),
  };
}

const DIM_LABEL = {
  tech: '技术基础',
  structure: '页面结构',
  schema: '结构化数据',
  aiFriendly: 'AI亲和性',
};

function buildDetails(tech, structure, schema, aiFriendly) {
  const out = [];
  for (const dimKey of ['tech', 'structure', 'schema', 'aiFriendly']) {
    const dim = { tech, structure, schema, aiFriendly }[dimKey];
    const label = DIM_LABEL[dimKey];
    for (const it of dim.items || []) {
      out.push({
        dimension: label,
        item: it.name,
        result: it.result === 'pass' ? 'pass' : 'fail',
        value: it.value || '',
        suggestion: it.result === 'pass' ? '保持现状' : '建议按 GEO/SEO 最佳实践优化',
      });
    }
  }
  return out;
}

function buildIssues(tech, structure, schema, aiFriendly) {
  const warn = [];
  const pass = [];

  const pushFail = (dimLabel, it, impact) => {
    if (it.result !== 'pass') {
      warn.push({
        title: `${dimLabel}：${it.name}`,
        desc: `当前值：${it.value}`,
        fix: '参考 GEO / SEO 规范完善该项',
        level: 'warn',
        impact: impact || 5,
      });
    }
  };

  const pushPass = (title, desc, impact) => {
    pass.push({ title, desc, level: 'pass', impact: impact || 3 });
  };

  for (const it of tech.items) {
    pushFail('技术基础', it, 6);
    if (it.name === 'HTTPS 协议' && it.result === 'pass') pushPass('HTTPS 已启用', '传输安全', 5);
  }
  for (const it of structure.items) pushFail('页面结构', it, 4);
  for (const it of schema.items) pushFail('结构化数据', it, 5);
  for (const it of aiFriendly.items) pushFail('AI亲和性', it, 4);

  const avg =
    (tech.score + structure.score + schema.score + aiFriendly.score) / 4;
  if (avg >= 75) {
    pass.push({
      title: '整体 GEO 友好度良好',
      desc: '四维综合表现较好，建议持续更新内容与结构化数据',
      level: 'pass',
      impact: 0,
    });
  }

  return { warn, pass };
}

export async function analyzeWebsite(url, _apiKey) {
  const normalized = normalizeUrlInput(url);
  if (!normalized) {
    throw new Error('无效的网址');
  }

  const page = await fetchText(normalized);
  if (!page.text || page.text.length < 80) {
    throw new Error(
      page.error || `无法获取页面内容（HTTP ${page.status || '—'}）`
    );
  }
  const html = page.text;

  const robots = await checkRobots(normalized);

  const tech = buildTechDimension(normalized, html, robots);
  const structure = buildStructureDimension(html);
  const schema = buildSchemaDimension(html);
  const aiFriendly = buildAiFriendlyDimension(html, robots);

  let overallScore = Math.round(
    tech.score * 0.22 + structure.score * 0.28 + schema.score * 0.22 + aiFriendly.score * 0.28
  );

  const famousSiteBonus = getFamousSiteBonus(normalized);
  if (famousSiteBonus) {
    overallScore = Math.min(
      100,
      overallScore + Math.round((famousSiteBonus.bonus + (famousSiteBonus.aiBonus || 0)) / 4)
    );
  }

  const issues = buildIssues(tech, structure, schema, aiFriendly);
  const details = buildDetails(tech, structure, schema, aiFriendly);

  const checkedAt = new Date().toISOString();

  return {
    url: normalized,
    overallScore,
    tech,
    structure,
    schema,
    aiFriendly,
    issues,
    details,
    checkedAt,
    famousSiteBonus,
    seoScore: structure.score,
    aiScore: aiFriendly.score,
    techScore: tech.score,
    contentScore: schema.score,
  };
}
