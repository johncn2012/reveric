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

export async function initDbSchema(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS login_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          account VARCHAR(255) NOT NULL,
          ip VARCHAR(64) NOT NULL,
          ip_location VARCHAR(128),
          user_agent TEXT,
          status VARCHAR(16) NOT NULL,
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
    `);
  } catch (err) {
    console.warn('[DB Schema Init]', err);
  }
}
