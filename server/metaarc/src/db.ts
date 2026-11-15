import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://metaarc_user:YourSecurePassword123@localhost:5432/metaarc_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
});

export async function query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DB Query]', { text, duration: `${duration}ms`, rows: res.rowCount });
  }
  return res;
}

const SCHEMA_LOCK = 714213;

export async function initDbSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_LOCK]);
    const statements = [
      `CREATE TABLE IF NOT EXISTS login_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          account VARCHAR(255) NOT NULL,
          ip VARCHAR(64) NOT NULL,
          ip_location VARCHAR(128),
          user_agent TEXT,
          status VARCHAR(16) NOT NULL,
          fail_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_login_logs_user_created ON login_logs(user_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_login_logs_ip ON login_logs(ip)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(64)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_location VARCHAR(128)`,
      `ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS prompt TEXT`,
      `ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS client_ip VARCHAR(64)`,
      `ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS duration_ms INT`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 0`,
      `CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          actor_id UUID,
          action VARCHAR(64) NOT NULL,
          target_type VARCHAR(32) NOT NULL,
          target_id TEXT,
          reason TEXT,
          before_value JSONB,
          after_value JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_logs(target_type, target_id)`,
      `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_quota_txn_created_at ON quota_transactions(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_quota_txn_user_type ON quota_transactions(user_id, type, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_user_tasks_created_at ON user_tasks(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS blocked_ips (
          ip VARCHAR(64) PRIMARY KEY,
          reason TEXT NOT NULL,
          blocked_by UUID REFERENCES users(id) ON DELETE SET NULL,
          expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_blocked_ips_expires ON blocked_ips(expires_at)`,
    ];
    const failures: unknown[] = [];
    for (const statement of statements) {
      try {
        await client.query(statement);
      } catch (err) {
        failures.push(err);
        console.warn('[DB Schema Init]', err);
      }
    }
    if (process.env.NODE_ENV === 'test' && failures.length > 0) {
      throw failures[0];
    }
  } catch (err) {
    console.warn('[DB Schema Init]', err);
    if (process.env.NODE_ENV === 'test') throw err;
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_LOCK]);
    } catch {
      // 解锁失败时连接释放后会话锁会一起消失。
    }
    client.release();
  }
}
