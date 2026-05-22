/**
 * 品牌体检信源统计：博查原始命中频次（按平台 / 域名 / URL）+ 入库文章日期分布
 */

import { isAcceptableSourceUrl } from '../utils/sourceUrlValidation.js';

function stripWww(host) {
  const h = String(host || '').toLowerCase();
  return h.startsWith('www.') ? h.slice(4) : h;
}

/** 从 URL 解析根域名（展示用） */
export function hostnameFromSourceUrl(url) {
  try {
    const u = new URL(String(url).trim());
    return stripWww(u.hostname);
  } catch {
    return '';
  }
}

function parsePublishParts(publishTime) {
  const raw = String(publishTime || '').trim();
  if (!raw) return null;
  let d = new Date(raw);
  if (Number.isNaN(d.getTime()) && /Z$/i.test(raw)) {
    d = new Date(raw.replace(/Z$/i, '+08:00'));
  }
  if (Number.isNaN(d.getTime())) return null;
  const s = d.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const [datePart] = s.split(' ');
  const [yStr, moStr, daStr] = datePart.split('-');
  const y = Number(yStr);
  const mo = Number(moStr);
  const da = Number(daStr);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return null;
  return { y, mo, da: Number.isFinite(da) ? da : 1, ym: `${y}-${String(mo).padStart(2, '0')}` };
}

/** 采信文案：采信 YYYY年M月D日 内容 */
export function formatSourceCitedDateLabel(publishTime) {
  const p = parsePublishParts(publishTime);
  if (!p) return '';
  return `采信 ${p.y}年${p.mo}月${p.da}日 内容`;
}

function bumpMap(map, key, delta = 1) {
  const k = String(key || '').trim() || '未知';
  map.set(k, (map.get(k) || 0) + delta);
}

function toLeaderboard(map, total, { limit = 50 } = {}) {
  const denom = total > 0 ? total : 1;
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count], i) => ({
      rank: i + 1,
      name,
      count,
      pct: Math.round((count / denom) * 1000) / 10,
    }));
}

/**
 * @param {object} pool
 * @param {number} taskId
 */
export async function buildSourceStatsForTask(pool, taskId) {
  const taskRes = await pool.query(
    `SELECT id, created_at FROM geo_health_task WHERE id = $1`,
    [taskId]
  );
  const reportCheckTime = taskRes.rows[0]?.created_at ?? null;

  const searchRes = await pool.query(
    `SELECT raw_json FROM geo_health_source_search WHERE task_id = $1`,
    [taskId]
  );

  let totalCitations = 0;
  const platformCounts = new Map();
  const hostCounts = new Map();
  const urlCounts = new Map();
  const urlMeta = new Map();
  const hostUrlSets = new Map();

  const ingestHit = (h) => {
    const url = String(h.url || '').trim();
    if (!isAcceptableSourceUrl(url)) return;
    totalCitations += 1;
    const host = hostnameFromSourceUrl(url);
    const platform = String(h.platform || '').trim() || host || '未知';
    bumpMap(platformCounts, platform);
    bumpMap(hostCounts, host || '未知');
    const urlKey = url.toLowerCase();
    bumpMap(urlCounts, urlKey);
    if (!urlMeta.has(urlKey)) {
      urlMeta.set(urlKey, {
        url,
        title: String(h.title || '').trim(),
        platform,
      });
    }
    if (!hostUrlSets.has(host)) hostUrlSets.set(host, new Set());
    hostUrlSets.get(host).add(urlKey);
  };

  for (const row of searchRes.rows) {
    const raw = row.raw_json || {};
    const hits = Array.isArray(raw.hits) ? raw.hits : [];
    for (const h of hits) ingestHit(h);
  }

  // 若尚未跑博查，用入库文章按 URL 计一次（兼容旧任务）
  if (totalCitations === 0) {
    const artRes = await pool.query(
      `SELECT url, title, platform FROM geo_health_article WHERE task_id = $1`,
      [taskId]
    );
    for (const r of artRes.rows) {
      ingestHit({
        url: r.url,
        title: r.title,
        platform: r.platform,
      });
    }
  }

  const platformLeaderboard = toLeaderboard(platformCounts, totalCitations);
  const domainLeaderboard = toLeaderboard(hostCounts, totalCitations).map((row) => ({
    ...row,
    uniqueUrlCount: hostUrlSets.get(row.name)?.size ?? 0,
  }));

  const urlLeaderboard = [...urlCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([urlKey, count], i) => {
      const meta = urlMeta.get(urlKey) || { url: urlKey, title: '', platform: '' };
      const denom = totalCitations > 0 ? totalCitations : 1;
      return {
        rank: i + 1,
        url: meta.url,
        title: meta.title,
        platform: meta.platform,
        count,
        pct: Math.round((count / denom) * 1000) / 10,
      };
    });

  const artRes = await pool.query(
    `SELECT publish_time FROM geo_health_article WHERE task_id = $1`,
    [taskId]
  );
  const monthCounts = new Map();
  let datedArticles = 0;
  for (const r of artRes.rows) {
    const p = parsePublishParts(r.publish_time);
    if (!p) continue;
    datedArticles += 1;
    bumpMap(monthCounts, p.ym);
  }
  const contentDateHistogram = [...monthCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({
      month,
      count,
      pct: datedArticles > 0 ? Math.round((count / datedArticles) * 1000) / 10 : 0,
    }));

  return {
    reportCheckTime,
    totalCitations,
    platformLeaderboard,
    domainLeaderboard,
    urlLeaderboard,
    contentDateHistogram,
    datedArticleCount: datedArticles,
  };
}
