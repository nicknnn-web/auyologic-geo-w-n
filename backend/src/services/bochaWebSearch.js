/**
 * 博查 Web Search API
 * @see https://open.bocha.cn
 *
 * 限流：全局排队 + 最小请求间隔 + 429 指数退避重试
 */

import {
  GEO_BOCHA_COUNT,
  GEO_BOCHA_FRESHNESS,
  GEO_BOCHA_MIN_INTERVAL_MS,
  GEO_BOCHA_RETRY_BASE_MS,
  GEO_BOCHA_RETRY_MAX,
  GEO_BOCHA_SUMMARY,
  GEO_BOCHA_TIMEOUT_MS,
} from '../config/geoBrandTaskConfig.js';
import { isAcceptableSourceUrl } from '../utils/sourceUrlValidation.js';

const DEFAULT_URL = 'https://api.bochaai.com/v1/web-search';

/** 全局串行队列，避免多题并发打满博查 QPS */
let bochaQueue = Promise.resolve();
let bochaLastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function strEnv(name, fallback = '') {
  const v = process.env[name];
  return v !== undefined && String(v).trim() !== '' ? String(v).trim() : fallback;
}

export function getBochaApiKey() {
  let key = strEnv('BOCHA_API_KEY');
  if (!key) return '';
  if (/^bearer\s+/i.test(key)) key = key.replace(/^bearer\s+/i, '').trim();
  return key;
}

export function isBochaConfigured() {
  return !!getBochaApiKey();
}

function isRateLimitMessage(msg) {
  const s = String(msg || '');
  return /429|request limit|rate limit|too many requests|限流/i.test(s);
}

/**
 * 在全局队列中执行一次博查调用（保证相邻请求间隔）
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function runThroughBochaQueue(fn) {
  const run = bochaQueue.then(async () => {
    const gap = GEO_BOCHA_MIN_INTERVAL_MS;
    if (gap > 0) {
      const wait = Math.max(0, bochaLastRequestAt + gap - Date.now());
      if (wait > 0) await sleep(wait);
    }
    bochaLastRequestAt = Date.now();
    return fn();
  });
  bochaQueue = run.catch(() => {});
  return run;
}

/**
 * 规范化博查日期字段（优先 datePublished）
 */
export function normalizeBochaPublishTime(datePublished, dateLastCrawled) {
  let raw = String(datePublished || '').trim();
  if (!raw) raw = String(dateLastCrawled || '').trim();
  if (!raw) return '';
  if (/Z$/i.test(raw) && !/[+-]\d{2}:\d{2}$/.test(raw)) {
    raw = raw.replace(/Z$/i, '+08:00');
  }
  return raw.slice(0, 128);
}

export function mapBochaWebPageToHit(row, index) {
  const url = String(row?.url || row?.displayUrl || '').trim();
  if (!isAcceptableSourceUrl(url)) return null;
  const summary = String(row?.summary || row?.snippet || '').trim();
  return {
    index,
    title: String(row?.name || '').trim() || '未命名',
    url,
    snippet: summary,
    summary,
    platform: String(row?.siteName || '').trim().slice(0, 256) || '未知',
    publishTime: normalizeBochaPublishTime(row?.datePublished, row?.dateLastCrawled),
    siteIcon: String(row?.siteIcon || '').trim(),
  };
}

export function parseBochaSearchResponse(body) {
  const code = body?.code;
  if (code !== 200 && code !== '200') {
    const msg = body?.msg || body?.message || `博查返回 code=${code}`;
    if (isRateLimitMessage(msg) || code === 429) {
      throw new Error(`博查 HTTP 429: ${msg}`);
    }
    throw new Error(msg);
  }
  const data = body?.data ?? body;
  const pages = data?.webPages?.value ?? [];
  const hits = [];
  let idx = 0;
  for (const row of pages) {
    const hit = mapBochaWebPageToHit(row, idx + 1);
    if (hit) {
      hits.push(hit);
      idx += 1;
    }
  }
  return {
    hits,
    totalEstimatedMatches: data?.webPages?.totalEstimatedMatches ?? null,
    raw: body,
  };
}

/**
 * 单次 HTTP 请求（无重试、无排队）
 */
async function bochaWebSearchOnce(query, opts = {}) {
  const apiKey = getBochaApiKey();
  if (!apiKey) throw new Error('未配置 BOCHA_API_KEY');

  const q = String(query || '').trim();
  if (!q) throw new Error('博查 query 不能为空');

  const url = strEnv('BOCHA_BASE_URL', DEFAULT_URL);
  const count = Math.min(50, Math.max(1, opts.count ?? GEO_BOCHA_COUNT));
  const freshness = opts.freshness ?? GEO_BOCHA_FRESHNESS;
  const summary = opts.summary ?? GEO_BOCHA_SUMMARY;
  const timeoutMs = opts.timeoutMs ?? GEO_BOCHA_TIMEOUT_MS;

  const ac = new AbortController();
  let timer = null;
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      try {
        ac.abort(new Error(`博查检索超时（${timeoutMs}ms）`));
      } catch {
        /* ignore */
      }
    }, timeoutMs);
  }
  if (opts.signal) {
    if (opts.signal.aborted) {
      if (timer) clearTimeout(timer);
      throw opts.signal.reason || new Error('博查检索已取消');
    }
    opts.signal.addEventListener('abort', () => ac.abort(opts.signal.reason || new Error('博查检索已取消')), {
      once: true,
    });
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: q,
        freshness,
        summary: !!summary,
        count,
      }),
      signal: ac.signal,
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) {
      const msg = body?.msg || body?.message || text?.slice(0, 200) || res.statusText;
      throw new Error(`博查 HTTP ${res.status}: ${msg}`);
    }
    if (!body) throw new Error('博查响应非 JSON');
    const parsed = parseBochaSearchResponse(body);
    return { query: q, ...parsed };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 网页搜索：全局间隔排队 + 429 指数退避重试
 */
export async function bochaWebSearch(query, opts = {}) {
  const maxRetries = GEO_BOCHA_RETRY_MAX;
  let lastErr = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await runThroughBochaQueue(() => bochaWebSearchOnce(query, opts));
    } catch (e) {
      lastErr = e;
      const rateLimited = isRateLimitMessage(e?.message);
      if (!rateLimited || attempt >= maxRetries) {
        throw e;
      }
      const waitMs =
        GEO_BOCHA_RETRY_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 800);
      console.warn(
        `[bocha] 429 限流，${waitMs}ms 后重试 (${attempt + 1}/${maxRetries}) query=${String(query).slice(0, 40)}…`
      );
      await sleep(waitMs);
    }
  }
  throw lastErr || new Error('博查检索失败');
}
