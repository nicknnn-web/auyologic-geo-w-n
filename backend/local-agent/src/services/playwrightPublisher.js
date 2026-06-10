import fs from 'fs';
import { launchChromium } from '../utils/playwrightLaunch.js';
import { normalizePublishPlatform } from '../utils/publishPlatformNormalize.js';
import { htmlToPlainText } from '../utils/htmlToPlainText.js';

// 内存中的发布任务状态（taskId -> taskState）
const runningTasks = new Map();

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

/** 模拟人工：每次点击操作后等待 2～3 秒 */
function afterHumanClick() {
  return randomDelay(2000, 3000);
}

/** 追加任务日志（同时更新内存状态） */
function appendLog(taskId, msg) {
  const task = runningTasks.get(String(taskId));
  if (!task) return;
  const line = `[${new Date().toLocaleTimeString('zh-CN')}] ${msg}`;
  task.log = (task.log || '') + line + '\n';
  console.log(`[Task ${taskId}] ${msg}`);
}

/** 获取任务当前状态（供 API 轮询） */
export function getTaskStatus(taskId) {
  return runningTasks.get(String(taskId)) || null;
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
async function _createBrowserSession(taskId, sessionState) {
  const sessionStateObj =
    typeof sessionState === 'string' ? JSON.parse(sessionState) : sessionState;

  const browser = await launchChromium();
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
  runningTasks.set(String(taskId), {
    status: 'running',
    log: '',
    publishedUrl: null,
    errorMessage: null,
  });
  try {
    const { publishedUrl } = await _runPublish(taskInfo);
    const log = runningTasks.get(String(taskId))?.log || '';
    cleanupTask(taskId);
    return { success: true, publishedUrl: publishedUrl || '', log };
  } catch (err) {
    const log = runningTasks.get(String(taskId))?.log || '';
    cleanupTask(taskId);
    return { success: false, error: err.message, log };
  }
}
async function runPublishXHS(taskInfo) {
  const { taskId, sessionState, content, title, tags, imagePaths } = taskInfo;
  appendLog(taskId, '正在启动浏览器…');

  // ✅ 公共：复用 _createBrowserSession
  const { browser, page } = await _createBrowserSession(taskId, sessionState);

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
    const publishedUrl = await _submitPublish(page, taskId);
    appendLog(taskId, `✅ 小红书发布成功！链接：${publishedUrl || '未获取到链接'}`);
    return { publishedUrl: publishedUrl || '' };
  } catch (err) {
    appendLog(taskId, `❌ 小红书发布失败：${err.message}`);
    throw err;
  } finally {
    await browser.close().catch(() => {});
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
    const publishedUrl = await _zhihuSubmitPublish(page, taskId);

    appendLog(taskId, `✅ 知乎发布成功！链接：${publishedUrl || '未获取到链接'}`);
    return { publishedUrl: publishedUrl || '' };
  } catch (err) {
    appendLog(taskId, `❌ 知乎发布失败：${err.message}`);
    throw err;
  } finally {
    await browser.close().catch(() => {});
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
async function _zhihuSubmitPublish(page, taskId) {
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
    const publishedUrl = await _weiboSubmitPublish(page, taskId);

    appendLog(taskId, `✅ 微博发布成功！链接：${publishedUrl || '未获取到链接'}`);
    return { publishedUrl: publishedUrl || '' };
  } catch (err) {
    appendLog(taskId, `❌ 微博发布失败：${err.message}`);
    throw err;
  } finally {
    await browser.close().catch(() => {});
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
async function _weiboSubmitPublish(page, taskId) {
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
  } else {
    await publishBtn.click({ force: true });
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
    const publishedUrl = await _toutiaoSubmitPublish(page, taskId);

    appendLog(taskId, `✅ 今日头条发布成功！链接：https://mp.toutiao.com/profile_v4/graphic/articles`);
    return { publishedUrl: 'https://mp.toutiao.com/profile_v4/graphic/articles' };
  } catch (err) {
    appendLog(taskId, `❌ 今日头条发布失败：${err.message}`);
    throw err;
  } finally {
    await browser.close().catch(() => {});
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
  const plainContent = htmlToPlainText(content);
  if (plainContent !== content) {
    appendLog(taskId, '正文含 HTML 标签，已转为纯文本再填入编辑器');
  }
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
        const chunks = plainContent.match(/.{1,200}/gs) || [plainContent];
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
async function _toutiaoPollClickConfirmPublish(page, taskId) {
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

async function _toutiaoSubmitPublish(page, taskId) {
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
  await _toutiaoPollClickConfirmPublish(page, taskId);

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

/**
 * 百度百家号 · 图文发布
 */
async function runPublishBaijiahao(taskInfo) {
  const { taskId, sessionState, content, title, tags } = taskInfo;
  appendLog(taskId, '正在启动浏览器…');

  const { browser, page } = await _createBrowserSession(taskId, sessionState);

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

    appendLog(taskId, '已进入编辑页，开始填写图文…');

    const safeTitle = (title || '未命名文章').slice(0, 64);
    await _baijiahaoFillTitle(page, taskId, safeTitle);
    await afterHumanClick();
    await _baijiahaoFillContent(page, taskId, content || '');
    await afterHumanClick();

    if (tags && String(tags).trim()) {
      appendLog(taskId, 'ℹ️ 百度百家号图文暂不支持话题标签字段，已忽略 tags');
    }

    await _baijiahaoSyncEditorState(page, taskId);
    const publishedUrl = await _baijiahaoSubmitPublish(page, taskId);

    appendLog(taskId, `✅ 百度百家号发布成功！链接：${publishedUrl || '（请在百家号内容管理查看）'}`);
    return {
      publishedUrl: publishedUrl || 'https://baijiahao.baidu.com/builder/rc/content',
    };
  } catch (err) {
    appendLog(taskId, `❌ 百度百家号发布失败：${err.message}`);
    throw err;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function _baijiahaoFillTitle(page, taskId, title) {
  if (!title) return;
  appendLog(taskId, `正在填写标题：${title}`);
  const selectors = [
    'textarea[placeholder*="标题"]',
    'input[placeholder*="标题"]',
    '[class*="title"] textarea',
    '[class*="title"] input',
    '#title',
    '[data-testid*="title"]',
  ];
  for (const sel of selectors) {
    const input = await page.$(sel);
    if (!input) continue;
    await input.click();
    await afterHumanClick();
    await input.fill('');
    await input.type(title, { delay: 35 + Math.random() * 35 });
    appendLog(taskId, '标题填写完成');
    return;
  }
  const filled = await page.evaluate((t) => {
    for (const el of document.querySelectorAll('textarea, input[type="text"]')) {
      const ph = (el.getAttribute('placeholder') || '').toLowerCase();
      if (!ph.includes('标题') && !ph.includes('title')) continue;
      el.focus();
      el.value = t;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }, title);
  if (filled) appendLog(taskId, '标题填写完成（备用方式）');
  else appendLog(taskId, '⚠️ 未找到标题输入框');
}

async function _baijiahaoFillContent(page, taskId, content) {
  if (!content) return;
  const plainContent = htmlToPlainText(content);
  if (plainContent !== content) {
    appendLog(taskId, '正文含 HTML 标签，已转为纯文本再填入编辑器');
  }
  appendLog(taskId, '正在填写正文…');
  const selectors = [
    '.ProseMirror[contenteditable="true"]',
    '.public-DraftEditor-content[contenteditable="true"]',
    '[contenteditable="true"][class*="editor"]',
    '.editor-content [contenteditable="true"]',
    'iframe[id*="editor"]',
    '[contenteditable="true"]',
  ];
  for (const sel of selectors) {
    if (sel.includes('iframe')) {
      const frame = page.frameLocator(sel).first();
      const body = frame.locator('body[contenteditable="true"], [contenteditable="true"]').first();
      if (await body.count().catch(() => 0)) {
        await body.click();
        await afterHumanClick();
        await page.keyboard.type(plainContent.slice(0, 5000), { delay: 10 });
        appendLog(taskId, '正文填写完成（iframe 编辑器）');
        await afterHumanClick();
        return;
      }
      continue;
    }
    const editors = await page.$$(sel);
    for (const editor of editors) {
      const box = await editor.boundingBox();
      if (!box || box.height < 60) continue;
      await editor.click();
      await afterHumanClick();
      await page.keyboard.press('Control+a');
      await randomDelay(200, 400);
      const chunks = plainContent.match(/.{1,200}/gs) || [plainContent];
      for (const chunk of chunks) {
        await editor.type(chunk, { delay: 12 + Math.random() * 12 });
        await randomDelay(300, 600);
      }
      appendLog(taskId, '正文填写完成');
      await afterHumanClick();
      return;
    }
  }
  appendLog(taskId, '⚠️ 未找到正文编辑框');
}

async function _baijiahaoSyncEditorState(page, taskId) {
  try {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('[contenteditable="true"], textarea, input')) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    });
    await page.keyboard.press('Tab').catch(() => {});
    await afterHumanClick();
    appendLog(taskId, '已同步编辑器状态');
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

async function _baijiahaoClickMainPublishButton(page, taskId) {
  appendLog(taskId, '正在查找主发布按钮…');
  await randomDelay(1500, 2500);

  const publishBtn = page.locator('button[data-testid="publish-btn"]');
  try {
    await publishBtn.waitFor({ state: 'visible', timeout: 20000 });
    await publishBtn.scrollIntoViewIfNeeded();
    await randomDelay(1000, 2000);
    await publishBtn.click();
    appendLog(taskId, '已点击「发布」（data-testid=publish-btn）');
    await afterHumanClick();
    return true;
  } catch (err) {
    appendLog(taskId, `⚠️ 未找到 publish-btn：${err.message}，尝试文案匹配…`);
  }

  return _clickButtonByTexts(page, taskId, ['发布', '立即发布', '确认发布', '发表'], '已点击');
}

async function _baijiahaoSubmitPublish(page, taskId) {
  const publishClicked = await _baijiahaoClickMainPublishButton(page, taskId);
  if (!publishClicked) {
    throw new Error('未找到可点击的发布按钮，请确认标题/正文已填写且账号有发稿权限');
  }

  await _baijiahaoHandlePostPublishModals(page, taskId);
  await randomDelay(2000, 3500);

  let publishedUrl = '';
  try {
    await page.waitForURL(
      (url) => {
        const s = String(url);
        return (
          s.includes('baijiahao.baidu.com') &&
          !_isBaijiahaoSessionExpired(s) &&
          (!s.includes('/edit') || s.includes('/content') || s.includes('/manage'))
        );
      },
      { timeout: 60000 }
    );
    publishedUrl = page.url();
  } catch {
    appendLog(taskId, '⚠️ 等待发布跳转超时，尝试读取页面链接…');
    publishedUrl = page.url();
    const link = await page.$('a[href*="baijiahao.baidu.com"], a[href*="mbd.baidu.com"]');
    if (link) {
      const href = await link.getAttribute('href');
      if (href) publishedUrl = href.startsWith('http') ? href : `https://baijiahao.baidu.com${href}`;
    }
  }
  return publishedUrl;
}

/** 本地代理 zip 内 playwrightPublisher 构建标识（更新后请重新下载代理） */
export const PUBLISHER_BUILD_ID = '2026-06-10-bjh-v3';

const PUBLISH_RUNNERS = {
  小红书: runPublishXHS,
  知乎: runPublishZhihu,
  微博: runPublishWeibo,
  今日头条: runPublishToutiao,
  百度百家号: runPublishBaijiahao,
};

/** 内部分发逻辑：根据平台路由到对应发布函数 */
async function _runPublish(taskInfo) {
  const platform = normalizePublishPlatform(taskInfo.platform);
  const runner = PUBLISH_RUNNERS[platform];
  if (!runner) {
    throw new Error(
      `暂不支持 ${taskInfo.platform || platform} 平台的自动发布（支持：${Object.keys(PUBLISH_RUNNERS).join('、')}）`
    );
  }
  return runner({ ...taskInfo, platform });
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
async function _submitPublish(page, taskId) {
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
