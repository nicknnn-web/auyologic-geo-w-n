/**
 * 数据库迁移脚本
 * 用于添加新字段或修改表结构
 */

export const migrations = {
  // questions 表迁移
  questions: [
    'ALTER TABLE questions ADD COLUMN IF NOT EXISTS keyword_type VARCHAR(50)',
    'ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_keyword VARCHAR(255)'
  ],

  // knowledge 表迁移
  knowledge: [
    'ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS file_type VARCHAR(50)',
    'ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS name VARCHAR(500)',
    'ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS summary TEXT',
    'ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS filename VARCHAR(500)',
    'ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS content TEXT',
    'ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS type VARCHAR(50)',
    'ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS size INTEGER'
  ],

  // images 表迁移
  images: [
    'ALTER TABLE images ADD COLUMN IF NOT EXISTS size INTEGER',
    'ALTER TABLE images ALTER COLUMN image_path TYPE TEXT'
  ],

  // instruction_templates 表迁移
  instruction_templates: [
    'ALTER TABLE instruction_templates ADD COLUMN IF NOT EXISTS content_type VARCHAR(50)'
  ],

  // history 表迁移
  history: [
    'ALTER TABLE history ADD COLUMN IF NOT EXISTS title VARCHAR(500)',
    'ALTER TABLE history ADD COLUMN IF NOT EXISTS keyword VARCHAR(255)',
    'ALTER TABLE history ADD COLUMN IF NOT EXISTS audience TEXT',
    'ALTER TABLE history ADD COLUMN IF NOT EXISTS platforms TEXT[]',
    'ALTER TABLE history ADD COLUMN IF NOT EXISTS command_id INTEGER',
    'ALTER TABLE history ADD COLUMN IF NOT EXISTS local_id VARCHAR(100)'
  ],

  // drafts 表迁移
  drafts: [
    'ALTER TABLE drafts ADD COLUMN IF NOT EXISTS title VARCHAR(500)',
    'ALTER TABLE drafts ADD COLUMN IF NOT EXISTS brand VARCHAR(255)',
    'ALTER TABLE drafts ADD COLUMN IF NOT EXISTS audience TEXT',
    'ALTER TABLE drafts ADD COLUMN IF NOT EXISTS extra TEXT',
    'ALTER TABLE drafts ADD COLUMN IF NOT EXISTS selected_docs TEXT',
    'ALTER TABLE drafts ADD COLUMN IF NOT EXISTS selected_images TEXT',
    'ALTER TABLE drafts ADD COLUMN IF NOT EXISTS command_id INTEGER'
  ]
};

/**
 * 执行表迁移
 * @param {Object} pool - PostgreSQL 连接池
 * @param {string} table - 表名
 */
export async function runMigrations(pool, table) {
  if (!migrations[table]) return;

  for (const sql of migrations[table]) {
    try {
      await pool.query(sql);
      console.log(`Migration executed: ${sql}`);
    } catch (error) {
      console.log(`Migration skipped: ${sql} - ${error.message}`);
    }
  }
}
