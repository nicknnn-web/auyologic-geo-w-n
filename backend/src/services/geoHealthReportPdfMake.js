/**
 * 品牌体检报告：pdfmake 生成 PDF（无需 Playwright / Chromium，适合 Zeabur）。
 * 数据结构与 GET /api/geo-health-report 一致。
 */
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import PdfPrinter from 'pdfmake';
import { sliceCompetitorMentionsByDataZoom } from '../utils/competitorParetoDataZoomSlice.js';
import { sortSentimentWordCloudForExport } from '../utils/sentimentWordCloudExportSort.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(__dirname, '../../fonts');

const CELL_THEME = {
  industry_first: { bg: '#ecfdf5', fg: '#047857' },
  precise_hit: { bg: '#ecfdf5', fg: '#047857' },
  brand_win: { bg: '#ecfdf5', fg: '#047857' },
  head_tier: { bg: '#eff6ff', fg: '#1d4ed8' },
  weak_awareness: { bg: '#fffbeb', fg: '#b45309' },
  info_bias: { bg: '#fffbeb', fg: '#b45309' },
  tie: { bg: '#fffbeb', fg: '#b45309' },
  mind_missing: { bg: '#f3f4f6', fg: '#4b5563' },
  mentioned_tail: { bg: '#f3f4f6', fg: '#4b5563' },
  competitor_win: { bg: '#f3f4f6', fg: '#4b5563' },
  negative_risk: { bg: '#fef2f2', fg: '#b91c1c' },
  hijack_risk: { bg: '#fef2f2', fg: '#b91c1c' },
  no_data: { bg: '#f9fafb', fg: '#9ca3af' },
};

const FONT_KEY = 'NotoSansSC';

/** A4 内容区近似宽度（pt），用于分隔线与词云换行 */
const CONTENT_WIDTH = 515;

let printerCache = null;
let fontsReadyPromise = null;

function cellTheme(state) {
  return CELL_THEME[String(state || '')] || CELL_THEME.no_data;
}

function pct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  return String(Math.round(x * 10) / 10);
}

function plain(s) {
  return String(s ?? '').replace(/\*\*/g, '').trim();
}

function formatTime(v) {
  if (v == null || v === '') return '—';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(v);
  }
}

function resolveFontPaths() {
  const bundledRegular = join(FONT_DIR, 'NotoSansCJKsc-Regular.otf');
  const bundledBold = join(FONT_DIR, 'NotoSansCJKsc-Bold.otf');
  const candidates = [
    { normal: bundledRegular, bold: bundledBold },
    {
      normal: join(FONT_DIR, 'NotoSansSC-Regular.otf'),
      bold: join(FONT_DIR, 'NotoSansSC-Bold.otf'),
    },
  ];

  for (const c of candidates) {
    if (c.normal && existsSync(c.normal)) {
      const bold = c.bold && existsSync(c.bold) ? c.bold : c.normal;
      return {
        [FONT_KEY]: {
          normal: c.normal,
          bold,
          italics: c.normal,
          bolditalics: bold,
        },
      };
    }
  }

  return null;
}

async function ensureFontsReady() {
  if (resolveFontPaths()) return;
  if (!fontsReadyPromise) {
    fontsReadyPromise = (async () => {
      const { ensurePdfFonts } = await import('../../scripts/ensure-pdf-fonts.mjs');
      await ensurePdfFonts({ required: true });
      if (!resolveFontPaths()) {
        throw new Error(
          '缺少 PDF 中文字体：请将 NotoSansCJKsc-Regular.otf 放入 backend/fonts/ 后重试'
        );
      }
      printerCache = null;
    })();
  }
  await fontsReadyPromise;
}

function getPrinter() {
  const fonts = resolveFontPaths();
  if (!fonts) {
    throw new Error('PDF 字体未就绪');
  }
  if (!printerCache) {
    printerCache = new PdfPrinter(fonts);
  }
  return printerCache;
}

/** 整块模块不内部分页；模块之间用 margin 分隔 */
function sectionModule(blocks, { unbreakable = true, marginBottom = 22 } = {}) {
  const stack = (Array.isArray(blocks) ? blocks : [blocks]).flat().filter(Boolean);
  if (!stack.length) return null;
  return {
    unbreakable,
    stack,
    margin: [0, 0, 0, marginBottom],
  };
}

function sectionTitle(text) {
  return {
    stack: [
      { text, fontSize: 15, bold: true, color: '#303133', margin: [0, 0, 0, 8] },
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: CONTENT_WIDTH,
            y2: 0,
            lineWidth: 1,
            lineColor: '#ebeef5',
          },
        ],
        margin: [0, 0, 0, 12],
      },
    ],
  };
}

function muted(text) {
  return { text, fontSize: 10, color: '#909399', margin: [0, 4, 0, 8] };
}

function buildReportHeader(data) {
  const brand = plain(data.brandName || '品牌');
  const domain = data.brandDomain ? plain(data.brandDomain) : '';
  const check = formatTime(data.checkTime);
  const health = pct(data.healthScore ?? 0);
  const metaLine = [
    `品牌：${brand}`,
    domain ? `站点：${domain}` : null,
    `体检时间：${check}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    unbreakable: true,
    stack: [
      {
        text: '品牌 AI 健康体检报告',
        fontSize: 22,
        bold: true,
        color: '#303133',
        margin: [0, 0, 0, 8],
      },
      {
        text: metaLine,
        fontSize: 12,
        color: '#606266',
        lineHeight: 1.45,
        margin: [0, 0, 0, 14],
      },
      {
        table: {
          widths: ['auto'],
          body: [
            [
              {
                text: `首模型 AI 健康分 ${health}`,
                fontSize: 14,
                bold: true,
                color: '#409eff',
                alignment: 'center',
              },
            ],
          ],
        },
        layout: {
          defaultBorder: false,
          fillColor: () => '#ecf5ff',
          paddingLeft: () => 14,
          paddingRight: () => 14,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      },
    ],
    margin: [0, 0, 0, 24],
  };
}

function buildKpiSection(data) {
  const kpiDenominatorLabel =
    data.kpiDenominator === 'open_only' ? '（分母：开放式提问）' : '（分母：全部提问）';
  const items = [
    { label: '心智拦截率', val: `${pct(data.interceptRate)}%`, sub: kpiDenominatorLabel },
    {
      label: '大模型盲区',
      val: `${data.blindModelCount ?? 0} / ${data.totalModelCount ?? 0}`,
      sub: '盲区模型数 / 检测模型数',
    },
    {
      label: '负面事实关联',
      val: `${pct((data.negativeRatio ?? 0) * 100)}%`,
      sub: plain(data.negativeRiskLevel) || '—',
    },
    { label: '信源权威性', val: `${pct(data.authorityScore)}%`, sub: '可信信源引用占比' },
    {
      label: '品牌提及率（开放式）',
      val: `${pct(data.brandMentionRate)}%`,
      sub: `开放式样本 ${data.openMentionTotal ?? 0} 条`,
    },
    {
      label: '行业提及基准',
      val: `${pct(data.industryMentionRate)}%`,
      sub: `开放式题目数 ${data.openQuestionCount ?? 0}`,
    },
  ];

  const kpiCard = (it) => ({
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: it.label, fontSize: 12, color: '#909399' },
              { text: it.val, fontSize: 18, bold: true, margin: [0, 4, 0, 4] },
              { text: it.sub, fontSize: 11, color: '#909399', lineHeight: 1.35 },
            ],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#ebeef5',
      vLineColor: () => '#ebeef5',
      fillColor: () => '#fafbfc',
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: () => 10,
      paddingBottom: () => 10,
    },
  });

  const row = (a, b, c) => ({
    columns: [
      { width: '33%', ...kpiCard(a) },
      { width: '33%', ...kpiCard(b) },
      { width: '34%', ...kpiCard(c) },
    ],
    columnGap: 10,
    margin: [0, 0, 0, 10],
  });

  return sectionModule([
    sectionTitle('核心指标'),
    row(items[0], items[1], items[2]),
    row(items[3], items[4], items[5]),
  ]);
}

function dataTable(headers, rows, widths) {
  return {
    table: {
      headerRows: 1,
      widths: widths || headers.map(() => '*'),
      body: [headers, ...rows],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#ebeef5',
      vLineColor: () => '#ebeef5',
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    margin: [0, 0, 0, 8],
  };
}

function thCell(text) {
  return { text, bold: true, fillColor: '#f5f7fa', color: '#606266', fontSize: 10 };
}

function buildModelSection(cards) {
  if (!Array.isArray(cards) || !cards.length) {
    return sectionModule([sectionTitle('大模型可见度'), muted('暂无模型可见度数据')]);
  }
  const body = cards.map((c) => [
    plain(c.name || c.platformKey),
    { text: `${pct(c.score)}%`, alignment: 'right' },
    { text: `${pct(c.healthScore)}`, alignment: 'right' },
    plain(c.statusText || ''),
  ]);
  return sectionModule([
    sectionTitle('大模型可见度'),
    dataTable(
      [thCell('模型'), thCell('可见度'), thCell('AI 健康分'), thCell('评估')],
      body,
      ['*', 52, 52, 70]
    ),
  ]);
}

function buildMatrixSection(intentPaths, platforms, matrixData) {
  if (!Array.isArray(intentPaths) || !intentPaths.length) {
    return sectionModule([sectionTitle('综合语境矩阵'), muted('暂无语境矩阵')]);
  }
  if (!Array.isArray(platforms) || !platforms.length) {
    return sectionModule([sectionTitle('综合语境矩阵'), muted('暂无模型列')]);
  }

  const header = [
    thCell('场景 / 模型'),
    ...platforms.map((p) => ({
      text: plain(p.name || p.key),
      bold: true,
      fillColor: '#f0f2f5',
      alignment: 'center',
      fontSize: 8,
    })),
  ];

  const body = intentPaths.map((path) => {
    const label = path.label || path.type || path.key;
    const cells = platforms.map((plat) => {
      const cell = matrixData?.[path.key]?.[plat.key] || { state: 'no_data', label: '—' };
      const t = cellTheme(cell.state);
      return {
        text: plain(cell.label || '—'),
        fillColor: t.bg,
        color: t.fg,
        alignment: 'center',
        bold: true,
        fontSize: 8,
      };
    });
    return [{ text: plain(label), bold: true, fillColor: '#f0f2f5', fontSize: 8 }, ...cells];
  });

  const colCount = header.length;
  const widths = ['auto', ...platforms.map(() => '*')];

  return sectionModule([
    sectionTitle('综合语境矩阵'),
    {
      table: { headerRows: 1, widths, body: [header, ...body] },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#e4e7ed',
        vLineColor: () => '#e4e7ed',
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      fontSize: 8,
    },
  ]);
}

function buildMatrixContextSection(mc) {
  if (!mc || typeof mc !== 'object') return null;
  const blocks = [];
  if (mc.name) {
    blocks.push({
      text: `档位：${plain(mc.name)}（${plain(mc.level || '')}）`,
      fontSize: 10,
      margin: [0, 0, 0, 4],
    });
  }
  if (mc.summary) blocks.push({ text: plain(mc.summary), fontSize: 10, margin: [0, 0, 0, 4] });
  if (mc.diagnosisLine) {
    blocks.push({ text: plain(mc.diagnosisLine), fontSize: 10, margin: [0, 0, 0, 4] });
  }
  const sug = (Array.isArray(mc.suggestions) ? mc.suggestions : [])
    .map((s) => plain(s))
    .filter(Boolean);
  if (!blocks.length && !sug.length) return null;
  return sectionModule([
    sectionTitle('综合语境矩阵摘要'),
    ...blocks,
    sug.length ? { ul: sug, fontSize: 10, margin: [0, 0, 0, 0] } : null,
  ]);
}

function buildCompetitorSection(rows, note) {
  const inner = [sectionTitle('竞品提及')];
  if (note) inner.push(muted(note));
  if (!Array.isArray(rows) || !rows.length) {
    inner.push(muted('暂无竞品提及数据'));
    return sectionModule(inner);
  }
  const body = rows.map((r) => [
    plain(r.name),
    { text: String(r.count ?? 0), alignment: 'right' },
    { text: `${r.pct ?? 0}%`, alignment: 'right' },
  ]);
  inner.push(
    dataTable(
      [thCell('竞品'), thCell('提及次数'), thCell('占比')],
      body,
      ['*', 60, 50]
    )
  );
  // 竞品行数多时不整块锁定，避免单页放不下；标题区仍与表格同模块分隔
  return sectionModule(inner, { unbreakable: rows.length <= 28 });
}

function wordPolarityColor(p) {
  if (p === 'positive') return { bg: '#ecfdf5', fg: '#047857' };
  if (p === 'negative') return { bg: '#fef2f2', fg: '#b91c1c' };
  return { bg: '#f3f4f6', fg: '#4b5563' };
}

function estimateWordTagWidth(text, count) {
  const label = `${plain(text)} ${count ?? 0}`;
  return label.length * 11 + 32;
}

function wordTagPillNode(w) {
  const { bg, fg } = wordPolarityColor(w.polarity);
  const label = `${plain(w.text)} ${w.count ?? 0}`;
  return {
    table: {
      widths: ['auto'],
      body: [[{ text: label, fontSize: 12, color: fg, alignment: 'center' }]],
    },
    layout: {
      defaultBorder: false,
      fillColor: () => bg,
      paddingLeft: () => 12,
      paddingRight: () => 12,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
    margin: [0, 0, 10, 10],
    _tagWidth: estimateWordTagWidth(w.text, w.count),
  };
}

function layoutWordTagRows(list) {
  const sorted = sortSentimentWordCloudForExport(list);
  const pills = sorted.map(wordTagPillNode);
  const rows = [];
  let row = [];
  let rowW = 0;

  for (const pill of pills) {
    const w = pill._tagWidth || 60;
    if (row.length && rowW + w > CONTENT_WIDTH) {
      rows.push({
        columns: row.map(({ _tagWidth, ...node }) => node),
        columnGap: 0,
        margin: [0, 0, 0, 2],
      });
      row = [];
      rowW = 0;
    }
    row.push(pill);
    rowW += w;
  }
  if (row.length) {
    rows.push({
      columns: row.map(({ _tagWidth, ...node }) => node),
      columnGap: 0,
      margin: [0, 0, 0, 2],
    });
  }
  return rows;
}

function buildWordCloudSection(list) {
  if (!Array.isArray(list) || !list.length) {
    return sectionModule([sectionTitle('情感词云（词条）'), muted('暂无词云词条')]);
  }
  // 词条可能很多：允许跨页，避免整块 unbreakable 撑爆单页
  return sectionModule([sectionTitle('情感词云（词条）'), ...layoutWordTagRows(list)], {
    unbreakable: false,
  });
}

function buildSourceSection(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return sectionModule([sectionTitle('信源分类'), muted('暂无信源分类')]);
  }
  const body = rows.map((r) => [
    plain(r.type),
    { text: String(r.count ?? 0), alignment: 'right' },
    { text: `${r.pct ?? 0}%`, alignment: 'right' },
  ]);
  return sectionModule([
    sectionTitle('信源分类'),
    dataTable(
      [thCell('信源类型'), thCell('篇数'), thCell('占比')],
      body,
      ['*', 60, 50]
    ),
  ]);
}

function buildDiagnosticSection(items) {
  if (!Array.isArray(items) || !items.length) {
    return sectionModule([sectionTitle('智能诊断与优化建议'), muted('暂无智能诊断条目')]);
  }
  const cards = [];
  for (const it of items) {
    const sug = (Array.isArray(it.suggestions) ? it.suggestions : [])
      .map((t) => plain(t))
      .filter(Boolean);
    const stack = [
      { text: plain(it.title || '诊断'), fontSize: 11, bold: true, color: '#409eff' },
    ];
    if (it.diagnosis) {
      stack.push({ text: plain(it.diagnosis), fontSize: 10, color: '#606266', margin: [0, 4, 0, 4] });
    }
    if (sug.length) {
      stack.push({ ul: sug, fontSize: 10, margin: [0, 2, 0, 0] });
    }
    cards.push({
      unbreakable: true,
      table: {
        widths: ['*'],
        body: [[{ stack, margin: [8, 8, 8, 8] }]],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#ebeef5',
        vLineColor: () => '#ebeef5',
        fillColor: () => '#fcfcfd',
      },
      margin: [0, 0, 0, 10],
    });
  }
  return sectionModule([sectionTitle('智能诊断与优化建议'), ...cards]);
}

/**
 * @param {object} data — GET /api/geo-health-report 的 JSON 体
 * @param {object} [templateOpts]
 * @param {{ start: number, end: number } | null} [templateOpts.competitorDataZoom]
 * @returns {Promise<Buffer>}
 */
export function buildHealthReportPdfDocDefinition(data, templateOpts = {}) {
  const rawComp = Array.isArray(data.competitorMentions) ? data.competitorMentions : [];
  const dz = templateOpts.competitorDataZoom;
  let compRows = rawComp;
  let compNote = '';
  if (dz && rawComp.length > 10) {
    const sliced = sliceCompetitorMentionsByDataZoom(rawComp, dz.start, dz.end);
    if (sliced.length && sliced.length < rawComp.length) {
      compRows = sliced;
      compNote = `以下为当前页面帕累托图滑块可见区间内的竞品（轴位置约 ${pct(dz.start)}%～${pct(dz.end)}%）；「占比」仍为相对全部竞品提及的占比。`;
    }
  }

  const content = [
    buildReportHeader(data),
    buildKpiSection(data),
    buildModelSection(data.modelVisibilityCards),
    buildMatrixSection(data.intentPaths, data.platforms, data.matrixData || {}),
    buildMatrixContextSection(data.matrixContext),
    buildCompetitorSection(compRows, compNote),
    buildWordCloudSection(data.sentimentWordCloud),
    buildSourceSection(data.sourceData),
    buildDiagnosticSection(data.diagnosticSuggestions),
    {
      text: '由系统自动根据检测数据生成 · 版式为打印专用模板',
      alignment: 'center',
      fontSize: 9,
      color: '#909399',
      margin: [0, 8, 0, 0],
    },
  ].filter(Boolean);

  return {
    pageSize: 'A4',
    pageMargins: [28, 36, 28, 40],
    defaultStyle: {
      font: FONT_KEY,
      fontSize: 10,
      color: '#303133',
      lineHeight: 1.35,
    },
    content,
    footer: (currentPage, pageCount) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: '#c0c4cc',
      margin: [0, 8, 0, 0],
    }),
  };
}

export async function buildHealthReportPdfBuffer(data, templateOpts = {}) {
  await ensureFontsReady();
  const docDef = buildHealthReportPdfDocDefinition(data, templateOpts);
  const printer = getPrinter();
  const pdfDoc = printer.createPdfKitDocument(docDef);

  return new Promise((resolve, reject) => {
    const chunks = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}
