// 网站分析服务 - 分析网站的技术SEO和AI抓取友好度

const ANALYSIS_DIMENSIONS = [
  { key: 'seo', name: 'SEO友好度', weight: 0.25 },
  { key: 'ai', name: 'AI抓取友好度', weight: 0.30 },
  { key: 'tech', name: '技术架构', weight: 0.20 },
  { key: 'content', name: '内容质量', weight: 0.25 },
];

export async function analyzeWebsite(url, apiKey) {
  // 确保 URL 带协议前缀
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  const report = {};
  let overallScore = 0;

  // 1. 获取网页内容
  let html = '';
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GEO-Analyzer/1.0)',
      },
    });
    html = await resp.text();
  } catch (err) {
    throw new Error(`无法访问该网站: ${err.message}`);
  }

  // 2. 各维度分析（并行）
  const [seoResult, aiResult, techResult, contentResult] = await Promise.all([
    analyzeSEO(html, url),
    analyzeAICompatibility(html, url, apiKey),
    analyzeTechnical(html, url),
    analyzeContent(html),
  ]);

  report.seo = seoResult;
  report.ai = aiResult;
  report.tech = techResult;
  report.content = contentResult;

  // 3. 综合评分
  overallScore = Math.round(
    report.seo.score * 0.25 +
    report.ai.score * 0.30 +
    report.tech.score * 0.20 +
    report.content.score * 0.25
  );

  return {
    url,
    overallScore,
    seoScore: report.seo.score,
    aiScore: report.ai.score,
    techScore: report.tech.score,
    contentScore: report.content.score,
    report,
    analyzedAt: new Date().toISOString(),
  };
}

async function analyzeSEO(html, url) {
  const checks = [];
  let score = 70;

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) checks.push({ item: '页面标题', pass: true, detail: titleMatch[1] });
  else { checks.push({ item: '页面标题', pass: false, detail: '缺少<title>标签' }); score -= 10; }

  // Meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (descMatch) checks.push({ item: 'Meta描述', pass: true, detail: descMatch[1].substring(0, 100) });
  else { checks.push({ item: 'Meta描述', pass: false, detail: '缺少Meta描述' }); score -= 8; }

  // OG tags
  const ogTitle = html.includes('og:title');
  const ogDesc = html.includes('og:description');
  if (ogTitle && ogDesc) checks.push({ item: 'Open Graph标签', pass: true, detail: '已配置' });
  else { checks.push({ item: 'Open Graph标签', pass: false, detail: '缺少OG标签' }); score -= 5; }

  // H1
  const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
  if (h1Count >= 1) checks.push({ item: 'H1标签', pass: true, detail: `找到${h1Count}个H1` });
  else { checks.push({ item: 'H1标签', pass: false, detail: '缺少H1标签' }); score -= 7; }

  // 图片Alt
  const imgsWithoutAlt = (html.match(/<img(?![^>]*alt=[^>]*)(?![^>]*alt=")[^>]*>/gi) || []).length;
  if (imgsWithoutAlt < 5) checks.push({ item: '图片Alt属性', pass: true, detail: `无Alt图片: ${imgsWithoutAlt}` });
  else { checks.push({ item: '图片Alt属性', pass: false, detail: `${imgsWithoutAlt}个图片缺少Alt` }); score -= 5; }

  return { name: 'SEO友好度', score: Math.max(0, score), checks };
}

async function analyzeAICompatibility(html, url, apiKey) {
  const checks = [];
  let score = 60;

  // 结构化数据
  const hasJsonLd = html.includes('application/ld+json') || html.includes('"@type"');
  if (hasJsonLd) {
    checks.push({ item: '结构化数据(Schema)', pass: true, detail: '发现JSON-LD' });
    score += 10;
  } else {
    checks.push({ item: '结构化数据(Schema)', pass: false, detail: '未发现结构化数据' });
    score -= 10;
  }

  // 语义标签
  const semanticTags = ['<article', '<section', '<nav', '<header', '<footer', '<main'];
  const semanticCount = semanticTags.filter(tag => html.includes(tag)).length;
  if (semanticCount >= 4) {
    checks.push({ item: '语义化HTML', pass: true, detail: `使用${semanticCount}个语义标签` });
    score += 10;
  } else {
    checks.push({ item: '语义化HTML', pass: false, detail: `仅使用${semanticCount}个语义标签` });
    score -= 5;
  }

  // 纯文本内容占比
  const textLength = html.replace(/<[^>]+>/g, '').length;
  const htmlLength = html.length;
  const textRatio = textLength / htmlLength;
  if (textRatio > 0.15) {
    checks.push({ item: '内容丰富度', pass: true, detail: `文本占比${Math.round(textRatio * 100)}%` });
    score += 10;
  } else {
    checks.push({ item: '内容丰富度', pass: false, detail: `文本占比${Math.round(textRatio * 100)}%，偏低` });
  }

  // robots.txt / sitemap
  try {
    const robotsResp = await fetch(new URL('/robots.txt', url).href).catch(() => null);
    if (robotsResp?.ok) checks.push({ item: 'robots.txt', pass: true, detail: '存在' });
    else checks.push({ item: 'robots.txt', pass: false, detail: '未找到' });
  } catch {
    checks.push({ item: 'robots.txt', pass: false, detail: '无法检测' });
  }

  return { name: 'AI抓取友好度', score: Math.max(0, Math.min(100, score)), checks };
}

async function analyzeTechnical(html, url) {
  const checks = [];
  let score = 75;

  // HTTPS
  if (url.startsWith('https://')) {
    checks.push({ item: 'HTTPS加密', pass: true, detail: '使用HTTPS' });
    score += 10;
  } else {
    checks.push({ item: 'HTTPS加密', pass: false, detail: '未使用HTTPS' });
    score -= 10;
  }

  // 响应式
  if (html.includes('viewport') || html.includes('max-width')) {
    checks.push({ item: '移动端适配', pass: true, detail: '有viewport配置' });
    score += 5;
  } else {
    checks.push({ item: '移动端适配', pass: false, detail: '未发现viewport配置' });
    score -= 5;
  }

  // 加载速度估算（文件大小）
  const sizeKB = new TextEncoder().encode(html).length / 1024;
  if (sizeKB < 500) {
    checks.push({ item: '页面体积', pass: true, detail: `约${Math.round(sizeKB)}KB` });
    score += 5;
  } else {
    checks.push({ item: '页面体积', pass: false, detail: `${Math.round(sizeKB)}KB，偏大` });
    score -= 5;
  }

  // Canonical标签
  if (html.includes('canonical')) {
    checks.push({ item: 'Canonical标签', pass: true, detail: '已配置' });
  } else {
    checks.push({ item: 'Canonical标签', pass: false, detail: '未配置' });
    score -= 3;
  }

  return { name: '技术架构', score: Math.max(0, Math.min(100, score)), checks };
}

async function analyzeContent(html) {
  const checks = [];
  let score = 65;

  const text = html.replace(/<[^>]+>/g, '').trim();
  const words = text.split(/\s+/).filter(w => w.length > 2);
  const wordCount = words.length;

  if (wordCount >= 500) {
    checks.push({ item: '内容字数', pass: true, detail: `约${wordCount}字` });
    score += 15;
  } else {
    checks.push({ item: '内容字数', pass: false, detail: `仅${wordCount}字，内容偏少` });
    score -= 10;
  }

  // 标题层级
  const h2Count = (html.match(/<h2/gi) || []).length;
  const h3Count = (html.match(/<h3/gi) || []).length;
  if (h2Count >= 2 && h3Count >= 2) {
    checks.push({ item: '内容结构', pass: true, detail: `H2:${h2Count} H3:${h3Count}` });
    score += 10;
  } else {
    checks.push({ item: '内容结构', pass: false, detail: `H2:${h2Count} H3:${h3Count}` });
    score -= 5;
  }

  // 列表使用
  const ulCount = (html.match(/<ul/gi) || []).length;
  const olCount = (html.match(/<ol/gi) || []).length;
  if (ulCount + olCount >= 2) {
    checks.push({ item: '列表结构', pass: true, detail: `找到${ulCount + olCount}个列表` });
    score += 5;
  } else {
    checks.push({ item: '列表结构', pass: false, detail: '缺少列表' });
  }

  return { name: '内容质量', score: Math.max(0, Math.min(100, score)), checks };
}
