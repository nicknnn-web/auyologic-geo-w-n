/**
 * 品牌体检 — 博查检索结果四分类（仅归类，禁止编造 URL）
 */

import { SOURCE_CATEGORY } from '../services/sourceClassifier.js';

export const SOURCE_CLASSIFY_CATEGORY_ENUM = Object.values(SOURCE_CATEGORY).join('、');

export const SOURCE_CLASSIFY_SYSTEM_PROMPT = `你是一个严格按 JSON 输出的助手。
用户会提供一道体检问题及「博查联网检索」返回的候选网页列表（每条含序号 index 与 url）。
你的任务：为每条候选指定 source_category，不得新增、删除或修改任何 url。

category 只能为以下英文键之一：
- authority_media：权威/综合新闻媒体
- industry_vertical：行业与垂直媒体
- official_media：品牌官网与官方自媒体
- ugc_community：UGC 与社区（知乎、B站、小红书等）

只输出一个 JSON 对象，不要 markdown 围栏外的文字。`;

/**
 * @param {{ brandName: string, brandWebsite: string, questionText: string, hits: Array<{ index: number, title: string, url: string, platform?: string, publishTime?: string, summary?: string }> }} ctx
 */
export function buildSourceClassifyUserPrompt(ctx) {
  const lines = [
    `品牌名称：${ctx.brandName || '—'}`,
    `品牌官网：${ctx.brandWebsite || '—'}`,
    '',
    '体检问题：',
    ctx.questionText || '—',
    '',
    '【博查检索候选网页 — url 只能来自下列条目】',
  ];
  for (const h of ctx.hits || []) {
    lines.push(`[${h.index}] ${h.title}`);
    lines.push(`url: ${h.url}`);
    if (h.platform) lines.push(`站点: ${h.platform}`);
    if (h.publishTime) lines.push(`发布时间: ${h.publishTime}`);
    if (h.summary) lines.push(`摘要: ${h.summary.slice(0, 500)}`);
    lines.push('');
  }
  lines.push(
    '请为上述每条输出 category（英文键），url 必须与输入完全一致。',
    '',
    '输出格式：',
    '{',
    '  "items": [',
    `    { "index": 1, "url": "与输入相同的 url", "category": "${SOURCE_CATEGORY.AUTHORITY_MEDIA}" }`,
    '  ]',
    '}'
  );
  return lines.join('\n');
}
