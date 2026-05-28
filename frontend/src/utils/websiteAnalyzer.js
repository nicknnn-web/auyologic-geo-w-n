/**
 * 网站技术检测服务 - P0/P1/P2 级别检测
 * 使用 fetch + 正则解析 HTML
 */
import { getAIFriendlinessPromptSet, buildAIFriendlinessPrompt } from '../prompts/index.js'

// 浏览器 User-Agent 池，用于绕过反爬虫
const USER_AGENTS = [
  // PC Chrome
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  // PC Firefox
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  // Mac Chrome
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Mac Safari
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  // iPhone
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  // iPad
  'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  // Android
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  // Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
]

// 模拟搜索引擎来源
const REFERERS = [
  'https://www.google.com/',
  'https://www.baidu.com/',
  'https://www.bing.com/',
  'https://www.sogou.com/',
  'https://so.com/'
]

let currentUAIndex = 0
let currentRefIndex = 0

const getNextUA = () => {
  const ua = USER_AGENTS[currentUAIndex]
  currentUAIndex = (currentUAIndex + 1) % USER_AGENTS.length
  return ua
}

const getNextReferer = () => {
  const ref = REFERERS[currentRefIndex]
  currentRefIndex = (currentRefIndex + 1) % REFERERS.length
  return ref
}

// 知名网站白名单 - 给传统门户网站保底分数 + AI亲和性额外加分
// bonus: 保底分数（原有逻辑）, aiBonus: AI亲和性额外加分（新逻辑）, tier: 权威等级(1-5, 5最高)
const FAMOUS_WEBSITES = {
  // ==========  BAT (百度、阿里、腾讯) - 最高权威 ==========
  'baidu.com': { name: '百度', type: 'search', bonus: 30, aiBonus: 15, tier: 5 },
  'alibaba.com': { name: '阿里巴巴', type: 'ecommerce', bonus: 25, aiBonus: 12, tier: 5 },
  'taobao.com': { name: '淘宝', type: 'ecommerce', bonus: 28, aiBonus: 14, tier: 5 },
  'tmall.com': { name: '天猫', type: 'ecommerce', bonus: 25, aiBonus: 12, tier: 5 },
  'jd.com': { name: '京东', type: 'ecommerce', bonus: 28, aiBonus: 14, tier: 5 },
  'qq.com': { name: '腾讯', type: 'portal', bonus: 28, aiBonus: 14, tier: 5 },
  'tencent.com': { name: '腾讯官网', type: 'portal', bonus: 25, aiBonus: 12, tier: 5 },
  'weixin.qq.com': { name: '微信', type: 'social', bonus: 30, aiBonus: 15, tier: 5 },
  'weibo.com': { name: '微博', type: 'social', bonus: 25, aiBonus: 12, tier: 5 },

  // ========== 字节跳动 (ByteDance) ==========
  'bytedance.com': { name: '字节跳动', type: 'tech', bonus: 25, aiBonus: 12, tier: 5 },
  'douyin.com': { name: '抖音', type: 'video', bonus: 28, aiBonus: 14, tier: 5 },
  'toutiao.com': { name: '今日头条', type: 'news', bonus: 25, aiBonus: 12, tier: 5 },
  'xiguavideo.com': { name: '西瓜视频', type: 'video', bonus: 20, aiBonus: 10, tier: 4 },
  'feishu.cn': { name: '飞书', type: 'tech', bonus: 20, aiBonus: 10, tier: 4 },
  'larkoffice.com': { name: '飞书国际', type: 'tech', bonus: 20, aiBonus: 10, tier: 4 },

  // ========== TMD (字节、美团、滴滴) ==========
  'meituan.com': { name: '美团', type: 'ecommerce', bonus: 25, aiBonus: 12, tier: 5 },
  'dianping.com': { name: '大众点评', type: 'review', bonus: 22, aiBonus: 11, tier: 4 },
  'didiglobal.com': { name: '滴滴出行', type: 'tech', bonus: 22, aiBonus: 11, tier: 4 },
  'xiaojukeji.com': { name: '滴滴出行', type: 'tech', bonus: 22, aiBonus: 11, tier: 4 },

  // ========== 其他顶尖互联网公司 ==========
  'pinduoduo.com': { name: '拼多多', type: 'ecommerce', bonus: 22, aiBonus: 11, tier: 4 },
  'bilibili.com': { name: 'B站', type: 'video', bonus: 25, aiBonus: 12, tier: 4 },
  'zhihu.com': { name: '知乎', type: 'social', bonus: 25, aiBonus: 12, tier: 4 },
  'xiaohongshu.com': { name: '小红书', type: 'social', bonus: 22, aiBonus: 11, tier: 4 },
  'kuaishou.com': { name: '快手', type: 'video', bonus: 22, aiBonus: 11, tier: 4 },
  'huoshan.com': { name: '火山引擎', type: 'video', bonus: 20, aiBonus: 10, tier: 4 },
  '163.com': { name: '网易', type: 'portal', bonus: 25, aiBonus: 12, tier: 4 },
  '126.com': { name: '网易126', type: 'portal', bonus: 20, aiBonus: 10, tier: 4 },
  'youku.com': { name: '优酷', type: 'video', bonus: 18, aiBonus: 9, tier: 3 },
  'iqiyi.com': { name: '爱奇艺', type: 'video', bonus: 18, aiBonus: 9, tier: 3 },

  // ========== 搜索引擎 ==========
  'sogou.com': { name: '搜狗', type: 'search', bonus: 18, aiBonus: 9, tier: 3 },
  'so.com': { name: '360搜索', type: 'search', bonus: 15, aiBonus: 8, tier: 3 },
  'bing.com': { name: '必应', type: 'search', bonus: 25, aiBonus: 12, tier: 4 },
  'google.com': { name: '谷歌', type: 'search', bonus: 30, aiBonus: 15, tier: 5 },

  // ========== 传统门户 ==========
  'sina.com.cn': { name: '新浪', type: 'portal', bonus: 25, aiBonus: 12, tier: 4 },
  'sohu.com': { name: '搜狐', type: 'portal', bonus: 22, aiBonus: 11, tier: 3 },
  'ifeng.com': { name: '凤凰网', type: 'portal', bonus: 20, aiBonus: 10, tier: 3 },
  'tom.com': { name: 'Tom网', type: 'portal', bonus: 15, aiBonus: 7, tier: 2 },
  'yeah.net': { name: 'yeah.net', type: 'portal', bonus: 12, aiBonus: 6, tier: 2 },

  // ========== 新闻媒体 ==========
  'xinhuanet.com': { name: '新华网', type: 'news', bonus: 25, aiBonus: 12, tier: 4 },
  'people.com.cn': { name: '人民网', type: 'news', bonus: 25, aiBonus: 12, tier: 4 },
  'cctv.com': { name: '央视网', type: 'news', bonus: 25, aiBonus: 12, tier: 4 },
  'chinadaily.com.cn': { name: '中国日报', type: 'news', bonus: 20, aiBonus: 10, tier: 3 },
  'gs.cn': { name: '中国日报', type: 'news', bonus: 20, aiBonus: 10, tier: 3 },

  // ========== 社交/社区 ==========
  'douban.com': { name: '豆瓣', type: 'social', bonus: 20, aiBonus: 10, tier: 3 },
  'weibo.com': { name: '微博', type: 'social', bonus: 22, aiBonus: 11, tier: 4 },
  'twitter.com': { name: 'Twitter/X', type: 'social', bonus: 28, aiBonus: 14, tier: 5 },
  'facebook.com': { name: 'Facebook', type: 'social', bonus: 28, aiBonus: 14, tier: 5 },
  'instagram.com': { name: 'Instagram', type: 'social', bonus: 25, aiBonus: 12, tier: 4 },
  'linkedin.com': { name: 'LinkedIn', type: 'social', bonus: 22, aiBonus: 11, tier: 4 },
  'reddit.com': { name: 'Reddit', type: 'social', bonus: 22, aiBonus: 11, tier: 4 },

  // ========== 视频/流媒体 ==========
  'youtube.com': { name: 'YouTube', type: 'video', bonus: 30, aiBonus: 15, tier: 5 },
  'vimeo.com': { name: 'Vimeo', type: 'video', bonus: 20, aiBonus: 10, tier: 3 },
  'twitch.tv': { name: 'Twitch', type: 'video', bonus: 22, aiBonus: 11, tier: 4 },

  // ========== 电商/本地生活 ==========
  // alibaba.com 已在上方定义为 tier 5
  'tiktok.com': { name: 'TikTok', type: 'video', bonus: 28, aiBonus: 14, tier: 5 },
  'amazon.com': { name: 'Amazon', type: 'ecommerce', bonus: 28, aiBonus: 14, tier: 5 },
  'ebay.com': { name: 'eBay', type: 'ecommerce', bonus: 22, aiBonus: 11, tier: 4 },

  // ========== 工具/云服务 ==========
  'aliyun.com': { name: '阿里云', type: 'tech', bonus: 25, aiBonus: 12, tier: 4 },
  'tencentcloud.com': { name: '腾讯云', type: 'tech', bonus: 22, aiBonus: 11, tier: 4 },
  'cloudflare.com': { name: 'Cloudflare', type: 'tech', bonus: 22, aiBonus: 11, tier: 4 },
  'github.com': { name: 'GitHub', type: 'tech', bonus: 28, aiBonus: 14, tier: 5 },
  'stackoverflow.com': { name: 'Stack Overflow', type: 'tech', bonus: 25, aiBonus: 12, tier: 4 },

  // ========== 资讯/百科 ==========
  'wikipedia.org': { name: '维基百科', type: 'reference', bonus: 30, aiBonus: 15, tier: 5 },
  'baike.baidu.com': { name: '百度百科', type: 'reference', bonus: 25, aiBonus: 12, tier: 4 },
  'zh.wikipedia.org': { name: '中文维基百科', type: 'reference', bonus: 25, aiBonus: 12, tier: 4 },

  // ========== 金融 ==========
  'alipay.com': { name: '支付宝', type: 'finance', bonus: 28, aiBonus: 14, tier: 5 },
  'antgroup.com': { name: '蚂蚁集团', type: 'finance', bonus: 22, aiBonus: 11, tier: 4 },
  'tenpay.com': { name: '微信支付', type: 'finance', bonus: 20, aiBonus: 10, tier: 4 },

  // ========== 教育 ==========
  'coursera.org': { name: 'Coursera', type: 'education', bonus: 22, aiBonus: 11, tier: 4 },
  'udemy.com': { name: 'Udemy', type: 'education', bonus: 22, aiBonus: 11, tier: 4 },
  'icourse163.org': { name: '中国大学MOOC', type: 'education', bonus: 20, aiBonus: 10, tier: 3 },
}

// 获取网站知名度信息
const getWebsiteAuthority = (url) => {
  try {
    const hostname = new URL(url).hostname.toLowerCase()

    // 精确匹配
    if (FAMOUS_WEBSITES[hostname]) {
      return { ...FAMOUS_WEBSITES[hostname], matched: hostname }
    }

    // 域名后缀匹配 (如 163.com 匹配 www.163.com)
    // 按域名长度降序排序，确保更精确的匹配优先
    const sortedDomains = Object.keys(FAMOUS_WEBSITES).sort((a, b) => b.length - a.length)

    for (const domain of sortedDomains) {
      // 处理特殊前缀如 -netEase.com
      if (domain.startsWith('-')) {
        const baseDomain = domain.substring(1)
        if (hostname === baseDomain || hostname.endsWith(baseDomain)) {
          return { ...FAMOUS_WEBSITES[domain], matched: domain }
        }
      } else if (hostname === domain || hostname.endsWith('.' + domain)) {
        return { ...FAMOUS_WEBSITES[domain], matched: domain }
      }
    }

    return null
  } catch {
    return null
  }
}

// 根据权威等级获取AI亲和性额外加分
const getAIBonusByTier = (tier) => {
  const tierBonus = {
    5: 15,  // 顶尖巨头 (BAT, Google, YouTube等)
    4: 10,  // 知名大厂 (美团, 滴滴, 知乎等)
    3: 6,   // 中型平台 (传统门户, 视频平台等)
    2: 3,   // 小型网站
    1: 0    // 无权威加成
  }
  return tierBonus[tier] || 0
}

const getHeaders = (uaOverride = null, customReferer = null) => ({
  'User-Agent': uaOverride || getNextUA(),
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'max-age=0',
  'Referer': customReferer || getNextReferer()
})

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

// 带重试的 fetch - 每次重试换 UA 和 Referer
const fetchWithRetry = async (url, options = {}, maxRetries = 3) => {
  let lastError
  for (let i = 0; i <= maxRetries; i++) {
    try {
      // 每次重试都用新的 UA 和 Referer
      const headers = { ...getHeaders(), ...(options.headers || {}) }
      const response = await fetch(url, { ...options, headers })

      // 检查是否被拦截（通常返回 403 或空内容）
      if (response.status === 403 || response.status === 503) {
        throw new Error(`Blocked: ${response.status}`)
      }

      return response
    } catch (error) {
      lastError = error
      // 被拦截时等待更长时间再重试
      const delay = error.message?.includes('Blocked') ? 1000 : 500
      if (i < maxRetries) await sleep(delay)
    }
  }
  throw lastError
}

/**
 * P0: 检测 robots.txt 是否允许 AI 爬虫
 */
const checkRobotsTxt = async (url) => {
  const domain = getDomain(url)
  if (!domain) return { status: 'unknown', details: { error: '无效URL' } }

  const robotsUrl = `https://${domain}/robots.txt`

  try {
    const response = await fetchWithRetry(robotsUrl, { method: 'GET' })

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
    const response = await fetchWithRetry(url, { method: 'GET' })

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
    const response = await fetchWithRetry(url, { method: 'GET' })

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

// AI 代理配置
const getAIBaseURL = () => {
  return (window.VITE_API_URL || window.location.origin) + '/api/ai/generate'
}

/**
 * 从HTML提取纯文本
 */
const extractTextFromHTML = (html) => {
  if (!html) return ''
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

/**
 * 检测页面类型：首页/列表页 vs 文章页
 */
const detectPageType = (html, url) => {
  const urlPath = url.toLowerCase()

  // URL 特征判断
  const isArticleUrl = /\/article\/|\/news\/|\/blog\/|\/post\/|\/p\//.test(urlPath) ||
                       /\/[0-9]{4,}\//.test(urlPath) ||
                       /\.html?$/.test(urlPath)

  // 内容特征判断
  const hasArticleContent = /<article/i.test(html) ||
                            /class=".*article.*"/i.test(html) ||
                            /class=".*content.*"/i.test(html) ||
                            /<div[^>]*id="content"/i.test(html)

  // 门户首页特征
  const isPortalHome = /<nav/i.test(html) &&
                        /<header/i.test(html) &&
                        /<footer/i.test(html) &&
                        /login|register|signin|signup/i.test(html.slice(0, 5000))

  // 列表页特征
  const isListPage = /<ul[^>]*class|ol[^>]*class|div[^>]*class=".*list/i.test(html) &&
                     /<a[^>]+href=["'][^"']+\//i.test(html)

  if (isArticleUrl || hasArticleContent) {
    return 'article'
  } else if (isPortalHome || isListPage) {
    return 'portal'  // 门户首页或列表页
  }
  return 'unknown'
}

/**
 * AI友好度评分 - 简化版，符合实际AI抓取行为
 */
const checkAIFriendlinessSimple = (html, url, robotsResult) => {
  const results = {
    score: 0,
    maxScore: 100,
    items: [],
    issues: [],
    suggestions: []
  }

  // 1. 能否访问（基础分 50）
  const hasContent = html && html.length > 1000
  const contentScore = hasContent ? 50 : 0
  results.items.push({ name: '内容可访问性', score: contentScore, max: 50, value: hasContent ? '正常访问' : '无法获取内容' })
  results.score += contentScore
  if (!hasContent) {
    results.issues.push('网站无法访问或内容获取失败')
  }

  // 2. robots.txt 是否允许 AI（+20）
  let robotsScore = 0
  if (robotsResult) {
    if (robotsResult.status === 'allowed') {
      robotsScore = 20
      results.issues.push('robots.txt 允许AI爬虫')
    } else if (robotsResult.status === 'blocked') {
      robotsScore = 0
      results.issues.push('robots.txt 禁止了AI爬虫')
    } else {
      robotsScore = 10  // 未检测到，默认允许
    }
  } else {
    robotsScore = 10
  }
  results.items.push({ name: 'AI爬虫权限', score: robotsScore, max: 20, value: robotsScore >= 20 ? '允许' : robotsScore > 0 ? '未明确' : '禁止' })
  results.score += robotsScore

  // 3. 是否有版权/引用声明（+15）
  const hasCopyright = /copyright|版权所有|©|转载|引用|repint/i.test(html)
  const copyrightScore = hasCopyright ? 15 : 5
  results.items.push({ name: '版权声明', score: copyrightScore, max: 15, value: hasCopyright ? '有' : '无' })
  results.score += copyrightScore
  if (!hasCopyright) {
    results.suggestions.push('建议添加版权声明和转载规则')
  }

  // 4. 是否有 RSS 或 sitemap（+10）
  const hasRSS = /rss|feed|atom|sitemap\.xml/i.test(html)
  const rssScore = hasRSS ? 10 : 3
  results.items.push({ name: 'RSS/Sitemap', score: rssScore, max: 10, value: hasRSS ? '有' : '无' })
  results.score += rssScore

  // 5. 内容是否足够丰富（+5）
  const textLength = html.replace(/<[^>]+>/g, '').trim().length
  const contentEnough = textLength > 500
  const enoughScore = contentEnough ? 5 : 0
  results.items.push({ name: '内容丰富度', score: enoughScore, max: 5, value: `${Math.round(textLength/1000)}K字符` })
  results.score += enoughScore

  // 总体评价
  if (results.score >= 80) {
    results.suggestions.push('网站对AI非常友好，继续保持')
  } else if (results.score >= 60) {
    results.suggestions.push('网站对AI较友好，部分细节可优化')
  } else {
    results.suggestions.push('建议优化AI抓取友好度')
  }

  return results
}

/**
 * P0: AI亲和性深度分析 - 调用DeepSeek API（分级评分）
 */
const checkAIFriendlinessDeep = async (html, url) => {
  try {
    const textContent = extractTextFromHTML(html)
    const truncatedText = textContent.slice(0, 4000) // 限制内容长度
    const pageType = detectPageType(html, url)

    // 根据页面类型选择 prompt 组合（已抽到 frontend/src/prompts/websiteAnalyzer.js）
    const { systemPrompt, scoringRules } = getAIFriendlinessPromptSet(pageType)

    const response = await fetch(getAIBaseURL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        systemPrompt,
        prompt: buildAIFriendlinessPrompt({ scoringRules, url, truncatedText }),
        temperature: 0.3,
        max_tokens: 1000
      })
    })

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`)
    }

    const data = await response.json()
    const content = data.content || ''

    if (!content) {
      throw new Error('API返回内容为空')
    }

    // 尝试解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0])
      result.pageType = pageType  // 添加页面类型
      return result
    }
    throw new Error('无法解析API返回的JSON')
  } catch (error) {
    console.error('AI代理调用失败:', error)
    return {
      score: 0,
      quality: 0,
      structure: 0,
      entity: 0,
      geo: 0,
      pageType: pageType,
      issues: [`AI分析失败: ${error.message}`],
      suggestions: ['请检查网络连接或稍后重试']
    }
  }
}

/**
 * 主检测函数
 * @param {string} url - 要检测的网址
 * @param {function} onProgress - 进度回调
 * @param {boolean} force - 强制重新检测，忽略缓存
 */
export const analyzeWebsite = async (url, onProgress, force = false) => {
  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl) throw new Error('无效的URL')

  // 检查缓存（除非 force=true）
  const cacheKey = getDomain(normalizedUrl)
  if (!force) {
    const cached = getCache(cacheKey)
    if (cached) return cached
  } else {
    // 强制重新检测时清除缓存
    localStorage.removeItem(CACHE_PREFIX + cacheKey)
  }

  const results = {
    url: normalizedUrl,
    checkedAt: new Date().toISOString(),
    dimensions: {
      tech: { score: 0, checked: 0, total: 4, items: [] },
      structure: { score: 0, checked: 0, total: 5, items: [] },
      schema: { score: 0, checked: 0, total: 3, items: [] },
      aiFriendly: { score: 0, checked: 0, total: 100, items: [] }
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
    const response = await fetchWithRetry(normalizedUrl, { method: 'GET' })

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
    results.dimensions.aiFriendly.score += 3
    results.issues.pass.push({
      title: '渲染方式友好',
      desc: ssrResult.type === 'ssr' ? '纯SSR，爬虫友好' : 'SSR+JS，爬虫较友好',
      level: 'pass', impact: 3
    })
  } else {
    results.issues.warn.push({
      title: '客户端渲染',
      desc: '页面主要靠JS渲染，可能影响爬虫抓取',
      fix: '考虑使用SSR/SSG',
      level: 'warn', impact: 5
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
      results.dimensions.aiFriendly.score += 2
    }
  }

  // AI爬虫权限
  results.dimensions.aiFriendly.items.push({
    name: 'AI爬虫权限', result: robotsResult.status === 'allowed' ? 'pass' : 'fail',
    value: robotsResult.status === 'allowed' ? '允许' : robotsResult.status === 'blocked' ? '禁止' : '未知'
  })

  if (robotsResult.status === 'allowed') {
    results.dimensions.aiFriendly.checked++
    results.dimensions.aiFriendly.score += 3
  }

  // === AI亲和性简化评分（符合实际AI抓取行为）===
  onProgress?.(90, 'aiFriendly')

  // 使用简化版评分
  const aiScore = checkAIFriendlinessSimple(html, normalizedUrl, robotsResult)

  // 将AI分析结果转换为检测项
  for (const item of aiScore.items || []) {
    const pass = item.score >= item.max * 0.6  // 60%通过
    results.dimensions.aiFriendly.items.push({
      name: item.name, result: pass ? 'pass' : 'fail',
      value: `${item.score}/${item.max}分 - ${item.value}`
    })
    if (pass) {
      results.dimensions.aiFriendly.checked++
    }
    results.dimensions.aiFriendly.score += item.score
  }

  // 添加AI友好的问题
  if (aiScore.issues && aiScore.issues.length > 0) {
    for (const issue of aiScore.issues.slice(0, 3)) {
      results.issues.pass.push({
        title: issue,
        desc: 'AI友好',
        level: 'pass',
        impact: 0
      })
    }
  }

  // 添加建议
  if (aiScore.suggestions && aiScore.suggestions.length > 0) {
    for (const suggestion of aiScore.suggestions.slice(0, 2)) {
      results.issues.pass.push({
        title: suggestion,
        desc: '建议',
        level: 'pass',
        impact: 0
      })
    }
  }

  // 总体评价
  if (aiScore.score >= 80) {
    results.issues.pass.push({
      title: 'AI抓取非常友好',
      desc: `综合得分${aiScore.score}/100分，该网站容易被AI引用`,
      level: 'pass',
      impact: 0
    })
  } else if (aiScore.score >= 60) {
    results.issues.pass.push({
      title: 'AI抓取较友好',
      desc: `综合得分${aiScore.score}/100分，该网站较容易被AI引用`,
      level: 'pass',
      impact: 0
    })
  } else {
    results.issues.warn.push({
      title: 'AI抓取有待提升',
      desc: `综合得分${aiScore.score}/100分，建议优化AI友好度`,
      level: 'warn',
      impact: 0
    })
  }

  // === 构建details ===
  results.details = [
    ...results.dimensions.tech.items,
    ...results.dimensions.structure.items,
    ...results.dimensions.schema.items,
    ...results.dimensions.aiFriendly.items
  ]

  // === 知名网站保底分数 + AI亲和性额外加分 ===
  const authority = getWebsiteAuthority(normalizedUrl)
  if (authority) {
    // 计算AI亲和性额外加分
    const aiBonus = authority.aiBonus || getAIBonusByTier(authority.tier || 1)
    const tierLabel = { 5: '顶尖巨头', 4: '知名大厂', 3: '中型平台', 2: '小型网站', 1: '普通网站' }

    // 直接将AI亲和性加分加到总分上
    results.dimensions.aiFriendly.score += aiBonus
    results.dimensions.aiFriendly.checked += 1

    // 添加知名网站加分项到检测结果
    results.dimensions.aiFriendly.items.push({
      name: '网站权威性',
      result: 'pass',
      value: `${authority.name} (${tierLabel[authority.tier] || '普通网站'}) +${aiBonus}分`
    })

    // 记录知名网站信息
    results.famousSiteBonus = {
      name: authority.name,
      type: authority.type,
      tier: authority.tier,
      bonus: authority.bonus,
      aiBonus: aiBonus,
      note: `${authority.name} 为知名${authority.type}网站，权威等级${authority.tier || 1}，给予保底分数 ${authority.bonus} 分，AI亲和性额外加分 ${aiBonus} 分`
    }

    // 添加知名网站加分提示到issues
    results.issues.pass.push({
      title: `${authority.name} 知名网站权威加成`,
      desc: `权威等级${authority.tier || 1} (${tierLabel[authority.tier] || '普通网站'})，AI亲和性额外 +${aiBonus} 分`,
      level: 'pass',
      impact: aiBonus
    })
  }

  // 缓存结果
  setCache(cacheKey, results)

  onProgress?.(100, 'complete')

  return results
}
