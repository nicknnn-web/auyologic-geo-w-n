import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// 初始化数据库表test
export async function initDB() {
  const client = await pool.connect();
  try {
    // 创建用户账户表
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE,
        username VARCHAR(200),
        email VARCHAR(200),
        password_hash VARCHAR(255),
        deepseek_api_key TEXT,
        doubao_api_key TEXT,
        kimi_api_key TEXT,
        company_name VARCHAR(500),
        website VARCHAR(500),
        industry VARCHAR(200),
        description TEXT,
        target_audience TEXT,
        default_ai_model VARCHAR(50) DEFAULT 'deepseek-chat',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 创建用户设置表
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE,
        deepseek_api_key TEXT,
        doubao_api_key TEXT,
        kimi_api_key TEXT,
        default_ai_model VARCHAR(50) DEFAULT 'deepseek-chat',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 插入默认用户
    await client.query(`
      INSERT INTO users (user_id, username, deepseek_api_key, default_ai_model)
      VALUES ('default_user', '管理员', $1, 'deepseek-chat')
      ON CONFLICT (user_id) DO NOTHING
    `, [process.env.DEEPSEEK_API_KEY || '']);

    // 关键词表
    await client.query(`
      CREATE TABLE IF NOT EXISTS keywords (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        keyword VARCHAR(500),
        type VARCHAR(50) DEFAULT '01',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 扩展问题表
    await client.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        keyword_id INTEGER,
        question TEXT,
        answer TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 知识库文档
    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        title VARCHAR(500),
        content TEXT,
        file_path VARCHAR(1000),
        file_type VARCHAR(50),
        file_size INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 企业图库
    await client.query(`
      CREATE TABLE IF NOT EXISTS images (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        title VARCHAR(500),
        image_path VARCHAR(1000),
        tags TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 创作指令模板
    await client.query(`
      CREATE TABLE IF NOT EXISTS commands (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        name VARCHAR(200),
        content TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 草稿箱
    await client.query(`
      CREATE TABLE IF NOT EXISTS drafts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        keyword VARCHAR(500),
        content TEXT,
        platforms TEXT,
        status VARCHAR(20) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 自媒体账号
    await client.query(`
      CREATE TABLE IF NOT EXISTS media_accounts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        platform VARCHAR(50) NOT NULL,
        account_name VARCHAR(200),
        phone_number VARCHAR(20),
        session_state JSONB,
        auth_status VARCHAR(20) DEFAULT 'pending',
        auth_time TIMESTAMP,
        last_verified_at TIMESTAMP,
        user_agent TEXT,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // 迁移：为旧表补充新字段
    await client.query(`ALTER TABLE media_accounts ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)`).catch(() => {});
    await client.query(`ALTER TABLE media_accounts ADD COLUMN IF NOT EXISTS session_state JSONB`).catch(() => {});
    await client.query(`ALTER TABLE media_accounts ADD COLUMN IF NOT EXISTS auth_status VARCHAR(20) DEFAULT 'pending'`).catch(() => {});
    await client.query(`ALTER TABLE media_accounts ADD COLUMN IF NOT EXISTS auth_time TIMESTAMP`).catch(() => {});
    await client.query(`ALTER TABLE media_accounts ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP`).catch(() => {});
    await client.query(`ALTER TABLE media_accounts ADD COLUMN IF NOT EXISTS user_agent TEXT`).catch(() => {});
    await client.query(`ALTER TABLE media_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`).catch(() => {});
    await client.query(`ALTER TABLE media_accounts ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::TEXT`).catch(() => {});
    // 本地代理授权任务协调字段
    await client.query(`ALTER TABLE media_accounts ADD COLUMN IF NOT EXISTS auth_task_status VARCHAR(30) DEFAULT 'idle'`).catch(() => {});
    await client.query(`ALTER TABLE media_accounts ADD COLUMN IF NOT EXISTS auth_task_phone VARCHAR(20)`).catch(() => {});
    await client.query(`ALTER TABLE media_accounts ADD COLUMN IF NOT EXISTS pending_sms_code VARCHAR(10)`).catch(() => {});
    await client.query(`ALTER TABLE media_accounts ADD COLUMN IF NOT EXISTS user_confirm_complete BOOLEAN DEFAULT FALSE`).catch(() => {});
    await client.query(`ALTER TABLE media_accounts ADD COLUMN IF NOT EXISTS auth_task_started_at TIMESTAMP`).catch(() => {});

    // 投放任务
    await client.query(`
      CREATE TABLE IF NOT EXISTS publish_tasks (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        task_name VARCHAR(200),
        draft_id INTEGER,
        draft_title VARCHAR(500),
        platform VARCHAR(50),
        account_id INTEGER,
        content TEXT,
        title VARCHAR(500),
        tags TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        published_url TEXT,
        error_message TEXT,
        task_log TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // 迁移：为旧 publish_tasks 补充新字段
    await client.query(`ALTER TABLE publish_tasks ADD COLUMN IF NOT EXISTS task_name VARCHAR(200)`).catch(() => {});
    await client.query(`ALTER TABLE publish_tasks ADD COLUMN IF NOT EXISTS draft_title VARCHAR(500)`).catch(() => {});
    await client.query(`ALTER TABLE publish_tasks ADD COLUMN IF NOT EXISTS title VARCHAR(500)`).catch(() => {});
    await client.query(`ALTER TABLE publish_tasks ADD COLUMN IF NOT EXISTS tags TEXT`).catch(() => {});
    await client.query(`ALTER TABLE publish_tasks ADD COLUMN IF NOT EXISTS published_url TEXT`).catch(() => {});
    await client.query(`ALTER TABLE publish_tasks ADD COLUMN IF NOT EXISTS error_message TEXT`).catch(() => {});
    await client.query(`ALTER TABLE publish_tasks ADD COLUMN IF NOT EXISTS task_log TEXT`).catch(() => {});
    await client.query(`ALTER TABLE publish_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`).catch(() => {});
    await client.query(`ALTER TABLE publish_tasks ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::TEXT`).catch(() => {});

    // 发布记录
    await client.query(`
      CREATE TABLE IF NOT EXISTS publish_records (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        task_id INTEGER,
        draft_title VARCHAR(500),
        platform VARCHAR(50),
        account_id INTEGER,
        account_name VARCHAR(200),
        published_url TEXT,
        status VARCHAR(20) DEFAULT '已发布',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // 迁移：为旧 publish_records 补充新字段
    await client.query(`ALTER TABLE publish_records ADD COLUMN IF NOT EXISTS draft_title VARCHAR(500)`).catch(() => {});
    await client.query(`ALTER TABLE publish_records ADD COLUMN IF NOT EXISTS account_id INTEGER`).catch(() => {});
    await client.query(`ALTER TABLE publish_records ADD COLUMN IF NOT EXISTS account_name VARCHAR(200)`).catch(() => {});
    await client.query(`ALTER TABLE publish_records ADD COLUMN IF NOT EXISTS published_url TEXT`).catch(() => {});
    await client.query(`ALTER TABLE publish_records ADD COLUMN IF NOT EXISTS error_message TEXT`).catch(() => {});
    await client.query(`ALTER TABLE publish_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`).catch(() => {});
    await client.query(`ALTER TABLE publish_records ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::TEXT`).catch(() => {});

    // GEO可见度检测记录
    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_detection (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        keyword VARCHAR(500),
        platform VARCHAR(50),
        visible BOOLEAN DEFAULT FALSE,
        summary TEXT,
        score INTEGER DEFAULT 0,
        checked_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // GEO检测总报告
    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_reports (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        keyword VARCHAR(500),
        overall_score INTEGER DEFAULT 0,
        overall_grade VARCHAR(10) DEFAULT 'D',
        visible_count INTEGER DEFAULT 0,
        missing_count INTEGER DEFAULT 0,
        platform_data JSONB,
        checked_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 网站优化检测
    await client.query(`
      CREATE TABLE IF NOT EXISTS website_optimization (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        url VARCHAR(1000),
        seo_score INTEGER DEFAULT 0,
        ai_score INTEGER DEFAULT 0,
        tech_score INTEGER DEFAULT 0,
        content_score INTEGER DEFAULT 0,
        overall_score INTEGER DEFAULT 0,
        report JSONB,
        checked_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ 数据库表初始化完成');
  } finally {
    client.release();
  }
}

export default pool;
