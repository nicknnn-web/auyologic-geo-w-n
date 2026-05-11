/**
 * GET /api/geo-health-report
 * GET /api/geo-health-report/sentiment-sources?taskId=&page=&pageSize=&q=
 * GET /api/geo-health-report/source-articles?taskId=&page=&pageSize=&q=
 * GET /api/geo-health-report/task-qa?taskId=
 *
 * 从 geo_health_analysis 聚合品牌体检报告所需全部指标；命中 geo_task_cache 且指纹未变时直接返回快照（极快）。
 * 若当前用户尚无分析数据，返回 success:true 但各指标为零（前端走"暂无数据"分支）。
 *
 * 竞品：主接口的 competitorMentions 仅含帕累托摘要；点击柱后由前端请求
 * `/geo-health-report/competitor` 拉取该竞品完整详情（含情感桶与源问题题干）。
 *
 * 响应字段与前端 GEOHealthReport.vue 的 loadHealthReport 完全对应：
 *   brandName / brandDomain / checkTime / healthScore（= modelVisibilityCards[0].healthScore，按大模型；非全模型平均）
 *   modelVisibilityCards[].healthScore 每模型独立
 *   openMentionTotal（开放式分析条数，题×模型）/ openQuestionCount（inferCategory=open 的题目数，与字典 data_value 一致）
 *   kpiDenominator / interceptRate / blindIndex / negativeRate / authorityScore
 *   modelVisibilityCards[]
 *   intentPaths[] / platforms[] / matrixData{}
 *   keywordTypeLabels{}（data_key → data_value，与 sys_dict.keyword_type 同步，供竞品详情等展示）
 *   competitorMentions[]
 *   sentimentWordCloud[]（本期任务 geo_health_word_cloud_item：任务完成时 AI 入库，可在情感词管理中编辑；text/count/polarity/weight/source）
 *   sourceData[]
 *   diagnosticSuggestions[]（仅综合语境矩阵，无模型数据时为空数组）
 *   matrixContext：综合语境矩阵（16 档）摘要
 *   rawData{}
 */

import { Router } from 'express';
import pool from '../db.js';
import { SOURCE_CATEGORY, SOURCE_CATEGORY_LABEL } from '../services/sourceClassifier.js';
import {
  buildSentimentSourceDetailRows,
  extractProbeAnswerText,
} from '../services/sentimentLexiconService.js';
import { inferCategory } from '../services/geoBrandAnalysisService.js';
import {
  loadWordCloudLexEntriesForTask,
  loadPersistedWordCloudPayload,
} from '../services/geoHealthWordCloudPersistService.js';
import {
  computeGeoTaskCacheFingerprints,
  getGeoTaskReportCache,
  upsertGeoTaskReportCache,
} from '../services/geoTaskCacheService.js';
import { computeAiHealthScore } from '../utils/aiHealthScore.js';
import {
  aggregateMatrixContextFromModels,
  matrixContextPayload,
  buildMatrixContextDiagnosticItem,
} from '../utils/contextMatrix.js';

/** 库中尚无 keyword_type 字典时的兜底行（与 index.js 种子一致） */
const FALLBACK_KEYWORD_TYPE_ROWS = [
  { data_key: '01', data_value: '品牌词', sort_order: 10 },
  { data_key: '02', data_value: '产品词', sort_order: 20 },
  { data_key: '03', data_value: '场景词', sort_order: 30 },
  { data_key: '04', data_value: '企业词', sort_order: 40 },
  { data_key: '05', data_value: '对比词', sort_order: 50 },
  { data_key: '06', data_value: '价格词', sort_order: 60 },
];

function buildIntentPathsFromDictRows(rows) {
  const src = rows && rows.length ? rows : FALLBACK_KEYWORD_TYPE_ROWS;
  const list = src.map((row) => {
    const key = String(row.data_key ?? '').trim();
    const dv = String(row.data_value ?? '').trim() || key;
    const so = Number(row.sort_order);
    return {
      key,
      label: dv,
      type: dv,
      category: inferCategory(key, dv),
      sortOrder: Number.isFinite(so) ? so : 0,
    };
  });
  return list.sort((a, b) => a.sortOrder - b.sortOrder || String(a.key).localeCompare(String(b.key)));
}

function keywordTypeLabelRecord(rows) {
  const src = rows && rows.length ? rows : FALLBACK_KEYWORD_TYPE_ROWS;
  const m = {};
  for (const row of src) {
    const k = String(row.data_key ?? '').trim();
    if (!k) continue;
    m[k] = String(row.data_value ?? '').trim() || k;
  }
  return m;
}

const router = Router();

/** geo_health_article.source_category → 报告用中文标签 */
function sourceCategoryLabelZh(cat) {
  const k = String(cat ?? '').trim();
  if (!k) return '未分类';
  return SOURCE_CATEGORY_LABEL[k] || k;
}

// ─────────────────────────────────────────────
// 已知模型的展示配置（model_name → 显示信息）
// 动态探针新增模型时，只要 model_name 出现在 geo_health_analysis 里就会自动展示
// ─────────────────────────────────────────────
const MODEL_DISPLAY_MAP = {
  'deepseek-chat':      { name: 'DeepSeek',     icon: 'D',  color: '#4F46E5' },
  'deepseek-reasoner':  { name: 'DeepSeek R1',  icon: 'R',  color: '#4F46E5' },
  'qwen-max':           { name: '通义千问',      icon: '通', color: '#8B5CF6' },
  'qwen-plus':          { name: '通义千问+',     icon: '通', color: '#8B5CF6' },
  'moonshot-v1-8k':     { name: 'Kimi',          icon: 'K',  color: '#06B6D4' },
  'moonshot-v1-32k':    { name: 'Kimi 32k',      icon: 'K',  color: '#06B6D4' },
  'glm-4':              { name: '智谱GLM',        icon: '智', color: '#10B981' },
  'glm-4-flash':        { name: 'GLM Flash',     icon: '智', color: '#10B981' },
  'gpt-4o-mini':        { name: 'GPT-4o mini',   icon: 'G',  color: '#22C55E' },
  'gpt-4o':             { name: 'GPT-4o',        icon: 'G',  color: '#22C55E' },
};

/** 探针写入的 model_name 与 ai_provider_connection.vendor_name 一致时可匹配 Logo/底色 */
function buildVendorLogoMap(rows) {
  const m = new Map();
  for (const row of rows) {
    const vn = String(row.vendor_name || '').trim();
    if (!vn) continue;
    const rel = String(row.logo_relpath || '').trim();
    const iconUrl = rel ? `/uploads/${rel.replace(/\\/g, '/')}` : null;
    const rawBg = row.logo_bg_color;
    const iconBgColor = rawBg != null && String(rawBg).trim() !== '' ? String(rawBg).trim() : null;
    m.set(vn, { iconUrl, iconBgColor });
  }
  return m;
}

function logoExtrasFor(logoMap, modelName) {
  return logoMap.get(String(modelName || '').trim()) || { iconUrl: null, iconBgColor: null };
}

// 矩阵单元格状态说明（对应前端样式与文案）
// - 绿色高亮：industry_first / precise_hit / brand_win
// - 蓝色安全：head_tier
// - 黄色提醒：weak_awareness / info_bias / tie
// - 灰色风险：mind_missing / mentioned_tail / competitor_win
// - 强制红：  negative_risk / hijack_risk
//
// 前端根据返回的 state 字段渲染对应配色与文案

function clamp100(n) {
  return Math.min(100, Math.max(0, Math.round(n || 0)));
}

// 判断信源是否属于"可信"（用于 authorityScore 分子）
const CREDIBLE_SOURCE_HINTS = ['官网', '媒体', '百科', '认证', '官方', '新闻', '期刊'];
function isCredibleSource(sourceType) {
  if (!sourceType || sourceType === '无') return false;
  return CREDIBLE_SOURCE_HINTS.some((h) => String(sourceType).includes(h));
}

// ─────────────────────────────────────────────
// 竞品：明细 SQL 与聚合（主报告只返回列表；点击柱再请求详情接口）
// ─────────────────────────────────────────────

const COMP_DETAIL_SELECT = `SELECT cc AS name,
              a.question_id,
              a.question_type,
              a.model_name,
              a.compare_status,
              a.has_negative,
              NULLIF(
                trim(
                  COALESCE(
                    NULLIF(trim(COALESCE(q.question, '')), ''),
                    NULLIF(trim(COALESCE(sq.question, '')), '')
                  )
                ),
                ''
              ) AS question_text`;

const COMP_DETAIL_FROM = `
       FROM geo_health_analysis a
       CROSS JOIN LATERAL jsonb_array_elements_text(a.competitors_mentioned) AS cc
       LEFT JOIN geo_health_question q
         ON q.id = a.question_id AND q.task_id = a.task_id
       LEFT JOIN questions sq
         ON sq.id = COALESCE(NULLIF(a.source_question_id, 0), q.source_question_id)
       WHERE a.task_id = $1 AND a.error_text IS NULL
         AND a.competitors_mentioned IS NOT NULL
         AND jsonb_array_length(a.competitors_mentioned) > 0`;

/** 拉取竞品展开明细行（可选仅某一竞品名） */
async function loadCompetitorDetailRows(pool, taskId, competitorName = null) {
  if (competitorName != null && String(competitorName).trim() !== '') {
    return pool.query(
      `${COMP_DETAIL_SELECT} ${COMP_DETAIL_FROM} AND trim(cc) = trim($2)`,
      [taskId, competitorName]
    );
  }
  return pool.query(`${COMP_DETAIL_SELECT} ${COMP_DETAIL_FROM}`, [taskId]);
}

/** 将明细行聚合成前端「竞品详情面板」单条对象 */
function buildCompetitorDetailPayload(name, count, pct, detailRows) {
  const pushQuestion = (bucket, r) => {
    const key = String(r.question_id ?? '');
    if (!key) return;
    if (!bucket._keys) bucket._keys = new Set();
    if (bucket._keys.has(key)) return;
    bucket._keys.add(key);
    const text = String(r.question_text ?? '').trim();
    bucket.list.push({ questionId: r.question_id, question: text });
  };

  const d = {
    questionTypes: new Set(),
    models: new Set(),
    win: 0,
    lose: 0,
    neutral: 0,
    negCount: 0,
    winQuestions: { list: [] },
    loseQuestions: { list: [] },
    neutralQuestions: { list: [] },
    negQuestions: { list: [] },
  };

  for (const r of detailRows) {
    if (r.question_type) d.questionTypes.add(r.question_type);
    if (r.model_name) d.models.add(r.model_name);
    if (r.compare_status === 'win') {
      d.win++;
      pushQuestion(d.winQuestions, r);
    } else if (r.compare_status === 'lose') {
      d.lose++;
      pushQuestion(d.loseQuestions, r);
    } else if (r.compare_status === 'neutral') {
      d.neutral++;
      pushQuestion(d.neutralQuestions, r);
    }
    if (r.has_negative) {
      d.negCount++;
      pushQuestion(d.negQuestions, r);
    }
  }

  return {
    name,
    count,
    pct,
    barTone: 'primary',
    questionTypes: [...d.questionTypes],
    models: [...d.models],
    win: d.win,
    lose: d.lose,
    neutral: d.neutral,
    negCount: d.negCount,
    winQuestions: d.winQuestions.list,
    loseQuestions: d.loseQuestions.list,
    neutralQuestions: d.neutralQuestions.list,
    negQuestions: d.negQuestions.list,
  };
}

// ─────────────────────────────────────────────
// 主路由
// ─────────────────────────────────────────────
router.get('/geo-health-report', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'default_user';

    // 企业信息
    const enterpriseRes = await pool.query(
      `SELECT company_name, website, industry, description, target_audience FROM users WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const enterprise = enterpriseRes.rows[0] || {};
    const brandName = String(enterprise.company_name || '品牌').trim();
    const brandDomain = String(enterprise.website || '').trim();
    const industry = String(enterprise.industry || '').trim();
    const brandDescription = String(enterprise.description || '').trim();
    const targetAudience = String(enterprise.target_audience || '').trim();
    /** 与 geo_health_task.keyword 比对用（创建任务时写入的企业名称）；空字符串与库内空 keyword 对齐 */
    const brandKey = brandName.slice(0, 500);

    // 取当前企业名称下「分析流水线最后写入时间」最晚的已完成任务；keyword 为空视为历史数据（迁移前）仍参与匹配
    const taskRes = await pool.query(
      `SELECT t.id AS task_id, finished.last_analysis_at AS check_time
       FROM geo_health_task t
       INNER JOIN (
         SELECT task_id, MAX(created_at) AS last_analysis_at
         FROM geo_health_analysis
         GROUP BY task_id
       ) finished ON finished.task_id = t.id
       WHERE t.user_id = $1 AND t.status = 'completed'
         AND (
           trim(coalesce(t.keyword, '')) = $2
           OR trim(coalesce(t.keyword, '')) = ''
         )
       ORDER BY finished.last_analysis_at DESC NULLS LAST, t.id DESC
       LIMIT 1`,
      [userId, brandKey]
    );

    // 如果没有任何分析数据，返回空白报告
    if (taskRes.rows.length === 0) {
      return res.json(emptyReport({ brandName, brandDomain }));
    }

    const taskId = taskRes.rows[0].task_id;
    const checkTime = taskRes.rows[0].check_time;

    const cacheFps = await computeGeoTaskCacheFingerprints(pool, taskId, userId);
    const cachedPayload = await getGeoTaskReportCache(pool, taskId, userId, cacheFps);
    if (cachedPayload) {
      return res.json(cachedPayload);
    }

    const kwDictRes = await pool.query(
      `SELECT data_key, data_value, sort_order
       FROM sys_dict
       WHERE dict_type = 'keyword_type' AND COALESCE(enabled, true) = true
       ORDER BY sort_order ASC NULLS LAST, data_key ASC`
    );
    const keywordTypeDictRows = kwDictRes.rows;
    const keywordTypeLabels = keywordTypeLabelRecord(keywordTypeDictRows);

    // ── 1. 各模型可见度得分 ──
    const mvRes = await pool.query(
      `SELECT model_name,
              COUNT(*)::int AS total,
              COALESCE(SUM(CASE WHEN visibility = 'visible' THEN 1 ELSE 0 END), 0)::int AS visible_count
       FROM geo_health_analysis
       WHERE task_id = $1 AND error_text IS NULL
       GROUP BY model_name
       ORDER BY visible_count DESC`,
      [taskId]
    );

    const modelNames = mvRes.rows.map((r) => r.model_name);

    const logoConnRes = await pool.query(
      `SELECT vendor_name, logo_relpath, logo_bg_color
       FROM ai_provider_connection
       WHERE user_id = $1`,
      [userId]
    );
    const vendorLogoMap = buildVendorLogoMap(logoConnRes.rows);

    const platforms = modelNames.map((mn) => {
      const cfg = MODEL_DISPLAY_MAP[mn] || {
        name: mn,
        icon: mn.charAt(0).toUpperCase(),
        color: '#909399',
      };
      const { iconUrl, iconBgColor } = logoExtrasFor(vendorLogoMap, mn);
      return { key: mn, ...cfg, simulated: false, iconUrl, iconBgColor };
    });

    // modelVisibilityCards 在 KPI（拦截/负面/品牌行业）算完后按「单模型」生成，见下方

    // ── 2. KPI ──

    // 2a. 首行心智拦截率（visibility=visible 占比，分母：仅开放式提问 category='open'，不足降级为全部）
    //   开放式提问 = 场景词 / 功能词 / 价格词（排除品牌词 brand 和对比词 compare）
    const kpiOpenRes = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COALESCE(AVG(CASE WHEN visibility = 'visible' THEN 100 ELSE 0 END), 0) AS intercept_rate
       FROM geo_health_analysis
       WHERE task_id = $1 AND error_text IS NULL AND category = 'open'`,
      [taskId]
    );
    const kpiAllRes = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(AVG(CASE WHEN visibility = 'visible' THEN 100 ELSE 0 END), 0) AS intercept_rate
       FROM geo_health_analysis
       WHERE task_id = $1 AND error_text IS NULL`,
      [taskId]
    );
    const kpiRow = (kpiOpenRes.rows[0].total > 0) ? kpiOpenRes.rows[0] : kpiAllRes.rows[0];
    const kpiDenominator = (kpiOpenRes.rows[0].total > 0) ? 'open_only' : 'all_fallback';
    const interceptRate = clamp100(kpiRow.intercept_rate);
    const totalChecks   = kpiAllRes.rows[0].total;

    // 2a-ext. 品牌提及率 vs 行业品牌提及率（仅开放式提问）
    //   指标A/B 分母 open_total：分析成功条数（题×模型）
    //   open_question_count：与 inferCategory(question_type, sys_dict.data_value) === 'open' 一致
    //   指标A：客户品牌行业提及率 = visibility='visible' 的开放式题数 / 开放式总题数
    //   指标B：行业品牌提及率（基准线）= (提到本品牌 OR 提到任意竞品) 的开放式题数 / 开放式总题数
    const mentionRateRes = await pool.query(
      `SELECT
         COUNT(*)::int AS open_total,
         COUNT(*) FILTER (WHERE visibility = 'visible')::int AS brand_mention_count,
         COUNT(*) FILTER (
           WHERE visibility = 'visible'
              OR (competitors_mentioned IS NOT NULL AND jsonb_array_length(competitors_mentioned) > 0)
         )::int AS industry_mention_count
       FROM geo_health_analysis
       WHERE task_id = $1 AND error_text IS NULL AND category = 'open'`,
      [taskId]
    );
    const openQListRes = await pool.query(
      `SELECT gq.id, gq.question_type, COALESCE(d.data_value, '') AS data_value
       FROM geo_health_question gq
       LEFT JOIN sys_dict d
         ON d.dict_type = 'keyword_type'
        AND d.data_key = gq.question_type
        AND COALESCE(d.enabled, true) = true
       WHERE gq.task_id = $1`,
      [taskId]
    );
    const openQuestionCount = openQListRes.rows.filter(
      (r) => inferCategory(r.question_type, r.data_value) === 'open'
    ).length;
    const openMentionTotal       = mentionRateRes.rows[0].open_total || 0;
    const brandMentionCount      = mentionRateRes.rows[0].brand_mention_count || 0;
    const industryMentionCount   = mentionRateRes.rows[0].industry_mention_count || 0;
    const brandMentionRate    = openMentionTotal > 0
      ? clamp100((brandMentionCount / openMentionTotal) * 100) : 0;
    const industryMentionRate = openMentionTotal > 0
      ? clamp100((industryMentionCount / openMentionTotal) * 100) : 0;

    // 2b. 大模型盲区指数
    //   定义：针对单一模型，若该模型在所有开放式提问（category='open'）回答中均未提及品牌，
    //         则判定为"盲区模型"。
    //   展示：盲区模型数 / 参与检测的总模型数（分数形式）
    const blindModelRes = await pool.query(
      `SELECT model_name,
              COUNT(*) FILTER (WHERE category = 'open')::int                                   AS open_total,
              COUNT(*) FILTER (WHERE category = 'open' AND visibility = 'not_visible')::int    AS open_blind
       FROM geo_health_analysis
       WHERE task_id = $1 AND error_text IS NULL
       GROUP BY model_name`,
      [taskId]
    );
    // 有 open 问题且全部不可见 → 盲区模型
    const blindModelCount = blindModelRes.rows.filter(
      (r) => r.open_total > 0 && r.open_blind >= r.open_total
    ).length;
    const totalModelCount = blindModelRes.rows.length;
    // 用于进度条的百分比（仅供前端 pct 字段）
    const blindIndex = totalModelCount > 0
      ? clamp100((blindModelCount / totalModelCount) * 100)
      : 0;

    // 2c. 负面事实关联度
    //   定义：出现品牌负面相关信息的答案数 / 实际提问总问题数（结果为 0~1 小数）
    //   风险阈值：0=健康 / (0,0.1)=亚健康 / [0.1,0.2)=低风险 / [0.2,0.3)=高风险 / ≥0.3=超高风险
    const negativeRes = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE has_negative = true)::int AS negative_count
       FROM geo_health_analysis
       WHERE task_id = $1 AND error_text IS NULL`,
      [taskId]
    );
    const negativeCount = negativeRes.rows[0].negative_count;
    const negativeTotal = negativeRes.rows[0].total;
    // 小数比率（保留 4 位），用于前端显示
    const negativeRatio = negativeTotal > 0
      ? Math.round((negativeCount / negativeTotal) * 10000) / 10000
      : 0;
    // 百分比（仅供进度条）
    const negativeRate = clamp100(negativeRatio * 100);
    // 风险等级文字
    const negativeRiskLevel = negativeRatio === 0
      ? '健康'
      : negativeRatio < 0.1
        ? '亚健康'
        : negativeRatio < 0.2
          ? '低风险'
          : negativeRatio < 0.3
            ? '高风险'
            : '超高风险';

    // 各模型可见度卡片 + 按大模型的 AI 健康分（与核心指标同一套任务级 KPI，仅「可见度」为当前模型得分）
    const modelVisibilityCards = mvRes.rows.map((r) => {
      const score = r.total > 0 ? clamp100((r.visible_count / r.total) * 100) : 0;
      const cfg = MODEL_DISPLAY_MAP[r.model_name] || {
        name: r.model_name, icon: r.model_name.charAt(0).toUpperCase(), color: '#909399',
      };
      const { iconUrl, iconBgColor } = logoExtrasFor(vendorLogoMap, r.model_name);
      const healthScore = computeAiHealthScore({
        modelVisibilityScores: [score],
        interceptRate,
        negativeRatio,
        brandMentionRate,
        industryMentionRate,
      });
      let status = 'high';
      let statusText = '高风险';
      if (healthScore >= 70) { status = 'good'; statusText = '表现良好'; }
      else if (healthScore >= 40) { status = 'mid'; statusText = '待加强'; }
      return {
        platformKey: r.model_name,
        name: cfg.name,
        icon: cfg.icon,
        brandColor: cfg.color,
        iconUrl,
        iconBgColor,
        simulated: false,
        score,
        healthScore,
        status,
        statusText,
        total: r.total,
        visibleCount: r.visible_count,
        bullets: buildModelBullets({ score, total: r.total, visibleCount: r.visible_count }),
      };
    });

    // authorityScore = 引用了可信信源的比例
    const srcR = await pool.query(
      `SELECT source_type, COUNT(*)::int AS c
       FROM geo_health_analysis
       WHERE task_id = $1 AND error_text IS NULL AND source_type IS NOT NULL AND source_type != '无'
       GROUP BY source_type`,
      [taskId]
    );
    const totalWithSrc = srcR.rows.reduce((s, r) => s + r.c, 0);
    const credibleCount = srcR.rows.filter((r) => isCredibleSource(r.source_type)).reduce((s, r) => s + r.c, 0);
    const authorityScore = totalChecks > 0
      ? clamp100((credibleCount / totalChecks) * 100)
      : 0;

    // ── 3. 矩阵（question_type × model）──
    //   行集来自 sys_dict.keyword_type（启用项），文案与排序与字典一致；单元格规则由 inferCategory 得到的 category 决定
    const matrixDetailRes = await pool.query(
      `SELECT question_type, model_name, category,
              position, brand_status, compare_status, has_negative
       FROM geo_health_analysis
       WHERE task_id = $1 AND error_text IS NULL
         AND question_type IS NOT NULL AND model_name IS NOT NULL`,
      [taskId]
    );

    // 按 (question_type, model_name) 分桶
    const buckets = new Map();
    for (const r of matrixDetailRes.rows) {
      const k = `${r.question_type}__${r.model_name}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(r);
    }

    // 构建 intentPaths（与字典同步；无字典行时用代码兜底）
    const intentPaths = buildIntentPathsFromDictRows(keywordTypeDictRows);

    // 生成矩阵
    const matrixData = {};
    for (const path of intentPaths) {
      matrixData[path.key] = {};
      for (const plat of platforms) {
        const bk = `${path.key}__${plat.key}`;
        const rows = buckets.get(bk) || [];
        let cellResult;
        if (path.category === 'brand')        cellResult = computeBrandCell(rows);
        else if (path.category === 'compare') cellResult = computeCompareCell(rows);
        else                                  cellResult = computeOpenCell(rows);
        matrixData[path.key][plat.key] = cellResult;
      }
    }

    // ── 4. 竞品拦截（展开 competitors_mentioned 数组）──
    const compRes = await pool.query(
      `SELECT cc AS name, COUNT(*)::int AS count
       FROM geo_health_analysis a
       CROSS JOIN LATERAL jsonb_array_elements_text(a.competitors_mentioned) AS cc
       WHERE a.task_id = $1 AND a.error_text IS NULL
         AND a.competitors_mentioned IS NOT NULL
         AND jsonb_array_length(a.competitors_mentioned) > 0
       GROUP BY cc
       ORDER BY count DESC
       LIMIT 100`,
      [taskId]
    );

    const competitorLoseCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM geo_health_analysis a
       WHERE a.task_id = $1 AND a.compare_status = 'lose' AND a.error_text IS NULL`,
      [taskId]
    ).then((r) => r.rows[0].c);

    // 竞品：主报告仅返回帕累托图所需摘要；详情见 GET /geo-health-report/competitor
    const compTotal = compRes.rows.reduce((s, r) => s + r.count, 0) || 1;
    const competitorMentions = compRes.rows.map((r) => ({
      name: r.name,
      count: r.count,
      pct: Math.round((r.count / compTotal) * 100),
      barTone: 'primary',
    }));

    // ── 5. 词云：仅读本期任务已入库的 AI 词云（任务完成时写入 geo_health_word_cloud_item）──
    const sentimentWordCloud = await loadPersistedWordCloudPayload(pool, taskId);

    // ── 6. 信源（geo_health_article.source_category 四分类聚合，与探针 Prompt 枚举一致）──
    const srcArtRes = await pool.query(
      `SELECT COALESCE(source_category, 'industry_vertical') AS k, COUNT(*)::int AS count
       FROM geo_health_article
       WHERE task_id = $1
       GROUP BY 1`,
      [taskId]
    );
    const byCat = {};
    for (const r of srcArtRes.rows) byCat[r.k] = r.count;
    const SOURCE_PIE_ORDER = [
      SOURCE_CATEGORY.AUTHORITY_MEDIA,
      SOURCE_CATEGORY.INDUSTRY_VERTICAL,
      SOURCE_CATEGORY.OFFICIAL_MEDIA,
      SOURCE_CATEGORY.UGC_COMMUNITY,
    ];
    const SOURCE_PIE_COLORS = {
      [SOURCE_CATEGORY.AUTHORITY_MEDIA]: '#67c23a',
      [SOURCE_CATEGORY.INDUSTRY_VERTICAL]: '#409eff',
      [SOURCE_CATEGORY.OFFICIAL_MEDIA]: '#e6a23c',
      [SOURCE_CATEGORY.UGC_COMMUNITY]: '#909399',
    };
    const srcSumArt = SOURCE_PIE_ORDER.reduce((s, k) => s + (byCat[k] || 0), 0) || 1;
    const sourceData = SOURCE_PIE_ORDER.map((k) => ({
      type: SOURCE_CATEGORY_LABEL[k],
      count: byCat[k] || 0,
      pct: Math.round(((byCat[k] || 0) / srcSumArt) * 100),
      color: SOURCE_PIE_COLORS[k],
    }));

    // ── 7. 首模型 AI 健康分（与 modelVisibilityCards[0].healthScore 一致，兼容旧字段 healthScore）──
    const healthScore = modelVisibilityCards[0]?.healthScore ?? 0;

    // ── 7b. 智能诊断：仅综合语境矩阵（16 档），不含旧版硬规则 ──
    const matrixAgg = aggregateMatrixContextFromModels({
      visibilityScores: modelVisibilityCards.map((c) => c.score),
      interceptRate,
      negativeRatio,
    });
    const matrixContext = matrixContextPayload(matrixAgg);
    const matrixDiagItem = buildMatrixContextDiagnosticItem(matrixAgg);

    const diagnosticSuggestions = matrixDiagItem ? [matrixDiagItem] : [];

    const payload = {
      success: true,
      brandName,
      brandDomain,
      checkTime,
      healthScore,
      comparePercent: Math.max(5, 100 - healthScore) + '%',
      kpiDenominator,
      interceptRate,
      // 盲区指数：分数形式
      blindModelCount,
      totalModelCount,
      blindIndex,                // 百分比，供进度条用
      // 负面关联度：小数形式 + 风险等级
      negativeCount,
      negativeTotal,
      negativeRatio,             // 0~1 小数，供显示用
      negativeRate,              // 百分比，供进度条用
      negativeRiskLevel,         // 风险等级文字
      authorityScore,
      brandMentionRate,
      industryMentionRate,
      openMentionTotal,
      openQuestionCount,
      keywordTypeLabels,
      modelVisibilityCards,
      intentPaths,
      platforms,
      matrixData,
      competitorMentions,
      sentimentWordCloud,
      sourceData,
      diagnosticSuggestions,
      matrixContext,
      lossTriggerTags: [],
      rawData: {
        taskId,
        totalChecks,
        kpiDenominator,
      },
    };

    await upsertGeoTaskReportCache(pool, {
      taskId,
      userId,
      analysisFp: cacheFps.analysisFp,
      articleFp: cacheFps.articleFp,
      lexiconFp: cacheFps.lexiconFp,
      payload,
    });

    res.json(payload);
  } catch (err) {
    console.error('[geo-health-report]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 词云来源明细：每条探针回答原文 × 本期词云词条命中一行，支持分页与内容模糊筛选（q）
 */
router.get('/geo-health-report/sentiment-sources', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'default_user';
    const taskId = parseInt(String(req.query.taskId ?? ''), 10);
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '10'), 10) || 10));
    const q = String(req.query.q ?? '').trim();

    if (!Number.isFinite(taskId) || taskId <= 0) {
      return res.status(400).json({ success: false, error: '需要有效的 taskId 查询参数' });
    }

    const own = await pool.query(
      `SELECT 1 FROM geo_health_task t
       WHERE t.id = $1 AND t.user_id = $2 AND t.status = 'completed'
         AND EXISTS (SELECT 1 FROM geo_health_analysis a WHERE a.task_id = t.id LIMIT 1)`,
      [taskId, userId]
    );
    if (!own.rows.length) {
      return res.status(404).json({ success: false, error: '任务不存在、未完成或无权访问' });
    }

    const answerRes = await pool.query(
      `SELECT a.task_id, a.question_id, ga.raw_json
       FROM geo_health_analysis a
       INNER JOIN geo_health_answer ga ON ga.id = a.answer_id AND ga.task_id = a.task_id
       WHERE a.task_id = $1 AND a.error_text IS NULL
       ORDER BY a.question_id ASC, a.id ASC`,
      [taskId]
    );

    const lexEntries = await loadWordCloudLexEntriesForTask(pool, taskId);

    const allRows = buildSentimentSourceDetailRows(answerRes.rows, lexEntries);

    let filtered = allRows;
    if (q) {
      const ql = q.toLowerCase();
      filtered = allRows.filter((r) => {
        const hay = `${r.taskId} ${r.questionId} ${r.answerText} ${r.keyword}`.toLowerCase();
        return hay.includes(ql);
      });
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const list = filtered.slice(start, start + pageSize);

    return res.json({
      success: true,
      list,
      total,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('[geo-health-report/sentiment-sources]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 底层信源溯源穿透：每条入库信源一行，支持分页与内容模糊筛选（q）
 */
router.get('/geo-health-report/source-articles', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'default_user';
    const taskId = parseInt(String(req.query.taskId ?? ''), 10);
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '10'), 10) || 10));
    const q = String(req.query.q ?? '').trim();

    if (!Number.isFinite(taskId) || taskId <= 0) {
      return res.status(400).json({ success: false, error: '需要有效的 taskId 查询参数' });
    }

    const own = await pool.query(
      `SELECT 1 FROM geo_health_task t
       WHERE t.id = $1 AND t.user_id = $2 AND t.status = 'completed'
         AND EXISTS (SELECT 1 FROM geo_health_analysis a WHERE a.task_id = t.id LIMIT 1)`,
      [taskId, userId]
    );
    if (!own.rows.length) {
      return res.status(404).json({ success: false, error: '任务不存在、未完成或无权访问' });
    }

    const artRes = await pool.query(
      `SELECT ga.url, ga.title, ga.source_category,
              COALESCE(NULLIF(trim(gq.question), ''), '') AS question_text
       FROM geo_health_article ga
       LEFT JOIN geo_health_question gq
         ON gq.id = ga.question_id AND gq.task_id = ga.task_id
       WHERE ga.task_id = $1
       ORDER BY ga.question_id ASC, ga.url ASC`,
      [taskId]
    );

    const allRows = artRes.rows.map((r) => {
      const categoryLabel = sourceCategoryLabelZh(r.source_category);
      const questionText = String(r.question_text || '').trim() || '—';
      return {
        url: r.url || '',
        title: r.title || '',
        sourceCategory: String(r.source_category || '').trim(),
        categoryLabel,
        questionText,
      };
    });

    let filtered = allRows;
    if (q) {
      const ql = q.toLowerCase();
      filtered = allRows.filter((r) => {
        const hay = `${r.url} ${r.title} ${r.categoryLabel} ${r.questionText}`.toLowerCase();
        return hay.includes(ql);
      });
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const list = filtered.slice(start, start + pageSize);

    return res.json({
      success: true,
      list,
      total,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('[geo-health-report/source-articles]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 本次任务全部「题目 × 模型」探针结果：题干 + 回答原文（与二次分析取数口径一致）
 */
router.get('/geo-health-report/task-qa', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'default_user';
    const taskId = parseInt(String(req.query.taskId ?? ''), 10);
    if (!Number.isFinite(taskId) || taskId <= 0) {
      return res.status(400).json({ success: false, error: '需要有效的 taskId 查询参数' });
    }

    const own = await pool.query(
      `SELECT 1 FROM geo_health_task t
       WHERE t.id = $1 AND t.user_id = $2 AND t.status = 'completed'
         AND EXISTS (SELECT 1 FROM geo_health_analysis a WHERE a.task_id = t.id LIMIT 1)`,
      [taskId, userId]
    );
    if (!own.rows.length) {
      return res.status(404).json({ success: false, error: '任务不存在、未完成或无权访问' });
    }

    const qRes = await pool.query(
      `SELECT gq.id AS question_id,
              gq.question,
              gq.question_type,
              COALESCE(NULLIF(trim(d.data_value), ''), gq.question_type) AS question_type_label,
              ga.model_name,
              ga.raw_json,
              ga.error_text
       FROM geo_health_question gq
       LEFT JOIN sys_dict d
         ON d.dict_type = 'keyword_type'
        AND d.data_key = gq.question_type
        AND COALESCE(d.enabled, true) = true
       LEFT JOIN geo_health_answer ga
         ON ga.question_id = gq.id AND ga.task_id = gq.task_id
       WHERE gq.task_id = $1
       ORDER BY gq.id ASC, ga.model_name ASC NULLS LAST`,
      [taskId]
    );

    const idOrder = [];
    const seen = new Set();
    for (const r of qRes.rows) {
      const qid = r.question_id;
      if (!seen.has(qid)) {
        seen.add(qid);
        idOrder.push(qid);
      }
    }
    const idToIndex = new Map(idOrder.map((id, i) => [id, i + 1]));

    const rows = [];
    const modelSet = new Set();
    for (const r of qRes.rows) {
      const modelName = r.model_name != null ? String(r.model_name).trim() : '';
      if (modelName) modelSet.add(modelName);
      rows.push({
        questionIndex: idToIndex.get(r.question_id) || 0,
        questionId: r.question_id,
        question: String(r.question || '').trim(),
        questionType: String(r.question_type || '').trim(),
        questionTypeLabel: String(r.question_type_label || r.question_type || '').trim(),
        modelName,
        answerText: modelName ? extractProbeAnswerText(r.raw_json) : '',
        errorText: r.error_text ? String(r.error_text).trim() : '',
      });
    }

    const modelNames = [...modelSet].sort((a, b) => a.localeCompare(b));

    return res.json({
      success: true,
      taskId,
      modelNames,
      rows,
    });
  } catch (err) {
    console.error('[geo-health-report/task-qa]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 单个竞品详情（问题类型、模型、情感分布、各桶源问题列表）
 */
router.get('/geo-health-report/competitor', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'default_user';
    const taskId = parseInt(String(req.query.taskId ?? ''), 10);
    const name = String(req.query.name ?? '').trim();
    if (!Number.isFinite(taskId) || taskId <= 0 || !name) {
      return res.status(400).json({ success: false, error: '需要有效的 taskId 与 name 查询参数' });
    }

    const own = await pool.query(
      `SELECT 1 FROM geo_health_task t
       WHERE t.id = $1 AND t.user_id = $2 AND t.status = 'completed'
         AND EXISTS (SELECT 1 FROM geo_health_analysis a WHERE a.task_id = t.id LIMIT 1)`,
      [taskId, userId]
    );
    if (!own.rows.length) {
      return res.status(404).json({ success: false, error: '任务不存在、未完成或无权访问' });
    }

    const compRes = await pool.query(
      `SELECT cc AS name, COUNT(*)::int AS count
       FROM geo_health_analysis a
       CROSS JOIN LATERAL jsonb_array_elements_text(a.competitors_mentioned) AS cc
       WHERE a.task_id = $1 AND a.error_text IS NULL
         AND a.competitors_mentioned IS NOT NULL
         AND jsonb_array_length(a.competitors_mentioned) > 0
       GROUP BY cc`,
      [taskId]
    );
    const row = compRes.rows.find((r) => String(r.name ?? '').trim() === name);
    if (!row) {
      return res.status(404).json({ success: false, error: '未找到该竞品提及记录' });
    }

    const compTotal = compRes.rows.reduce((s, r) => s + r.count, 0) || 1;
    const pct = Math.round((row.count / compTotal) * 100);
    const detailRes = await loadCompetitorDetailRows(pool, taskId, name);
    const competitor = buildCompetitorDetailPayload(row.name, row.count, pct, detailRes.rows);

    return res.json({ success: true, competitor });
  } catch (err) {
    console.error('[geo-health-report/competitor]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// 辅助函数
// ─────────────────────────────────────────────

/**
 * 开放式（场景/功能/价格）单元格规则
 * 赋分：T0=3 / T1=1 / T2=0；T3 触发风险
 * 均分阈值：≥2.5 → 行业首位；[1,2.5) → 头部梯队；(0,1) → 认知偏少；=0 → 心智缺失
 * 风险触发：任意 T3 → 强制 negative_risk（红）
 */
function computeOpenCell(rows) {
  if (!rows.length) return emptyCell();
  let score = 0;
  let hasRisk = false;
  for (const r of rows) {
    if (r.position === 'T3' || r.has_negative === true) hasRisk = true;
    if (r.position === 'T0') score += 3;
    else if (r.position === 'T1') score += 1;
  }
  const avg = score / rows.length;
  if (hasRisk) return cell('negative_risk', '负面风险', rows.length, avg);
  if (avg >= 2.5) return cell('industry_first', '行业首位', rows.length, avg);
  if (avg >= 1)   return cell('head_tier',      '头部梯队', rows.length, avg);
  if (avg > 0)    return cell('weak_awareness', '认知偏少', rows.length, avg);
  return cell('mind_missing', '心智缺失', rows.length, avg);
}

/**
 * 品牌词（核心词）单元格规则
 * 基于 brand_status 赋分：accurate=3 / bias=1 / missing=0；hijack / risk 强制风险
 * 均分阈值：≥2.5 → 精准命中；(1,2.5) → 信息偏差；(0,1] → 未提及
 */
function computeBrandCell(rows) {
  if (!rows.length) return emptyCell();
  let score = 0;
  let hasHijack = false;
  let hasNegative = false;
  for (const r of rows) {
    if (r.brand_status === 'hijack') hasHijack = true;
    if (r.brand_status === 'risk' || r.has_negative === true) hasNegative = true;
    if (r.brand_status === 'accurate') score += 3;
    else if (r.brand_status === 'bias') score += 1;
  }
  const avg = score / rows.length;
  if (hasNegative) return cell('negative_risk', '负面预警', rows.length, avg);
  if (hasHijack)   return cell('hijack_risk',   '竞品劫持', rows.length, avg);
  if (avg >= 2.5)  return cell('precise_hit',   '精准命中', rows.length, avg);
  if (avg > 1)     return cell('info_bias',     '信息偏差', rows.length, avg);
  return cell('mentioned_tail', '未提及', rows.length, avg);
}

/**
 * 对比词单元格规则
 * 基于 compare_status 赋分：win=3 / neutral=1 / lose=0；hijack / risk 强制风险
 * 额外：lose 数 >= 总数 → 强制 hijack_risk（竞品挟持）
 * 均分阈值：≥2.5 → 品牌占优；(1,2.5) → 势均力敌；(0,1] → 竞品占优
 */
function computeCompareCell(rows) {
  if (!rows.length) return emptyCell();
  let score = 0;
  let hasHijack = false;
  let hasNegative = false;
  let loseCount = 0;
  for (const r of rows) {
    if (r.compare_status === 'hijack') hasHijack = true;
    if (r.compare_status === 'risk' || r.has_negative === true) hasNegative = true;
    if (r.compare_status === 'win') score += 3;
    else if (r.compare_status === 'neutral') score += 1;
    else if (r.compare_status === 'lose') loseCount += 1;
  }
  if (loseCount >= rows.length) hasHijack = true;
  const avg = score / rows.length;
  if (hasNegative) return cell('negative_risk', '负面预警', rows.length, avg);
  if (hasHijack)   return cell('hijack_risk',   '竞品挟持', rows.length, avg);
  if (avg >= 2.5)  return cell('brand_win',       '品牌占优', rows.length, avg);
  if (avg > 1)     return cell('tie',             '势均力敌', rows.length, avg);
  return cell('competitor_win', '竞品占优', rows.length, avg);
}

function cell(state, label, total, avgScore) {
  return { state, label, total, avgScore: Math.round(avgScore * 100) / 100 };
}

function emptyCell() {
  return { state: 'no_data', label: '—', total: 0, avgScore: 0 };
}

function buildModelBullets({ score, total, visibleCount }) {
  const bullets = [];
  const notVisible = total - visibleCount;
  if (score >= 70) {
    bullets.push({ tone: 'good', text: `品牌可见度良好，${visibleCount}/${total} 题有效露出` });
  } else if (score >= 40) {
    bullets.push({ tone: 'warn', text: `可见度中等，仍有 ${notVisible} 题未提及品牌` });
  } else {
    bullets.push({ tone: 'bad', text: `可见度偏低，${notVisible}/${total} 题未提及品牌` });
  }
  if (total < 5) {
    bullets.push({ tone: 'neutral', text: '检测样本较少，建议增加抽题量' });
  } else {
    bullets.push({ tone: 'neutral', text: '可结合矩阵观察各类问题的露出情况' });
  }
  return bullets;
}

function emptyReport({ brandName, brandDomain }) {
  return {
    success: true,
    brandName,
    brandDomain,
    checkTime: new Date().toISOString(),
    healthScore: 0,
    comparePercent: '95%',
    blindModelCount: 0,
    totalModelCount: 0,
    negativeCount: 0,
    negativeTotal: 0,
    negativeRatio: 0,
    negativeRiskLevel: '健康',
    kpiDenominator: 'all_fallback',
    interceptRate: 0,
    blindIndex: 0,
    negativeRate: 0,
    authorityScore: 0,
    brandMentionRate: 0,
    industryMentionRate: 0,
    openMentionTotal: 0,
    openQuestionCount: 0,
    keywordTypeLabels: {},
    modelVisibilityCards: [],
    intentPaths: [],
    platforms: [],
    matrixData: {},
    competitorMentions: [],
    sentimentWordCloud: [],
    sourceData: [],
    diagnosticSuggestions: [],
    matrixContext: null,
    lossTriggerTags: [],
    rawData: { taskId: null, totalChecks: 0 },
  };
}

export default router;
