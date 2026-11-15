import { query } from '../db.js';

export interface BlockedIpRecord {
  ip: string;
  reason: string;
  blocked_by: string | null;
  expires_at: string | null;
  created_at: string;
}

// 内存快速匹配缓存: IP -> 过期时间戳（毫秒）; null 表示永久封禁
const blockedIpsCache = new Map<string, number | null>();
let autoCleanTimer: NodeJS.Timeout | null = null;

export function normalizeIp(ip: string): string {
  if (!ip) return '';
  let clean = ip.trim();
  if (clean === '::1' || clean === '::ffff:127.0.0.1') return '127.0.0.1';
  return clean.replace(/^::ffff:/, '');
}

/**
 * 从数据库载入全部有效封禁规则至内存缓存
 */
export async function reloadBlockedIpsCache(): Promise<void> {
  try {
    const res = await query<{ ip: string; expires_at: Date | null }>(
      `SELECT ip, expires_at FROM blocked_ips WHERE expires_at IS NULL OR expires_at > NOW()`
    );
    blockedIpsCache.clear();
    for (const row of res.rows) {
      const norm = normalizeIp(row.ip);
      const exp = row.expires_at ? new Date(row.expires_at).getTime() : null;
      blockedIpsCache.set(norm, exp);
    }
  } catch (err) {
    console.warn('[IP Blocker] 无法载入 IP 拦截黑名单缓存:', err);
  }
}

/**
 * 极速判定当前 IP 是否被拦截（无 DB IO 阻塞）
 */
export function isIpBlocked(ip: string): boolean {
  if (!ip) return false;
  const norm = normalizeIp(ip);
  const expiresAt = blockedIpsCache.get(norm);
  if (expiresAt === undefined) {
    return false;
  }
  if (expiresAt === null) {
    return true; // 永久封禁
  }
  if (expiresAt > Date.now()) {
    return true; // 仍在封禁期内
  }
  // 已过期，剔除缓存
  blockedIpsCache.delete(norm);
  return false;
}

/**
 * 新增或更新 IP 拦截规则
 */
export async function blockIp(params: {
  ip: string;
  reason: string;
  blockedBy?: string | null;
  durationHours?: number | null;
}): Promise<BlockedIpRecord> {
  const norm = normalizeIp(params.ip);
  let expiresAtDate: Date | null = null;
  let expiresAtMs: number | null = null;

  if (params.durationHours && params.durationHours > 0) {
    expiresAtDate = new Date(Date.now() + params.durationHours * 3600 * 1000);
    expiresAtMs = expiresAtDate.getTime();
  }

  const sql = `
    INSERT INTO blocked_ips (ip, reason, blocked_by, expires_at, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (ip) DO UPDATE SET
      reason = EXCLUDED.reason,
      blocked_by = EXCLUDED.blocked_by,
      expires_at = EXCLUDED.expires_at,
      created_at = NOW()
    RETURNING ip, reason, blocked_by, expires_at, created_at
  `;
  const res = await query<BlockedIpRecord>(sql, [
    norm,
    params.reason,
    params.blockedBy || null,
    expiresAtDate,
  ]);
  const record = res.rows[0];

  blockedIpsCache.set(norm, expiresAtMs);
  return record;
}

/**
 * 解除指定 IP 拦截
 */
export async function unblockIp(ip: string): Promise<boolean> {
  const norm = normalizeIp(ip);
  await query('DELETE FROM blocked_ips WHERE ip = $1', [norm]);
  blockedIpsCache.delete(norm);
  return true;
}

/**
 * 获取所有被拦截的 IP 列表
 */
export async function listBlockedIps(): Promise<any[]> {
  const sql = `
    SELECT b.ip, b.reason, b.expires_at, b.created_at,
           u.email as blocked_by_email, u.nickname as blocked_by_nickname
    FROM blocked_ips b
    LEFT JOIN users u ON b.blocked_by = u.id
    ORDER BY b.created_at DESC
  `;
  const res = await query(sql);
  return res.rows;
}

/**
 * 初始化 IP 拦截器后台定时任务
 */
export function initIpBlocker(): void {
  void reloadBlockedIpsCache();
  if (autoCleanTimer) clearInterval(autoCleanTimer);
  // 每 2 分钟定期同步并从缓存清理过期项
  autoCleanTimer = setInterval(() => {
    void reloadBlockedIpsCache();
  }, 120000);
  if (autoCleanTimer.unref) {
    autoCleanTimer.unref();
  }
}
