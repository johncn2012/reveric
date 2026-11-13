// 职责: 记录管理员变更审计，并在同一事务里提交变更与审计。
// 关联文件:
// server/metaarc/src/routes/admin.ts
// server/metaarc/src/db.ts
// server/metaarc/migrations/003_session_and_audit.sql

import type { PoolClient } from 'pg';

import { pool } from '../db.js';

const REDACTED_KEYS = ['password', 'password_hash', 'new_api_key', 'temporary_password', 'newPassword', 'apiKey'];

export type AuditEntry = {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  beforeValue?: unknown;
  afterValue?: unknown;
};

export function cleanReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const reason = value.trim().replace(/\s+/g, ' ');
  if (reason.length < 2 || reason.length > 500) return null;
  return reason;
}

function redact(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    copy[key] = REDACTED_KEYS.includes(key) ? '[redacted]' : item;
  }
  return copy;
}

export async function insertAudit(entry: AuditEntry, client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, reason, before_value, after_value)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      entry.actorId,
      entry.action,
      entry.targetType,
      entry.targetId ?? null,
      entry.reason ?? null,
      JSON.stringify(redact(entry.beforeValue)),
      JSON.stringify(redact(entry.afterValue)),
    ],
  );
}

export async function runMutation<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // 回滚失败时保留原始错误。
    }
    throw err;
  } finally {
    client.release();
  }
}
