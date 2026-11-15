-- 004: IP 安全防护策略与访问控制黑名单表 (Denylist)

CREATE TABLE IF NOT EXISTS blocked_ips (
    ip VARCHAR(64) PRIMARY KEY,
    reason TEXT NOT NULL,
    blocked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ, -- NULL 表示永久封禁
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocked_ips_expires ON blocked_ips(expires_at);
