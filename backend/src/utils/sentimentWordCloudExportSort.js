/**
 * 词云 PDF/HTML 导出排序：正面优势 → 中性描述 → 负面警示；同档内按命中次数降序。
 */

const POLARITY_ORDER = { positive: 0, neutral: 1, negative: 2 };

export function normalizeWordCloudPolarity(polarity) {
  const s = String(polarity ?? '').trim().toLowerCase();
  if (s === 'positive') return 'positive';
  if (s === 'negative') return 'negative';
  return 'neutral';
}

export function polaritySortRank(polarity) {
  return POLARITY_ORDER[normalizeWordCloudPolarity(polarity)] ?? 1;
}

/**
 * @param {Array<{ text?: string, count?: number, polarity?: string }>} list
 * @returns {typeof list}
 */
export function sortSentimentWordCloudForExport(list) {
  if (!Array.isArray(list) || !list.length) return [];
  return [...list]
    .filter((w) => String(w?.text ?? '').trim())
    .sort((a, b) => {
      const pa = polaritySortRank(a.polarity);
      const pb = polaritySortRank(b.polarity);
      if (pa !== pb) return pa - pb;
      const ca = Number(a.count) || 0;
      const cb = Number(b.count) || 0;
      if (cb !== ca) return cb - ca;
      return String(a.text).localeCompare(String(b.text), 'zh');
    });
}
