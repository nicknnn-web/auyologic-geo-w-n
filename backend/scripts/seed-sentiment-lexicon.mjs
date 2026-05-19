/**
 * 为 default_user 补全情感词（每档 20 个）；已存在的关键词（不区分大小写）会跳过。
 * 用法：在 backend 目录执行  node scripts/seed-sentiment-lexicon.mjs
 */
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const PG_CONNECTION_OPTIONS = '-c timezone=Asia/Shanghai';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: PG_CONNECTION_OPTIONS,
});

const USER_ID = 'default_user';

const POSITIVE = [
  '领先', '优质', '口碑好', '值得信赖', '出色', '推荐', '稳健', '专业', '创新', '性价比高',
  '体验好', '服务周到', '行业标杆', '实力强', '好评', '可靠', '亮点突出', '表现优秀', '备受认可', '优势明显',
];
const NEUTRAL = [
  '一般', '尚可', '中规中矩', '略有差异', '视场景而定', '各有特点', '需结合需求', '多品牌可选', '价格区间大', '配置多样',
  '版本较多', '地区差异', '待定', '信息有限', '需核实', '因人制宜', '选项丰富', '没有绝对', '持平', '了解不多',
];
const NEGATIVE = [
  '差评', '避雷', '踩坑', '翻车', '风险', '投诉', '问题较多', '逊色', '不推荐', '谨慎',
  '争议', '短板', '噪音大', '售后差', '缩水', '槽点', '假货', '隐患', '不佳', '退款难',
];

async function upsertTier(client, tier, words) {
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const kw = words[i];
    const r = await client.query(
      `INSERT INTO geo_sentiment_lexicon (user_id, keyword, tier, enabled, sort_order)
       SELECT $1::varchar, $2::varchar, $3::varchar, true, $4::int
       WHERE NOT EXISTS (
         SELECT 1 FROM geo_sentiment_lexicon e
         WHERE e.user_id = $1 AND lower(e.keyword) = lower($2)
       )
       RETURNING id`,
      [USER_ID, kw, tier, i]
    );
    if (r.rows.length) n += 1;
  }
  return n;
}

async function main() {
  const client = await pool.connect();
  try {
    const insP = await upsertTier(client, 'positive', POSITIVE);
    const insN = await upsertTier(client, 'neutral', NEUTRAL);
    const insNeg = await upsertTier(client, 'negative', NEGATIVE);
    console.log(`完成：正面新增 ${insP} 条，中性新增 ${insN} 条，负面新增 ${insNeg} 条（已存在则跳过）`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
