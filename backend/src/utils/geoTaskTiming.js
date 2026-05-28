/**
 * 品牌体检后台各阶段耗时日志（秒，保留 1 位小数）
 */

export function startPhaseTimer() {
  return Date.now();
}

/**
 * @param {string} logTag 如 geo-probe / geo-bocha / geo-analysis / wordcloud
 * @param {number|string} taskId
 * @param {string} phaseLabel 如「探针」「博查」「分析」「词云」
 * @param {number} startedAt startPhaseTimer() 返回值
 * @param {Record<string, unknown>} [extra] 附加统计字段
 */
export function logPhaseDone(logTag, taskId, phaseLabel, startedAt, extra) {
  const sec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const tail =
    extra && Object.keys(extra).length
      ? ` ${Object.entries(extra)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ')}`
      : '';
  console.log(`[${logTag}] task=${taskId} ${phaseLabel}结束 用时 ${sec}s${tail}`);
}
