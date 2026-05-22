/**
 * 品牌体检（geo_health_*）可调参数 —— 人工改这里即可，无需翻业务代码。
 *
 * ────── 抽题 ──────
 * GEO_HEALTH_QUESTIONS_PER_TYPE
 *   sys_dict 中 dict_type=keyword_type 的每一类（按 data_key）各抽几条。
 *
 * ────── 探针（Probe） ──────
 * PROBE_MODELS
 *   逗号分隔的 provider key 列表，每个 key 对应 aiClientFactory.PROVIDERS 里的 key。
 *   同一道题会对每个 provider 各调用一次，结果分别存入 geo_health_answer（不同 model_name）。
 *   例如：PROBE_MODELS=deepseek,qwen  → 每题产生 2 条 geo_health_answer
 *   默认只用 deepseek。
 *   ⚠️ 增加 provider 前须确保对应 API Key 环境变量已配置，否则探针会报错。
 *
 * GEO_HEALTH_PROBE_CONCURRENCY
 *   同时并发探针的题目数（建议 1～3）
 *
 * GEO_HEALTH_PROBE_BATCH_DELAY_MS
 *   每批之间停顿（毫秒）
 *
 * ────── 分析（Analysis） ──────
 * ANALYSIS_MODEL
 *   做 visibility / position 等二次分析用的 provider key（只需一个，选最准的）。
 *   与 PROBE_MODELS 解耦：可以用 deepseek 探针、用 qwen 分析，互不影响。
 *
 * GEO_HEALTH_ANALYSIS_CONCURRENCY / GEO_HEALTH_ANALYSIS_DELAY_MS
 *   分析阶段的并发与延迟（建议 2-3 / 300ms）
 *
 * ────── 可通过环境变量覆盖（不需改此文件） ──────
 *   GEO_HEALTH_QUESTIONS_PER_TYPE=10
 *   PROBE_MODELS=deepseek,qwen
 *   ANALYSIS_MODEL=deepseek
 *   GEO_HEALTH_PROBE_CONCURRENCY=2
 *   GEO_HEALTH_PROBE_BATCH_DELAY_MS=250
 *   GEO_HEALTH_ANALYSIS_CONCURRENCY=2
 *   GEO_HEALTH_ANALYSIS_DELAY_MS=300
 *
 * ────── 信源（博查 + 分析模型分类）──────
 *   BOCHA_API_KEY
 *   GEO_BOCHA_COUNT=8
 *   GEO_BOCHA_SEARCH_CONCURRENCY=1
 *   GEO_BOCHA_MIN_INTERVAL_MS=1200
 *   GEO_BOCHA_RETRY_MAX=5
 *   GEO_SOURCE_CLASSIFY_CONCURRENCY=3
 */

function numEnv(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function strEnv(name, fallback) {
  const v = process.env[name];
  return v !== undefined && v.trim() !== '' ? v.trim() : fallback;
}

/** 每个 keyword_type 各抽几条 */
export const GEO_HEALTH_QUESTIONS_PER_TYPE = Math.max(
  1,
  numEnv('GEO_HEALTH_QUESTIONS_PER_TYPE', 10)
);

/** 探针阶段：滑动窗口并发上限（题×模型为单位调度） */
export const GEO_HEALTH_PROBE_CONCURRENCY = Math.max(1, numEnv('GEO_HEALTH_PROBE_CONCURRENCY', 12));

/** 探针阶段：每批之间停顿（毫秒）。滑动窗口模式下默认 0 */
export const GEO_HEALTH_PROBE_BATCH_DELAY_MS = numEnv('GEO_HEALTH_PROBE_BATCH_DELAY_MS', 0);

/** 探针阶段：单次 chat 的 max_tokens；过大会显著拉长尾延迟 */
export const GEO_HEALTH_PROBE_MAX_TOKENS = Math.max(256, numEnv('GEO_HEALTH_PROBE_MAX_TOKENS', 2000));

/** 探针阶段：单次 chat 的超时（毫秒），到点直接 abort 并落库错误，避免卡死 */
export const GEO_HEALTH_PROBE_TIMEOUT_MS = Math.max(5_000, numEnv('GEO_HEALTH_PROBE_TIMEOUT_MS', 90_000));

/** 从 sys_dict 读取的字典类型（与 questions.keyword_type 存的 data_key 一致） */
export const GEO_HEALTH_KEYWORD_TYPE_DICT_TYPE = 'keyword_type';

/**
 * 探针使用的大模型列表（数组，每项是 aiClientFactory.PROVIDERS 里的 key）
 * 支持多模型：同一道题对每个模型各调用一次，分别存入 geo_health_answer。
 */
export const PROBE_MODELS = strEnv('PROBE_MODELS', 'deepseek')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * 二次分析使用的模型 provider key（单一，专注分析质量）
 */
export const ANALYSIS_MODEL = strEnv('ANALYSIS_MODEL', 'deepseek');

/** 分析阶段：滑动窗口并发上限 */
export const GEO_HEALTH_ANALYSIS_CONCURRENCY = Math.max(
  1,
  numEnv('GEO_HEALTH_ANALYSIS_CONCURRENCY', 8)
);

/** 分析阶段：每批之间停顿（毫秒）。滑动窗口默认 0 */
export const GEO_HEALTH_ANALYSIS_DELAY_MS = numEnv('GEO_HEALTH_ANALYSIS_DELAY_MS', 0);

/** 分析阶段：单次 chat 的超时（毫秒） */
export const GEO_HEALTH_ANALYSIS_TIMEOUT_MS = Math.max(5_000, numEnv('GEO_HEALTH_ANALYSIS_TIMEOUT_MS', 60_000));

/** 博查：每题返回网页条数（1–50） */
export const GEO_BOCHA_COUNT = Math.max(1, Math.min(50, numEnv('GEO_BOCHA_COUNT', 8)));

/** 博查 freshness，推荐 noLimit */
export const GEO_BOCHA_FRESHNESS = strEnv('GEO_BOCHA_FRESHNESS', 'noLimit');

/** 博查是否返回长摘要 */
export const GEO_BOCHA_SUMMARY = process.env.GEO_BOCHA_SUMMARY !== 'false';

/** 博查单次请求超时（毫秒） */
export const GEO_BOCHA_TIMEOUT_MS = Math.max(3_000, numEnv('GEO_BOCHA_TIMEOUT_MS', 15_000));

/** 博查并发（按题）；默认 1，避免 429 限流 */
export const GEO_BOCHA_SEARCH_CONCURRENCY = Math.max(1, numEnv('GEO_BOCHA_SEARCH_CONCURRENCY', 1));

/** 博查两次请求最小间隔（毫秒），全局串行排队 */
export const GEO_BOCHA_MIN_INTERVAL_MS = Math.max(0, numEnv('GEO_BOCHA_MIN_INTERVAL_MS', 1200));

/** 博查遇 429 时最多重试次数 */
export const GEO_BOCHA_RETRY_MAX = Math.max(0, numEnv('GEO_BOCHA_RETRY_MAX', 5));

/** 博查 429 重试基础等待（毫秒），指数退避 */
export const GEO_BOCHA_RETRY_BASE_MS = Math.max(500, numEnv('GEO_BOCHA_RETRY_BASE_MS', 3000));

/** 信源分类 LLM 并发（按题） */
export const GEO_SOURCE_CLASSIFY_CONCURRENCY = Math.max(1, numEnv('GEO_SOURCE_CLASSIFY_CONCURRENCY', 3));

/** 信源分类单次 chat max_tokens */
export const GEO_SOURCE_CLASSIFY_MAX_TOKENS = Math.max(512, numEnv('GEO_SOURCE_CLASSIFY_MAX_TOKENS', 1500));

/** 信源分类超时（毫秒） */
export const GEO_SOURCE_CLASSIFY_TIMEOUT_MS = Math.max(5_000, numEnv('GEO_SOURCE_CLASSIFY_TIMEOUT_MS', 60_000));
