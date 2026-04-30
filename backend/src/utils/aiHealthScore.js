/**
 * 品牌体检「AI 健康分」
 *
 * AI健康分 = 可见度×40% + 首行心智拦截率×60%
 *   - 负面事实关联度×可见度
 *   - 负面事实关联度×(品牌提及率/行业基准线)
 *
 * 可见度：传入的 modelVisibilityScores 的算术平均；单模型时仅传一个得分即该模型可见度（0–100）
 * 首行心智拦截率、品牌提及率、行业基准线：与 geo_health_report 一致（0–100）
 * 负面事实关联度：0–1
 * 行业基准线为 0 时，(品牌/行业) 按 0 计，避免除零。
 */

function clamp100(n) {
  return Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
}

/**
 * @param {Object} params
 * @param {number[]} params.modelVisibilityScores 各模型可见度 0–100
 * @param {number} [params.interceptRate=0] 首行心智拦截率 0–100
 * @param {number} [params.negativeRatio=0] 负面事实关联度 0–1
 * @param {number} [params.brandMentionRate=0] 品牌提及率 0–100
 * @param {number} [params.industryMentionRate=0] 行业基准线 0–100
 * @returns {number} 0–100
 */
export function computeAiHealthScore({
  modelVisibilityScores = [],
  interceptRate = 0,
  negativeRatio = 0,
  brandMentionRate = 0,
  industryMentionRate = 0,
} = {}) {
  const scores = (modelVisibilityScores || []).filter(
    (s) => typeof s === 'number' && !Number.isNaN(s)
  );
  const vis = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;
  const v = Math.min(100, Math.max(0, vis));
  const ir = Math.min(100, Math.max(0, interceptRate));
  const n = Math.min(1, Math.max(0, negativeRatio));
  const mentionToIndustry = industryMentionRate > 0
    ? brandMentionRate / industryMentionRate
    : 0;
  const r = Math.max(0, mentionToIndustry);
  const raw = v * 0.4 + ir * 0.6 - n * v - ((n * r)*100);
  return clamp100(raw);
}
