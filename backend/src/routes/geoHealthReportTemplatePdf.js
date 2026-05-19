/**
 * 品牌体检报告：模板 PDF
 * 默认 pdfmake（无需 Chromium，适合 Zeabur）；GEO_HEALTH_PDF_ENGINE=playwright 可回退旧实现。
 */
import { Router } from 'express';
import { buildHealthReportPdfBuffer } from '../services/geoHealthReportPdfMake.js';

const router = Router();

async function fetchReportPayload(req) {
  const userId = (req.get('x-user-id') || 'default_user').trim() || 'default_user';
  const port = req.socket?.localPort;
  if (!port) {
    throw new Error('无法解析本机服务端口，请设置环境变量 INTERNAL_API_BASE（例如 http://127.0.0.1:3000）');
  }
  const base = (process.env.INTERNAL_API_BASE || '').trim() || `http://127.0.0.1:${port}`;
  const url = `${base.replace(/\/+$/, '')}/api/geo-health-report`;
  const res = await fetch(url, { headers: { 'x-user-id': userId } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `拉取报告数据失败 HTTP ${res.status}`);
  }
  if (!json.success) {
    throw new Error(json.error || '报告接口返回失败');
  }
  const hasTask = json.rawData?.taskId != null && Number(json.rawData.taskId) > 0;
  const hasModels = Array.isArray(json.modelVisibilityCards) && json.modelVisibilityCards.length > 0;
  if (!hasTask && !hasModels) {
    const err = new Error('暂无体检数据，无法生成 PDF');
    err.statusCode = 400;
    throw err;
  }
  return json;
}

function parseCompetitorDataZoomQuery(req) {
  const start = parseFloat(String(req.query.competitorDzStart ?? '').trim());
  const end = parseFloat(String(req.query.competitorDzEnd ?? '').trim());
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end > 100 || start >= end) return null;
  return { start, end };
}

async function renderTemplatePdfPlaywright(payload, templateOpts) {
  const { buildHealthReportPdfHtml } = await import('../services/geoHealthReportPdfTemplate.js');
  const { chromium } = await import('playwright');
  const fs = await import('fs');

  function findSystemChrome() {
    const candidates = [
      process.env.CHROME_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ].filter(Boolean);
    return candidates.find((p) => fs.existsSync(p)) || null;
  }

  const executablePath = findSystemChrome();
  const headless =
    process.env.PLAYWRIGHT_HEADED === 'true'
      ? false
      : process.env.NODE_ENV === 'production' || !executablePath;
  const args = ['--disable-blink-features=AutomationControlled', '--disable-infobars', '--lang=zh-CN'];
  if (process.env.PW_CHROME_NO_SANDBOX === '1') {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  const launchOpts = {
    headless,
    args,
    ignoreDefaultArgs: ['--enable-automation'],
  };
  if (executablePath) launchOpts.executablePath = executablePath;

  const html = buildHealthReportPdfHtml(payload, templateOpts || {});
  const browser = await chromium.launch(launchOpts);
  try {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 1600 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await page.emulateMedia({ media: 'screen' });
    const pdfBuf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      preferCSSPageSize: false,
    });
    await context.close();
    return Buffer.from(pdfBuf);
  } finally {
    await browser.close();
  }
}

async function renderTemplatePdf(payload, templateOpts) {
  const engine = String(process.env.GEO_HEALTH_PDF_ENGINE || 'pdfmake')
    .trim()
    .toLowerCase();
  if (engine === 'playwright') {
    return renderTemplatePdfPlaywright(payload, templateOpts);
  }
  return buildHealthReportPdfBuffer(payload, templateOpts);
}

async function handleTemplatePdf(req, res) {
  let payload;
  try {
    payload = await fetchReportPayload(req);
  } catch (e) {
    const code = e.statusCode || 500;
    return res.status(code).json({ success: false, error: e.message || String(e) });
  }

  try {
    const templateOpts = {
      competitorDataZoom: parseCompetitorDataZoomQuery(req),
    };
    const pdfBuf = await renderTemplatePdf(payload, templateOpts);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`品牌AI健康体检报告_模板_${stamp}.pdf`)}`
    );
    res.send(pdfBuf);
  } catch (e) {
    console.error('[geo-health-report/template-pdf]', e);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: e?.message || String(e) });
    }
  }
}

/** 模板 PDF（默认 pdfmake，Zeabur 无需 Chromium） */
router.get('/geo-health-report/template-pdf', handleTemplatePdf);

/** 兼容旧路径 */
router.get('/geo-health-report/playwright-pdf', handleTemplatePdf);

export default router;
