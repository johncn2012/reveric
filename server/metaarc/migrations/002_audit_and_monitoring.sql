-- 002: 审计日志与任务监控增强

CREATE TABLE IF NOT EXISTS login_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account VARCHAR(255) NOT NULL,
    ip VARCHAR(64) NOT NULL,
    ip_location VARCHAR(128),
    user_agent TEXT,
    status VARCHAR(16) NOT NULL, -- 'success' | 'failed'
    fail_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_logs_user_created ON login_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_ip ON login_logs(ip);

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_location VARCHAR(128);

ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS prompt TEXT;
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS client_ip VARCHAR(64);
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS duration_ms INT;
