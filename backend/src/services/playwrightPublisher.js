import {chromium} from 'playwright';
import fs from 'fs';

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

function findSystemChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p)) || null;
}

function buildLaunchOptions() {
  const executablePath = findSystemChrome();
  const opts = {
    headless: false, // 发帖时显示浏览器，方便排查问题
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--lang=zh-CN',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };
  if (executablePath) opts.executablePath = executablePath;
  return opts;
}

function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
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

  const browser = await chromium.launch(buildLaunchOptions());
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

/** 内部分发逻辑：根据平台路由到对应发布函数 */
async function _runPublish(taskInfo) {
  const { platform } = taskInfo;
  // ✅ Bug修复：加 await，否则拿到的是 Promise 而非结果
  if (platform === '小红书') {
    return await runPublishXHS(taskInfo);
  } else if (platform === '知乎') {
    return await runPublishZhihu(taskInfo);
  } else if (platform === '微博') {
    return await runPublishWeibo(taskInfo);
  } else {
    throw new Error(`暂不支持 ${platform} 平台的自动发布`);
  }
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
