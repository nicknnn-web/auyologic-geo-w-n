/**
 * 品牌体检（GEO）— 与 AI 语境/健康分相关的纯函数工具。
 * 线上 `healthScore` 与后端 `backend/src/utils/aiHealthScore.js` 须保持同步。
 */

/**
 * AI 健康分 = 可见度×40% + 首行心智拦截率×60% - 负面×可见度 - 负面×(品牌提及率/行业基准线)
 * 与线上一致：每模型调用时 `modelVisibilityScores` 仅含该模型可见度（单元素数组）；
 * 拦截/负面/品牌/行业为任务级 KPI，与报告「核心指标」一致。
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
  const raw = v * 0.4 + ir * 0.6 - n * v - n * r;
  return Math.min(100, Math.max(0, Math.round(raw || 0)));
}

/**
 * 由与 AI 健康分同源的指标（每模型或任务级）得到 getBrandStatus 所需 exposure、penalty。
 * exposure = 0.4×(可见度/100) + 0.6×(首行心智拦截率/100)
 * penalty = 负面事实关联度（0–1，与报告一致）
 * @param {{ visibilityScore: number, interceptRate: number, negativeRatio: number }} p
 * @returns {{ exposure: number, penalty: number }}
 */
export function exposurePenaltyFromKpi(p = {}) {
  const vis = Math.min(1, Math.max(0, Number(p.visibilityScore) / 100 || 0));
  const ir = Math.min(1, Math.max(0, Number(p.interceptRate) / 100 || 0));
  const n = Math.min(1, Math.max(0, Number(p.negativeRatio)));
  return { exposure: 0.4 * vis + 0.6 * ir, penalty: n };
}

/**
 * 根据曝光实力和负面反噬，判断品牌 AI 语境状态。
 * 典型用法：将 0-1 的「曝光/心智」与「负面」标量分别映射为 `exposure`、`penalty` 后调用。
 *
 * @param {number} exposure - 曝光实力 [0-1]
 * @param {number} penalty - 负面反噬 [0-1]
 * @returns {{ code: number, name: string, desc: string } | { code: -1, name: string, desc: string }}
 */
export function getBrandStatus(exposure, penalty) {
  if (typeof exposure !== 'number' || typeof penalty !== 'number' ||
      exposure < 0 || exposure > 1 || penalty < 0 || penalty > 1) {
    return { code: -1, name: '参数错误', desc: 'exposure 和 penalty 需为 0-1 之间的数值' };
  }

  let code;
  let name;
  let desc;

  if (exposure > 0.8) {
    if (penalty < 0.2) {
      code = 1;
      name = '心智霸榜';
      desc = '拥有极高的曝光率，品牌心智正面权威';
    } else if (penalty >= 0.2 && penalty <= 0.4) {
      code = 3;
      name = '流量反噬';
      desc = '高频曝光但充斥着负面信息，反而放大了品牌危机';
    } else {
      code = 4;
      name = '负面警报';
      desc = '极高的曝光量正在放大负面声量，品牌口碑处于高风险期';
    }
  } else if (exposure >= 0.6 && exposure <= 0.8) {
    if (penalty < 0.2) {
      code = 5;
      name = '稳健曝光';
      desc = '维持良好的行业曝光，品牌声誉健康';
    } else if (penalty >= 0.2 && penalty <= 0.4) {
      code = 6;
      name = '动态平衡';
      desc = '整体曝光处于中上游，正反面信息处于拉锯战';
    } else {
      code = 7;
      name = '负面侵蚀 / 局部崩塌';
      desc = '在较高的展现频次中，负面比例已达危险警戒线；展现内容多为负面黑料，品牌形象在AI语境下已严重受损';
    }
  } else if (exposure >= 0.3 && exposure < 0.6) {
    if (penalty < 0.2) {
      code = 9;
      name = '黄金拓客';
      desc = '曝光度不足，品牌认知干净';
    } else if (penalty >= 0.2 && penalty <= 0.4) {
      code = 10;
      name = '声量受阻';
      desc = '曝光较低，内容中还混杂着热值偏差';
    } else {
      code = 11;
      name = '认知受阻 / 艰难重塑';
      desc = '品牌存在感较低，展现内容大部分是负面信息或劣势对比；品牌曝光较低且基本上都是负面资产';
    }
  } else {
    if (penalty < 0.2) {
      code = 13;
      name = 'AI盲区';
      desc = '大模型对品牌基本上毫无认知，完全没有被录入知识库';
    } else if (penalty >= 0.2 && penalty <= 0.4) {
      code = 14;
      name = '认知断层';
      desc = '多数场景下处于隐身状态，偶尔被触发认知模糊的内容';
    } else {
      code = 15;
      name = '深度泥潭 / 死水危机';
      desc = '常规通用搜索下毫无曝光，相关负面则会被AI精准命中；无自然正向曝光且关联负面历史，疑似被大模型降权或屏蔽';
    }
  }

  return { code, name, desc };
}

/**
 * 结合本模型可见度与任务级 KPI，返回与 AI 健康分一致的语境状态（name / desc 等）
 */
export function getBrandStatusForModelCard({ visibilityScore, interceptRate, negativeRatio }) {
  const { exposure, penalty } = exposurePenaltyFromKpi({ visibilityScore, interceptRate, negativeRatio });
  return getBrandStatus(exposure, penalty);
}
