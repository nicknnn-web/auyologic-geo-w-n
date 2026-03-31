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

/** 内部分发逻辑：根据平台路由到对应发布函数 */
async function _runPublish(taskInfo) {
  const { platform } = taskInfo;
  // ✅ Bug修复：加 await，否则拿到的是 Promise 而非结果
  if (platform === '小红书') {
    return await runPublishXHS(taskInfo);
  } else if (platform === '知乎') {
    return await runPublishZhihu(taskInfo);
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
