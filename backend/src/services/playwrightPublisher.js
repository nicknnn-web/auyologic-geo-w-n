import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright';
import { buildLaunchOptions } from '../utils/playwrightLaunch.js';
import { normalizePublishPlatform } from '../utils/publishPlatformNormalize.js';
import { htmlToPlainText } from '../utils/htmlToPlainText.js';

// 内存中的发布任务状态（taskId -> taskState）
const runningTasks = new Map();
/** launchServer 实例（断开 Playwright 连接后仍保留浏览器窗口） */
const browserServers = new Map();
/** 发布成功后保留的 launchServer（子进程需保持存活，否则 Windows 会关掉 Chrome） */
const orphanBrowserServers = new Map();
/** taskId -> Browser（用于放弃/失败时强制关闭窗口） */
const activeBrowsers = new Map();
/** 用户在前端请求放弃投放 */
const publishCancelFlags = new Set();
/** 当前正在执行的发布 taskId（供 afterHumanClick 检测放弃） */
let currentPublishTaskId = null;

export class PublishAbortedError extends Error {
  constructor(message = '用户已放弃投放') {
    super(message);
    this.name = 'PublishAbortedError';
  }
}

export function requestPublishCancel(taskId) {
  if (taskId != null) publishCancelFlags.add(String(taskId));
}

export function isPublishCancelRequested(taskId) {
  return publishCancelFlags.has(String(taskId));
}

export function clearPublishCancel(taskId) {
  if (taskId != null) publishCancelFlags.delete(String(taskId));
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

async function _ensurePublishNotCancelled(taskId) {
  const tid = taskId != null ? String(taskId) : currentPublishTaskId;
  if (tid && isPublishCancelRequested(tid)) {
    await abortPublishTask(tid, '用户已放弃投放');
  }
}

/** 模拟人工：每次点击操作后等待 2～3 秒，并检测是否已放弃 */
async function afterHumanClick(taskId) {
  await _ensurePublishNotCancelled(taskId ?? currentPublishTaskId);
  await randomDelay(2000, 3000);
  await _ensurePublishNotCancelled(taskId ?? currentPublishTaskId);
}

let publishLogSink = null;

/** 本地代理子进程可注册 sink，将日志实时推送到服务端 */
export function setPublishLogSink(fn) {
  publishLogSink = typeof fn === 'function' ? fn : null;
}

/** 追加任务日志（同时更新内存状态） */
function appendLog(taskId, msg) {
  const task = runningTasks.get(String(taskId));
  const line = `[${new Date().toLocaleTimeString('zh-CN')}] ${msg}`;
  if (task) {
    task.log = (task.log || '') + line + '\n';
  }
  if (publishLogSink) {
    try {
      publishLogSink(String(taskId), line + '\n');
    } catch { /* ignore */ }
  }
  console.log(`[Task ${taskId}] ${msg}`);
}

/** 获取任务当前状态（供 API 轮询） */
export function getTaskStatus(taskId) {
  return runningTasks.get(String(taskId)) || null;
}

/** 草稿 HTML → 纯文本（全平台统一，避免 <p> 等标签被键盘敲进编辑器） */
function preparePublishContent(taskId, content) {
  if (content == null || content === '') return '';
  const raw = String(content);
  const plain = htmlToPlainText(raw);
  if (plain !== raw) {
    appendLog(taskId, '正文含 HTML 标签，已转为纯文本再填入编辑器');
  }
  return plain;
}

/**
 * 异步执行发布任务（立即返回，后台运行）
 * @param {Object} taskInfo - { taskId, platform, sessionState, content, title, tags, imagePaths }
 * @param {Function} onDone - 完成后回调，写入 DB
 */
/**
 * 公共：创建带登录态的浏览器 + page（所有平台复用）
 * 返回 { browser, context, page }
 */
async function _launchBrowserServer() {
  const launchOpts = buildLaunchOptions();
  try {
    return await chromium.launchServer(launchOpts);
  } catch (firstErr) {
    if (launchOpts.channel && !launchOpts.executablePath) {
      const fallback = { ...launchOpts };
      delete fallback.channel;
      delete fallback.executablePath;
      return await chromium.launchServer(fallback);
    }
    throw firstErr;
  }
}

/** 发布失败或放弃：关闭浏览器窗口 */
async function _forceCloseBrowser(taskId, browser) {
  const tid = String(taskId);
  appendLog(tid, '正在关闭浏览器窗口…');
  activeBrowsers.delete(tid);
  const orphan = orphanBrowserServers.get(tid);
  if (orphan) {
    orphanBrowserServers.delete(tid);
    if (orphan.browser) await orphan.browser.close().catch(() => {});
    if (orphan.server) await orphan.server.close().catch(() => {});
    return;
  }
  const server = browserServers.get(tid);
  browserServers.delete(tid);
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
}

/**
 * 发布成功或已点击发布：保持 Chrome 窗口不关。
 * 注意：launchServer 在最后一个 Playwright 客户端 disconnect 时会结束进程，故此处不能 browser.close()。
 */
async function _leaveBrowserOpen(taskId, browser) {
  const tid = String(taskId);
  activeBrowsers.delete(tid);
  const server = browserServers.get(tid);
  browserServers.delete(tid);
  if (server) {
    orphanBrowserServers.set(tid, { server, browser: browser || null });
    appendLog(tid, '发布完成，浏览器窗口保持打开，请手动核对后关闭');
  } else {
    appendLog(tid, '发布完成（未找到浏览器服务，窗口可能已关闭）');
  }
}

function _markPublishClicked(publishTracker) {
  if (publishTracker) publishTracker.clicked = true;
}

/** @param {boolean} succeeded 全流程成功 @param {boolean} publishClicked 已点击发布/发送按钮 */
async function _finalizeBrowserAfterPublish(taskId, browser, succeeded, publishClicked) {
  if (succeeded || publishClicked) {
    await _leaveBrowserOpen(taskId, browser);
  } else {
    await _forceCloseBrowser(taskId, browser);
  }
}

/**
 * 等待用户手动关闭浏览器（本地代理子进程在成功后须调用，否则进程退出会带走 Chrome）
 * @param {string|number} taskId
 * @param {number} [timeoutMs]
 */
export async function waitForUserToCloseBrowser(taskId, timeoutMs = 2 * 60 * 60 * 1000) {
  const tid = String(taskId);
  const entry = orphanBrowserServers.get(tid);
  if (!entry) return;
  orphanBrowserServers.delete(tid);
  const server = entry.server || entry;
  const browser = entry.browser || null;
  appendLog(tid, '等待您关闭浏览器窗口…');

  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    try {
      const proc = server?.process?.();
      if (proc) {
        proc.once('exit', () => {
          clearTimeout(timer);
          finish();
        });
      } else {
        clearTimeout(timer);
        finish();
      }
    } catch {
      clearTimeout(timer);
      finish();
    }
  });

  if (browser) await browser.close().catch(() => {});
  if (server) await server.close().catch(() => {});
}

/** 用户放弃或父进程 SIGTERM：强制结束并关浏览器 */
export async function abortPublishTask(taskId, reason = '用户已放弃投放') {
  const tid = String(taskId);
  publishCancelFlags.add(tid);
  const task = runningTasks.get(tid);
  if (task) {
    task.status = 'failed';
    task.errorMessage = reason;
    appendLog(tid, `❌ ${reason}`);
  }
  const browser = activeBrowsers.get(tid);
  await _forceCloseBrowser(tid, browser);
  throw new PublishAbortedError(reason);
}

async function _createBrowserSession(taskId, sessionState) {
  const sessionStateObj =
    typeof sessionState === 'string' ? JSON.parse(sessionState) : sessionState;

  const server = await _launchBrowserServer();
  const browser = await chromium.connect(server.wsEndpoint());
  const tid = String(taskId);
  browserServers.set(tid, server);
  activeBrowsers.set(tid, browser);
  const context = await browser.newContext({
    storageState: sessionStateObj,
    userAgent: DEFAULT_USER_AGENT,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  await context.addInitScript(STEALTH_SCRIPT);
  const page = await context.newPage();
  appendLog(taskId, '浏览器启动成功');
  return { browser, context, page };
}

export function executePublishTask(taskInfo, onDone) {
  const { taskId } = taskInfo;

  // 初始化任务状态
  runningTasks.set(String(taskId), {
    status: 'running',
    log: '',
    publishedUrl: null,
    errorMessage: null,
  });

  // 异步执行，不 await
  _runPublish(taskInfo)
    .then(({ publishedUrl }) => {
      const task = runningTasks.get(String(taskId));
      if (task) {
        task.status = 'done';
        task.publishedUrl = publishedUrl;
      }
      onDone(null, publishedUrl);
      // 服务端模式：主进程不退出，异步等待用户关窗即可
      waitForUserToCloseBrowser(String(taskId)).catch(() => {});
    })
    .catch((err) => {
      const task = runningTasks.get(String(taskId));
      if (task) {
        task.status = 'failed';
        task.errorMessage = err.message;
      }
      onDone(err, null);
    });
}

/**
 * 本地代理子进程调用：执行发布并返回日志（Promise）
 * @returns {Promise<{ success: boolean, publishedUrl?: string, error?: string, log: string }>}
 */
export async function runPublishAndCollectLog(taskInfo) {
  const { taskId } = taskInfo;
  const tid = String(taskId);
  clearPublishCancel(tid);
  runningTasks.set(tid, {
    status: 'running',
    log: '',
    publishedUrl: null,
    errorMessage: null,
  });
  currentPublishTaskId = tid;
  try {
    const { publishedUrl } = await _runPublish(taskInfo);
    const log = runningTasks.get(tid)?.log || '';
    clearPublishCancel(tid);
    cleanupTask(tid);
    return { success: true, publishedUrl: publishedUrl || '', log };
  } catch (err) {
    const log = runningTasks.get(tid)?.log || '';
    clearPublishCancel(tid);
    cleanupTask(tid);
    return {
      success: false,
      error: err.message,
      log,
      aborted: err instanceof PublishAbortedError,
    };
  } finally {
    if (currentPublishTaskId === tid) currentPublishTaskId = null;
  }
}
async function runPublishXHS(taskInfo) {
  const { taskId, sessionState, content, title, tags, imagePaths } = taskInfo;
  appendLog(taskId, '正在启动浏览器…');

  // ✅ 公共：复用 _createBrowserSession
  const { browser, page } = await _createBrowserSession(taskId, sessionState);
  let succeeded = false;
  const publishTracker = { clicked: false };

  try {
    appendLog(taskId, '正在打开小红书创作者中心…');
    await page.goto('https://creator.xiaohongshu.com/publish/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await randomDelay(1500, 2500);

    // 检查是否被跳转到登录页（session 失效）
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
      throw new Error('SESSION_EXPIRED:小红书登录状态已失效，请在账号管理页重新授权');
    }

    appendLog(taskId, '已进入创作者中心，准备发布图文…');

    // 点击「图文」发布选项（XHS 创作者中心有图文/视频切换）
    await _clickImageTextTab(page, taskId);

    // 上传图片（如果有）
    if (imagePaths && imagePaths.length > 0) {
      await _uploadImages(page, taskId, imagePaths);
    } else {
      appendLog(taskId, '⚠️ 未提供图片，小红书图文帖建议至少上传1张图');
    }

    // 填写标题（XHS 限制 20 字）
    const safeTitle = (title || '').slice(0, 20);
    await _fillTitle(page, taskId, safeTitle);

    // 填写正文
    await _fillContent(page, taskId, content || '');

    // 添加话题标签
    if (tags) {
      await _addTags(page, taskId, tags);
    }

    // 点击发布，返回 { publishedUrl }
    const publishedUrl = await _submitPublish(page, taskId, publishTracker);
    appendLog(taskId, `✅ 小红书发布成功！链接：${publishedUrl || '未获取到链接'}`);
    succeeded = true;
    return { publishedUrl: publishedUrl || '' };
  } catch (err) {
    if (!(err instanceof PublishAbortedError)) {
      appendLog(taskId, `❌ 小红书发布失败：${err.message}`);
    }
    throw err;
  } finally {
    await _finalizeBrowserAfterPublish(taskId, browser, succeeded, publishTracker.clicked);
  }
}
/**
 * 知乎专栏发布
 * ─────────────────────────────────────────────
 * 【每接入新平台，复制此函数框架，只改下面标注的部分】
 */
async function runPublishZhihu(taskInfo) {
  const { taskId, sessionState, content, title } = taskInfo;
  appendLog(taskId, '正在启动浏览器…');

  // ✅ 公共：创建带登录态的浏览器（所有平台相同，直接复用）
  const { browser, page } = await _createBrowserSession(taskId, sessionState);
  let succeeded = false;
  const publishTracker = { clicked: false };

  try {
    // 🔧 【改这里①】：目标发布页 URL
    appendLog(taskId, '正在打开知乎专栏写作页…');
    await page.goto('https://zhuanlan.zhihu.com/write', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await randomDelay(1500, 2500);

    // 🔧 【改这里②】：session 失效的 URL 特征（知乎跳转到 /login 或 /signin）
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
      throw new Error('SESSION_EXPIRED:知乎登录状态已失效，请在账号管理页重新授权');
    }
    appendLog(taskId, '已进入知乎写作页，开始填写内容…');

    // 🔧 【改这里③】：填写标题
    // 知乎专栏标题选择器
    await _zhihuFillTitle(page, taskId, title || '');

    // 🔧 【改这里④】：填写正文
    // 知乎用 ProseMirror 编辑器
    await _zhihuFillContent(page, taskId, content || '');
    await randomDelay(2000, 3000);
    // 🔧 【改这里⑤】：点击发布 + 获取结果 URL
    const publishedUrl = await _zhihuSubmitPublish(page, taskId, publishTracker);

    appendLog(taskId, `✅ 知乎发布成功！链接：${publishedUrl || '未获取到链接'}`);
    succeeded = true;
    return { publishedUrl: publishedUrl || '' };
  } catch (err) {
    if (!(err instanceof PublishAbortedError)) {
      appendLog(taskId, `❌ 知乎发布失败：${err.message}`);
    }
    throw err;
  } finally {
    await _finalizeBrowserAfterPublish(taskId, browser, succeeded, publishTracker.clicked);
  }
}

/** 知乎：填写标题 */
async function _zhihuFillTitle(page, taskId, title) {
  if (!title) return;
  appendLog(taskId, `正在填写知乎标题：${title}`);
  try {
    // 知乎专栏标题输入框
    const selectors = [
      'textarea[placeholder*="请输入标题"]',
      '.WriteIndex-titleInput textarea',
      'textarea.Input',
      'textarea[placeholder*="标题"]',
    ];
    for (const sel of selectors) {
      const input = await page.$(sel);
      if (input) {
        await input.click();
        await randomDelay(200, 400);
        await input.fill('');
        for (const ch of title) {
          await input.type(ch, { delay: 40 + Math.random() * 40 });
        }
        appendLog(taskId, '标题填写完成');
        return;
      }
    }
    appendLog(taskId, '⚠️ 未找到知乎标题输入框');
  } catch (err) {
    appendLog(taskId, `⚠️ 填写知乎标题失败：${err.message}`);
  }
}

/** 知乎：填写正文（ProseMirror 富文本编辑器） */
async function _zhihuFillContent(page, taskId, content) {
  if (!content) return;
  appendLog(taskId, '正在填写知乎正文…');
  try {
    // 知乎编辑器是 ProseMirror，contenteditable div
    const selectors = [
      '.ProseMirror[contenteditable="true"]',
      '.DraftEditor-root [contenteditable="true"]',
      '[contenteditable="true"]',
    ];
    for (const sel of selectors) {
      const editor = await page.$(sel);
      if (editor) {
        await editor.click();
        await randomDelay(300, 500);
        await page.keyboard.press('Control+a');
        await randomDelay(100, 200);
        // 分段填入避免过长卡顿
        const chunks = content.match(/.{1,200}/gs) || [content];
        for (const chunk of chunks) {
          await editor.type(chunk, { delay: 15 + Math.random() * 15 });
        }
        appendLog(taskId, '正文填写完成');
        return;
      }
    }
    appendLog(taskId, '⚠️ 未找到知乎正文编辑框');
  } catch (err) {
    appendLog(taskId, `⚠️ 填写知乎正文失败：${err.message}`);
  }
}
//
// /** 知乎：点击发布并返回文章 URL */
// async function _zhihuSubmitPublish(page, taskId) {
//   appendLog(taskId, '正在点击知乎发布按钮…');
//   const selectors = [
//     'button.Button--primary:has-text("发布")',
//     'button:has-text("发布文章")',
//     'button:has-text("发布")',
//     '.PublishPanel button:has-text("发布")',
//     '[class*="publish"] button',
//   ];
//   let publishBtn = null;
//   for (const sel of selectors) {
//     publishBtn = await page.$(sel);
//     if (publishBtn) break;
//   }
//   if (!publishBtn) throw new Error('未找到知乎发布按钮，请检查页面是否正确加载');
//   console.log("console.log(publishBtn);");
//   console.log(publishBtn);
//   await publishBtn.click();
//   appendLog(taskId, '已点击发布，等待跳转…');
//
//   let publishedUrl = '';
//   try {
//     // 知乎文章发布后跳转到 /p/xxxxxxx 格式的 URL
//     await page.waitForURL(url => url.includes('zhuanlan.zhihu.com/p/'), { timeout: 30000 });
//     publishedUrl = page.url();
//     // publishedUrl.replace('/edit','')
//   } catch {
//     appendLog(taskId, '⚠️ 等待知乎跳转超时，检查当前 URL…');
//     publishedUrl = page.url();
//   }
//   return publishedUrl;
// }
async function _zhihuSubmitPublish(page, taskId, publishTracker) {
  appendLog(taskId, '正在点击知乎发布按钮…');

  // 填完内容后稍等，让编辑器异步校验完成
  await randomDelay(1500, 2500);

  // 用 locator 代替 page.$，内置可交互等待
  const locator = page.locator('button.Button--primary').filter({ hasText: '发布' }).first();

  try {
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    // 确保按钮不是 disabled
    const isDisabled = await locator.getAttribute('disabled');
    if (isDisabled !== null) {
      await page.waitForFunction(
          () => !document.querySelector('button.Button--primary[disabled]'),
          { timeout: 10000 }
      );
    }
    await locator.click();
  } catch {
    // fallback：用 JS 直接触发点击（绕过 Playwright 的可交互检测）
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')]
          .find(b => b.textContent.trim() === '发布' && b.classList.contains('Button--primary'));
      if (btn) btn.click();
    });
  }

  _markPublishClicked(publishTracker);
  appendLog(taskId, '已点击发布，等待跳转…');

  // 知乎可能先弹出发布设置弹窗，需要处理二次确认
  try {
    // 等待可能出现的弹窗里的"发布"按钮
    const confirmBtn = page.locator('.Modal button.Button--primary, [role="dialog"] button').filter({ hasText: '发布' });
    const appeared = await confirmBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    if (appeared) {
      await confirmBtn.click();
      appendLog(taskId, '已确认弹窗发布');
    }
  } catch {}

  let publishedUrl = '';
  try {
    await page.waitForURL(url => url.includes('zhuanlan.zhihu.com/p/'), { timeout: 30000 });
    publishedUrl = page.url();
  } catch {
    appendLog(taskId, '⚠️ 等待知乎跳转超时，检查当前 URL…');
    publishedUrl = page.url();
  }
  return publishedUrl;
}

/**
 * 微博发布
 * ─────────────────────────────────────────────
 * 【微博平台发布实现】
 */
async function runPublishWeibo(taskInfo) {
  const { taskId, sessionState, content, title, imagePaths } = taskInfo;
  appendLog(taskId, '正在启动浏览器…');

  // ✅ 公共：创建带登录态的浏览器（所有平台相同，直接复用）
  const { browser, page } = await _createBrowserSession(taskId, sessionState);
  let succeeded = false;
  const publishTracker = { clicked: false };

  try {
    // 🔧 【改这里①】：目标发布页 URL
    appendLog(taskId, '正在打开微博发布页…');
    await page.goto('https://weibo.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await randomDelay(2000, 3000);

    // 🔧 【改这里②】：session 失效的 URL 特征（微博跳转到登录页）
    const currentUrl = page.url();
    if (currentUrl.includes('login.php') || currentUrl.includes('passport.weibo')) {
      throw new Error('SESSION_EXPIRED:微博登录状态已失效，请在账号管理页重新授权');
    }
    appendLog(taskId, '已进入微博首页，开始发布微博…');

    // 🔧 【改这里③】：点击发布框激活输入
    await _weiboClickPublishBox(page, taskId);
    await randomDelay(1000, 1500);

    // 🔧 【改这里④】：填写正文（微博支持 140 字或 2000 字，根据账号类型）
    await _weiboFillContent(page, taskId, content || '');
    await randomDelay(1000, 1500);

    // 🔧 【改这里⑤】：上传图片（如果有）
    if (imagePaths && imagePaths.length > 0) {
      await _weiboUploadImages(page, taskId, imagePaths);
      await randomDelay(2000, 3000);
    }

    // 🔧 【改这里⑥】：点击发布
    const publishedUrl = await _weiboSubmitPublish(page, taskId, publishTracker);

    appendLog(taskId, `✅ 微博发布成功！链接：${publishedUrl || '未获取到链接'}`);
    succeeded = true;
    return { publishedUrl: publishedUrl || '' };
  } catch (err) {
    if (!(err instanceof PublishAbortedError)) {
      appendLog(taskId, `❌ 微博发布失败：${err.message}`);
    }
    throw err;
  } finally {
    await _finalizeBrowserAfterPublish(taskId, browser, succeeded, publishTracker.clicked);
  }
}

/** 微博：点击发布框激活输入并填写内容 */
async function _weiboClickPublishBox(page, taskId) {
  appendLog(taskId, '正在点击微博发布框…');
  try {
    const selectors = [
      'textarea._input_md7i3_8',
      'textarea[placeholder*="新鲜事"]',
      'textarea[placeholder*="分享"]',
      'textarea[placeholder*="微博"]',
      // 备用选择器
      'textarea.W_input',
      'textarea[class*="_input"]',
      'textarea[placeholder*="有什么"]',
      // 更通用的选择器
      '[class*="publish"] textarea',
      '[class*="editor"] textarea',
    ];

    for (const sel of selectors) {
      const input = await page.$(sel);
      if (input) {
        const isVisible = await input.isVisible();
        if (isVisible) {
          appendLog(taskId, `找到发布框: ${sel}`);
          await input.click();
          await randomDelay(500, 800);
          appendLog(taskId, '已激活微博发布框');
          return;
        }
      }
    }

    appendLog(taskId, '使用备选方案获取焦点…');
    await page.evaluate(() => {
      const selectors = [
        'textarea._input_md7i3_8',
        'textarea[placeholder*="新鲜事"]',
        'textarea[placeholder*="分享"]',
      ];

      for (const sel of selectors) {
        const textarea = document.querySelector(sel);
        if (textarea) {
          textarea.click();
          textarea.focus();
          return true;
        }
      }
      return false;
    });
    await randomDelay(500, 800);
    appendLog(taskId, '已激活微博发布框');

  } catch (err) {
    appendLog(taskId, `⚠️ 点击微博发布框失败：${err.message}`);
  }
}

/** 微博：填写正文 */
async function _weiboFillContent(page, taskId, content) {
  if (!content) return;
  appendLog(taskId, '正在填写微博正文…');
  try {
    const selectors = [
      'textarea._input_md7i3_8',
      'textarea[placeholder*="新鲜事"]',
      'textarea[placeholder*="分享"]',
      'textarea[placeholder*="微博"]',
      // 备用选择器
      'textarea.W_input',
      'textarea.W_textarea',
      'textarea[class*="_input"]',
      'textarea[placeholder*="有什么"]',
    ];

    let editor = null;
    let foundSelector = null;

    for (const sel of selectors) {
      const found = await page.$(sel);
      if (found) {
        const isVisible = await found.isVisible();
        if (isVisible) {
          editor = found;
          foundSelector = sel;
          appendLog(taskId, `找到编辑器: ${sel}`);
          break;
        }
      }
    }

    if (!editor) {
      appendLog(taskId, '使用 JavaScript 查找编辑器…');
      const editorFound = await page.evaluate(() => {
        const selectors = [
          'textarea._input_md7i3_8',
          'textarea[placeholder*="新鲜事"]',
          'textarea[placeholder*="分享"]',
          'textarea[placeholder*="微博"]',
          'textarea.W_input',
        ];

        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) { // 检查是否可见
            return sel;
          }
        }
        return null;
      });

      if (editorFound) {
        editor = await page.$(editorFound);
        foundSelector = editorFound;
        appendLog(taskId, `JS 找到编辑器: ${editorFound}`);
      }
    }

    if (!editor) {
      appendLog(taskId, '⚠️ 未找到微博正文编辑框');
      return;
    }

    await editor.click();
    await randomDelay(300, 500);
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.focus();
    }, foundSelector);
    await randomDelay(200, 400);

    // 清空已有内容
    await page.keyboard.press('Control+a');
    await randomDelay(100, 200);
    await page.keyboard.press('Delete');
    await randomDelay(100, 200);

    appendLog(taskId, `开始输入内容（长度：${content.length}）…`);

    for (let i = 0; i < content.length; i++) {
      await page.keyboard.type(content[i], { delay: 30 + Math.random() * 20 });
      if (i > 0 && i % 20 === 0) {
        appendLog(taskId, `输入进度：${Math.round((i / content.length) * 100)}%`);
      }
    }

    appendLog(taskId, '微博正文填写完成');

  } catch (err) {
    appendLog(taskId, `⚠️ 填写微博正文失败：${err.message}`);
    try {
      appendLog(taskId, '尝试使用键盘输入作为 fallback…');
      await page.keyboard.type(content, { delay: 30 });
      appendLog(taskId, '键盘输入完成');
    } catch (kbErr) {
      appendLog(taskId, `⚠️ 键盘输入也失败：${kbErr.message}`);
    }
  }
}

/** 微博：上传图片 */
async function _weiboUploadImages(page, taskId, imagePaths) {
  appendLog(taskId, `正在上传 ${imagePaths.length} 张图片到微博…`);
  try {
    const uploadSelectors = [
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
      '[class*="upload"] input[type="file"]',
    ];
    let fileInput = null;

    for (const sel of uploadSelectors) {
      fileInput = await page.$(sel);
      if (fileInput) break;
    }

    if (!fileInput) {
      const triggerSelectors = [
        '[class*="pic"]',
        '[class*="image"]',
        '[class*="upload"]',
        '[title*="图片"]',
        'svg[class*="pic"]',
      ];
      for (const sel of triggerSelectors) {
        const trigger = await page.$(sel);
        if (trigger) {
          await trigger.click();
          await randomDelay(800, 1200);
          break;
        }
      }
      fileInput = await page.$('input[type="file"]');
    }

    if (!fileInput) {
      appendLog(taskId, '⚠️ 未找到微博图片上传入口，跳过图片上传');
      return;
    }

    const existingPaths = imagePaths.filter(p => fs.existsSync(p));
    if (existingPaths.length === 0) {
      appendLog(taskId, '⚠️ 图片文件不存在，跳过图片上传');
      return;
    }

    await fileInput.setInputFiles(existingPaths);
    await randomDelay(3000 + existingPaths.length * 1500, 5000 + existingPaths.length * 2000);
    appendLog(taskId, `微博图片上传完成（${existingPaths.length} 张）`);
  } catch (err) {
    appendLog(taskId, `⚠️ 微博图片上传异常：${err.message}，继续发布…`);
  }
}

/** 微博：点击发送按钮并等待结果 */
async function _weiboSubmitPublish(page, taskId, publishTracker) {
  appendLog(taskId, '正在点击微博发送按钮…');

  await randomDelay(1000, 1500);

  const publishSelectors = [
    'button.woo-button-main:has-text("发送")',
    'button.woo-button-primary:has-text("发送")',
    'button.woo-button-m:has-text("发送")',
    'button:has-text("发送")',
    // 通用按钮选择器
    'button.W_btn_a:has-text("发送")',
    'button.W_btn_a:has-text("发布")',
    'a.W_btn_a:has-text("发送")',
    'a.W_btn_a:has-text("发布")',
    // 备用选择器
    '[class*="woo-button"]',
    '[class*="btn"]',
  ];

  let publishBtn = null;
  let foundSelector = null;

  for (const sel of publishSelectors) {
    const found = await page.$(sel);
    if (found) {
      const isVisible = await found.isVisible();
      if (isVisible) {
        const isDisabled = await found.evaluate(el => {
          return el.disabled ||
                 el.getAttribute('disabled') !== null ||
                 window.getComputedStyle(el).pointerEvents === 'none';
        });

        if (!isDisabled) {
          publishBtn = found;
          foundSelector = sel;
          appendLog(taskId, `找到发送按钮: ${sel}`);
          break;
        } else {
          appendLog(taskId, `找到按钮但被禁用: ${sel}`);
        }
      }
    }
  }

  if (!publishBtn) {
    appendLog(taskId, '⚠️ 未找到可点击的微博发送按钮，尝试备选方案…');

    const clicked = await page.evaluate(() => {
      const selectors = [
        'button.woo-button-main',
        'button.woo-button-primary',
        'button.woo-button-m',
        'button.woo-button',
      ];

      for (const sel of selectors) {
        const btns = document.querySelectorAll(sel);
        for (const btn of btns) {
          if (btn.textContent.includes('发送') && !btn.disabled && btn.offsetParent !== null) {
            btn.click();
            return true;
          }
        }
      }

      const allBtns = document.querySelectorAll('button');
      for (const btn of allBtns) {
        if (btn.textContent.includes('发送') || btn.textContent.includes('发布')) {
          if (!btn.disabled && btn.offsetParent !== null) {
            btn.click();
            return true;
          }
        }
      }

      return false;
    });

    if (!clicked) {
      throw new Error('未找到微博发送按钮，请检查页面是否正确加载');
    }
    _markPublishClicked(publishTracker);
  } else {
    await publishBtn.click({ force: true });
    _markPublishClicked(publishTracker);
  }

  appendLog(taskId, '已点击发送，等待发布结果…');

  let publishedUrl = '';
  try {
    // 微博发布成功
    await page.waitForTimeout(2000);
    await randomDelay(1000, 1500);

    // 获取当前 URL 作为发布后的链接
    publishedUrl = page.url();

    if (!publishedUrl.includes('/u/') && !publishedUrl.includes('/n/')) {
      try {
        const username = await page.$eval('[class*="nick"]', el => el.textContent?.trim());
        if (username) {
          publishedUrl = `https://weibo.com/n/${encodeURIComponent(username)}`;
        }
      } catch {}
    }
  } catch {
    appendLog(taskId, '⚠️ 等待微博发布结果超时，检查当前 URL…');
    publishedUrl = page.url();
  }

  return publishedUrl;
}

const TOUTIAO_PUBLISH_URL = 'https://mp.toutiao.com/profile_v4/graphic/publish';

function _isToutiaoSessionExpired(url) {
  const u = String(url || '');
  return (
    u.includes('/auth/page/login') ||
    u.includes('/passport') ||
    (u.includes('toutiao.com') && u.includes('/login'))
  );
}

/**
 * 今日头条 · 图文文章发布（头条号后台）
 */
async function runPublishToutiao(taskInfo) {
  const { taskId, sessionState, content, title, tags, imagePaths } = taskInfo;
  appendLog(taskId, '正在启动浏览器…');

  const { browser, page } = await _createBrowserSession(taskId, sessionState);
  let succeeded = false;
  const publishTracker = { clicked: false };

  try {
    appendLog(taskId, '正在打开今日头条图文发布页…');
    await page.goto(TOUTIAO_PUBLISH_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await randomDelay(2000, 3500);

    const currentUrl = page.url();
    if (_isToutiaoSessionExpired(currentUrl)) {
      throw new Error('SESSION_EXPIRED:今日头条登录状态已失效，请在账号管理页重新授权（须 App 扫码）');
    }

    appendLog(taskId, '已进入发布页，开始填写文章…');

    const safeTitle = (title || '未命名文章').slice(0, 30);
    await _toutiaoFillTitle(page, taskId, safeTitle);
    await afterHumanClick();
    await _toutiaoFillContent(page, taskId, content || '');
    await afterHumanClick();

    await _toutiaoSelectNoCover(page, taskId);
    await afterHumanClick();

    if (tags && String(tags).trim()) {
      appendLog(taskId, 'ℹ️ 今日头条文章暂不支持话题标签字段，已忽略 tags');
    }

    await _toutiaoSyncEditorState(page, taskId);
    await afterHumanClick();
    const publishedUrl = await _toutiaoSubmitPublish(page, taskId, publishTracker);

    appendLog(taskId, `✅ 今日头条发布成功！链接：https://mp.toutiao.com/profile_v4/graphic/articles`);
    succeeded = true;
    return { publishedUrl: 'https://mp.toutiao.com/profile_v4/graphic/articles' };
  } catch (err) {
    if (!(err instanceof PublishAbortedError)) {
      appendLog(taskId, `❌ 今日头条发布失败：${err.message}`);
    }
    throw err;
  } finally {
    await _finalizeBrowserAfterPublish(taskId, browser, succeeded, publishTracker.clicked);
  }
}

async function _toutiaoFillTitle(page, taskId, title) {
  if (!title) return;
  appendLog(taskId, `正在填写文章标题：${title}`);
  try {
    const selectors = [
      'textarea[placeholder*="标题"]',
      'input[placeholder*="标题"]',
      '[class*="title"] textarea',
      '[class*="title"] input',
      '.publish-editor-title textarea',
      '.editor-title input',
    ];
    for (const sel of selectors) {
      const input = await page.$(sel);
      if (input) {
        await input.click();
        await afterHumanClick();
        await input.fill('');
        await input.type(title, { delay: 35 + Math.random() * 35 });
        appendLog(taskId, '标题填写完成');
        return;
      }
    }
    const filled = await page.evaluate((t) => {
      const candidates = [
        ...document.querySelectorAll('textarea, input[type="text"]'),
      ];
      for (const el of candidates) {
        const ph = (el.getAttribute('placeholder') || '').toLowerCase();
        if (ph.includes('标题') || ph.includes('title')) {
          el.focus();
          el.value = t;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, title);
    if (filled) {
      appendLog(taskId, '标题填写完成（备用方式）');
      await afterHumanClick();
      return;
    }
    appendLog(taskId, '⚠️ 未找到标题输入框');
  } catch (err) {
    appendLog(taskId, `⚠️ 填写标题失败：${err.message}`);
  }
}

async function _toutiaoFillContent(page, taskId, content) {
  if (!content) return;
  appendLog(taskId, '正在填写文章正文…');
  try {
    const selectors = [
      '.ProseMirror[contenteditable="true"]',
      '.public-DraftEditor-content[contenteditable="true"]',
      '[contenteditable="true"][class*="editor"]',
      '.editor-content [contenteditable="true"]',
      '[contenteditable="true"]',
    ];
    for (const sel of selectors) {
      const editors = await page.$$(sel);
      for (const editor of editors) {
        const box = await editor.boundingBox();
        if (!box || box.height < 80) continue;
        await editor.click();
        await afterHumanClick();
        await page.keyboard.press('Control+a');
        await randomDelay(300, 500);
        const chunks = content.match(/.{1,200}/gs) || [content];
        for (const chunk of chunks) {
          await editor.type(chunk, { delay: 12 + Math.random() * 12 });
        }
        appendLog(taskId, '正文填写完成');
        await afterHumanClick();
        return;
      }
    }
    appendLog(taskId, '⚠️ 未找到正文编辑框');
  } catch (err) {
    appendLog(taskId, `⚠️ 填写正文失败：${err.message}`);
  }
}

/** 填表后触发头条编辑器校验（便于「预览并发布」按钮出现） */
async function _toutiaoSyncEditorState(page, taskId) {
  try {
    await page.evaluate(() => {
      const editors = document.querySelectorAll('[contenteditable="true"], textarea');
      for (const el of editors) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    });
    await page.keyboard.press('Tab').catch(() => {});
    await afterHumanClick();
    await page.evaluate(() => {
      const btn = document.querySelector('button.publish-btn.publish-btn-last, button.publish-btn-last');
      if (btn) btn.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    await afterHumanClick();
    appendLog(taskId, '已同步编辑器状态，等待发布按钮就绪…');
  } catch (err) {
    appendLog(taskId, `⚠️ 同步编辑器状态：${err.message}`);
  }
}

/** 展示封面栏：选择「无封面」（默认常为单图，需先切换） */
async function _toutiaoSelectNoCover(page, taskId) {
  appendLog(taskId, '正在选择展示封面：无封面…');
  await afterHumanClick();

  let selected = false;
  try {
    const label = page.locator('label.byte-radio').filter({ hasText: '无封面' });
    await label.waitFor({ state: 'visible', timeout: 20000 });
    const inner = label.locator('.byte-radio-inner').first();
    await inner.scrollIntoViewIfNeeded();
    await afterHumanClick();
    await inner.click({ timeout: 8000 });
    await afterHumanClick();
    selected = true;
    appendLog(taskId, '已点击「无封面」单选框');
  } catch (err) {
    appendLog(taskId, `⚠️ Playwright 选择无封面失败：${err.message}，尝试 DOM…`);
  }

  if (!selected) {
    selected = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('label.byte-radio')];
      for (const label of labels) {
        if (!(label.textContent || '').includes('无封面')) continue;
        const inner = label.querySelector('.byte-radio-inner');
        if (inner) {
          inner.scrollIntoView({ block: 'center' });
          inner.click();
          return true;
        }
        const input = label.querySelector('input[type="radio"]');
        if (input) {
          input.click();
          return true;
        }
      }
      const input = document.querySelector('label.byte-radio input[type="radio"][value="1"]');
      if (input) {
        input.click();
        const inner = input.closest('label')?.querySelector('.byte-radio-inner');
        if (inner) inner.click();
        return true;
      }
      return false;
    });
    if (selected) {
      appendLog(taskId, '已选择「无封面」（DOM 备用）');
      await afterHumanClick();
    }
  }

  if (!selected) {
    throw new Error('未找到「无封面」选项（label.byte-radio / .byte-radio-inner）');
  }
}

const TOUTIAO_CONFIRM_PUBLISH_TIMEOUT_MS = 10_000;
const TOUTIAO_CONFIRM_PUBLISH_POLL_MS = 400;

/** 点击「预览并发布」后轮询「确认发布」，10 秒内未出现则失败 */
async function _toutiaoPollClickConfirmPublish(page, taskId, publishTracker) {
  appendLog(taskId, '轮询查找「确认发布」按钮（最多 10 秒）…');
  const deadline = Date.now() + TOUTIAO_CONFIRM_PUBLISH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const hit = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button.publish-btn.publish-btn-last')];
      for (const el of buttons) {
        const text = (el.textContent || '').replace(/\s/g, '');
        if (!text.includes('确认发布')) continue;
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
        if (el.offsetParent === null) continue;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        el.click();
        return true;
      }
      return false;
    });
    if (hit) {
      appendLog(taskId, '已点击「确认发布」（button.publish-btn.publish-btn-last）');
      _markPublishClicked(publishTracker);
      await afterHumanClick();
      return;
    }

    try {
      const btn = page
        .locator('button.publish-btn.publish-btn-last')
        .filter({ hasText: '确认发布' })
        .first();
      if (await btn.isVisible().catch(() => false)) {
        const enabled = await btn.isEnabled().catch(() => false);
        if (enabled) {
          await btn.scrollIntoViewIfNeeded();
          await afterHumanClick();
          await btn.click({ timeout: 5000 });
          appendLog(taskId, '已点击「确认发布」（Playwright）');
          _markPublishClicked(publishTracker);
          await afterHumanClick();
          return;
        }
      }
    } catch {
      /* 本轮未命中，继续轮询 */
    }

    await randomDelay(TOUTIAO_CONFIRM_PUBLISH_POLL_MS, TOUTIAO_CONFIRM_PUBLISH_POLL_MS);
  }

  throw new Error('10 秒内未找到可点击的「确认发布」按钮，发布超时');
}

async function _toutiaoSubmitPublish(page, taskId, publishTracker) {
  appendLog(taskId, '正在查找并点击「预览并发布」…');

  const PREVIEW_PUBLISH_SELECTOR = 'button.publish-btn.publish-btn-last';

  let clicked = false;
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector('button.publish-btn.publish-btn-last');
        if (!el) return false;
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
        if (el.offsetParent === null) return false;
        return (el.textContent || '').includes('预览并发布');
      },
      { timeout: 90000 }
    );

    const btn = page.locator(PREVIEW_PUBLISH_SELECTOR).filter({ hasText: '预览并发布' });
    await btn.waitFor({ state: 'visible', timeout: 10000 });
    await btn.scrollIntoViewIfNeeded();
    await afterHumanClick();
    await btn.click({ timeout: 15000 });
    await afterHumanClick();
    clicked = true;
    _markPublishClicked(publishTracker);
    appendLog(taskId, '已点击「预览并发布」（button.publish-btn.publish-btn-last）');
  } catch (err) {
    appendLog(taskId, `⚠️ Playwright 点击失败：${err.message}，尝试 DOM 备用…`);
  }

  if (!clicked) {
    clicked = await page.evaluate(() => {
      const el = document.querySelector('button.publish-btn.publish-btn-last');
      if (!el) return false;
      const text = (el.textContent || '').trim();
      if (!text.includes('预览并发布')) return false;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
      if (el.offsetParent === null) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    });
    if (clicked) {
      _markPublishClicked(publishTracker);
      appendLog(taskId, '已点击「预览并发布」（DOM 备用）');
      await afterHumanClick();
    }
  }

  if (!clicked) {
    throw new Error(
      '未找到可点击的「预览并发布」按钮（button.publish-btn.publish-btn-last）。请确认已填写标题/正文且已选择无封面'
    );
  }

  await afterHumanClick();
  await _toutiaoPollClickConfirmPublish(page, taskId, publishTracker);

  let publishedUrl = '';
  try {
    await page.waitForURL(
      (url) => {
        const s = String(url);
        return (
          (s.includes('toutiao.com') || s.includes('mp.toutiao.com')) &&
          !_isToutiaoSessionExpired(s) &&
          (s.includes('/article/') ||
            s.includes('/graphic/') ||
            s.includes('/content/') ||
            !s.includes('/publish'))
        );
      },
      { timeout: 60000 }
    );
    publishedUrl = page.url();
  } catch {
    appendLog(taskId, '⚠️ 等待发布跳转超时，尝试读取页面链接…');
    publishedUrl = page.url();
    const link = await page.$('a[href*="toutiao.com"], a[href*="/article/"]');
    if (link) {
      const href = await link.getAttribute('href');
      if (href) publishedUrl = href.startsWith('http') ? href : `https://www.toutiao.com${href}`;
    }
  }
  return publishedUrl;
}

const BAIJIAHAO_PUBLISH_URL =
  'https://baijiahao.baidu.com/builder/rc/edit?type=news&is_from_cms=1';
const BAIJIAHAO_CONTENT_URL = 'https://baijiahao.baidu.com/builder/rc/content';

function _isBaijiahaoSessionExpired(url) {
  const u = String(url || '');
  if (u.includes('passport.baidu.com')) return true;
  return u.includes('baijiahao.baidu.com') && (u.includes('/login') || u.includes('/bjh/login'));
}

/** 按按钮文案点击（百家号发布页按钮类名多变） */
async function _clickButtonByTexts(page, taskId, texts, logPrefix) {
  for (const text of texts) {
    const hit = await page.evaluate((label) => {
      const nodes = [
        ...document.querySelectorAll('button, a, [role="button"], span[class*="btn"], div[class*="btn"]'),
      ];
      for (const el of nodes) {
        const t = (el.textContent || '').replace(/\s/g, '');
        if (!t.includes(label)) continue;
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
        if (el.offsetParent === null) continue;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        el.click();
        return true;
      }
      return false;
    }, text);
    if (hit) {
      appendLog(taskId, `${logPrefix}「${text}」`);
      await afterHumanClick();
      return true;
    }
  }
  return false;
}

/** 百家号是否仍有 cheetah 新手引导（如「AI工具收起 1/4」） */
async function _baijiahaoIsTourVisible(page) {
  const tourLocatorSelectors = [
    '.cheetah-tour-inner',
    '.cheetah-tour',
    '[class*="cheetah-tour-inner"]',
    '.cheetah-tour-mask',
    '[class*="cheetah-tour-mask"]',
  ];
  for (const sel of tourLocatorSelectors) {
    if (await page.locator(sel).first().isVisible().catch(() => false)) return true;
  }
  return page
    .evaluate(() => {
      const nodes = document.querySelectorAll(
        '.cheetah-tour-inner, .cheetah-tour, [class*="cheetah-tour"], .cheetah-tour-mask'
      );
      return [...nodes].some((el) => {
        const st = window.getComputedStyle(el);
        return el.offsetParent !== null && st.display !== 'none' && st.visibility !== 'hidden';
      });
    })
    .catch(() => false);
}

/** 网络较慢时引导层可能延迟出现，至少轮询次数 */
const BAIJIAHAO_TOUR_MIN_POLL_ROUNDS = 3;

/**
 * 百家号编辑页新手引导：优先点 X；否则连点「下一步」走完 1/4…4/4
 * @param {number} [minPollWhenEmpty] 未见到遮罩时至少轮询次数（进入编辑页用 3；填标题/正文后快速检查用 0）
 */
async function _baijiahaoDismissTourOverlay(page, taskId, { minPollWhenEmpty = BAIJIAHAO_TOUR_MIN_POLL_ROUNDS, silent = false } = {}) {
  const minPolls = Math.max(0, Number(minPollWhenEmpty) || 0);
  if (!silent && taskId) appendLog(taskId, '检查页面引导遮罩（AI工具收起等）…');

  let emptyPolls = 0;

  for (let round = 0; round < 10; round++) {
    const tourVisible = await _baijiahaoIsTourVisible(page);

    if (!tourVisible) {
      emptyPolls += 1;
      if (emptyPolls < minPolls) {
        if (!silent && taskId) {
          appendLog(taskId, `引导遮罩暂未出现，继续轮询（${emptyPolls}/${minPolls}）…`);
        }
        await randomDelay(1000, 1800);
        continue;
      }
      if (!silent && taskId && minPolls > 0) {
        appendLog(taskId, `引导检查完成，未发现引导遮罩（已轮询 ${minPolls} 次）`);
      }
      return;
    }

    emptyPolls = 0;

    if (!silent && taskId) appendLog(taskId, '检测到百家号引导弹层，正在关闭…');

    let dismissed = false;

    const closeSelectors = [
      'button.cheetah-tour-close',
      '.cheetah-tour-inner button.cheetah-tour-close',
      '.cheetah-tour-inner .cheetah-public-icon-close',
      '[class*="cheetah-tour"] .cheetah-public-icon-close',
      '[class*="cheetah-tour"] button[aria-label="Close"]',
      '[class*="cheetah-tour"] button:has-text("跳过")',
      '[class*="cheetah-tour"] button:has-text("知道了")',
    ];
    for (const sel of closeSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 3000 }).catch(() => {});
        dismissed = true;
        if (!silent && taskId) appendLog(taskId, `已点击引导关闭按钮：${sel}`);
        break;
      }
    }

    if (!dismissed) {
      dismissed = await page
        .evaluate(() => {
          const root =
            document.querySelector('.cheetah-tour-inner') ||
            document.querySelector('.cheetah-tour') ||
            document.querySelector('[class*="cheetah-tour-inner"]');
          if (!root || root.offsetParent === null) return false;
          const close =
            root.querySelector('button.cheetah-tour-close') ||
            root.querySelector('.cheetah-public-icon-close') ||
            root.querySelector('[class*="icon-close"]');
          if (close && close.offsetParent !== null) {
            close.click();
            return true;
          }
          for (const btn of root.querySelectorAll('button')) {
            const t = (btn.textContent || '').trim();
            if (/^(跳过|知道了|关闭)$/i.test(t)) {
              btn.click();
              return true;
            }
          }
          return false;
        })
        .catch(() => false);
      if (dismissed && !silent && taskId) appendLog(taskId, '已关闭引导层（DOM 关闭/跳过）');
    }

    if (!dismissed && (await _baijiahaoIsTourVisible(page))) {
      const nextBtn = page.locator('[class*="cheetah-tour"] button').filter({ hasText: '下一步' }).first();
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click({ timeout: 3000 }).catch(() => {});
        if (!silent && taskId) appendLog(taskId, '引导未完成，已点击「下一步」推进（1/4→…）');
        dismissed = true;
      }
    }

    await randomDelay(500, 900);
    if (!(await _baijiahaoIsTourVisible(page))) {
      if (!silent && taskId) appendLog(taskId, '引导遮罩已清除');
      return;
    }

    if (round >= 6) {
      await page.evaluate(() => {
        document
          .querySelectorAll(
            '.cheetah-tour-inner, .cheetah-tour, [class*="cheetah-tour"], .cheetah-tour-mask, [class*="cheetah-tour-mask"]'
          )
          .forEach((el) => {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
          });
      });
      if (!silent && taskId) appendLog(taskId, '已强制隐藏残留引导层');
      return;
    }
  }
}

/** 填完标题/正文或点发布前：仅当遮罩可见时快速关闭，不做 3 次空轮询 */
async function _baijiahaoDismissTourIfVisible(page, taskId) {
  if (!(await _baijiahaoIsTourVisible(page))) return;
  await _baijiahaoDismissTourOverlay(page, taskId, { minPollWhenEmpty: 0, silent: true });
  if (taskId) appendLog(taskId, '已处理迟到的引导遮罩');
}

/** 确保停留在「图文」发稿页（避免误触视频发稿链路） */
async function _baijiahaoEnsureGraphicNewsMode(page, taskId) {
  const url = page.url();
  if (!url.includes('type=news') || !url.includes('/edit')) {
    appendLog(taskId, '当前不在图文编辑页，正在跳转…');
    await page.goto(BAIJIAHAO_PUBLISH_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await randomDelay(1500, 2500);
  }
  try {
    const graphicTab = page
      .locator('a, [role="tab"], span, div')
      .filter({ hasText: /^图文$/ })
      .first();
    if (await graphicTab.isVisible().catch(() => false)) {
      await graphicTab.click({ timeout: 3000 }).catch(() => {});
      await randomDelay(400, 800);
    }
  } catch {
    /* 已在图文页 */
  }
}

/** 关闭「视频格式不正确」等误触视频上传后的阻断提示 */
async function _baijiahaoDismissBlockingToasts(page, taskId) {
  const dismissed = await page
    .evaluate(() => {
      let hit = false;
      const texts = document.body?.innerText || '';
      if (!/视频格式不正确|仅支持MP4|仅支持.*视频/.test(texts)) return false;
      for (const btn of document.querySelectorAll('button')) {
        const t = (btn.textContent || '').trim();
        if (/^(确定|知道了|关闭|取消)$/i.test(t) && btn.offsetParent !== null) {
          btn.click();
          hit = true;
        }
      }
      return hit;
    })
    .catch(() => false);
  if (dismissed) {
    appendLog(taskId, '⚠️ 已关闭「视频格式不正确」提示（图文发布不会上传视频）');
    await randomDelay(500, 1000);
  }
}

/**
 * 百度百家号 · 图文发布
 */
async function runPublishBaijiahao(taskInfo) {
  const { taskId, sessionState, content, title, tags, coverImageUrl } = taskInfo;
  appendLog(taskId, '正在启动浏览器…');

  const { browser, page } = await _createBrowserSession(taskId, sessionState);
  let succeeded = false;
  const publishTracker = { clicked: false };

  try {
    appendLog(taskId, '正在打开百度百家号图文编辑页…');
    await page.goto(BAIJIAHAO_PUBLISH_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await randomDelay(2500, 4000);

    if (_isBaijiahaoSessionExpired(page.url())) {
      throw new Error('SESSION_EXPIRED:百度百家号登录状态已失效，请在账号管理页重新授权');
    }

    appendLog(taskId, '已进入编辑页');
    await _baijiahaoEnsureGraphicNewsMode(page, taskId);
    await _baijiahaoDismissTourOverlay(page, taskId, { minPollWhenEmpty: BAIJIAHAO_TOUR_MIN_POLL_ROUNDS });
    appendLog(taskId, '引导检查完成，开始填写标题与正文…');

    const safeTitle = (title || '未命名文章').slice(0, 64);
    appendLog(taskId, '【1/3】填写标题…');
    await _baijiahaoFillTitle(page, taskId, safeTitle);
    await afterHumanClick();

    appendLog(taskId, '【2/3】填写正文…');
    await _baijiahaoFillContent(page, taskId, content || '');
    await afterHumanClick();

    if (tags && String(tags).trim()) {
      appendLog(taskId, 'ℹ️ 话题标签字段已忽略（百家号图文不支持）');
    }

    await _baijiahaoSyncEditorState(page, taskId);
    await _baijiahaoDismissBlockingToasts(page, taskId);

    await _baijiahaoTrySetCover(page, taskId, coverImageUrl);

    appendLog(taskId, '【3/3】点击发布并处理确认弹窗…');
    await _baijiahaoDismissTourIfVisible(page, taskId);
    const publishedUrl = await _baijiahaoSubmitPublish(page, taskId, publishTracker);

    appendLog(taskId, `✅ 百度百家号发布成功！链接：${publishedUrl || '（请在百家号内容管理查看）'}`);
    succeeded = true;
    return {
      publishedUrl: publishedUrl || 'https://baijiahao.baidu.com/builder/rc/content',
    };
  } catch (err) {
    if (!(err instanceof PublishAbortedError)) {
      appendLog(taskId, `❌ 百度百家号发布失败：${err.message}`);
    }
    throw err;
  } finally {
    await _finalizeBrowserAfterPublish(taskId, browser, succeeded, publishTracker.clicked);
  }
}

async function _baijiahaoIsInBaijiahaoTitleBox(elementHandle) {
  return elementHandle.evaluate((el) => !!el.closest('[data-testid="news-title-input"]'));
}

const BAIJIAHAO_COVER_MANUAL_WAIT_MS = 120_000;

async function _baijiahaoDownloadCoverToTempFile(imageUrl, taskId) {
  const url = String(imageUrl || '').trim();
  if (!url) return null;
  const extMatch = /\.(jpe?g|png|gif|webp)(\?|$)/i.exec(url);
  const ext = extMatch ? extMatch[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
  const filePath = path.join(os.tmpdir(), `bjh-cover-${taskId}-${Date.now()}.${ext}`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64) throw new Error('图片过小或为空');
    fs.writeFileSync(filePath, buf);
    appendLog(taskId, `封面图已下载到临时文件（${Math.round(buf.length / 1024)} KB）`);
    return filePath;
  } catch (err) {
    appendLog(taskId, `⚠️ 封面图下载失败：${err.message}`);
    return null;
  }
}

async function _baijiahaoIsCoverSet(page) {
  return page
    .evaluate(() => {
      const imgs = document.querySelectorAll(
        '[class*="cover"] img[src], [class*="Cover"] img[src], [data-testid*="cover"] img[src]'
      );
      for (const img of imgs) {
        const src = img.getAttribute('src') || '';
        if (!src || src.includes('placeholder') || src.startsWith('data:image/svg')) continue;
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (w > 48 && h > 48) return true;
      }
      const text = document.body?.innerText || '';
      return /封面已|更换封面|重新上传|封面设置成功/.test(text);
    })
    .catch(() => false);
}

/** 填完标题正文后点击「选择封面」（FeEditorApp 区域，此时才出现 input[name=media]） */
async function _baijiahaoClickSelectCoverEntry(page, taskId) {
  const selectors = [
    '[class*="FeEditorApp-"][class*="-content"]:has-text("选择封面")',
    'div[class*="FeEditorApp-"]:has-text("选择封面")',
    '[class*="FeEditorApp-"] [class*="-text"]:has-text("选择封面")',
    'text=选择封面',
    'text=设置封面',
    'text=更换封面',
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 4000 }).catch(() => false)) {
        await el.scrollIntoViewIfNeeded().catch(() => {});
        await randomDelay(400, 800);
        await el.click({ timeout: 8000 });
        await randomDelay(1000, 2000);
        if (taskId) appendLog(taskId, `已点击「选择封面」入口（${sel}）`);
        return true;
      }
    } catch {
      /* try next */
    }
  }
  const hit = await page
    .evaluate(() => {
      for (const el of document.querySelectorAll('[class*="FeEditorApp-"]')) {
        const text = (el.textContent || '').replace(/\s/g, '');
        if (!text.includes('选择封面')) continue;
        if (el.offsetParent === null) continue;
        const box = el.closest('[class*="FeEditorApp-"][class*="-content"]') || el;
        box.scrollIntoView({ block: 'center', behavior: 'instant' });
        box.click();
        return true;
      }
      return false;
    })
    .catch(() => false);
  if (hit && taskId) appendLog(taskId, '已点击「选择封面」（FeEditorApp DOM）');
  return hit;
}

async function _baijiahaoClickCoverModalConfirm(page, taskId) {
  const texts = ['确定', '完成', '确认', '保存', '应用'];
  for (const t of texts) {
    const btn = page
      .locator('.cheetah-modal-content button, [role="dialog"] button')
      .filter({ hasText: t })
      .first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 5000 }).catch(() => {});
      if (taskId) appendLog(taskId, `已点击封面弹窗「${t}」`);
      await randomDelay(1000, 2000);
      return true;
    }
  }
  return false;
}

async function _baijiahaoUploadCoverAuto(page, taskId, localPath) {
  const opened = await _baijiahaoClickSelectCoverEntry(page, taskId);
  if (!opened) {
    appendLog(taskId, '⚠️ 未找到「选择封面」入口（需先填写标题与正文）');
    return false;
  }

  const fileInput = page.locator('input[name="media"][type="file"][accept*="image"]');
  try {
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });
    await fileInput.setInputFiles(localPath);
    appendLog(taskId, '已通过 input[name="media"] 自动注入封面图');
    await randomDelay(2500, 4500);
    await _baijiahaoClickCoverModalConfirm(page, taskId);
    await randomDelay(1500, 2500);
    if (await _baijiahaoIsCoverSet(page)) return true;
    await randomDelay(2000, 3000);
    return _baijiahaoIsCoverSet(page);
  } catch (err) {
    appendLog(taskId, `⚠️ 自动上传封面失败：${err.message}`);
    return false;
  }
}

async function _baijiahaoWaitManualCover(page, taskId) {
  appendLog(
    taskId,
    `自动上传未成功：请在已打开的浏览器中手动选择封面（最多等待 ${BAIJIAHAO_COVER_MANUAL_WAIT_MS / 1000} 秒）…`
  );
  await _baijiahaoClickSelectCoverEntry(page, taskId);
  const deadline = Date.now() + BAIJIAHAO_COVER_MANUAL_WAIT_MS;
  while (Date.now() < deadline) {
    if (await _baijiahaoIsCoverSet(page)) {
      appendLog(taskId, '已检测到封面（手动选择）');
      return true;
    }
    await _ensurePublishNotCancelled(taskId);
    await randomDelay(1500, 2500);
  }
  appendLog(taskId, '⚠️ 等待手动选择封面超时，将尝试不带封面继续发布');
  return false;
}

/** 方案 C：有 URL 则自动上传；失败则等人手选；未指定 URL 则跳过 */
async function _baijiahaoTrySetCover(page, taskId, coverImageUrl) {
  const url = String(coverImageUrl || '').trim();
  if (!url) {
    appendLog(taskId, 'ℹ️ 未指定封面图（可选项），跳过封面设置');
    return;
  }

  appendLog(taskId, '【可选】正在设置百家号封面…');
  let ok = false;
  const localPath = await _baijiahaoDownloadCoverToTempFile(url, taskId);
  if (localPath) {
    ok = await _baijiahaoUploadCoverAuto(page, taskId, localPath);
    try {
      fs.unlinkSync(localPath);
    } catch {
      /* ignore */
    }
  }
  if (!ok) {
    ok = await _baijiahaoWaitManualCover(page, taskId);
  }
  if (ok) appendLog(taskId, '✅ 封面设置完成');
  else appendLog(taskId, 'ℹ️ 封面未设置，继续发布');
}

async function _baijiahaoFillTitle(page, taskId, title) {
  if (!title) return;
  const safeTitle = String(title).trim().slice(0, 64);
  appendLog(taskId, `正在填写标题：${safeTitle}`);
  await randomDelay(800, 1500);

  const titleRoot = page.locator('[data-testid="news-title-input"]');
  const titleEditor = titleRoot.locator('[contenteditable="true"]').first();

  try {
    await titleRoot.waitFor({ state: 'visible', timeout: 20000 });
    await titleEditor.waitFor({ state: 'visible', timeout: 10000 });
    await titleEditor.scrollIntoViewIfNeeded();
    await randomDelay(500, 1000);
    await titleEditor.click();
    await afterHumanClick();
    await page.keyboard.press('Control+a');
    await randomDelay(200, 400);
    await page.keyboard.press('Backspace');
    await randomDelay(300, 600);
    await titleEditor.pressSequentially(safeTitle, { delay: 35 + Math.random() * 25 });
    await afterHumanClick();

    const len = await titleRoot
      .locator('.font-number span')
      .first()
      .innerText()
      .catch(() => '');
    if (len && !len.startsWith('0/')) {
      appendLog(taskId, `标题填写完成（news-title-input，${len}）`);
      return;
    }

    const text = await titleEditor.innerText().catch(() => '');
    if (String(text).trim().length > 0) {
      appendLog(taskId, '标题填写完成（news-title-input）');
      return;
    }
    appendLog(taskId, '⚠️ 标题编辑器未检测到文字，尝试备用方式…');
  } catch (err) {
    appendLog(taskId, `⚠️ news-title-input 填写失败：${err.message}，尝试备用方式…`);
  }

  const selectors = [
    '[data-testid="news-title-input"] [contenteditable="true"]',
    'textarea[placeholder*="标题"]',
    'input[placeholder*="标题"]',
    '[class*="title"] textarea',
    '[class*="title"] input',
  ];
  for (const sel of selectors) {
    const input = await page.$(sel);
    if (!input) continue;
    await input.click();
    await afterHumanClick();
    try {
      await input.fill('');
      await input.type(safeTitle, { delay: 35 + Math.random() * 35 });
    } catch {
      await page.keyboard.press('Control+a');
      await page.keyboard.type(safeTitle, { delay: 35 });
    }
    appendLog(taskId, '标题填写完成（备用选择器）');
    await afterHumanClick();
    return;
  }

  appendLog(taskId, '⚠️ 未找到标题输入框');
}

function _baijiahaoStripNonTextForNewsBody(raw) {
  let text = String(raw || '');
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, '');
  text = text.replace(/<[^>]+>/g, '');
  return text.trim();
}

/** 百家号 UEditor：#edui1_iframeholder > iframe#ueditor_0 → body.view.news-editor-pc */
const BAIJIAHAO_UEDITOR_IFRAME_SELECTORS = [
  'iframe#ueditor_0',
  'iframe[id^="ueditor_"]',
  '#edui1_iframeholder iframe',
  '.edui-editor-iframeholder iframe',
];

const BAIJIAHAO_NEWS_BODY_SELECTORS = [
  'body.news-editor-pc',
  'body.view.news-editor-pc',
  'body.view',
];

function _baijiahaoPlainToEditorHtml(text) {
  const escape = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const paras = String(text)
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paras.length > 0) {
    return paras.map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  return `<p>${escape(text)}</p>`;
}

/** 等待 UEditor iframe 加载并完成 _setup（contenteditable 由脚本延迟挂上） */
async function _baijiahaoWaitForUeditorFrame(page, taskId, timeoutMs = 50000) {
  if (taskId) appendLog(taskId, '等待 UEditor 正文 iframe（#ueditor_0）…');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const iframeSel of BAIJIAHAO_UEDITOR_IFRAME_SELECTORS) {
      const iframeEl = await page.$(iframeSel);
      if (!iframeEl) continue;
      const frame = await iframeEl.contentFrame();
      if (!frame) continue;
      try {
        await frame.waitForSelector('body.news-editor-pc, body.view', { timeout: 5000 });
        await frame
          .waitForFunction(
            () => {
              const body =
                document.querySelector('body.news-editor-pc') ||
                document.querySelector('body.view');
              if (!body) return false;
              return (
                body.isContentEditable ||
                body.getAttribute('contenteditable') === 'true' ||
                body.classList.contains('news-editor-pc')
              );
            },
            { timeout: 12000 }
          )
          .catch(() => {});
        for (const bodySel of BAIJIAHAO_NEWS_BODY_SELECTORS) {
          const locator = frame.locator(bodySel).first();
          if ((await locator.count().catch(() => 0)) > 0) {
            if (taskId) appendLog(taskId, `UEditor iframe 已就绪（${iframeSel} → ${bodySel}）`);
            return { frame, locator, iframeSel, bodySel };
          }
        }
      } catch {
        /* 本轮 iframe 未就绪，继续轮询 */
      }
    }
    await randomDelay(600, 1000);
  }
  if (taskId) appendLog(taskId, '⚠️ UEditor iframe 等待超时');
  return null;
}

async function _baijiahaoFindNewsBodyEditor(page) {
  for (const iframeSel of BAIJIAHAO_UEDITOR_IFRAME_SELECTORS) {
    const iframeEl = await page.$(iframeSel);
    if (!iframeEl) continue;
    const frame = await iframeEl.contentFrame();
    if (!frame) continue;
    for (const bodySel of BAIJIAHAO_NEWS_BODY_SELECTORS) {
      const locator = frame.locator(bodySel).first();
      if ((await locator.count().catch(() => 0)) > 0) {
        return { frame, locator, sel: bodySel, inIframe: true };
      }
    }
  }

  for (const frame of page.frames()) {
    for (const sel of BAIJIAHAO_NEWS_BODY_SELECTORS) {
      const locator = frame.locator(sel).first();
      if ((await locator.count().catch(() => 0)) > 0) {
        return { frame, locator, sel, inIframe: frame !== page.mainFrame() };
      }
    }
  }
  return null;
}

/** 通过父页面 UE_V2 API 写入（最稳） */
async function _baijiahaoFillViaUeditorApi(page, plain) {
  const html = _baijiahaoPlainToEditorHtml(plain.slice(0, 50000));
  return page
    .evaluate((contentHtml) => {
      try {
        const buckets = [window.UE_V2?.instants, window.UE?.instants].filter(Boolean);
        for (const instants of buckets) {
          const editor =
            instants.ueditorInstant0 ||
            instants['ueditorInstant0'] ||
            Object.values(instants)[0];
          if (!editor) continue;
          if (typeof editor.setContent === 'function') {
            editor.setContent(contentHtml, false);
            if (typeof editor.fireEvent === 'function') {
              editor.fireEvent('contentchange');
            }
            return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    }, html)
    .catch(() => false);
}

async function _baijiahaoFillNewsBodyEditor(frame, locator, plain) {
  const html = _baijiahaoPlainToEditorHtml(plain.slice(0, 50000));
  const filledByDom = await frame
    .evaluate((contentHtml) => {
      const body =
        document.querySelector('body.news-editor-pc') ||
        document.querySelector('body.view');
      if (!body) return false;
      body.focus();
      body.innerHTML = contentHtml;
      body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      body.dispatchEvent(new Event('change', { bubbles: true }));
      try {
        const w = window.parent;
        const instants = w?.UE_V2?.instants || w?.UE?.instants;
        const editor = instants?.ueditorInstant0 || Object.values(instants || {})[0];
        if (editor?.fireEvent) editor.fireEvent('contentchange');
      } catch {
        /* ignore */
      }
      return (body.innerText || '').trim().length > 0;
    }, html)
    .catch(() => false);
  if (filledByDom) return true;

  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await randomDelay(300, 600);
  await locator.click({ position: { x: 48, y: 48 }, timeout: 15000 });
  const keyboard = frame.keyboard;
  await keyboard.press('Control+a');
  await randomDelay(150, 300);
  await keyboard.press('Backspace');
  await randomDelay(150, 300);
  try {
    await locator.pressSequentially(plain.slice(0, 50000), { delay: 10 + Math.random() * 8 });
    return true;
  } catch {
    return false;
  }
}

async function _baijiahaoFillContent(page, taskId, content) {
  const plain = _baijiahaoStripNonTextForNewsBody(content);
  if (!plain) return;
  appendLog(taskId, '正在填写正文…');

  const ueditorFrame = await _baijiahaoWaitForUeditorFrame(page, taskId);
  if (ueditorFrame) {
    if (await _baijiahaoFillViaUeditorApi(page, plain)) {
      appendLog(taskId, `正文填写完成（UEditor API · ${ueditorFrame.iframeSel}）`);
      await afterHumanClick();
      return;
    }
    const filled = await _baijiahaoFillNewsBodyEditor(
      ueditorFrame.frame,
      ueditorFrame.locator,
      plain
    );
    if (filled) {
      appendLog(
        taskId,
        `正文填写完成（${ueditorFrame.iframeSel} → ${ueditorFrame.bodySel}）`
      );
      await afterHumanClick();
      return;
    }
    appendLog(taskId, '⚠️ UEditor iframe 已找到但填入失败，尝试备用选择器…');
  }

  const selectors = [
    '[data-testid="news-content-editor"] [contenteditable="true"]',
    '[data-testid="news-body-editor"] [contenteditable="true"]',
    '[data-testid*="content-editor"] [contenteditable="true"]',
    '.news-editor .ProseMirror[contenteditable="true"]',
    '.article-editor .ProseMirror[contenteditable="true"]',
    '.ProseMirror[contenteditable="true"]',
    '.public-DraftEditor-content[contenteditable="true"]',
  ];

  for (const sel of selectors) {
    const editor = page.locator(sel).first();
    if (!(await editor.isVisible().catch(() => false))) continue;
    if (await editor.evaluate((el) => !!el.closest('[data-testid="news-title-input"]')).catch(() => false)) {
      continue;
    }
    const box = await editor.boundingBox().catch(() => null);
    if (!box || box.height < 80) continue;

    await editor.scrollIntoViewIfNeeded();
    await randomDelay(300, 600);
    await editor.click({ position: { x: 24, y: 24 } });
    await afterHumanClick();
    await page.keyboard.press('Control+a');
    await randomDelay(200, 400);
    await page.keyboard.press('Backspace');
    await randomDelay(200, 400);
    await editor.pressSequentially(plain.slice(0, 50000), { delay: 10 + Math.random() * 8 });
    appendLog(taskId, `正文填写完成（${sel}）`);
    await afterHumanClick();
    return;
  }

  appendLog(taskId, '⚠️ 未找到正文编辑框（含 UEditor #ueditor_0 / body.news-editor-pc）');
}

async function _baijiahaoSyncEditorState(page, taskId) {
  try {
    await page
      .evaluate(() => {
        const instants = window.UE_V2?.instants || window.UE?.instants;
        const editor = instants?.ueditorInstant0 || Object.values(instants || {})[0];
        if (editor?.fireEvent) editor.fireEvent('contentchange');
      })
      .catch(() => {});
    for (const frame of page.frames()) {
      await frame
        .evaluate(() => {
          const body =
            document.querySelector('body.news-editor-pc') ||
            document.querySelector('body.view');
          if (body) {
            body.dispatchEvent(new Event('input', { bubbles: true }));
            body.dispatchEvent(new Event('blur', { bubbles: true }));
          }
        })
        .catch(() => {});
    }
    await page.evaluate(() => {
      const titleEl = document.querySelector(
        '[data-testid="news-title-input"] [contenteditable="true"]'
      );
      if (titleEl) {
        titleEl.dispatchEvent(new Event('input', { bubbles: true }));
        titleEl.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      const bodyCandidates = [
        document.querySelector('[data-testid="news-content-editor"] [contenteditable="true"]'),
        document.querySelector('[data-testid="news-body-editor"] [contenteditable="true"]'),
        ...document.querySelectorAll('.ProseMirror[contenteditable="true"]'),
      ];
      for (const el of bodyCandidates) {
        if (!el || el === titleEl) continue;
        if (el.closest('[data-testid="news-title-input"]')) continue;
        if (el.getBoundingClientRect().height < 80) continue;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        break;
      }
    });
    await randomDelay(400, 800);
    appendLog(taskId, '已同步标题/正文编辑器状态（含 UEditor iframe）');
  } catch (err) {
    appendLog(taskId, `⚠️ 同步编辑器状态：${err.message}`);
  }
}

/**
 * 百家号确认弹窗：在标题/正文匹配的 .cheetah-modal-content 内点指定按钮
 * @returns {boolean} 是否处理了一个弹窗
 */
async function _baijiahaoClickModalButton(page, taskId, { titleText, bodyContains, buttonText }) {
  const modals = page.locator('.cheetah-modal-content');
  const count = await modals.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const modal = modals.nth(i);
    const visible = await modal.isVisible().catch(() => false);
    if (!visible) continue;

    const titleEl = modal.locator('.cheetah-modal-title');
    const titleOk = await titleEl
      .filter({ hasText: titleText })
      .isVisible()
      .catch(() => false);
    if (!titleOk) continue;

    if (bodyContains) {
      const bodyOk = await modal
        .locator('.cheetah-modal-confirm-content')
        .filter({ hasText: bodyContains })
        .isVisible()
        .catch(() => false);
      if (!bodyOk) continue;
    }

    const btn = modal
      .locator('.cheetah-modal-confirm-btns button')
      .filter({ hasText: buttonText })
      .first();
    const btnVisible = await btn.isVisible({ timeout: 3000 }).catch(() => false);
    if (!btnVisible) continue;

    await btn.scrollIntoViewIfNeeded();
    await randomDelay(1000, 2000);
    await btn.click();
    appendLog(taskId, `已处理弹窗「${titleText}」→ 点击「${buttonText}」`);
    await afterHumanClick();
    return true;
  }
  return false;
}

/** 点击发布后：短正文「提醒」「温馨提示」等弹窗（可多轮，避免连点过快） */
async function _baijiahaoHandlePostPublishModals(page, taskId) {
  const steps = [
    { titleText: '提醒', bodyContains: '正文少于200字', buttonText: '确定' },
    { titleText: '温馨提示', bodyContains: '少于40字', buttonText: '保持图文发布' },
  ];

  appendLog(taskId, '检查发布后确认弹窗…');
  await randomDelay(1500, 2500);

  for (let round = 0; round < 4; round++) {
    let handledAny = false;
    for (const step of steps) {
      const ok = await _baijiahaoClickModalButton(page, taskId, step);
      if (ok) handledAny = true;
    }
    if (!handledAny) break;
    await randomDelay(1200, 2200);
  }
}

function _isValidBaijiahaoPublishedUrl(url) {
  const s = String(url || '');
  if (!s.includes('baijiahao.baidu.com') && !s.includes('mbd.baidu.com')) return false;
  if (s.includes('toutiao.com')) return false;
  if (s.includes('/edit')) return false;
  return !_isBaijiahaoSessionExpired(s);
}

async function _baijiahaoDetectPublishSuccess(page) {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText || '';
    if (/发布成功|已发布|提交成功|发表成功/.test(bodyText)) return true;
    for (const el of document.querySelectorAll(
      '.cheetah-message, .ant-message-notice, [class*="toast"], [class*="Message"]'
    )) {
      const t = el.textContent || '';
      if (/发布成功|已发布|提交成功/.test(t)) return true;
    }
    return false;
  });
}

async function _baijiahaoClickMainPublishButton(page, taskId, publishTracker) {
  appendLog(taskId, '查找并点击「发布」按钮（data-testid=publish-btn）…');
  await _baijiahaoDismissTourIfVisible(page, taskId);
  await _baijiahaoDismissBlockingToasts(page, taskId);
  await randomDelay(800, 1500);

  const publishBtn = page.locator('button[data-testid="publish-btn"]').filter({ hasText: '发布' }).first();
  try {
    await publishBtn.waitFor({ state: 'visible', timeout: 25000 });
    await publishBtn.scrollIntoViewIfNeeded();
    await randomDelay(600, 1200);
    const enabled = await publishBtn.isEnabled().catch(() => true);
    if (!enabled) {
      appendLog(taskId, '⚠️ 发布按钮暂不可用，等待编辑器就绪…');
      await randomDelay(2000, 3000);
    }
    await publishBtn.click({ timeout: 15000 });
    _markPublishClicked(publishTracker);
    appendLog(taskId, '已点击「发布」（button[data-testid="publish-btn"]）');
    await afterHumanClick();
    return true;
  } catch (err) {
    appendLog(taskId, `⚠️ publish-btn 点击失败：${err.message}，尝试 DOM 精确匹配…`);
  }

  const hit = await page
    .evaluate(() => {
      const btn = document.querySelector('button[data-testid="publish-btn"]');
      if (!btn || btn.offsetParent === null) return false;
      const text = (btn.textContent || '').replace(/\s/g, '');
      if (!text.includes('发布')) return false;
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
      btn.scrollIntoView({ block: 'center', behavior: 'instant' });
      btn.click();
      return true;
    })
    .catch(() => false);
  if (hit) {
    _markPublishClicked(publishTracker);
    appendLog(taskId, '已点击「发布」（DOM data-testid=publish-btn）');
    await afterHumanClick();
    return true;
  }

  appendLog(taskId, '❌ 未找到 button[data-testid="publish-btn"]，请确认引导层已关闭且标题/正文已填写');
  return false;
}

async function _baijiahaoSubmitPublish(page, taskId, publishTracker) {
  const publishClicked = await _baijiahaoClickMainPublishButton(page, taskId, publishTracker);
  if (!publishClicked) {
    throw new Error('未找到可点击的发布按钮，请确认标题/正文已填写且账号有发稿权限');
  }

  await _baijiahaoHandlePostPublishModals(page, taskId);
  appendLog(taskId, '等待发布结果（页面跳转或成功提示）…');
  await randomDelay(1500, 2500);

  let publishedUrl = '';
  try {
    await Promise.race([
      page.waitForURL(
        (url) => {
          const s = String(url);
          return (
            s.includes('baijiahao.baidu.com') &&
            !_isBaijiahaoSessionExpired(s) &&
            !s.includes('/edit')
          );
        },
        { timeout: 45000 }
      ),
      page.waitForFunction(
        () => {
          const bodyText = document.body?.innerText || '';
          if (/发布成功|已发布|提交成功|发表成功/.test(bodyText)) return true;
          for (const el of document.querySelectorAll('.cheetah-message, .ant-message-notice')) {
            if (/发布成功|已发布|提交成功/.test(el.textContent || '')) return true;
          }
          return false;
        },
        { timeout: 45000 }
      ),
    ]);
    publishedUrl = page.url();
    if (!_isValidBaijiahaoPublishedUrl(publishedUrl)) {
      publishedUrl = BAIJIAHAO_CONTENT_URL;
    }
    appendLog(taskId, `已确认发布成功，链接：${publishedUrl}`);
    return publishedUrl;
  } catch {
    appendLog(taskId, '⚠️ 等待跳转超时，正在检查页面是否已发布成功…');
  }

  const successHint = await _baijiahaoDetectPublishSuccess(page);
  if (successHint) {
    appendLog(taskId, '页面出现发布成功提示');
    return BAIJIAHAO_CONTENT_URL;
  }

  const currentUrl = page.url();
  if (_isValidBaijiahaoPublishedUrl(currentUrl)) {
    appendLog(taskId, `当前页面链接：${currentUrl}`);
    return currentUrl;
  }

  const href = await page.evaluate(() => {
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href') || '';
      if (h.includes('toutiao.com') || h.includes('mp.toutiao.com')) continue;
      if (h.includes('baijiahao.baidu.com') && !h.includes('/edit')) return h;
      if (h.includes('mbd.baidu.com')) return h;
    }
    return '';
  });
  if (href) {
    publishedUrl = href.startsWith('http') ? href : `https://baijiahao.baidu.com${href}`;
    appendLog(taskId, `从页面读取百家号链接：${publishedUrl}`);
    return publishedUrl;
  }

  if (String(currentUrl).includes('baijiahao.baidu.com') && currentUrl.includes('/edit')) {
    appendLog(
      taskId,
      '⚠️ 仍停留在编辑页且未检测到成功提示，已点击发布；请到百家号「内容管理」核对，浏览器将保持打开'
    );
    return BAIJIAHAO_CONTENT_URL;
  }

  appendLog(taskId, `未能获取文章直链，使用内容管理页：${BAIJIAHAO_CONTENT_URL}`);
  return BAIJIAHAO_CONTENT_URL;
}

/** 本地代理 zip 内 playwrightPublisher 构建标识（更新后请重新下载代理） */
export const PUBLISHER_BUILD_ID = '2026-06-10-bjh-cover-v16';

const PUBLISH_RUNNERS = {
  小红书: runPublishXHS,
  知乎: runPublishZhihu,
  微博: runPublishWeibo,
  今日头条: runPublishToutiao,
  百度百家号: runPublishBaijiahao,
};

/** 内部分发逻辑：根据平台路由到对应发布函数 */
async function _runPublish(taskInfo) {
  clearPublishCancel(taskInfo.taskId);
  const platform = normalizePublishPlatform(taskInfo.platform);
  const runner = PUBLISH_RUNNERS[platform];
  if (!runner) {
    throw new Error(
      `暂不支持 ${taskInfo.platform || platform} 平台的自动发布（支持：${Object.keys(PUBLISH_RUNNERS).join('、')}）`
    );
  }
  const content = preparePublishContent(taskInfo.taskId, taskInfo.content);
  return runner({ ...taskInfo, platform, content });
}

/** 点击图文 tab */
async function _clickImageTextTab(page, taskId) {
  try {
    // XHS 创作者页面的图文/视频切换按钮
    const imageTextSelectors = [
      'text=上传图文',
      '[data-tab="image"]',
      '.tab-item:has-text("上传图文")',
      '.publish-tab:has-text("上传图文")',
    ];
    for (const sel of imageTextSelectors) {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await randomDelay(800, 1200);
        appendLog(taskId, '已选择「图文」发布类型');
        return;
      }
    }
    appendLog(taskId, '未找到图文切换按钮，尝试直接继续（可能默认已是图文）');
  } catch {
    appendLog(taskId, '切换图文 tab 失败，继续尝试…');
  }
}

/** 上传图片 */
async function _uploadImages(page, taskId, imagePaths) {
  appendLog(taskId, `正在上传 ${imagePaths.length} 张图片…`);
  try {
    // 等待文件上传按钮出现
    const uploadSelectors = [
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
      '.upload-input',
    ];
    let fileInput = null;
    for (const sel of uploadSelectors) {
      fileInput = await page.$(sel);
      if (fileInput) break;
    }

    if (!fileInput) {
      // 有些页面的 input 是隐藏的，需要点击触发区域后再找
      const triggerSelectors = [
        '.upload-btn', '.add-img', '[class*="upload"]',
        'text=上传图片', 'text=添加图片',
      ];
      for (const sel of triggerSelectors) {
        const trigger = await page.$(sel);
        if (trigger) {
          await trigger.click();
          await randomDelay(500, 800);
          break;
        }
      }
      fileInput = await page.$('input[type="file"]');
    }

    if (!fileInput) {
      appendLog(taskId, '⚠️ 未找到图片上传入口，跳过图片上传');
      return;
    }

    // 过滤出实际存在的文件
    const existingPaths = imagePaths.filter(p => fs.existsSync(p));
    if (existingPaths.length === 0) {
      appendLog(taskId, '⚠️ 图片文件不存在，跳过图片上传');
      return;
    }

    await fileInput.setInputFiles(existingPaths);
    // 等待图片上传完成（根据图片数量动态等待）
    await randomDelay(2000 + existingPaths.length * 1000, 3000 + existingPaths.length * 1500);
    appendLog(taskId, `图片上传完成（${existingPaths.length} 张）`);
  } catch (err) {
    appendLog(taskId, `⚠️ 图片上传异常：${err.message}，继续发布…`);
  }
}

/** 填写标题 */
async function _fillTitle(page, taskId, title) {
  if (!title) return;
  appendLog(taskId, `正在填写标题：${title}`);
  try {
    const titleSelectors = [
      'input[placeholder*="标题"]',
      'input[placeholder*="添加标题"]',
      '.title-input input',
      '[class*="title"] input',
    ];
    for (const sel of titleSelectors) {
      const input = await page.$(sel);
      if (input) {
        await input.click();
        await randomDelay(200, 400);
        await input.fill('');
        for (const ch of title) {
          await input.type(ch, { delay: 40 + Math.random() * 40 });
        }
        appendLog(taskId, '标题填写完成');
        return;
      }
    }
    appendLog(taskId, '⚠️ 未找到标题输入框');
  } catch (err) {
    appendLog(taskId, `⚠️ 填写标题失败：${err.message}`);
  }
}

/** 填写正文 */
async function _fillContent(page, taskId, content) {
  if (!content) return;
  appendLog(taskId, '正在填写正文…');
  try {
    const contentSelectors = [
      '[contenteditable="true"][placeholder*="正文"]',
      '[contenteditable="true"]',
      'textarea[placeholder*="正文"]',
      '.ql-editor',
      '[class*="editor"]',
    ];
    for (const sel of contentSelectors) {
      const editor = await page.$(sel);
      if (editor) {
        await editor.click();
        await randomDelay(300, 500);
        // 清空已有内容
        await page.keyboard.press('Control+a');
        await randomDelay(100, 200);
        // 分段输入，避免过长字符串一次性填入
        const chunks = content.match(/.{1,100}/gs) || [content];
        for (const chunk of chunks) {
          await editor.type(chunk, { delay: 20 + Math.random() * 20 });
        }
        appendLog(taskId, '正文填写完成');
        return;
      }
    }
    appendLog(taskId, '⚠️ 未找到正文编辑框');
  } catch (err) {
    appendLog(taskId, `⚠️ 填写正文失败：${err.message}`);
  }
}

/** 添加话题标签 */
async function _addTags(page, taskId, tags) {
  appendLog(taskId, `正在添加话题标签：${tags}`);
  try {
    const tagList = tags.split(/[,，\s]+/).filter(Boolean).slice(0, 5);
    for (const tag of tagList) {
      const cleanTag = tag.startsWith('#') ? tag.slice(1) : tag;
      const tagInputSelectors = [
        'input[placeholder*="话题"]',
        'input[placeholder*="标签"]',
        '[class*="topic"] input',
        '[class*="tag"] input',
      ];
      for (const sel of tagInputSelectors) {
        const input = await page.$(sel);
        if (input) {
          await input.click();
          await randomDelay(200, 400);
          await input.type(cleanTag, { delay: 60 });
          await randomDelay(800, 1200);
          // 等待下拉候选出现后按 Enter 选择
          await page.keyboard.press('Enter');
          await randomDelay(400, 600);
          break;
        }
      }
    }
    appendLog(taskId, '话题标签添加完成');
  } catch (err) {
    appendLog(taskId, `⚠️ 添加话题标签失败：${err.message}，继续发布…`);
  }
}

/** 点击发布按钮并等待结果，返回帖子 URL */
async function _submitPublish(page, taskId, publishTracker) {
  appendLog(taskId, '正在点击发布按钮…');

  const publishSelectors = [
    'button:has-text("发布")',
    'button:has-text("提交")',
    '.publish-btn',
    '[class*="publish-btn"]',
    'button[type="submit"]:has-text("发布")',
  ];

  let publishBtn = null;
  for (const sel of publishSelectors) {
    publishBtn = await page.$(sel);
    if (publishBtn) break;
  }

  if (!publishBtn) throw new Error('未找到发布按钮，请检查页面是否正确加载');

  await publishBtn.click();
  _markPublishClicked(publishTracker);
  appendLog(taskId, '已点击发布，等待结果…');

  // 等待发布结果：成功跳转或出现成功提示
  let publishedUrl = '';
  try {
    await Promise.race([
      // 成功：页面跳转到帖子详情
      page.waitForURL(url =>
        url.includes('/explore/') || url.includes('/user/profile/') || url.includes('/note/'),
        { timeout: 30000 }
      ),
      // 成功：出现成功提示弹窗
      page.waitForSelector(
        'text=发布成功, text=已发布, .publish-success, [class*="success-tip"]',
        { timeout: 30000 }
      ),
    ]);

    publishedUrl = page.url();

    // 如果跳到了首页而不是帖子页，尝试从提示中找帖子链接
    if (!publishedUrl.includes('/note/') && !publishedUrl.includes('/explore/')) {
      const noteLink = await page.$('a[href*="/note/"]');
      if (noteLink) {
        publishedUrl = await noteLink.getAttribute('href');
        if (publishedUrl && !publishedUrl.startsWith('http')) {
          publishedUrl = 'https://www.xiaohongshu.com' + publishedUrl;
        }
      }
    }
  } catch {
    // 超时也不一定失败，可能已经发布成功但页面未跳转
    appendLog(taskId, '⚠️ 等待发布结果超时，尝试检查当前页面状态…');
    publishedUrl = page.url();
  }

  return publishedUrl;
}

/** 清理已完成任务的内存状态（防止无限增长） */
export function cleanupTask(taskId) {
  runningTasks.delete(String(taskId));
}
