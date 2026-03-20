/**
 * 网站技术检测服务 - P0/P1/P2 级别检测
 * 使用 fetch + 正则解析 HTML
 */

// AI爬虫列表
const AI_BOTS = [
  'GPTBot', 'ChatGPT-User', 'Google-Extended', 'Googlebot', 'Googlebot-News',
  'Bingbot', 'BingPreview', 'Applebot', 'DuckDuckBot', 'YandexBot',
  'Baiduspider', 'Sogou web spider', 'CCBot', 'Anthropic-AI', 'ClaudeBot',
  'Bytespider', 'Twitterbot', 'facebookexternalhit', 'LinkedInBot'
]

// 关键Schema类型
const KEY_SCHEMA_TYPES = [
  'Organization', 'Product', 'Article', 'NewsArticle', 'BlogPosting',
  'FAQPage', 'QAPage', 'WebPage', 'LocalBusiness', 'Person'
]

// 缓存配置
const CACHE_PREFIX = 'wo_cache_'
const CACHE_EXPIRY = 1000 * 60 * 30 // 30分钟

// 工具函数
const sleep = ms => new Promise(r => setTimeout(r, ms))

const normalizeUrl = (url) => {
  if (!url) return null
  url = url.trim()
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  try { return new URL(url).href } catch { return null }
}

const getDomain = (url) => {
  try { return new URL(url).hostname } catch { return null }
}

const cleanText = str => str ? str.replace(/\s+/g, ' ').trim() : ''

const getCache = (key) => {
  try {
    const cached = localStorage.getItem(CACHE_PREFIX + key)
    if (!cached) return null
    const { data, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(CACHE_PREFIX + key)
      return null
    }
    return data
  } catch { return null }
}

const setCache = (key, data) => {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, timestamp: Date.now() }))
  } catch {}
}

/**
 * P0: 检测 robots.txt 是否允许 AI 爬虫
 */
const checkRobotsTxt = async (url) => {
  const domain = getDomain(url)
  if (!domain) return { status: 'unknown', details: { error: '无效URL' } }

  const robotsUrl = `https://${domain}/robots.txt`
  
  try {
    const response = await fetch(robotsUrl, { 
      method: 'GET', 
      headers: { 'User-Agent': 'WebsiteOptimization/1.0' } 
    })

    if (!response.ok) {
      return { status: 'unknown', details: { exists: false, message: '未找到 robots.txt' } }
    }

    const text = await response.text()
    const lines = text.split('\n')
    const rules = { disallowed: [], allowed: [], sitemap: [] }
    let currentUserAgent = '*'

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase()
      if (trimmed.startsWith('#') || !trimmed) continue
      
      if (trimmed.startsWith('user-agent:')) {
        currentUserAgent = line.substring(11).trim()
      } else if (trimmed.startsWith('disallow:')) {
        const path = line.substring(9).trim()
        if (path) rules.disallowed.push({ userAgent: currentUserAgent, path })
      } else if (trimmed.startsWith('allow:')) {
        const path = line.substring(6).trim()
        if (path) rules.allowed.push({ userAgent: currentUserAgent, path })
      } else if (trimmed.startsWith('sitemap:')) {
        rules.sitemap.push(line.substring(8).trim())
      }
    }

    // 检查AI爬虫是否被禁止
    const blockedBots = []
    for (const bot of AI_BOTS) {
      const lowerBot = bot.toLowerCase()
      const disallowRules = rules.disallowed.filter(r => 
        r.userAgent.toLowerCase() === lowerBot || r.userAgent === '*'
      )
      if (disallowRules.length > 0) {
        blockedBots.push({ bot, paths: disallowRules.map(r => r.path) })
      }
    }

    const isBlocked = blockedBots.length > 0
    return {
      status: isBlocked ? 'blocked' : 'allowed',
      allowed: !isBlocked,
      blocked: isBlocked,
      details: { exists: true, blockedBots, sitemap: rules.sitemap }
    }
  } catch (error) {
    return { status: 'unknown', details: { error: error.message } }
  }
}

/**
 * P0: 提取 JSON-LD Schema
 */
const extractJsonLd = (html) => {
  const schemas = []
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    try {
      const content = match[1].trim()
      const parsed = JSON.parse(content)
      schemas.push({
        data: parsed,
        type: parsed['@type'] || 'Unknown',
        types: Array.isArray(parsed['@type']) ? parsed['@type'] : [parsed['@type']]
      })
    } catch {}
  }
  return schemas
}

/**
 * P0: 检测 Schema Markup
 */
const checkSchemaMarkup = async (url) => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'WebsiteOptimization/1.0' }
    })

    if (!response.ok) {
      return { found: [], missing: KEY_SCHEMA_TYPES, hasAny: false }
    }

    const html = await response.text()
    const schemas = extractJsonLd(html)
    
    const foundTypes = new Set()
    for (const schema of schemas) {
      for (const type of schema.types) {
        if (type) foundTypes.add(type)
      }
    }

    const found = Array.from(foundTypes)
    return {
      found,
      missing: KEY_SCHEMA_TYPES.filter(t => !foundTypes.has(t)),
      hasAny: schemas.length > 0,
      count: schemas.length
    }
  } catch (error) {
    return { found: [], missing: KEY_SCHEMA_TYPES, hasAny: false, error: error.message }
  }
}

/**
 * P0: 检测服务端渲染
 */
const checkServerSideRendering = async (url) => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'WebsiteOptimization/1.0' }
    })

    if (!response.ok) {
      return { type: 'unknown', details: { error: '获取页面失败' } }
    }

    const html = await response.text()
    const noscriptCount = (html.match(/<noscript[\s>]/gi) || []).length
    const scriptCount = (html.match(/<script/gi) || []).length
    
    // 检查框架特征
    const hasNextJs = /_next\/static|__NEXT_DATA__/i.test(html)
    const hasNuxt = /__nuxt|_nuxt/i.test(html)
    const hasReact = /data-react|react-root/i.test(html)
    const hasVue = /data-v-|__vue__/i.test(html)
    
    // 提取文本内容长度
    const textContent = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                           .replace(/<style[\s\S]*?<\/style>/gi, '')
                           .replace(/<[^>]+>/g, ' ')
    const textLength = cleanText(textContent).length
    const hasSubstantialContent = textLength > 500

    let type = 'ssr'
    if (hasNextJs || hasNuxt) {
      type = 'ssr_with_js'
    } else if ((hasReact || hasVue) && !hasSubstantialContent) {
      type = 'client_rendering'
    } else if (scriptCount > 10 && !hasSubstantialContent) {
      type = 'client_rendering'
    }

    return {
      type,
      details: { noscriptCount, scriptCount, textLength, hasSubstantialContent }
    }
  } catch (error) {
    return { type: 'unknown', details: { error: error.message } }
  }
}

/**
 * P1: 检测标题结构 H1-H6
 */
const checkHeadingStructure = (html) => {
  const headings = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 }
  
  for (let i = 1; i <= 6; i++) {
    const regex = new RegExp(`<h${i}[\\s>]([\\s\\S]*?)</h${i}>`, 'gi')
    let match
    while ((match = regex.exec(html)) !== null) {
      headings['h' + i]++
    }
  }

  return {
    count: headings,
    hasH1: headings.h1 > 0,
    hasMultipleH1: headings.h1 > 1,
    hasProperHierarchy: headings.h1 > 0 && (headings.h2 > 0 || headings.h3 > 0),
    total: Object.values(headings).reduce((a, b) => a + b, 0)
  }
}

/**
 * P1: 检测内容长度
 */
const checkContentLength = (html) => {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                   .replace(/<style[\s\S]*?<\/style>/gi, '')
                   .replace(/<[^>]+>/g, ' ')
                   .replace(/&[a-z]+;/gi, ' ')
  
  const textLength = cleanText(text).length
  const wordCount = Math.round(textLength / 2)
  
  return {
    charCount: textLength,
    wordCount,
    chineseChars: (text.match(/[\u4e00-\u9fa5]/g) || []).length,
    isAdequate: wordCount >= 500
  }
}

/**
 * P1: 检测 FAQ 内容
 */
const checkFaqContent = (html) => {
  const patterns = [
    /<details[\s>][\s\S]*?<summary[\s>]/i,
    /<dl[\s>][\s\S]*?<dt[\s>]/i,
    /常见问题|FAQ[:\s]|Q&A[:\s]/i
  ]
  
  const hasFaqPattern = patterns.some(p => p.test(html))
  
  // 提取问答对
  const qaPairs = []
  const dlRegex = /<dt[^>]*>([\s\S]*?)<\/dt>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/gi
  let match
  while ((match = dlRegex.exec(html)) !== null && qaPairs.length < 5) {
    qaPairs.push({ question: cleanText(match[1]), answer: cleanText(match[2]) })
  }

  return { hasFaqPattern, count: qaPairs.length }
}

/**
 * P1: 检测 Meta 标签
 */
const checkMetaTags = (html) => {
  const meta = { title: '', description: '', viewport: false, ogTags: {}, twitterTags: {}, canonical: '' }
  
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) meta.title = cleanText(titleMatch[1])
  
  const metaRegex = /<meta[^>]+>/gi
  let match
  while ((match = metaRegex.exec(html)) !== null) {
    const tag = match[0]
    
    const nameMatch = tag.match(/name=["']([^"']+)["'][^>]*content=["']([^"']+)["']/i)
    if (nameMatch) {
      const name = nameMatch[1].toLowerCase()
      if (name === 'description') meta.description = nameMatch[2]
      else if (name === 'viewport') meta.viewport = true
    }
    
    const ogMatch = tag.match(/property=["'](og:[^"']+)["'][^>]*content=["']([^"']+)["']/i)
    if (ogMatch) meta.ogTags[ogMatch[1]] = ogMatch[2]
    
    const twitterMatch = tag.match(/name=["'](twitter:[^"']+)["'][^>]*content=["']([^"']+)["']/i)
    if (twitterMatch) meta.twitterTags[twitterMatch[1]] = twitterMatch[2]
  }
  
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
  if (canonicalMatch) meta.canonical = canonicalMatch[1]

  return {
    ...meta,
    hasTitle: meta.title.length > 0,
    hasDescription: meta.description.length > 0,
    hasOgImage: !!meta.ogTags['og:image'],
    hasTwitterCard: Object.keys(meta.twitterTags).length > 0,
    hasCanonical: !!meta.canonical
  }
}

/**
 * P1: 检测图片 Alt 标签
 */
const checkImageAlt = (html) => {
  const images = []
  const imgRegex = /<img[^>]+>/gi
  let match
  while ((match = imgRegex.exec(html)) !== null && images.length < 30) {
    const tag = match[0]
    const altMatch = tag.match(/alt=["']([^"']*)["']/i)
    images.push({ hasAlt: !!altMatch && altMatch[1].length > 0 })
  }
  
  const withAlt = images.filter(i => i.hasAlt).length
  return {
    total: images.length,
    withAlt,
    withoutAlt: images.length - withAlt,
    altRatio: images.length > 0 ? Math.round((withAlt / images.length) * 100) : 100
  }
}

/**
 * P2: 检测 HTTPS
 */
const checkHttps = (url) => {
  const isHttps = url.startsWith('https://')
  return { isHttps, status: isHttps ? 'secure' : 'insecure' }
}

/**
 * 主检测函数
 */
export const analyzeWebsite = async (url, onProgress) => {
  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl) throw new Error('无效的URL')

  // 检查缓存
  const cacheKey = getDomain(normalizedUrl)
  const cached = getCache(cacheKey)
  if (cached) return cached

  const results = {
    url: normalizedUrl,
    checkedAt: new Date().toISOString(),
    dimensions: {
      tech: { score: 0, checked: 0, total: 5, items: [] },
      structure: { score: 0, checked: 0, total: 5, items: [] },
      schema: { score: 0, checked: 0, total: 5, items: [] },
      aiFriendly: { score: 0, checked: 0, total: 5, items: [] }
    },
    issues: { warn: [], pass: [] },
    details: []
  }

  // === P0: 技术基础维度 ===
  onProgress?.(0, 'tech')
  
  // HTTPS
  const httpsResult = checkHttps(normalizedUrl)
  results.dimensions.tech.items.push({
    name: 'HTTPS 协议', result: httpsResult.isHttps ? 'pass' : 'fail',
    value: httpsResult.isHttps ? '已启用' : '未启用'
  })
  if (httpsResult.isHttps) {
    results.dimensions.tech.checked++
    results.dimensions.tech.score += 5
    results.issues.pass.push({ title: '使用 HTTPS 加密', desc: '网站使用 HTTPS 协议', level: 'pass', impact: 5 })
  } else {
    results.issues.warn.push({ title: '未启用 HTTPS', desc: '建议启用HTTPS', fix: '安装SSL证书', level: 'warn', impact: 8 })
  }
  
  await sleep(100)

  // robots.txt
  onProgress?.(30, 'tech')
  const robotsResult = await checkRobotsTxt(normalizedUrl)
  
  let robotsStatus = robotsResult.status === 'allowed' ? '允许AI爬虫' : 
                     robotsResult.status === 'blocked' ? '已禁止AI爬虫' : '未检测到'
  
  results.dimensions.tech.items.push({
    name: 'robots.txt', result: robotsResult.status === 'allowed' ? 'pass' : 'fail',
    value: robotsStatus
  })
  
  if (robotsResult.status === 'allowed') {
    results.dimensions.tech.checked++
    results.dimensions.tech.score += 5
    results.issues.pass.push({ title: 'robots.txt 配置正确', desc: '允许AI爬虫访问', level: 'pass', impact: 5 })
  } else if (robotsResult.status === 'blocked') {
    results.issues.warn.push({ title: 'robots.txt 限制AI爬虫', desc: '部分爬虫被禁止', fix: '检查robots.txt配置', level: 'warn', impact: 10 })
  } else {
    results.issues.warn.push({ title: 'robots.txt 未配置', desc: '未找到robots.txt', fix: '创建robots.txt', level: 'warn', impact: 8 })
  }
  
  await sleep(200)

  // === 获取页面内容 ===
  onProgress?.(50, 'structure')
  let html = ''
  let metaResult, headingResult, contentResult, imageResult
  
  try {
    const response = await fetch(normalizedUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'WebsiteOptimization/1.0' }
    })
    
    if (response.ok) {
      html = await response.text()
      
      // Meta标签
      metaResult = checkMetaTags(html)
      
      results.dimensions.structure.items.push({
        name: 'Title 标签', result: metaResult.hasTitle ? 'pass' : 'fail',
        value: metaResult.hasTitle ? `${metaResult.title.length}字符` : '未设置'
      })
      if (metaResult.hasTitle) {
        results.dimensions.structure.checked++
        results.dimensions.structure.score += 4
        results.issues.pass.push({ title: '页面标题完善', desc: '包含有效Title', level: 'pass', impact: 4 })
      } else {
        results.issues.warn.push({ title: '缺少页面标题', fix: '添加<title>标签', level: 'warn', impact: 5 })
      }

      results.dimensions.structure.items.push({
        name: 'Meta Description', result: metaResult.hasDescription ? 'pass' : 'fail',
        value: metaResult.hasDescription ? `${metaResult.description.length}字符` : '未设置'
      })
      if (metaResult.hasDescription) {
        results.dimensions.structure.checked++
        results.dimensions.structure.score += 3
      } else {
        results.issues.warn.push({ title: '缺少Meta Description', fix: '添加description标签', level: 'warn', impact: 3 })
      }
      
      // Canonical
      results.dimensions.tech.items.push({
        name: 'Canonical 标签', result: metaResult.hasCanonical ? 'pass' : 'fail',
        value: metaResult.hasCanonical ? '已设置' : '未设置'
      })
      if (metaResult.hasCanonical) {
        results.dimensions.tech.checked++
        results.dimensions.tech.score += 3
      }

      // 标题结构
      headingResult = checkHeadingStructure(html)
      results.dimensions.structure.items.push({
        name: 'H1 标签', result: (headingResult.hasH1 && !headingResult.hasMultipleH1) ? 'pass' : 'fail',
        value: `${headingResult.count.h1}个`
      })
      if (headingResult.hasH1 && !headingResult.hasMultipleH1) {
        results.dimensions.structure.checked++
        results.dimensions.structure.score += 4
        results.issues.pass.push({ title: 'H1结构合理', desc: '有1个H1标签', level: 'pass', impact: 4 })
      } else if (headingResult.hasMultipleH1) {
        results.issues.warn.push({ title: 'H1标签过多', fix: '保留一个H1', level: 'warn', impact: 4 })
      } else {
        results.issues.warn.push({ title: '缺少H1标签', fix: '添加<h1>标签', level: 'warn', impact: 5 })
      }
      
      results.dimensions.structure.items.push({
        name: 'H2-H6层级', result: headingResult.hasProperHierarchy ? 'pass' : 'fail',
        value: `H2:${headingResult.count.h2} H3:${headingResult.count.h3}`
      })
      if (headingResult.hasProperHierarchy) {
        results.dimensions.structure.checked++
        results.dimensions.structure.score += 3
      }

      // 内容长度
      contentResult = checkContentLength(html)
      results.dimensions.structure.items.push({
        name: '内容长度', result: contentResult.isAdequate ? 'pass' : 'fail',
        value: `${contentResult.wordCount}字`
      })
      if (contentResult.isAdequate) {
        results.dimensions.structure.checked++
        results.dimensions.structure.score += 5
        results.issues.pass.push({ title: '内容充实', desc: `约${contentResult.wordCount}字`, level: 'pass', impact: 5 })
      } else {
        results.issues.warn.push({ title: '内容偏少', desc: `约${contentResult.wordCount}字`, fix: '增加内容至500字以上', level: 'warn', impact: 5 })
      }

      // 图片Alt
      imageResult = checkImageAlt(html)
      results.dimensions.structure.items.push({
        name: '图片Alt标签', result: imageResult.altRatio >= 80 ? 'pass' : 'fail',
        value: `${imageResult.withAlt}/${imageResult.total}`
      })
      if (imageResult.altRatio >= 80) {
        results.dimensions.structure.checked++
        results.dimensions.structure.score += 3
      } else {
        results.issues.warn.push({ title: '图片Alt缺失', desc: `${imageResult.withoutAlt}张图片缺少alt`, fix: '为所有图片添加alt', level: 'warn', impact: 3 })
      }
    }
  } catch (error) {
    results.issues.warn.push({ title: '页面获取失败', desc: error.message, level: 'warn', impact: 5 })
  }
  
  await sleep(200)

  // === P0: Schema检测 ===
  onProgress?.(70, 'schema')
  const schemaResult = await checkSchemaMarkup(normalizedUrl)
  
  results.dimensions.schema.items.push({
    name: 'JSON-LD Schema', result: schemaResult.hasAny ? 'pass' : 'fail',
    value: schemaResult.hasAny ? schemaResult.found.join(', ') : '未检测到'
  })
  
  if (schemaResult.hasAny) {
    results.dimensions.schema.checked++
    results.dimensions.schema.score += 5
    results.issues.pass.push({ 
      title: '包含结构化数据', 
      desc: `检测到${schemaResult.count}个Schema: ${schemaResult.found.join(', ')}`, 
      level: 'pass', impact: 5 
    })
  } else {
    results.issues.warn.push({ 
      title: '缺少JSON-LD Schema', 
      desc: '未检测到Schema Markup', 
      fix: '添加Organization/Article Schema', 
      level: 'warn', impact: 6 
    })
  }
  
  // FAQ Schema
  if (schemaResult.found.includes('FAQPage') || schemaResult.found.includes('QAPage')) {
    results.dimensions.aiFriendly.checked++
    results.dimensions.aiFriendly.score += 5
    results.issues.pass.push({ title: '包含FAQ Schema', desc: '有结构化FAQ数据', level: 'pass', impact: 5 })
  }

  // OpenGraph
  results.dimensions.schema.items.push({
    name: 'OpenGraph标签', result: Object.keys(metaResult?.ogTags || {}).length > 0 ? 'pass' : 'fail',
    value: Object.keys(metaResult?.ogTags || {}).length > 0 ? '已设置' : '未设置'
  })
  if (Object.keys(metaResult?.ogTags || {}).length > 0) {
    results.dimensions.schema.checked++
    results.dimensions.schema.score += 3
  } else {
    results.issues.warn.push({ title: '缺少OpenGraph', fix: '添加og:image等标签', level: 'warn', impact: 3 })
  }

  await sleep(200)

  // === P0: SSR检测 ===
  onProgress?.(85, 'aiFriendly')
  const ssrResult = await checkServerSideRendering(normalizedUrl)
  
  results.dimensions.aiFriendly.items.push({
    name: '服务端渲染', result: ssrResult.type !== 'client_rendering' ? 'pass' : 'fail',
    value: ssrResult.type === 'ssr' ? 'SSR' : ssrResult.type === 'ssr_with_js' ? 'SSR+JS' : '客户端渲染'
  })
  
  if (ssrResult.type !== 'client_rendering') {
    results.dimensions.aiFriendly.checked++
    results.dimensions.aiFriendly.score += 5
    results.issues.pass.push({ 
      title: '渲染方式友好', 
      desc: ssrResult.type === 'ssr' ? '纯SSR，爬虫友好' : 'SSR+JS，爬虫较友好', 
      level: 'pass', impact: 5 
    })
  } else {
    results.issues.warn.push({ 
      title: '客户端渲染', 
      desc: '页面主要靠JS渲染，可能影响爬虫抓取', 
      fix: '考虑使用SSR/SSG', 
      level: 'warn', impact: 8 
    })
  }

  // FAQ内容
  if (html) {
    const faqResult = checkFaqContent(html)
    results.dimensions.aiFriendly.items.push({
      name: 'FAQ内容', result: faqResult.hasFaqPattern || faqResult.count > 0 ? 'pass' : 'fail',
      value: faqResult.hasFaqPattern || faqResult.count > 0 ? '有FAQ内容' : '未检测到'
    })
    if (faqResult.hasFaqPattern || faqResult.count > 0) {
      results.dimensions.aiFriendly.checked++
      results.dimensions.aiFriendly.score += 3
    }
  }

  // AI爬虫权限
  results.dimensions.aiFriendly.items.push({
    name: 'AI爬虫权限', result: robotsResult.status === 'allowed' ? 'pass' : 'fail',
    value: robotsResult.status === 'allowed' ? '允许' : robotsResult.status === 'blocked' ? '禁止' : '未知'
  })
  
  if (robotsResult.status === 'allowed') {
    results.dimensions.aiFriendly.checked++
    results.dimensions.aiFriendly.score += 5
  }

  // === 构建details ===
  results.details = [
    ...results.dimensions.tech.items,
    ...results.dimensions.structure.items,
    ...results.dimensions.schema.items,
    ...results.dimensions.aiFriendly.items
  ]

  // 缓存结果
  setCache(cacheKey, results)
  
  onProgress?.(100, 'complete')
  
  return results
}
