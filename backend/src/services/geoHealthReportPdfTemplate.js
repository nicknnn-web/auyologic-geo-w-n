/**
 * 品牌体检报告：纯 HTML 模板（供 Playwright 打印为 PDF），数据结构与 GET /api/geo-health-report 一致。
 */

import { sliceCompetitorMentionsByDataZoom } from '../utils/competitorParetoDataZoomSlice.js';
import { sortSentimentWordCloudForExport } from '../utils/sentimentWordCloudExportSort.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 简单 **粗体** + 换行（内容已转义后慎用；此处先 escape 再匹配不含 < 的片段） */
function formatRichText(s) {
  const raw = String(s ?? '');
  const escaped = escapeHtml(raw);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

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

function cellTheme(state) {
  return CELL_THEME[String(state || '')] || CELL_THEME.no_data;
}

function formatTime(v) {
  if (v == null || v === '') return '—';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return escapeHtml(String(v));
    return escapeHtml(
      d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  } catch {
    return escapeHtml(String(v));
  }
}

function pct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  return String(Math.round(x * 10) / 10);
}

function buildKpiGrid(data) {
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
      sub: escapeHtml(data.negativeRiskLevel || '—'),
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
  return items
    .map(
      (it) => `
    <div class="kpi-card">
      <div class="kpi-label">${escapeHtml(it.label)}</div>
      <div class="kpi-val">${escapeHtml(it.val)}</div>
      <div class="kpi-sub">${it.sub}</div>
    </div>`
    )
    .join('');
}

function buildModelTable(cards) {
  if (!Array.isArray(cards) || !cards.length) {
    return '<p class="muted">暂无模型可见度数据</p>';
  }
  const rows = cards
    .map(
      (c) => `
    <tr>
      <td>${escapeHtml(c.name || c.platformKey)}</td>
      <td class="num">${pct(c.score)}%</td>
      <td class="num">${pct(c.healthScore)}</td>
      <td>${escapeHtml(c.statusText || '')}</td>
    </tr>`
    )
    .join('');
  return `
  <table class="data-table">
    <thead>
      <tr><th>模型</th><th>可见度</th><th>AI 健康分</th><th>评估</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildMatrixTable(intentPaths, platforms, matrixData) {
  if (!Array.isArray(intentPaths) || !intentPaths.length) {
    return '<p class="muted">暂无语境矩阵</p>';
  }
  if (!Array.isArray(platforms) || !platforms.length) {
    return '<p class="muted">暂无模型列</p>';
  }
  const th = platforms
    .map((p) => `<th class="th-model">${escapeHtml(p.name || p.key)}</th>`)
    .join('');
  const body = intentPaths
    .map((path) => {
      const label = path.label || path.type || path.key;
      const tds = platforms
        .map((plat) => {
          const cell = matrixData?.[path.key]?.[plat.key] || {
            state: 'no_data',
            label: '—',
          };
          const t = cellTheme(cell.state);
          return `<td class="cell" style="background:${t.bg};color:${t.fg}">${escapeHtml(cell.label || '—')}</td>`;
        })
        .join('');
      return `<tr><th class="th-path">${escapeHtml(label)}</th>${tds}</tr>`;
    })
    .join('');
  return `
  <div class="matrix-wrap">
    <table class="matrix-table">
      <thead><tr><th class="th-corner">场景 / 模型</th>${th}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function buildCompetitorTable(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return '<p class="muted">暂无竞品提及数据</p>';
  }
  const body = rows
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td class="num">${r.count ?? 0}</td>
      <td class="num">${r.pct ?? 0}%</td>
    </tr>`
    )
    .join('');
  return `
  <table class="data-table">
    <thead><tr><th>竞品</th><th>提及次数</th><th>占比</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function wordPolarityColor(p) {
  if (p === 'positive') return { bg: '#ecfdf5', fg: '#047857' };
  if (p === 'negative') return { bg: '#fef2f2', fg: '#b91c1c' };
  return { bg: '#f3f4f6', fg: '#4b5563' };
}

function buildWordCloudTags(list) {
  if (!Array.isArray(list) || !list.length) {
    return '<p class="muted">暂无词云词条</p>';
  }
  const sorted = sortSentimentWordCloudForExport(list);
  return `<div class="word-tags">${sorted
    .map((w) => {
      const { bg, fg } = wordPolarityColor(w.polarity);
      return `<span class="word-tag" style="background:${bg};color:${fg}">${escapeHtml(w.text)} <small>${w.count ?? ''}</small></span>`;
    })
    .join('')}</div>`;
}

function buildSourceTable(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return '<p class="muted">暂无信源分类</p>';
  }
  const body = rows
    .map(
      (r) => `
    <tr>
      <td><span class="src-dot" style="background:${escapeHtml(r.color || '#ccc')}"></span>${escapeHtml(r.type)}</td>
      <td class="num">${r.count ?? 0}</td>
      <td class="num">${r.pct ?? 0}%</td>
    </tr>`
    )
    .join('');
  return `
  <table class="data-table">
    <thead><tr><th>信源类型</th><th>篇数</th><th>占比</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function buildDiagnosticSection(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<p class="muted">暂无智能诊断条目</p>';
  }
  return items
    .map((it) => {
      const sug = (Array.isArray(it.suggestions) ? it.suggestions : [])
        .map((t) => String(t ?? '').trim())
        .filter(Boolean);
      const sugHtml = sug.length
        ? `<ul class="sug-list">${sug.map((t) => `<li>${formatRichText(t)}</li>`).join('')}</ul>`
        : '';
      const diag = it.diagnosis ? `<p class="diag-body">${formatRichText(it.diagnosis)}</p>` : '';
      return `
      <section class="diag-block">
        <h3>${escapeHtml(it.title || '诊断')}</h3>
        ${diag}
        ${sugHtml}
      </section>`;
    })
    .join('');
}

function buildMatrixContextBlock(mc) {
  if (!mc || typeof mc !== 'object') return '';
  const lines = [
    mc.name && `<p><strong>档位</strong>：${escapeHtml(mc.name)}（${escapeHtml(mc.level || '')}）</p>`,
    mc.summary && `<p>${formatRichText(mc.summary)}</p>`,
    mc.diagnosisLine && `<p>${formatRichText(mc.diagnosisLine)}</p>`,
  ].filter(Boolean);
  if (!lines.length) return '';
  const sug = Array.isArray(mc.suggestions) && mc.suggestions.length
    ? `<ul>${mc.suggestions.map((s) => `<li>${formatRichText(s)}</li>`).join('')}</ul>`
    : '';
  return `
  <section class="section">
    <h2>综合语境矩阵摘要</h2>
    <div class="matrix-context">${lines.join('')}${sug}</div>
  </section>`;
}

/**
 * @param {object} data — GET /api/geo-health-report 的 JSON 体
 * @param {object} [templateOpts]
 * @param {{ start: number, end: number } | null} [templateOpts.competitorDataZoom] — 与页面帕累托滑块一致
 */
export function buildHealthReportPdfHtml(data, templateOpts = {}) {
  const brand = escapeHtml(data.brandName || '品牌');
  const domain = data.brandDomain ? escapeHtml(data.brandDomain) : '';
  const check = formatTime(data.checkTime);
  const health = pct(data.healthScore ?? 0);

  const kpiHtml = buildKpiGrid(data);
  const modelsHtml = buildModelTable(data.modelVisibilityCards);
  const matrixHtml = buildMatrixTable(data.intentPaths, data.platforms, data.matrixData || {});

  const rawComp = Array.isArray(data.competitorMentions) ? data.competitorMentions : [];
  const dz = templateOpts.competitorDataZoom;
  let compRows = rawComp;
  let compSectionNote = '';
  if (dz && rawComp.length > 10) {
    const sliced = sliceCompetitorMentionsByDataZoom(rawComp, dz.start, dz.end);
    if (sliced.length && sliced.length < rawComp.length) {
      compRows = sliced;
      compSectionNote = `<p class="muted">以下为当前页面帕累托图滑块可见区间内的竞品（轴位置约 ${pct(dz.start)}%～${pct(dz.end)}%）；「占比」仍为相对<strong>全部</strong>竞品提及的占比。</p>`;
    }
  }
  const compHtml = (compSectionNote ? compSectionNote : '') + buildCompetitorTable(compRows);
  const wcHtml = buildWordCloudTags(data.sentimentWordCloud);
  const srcHtml = buildSourceTable(data.sourceData);
  const diagHtml = buildDiagnosticSection(data.diagnosticSuggestions);
  const mcHtml = buildMatrixContextBlock(data.matrixContext);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>品牌 AI 健康体检报告 — ${brand}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 28px 40px;
      font-family: 'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif;
      font-size: 13px;
      line-height: 1.55;
      color: #303133;
      background: #f5f6fa;
    }
    .sheet {
      max-width: 1000px;
      margin: 0 auto;
      background: #fff;
      border-radius: 12px;
      padding: 28px 32px 36px;
      box-shadow: 0 1px 3px rgba(0,0,0,.06);
    }
    h1 { font-size: 22px; margin: 0 0 8px; letter-spacing: .02em; }
    .sub { color: #606266; font-size: 12px; margin-bottom: 20px; }
    .health-pill {
      display: inline-block;
      margin-top: 4px;
      padding: 6px 14px;
      border-radius: 999px;
      background: linear-gradient(135deg,#ecf5ff,#e8f4ff);
      color: #409eff;
      font-weight: 700;
      font-size: 14px;
    }
    h2 {
      font-size: 15px;
      margin: 28px 0 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #ebeef5;
      color: #303133;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 8px;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { box-shadow: none; border-radius: 0; max-width: none; }
      .section, .diag-block, .kpi-card { break-inside: avoid; }
      .matrix-wrap { break-inside: auto; }
    }
    .kpi-card {
      border: 1px solid #ebeef5;
      border-radius: 10px;
      padding: 10px 12px;
      background: #fafbfc;
    }
    .kpi-label { font-size: 12px; color: #909399; }
    .kpi-val { font-size: 18px; font-weight: 700; color: #303133; margin: 4px 0; }
    .kpi-sub { font-size: 11px; color: #909399; line-height: 1.4; }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 6px;
    }
    .data-table th, .data-table td {
      border: 1px solid #ebeef5;
      padding: 8px 10px;
      text-align: left;
    }
    .data-table th { background: #f5f7fa; font-weight: 600; color: #606266; }
    .data-table .num { text-align: right; font-variant-numeric: tabular-nums; }
    .matrix-wrap { overflow-x: auto; margin-top: 6px; }
    .matrix-table {
      border-collapse: collapse;
      font-size: 10px;
      min-width: 100%;
    }
    .matrix-table th, .matrix-table td {
      border: 1px solid #e4e7ed;
      padding: 5px 6px;
      text-align: center;
      vertical-align: middle;
    }
    .th-corner, .th-path { background: #f0f2f5; font-weight: 600; text-align: left; }
    .th-path { white-space: nowrap; max-width: 140px; }
    .th-model { max-width: 72px; line-height: 1.25; word-break: break-all; }
    .matrix-table .cell { font-weight: 600; }
    .word-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .word-tag {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      border: 1px solid rgba(0,0,0,.04);
    }
    .word-tag small { opacity: .75; font-weight: 600; margin-left: 4px; }
    .muted { color: #909399; font-size: 12px; }
    .diag-block {
      border: 1px solid #ebeef5;
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 12px;
      background: #fcfcfd;
    }
    .diag-block h3 { margin: 0 0 8px; font-size: 14px; color: #409eff; }
    .diag-body { margin: 0 0 10px; color: #606266; font-size: 12px; }
    .sug-list { margin: 0; padding-left: 18px; color: #303133; }
    .sug-list li { margin: 4px 0; }
    .matrix-context { font-size: 12px; color: #606266; }
    .matrix-context p { margin: 6px 0; }
    .matrix-context ul { margin: 8px 0 0; padding-left: 18px; }
    .src-dot {
      display: inline-block;
      width: 8px; height: 8px; border-radius: 50%;
      margin-right: 6px; vertical-align: middle;
    }
    footer {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px dashed #dcdfe6;
      font-size: 11px;
      color: #909399;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>品牌 AI 健康体检报告</h1>
    <div class="sub">
      品牌：<strong>${brand}</strong>
      ${domain ? ` · 站点：${domain}` : ''}
      · 体检时间：${check}
    </div>
    <div class="health-pill">首模型 AI 健康分 ${health}</div>

    <section class="section">
      <h2>核心指标</h2>
      <div class="kpi-grid">${kpiHtml}</div>
    </section>

    <section class="section">
      <h2>大模型可见度</h2>
      ${modelsHtml}
    </section>

    <section class="section">
      <h2>综合语境矩阵</h2>
      ${matrixHtml}
    </section>

    ${mcHtml}

    <section class="section">
      <h2>竞品提及</h2>
      ${compHtml}
    </section>

    <section class="section">
      <h2>情感词云（词条）</h2>
      ${wcHtml}
    </section>

    <section class="section">
      <h2>信源分类</h2>
      ${srcHtml}
    </section>

    <section class="section">
      <h2>智能诊断与优化建议</h2>
      ${diagHtml}
    </section>

    <footer>由系统自动根据检测数据生成 · 版式为打印专用模板</footer>
  </div>
</body>
</html>`;
}
