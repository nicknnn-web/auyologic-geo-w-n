import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// 初始化数据库表
export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- 用户账户表
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
      );

      -- 用户设置（API密钥等）
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE,
        deepseek_api_key TEXT,
        doubao_api_key TEXT,
        kimi_api_key TEXT,
        default_ai_model VARCHAR(50) DEFAULT 'deepseek-chat',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- 确保默认用户存在
      INSERT INTO users (user_id, username, deepseek_api_key, default_ai_model)
      VALUES ('default_user', '管理员', 'sk-c8769ba486ee46d799a37a4b8e747159', 'deepseek-chat')
      ON CONFLICT (user_id) DO NOTHING;

      -- 关键词
      CREATE TABLE IF NOT EXISTS keywords (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        keyword VARCHAR(500),
        type VARCHAR(50) DEFAULT '品牌',
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- 扩展问题
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        keyword_id INTEGER,
        question TEXT,
        answer TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- 知识库文档
      CREATE TABLE IF NOT EXISTS knowledge (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        title VARCHAR(500),
        content TEXT,
        file_path VARCHAR(1000),
        file_type VARCHAR(50),
        file_size INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- 企业图库
      CREATE TABLE IF NOT EXISTS images (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        title VARCHAR(500),
        image_path VARCHAR(1000),
        tags TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- 创作指令模板
      CREATE TABLE IF NOT EXISTS commands (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        name VARCHAR(200),
        content TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- 草稿箱
      CREATE TABLE IF NOT EXISTS drafts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        keyword VARCHAR(500),
        content TEXT,
        platforms TEXT,
        status VARCHAR(20) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- 自媒体账号
      CREATE TABLE IF NOT EXISTS media_accounts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        platform VARCHAR(50),
        account_name VARCHAR(200),
        account_id VARCHAR(200),
        cookies TEXT,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- 投放任务
      CREATE TABLE IF NOT EXISTS publish_tasks (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        draft_id INTEGER,
        platform VARCHAR(50),
        account_id INTEGER,
        content TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        result TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        published_at TIMESTAMP
      );

      -- GEO可见度检测记录
      CREATE TABLE IF NOT EXISTS geo_detection (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        keyword VARCHAR(500),
        platform VARCHAR(50),
        visible BOOLEAN DEFAULT FALSE,
        summary TEXT,
        score INTEGER DEFAULT 0,
        checked_at TIMESTAMP DEFAULT NOW()
      );

      -- GEO检测总报告
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
      );

      -- 网站优化检测
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
      );
    `);
    console.log('✅ 数据库表初始化完成');
  } finally {
    client.release();
  }
}

export default pool;
