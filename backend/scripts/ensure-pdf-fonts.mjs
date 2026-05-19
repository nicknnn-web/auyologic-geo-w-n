/**
 * 下载 Noto Sans CJK SC（pdfmake 中文），写入 backend/fonts/
 * - postinstall 自动执行
 * - 模板 PDF 生成时若缺字体会再次尝试（ensurePdfFonts）
 * - SKIP_PDF_FONTS_INSTALL=1 可跳过 postinstall
 */
import { copyFileSync, mkdirSync, existsSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PDF_FONT_DIR = join(root, 'fonts');
export const PDF_FONT_REGULAR = 'NotoSansCJKsc-Regular.otf';
export const PDF_FONT_BOLD = 'NotoSansCJKsc-Bold.otf';

const REGULAR_URLS = [
  'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
  'https://fastly.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
  'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
  'https://ghproxy.net/https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
  'https://mirror.ghproxy.com/https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf',
];

const BOLD_URLS = [
  'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
  'https://fastly.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
  'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
  'https://ghproxy.net/https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Bold.otf',
];

export function pdfFontRegularPath() {
  return join(PDF_FONT_DIR, PDF_FONT_REGULAR);
}

export function pdfFontBoldPath() {
  return join(PDF_FONT_DIR, PDF_FONT_BOLD);
}

export function hasPdfFonts() {
  return existsSync(pdfFontRegularPath());
}

async function download(url, dest, timeoutMs = 300000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1_000_000) {
      throw new Error(`文件过小（${buf.length} 字节），可能非字体文件`);
    }
    writeFileSync(dest, buf);
  } finally {
    clearTimeout(timer);
  }
}

async function downloadFirst(urls, dest, label) {
  let lastErr;
  for (const url of urls) {
    try {
      console.log('[pdf-fonts] 尝试下载', label, '←', url.slice(0, 80), '…');
      await download(url, dest);
      console.log('[pdf-fonts] 完成', label);
      return true;
    } catch (e) {
      lastErr = e;
      console.warn('[pdf-fonts] 失败', e.message);
    }
  }
  if (lastErr) throw lastErr;
  return false;
}

/**
 * @param {{ required?: boolean }} [opts]
 * @returns {Promise<boolean>} 是否已有可用 Regular 字体
 */
export async function ensurePdfFonts(opts = {}) {
  const { required = false } = opts;
  mkdirSync(PDF_FONT_DIR, { recursive: true });

  const regularPath = pdfFontRegularPath();
  const boldPath = pdfFontBoldPath();

  if (!existsSync(regularPath)) {
    const customUrl = String(process.env.PDF_FONT_REGULAR_URL || '').trim();
    const urls = customUrl ? [customUrl, ...REGULAR_URLS] : REGULAR_URLS;
    try {
      await downloadFirst(urls, regularPath, PDF_FONT_REGULAR);
    } catch (e) {
      console.error('[pdf-fonts] Regular 全部源失败:', e.message);
      if (required) {
        throw new Error(
          '无法下载 PDF 中文字体。请在 backend 目录执行: node scripts/ensure-pdf-fonts.mjs；' +
            '或设置环境变量 PDF_FONT_REGULAR_URL 指向可访问的 .otf 地址；' +
            '或将 NotoSansCJKsc-Regular.otf 放入 backend/fonts/'
        );
      }
      return false;
    }
  }

  if (!existsSync(boldPath)) {
    try {
      await downloadFirst(BOLD_URLS, boldPath, PDF_FONT_BOLD);
    } catch {
      copyFileSync(regularPath, boldPath);
      console.warn('[pdf-fonts] Bold 下载失败，已用 Regular 代替');
    }
  }

  return true;
}

const scriptPath = fileURLToPath(import.meta.url);
const invoked =
  process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath);

if (invoked) {
  if (process.env.SKIP_PDF_FONTS_INSTALL === '1') {
    process.exit(0);
  }
  ensurePdfFonts({ required: false })
    .then((ok) => {
      if (!ok) {
        console.warn(
          '[pdf-fonts] postinstall 未下载成功；首次导出模板 PDF 时会重试，或请手动放入 backend/fonts/'
        );
      }
      process.exit(0);
    })
    .catch((e) => {
      console.error(e.message || e);
      process.exit(1);
    });
}
