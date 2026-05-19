import 'dotenv/config';
/**
 * 运维：对指定 task 重新执行词云 AI 抽取并覆盖写入 geo_health_word_cloud_item。
 * 用法：在 backend 目录下 `node scripts/repersist-wordcloud-task.mjs <taskId>`
 * 需配置 DATABASE_URL；会调用大模型，任务回答多时耗时数分钟。
 */
import pool from '../src/db.js';
import { persistAiWordCloudForTask } from '../src/services/geoHealthWordCloudPersistService.js';

const tid = Number(process.argv[2] || 76);
const uid = 'default_user';

async function main() {
  const entRes = await pool.query(
    `SELECT company_name, industry, description, target_audience FROM users WHERE user_id = $1 LIMIT 1`,
    [uid]
  );
  const e = entRes.rows[0] || {};
  console.log('repersist task', tid, 'brand', e.company_name);
  const r = await persistAiWordCloudForTask(pool, tid, uid, {
    brandName: String(e.company_name || '').trim() || '品牌',
    industry: String(e.industry || '').trim(),
    brandDescription: String(e.description || '').trim(),
    targetAudience: String(e.target_audience || '').trim(),
  });
  console.log('result', r);
  const c = await pool.query(
    `SELECT COUNT(*)::int n FROM geo_health_word_cloud_item WHERE task_id = $1`,
    [tid]
  );
  console.log('rows now', c.rows[0].n);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
