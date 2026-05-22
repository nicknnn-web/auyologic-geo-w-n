'use strict';
/**
 * auth.js - 本地 Playwright 授权逻辑
 * 改编自 backend/src/services/playwrightAuth.js
 */

const { launchBrowser } = require('./playwrightLaunch');

const PLATFORM_CONFIG = {
  '小红书': {
    baseUrl: 'https://www.xiaohongshu.com',
    loginUrl: 'https://www.xiaohongshu.com/login',
    loginSuccessCheck: (url) => {
      try { return !new URL(url).pathname.startsWith('/login'); } catch { return false; }
    },
    sessionCookieName: 'web_session',
  },
  '抖音': {
    baseUrl: 'https://www.douyin.com',
    loginUrl: 'https://www.douyin.com/login',
    loginSuccessCheck: (url) => {
      try { return !new URL(url).pathname.startsWith('/login'); } catch { return false; }
    },
    sessionCookieName: 'sessionid',
  },
  '微博': {
    baseUrl: 'https://weibo.com',
    loginUrl: 'https://passport.weibo.com/sso/signin',
    loginSuccessCheck: (url) => url.includes('weibo.com') && !url.includes('passport.weibo'),
    sessionCookieName: 'SUB',
  },
  '知乎': {
    baseUrl: 'https://www.zhihu.com',
    loginUrl: 'https://www.zhihu.com/signin',
    loginSuccessCheck: (url) => {
      try { return !new URL(url).pathname.startsWith('/signin'); } catch { return false; }
    },
    sessionCookieName: 'z_c0',
  },
};

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  //通过修改浏览器的 navigator 对象等方式， 隐藏 Playwright 自动化特征 ，防止网站检测到这是自动化浏览器而拒绝登录。
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

// 内存中的活跃会话
const activeSessions = new Map();

function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

/**
 * 启动浏览器并跳转到登录页
 * @param {string|number} accountId
 * @param {string} platform
 * @param {string|null} phoneNumber
 * @param {Function} onStatusChange  - (status: string) => void
 */
async function startAuth(accountId, platform, phoneNumber, onStatusChange) {
  await closeSession(accountId);

  const config = PLATFORM_CONFIG[platform];
  if (!config) throw new Error(`不支持的平台：${platform}`);

  const browser = await launchBrowser();
  const context = await browser.newContext({
    userAgent: DEFAULT_USER_AGENT,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
  });
  await context.addInitScript(STEALTH_SCRIPT);
  const page = await context.newPage();

  const session = { browser, context, page, platform, status: 'opening', config };
  activeSessions.set(String(accountId), session);

  const setStatus = (s) => {
    session.status = s;
    if (onStatusChange) onStatusChange(s);
  };

  try {
    await page.goto(config.baseUrl, { waitUntil: 'commit', timeout: 30000 });
    await randomDelay(800, 1500);
    await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    setStatus('browser_opened');

    if (platform === '小红书' && phoneNumber) {
      await autoFillXhsPhone(page, phoneNumber, setStatus);
    }
    if (platform === '微博' && phoneNumber) {
      await autoFillWeiboPhone(page, phoneNumber, setStatus);
    }
  } catch (err) {
    await closeSession(accountId);
    throw new Error('打开授权浏览器失败：' + err.message);
  }
}
/**
 * 自动填写小红书手机号
 * @param {Page} page
 * @param {string} phoneNumber
 * @param {Function} setStatus
 */
async function autoFillXhsPhone(page, phoneNumber, setStatus) {
  try {
    await page.waitForSelector('form, [class*="login"], [class*="sign"]', { timeout: 10000 });

    const phoneTab = await page.$('[class*="phone"], [data-type="phone"], :text("手机号登录")');
    if (phoneTab) { await phoneTab.click(); await randomDelay(600, 1000); }

    const phoneInput = await page.$('input[type="tel"], input[placeholder*="手机号"], input[name="phone"]');
    if (!phoneInput) { setStatus('browser_opened'); return; }

    await phoneInput.click();
    await randomDelay(200, 400);
    for (const ch of phoneNumber) {
      await phoneInput.type(ch, { delay: 60 + Math.random() * 80 });
    }
    await randomDelay(400, 800);

    const sendBtn = await page.$('button:has-text("获取验证码"), button:has-text("发送验证码"), [class*="send-code"]');
    if (sendBtn) {
      await sendBtn.click();
      setStatus('waiting_sms_code');
    } else {
      setStatus('browser_opened');
    }
  } catch (err) {
    console.warn('[autoFillXhsPhone] 自动填写失败：', err.message);
    setStatus('browser_opened');
  }
}

/**
 * 自动填写微博手机号
 * @param {Page} page
 * @param {string} phoneNumber
 * @param {Function} setStatus
 */
async function autoFillWeiboPhone(page, phoneNumber, setStatus) {
  try {
    await page.waitForSelector('form', { timeout: 10000 });

    await page.waitForLoadState('networkidle');
    await randomDelay(1500, 2000);
    
    const phoneTab = await page.$('a:has-text("验证码登录"), a:has-text("短信验证登录"), li:nth-child(1) > a');
    if (phoneTab) {
      await phoneTab.click();
      await randomDelay(1000, 1500);
    } else {
      console.log('[autoFillWeiboPhone] 未找到验证码登录选项');
    }
    
    await page.waitForLoadState('networkidle');
    await randomDelay(500, 800);

    const phoneInput = await page.$(
      'input[placeholder*="手机号"], ' +
      'input[aria-label*="手机号"], ' +
      'input[type="text"]:near(a:has-text("验证码登录")), ' +
      'input[type="text"]'
    );
    
    if (!phoneInput) {
      const inputs = await page.$$('input');
      console.log('[autoFillWeiboPhone] 页面中共有', inputs.length, '个input元素');
      for (let i = 0; i < Math.min(inputs.length, 10); i++) {
        const attrs = await inputs[i].evaluate(el => ({
          type: el.type,
          placeholder: el.placeholder,
          ariaLabel: el.getAttribute('aria-label'),
          name: el.name
        }));
        console.log(`[autoFillWeiboPhone] input[${i}]:`, JSON.stringify(attrs));
      }
      setStatus('browser_opened');
      return;
    }
    
    await phoneInput.click();
    await randomDelay(300, 500);
    
    await phoneInput.fill('');
    for (const ch of phoneNumber) {
      await phoneInput.type(ch, { delay: 60 + Math.random() * 80 });
    }
    await randomDelay(500, 800);
    
    // 验证输入
    const inputValue = await phoneInput.inputValue();
    if (inputValue !== phoneNumber) {
      await phoneInput.fill('');
      await phoneInput.type(phoneNumber, { delay: 50 });
    }

    const sendBtn = await page.$('a:has-text("获取验证码"), a:has-text("发送验证码"), [class*="send-code"], [class*="code"]');
    if (sendBtn) {
      await sendBtn.click();
      setStatus('waiting_sms_code');
    } else {
      const buttons = await page.$$('a, button');
      for (let i = 0; i < Math.min(buttons.length, 15); i++) {
        const text = await buttons[i].evaluate(el => el.textContent.trim());
        const tag = buttons[i].evaluate(el => el.tagName);
        if (text) {
          console.log(`[autoFillWeiboPhone] ${tag}[${i}]: "${text}"`);
        }
      }
      setStatus('browser_opened');
    }
  } catch (err) {
    console.error('[autoFillWeiboPhone] 自动填写失败：', err.message);
    setStatus('browser_opened');
  }
}

/**
 * 提交短信验证码
 */
async function submitSmsCode(accountId, code) {
  const session = activeSessions.get(String(accountId));
  if (!session) throw new Error('没有活跃的授权会话');

  const { page } = session;
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
}

/**
 * 捕获 storageState（登录成功后调用）
 */
async function captureSession(accountId) {
  const session = activeSessions.get(String(accountId));
  if (!session) throw new Error('没有活跃的授权会话');

  const { context, page, config } = session;
  const currentUrl = page.url();

  if (!config.loginSuccessCheck(currentUrl)) {
    throw new Error('当前页面仍为登录页，请先完成登录');
  }

  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  const storageState = await context.storageState();
  session.status = 'authorized';
  await closeSession(accountId);
  return { storageState, userAgent: DEFAULT_USER_AGENT };
}

/**
 * 检查当前页面是否已登录（不抛出，返回 bool）
 */
function isLoggedIn(accountId) {
  const session = activeSessions.get(String(accountId));
  if (!session) return false;
  try {
    const url = session.page.url();
    return session.config.loginSuccessCheck(url);
  } catch { return false; }
}

async function closeSession(accountId) {
  const session = activeSessions.get(String(accountId));
  if (session) {
    try { await session.browser.close(); } catch {}
    activeSessions.delete(String(accountId));
  }
}

module.exports = { startAuth, submitSmsCode, captureSession, isLoggedIn, closeSession };
