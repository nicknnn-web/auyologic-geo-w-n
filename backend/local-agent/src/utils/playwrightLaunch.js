/**
 * 跨平台 Playwright 启动（与 local-agent/playwrightLaunch.js 逻辑一致，ESM 供 playwrightPublisher 使用）
 */

import fs from 'fs';
import { chromium } from 'playwright';

export function findSystemChrome() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      : null,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

export function buildLaunchOptions(overrides = {}) {
  const executablePath = findSystemChrome();
  const headless =
    overrides.headless !== undefined
      ? overrides.headless
      : process.env.PLAYWRIGHT_HEADED === 'true'
        ? false
        : process.env.NODE_ENV === 'production' && !executablePath;

  const opts = {
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--lang=zh-CN',
      '--start-maximized',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    ...overrides,
  };

  if (executablePath) {
    opts.executablePath = executablePath;
    console.log('[Playwright] 使用系统 Chrome：', executablePath);
  } else if (!headless) {
    opts.channel = 'chrome';
    console.log('[Playwright] 尝试 channel=chrome（本机 Google Chrome）');
  } else {
    console.log('[Playwright] 无头模式，使用内置 Chromium');
  }
  return opts;
}

function wrapBrowserMissingError(err) {
  const msg = err?.message || String(err);
  if (/Executable doesn't exist|npx playwright install|browserType\.launch/i.test(msg)) {
    const hint =
      process.platform === 'darwin'
        ? 'Playwright 浏览器未安装。请在 local-agent 目录双击 install-playwright.command，或执行:\n' +
          '  export PLAYWRIGHT_BROWSERS_PATH=0 && npx playwright install chromium'
        : 'Playwright 浏览器未安装。请在 local-agent 目录双击 install-playwright.bat，或执行: npx playwright install chromium';
    return new Error(`${hint}\n\n原始错误: ${msg}`);
  }
  return err;
}

export async function launchChromium(overrides = {}) {
  const opts = buildLaunchOptions(overrides);
  try {
    return await chromium.launch(opts);
  } catch (firstErr) {
    if (opts.channel && !opts.executablePath) {
      console.warn('[Playwright] channel=chrome 启动失败，尝试内置 Chromium…', firstErr.message);
      const fallback = { ...opts };
      delete fallback.channel;
      delete fallback.executablePath;
      try {
        return await chromium.launch(fallback);
      } catch (secondErr) {
        throw wrapBrowserMissingError(secondErr);
      }
    }
    throw wrapBrowserMissingError(firstErr);
  }
}
