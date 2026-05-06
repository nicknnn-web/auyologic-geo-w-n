/**
 * 品牌体检 — AI 语境状态矩阵（16 档）。与 backend/src/utils/contextMatrix.js 保持同步。
 */

import { exposurePenaltyFromKpi } from './brandHealth.js';

const EPS = 1e-6;

function clamp01(x) {
  return Math.min(1, Math.max(0, Number(x) || 0));
}

export function exposureBandFromExposure(e) {
  const x = clamp01(e);
  if (x > 0.8) return 1;
  if (x >= 0.6) return 2;
  if (x >= 0.3) return 3;
  return 4;
}

export const MATRIX_CONTEXT_LEVELS = [
  null,
  {
    level: 1,
    name: '心智霸榜',
    summary: '拥有极高的曝光率，品牌心智正面权威。',
    diagnosis: '持续护城河加固。',
    suggestions: [
      '维持现有高优语料的更新频次，稳固核心词与对比词的绝对优势。',
      '开始将防线向“场景词”和“长尾需求”拓展，构建全域包裹式的内容矩阵，形成对竞品的降维打击。'
    ],
  },
  {
    level: 2,
    name: '优势微瑕',
    summary: '绝大多数为正面曝光，夹杂少许认知偏差。',
    diagnosis: '高优信源定点覆盖。',
    suggestions: [
      '持续监控，精准排查触发负面/认知偏差的具体问答路径和场景词。',
      '可利用官网、官方公众号等“极高权重官方信源”发布结构化澄清或优势升级声明，利用大模型“最新权威事实优先”机制对微小认知偏差进行强制覆盖。'
    ],
  },
  {
    level: 3,
    name: '流量反噬',
    summary: '高频曝光但充斥着负面信息，反而放大了品牌危机。',
    diagnosis: '危机阻断声量压制。',
    suggestions: [
      '紧急暂停宽泛场景词的粗放式语料投喂，防止负面曝光借助 AI 进一步扩散。',
      '需高频释出具备极高信息密度的高维权威语料，强行干预 AI 底层实体评价矩阵的提取权重。'
    ],
  },
  {
    level: 4,
    name: '负面警报',
    summary: '极高的曝光量正在放大负面声量，品牌口碑处于高风险期。',
    diagnosis: '通过正向对冲修复声誉。',
    suggestions: [
      '联合高权重第三方媒体进行高强度正面事实注入，重构品牌形象。',
      '结合 AI 频繁复读的负面维度（如特定产品线、售后），定向生成结构化的“痛点解决方案”“问题辟谣”进行全域占位。'
    ],
  },
  {
    level: 5,
    name: '稳健曝光',
    summary: '维持良好的行业曝光，品牌声誉健康。',
    diagnosis: '优质价值意图抢断。',
    suggestions: [
      '持续分析当前未能稳定首位的问题。',
      '结合提问场景提取的核心卖点，在高收录平台铺设高浓度干货问答，提升 AI 抓取高优意图时的首位推荐率。'
    ],
  },
  {
    level: 6,
    name: '动态平衡',
    summary: '整体曝光处于中上游，正负面信息处于拉锯战。',
    diagnosis: '打破僵局多维视角突围。',
    suggestions: [
      '正负面拉锯说明 AI 对品牌的评价模型尚未固化。',
      '可以加大行业专家背书相关内容的投放，利用多维度的第三方客观视角强化正向标签，稀释现有负面内容的影响力。'
    ],
  },
  {
    level: 7,
    name: '负面侵蚀',
    summary: '在较高的展现频次中，负面比例已达危险警戒线。',
    diagnosis: '精准拔刺负面切断。',
    suggestions: [
      '抓取并分析大模型高频引用的核心负面内容。',
      '构建包含「品牌 + 负面痛点 + 解决方案/技术升级/内容公关」的复合逻辑语料进行逆向投喂，阻断 AI 单一的负面语义关联，将负面联系至解决方案或舆情公关，避免流失率。'
    ],
  },
  {
    level: 8,
    name: '局部崩塌',
    summary: '展现内容多为负面黑料，品牌形象在 AI 语境下已严重受损。',
    diagnosis: '止血重塑重建信任。',
    suggestions: [
      '全网负面信息过多，立刻开展针对性的负面信息回收。',
      '大规模输出包含详实数据、对比横评、负面辟谣的高质量结构化语料，从底层重构大模型对品牌核心产品线或业务线的知识图谱。'
    ],
  },
  {
    level: 9,
    name: '黄金拓客',
    summary: '曝光度不足，品牌认知干净。',
    diagnosis: '高质基建等待发力。',
    suggestions: [
      '底层认知纯净，是铺量/拓客的黄金发力期。',
      '可直接围绕高转化的“场景词”和“对比词”，进行高信息密度的百科、行业问答、专业软文的矩阵化铺设，快速拉升全域可见度和品牌心智。'
    ],
  },
  {
    level: 10,
    name: '声量受阻',
    summary: '曝光较低，内容中还混杂着热值偏差。',
    diagnosis: '提纯认知冲破信息茧房。',
    suggestions: [
      '当前AI认知度偏低且带有杂音。需优化品牌自有阵地的结构化数据，确保大模型爬虫优先抓取官网的标准定义。',
      '后续逐步更替或覆盖互联网上陈旧的、引发歧义的品牌信息。'
    ],
  },
  {
    level: 11,
    name: '认知受阻',
    summary: '品牌存在感较低，展现内容大部分是负面信息或劣势对比。',
    diagnosis: '正面截流扭转劣势。',
    suggestions: [
      'AI 在有限认知中已对本品形成劣势偏见。',
      '可针对性产出“本品 VS 竞品”的深度客观横评，在专业测评中放大自家绝对优势环节，通过高权重问答平台定向投喂给 AI 引擎。'
    ],
  },
  {
    level: 12,
    name: '艰难重塑',
    summary: '品牌曝光较低，且基本上都是负面资产。',
    diagnosis: '断臂求生，重写核心叙事。',
    suggestions: [
      '目前品牌词已成负资产。短期内避开全量词正面对抗。',
      '转向品牌“新核心功能/新产品线”等细分功能词进行单点突破，用全新的业务概念重新为 AI 建立一张干净的数字名片。'
    ],
  },
  {
    level: 13,
    name: 'AI 盲区',
    summary: '大模型对品牌基本上毫无认知，完全没有被录入知识库。',
    diagnosis: '完善基础AI建设。',
    suggestions: [
      '品牌目前处于AI盲区，尽快完成品牌核心基础语料（百度百科、官网结构化标签、官方权威新闻稿）的从0到1建设。',
      '这是进入生成式引擎的第一步，确保大模型更新知识库时，能准确无误抓取并构建品牌的初步实体认知。'
    ],
  },
  {
    level: 14,
    name: '认知断层',
    summary: '多数场景下处于隐身状态，偶尔被触发认知模糊的内容。',
    diagnosis: '高优场景单点关联。',
    suggestions: [
      '目前品牌在大模型中曝光较低，切忌盲目全域铺量。',
      '先锚定 1-2 个最核心的业务痛点场景词，集中资源投入高质干货语料，将品牌与该单一痛点深度绑定，力求在细分搜索路径上实现首位提及的零突破。'
    ],
  },
  {
    level: 15,
    name: '深度泥潭',
    summary: '常规通用搜索下毫无曝光，相关负面则会被AI精准命中。',
    diagnosis: '稀释靶点高维覆盖。',
    suggestions: [
      '目前需立刻产出大量包含品牌词的正向行业常识、科普长文本。在全网多渠道进行分发，通过巨大的基数稀释特定负面词组被大模型触发的概率。'
    ],
  },
  {
    level: 16,
    name: '死水危机',
    summary: '无自然正向曝光且关联负面历史，疑似被大模型降权或屏蔽。',
    diagnosis: '破壁重建，最高权重洗盘。',
    suggestions: [
      '大模型大概率因严重历史问题已将实体判定为“低质/不推荐”。',
      '常规软文已作效甚微。须即刻更新官方媒体举证，并借助国家级媒体、行业顶级峰会等具有“绝对权威”权重的信源进行深度业务报道，强行修正底层评价模型。'
    ],
  },
];

const LEVEL_CENTERS = [
  null,
  { level: 1, ex: 0.9, pe: 0 },
  { level: 2, ex: 0.9, pe: 0.1 },
  { level: 3, ex: 0.9, pe: 0.3 },
  { level: 4, ex: 0.9, pe: 0.65 },
  { level: 5, ex: 0.7, pe: 0 },
  { level: 6, ex: 0.7, pe: 0.1 },
  { level: 7, ex: 0.7, pe: 0.3 },
  { level: 8, ex: 0.7, pe: 0.35 },
  { level: 9, ex: 0.45, pe: 0 },
  { level: 10, ex: 0.45, pe: 0.1 },
  { level: 11, ex: 0.45, pe: 0.3 },
  { level: 12, ex: 0.45, pe: 0.65 },
  { level: 13, ex: 0.15, pe: 0 },
  { level: 14, ex: 0.15, pe: 0.1 },
  { level: 15, ex: 0.15, pe: 0.3 },
  { level: 16, ex: 0.15, pe: 0.65 },
];

function directLevelFromExposurePenalty(exposure, penalty) {
  const e = clamp01(exposure);
  const p = clamp01(penalty);
  const band = exposureBandFromExposure(e);

  if (band === 1) {
    if (p <= EPS) return 1;
    if (p < 0.2) return 2;
    if (p <= 0.4) return 3;
    return 4;
  }

  if (p <= EPS) return [5, 9, 13][band - 2];
  if (p < 0.2) return [6, 10, 14][band - 2];
  if (p <= 0.4) return [7, 11, 15][band - 2];
  return null;
}

function nearestLevelByCenters(exposure, penalty) {
  const ex = clamp01(exposure);
  const pe = clamp01(penalty);
  let best = 1;
  let bestD = Infinity;
  for (let i = 1; i <= 16; i++) {
    const c = LEVEL_CENTERS[i];
    const d = (ex - c.ex) ** 2 + (pe - c.pe) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function mapExposurePenaltyToMatrixLevel(exposure, penalty) {
  const direct = directLevelFromExposurePenalty(exposure, penalty);
  if (direct != null) {
    return {
      level: direct,
      meta: MATRIX_CONTEXT_LEVELS[direct],
      snapped: false,
    };
  }
  const level = nearestLevelByCenters(exposure, penalty);
  return {
    level,
    meta: MATRIX_CONTEXT_LEVELS[level],
    snapped: true,
  };
}

export function aggregateMatrixContextFromModels(p = {}) {
  const scores = Array.isArray(p.visibilityScores)
    ? p.visibilityScores.filter((x) => typeof x === 'number' && !Number.isNaN(x))
    : [];
  const n = scores.length;
  const ir = Number(p.interceptRate) || 0;
  const nr = Number(p.negativeRatio) || 0;

  if (n === 0) {
    return {
      level: null,
      meta: null,
      avgExposure: null,
      avgPenalty: null,
      modelCount: 0,
      snapped: false,
      perModel: [],
    };
  }

  let sumE = 0;
  let sumP = 0;
  const perModel = [];
  for (let i = 0; i < n; i++) {
    const { exposure, penalty } = exposurePenaltyFromKpi({
      visibilityScore: scores[i],
      interceptRate: ir,
      negativeRatio: nr,
    });
    sumE += exposure;
    sumP += penalty;
    perModel.push({
      visibilityScore: scores[i],
      exposure,
      penalty,
      matrix: mapExposurePenaltyToMatrixLevel(exposure, penalty),
    });
  }

  const avgExposure = sumE / n;
  const avgPenalty = sumP / n;
  const mapped = mapExposurePenaltyToMatrixLevel(avgExposure, avgPenalty);

  return {
    level: mapped.level,
    meta: mapped.meta,
    avgExposure,
    avgPenalty,
    modelCount: n,
    snapped: mapped.snapped,
    perModel,
  };
}

export function matrixContextPayload(agg) {
  if (!agg?.level || !agg.meta) return null;
  const m = agg.meta;
  return {
    level: agg.level,
    name: m.name,
    summary: m.summary,
    diagnosisLine: m.diagnosis,
    suggestions: Array.isArray(m.suggestions) ? [...m.suggestions] : [],
    avgExposure: agg.avgExposure,
    avgPenalty: agg.avgPenalty,
    modelCount: agg.modelCount,
    snapped: agg.snapped,
  };
}

export function buildMatrixContextDiagnosticItem(agg) {
  if (!agg?.level || !agg.meta) return null;
  const m = agg.meta;
  const snapHint = agg.snapped ? '（均值落在矩阵空档，已吸附至最近邻档位）' : '';
  return {
    id: 'matrix-context-aggregate',
    accent: 'blue',
    title: `综合 AI 语境矩阵 · ${m.name}${snapHint}`,
    diagnosis: `${m.summary} ${m.diagnosis}（本次 ${agg.modelCount} 个大模型的曝光/负面合成指标平均后落档；平均曝光指数 ${(agg.avgExposure ?? 0).toFixed(3)}，平均负面 ${(agg.avgPenalty ?? 0).toFixed(3)}）`,
    suggestions: Array.isArray(m.suggestions) ? [...m.suggestions] : [],
  };
}
