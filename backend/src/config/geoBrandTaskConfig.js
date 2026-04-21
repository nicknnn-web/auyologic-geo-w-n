/**
 * 品牌体检（geo_health_*）可调参数 —— 人工改这里即可，无需翻业务代码。
 *
 * GEO_HEALTH_QUESTIONS_PER_TYPE
 *   sys_dict 中 dict_type=keyword_type 的每一类（按 data_key）各抽几条。
 *   例如字典有 6 条、本值为 1 → 共约 6 题；为 10 → 共约 60 题。
 *
 * 也可用环境变量覆盖（便于服务器上不改代码）：
 *   GEO_HEALTH_QUESTIONS_PER_TYPE=1
 *   GEO_HEALTH_PROBE_CONCURRENCY=2
 *   GEO_HEALTH_PROBE_BATCH_DELAY_MS=250
 */
function numEnv(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** 每个 keyword_type（data_key）抽题条数：总题量 ≈ 本值 × 字典 keyword_type 条数（也可用环境变量覆盖） */
export const GEO_HEALTH_QUESTIONS_PER_TYPE = Math.max(
  1,
  numEnv('GEO_HEALTH_QUESTIONS_PER_TYPE', 1)
);

/** 后台同一批并发调用 DeepSeek 的数量（建议 1～3，避免压垮 API） */
export const GEO_HEALTH_PROBE_CONCURRENCY = Math.max(1, numEnv('GEO_HEALTH_PROBE_CONCURRENCY', 2));

/** 每批之间停顿（毫秒），给 API 留喘息 */
export const GEO_HEALTH_PROBE_BATCH_DELAY_MS = numEnv('GEO_HEALTH_PROBE_BATCH_DELAY_MS', 250);

/** 抽题时从 sys_dict 读取的字典类型（与 questions.keyword_type 存的 data_key 一致） */
export const GEO_HEALTH_KEYWORD_TYPE_DICT_TYPE = 'keyword_type';
