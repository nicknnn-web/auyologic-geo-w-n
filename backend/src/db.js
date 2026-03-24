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

      -- 草稿箱（content_drafts 兼容旧名）
      CREATE TABLE IF NOT EXISTS content_drafts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        title VARCHAR(500),
        keyword VARCHAR(500),
        content TEXT,
        brand VARCHAR(200),
        platforms TEXT,
        command TEXT,
        audience TEXT,
        images TEXT,
        status VARCHAR(20) DEFAULT '草稿',
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
    // 迁移：如果旧 drafts 表存在，迁移数据并删除
    try {
      const oldTable = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'drafts'
      `);
      if (oldTable.rows.length > 0) {
        console.log('检测到旧 drafts 表，开始迁移...');
        // 新表不存在时才迁移
        const newTable = await client.query(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'content_drafts'
        `);
        if (newTable.rows.length === 0) {
          await client.query(`
            ALTER TABLE drafts RENAME TO content_drafts;
            ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS title VARCHAR(500);
            ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS brand VARCHAR(200);
            ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS command TEXT;
            ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS audience TEXT;
            ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS images TEXT;
          `);
          console.log('✅ 旧 drafts 表已迁移为 content_drafts');
        }
      }
    } catch (e) {
      console.log('迁移检查跳过:', e.message);
    }
    console.log('✅ 数据库表初始化完成');

    // 插入种子数据（如果表为空）
    try {
      // 关键词种子数据
      const kwCheck = await client.query('SELECT COUNT(*) FROM keywords WHERE user_id = $1', ['default_user']);
      if (parseInt(kwCheck.rows[0].count) === 0) {
        await client.query(`
          INSERT INTO keywords (user_id, keyword, type) VALUES
          ('default_user', 'GEO内容生成', '品牌'),
          ('default_user', 'AI写作工具', '品类'),
          ('default_user', '1475.py', '竞品'),
          ('default_user', '微信公众号运营', '场景'),
          ('default_user', '小红书种草', '场景');
        `);
        console.log('✅ 关键词种子数据已插入');
      }

      // 指令模板种子数据
      const cmdCheck = await client.query('SELECT COUNT(*) FROM commands WHERE user_id = $1', ['default_user']);
      if (parseInt(cmdCheck.rows[0].count) === 0) {
        await client.query(`
          INSERT INTO commands (user_id, name, content) VALUES
          ('default_user', 'GEO深度测评文', '请围绕{keyword}，撰写一篇GEO深度测评文章，包含行业背景、多维度对比、真实案例和总结建议，目标受众为{audience}，适合发布在{platforms}。'),
          ('default_user', '品牌软文种草', '以{keyword}为主题，撰写一篇种草软文，语气亲切自然，适合{audience}群体，通过{platforms}平台发布。'),
          ('default_user', '竞品对比分析', '针对{keyword}与同类产品，进行深度竞品对比分析，突出差异化优势，适合{audience}，发布平台：{platforms}。'),
          ('default_user', '干货知识分享', '以{keyword}为切入点，撰写一篇干货知识型文章，帮助{audience}解决实际问题，提升专业形象。');
        `);
        console.log('✅ 指令模板种子数据已插入');
      }
    } catch (e) {
      console.log('种子数据插入跳过:', e.message);
    }
    client.release();
  }
}

export default pool;
