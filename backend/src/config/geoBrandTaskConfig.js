/**
 * 品牌体检（geo_health_*）可调参数 —— 人工改这里即可，无需翻业务代码。
 *
 * ────── 抽题 ──────
 * GEO_HEALTH_QUESTIONS_PER_TYPE
 *   sys_dict 中 dict_type=keyword_type 的每一类（按 data_key）各抽几条。
 *
 * ────── 探针（Probe） ──────
 * 流程：第 1 步原题直问得 raw_answer；可选第 2 步将原文结构化为 JSON（mentioned_entities）。
 * GEO_HEALTH_PROBE_EXTRACT_ENABLED=false 可减半探针 API 次数（分析读 raw_answer，默认关）。
 * GEO_HEALTH_PROBE_TEMPERATURE 探针第 1 步直问温度（默认 1.3，贴近 DeepSeek 官网一般对话）。
 * GEO_HEALTH_PROBE_EXTRACT_MAX_TOKENS / GEO_HEALTH_PROBE_EXTRACT_TEMPERATURE 控制第 2 步抽取。
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
 *   GEO_SOURCE_CLASSIFY_CONCURRENCY=6
 *   GEO_SOURCE_CLASSIFY_USE_LLM=true   # false=仅域名规则分类，不调分析模型（快）
 */

function numEnv(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** 温度参数钳制在 [0, 2]（与多数 Chat API 一致） */
export function clampTemperature(n, fallback = 1.3) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(2, Math.max(0, x));
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
export const GEO_HEALTH_PROBE_MAX_TOKENS = Math.max(512, numEnv('GEO_HEALTH_PROBE_MAX_TOKENS', 2000));

/** 探针阶段：单次 chat 的超时（毫秒），到点直接 abort 并落库错误，避免卡死 */
export const GEO_HEALTH_PROBE_TIMEOUT_MS = Math.max(5_000, numEnv('GEO_HEALTH_PROBE_TIMEOUT_MS', 90_000));

/** 探针第 2 步（原文→JSON 抽取）单次 max_tokens */
export const GEO_HEALTH_PROBE_EXTRACT_MAX_TOKENS = Math.max(
  512,
  numEnv('GEO_HEALTH_PROBE_EXTRACT_MAX_TOKENS', 1024)
);

/**
 * 探针第 1 步直问温度（全局默认，环境变量 GEO_HEALTH_PROBE_TEMPERATURE 可覆盖）
 * DeepSeek 官方建议一般对话 1.3；其余厂商未单独配置时用此值。
 */
export const GEO_HEALTH_PROBE_TEMPERATURE = clampTemperature(
  numEnv('GEO_HEALTH_PROBE_TEMPERATURE', 1.3),
  1.3
);

/**
 * 按 provider_key 覆盖探针直问温度（仅第 1 步；未列出则用 GEO_HEALTH_PROBE_TEMPERATURE）
 * 国内 OpenAI 兼容接口常见默认约 0.7～1.0，此处统一略调高以贴近「聊天产品」体感。
 */
const PROBE_TEMPERATURE_BY_PROVIDER = {
  deepseek: 1.3,
  qwen: 1.0,
  kimi: 1.0,
  glm: 1.0,
  doubao: 1.0,
  hunyuan: 1.0,
  wenxin: 1.0,
  openai: 1.0,
  chatgpt: 1.0,
  gemini: 1.0,
  claude: 1.0,
};

/** @param {string} [providerKey] ai_provider_connection.provider_key */
export function resolveProbeTemperature(providerKey) {
  const pk = String(providerKey || '').trim();
  if (pk && PROBE_TEMPERATURE_BY_PROVIDER[pk] != null) {
    return clampTemperature(PROBE_TEMPERATURE_BY_PROVIDER[pk]);
  }
  return GEO_HEALTH_PROBE_TEMPERATURE;
}

/** 探针第 2 步抽取温度（宜低，保证 JSON 稳定） */
export const GEO_HEALTH_PROBE_EXTRACT_TEMPERATURE = clampTemperature(
  numEnv('GEO_HEALTH_PROBE_EXTRACT_TEMPERATURE', 0.1),
  0.1
);

/** 是否执行探针第 2 步 JSON 抽取（默认 false，显著缩短 题×模型 探针耗时） */
export const GEO_HEALTH_PROBE_EXTRACT_ENABLED =
  String(process.env.GEO_HEALTH_PROBE_EXTRACT_ENABLED ?? 'false').toLowerCase() === 'true';

/** DeepSeek 探针直问：system 消息（对齐官网/API 示例） */
export const DEEPSEEK_PROBE_SYSTEM_MESSAGE = strEnv(
  'DEEPSEEK_PROBE_SYSTEM_MESSAGE',
  'You are a helpful assistant.'
);

/** DeepSeek 探针直问：是否启用 thinking（false 则传 thinking.type=disabled） */
export const DEEPSEEK_PROBE_THINKING_ENABLED =
  String(process.env.DEEPSEEK_PROBE_THINKING_ENABLED ?? 'false').toLowerCase() !== 'false';

/** DeepSeek 探针直问：reasoning_effort（high | max） */
export const DEEPSEEK_PROBE_REASONING_EFFORT = strEnv('DEEPSEEK_PROBE_REASONING_EFFORT', 'high');

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

/** 分析阶段：单次 chat 的 max_tokens（JSON 字段多，直问后 answer 更长，默认加大） */
export const GEO_HEALTH_ANALYSIS_MAX_TOKENS = Math.max(
  512,
  numEnv('GEO_HEALTH_ANALYSIS_MAX_TOKENS', 2048)
);

/** 送入分析 prompt 的 answer 最大字符数（过长易致模型输出 JSON 被截断） */
export const GEO_HEALTH_ANALYSIS_ANSWER_MAX_CHARS = Math.max(
  2000,
  numEnv('GEO_HEALTH_ANALYSIS_ANSWER_MAX_CHARS', 10000)
);

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
export const GEO_SOURCE_CLASSIFY_CONCURRENCY = Math.max(1, numEnv('GEO_SOURCE_CLASSIFY_CONCURRENCY', 6));

/** 信源分类是否调用分析模型（false=仅用域名规则，显著加速） */
export const GEO_SOURCE_CLASSIFY_USE_LLM = !['0', 'false', 'no', 'off'].includes(
  String(process.env.GEO_SOURCE_CLASSIFY_USE_LLM ?? 'true').trim().toLowerCase()
);

/** 信源分类单次 chat max_tokens */
export const GEO_SOURCE_CLASSIFY_MAX_TOKENS = Math.max(512, numEnv('GEO_SOURCE_CLASSIFY_MAX_TOKENS', 1500));

/** 信源分类超时（毫秒） */
export const GEO_SOURCE_CLASSIFY_TIMEOUT_MS = Math.max(5_000, numEnv('GEO_SOURCE_CLASSIFY_TIMEOUT_MS', 60_000));
