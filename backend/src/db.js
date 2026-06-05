import pg from 'pg';
const { Pool } = pg;

// 与报告「检测时间」等业务一致：连接池创建前默认东八区，便于解析 PG 的 timestamp（无时区）与序列化 ISO
if (!process.env.TZ) process.env.TZ = 'Asia/Shanghai';

/** 每条连接建立时让 PostgreSQL 会话使用东八区，使 NOW()/DEFAULT 写入的 timestamp 与业务「中国时间」一致 */
export const PG_CONNECTION_OPTIONS = '-c timezone=Asia/Shanghai';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: PG_CONNECTION_OPTIONS,
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
        default_ai_model VARCHAR(50) DEFAULT 'deepseek-v4-flash',
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
        default_ai_model VARCHAR(50) DEFAULT 'deepseek-v4-flash',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 插入默认用户
    await client.query(`
      INSERT INTO users (user_id, username, deepseek_api_key, default_ai_model)
      VALUES ('default_user', '管理员', $1, 'deepseek-v4-flash')
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

    // —— 品牌体检任务（表名统一 geo_health_*；问题抽样 → DeepSeek → 原始 JSON + 解析文章）——
    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_health_task (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL DEFAULT 'default_user',
        keyword VARCHAR(500) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        error_text TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(
      `ALTER TABLE geo_health_task ADD COLUMN IF NOT EXISTS error_text TEXT`
    );
    await client.query(
      `ALTER TABLE geo_health_task ADD COLUMN IF NOT EXISTS connection_ids INTEGER[]`
    );
    await client.query(
      `ALTER TABLE geo_health_task ADD COLUMN IF NOT EXISTS analysis_connection_id INTEGER`
    );
    await client.query(
      `ALTER TABLE geo_health_task ADD COLUMN IF NOT EXISTS diagnostic_suggestion_overrides JSONB DEFAULT '{}'::jsonb`
    );
    await client.query(
      `ALTER TABLE geo_health_task ADD COLUMN IF NOT EXISTS ai_summary TEXT`
    );
    await client.query(
      `ALTER TABLE geo_health_task ADD COLUMN IF NOT EXISTS ai_summary_at TIMESTAMP`
    );
    await client.query(
      `ALTER TABLE geo_health_task ADD COLUMN IF NOT EXISTS ai_summary_fp VARCHAR(128)`
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_health_question (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES geo_health_task(id) ON DELETE CASCADE,
        source_question_id INTEGER,
        question TEXT NOT NULL,
        question_type VARCHAR(32) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_geo_health_question_task ON geo_health_question(task_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_geo_health_question_task_type ON geo_health_question(task_id, question_type)`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_health_answer (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES geo_health_task(id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES geo_health_question(id) ON DELETE CASCADE,
        model_name VARCHAR(64) NOT NULL,
        raw_json JSONB NOT NULL,
        valid_count INTEGER DEFAULT 0,
        error_text TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(question_id, model_name)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_geo_health_answer_task ON geo_health_answer(task_id)`);
    await client.query(
      `ALTER TABLE geo_health_answer ADD COLUMN IF NOT EXISTS connection_id INTEGER`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_health_article (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES geo_health_task(id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES geo_health_question(id) ON DELETE CASCADE,
        model_name VARCHAR(64) NOT NULL,
        platform VARCHAR(256),
        title TEXT,
        url TEXT NOT NULL,
        publish_time VARCHAR(128),
        summary TEXT,
        content_hash VARCHAR(64) NOT NULL,
        dedupe_key VARCHAR(256) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_health_article_task_dedupe ON geo_health_article(task_id, dedupe_key)`
    );
    await client.query(`CREATE INDEX IF NOT EXISTS idx_geo_health_article_task ON geo_health_article(task_id)`);
    await client.query(
      `ALTER TABLE geo_health_article ADD COLUMN IF NOT EXISTS source_category VARCHAR(32)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_geo_health_article_task_category ON geo_health_article(task_id, source_category)`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_health_source_search (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES geo_health_task(id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES geo_health_question(id) ON DELETE CASCADE,
        query TEXT NOT NULL,
        hit_count INTEGER DEFAULT 0,
        raw_json JSONB DEFAULT '{}'::jsonb,
        error_text TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(task_id, question_id)
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_geo_health_source_search_task ON geo_health_source_search(task_id)`
    );
    await client.query(
      `ALTER TABLE geo_health_source_search ADD COLUMN IF NOT EXISTS classify_done BOOLEAN DEFAULT false`
    );

    // —— 品牌体检分析结果（每条 geo_health_answer 对应一条分析）——
    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_health_analysis (
        id                  SERIAL PRIMARY KEY,
        task_id             INTEGER NOT NULL REFERENCES geo_health_task(id) ON DELETE CASCADE,
        question_id         INTEGER NOT NULL REFERENCES geo_health_question(id) ON DELETE CASCADE,
        answer_id           INTEGER NOT NULL REFERENCES geo_health_answer(id) ON DELETE CASCADE,
        source_question_id  INTEGER,
        question_type       VARCHAR(32),
        category            VARCHAR(16),
        model_name          VARCHAR(64),
        analysis_provider   VARCHAR(32),
        visibility          VARCHAR(16),
        position            VARCHAR(4),
        brand_status        VARCHAR(32),
        compare_status      VARCHAR(32),
        brand_mentioned     BOOLEAN,
        brand_rank          INTEGER,
        top_brand           VARCHAR(256),
        competitors_mentioned JSONB DEFAULT '[]',
        has_negative        BOOLEAN,
        source_type         VARCHAR(256),
        sentiment_keywords  JSONB DEFAULT '[]',
        raw_analysis_json   JSONB,
        error_text          TEXT,
        created_at          TIMESTAMP DEFAULT NOW(),
        UNIQUE(answer_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_geo_health_analysis_task ON geo_health_analysis(task_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_geo_health_analysis_question ON geo_health_analysis(question_id)`);
    await client.query(
      `ALTER TABLE geo_health_analysis ADD COLUMN IF NOT EXISTS answer_tokens JSONB DEFAULT '[]'::jsonb`
    );
    await client.query(
      `ALTER TABLE geo_health_analysis ADD COLUMN IF NOT EXISTS connection_id INTEGER`
    );

    // —— 情感词库（品牌体检分析 Prompt 注入；三档：正面 / 中性 / 负面）——
    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_sentiment_lexicon (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL DEFAULT 'default_user',
        keyword VARCHAR(128) NOT NULL,
        tier VARCHAR(16) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT chk_geo_sentiment_lexicon_tier CHECK (tier IN ('positive', 'neutral', 'negative'))
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_geo_sentiment_lexicon_user ON geo_sentiment_lexicon(user_id)`
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_sentiment_lexicon_user_kw ON geo_sentiment_lexicon (user_id, lower(keyword))`
    );

    // 品牌体检词云词条（按 task 入库；AI 生成 + 管理页编辑；报告词云只读此表）
    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_health_word_cloud_item (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL DEFAULT 'default_user',
        task_id INTEGER NOT NULL REFERENCES geo_health_task(id) ON DELETE CASCADE,
        keyword VARCHAR(200) NOT NULL,
        phrase_norm VARCHAR(200) NOT NULL,
        tier VARCHAR(20) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0,
        hit_count INTEGER NOT NULL DEFAULT 1,
        source VARCHAR(16) NOT NULL DEFAULT 'ai',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT chk_geo_health_wc_tier CHECK (tier IN ('positive', 'neutral', 'negative')),
        CONSTRAINT chk_geo_health_wc_source CHECK (source IN ('ai', 'user'))
      )
    `);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_health_wc_task_tier_norm
       ON geo_health_word_cloud_item (task_id, tier, phrase_norm)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_geo_health_wc_task ON geo_health_word_cloud_item(task_id)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_geo_health_wc_user_task ON geo_health_word_cloud_item(user_id, task_id)`
    );
    await client.query(`ALTER TABLE geo_health_word_cloud_item ADD COLUMN IF NOT EXISTS parent_id INTEGER`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_geo_health_wc_parent ON geo_health_word_cloud_item(parent_id)`
    );
    await client.query(`
      DO $fk$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_geo_health_wc_parent'
        ) THEN
          ALTER TABLE geo_health_word_cloud_item
            ADD CONSTRAINT fk_geo_health_wc_parent
            FOREIGN KEY (parent_id) REFERENCES geo_health_word_cloud_item(id) ON DELETE CASCADE;
        END IF;
      END
      $fk$;
    `);

    // 品牌体检报告快照（整份 JSON + 词云数组；分析/文章/词库变更后指纹失效）
    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_task_cache (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES geo_health_task(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL,
        analysis_fingerprint TEXT NOT NULL,
        article_fingerprint TEXT NOT NULL,
        lexicon_fingerprint TEXT NOT NULL,
        report_payload JSONB NOT NULL,
        sentiment_word_cloud JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_geo_task_cache_task UNIQUE (task_id)
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_geo_task_cache_user_task ON geo_task_cache(user_id, task_id)`
    );

    // 默认企业用户情感词种子（每档 20 条；仅在该用户尚无词库时写入，避免重复 init 叠加）
    const { rows: seedCnt } = await client.query(
      `SELECT COUNT(*)::int AS c FROM geo_sentiment_lexicon WHERE user_id = 'default_user'`
    );
    // —— 大模型接入（API Key 密文；国内 + ChatGPT/Gemini/Claude + OpenAI 兼容自定义）——
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_provider_connection (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL DEFAULT 'default_user',
        vendor_name VARCHAR(200) NOT NULL,
        provider_key VARCHAR(32) NOT NULL,
        base_url_override VARCHAR(1024),
        api_key_cipher TEXT NOT NULL,
        key_last4 VARCHAR(4),
        default_model VARCHAR(128),
        enabled BOOLEAN NOT NULL DEFAULT true,
        last_test_status VARCHAR(16),
        last_test_at TIMESTAMP,
        last_test_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_provider_connection_user ON ai_provider_connection(user_id)`
    );
    await client.query(
      `ALTER TABLE ai_provider_connection ADD COLUMN IF NOT EXISTS logo_relpath VARCHAR(512)`
    );
    await client.query(
      `ALTER TABLE ai_provider_connection ADD COLUMN IF NOT EXISTS logo_bg_color VARCHAR(40)`
    );
    await client.query(
      `ALTER TABLE ai_provider_connection ALTER COLUMN logo_relpath TYPE VARCHAR(2048)`
    ).catch(() => {});

    if (seedCnt[0].c === 0) {
      await client.query(`
        INSERT INTO geo_sentiment_lexicon (user_id, keyword, tier, enabled, sort_order) VALUES
        ('default_user','领先','positive',true,0),('default_user','优质','positive',true,1),('default_user','口碑好','positive',true,2),('default_user','值得信赖','positive',true,3),('default_user','出色','positive',true,4),('default_user','推荐','positive',true,5),('default_user','稳健','positive',true,6),('default_user','专业','positive',true,7),('default_user','创新','positive',true,8),('default_user','性价比高','positive',true,9),('default_user','体验好','positive',true,10),('default_user','服务周到','positive',true,11),('default_user','行业标杆','positive',true,12),('default_user','实力强','positive',true,13),('default_user','好评','positive',true,14),('default_user','可靠','positive',true,15),('default_user','亮点突出','positive',true,16),('default_user','表现优秀','positive',true,17),('default_user','备受认可','positive',true,18),('default_user','优势明显','positive',true,19),
        ('default_user','一般','neutral',true,0),('default_user','尚可','neutral',true,1),('default_user','中规中矩','neutral',true,2),('default_user','略有差异','neutral',true,3),('default_user','看场景','neutral',true,4),('default_user','各有特点','neutral',true,5),('default_user','看需求','neutral',true,6),('default_user','选择多','neutral',true,7),('default_user','价差大','neutral',true,8),('default_user','配置多样','neutral',true,9),('default_user','版本较多','neutral',true,10),('default_user','地区差异','neutral',true,11),('default_user','待定','neutral',true,12),('default_user','信息有限','neutral',true,13),('default_user','需核实','neutral',true,14),('default_user','因人制宜','neutral',true,15),('default_user','选项丰富','neutral',true,16),('default_user','没有绝对','neutral',true,17),('default_user','持平','neutral',true,18),('default_user','了解不多','neutral',true,19),
        ('default_user','差评','negative',true,0),('default_user','避雷','negative',true,1),('default_user','踩坑','negative',true,2),('default_user','翻车','negative',true,3),('default_user','风险','negative',true,4),('default_user','投诉','negative',true,5),('default_user','问题较多','negative',true,6),('default_user','逊色','negative',true,7),('default_user','不推荐','negative',true,8),('default_user','谨慎','negative',true,9),('default_user','争议','negative',true,10),('default_user','短板','negative',true,11),('default_user','噪音大','negative',true,12),('default_user','售后差','negative',true,13),('default_user','缩水','negative',true,14),('default_user','槽点','negative',true,15),('default_user','假货','negative',true,16),('default_user','隐患','negative',true,17),('default_user','不佳','negative',true,18),('default_user','退款难','negative',true,19)
      `);
      console.log('✅ 已为 default_user 写入情感词种子（正面/中性/负面各 20 条）');
    }

    console.log('✅ 数据库表初始化完成');
  } finally {
    client.release();
  }
}

export default pool;
