import { chromium } from 'playwright';
import fs from 'fs';

const PLATFORM_CONFIG = {
  '小红书': {
    baseUrl: 'https://www.xiaohongshu.com',
    loginUrl: 'https://www.xiaohongshu.com/login',
    // 精确匹配：URL 是 /login 或包含 /login? 才算未登录（Bug7修复）
    loginSuccessCheck: (url) => {
      try {
        const u = new URL(url);
        return !u.pathname.startsWith('/login');
      } catch { return false; }
    },
    // 用于验证 session 的 Cookie 名称（过期时间判断）
    sessionCookieName: 'web_session',
  },
  '抖音': {
    baseUrl: 'https://www.douyin.com',
    loginUrl: 'https://www.douyin.com/login',
    loginSuccessCheck: (url) => {
      try {
        const u = new URL(url);
        return !u.pathname.startsWith('/login');
      } catch { return false; }
    },
    sessionCookieName: 'sessionid',
  },
  '微博': {
    baseUrl: 'https://weibo.com',
    loginUrl: 'https://passport.weibo.com/signin/login',
    loginSuccessCheck: (url) => url.includes('weibo.com') && !url.includes('passport.weibo'),
    sessionCookieName: 'SUB',
  },
  '知乎': {
    baseUrl: 'https://www.zhihu.com',
    loginUrl: 'https://www.zhihu.com/signin',
    loginSuccessCheck: (url) => {
      try {
        const u = new URL(url);
        return !u.pathname.startsWith('/signin');
      } catch { return false; }
    },
    sessionCookieName: 'z_c0',
  },
};

// 内存中的活跃浏览器会话（accountId -> session）
const activeSessions = new Map();

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 反检测 initScript */
const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const arr = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ];
      arr.__proto__ = PluginArray.prototype;
      return arr;
    }
  });
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
  if (!window.chrome) window.chrome = { runtime: {} };
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
`;

function findSystemChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p)) || null;
}

function buildLaunchOptions(headless = false) {
  const executablePath = findSystemChrome();
  const opts = {
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--lang=zh-CN',
      '--start-maximized',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };
  if (executablePath) {
    opts.executablePath = executablePath;
    console.log('[Playwright] 使用系统 Chrome：', executablePath);
  } else {
    console.log('[Playwright] 未找到系统 Chrome，使用内置 Chromium');
  }
  return opts;
}

function buildContextOptions(storageState) {
  const opts = {
    userAgent: DEFAULT_USER_AGENT,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
  };
  if (storageState) opts.storageState = storageState;
  return opts;
}

function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

/**
 * 启动授权流程：打开浏览器并跳转到登录页
 */
export async function startAuth(accountId, platform, phoneNumber) {
  await closeSession(accountId);

  const config = PLATFORM_CONFIG[platform];
  if (!config) throw new Error(`不支持的平台：${platform}`);

  const browser = await chromium.launch(buildLaunchOptions(false));
  const context = await browser.newContext(buildContextOptions());
  await context.addInitScript(STEALTH_SCRIPT);
  const page = await context.newPage();

  const session = {
    browser, context, page, platform,
    status: 'opening',
    phoneNumber: phoneNumber || null,
  };
  activeSessions.set(String(accountId), session);

  try {
    await page.goto(config.baseUrl, { waitUntil: 'commit', timeout: 30000 });
    await randomDelay(800, 1500);
    await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    session.status = 'browser_opened';

    if (platform === '小红书' && phoneNumber) {
      await autoFillXhsPhone(page, phoneNumber, session);
    }

    return { success: true, status: session.status, message: '浏览器已打开，请在弹出的窗口中完成登录' };
  } catch (err) {
    await closeSession(accountId);
    throw new Error('打开授权浏览器失败：' + err.message);
  }
}

/** 小红书：自动填入手机号并发送验证码（Bug6修复：区分失败原因，避免状态设错） */
async function autoFillXhsPhone(page, phoneNumber, session) {
  try {
    await page.waitForSelector('form, [class*="login"], [class*="sign"]', { timeout: 10000 });

    const phoneTab = await page.$('[class*="phone"], [data-type="phone"], :text("手机号登录")');
    if (phoneTab) {
      await phoneTab.click();
      await randomDelay(600, 1000);
    }

    const phoneInput = await page.$('input[type="tel"], input[placeholder*="手机号"], input[name="phone"]');
    if (!phoneInput) {
      // 找不到输入框，让用户手动操作
      session.status = 'browser_opened';
      return;
    }

    await phoneInput.click();
    await randomDelay(200, 400);
    for (const ch of phoneNumber) {
      await phoneInput.type(ch, { delay: 60 + Math.random() * 80 });
    }
    await randomDelay(400, 800);

    const sendBtn = await page.$('button:has-text("获取验证码"), button:has-text("发送验证码"), [class*="send-code"]');
    if (sendBtn) {
      await sendBtn.click();
      session.status = 'waiting_sms_code';
    } else {
      session.status = 'browser_opened';
    }
  } catch (err) {
    console.warn('[autoFillXhsPhone] 自动填写失败，切换为手动模式：', err.message);
    session.status = 'browser_opened';
  }
}

/** 提交短信验证码 */
export async function submitSmsCode(accountId, code) {
  const session = activeSessions.get(String(accountId));
  if (!session) throw new Error('没有活跃的授权会话，请重新点击「开始授权」');

  const { page } = session;
  try {
    const codeInput = await page.$(
      'input[placeholder*="验证码"], input[maxlength="6"], input[maxlength="4"], input[type="number"]'
    );
    if (!codeInput) throw new Error('未找到验证码输入框，请在浏览器窗口中手动操作');

    await codeInput.click();
    for (const ch of code) {
      await codeInput.type(ch, { delay: 50 + Math.random() * 60 });
    }
    await randomDelay(300, 600);

    const loginBtn = await page.$(
      'button[type="submit"], button:has-text("登录"), button:has-text("确认"), [class*="login-btn"]'
    );
    if (loginBtn) await loginBtn.click();

    session.status = 'submitting';
    return { success: true, message: '验证码已提交，正在等待跳转…' };
  } catch (err) {
    throw new Error('提交验证码失败：' + err.message);
  }
}

/**
 * 用户确认已登录后，捕获 storageState
 * Bug1修复：失败时不关闭浏览器，让用户可以继续操作后重试
 */
export async function captureSession(accountId) {
  const session = activeSessions.get(String(accountId));
  if (!session) throw new Error('没有活跃的授权会话，请重新点击「开始授权」');

  const { context, page, platform } = session;
  const config = PLATFORM_CONFIG[platform];

  // 检查登录状态
  let currentUrl;
  try {
    currentUrl = page.url();
  } catch {
    // 页面已关闭
    activeSessions.delete(String(accountId));
    throw new Error('浏览器已关闭，请重新点击「开始授权」');
  }

  if (!config.loginSuccessCheck(currentUrl)) {
    // 未登录：不关浏览器，让用户继续操作
    throw new Error('当前页面仍为登录页，请先完成登录后再点击「我已完成登录」');
  }

  // 已登录：抓取 session
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    const storageState = await context.storageState();
    session.status = 'authorized';
    // 成功后才关闭浏览器
    await closeSession(accountId);
    return { success: true, storageState, userAgent: DEFAULT_USER_AGENT };
  } catch (err) {
    // 抓取失败：同样不关浏览器，保留让用户重试
    session.status = 'browser_opened';
    throw new Error('保存登录状态失败：' + err.message);
  }
}

/**
 * 验证已保存的 session 是否仍然有效
 * Bug2修复：不使用无头浏览器（会被 XHS 等平台拒绝），改为检查 Cookie 过期时间
 * 若 Cookie 还未过期则视为有效，若已过期则返回 false
 */
export function verifySession(platform, sessionStateJson) {
  if (!sessionStateJson) return false;
  const config = PLATFORM_CONFIG[platform];
  if (!config) return false;

  try {
    const sessionState =
      typeof sessionStateJson === 'string' ? JSON.parse(sessionStateJson) : sessionStateJson;

    const cookies = sessionState?.cookies || [];
    const cookieName = config.sessionCookieName;

    // 查找关键 session cookie
    const sessionCookie = cookies.find(c =>
      c.name === cookieName &&
      (c.domain?.includes(new URL(config.baseUrl).hostname.replace('www.', '')) ||
       c.domain?.includes(new URL(config.baseUrl).hostname))
    );

    if (!sessionCookie) return false;

    // Cookie 有明确过期时间时检查是否过期
    if (sessionCookie.expires && sessionCookie.expires > 0) {
      const expiresMs = sessionCookie.expires * 1000;
      return Date.now() < expiresMs;
    }

    // Session Cookie（无过期时间）：假定有效，交由实际发帖时发现
    return true;
  } catch {
    return false;
  }
}

export async function closeSession(accountId) {
  const session = activeSessions.get(String(accountId));
  if (session) {
    try { await session.browser.close(); } catch {}
    activeSessions.delete(String(accountId));
  }
}

export function getSessionStatus(accountId) {
  const session = activeSessions.get(String(accountId));
  return session ? session.status : null;
}

/**
 * 后端启动时调用：将 DB 中残留的 pending auth_status 清除
 * Bug3修复：避免后端重启后 DB 状态与内存不一致
 */
export function getActiveSessions() {
  return activeSessions;
}
