-- MetaArc (元弧) 业务主数据库初始化脚本 (PostgreSQL 16)
-- 适用域名: MetaArc.COM.CN

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. 用户主表
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(32) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(64),
    avatar_url TEXT,
    role VARCHAR(16) NOT NULL DEFAULT 'user', -- 'user' | 'admin'
    status VARCHAR(16) NOT NULL DEFAULT 'active', -- 'active' | 'suspended'
    plan VARCHAR(32) NOT NULL DEFAULT 'free', -- 'free' | 'creator' | 'pro' | 'studio'
    quota NUMERIC(12, 2) NOT NULL DEFAULT 500.00,
    total_quota NUMERIC(12, 2) NOT NULL DEFAULT 500.00,
    
    -- New-API 映射字段
    new_api_user_id INT UNIQUE,
    new_api_token_id INT UNIQUE,
    new_api_key VARCHAR(128) UNIQUE,
    
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 套餐方案字典表
CREATE TABLE IF NOT EXISTS plans (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    slug VARCHAR(32) NOT NULL UNIQUE,
    description TEXT,
    price_cents INT NOT NULL, -- 价格（单位：分）
    billing_cycle VARCHAR(16) NOT NULL DEFAULT 'monthly', -- 'monthly' | 'yearly' | 'once'
    quota_points NUMERIC(12, 2) NOT NULL, -- 包含算力点数
    storage_limit_mb INT NOT NULL DEFAULT 1024,
    max_concurrency INT NOT NULL DEFAULT 1,
    duration_days INT NOT NULL DEFAULT 30,
    features JSONB NOT NULL DEFAULT '[]',
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 用户当前订阅表
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id VARCHAR(32) NOT NULL REFERENCES plans(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 充值与购买订单表
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_no VARCHAR(64) UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id),
    plan_id VARCHAR(32) REFERENCES plans(id),
    amount_cents INT NOT NULL,
    pay_channel VARCHAR(32) NOT NULL, -- 'wechat', 'alipay', 'admin'
    pay_trade_no VARCHAR(128),
    status VARCHAR(16) NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'cancelled' | 'refunded'
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. 算力流水明细台账
CREATE TABLE IF NOT EXISTS quota_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    order_id UUID REFERENCES orders(id),
    amount NUMERIC(12, 2) NOT NULL, -- 变动额度（正数代表增加，负数代表消耗扣减）
    balance_after NUMERIC(12, 2) NOT NULL,
    type VARCHAR(32) NOT NULL, -- 'purchase', 'consumption', 'admin_grant'
    reference_id VARCHAR(128),
    remark TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. 云端媒体交付物资产表 (S3/OSS 元数据索引)
CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    project_id VARCHAR(64),
    asset_type VARCHAR(32) NOT NULL, -- 'image', 'video', 'audio', 'export'
    storage_key TEXT NOT NULL,
    cdn_url TEXT NOT NULL,
    byte_size BIGINT NOT NULL DEFAULT 0,
    mime_type VARCHAR(64),
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. 异步任务调度表
CREATE TABLE IF NOT EXISTS user_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    task_type VARCHAR(32) NOT NULL, -- 'chapter_illustrations', 'batch_dubbing', 'video_render'
    status VARCHAR(16) NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'completed' | 'failed'
    progress INT NOT NULL DEFAULT 0,
    input_payload JSONB DEFAULT '{}',
    output_payload JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 默认预设四大官方套餐
INSERT INTO plans (id, name, slug, description, price_cents, billing_cycle, quota_points, storage_limit_mb, max_concurrency, duration_days, features, sort_order)
VALUES 
    ('plan_free', '基础体验版', 'free', '注册即赠，畅享基础文字润色与入门画图体验', 0, 'monthly', 500, 500, 1, 365, '["每月 500 算力点数", "支持文字创作与轻量配图", "500MB 对象存储云端备份", "单任务并发处理"]'::jsonb, 1),
    ('plan_creator', '创作者版', 'creator', '适合独立写作者，解锁主流生图与高品质角色语音', 2900, 'monthly', 3000, 5120, 2, 30, '["3,000 算力点数 / 月", "解锁高级画质模型与全角色音色", "5GB 云端媒体对象存储", "2 任务并发生成", "优先排队调度"]'::jsonb, 2),
    ('plan_pro', '专业版 (PRO)', 'pro', '短剧策划、小说漫改与高频多模态创作首选', 9900, 'monthly', 12000, 20480, 4, 30, '["12,000 算力点数 / 月", "解锁专业视频生成与超清分镜渲染", "20GB 高速 CDN 对象存储", "4 任务高并发调度", "专属客户支持通道"]'::jsonb, 3),
    ('plan_studio', '工作室版 (STUDIO)', 'studio', '团队协作、大批量小说分镜渲染与商业化定制', 29900, 'monthly', 45000, 102400, 8, 30, '["45,000 算力点数 / 月", "尊享最高优先级并发算力池", "100GB 独享存储与自定义域名 CDN", "8 任务并发调度", "1v1 专属技术支持"]'::jsonb, 4)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    price_cents = EXCLUDED.price_cents,
    quota_points = EXCLUDED.quota_points,
    features = EXCLUDED.features;

-- 默认超级管理员账号 (初始密码: Admin@MetaArc2026)
-- 密码哈希由 bcrypt (rounds=10) 生成
INSERT INTO users (id, email, phone, password_hash, nickname, role, plan, quota, total_quota)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@metaarc.com.cn',
    '18888888888',
    '$2a$10$iZ1zL8Kk3Uf9t5P6r2G5U.e8O1M3b4N5Q6R7S8T9U0V1W2X3Y4Z5.',
    '超级管理员',
    'admin',
    'studio',
    999999.00,
    999999.00
) ON CONFLICT (email) DO NOTHING;

-- 索引构建
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_new_api_key ON users(new_api_key);
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_quota_txn_user ON quota_transactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_user_project ON media_assets(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_user_status ON user_tasks(user_id, status);
