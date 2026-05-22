'use strict';
/**
 * 跨平台 Playwright 启动：优先系统 Chrome，其次 channel=chrome，最后内置 Chromium
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function findSystemChrome() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    process.env.CHROME_PATH,
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      : null,
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    home ? path.join(home, '.local/share/applications/google-chrome') : null,
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function buildLaunchOptions(overrides = {}) {
  const executablePath = findSystemChrome();
  const opts = {
    headless: false,
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
  } else {
    opts.channel = 'chrome';
    console.log('[Playwright] 未找到 Chrome 路径，尝试 channel=chrome（本机已安装的 Google Chrome）');
  }
  return opts;
}

function wrapBrowserMissingError(err) {
  const msg = err?.message || String(err);
  if (/Executable doesn't exist|npx playwright install|browserType\.launch/i.test(msg)) {
    const hint =
      process.platform === 'darwin'
        ? 'macOS：请先安装 Google Chrome，或在 local-agent 目录执行:\n' +
          '  export PLAYWRIGHT_BROWSERS_PATH=0\n' +
          '  npx playwright install chromium'
        : '请安装 Google Chrome，或在 local-agent 目录执行: npx playwright install chromium';
    return new Error(`${hint}\n\n原始错误: ${msg}`);
  }
  return err;
}

/**
 * @param {object} [overrides] 传给 chromium.launch 的额外参数
 */
async function launchBrowser(overrides = {}) {
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

module.exports = { findSystemChrome, buildLaunchOptions, launchBrowser };
