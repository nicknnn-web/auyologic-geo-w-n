/**
 * 与前端 ECharts 品类轴 dataZoom 的 start/end（0～100）对齐，截取 competitorMentions 子序列。
 * 竞品数 ≤10 时前端无滑块，此处直接返回原数组。
 */
export function sliceCompetitorMentionsByDataZoom(mentions, start, end) {
  if (!Array.isArray(mentions) || mentions.length <= 10) return mentions;
  const n = mentions.length;
  const s = Math.max(0, Math.min(100, Number(start) || 0));
  const e = Math.max(0, Math.min(100, Number(end) || 100));
  if (e - s >= 99.9) return mentions;
  const i0 = Math.max(0, Math.min(n - 1, Math.floor((n * s) / 100)));
  const i1 = Math.max(0, Math.min(n - 1, Math.ceil((n * e) / 100) - 1));
  if (i0 > i1) return mentions;
  return mentions.slice(i0, i1 + 1);
}
