/**
 * 一键安装 Playwright Chromium（local-agent 目录下执行）
 * 用法：node scripts/install-playwright.mjs
 * 已安装则跳过，避免每次启动重复下载。
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';

function ensurePlaywrightDependency() {
  if (fs.existsSync(join(root, 'node_modules', 'playwright'))) {
    return true;
  }
  console.log('[1/2] 未检测到 playwright 依赖，正在 npm install …');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const ni = spawnSync(npmCmd, ['install'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (ni.status !== 0) {
    console.error('[错误] npm install 失败');
    process.exit(1);
  }
  console.log('');
  return true;
}

/** 在常见缓存目录中查找 Chromium 可执行文件（不依赖 import playwright） */
function findChromiumExecutableOnDisk() {
  const searchRoots = [
    join(root, 'node_modules', 'playwright-core', '.local-browsers'),
    join(root, 'node_modules', 'playwright', '.local-browsers'),
    join(root, 'ms-playwright'),
  ];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    searchRoots.unshift(process.env.PLAYWRIGHT_BROWSERS_PATH);
  }

  for (const base of searchRoots) {
    const found = walkFindBrowser(base, 0);
    if (found) return found;
  }
  return null;
}

function walkFindBrowser(dir, depth) {
  if (!dir || depth > 8 || !fs.existsSync(dir)) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isFile()) {
      const lower = ent.name.toLowerCase();
      if (lower === 'chrome.exe' || lower === 'chrome') return full;
      if (ent.name === 'Chromium' && process.platform === 'darwin') return full;
    }
    if (ent.isDirectory()) {
      if (ent.name === 'Google Chrome for Testing.app' && process.platform === 'darwin') {
        const macChrome = join(full, 'Contents', 'MacOS', 'Google Chrome for Testing');
        if (fs.existsSync(macChrome)) return macChrome;
      }
      const sub = walkFindBrowser(full, depth + 1);d
      if (sub) return sub;
    }
  }
  return null;
}

async function getChromiumExecutablePath() {
  try {
    const { chromium } = await import('playwright');
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch {
    /* playwright 未装好或浏览器未下载 */
  }
  return findChromiumExecutableOnDisk();
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Playwright 浏览器安装(Chromium)        ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log('目录:', root);
  console.log('PLAYWRIGHT_BROWSERS_PATH =', process.env.PLAYWRIGHT_BROWSERS_PATH);
  console.log('');

  ensurePlaywrightDependency();

  const existing = await getChromiumExecutablePath();
  if (existing) {
    console.log('[跳过] 检测到 Chromium 已安装，无需重复下载');
    console.log('路径:', existing);
    console.log('');
    return;
  }

  console.log('[2/2] 正在执行: npx playwright install chromium');
  console.log('      首次下载约 150MB，请保持网络畅通…');
  console.log('');

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const r = spawnSync(npx, ['playwright', 'install', 'chromium'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  if (r.status !== 0) {
    console.error('');
    console.error('[失败] 浏览器安装未完成。可改用本机 Google Chrome，或检查网络后重试。');
    process.exit(r.status ?? 1);
  }

  const after = await getChromiumExecutablePath();
  console.log('');
  if (after) {
    console.log('[完成] Chromium 已就绪:', after);
  } else {
    console.log('[完成] npx playwright install chromium 已执行完毕（请确认无报错）');
  }
  console.log('');
}

main().catch((err) => {
  console.error('[错误]', err?.message || err);
  process.exit(1);
});
