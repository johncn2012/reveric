import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { query, pool } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { NewApiConnector } from '../services/new_api_connector.js';
import { cleanReason, insertAudit, runMutation } from '../services/admin_audit.js';
import { blockIp, unblockIp, listBlockedIps, normalizeIp } from '../services/ip_blocker.js';

export const adminRouter = Router();
const newApi = new NewApiConnector();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reasonRequired(res: Response) {
  return res.status(400).json({ error: 'reason_required', message: '请填写至少 2 个字的变更原因' });
}

function actorId(req: Request): string {
  return req.user?.userId || '';
}

function sameUser(left?: string, right?: string): boolean {
  return !!left && !!right && left.toLowerCase() === right.toLowerCase();
}

// 所有接口需超管权限
adminRouter.use(requireAdmin);

// 1. 全局运营大盘概览
adminRouter.get('/admin/overview', async (_req: Request, res: Response) => {
  try {
    const userCountRes = await query('SELECT count(*) FROM users');
    const todayUserRes = await query("SELECT count(*) FROM users WHERE created_at >= CURRENT_DATE");
    const todayRevenueRes = await query("SELECT COALESCE(SUM(amount_cents), 0) as total FROM orders WHERE status = 'paid' AND paid_at >= CURRENT_DATE");
    const totalRevenueRes = await query("SELECT COALESCE(SUM(amount_cents), 0) as total FROM orders WHERE status = 'paid'");
    const activeTasksRes = await query("SELECT count(*) FROM user_tasks WHERE status IN ('pending', 'running')");
    const totalOrdersRes = await query("SELECT count(*) as total, count(*) FILTER (WHERE status = 'paid') as paid_count FROM orders");
    const mediaStatsRes = await query("SELECT count(*) as total_count, COALESCE(SUM(byte_size), 0) as total_bytes FROM media_assets");

    return res.json({
      success: true,
      data: {
        total_users: parseInt(userCountRes.rows[0].count, 10),
        today_new_users: parseInt(todayUserRes.rows[0].count, 10),
        today_revenue_yuan: (parseInt(todayRevenueRes.rows[0].total, 10) / 100).toFixed(2),
        total_revenue_yuan: (parseInt(totalRevenueRes.rows[0].total, 10) / 100).toFixed(2),
        active_tasks: parseInt(activeTasksRes.rows[0].count, 10),
        total_orders: parseInt(totalOrdersRes.rows[0].total, 10) || 0,
        paid_orders: parseInt(totalOrdersRes.rows[0].paid_count, 10) || 0,
        total_media_count: parseInt(mediaStatsRes.rows[0].total_count, 10) || 0,
        total_media_bytes: parseInt(mediaStatsRes.rows[0].total_bytes, 10) || 0,
      },
    });
  } catch (err: any) {
    console.error('[Admin Overview Error]', err);
    return res.status(500).json({ error: 'server_error', message: '大盘数据加载失败' });
  }
});

// 2. 用户管理列表
adminRouter.get('/admin/users', async (req: Request, res: Response) => {
  try {
    const { keyword, plan, status, filter, startDate, endDate, limit = '50', offset = '0', page, pageSize } = req.query;
    let sql = 'SELECT id, email, phone, nickname, plan, quota, total_quota, role, status, new_api_key, new_api_user_id, last_login_at, last_login_ip, last_login_location, expires_at, created_at, updated_at FROM users';
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (keyword && typeof keyword === 'string' && keyword.trim()) {
      params.push(`%${keyword.trim()}%`);
      whereClauses.push(`(email ILIKE $${params.length} OR phone ILIKE $${params.length} OR nickname ILIKE $${params.length} OR last_login_ip ILIKE $${params.length} OR last_login_location ILIKE $${params.length})`);
    }

    if (plan && typeof plan === 'string' && plan.trim()) {
      params.push(plan.trim());
      whereClauses.push(`plan = $${params.length}`);
    }

    if (status && typeof status === 'string' && status.trim()) {
      params.push(status.trim());
      whereClauses.push(`status = $${params.length}`);
    }

    if (filter === 'active_24h') {
      whereClauses.push(`last_login_at >= NOW() - INTERVAL '24 hours'`);
    } else if (filter === 'never_logged_in') {
      whereClauses.push(`last_login_at IS NULL`);
    }

    if (startDate && typeof startDate === 'string' && startDate.trim()) {
      params.push(startDate.trim());
      whereClauses.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (endDate && typeof endDate === 'string' && endDate.trim()) {
      params.push(endDate.trim());
      whereClauses.push(`created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const countSql = `SELECT count(*) FROM users ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}`;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const parsedLimit = Math.max(1, Math.min(200, parseInt((pageSize || limit) as string, 10) || 50));
    const curPage = Math.max(1, parseInt(page as string, 10) || (Math.floor(parseInt(offset as string, 10) || 0) / parsedLimit + 1));
    const parsedOffset = page ? (curPage - 1) * parsedLimit : Math.max(0, parseInt(offset as string, 10) || 0);

    params.push(parsedLimit);
    params.push(parsedOffset);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: curPage,
        pageSize: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit) || 1,
      },
    });
  } catch (err: any) {
    console.error('[Admin Users Error]', err);
    return res.status(500).json({ error: 'server_error', message: '用户列表获取失败' });
  }
});

// 2.1 管理员新建创作者账号
adminRouter.post('/admin/users/create', async (req: Request, res: Response) => {
  try {
    const { email, password, nickname, phone, plan = 'free', quota = 500, role = 'user' } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const cleanPassword = typeof password === 'string' ? password.trim() : '';
    const cleanNickname = typeof nickname === 'string' ? nickname.trim() : '';
    const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
    const cleanPlan = ['free', 'creator', 'pro', 'studio'].includes(plan) ? plan : 'free';
    const cleanRole = ['user', 'admin'].includes(role) ? role : 'user';
    const initQuota = Math.max(0, parseFloat(quota) || 500);

    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);
    if (!cleanEmail || cleanPassword.length < 6) {
      return res.status(400).json({ error: 'invalid_fields', message: '请输入有效邮箱和至少 6 位初始密码' });
    }

    const checkSql = 'SELECT id FROM users WHERE email = $1' + (cleanPhone ? ' OR phone = $2' : '') + ' LIMIT 1';
    const checkParams = cleanPhone ? [cleanEmail, cleanPhone] : [cleanEmail];
    const exists = await query(checkSql, checkParams);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'conflict', message: '该邮箱或手机号已被占用' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(cleanPassword, salt);
    const initialLocalKey = 'sk-metaarc-' + crypto.randomBytes(16).toString('hex');

    const newUser = await runMutation(async (client) => {
      const inserted = await client.query(
        `INSERT INTO users (email, phone, password_hash, nickname, role, status, plan, quota, total_quota, new_api_key)
         VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9)
         RETURNING id, email, phone, nickname, role, status, plan, quota, total_quota, new_api_key, created_at`,
        [cleanEmail, cleanPhone || null, hash, cleanNickname || null, cleanRole, cleanPlan, initQuota, initQuota, initialLocalKey],
      );
      const created = inserted.rows[0];
      if (initQuota > 0) {
        await client.query(
          `INSERT INTO quota_transactions (user_id, amount, balance_after, type, remark)
           VALUES ($1, $2, $3, 'admin_grant', $4)`,
          [created.id, initQuota, initQuota, '管理员新建账号初始配额'],
        );
      }
      await insertAudit({
        actorId: actorId(req),
        action: 'create_user',
        targetType: 'user',
        targetId: created.id,
        reason,
        beforeValue: null,
        afterValue: { email: created.email, role: created.role, plan: created.plan, quota: initQuota },
      }, client);
      return created;
    });

    // 联动 New-API: 自动化创建 New-API 账号并签发专属 Token 与配额充值
    try {
      const provision = await newApi.provisionUserAccount({
        id: newUser.id,
        email: newUser.email,
        phone: newUser.phone,
        nickname: newUser.nickname,
      });
      const newApiUserId = provision.user.id;
      const genuineApiKey = provision.token.key;

      if (initQuota > 0) {
        await newApi.topUpUserQuota({
          newApiUserId,
          metaarcPoints: initQuota,
          remark: '管理员建号初始算力',
        });
      }

      await query(
        'UPDATE users SET new_api_user_id = $1, new_api_key = $2, updated_at = NOW() WHERE id = $3',
        [newApiUserId, genuineApiKey, newUser.id]
      );
      newUser.new_api_user_id = newApiUserId;
      newUser.new_api_key = genuineApiKey;
    } catch (newApiErr: any) {
      console.warn('[Admin Create User] New-API 自动接入异常（回退本地密钥）:', newApiErr.message);
    }

    return res.status(201).json({ success: true, user: newUser });
  } catch (err: any) {
    console.error('[Admin Create User Error]', err);
    return res.status(500).json({ error: 'server_error', message: '创建用户失败' });
  }
});

// 2.2 管理员更新创作者基本资料（昵称、手机、邮箱）
adminRouter.post('/admin/users/:id/update-profile', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '用户 ID 格式不正确' });
    }
    const { nickname, phone, email } = req.body;
    const cleanNickname = typeof nickname === 'string' ? nickname.trim() : undefined;
    const cleanPhone = typeof phone === 'string' ? phone.trim() : undefined;
    const cleanEmail = typeof email === 'string' ? email.trim() : undefined;

    if (cleanEmail || cleanPhone) {
      const dupRes = await query(
        `SELECT id FROM users WHERE (email = $1 OR (phone IS NOT NULL AND phone = $2)) AND id != $3 LIMIT 1`,
        [cleanEmail || '', cleanPhone || '', id]
      );
      if (dupRes.rows.length > 0) {
        return res.status(409).json({ error: 'conflict', message: '更新的邮箱或手机号已被占用' });
      }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (cleanNickname !== undefined) {
      params.push(cleanNickname);
      updates.push(`nickname = $${params.length}`);
    }
    if (cleanPhone !== undefined) {
      params.push(cleanPhone || null);
      updates.push(`phone = $${params.length}`);
    }
    if (cleanEmail !== undefined && cleanEmail) {
      params.push(cleanEmail);
      updates.push(`email = $${params.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'no_changes', message: '没有需要更新的字段' });
    }

    updates.push('updated_at = NOW()');
    params.push(id);
    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING id, email, phone, nickname, role, status, plan, quota`;
    const result = await query(sql, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '用户不存在' });
    }
    return res.json({ success: true, user: result.rows[0] });
  } catch (err: any) {
    console.error('[Admin Update User Profile Error]', err);
    return res.status(500).json({ error: 'server_error', message: '更新用户信息失败' });
  }
});

// 2.3 管理员变更用户权限（设为管理员 / 取消管理员）
adminRouter.post('/admin/users/:id/set-role', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '用户 ID 格式不正确' });
    }
    const { role } = req.body;
    if (role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: 'invalid_role', message: '角色只能为 admin 或 user' });
    }
    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);

    const currentAdminId = req.user?.userId;
    if (sameUser(currentAdminId, id) && role === 'user') {
      return res.status(400).json({ error: 'forbidden', message: '不能降级当前登录管理员自身' });
    }

    const user = await runMutation(async (client) => {
      const before = await client.query('SELECT id, email, role FROM users WHERE id = $1 FOR UPDATE', [id]);
      if (before.rows.length === 0) {
        const missing = new Error('not_found');
        (missing as { status?: number }).status = 404;
        throw missing;
      }
      const updated = await client.query(
        'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, role',
        [role, id],
      );
      await insertAudit({
        actorId: actorId(req),
        action: 'set_role',
        targetType: 'user',
        targetId: id,
        reason,
        beforeValue: { role: before.rows[0].role },
        afterValue: { role: updated.rows[0].role },
      }, client);
      return updated.rows[0];
    });
    return res.json({ success: true, user });
  } catch (err: any) {
    if (err?.status === 404) {
      return res.status(404).json({ error: 'not_found', message: '用户不存在' });
    }
    console.error('[Admin Set Role Error]', err);
    return res.status(500).json({ error: 'server_error', message: '变更角色失败' });
  }
});

// 2.4 管理员为用户轮换重置算力 Key
adminRouter.post('/admin/users/:id/reset-api-key', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '用户 ID 格式不正确' });
    }
    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);

    const targetUserRes = await query('SELECT id, new_api_user_id, email, phone FROM users WHERE id = $1', [id]);
    if (targetUserRes.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '用户不存在' });
    }
    const targetUser = targetUserRes.rows[0];

    let newApiKey = 'sk-metaarc-' + crypto.randomBytes(16).toString('hex');
    if (targetUser.new_api_user_id) {
      try {
        const token = await newApi.createTokenForUser({
          userId: targetUser.new_api_user_id,
          tokenName: `MetaArc Client Key (Admin Reset ${Date.now()})`,
        });
        if (token && token.key) {
          newApiKey = token.key;
        }
      } catch (tokenErr: any) {
        console.warn(`[Admin Reset Key] New-API 重新发 Token 异常，回退本地生成:`, tokenErr.message);
      }
    }

    const updated = await runMutation(async (client) => {
      const result = await client.query(
        'UPDATE users SET new_api_key = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email',
        [newApiKey, id],
      );
      if (result.rows.length === 0) {
        const missing = new Error('not_found');
        (missing as { status?: number }).status = 404;
        throw missing;
      }
      await insertAudit({
        actorId: actorId(req),
        action: 'reset_api_key',
        targetType: 'user',
        targetId: id,
        reason,
        beforeValue: null,
        afterValue: { new_api_key: '[redacted]' },
      }, client);
      return result.rows[0];
    });
    return res.json({ success: true, apiKey: newApiKey, user: updated });
  } catch (err: any) {
    if (err?.status === 404) {
      return res.status(404).json({ error: 'not_found', message: '用户不存在' });
    }
    console.error('[Admin Reset User API Key Error]', err);
    return res.status(500).json({ error: 'server_error', message: '重置算力Key失败' });
  }
});

// 2.5 管理员批量操作用户（批量封禁、批量解封、批量调账、批量设套餐）
adminRouter.post('/admin/users/batch', async (req: Request, res: Response) => {
  try {
    const { userIds, action, amount, status, plan } = req.body;
    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'invalid_input', message: '请提供要批量操作的用户 ID 列表' });
    }
    const validIds = userIds.filter((id: string) => UUID_REGEX.test(id));
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'invalid_input', message: '未包含有效的用户 ID' });
    }

    if (action === 'set_status') {
      if (status !== 'active' && status !== 'suspended') {
        return res.status(400).json({ error: 'invalid_status', message: '状态只能为 active 或 suspended' });
      }
      if (status === 'suspended' && validIds.some((id: string) => sameUser(id, actorId(req)))) {
        return res.status(400).json({ error: 'forbidden', message: '不能封禁当前登录管理员自身' });
      }
      await runMutation(async (client) => {
        const before = await client.query('SELECT id, status FROM users WHERE id = ANY($1::uuid[])', [validIds]);
        await client.query(`UPDATE users SET status = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])`, [status, validIds]);
        await insertAudit({
          actorId: actorId(req),
          action: 'batch_set_status',
          targetType: 'user',
          targetId: validIds.join(','),
          reason,
          beforeValue: { users: before.rows },
          afterValue: { status },
        }, client);
      });
      return res.json({ success: true, updatedCount: validIds.length });
    }

    if (action === 'set_plan') {
      if (!['free', 'creator', 'pro', 'studio'].includes(plan)) {
        return res.status(400).json({ error: 'invalid_plan', message: '无效的套餐类型' });
      }
      await runMutation(async (client) => {
        const before = await client.query('SELECT id, plan FROM users WHERE id = ANY($1::uuid[])', [validIds]);
        await client.query(`UPDATE users SET plan = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])`, [plan, validIds]);
        await insertAudit({
          actorId: actorId(req),
          action: 'batch_set_plan',
          targetType: 'user',
          targetId: validIds.join(','),
          reason,
          beforeValue: { users: before.rows },
          afterValue: { plan },
        }, client);
      });
      return res.json({ success: true, updatedCount: validIds.length });
    }

    if (action === 'adjust_quota') {
      const delta = parseFloat(amount);
      if (!Number.isFinite(delta) || delta === 0) {
        return res.status(400).json({ error: 'invalid_amount', message: '请输入有效的调账点数' });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const uid of validIds) {
          const uRes = await client.query('SELECT quota FROM users WHERE id = $1 FOR UPDATE', [uid]);
          if (uRes.rows.length > 0) {
            const cur = parseFloat(uRes.rows[0].quota);
            const nxt = Math.max(0, cur + delta);
            await client.query('UPDATE users SET quota = $1, updated_at = NOW() WHERE id = $2', [nxt, uid]);
            await client.query(
              `INSERT INTO quota_transactions (user_id, amount, balance_after, type, remark)
               VALUES ($1, $2, $3, 'admin_grant', $4)`,
              [uid, delta, nxt, `批量管理员调账：${reason}`]
            );
          }
        }
        await insertAudit({
          actorId: actorId(req),
          action: 'batch_adjust_quota',
          targetType: 'user',
          targetId: validIds.join(','),
          reason,
          beforeValue: null,
          afterValue: { amount: delta },
        }, client);
        await client.query('COMMIT');

        // 异步同步到 New-API
        const affectedUsers = await pool.query(
          'SELECT id, new_api_user_id FROM users WHERE id = ANY($1::uuid[]) AND new_api_user_id IS NOT NULL',
          [validIds]
        );
        for (const u of affectedUsers.rows) {
          try {
            await newApi.topUpUserQuota({
              newApiUserId: u.new_api_user_id,
              metaarcPoints: delta,
              remark: `批量管理员调账：${reason}`,
            });
          } catch (syncErr: any) {
            console.error(`[Admin Batch Sync New-API Failed] User ${u.id}:`, syncErr.message);
          }
        }

        return res.json({ success: true, updatedCount: validIds.length });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    return res.status(400).json({ error: 'unknown_action', message: '未知的批量操作动作' });
  } catch (err: any) {
    console.error('[Admin Batch Users Error]', err);
    return res.status(500).json({ error: 'server_error', message: '批量操作失败' });
  }
});

// 3. 人工调账（加点 / 扣点）
adminRouter.post('/admin/users/:id/adjust-quota', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    if (!UUID_REGEX.test(targetUserId)) {
      return res.status(400).json({ error: 'invalid_user_id', message: '用户ID格式无效' });
    }

    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);
    const { amount } = req.body;

    if (amount === undefined || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'invalid_amount', message: '必须指定有效调账金额' });
    }

    const delta = parseFloat(amount);
    if (!Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ error: 'invalid_amount', message: '必须指定有效调账金额' });
    }
    const updatedUser = await runMutation(async (client) => {
      const before = await client.query('SELECT id, quota, total_quota, new_api_user_id FROM users WHERE id = $1 FOR UPDATE', [targetUserId]);
      if (before.rows.length === 0) {
        const missing = new Error('not_found');
        (missing as { status?: number }).status = 404;
        throw missing;
      }
      const userRes = await client.query(
        'UPDATE users SET quota = GREATEST(0, quota + $1), total_quota = total_quota + GREATEST(0, $1), updated_at = NOW() WHERE id = $2 RETURNING *',
        [delta, targetUserId],
      );
      const nextUser = userRes.rows[0];
      await client.query(
        `INSERT INTO quota_transactions (user_id, amount, balance_after, type, remark)
         VALUES ($1, $2, $3, 'admin_grant', $4)`,
        [targetUserId, delta, nextUser.quota, `管理员调账：${reason}`],
      );
      await insertAudit({
        actorId: actorId(req),
        action: 'adjust_quota',
        targetType: 'user',
        targetId: targetUserId,
        reason,
        beforeValue: { quota: before.rows[0].quota },
        afterValue: { quota: nextUser.quota, amount: delta },
      }, client);
      return nextUser;
    });

    // 同步到 New-API (支持正向加点与负向扣减)
    if (updatedUser.new_api_user_id && delta !== 0) {
      try {
        await newApi.topUpUserQuota({
          newApiUserId: updatedUser.new_api_user_id,
          metaarcPoints: delta,
          remark: `管理员手工调账：${reason || ''}`,
        });
      } catch (e: any) {
        console.error('[Admin Sync New-API Error]', e.message);
      }
    }

    return res.json({
      success: true,
      message: '调账成功',
      user: {
        id: updatedUser.id,
        quota: parseFloat(updatedUser.quota),
        total_quota: parseFloat(updatedUser.total_quota),
      },
    });
  } catch (err: any) {
    if (err?.status === 404) {
      return res.status(404).json({ error: 'user_not_found', message: '目标用户不存在' });
    }
    console.error('[Admin Adjust Quota Error]', err);
    return res.status(500).json({ error: 'server_error', message: '调账失败' });
  }
});

// 4. 管理员设置用户套餐
adminRouter.post('/admin/users/:id/set-plan', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    if (!UUID_REGEX.test(targetUserId)) {
      return res.status(400).json({ error: 'invalid_user_id', message: '用户ID格式无效' });
    }

    const { plan } = req.body;
    const ALLOWED_PLANS = ['free', 'creator', 'pro', 'studio'];
    if (!plan || !ALLOWED_PLANS.includes(plan)) {
      return res.status(400).json({
        error: 'invalid_plan',
        message: `套餐标识无效，允许值: ${ALLOWED_PLANS.join(', ')}`,
      });
    }
    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);

    const user = await runMutation(async (client) => {
      const before = await client.query('SELECT id, plan FROM users WHERE id = $1 FOR UPDATE', [targetUserId]);
      if (before.rows.length === 0) {
        const missing = new Error('not_found');
        (missing as { status?: number }).status = 404;
        throw missing;
      }
      const userRes = await client.query(
        'UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, phone, nickname, plan, quota, total_quota, role',
        [plan, targetUserId],
      );
      await insertAudit({
        actorId: actorId(req),
        action: 'set_plan',
        targetType: 'user',
        targetId: targetUserId,
        reason,
        beforeValue: { plan: before.rows[0].plan },
        afterValue: { plan },
      }, client);
      return userRes.rows[0];
    });

    return res.json({
      success: true,
      message: '套餐变更成功',
      user,
    });
  } catch (err: any) {
    if (err?.status === 404) {
      return res.status(404).json({ error: 'user_not_found', message: '目标用户不存在' });
    }
    console.error('[Admin Set Plan Error]', err);
    return res.status(500).json({ error: 'server_error', message: '套餐设置失败' });
  }
});

// 5. 全站订单列表（带搜索与标准分页）
adminRouter.get('/admin/orders', async (req: Request, res: Response) => {
  try {
    const { status, userId, keyword, startDate, endDate, limit = '50', offset = '0', page, pageSize } = req.query;
    let sql = `
      SELECT o.id, o.order_no, o.user_id, o.plan_id, o.amount_cents, o.pay_channel, o.pay_trade_no,
             o.status, o.created_at, o.paid_at,
             u.email, u.phone, u.nickname, p.name as plan_name, p.slug as plan_slug, p.quota_points
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN plans p ON o.plan_id = p.id
    `;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (keyword && typeof keyword === 'string' && keyword.trim()) {
      params.push(`%${keyword.trim()}%`);
      whereClauses.push(`(o.order_no ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.nickname ILIKE $${params.length} OR o.pay_trade_no ILIKE $${params.length})`);
    }

    if (status && typeof status === 'string' && status.trim()) {
      params.push(status.trim());
      whereClauses.push(`o.status = $${params.length}`);
    }
    if (userId && typeof userId === 'string' && UUID_REGEX.test(userId.trim())) {
      params.push(userId.trim());
      whereClauses.push(`o.user_id = $${params.length}`);
    }
    if (startDate && typeof startDate === 'string' && startDate.trim()) {
      params.push(startDate.trim());
      whereClauses.push(`o.created_at >= $${params.length}::timestamptz`);
    }
    if (endDate && typeof endDate === 'string' && endDate.trim()) {
      params.push(endDate.trim());
      whereClauses.push(`o.created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const countSql = `
      SELECT count(*) FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN plans p ON o.plan_id = p.id
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
    `;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const parsedLimit = Math.max(1, Math.min(200, parseInt((pageSize || limit) as string, 10) || 50));
    const curPage = Math.max(1, parseInt(page as string, 10) || (Math.floor(parseInt(offset as string, 10) || 0) / parsedLimit + 1));
    const parsedOffset = page ? (curPage - 1) * parsedLimit : Math.max(0, parseInt(offset as string, 10) || 0);

    params.push(parsedLimit);
    params.push(parsedOffset);
    sql += ` ORDER BY o.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: curPage,
        pageSize: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit) || 1,
      },
    });
  } catch (err: any) {
    console.error('[Admin Orders Error]', err);
    return res.status(500).json({ error: 'server_error', message: '订单列表获取失败' });
  }
});

// 5.1 管理员手工录入订单 (支持直接标记已付款或待确认)
adminRouter.post('/admin/orders/create', async (req: Request, res: Response) => {
  try {
    const { userId, planId, amountCents, payChannel = 'offline', payTradeNo, quotaPoints, markPaid = true } = req.body;
    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);
    if (!userId || !UUID_REGEX.test(userId)) {
      return res.status(400).json({ error: 'invalid_user', message: '必须指定有效的用户 ID' });
    }

    const userRes = await query('SELECT id, email, phone, plan, quota, total_quota, new_api_user_id FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '指定用户不存在' });
    }
    const targetUser = userRes.rows[0];

    let planData: any = null;
    if (planId) {
      const planRes = await query('SELECT * FROM plans WHERE id = $1', [planId]);
      if (planRes.rows.length > 0) {
        planData = planRes.rows[0];
      }
    }

    const finalAmountCents = amountCents !== undefined ? Math.max(0, parseInt(amountCents, 10)) : (planData ? planData.price_cents : 0);
    const pointsToAdd = quotaPoints !== undefined ? Math.max(0, parseFloat(quotaPoints)) : (planData ? parseFloat(planData.quota_points) : 0);
    const orderNo = `MO${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const status = markPaid ? 'paid' : 'pending';
    const paidAt = markPaid ? new Date() : null;

    const createdOrder = await runMutation(async (client) => {
      const insertOrderSql = `
        INSERT INTO orders (order_no, user_id, plan_id, amount_cents, pay_channel, pay_trade_no, status, paid_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const orderRes = await client.query(insertOrderSql, [
        orderNo,
        userId,
        planId || null,
        finalAmountCents,
        payChannel,
        payTradeNo || null,
        status,
        paidAt,
      ]);
      const order = orderRes.rows[0];

      if (markPaid) {
        if (planData && planData.slug) {
          await client.query('UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2', [planData.slug, userId]);
        }
        if (pointsToAdd > 0) {
          const nextQuotaRes = await client.query(
            'UPDATE users SET quota = quota + $1, total_quota = total_quota + $1, updated_at = NOW() WHERE id = $2 RETURNING quota',
            [pointsToAdd, userId]
          );
          const balanceAfter = nextQuotaRes.rows[0]?.quota || 0;
          await client.query(
            `INSERT INTO quota_transactions (user_id, order_id, amount, balance_after, type, remark)
             VALUES ($1, $2, $3, $4, 'purchase', $5)`,
            [userId, order.id, pointsToAdd, balanceAfter, `线下录单到账：${planData ? planData.name : '算力充值'} (${reason})`]
          );
        }
      }

      await insertAudit({
        actorId: actorId(req),
        action: 'create_order',
        targetType: 'order',
        targetId: order.id,
        reason,
        beforeValue: null,
        afterValue: { orderNo, userId, amountCents: finalAmountCents, status, pointsToAdd },
      }, client);

      return order;
    });

    // 同步 New-API
    if (markPaid && targetUser.new_api_user_id && pointsToAdd > 0) {
      try {
        await newApi.topUpUserQuota({
          newApiUserId: targetUser.new_api_user_id,
          metaarcPoints: pointsToAdd,
          remark: `手工录单到账: ${orderNo}`,
        });
      } catch (apiErr: any) {
        console.error('[Admin Order Create New-API Error]', apiErr.message);
      }
    }

    return res.status(201).json({ success: true, order: createdOrder });
  } catch (err: any) {
    console.error('[Admin Create Order Error]', err);
    return res.status(500).json({ error: 'server_error', message: '录入订单失败' });
  }
});

// 5.2 标记订单为已支付 (审核通过并充值发点)
adminRouter.post('/admin/orders/:id/mark-paid', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '订单 ID 格式不正确' });
    }
    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);
    const { payTradeNo } = req.body;

    const orderRes = await query(
      `SELECT o.*, u.new_api_user_id, p.slug as plan_slug, p.name as plan_name, p.quota_points
       FROM orders o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN plans p ON o.plan_id = p.id
       WHERE o.id = $1`,
      [id]
    );
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '订单不存在' });
    }
    const order = orderRes.rows[0];
    if (order.status === 'paid') {
      return res.status(400).json({ error: 'already_paid', message: '该订单已处于完成状态' });
    }
    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'order_cancelled', message: '已取消的订单不能标记已支付' });
    }

    const pointsToAdd = parseFloat(order.quota_points || '0');
    const updatedOrder = await runMutation(async (client) => {
      const upRes = await client.query(
        `UPDATE orders SET status = 'paid', paid_at = NOW(), pay_trade_no = COALESCE($1, pay_trade_no), updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [payTradeNo || null, id]
      );
      if (order.plan_slug) {
        await client.query('UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2', [order.plan_slug, order.user_id]);
      }
      if (pointsToAdd > 0) {
        const quotaRes = await client.query(
          'UPDATE users SET quota = quota + $1, total_quota = total_quota + $1, updated_at = NOW() WHERE id = $2 RETURNING quota',
          [pointsToAdd, order.user_id]
        );
        const balanceAfter = quotaRes.rows[0]?.quota || 0;
        await client.query(
          `INSERT INTO quota_transactions (user_id, order_id, amount, balance_after, type, remark)
           VALUES ($1, $2, $3, $4, 'purchase', $5)`,
          [order.user_id, id, pointsToAdd, balanceAfter, `订单确认支付：${order.plan_name || '订阅套餐'} (${reason})`]
        );
      }

      await insertAudit({
        actorId: actorId(req),
        action: 'mark_order_paid',
        targetType: 'order',
        targetId: id,
        reason,
        beforeValue: { status: order.status },
        afterValue: { status: 'paid', pointsAdded: pointsToAdd },
      }, client);

      return upRes.rows[0];
    });

    if (order.new_api_user_id && pointsToAdd > 0) {
      try {
        await newApi.topUpUserQuota({
          newApiUserId: order.new_api_user_id,
          metaarcPoints: pointsToAdd,
          remark: `订单到账充值: ${order.order_no || order.id}`,
        });
      } catch (apiErr: any) {
        console.error('[Admin Order Mark Paid New-API Error]', apiErr.message);
      }
    }

    return res.json({ success: true, message: '订单已标记为支付成功，点数已到账', order: updatedOrder });
  } catch (err: any) {
    console.error('[Admin Mark Paid Error]', err);
    return res.status(500).json({ error: 'server_error', message: '确认订单失败' });
  }
});

// 5.3 作废或取消订单
adminRouter.post('/admin/orders/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '订单 ID 格式不正确' });
    }
    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);

    const orderRes = await query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '订单不存在' });
    }
    const order = orderRes.rows[0];
    if (order.status === 'paid') {
      return res.status(400).json({ error: 'cannot_cancel', message: '已支付的订单不能直接作废，请通过订单退款冲正处理' });
    }

    const updated = await runMutation(async (client) => {
      const up = await client.query(
        `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
      await insertAudit({
        actorId: actorId(req),
        action: 'cancel_order',
        targetType: 'order',
        targetId: id,
        reason,
        beforeValue: { status: order.status },
        afterValue: { status: 'cancelled' },
      }, client);
      return up.rows[0];
    });

    return res.json({ success: true, message: '订单已取消', order: updated });
  } catch (err: any) {
    console.error('[Admin Cancel Order Error]', err);
    return res.status(500).json({ error: 'server_error', message: '取消订单失败' });
  }
});

// 5.4 订单详情与关联流水、审计日志查询
adminRouter.get('/admin/orders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '订单 ID 格式不正确' });
    }

    const orderRes = await query(
      `SELECT o.*, u.email, u.phone, u.nickname, u.role, u.status as user_status, u.plan as user_plan,
              p.name as plan_name, p.slug as plan_slug, p.quota_points, p.price_cents, p.duration_days
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN plans p ON o.plan_id = p.id
       WHERE o.id = $1`,
      [id]
    );
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '订单不存在' });
    }

    const order = orderRes.rows[0];

    // 关联的算力流水记录
    const quotaRes = await query(
      `SELECT id, amount, balance_after, type, remark, created_at
       FROM quota_transactions
       WHERE order_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    // 关联的审计日志
    const auditRes = await query(
      `SELECT a.id, a.actor_id, a.action, a.reason, a.before_value, a.after_value, a.created_at,
              u.email as actor_email, u.nickname as actor_nickname
       FROM admin_audit_logs a
       LEFT JOIN users u ON a.actor_id = u.id
       WHERE a.target_type = 'order' AND a.target_id = $1
       ORDER BY a.created_at DESC`,
      [id]
    );

    return res.json({
      success: true,
      data: {
        order,
        quota_transactions: quotaRes.rows,
        audit_logs: auditRes.rows,
      },
    });
  } catch (err: any) {
    console.error('[Admin Order Detail Error]', err);
    return res.status(500).json({ error: 'server_error', message: '获取订单详情失败' });
  }
});

// 5.5 已支付订单官方退款冲正处理
adminRouter.post('/admin/orders/:id/refund', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '订单 ID 格式不正确' });
    }
    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);

    const refundPoints = req.body?.refundPoints !== false;

    const orderRes = await query(
      `SELECT o.*, u.new_api_user_id, u.quota, p.slug as plan_slug, p.name as plan_name, p.quota_points
       FROM orders o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN plans p ON o.plan_id = p.id
       WHERE o.id = $1`,
      [id]
    );
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '订单不存在' });
    }
    const order = orderRes.rows[0];
    if (order.status !== 'paid') {
      return res.status(400).json({ error: 'invalid_status', message: '只有已支付状态的订单才能办理退款冲正' });
    }

    const pointsToDeduct = refundPoints ? parseFloat(order.quota_points || '0') : 0;

    const updatedOrder = await runMutation(async (client) => {
      const upRes = await client.query(
        `UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );

      if (pointsToDeduct > 0) {
        const quotaRes = await client.query(
          `UPDATE users SET quota = GREATEST(0, quota - $1), updated_at = NOW() WHERE id = $2 RETURNING quota`,
          [pointsToDeduct, order.user_id]
        );
        const balanceAfter = quotaRes.rows[0]?.quota || 0;
        await client.query(
          `INSERT INTO quota_transactions (user_id, order_id, amount, balance_after, type, remark)
           VALUES ($1, $2, $3, $4, 'refund', $5)`,
          [order.user_id, id, -pointsToDeduct, balanceAfter, `订单退款扣减点数：${order.plan_name || '订阅套餐'} (${reason})`]
        );
      }

      await insertAudit({
        actorId: actorId(req),
        action: 'refund_order',
        targetType: 'order',
        targetId: id,
        reason,
        beforeValue: { status: order.status, quota: order.quota },
        afterValue: { status: 'refunded', pointsDeducted: pointsToDeduct },
      }, client);

      return upRes.rows[0];
    });

    if (order.new_api_user_id && pointsToDeduct > 0) {
      try {
        await newApi.topUpUserQuota({
          newApiUserId: order.new_api_user_id,
          metaarcPoints: -pointsToDeduct,
          remark: `订单退款扣除配额: ${order.order_no || order.id}`,
        });
      } catch (apiErr: any) {
        console.error('[Admin Order Refund New-API Sync Error]', apiErr.message);
      }
    }

    return res.json({ success: true, message: '订单已成功办理退款冲正', order: updatedOrder });
  } catch (err: any) {
    console.error('[Admin Refund Order Error]', err);
    return res.status(500).json({ error: 'server_error', message: '订单退款处理失败' });
  }
});

// 6. 管理员查询指定用户的算力流水
adminRouter.get('/admin/users/:id/quota-logs', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    if (!UUID_REGEX.test(targetUserId)) {
      return res.status(400).json({ error: 'invalid_user_id', message: '用户ID格式无效' });
    }

    const sql = `
      SELECT id, amount, balance_after, type, reference_id, remark, created_at
      FROM quota_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `;
    const result = await query(sql, [targetUserId]);
    return res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[Admin User Quota Logs Error]', err);
    return res.status(500).json({ error: 'server_error', message: '获取用户算力流水失败' });
  }
});

// 7. 管理员重置用户密码
adminRouter.post('/admin/users/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    if (!UUID_REGEX.test(targetUserId)) {
      return res.status(400).json({ error: 'invalid_user_id', message: '用户ID格式无效' });
    }

    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);
    const supplied = req.body.newPassword || req.body.new_password;
    const pwd = (typeof supplied === 'string' && supplied.trim().length >= 6)
      ? supplied.trim()
      : `MetaArc@${Math.random().toString(36).substring(2, 8).toUpperCase()}!`;

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(pwd, salt);
    const user = await runMutation(async (client) => {
      const userRes = await client.query(
        `UPDATE users
         SET password_hash = $1, session_version = session_version + 1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, email, phone, nickname`,
        [hash, targetUserId],
      );
      if (userRes.rows.length === 0) {
        const missing = new Error('not_found');
        (missing as { status?: number }).status = 404;
        throw missing;
      }
      await insertAudit({
        actorId: actorId(req),
        action: 'reset_password',
        targetType: 'user',
        targetId: targetUserId,
        reason,
        beforeValue: null,
        afterValue: { password: '[redacted]' },
      }, client);
      return userRes.rows[0];
    });

    return res.json({
      success: true,
      message: '密码已重置。请通过已有联系方式交给用户，系统不会发送邮件。',
      temporary_password: pwd,
      newPassword: pwd,
      user,
    });
  } catch (err: any) {
    if (err?.status === 404) {
      return res.status(404).json({ error: 'user_not_found', message: '目标用户不存在' });
    }
    console.error('[Admin Reset Password Error]', err);
    return res.status(500).json({ error: 'server_error', message: '重置密码失败' });
  }
});

// 8. 管理员变更用户账号状态（正常/封禁）
adminRouter.post('/admin/users/:id/set-status', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    if (!UUID_REGEX.test(targetUserId)) {
      return res.status(400).json({ error: 'invalid_user_id', message: '用户ID格式无效' });
    }

    const { status } = req.body;
    if (status !== 'active' && status !== 'suspended') {
      return res.status(400).json({ error: 'invalid_status', message: '状态只能为 active 或 suspended' });
    }
    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);
    if (status === 'suspended' && sameUser(targetUserId, actorId(req))) {
      return res.status(400).json({ error: 'forbidden', message: '不能封禁当前登录管理员自身' });
    }

    const user = await runMutation(async (client) => {
      const before = await client.query('SELECT id, status FROM users WHERE id = $1 FOR UPDATE', [targetUserId]);
      if (before.rows.length === 0) {
        const missing = new Error('not_found');
        (missing as { status?: number }).status = 404;
        throw missing;
      }
      const userRes = await client.query(
        'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, phone, nickname, status',
        [status, targetUserId],
      );
      await insertAudit({
        actorId: actorId(req),
        action: 'set_status',
        targetType: 'user',
        targetId: targetUserId,
        reason,
        beforeValue: { status: before.rows[0].status },
        afterValue: { status },
      }, client);
      return userRes.rows[0];
    });

    return res.json({
      success: true,
      message: status === 'active' ? '用户状态已更新为正常' : '用户状态已更新为已封禁',
      user,
    });
  } catch (err: any) {
    if (err?.status === 404) {
      return res.status(404).json({ error: 'user_not_found', message: '目标用户不存在' });
    }
    console.error('[Admin Set Status Error]', err);
    return res.status(500).json({ error: 'server_error', message: '更新用户状态失败' });
  }
});

// 9. 系统运行环境与健康监控指标
adminRouter.get('/admin/system-status', async (_req: Request, res: Response) => {
  try {
    const mem = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());
    const uptimeDays = Math.floor(uptimeSec / 86400);
    const uptimeHours = Math.floor((uptimeSec % 86400) / 3600);
    const uptimeMinutes = Math.floor((uptimeSec % 3600) / 60);

    const dbStats = {
      total: (pool as any).totalCount ?? 0,
      idle: (pool as any).idleCount ?? 0,
      waiting: (pool as any).waitingCount ?? 0,
    };

    let aiGatewayStatus = 'unconfigured';
    if (process.env.NEW_API_BASE_URL) {
      try {
        const pingRes = await fetch(`${process.env.NEW_API_BASE_URL.replace(/\/$/, '')}/api/status`, {
          signal: AbortSignal.timeout(2000),
        });
        aiGatewayStatus = pingRes.ok ? 'connected' : `http_${pingRes.status}`;
      } catch {
        aiGatewayStatus = 'unreachable';
      }
    }

    const s3Configured = !!(process.env.S3_BUCKET || process.env.AWS_ACCESS_KEY_ID);
    const s3Stats = {
      configured: s3Configured,
      bucket: process.env.S3_BUCKET || 'metaarc-media-prod',
      endpoint: process.env.S3_ENDPOINT ? 'custom' : 'aws-default',
      region: process.env.AWS_REGION || 'auto',
    };

    return res.json({
      success: true,
      data: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime_seconds: uptimeSec,
        uptime_formatted: `${uptimeDays}天 ${uptimeHours}小时 ${uptimeMinutes}分`,
        memory_mb: {
          rss: Math.round(mem.rss / 1024 / 1024),
          heap_total: Math.round(mem.heapTotal / 1024 / 1024),
          heap_used: Math.round(mem.heapUsed / 1024 / 1024),
        },
        db_pool: dbStats,
        ai_gateway: {
          configured: !!process.env.NEW_API_BASE_URL,
          status: aiGatewayStatus,
        },
        s3: s3Stats,
      },
    });
  } catch (err: any) {
    console.error('[Admin System Status Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取系统监控指标' });
  }
});

// 10. 管理员获取全平台任务调度队列 (带标准分页)
adminRouter.get('/admin/tasks', async (req: Request, res: Response) => {
  try {
    const { status, taskType, keyword, startDate, endDate, userId, limit = '50', offset = '0', page, pageSize } = req.query;

    let sql = `
      SELECT t.id, t.user_id, t.task_type, t.status, t.progress, t.prompt, t.client_ip,
             t.duration_ms, t.input_payload, t.output_payload, t.error_message,
             t.created_at, t.updated_at,
             u.email, u.phone, u.nickname
      FROM user_tasks t
      LEFT JOIN users u ON t.user_id = u.id
    `;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (keyword && typeof keyword === 'string' && keyword.trim()) {
      params.push(`%${keyword.trim()}%`);
      whereClauses.push(`(t.prompt ILIKE $${params.length} OR t.task_type ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.nickname ILIKE $${params.length})`);
    }

    if (taskType && typeof taskType === 'string' && taskType.trim()) {
      params.push(taskType.trim());
      whereClauses.push(`t.task_type = $${params.length}`);
    }

    if (status && typeof status === 'string' && status.trim()) {
      params.push(status.trim());
      whereClauses.push(`t.status = $${params.length}`);
    }
    if (userId && typeof userId === 'string' && UUID_REGEX.test(userId.trim())) {
      params.push(userId.trim());
      whereClauses.push(`t.user_id = $${params.length}`);
    }
    if (startDate && typeof startDate === 'string' && startDate.trim()) {
      params.push(startDate.trim());
      whereClauses.push(`t.created_at >= $${params.length}::timestamptz`);
    }
    if (endDate && typeof endDate === 'string' && endDate.trim()) {
      params.push(endDate.trim());
      whereClauses.push(`t.created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const countSql = `
      SELECT count(*) FROM user_tasks t
      LEFT JOIN users u ON t.user_id = u.id
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
    `;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const parsedLimit = Math.max(1, Math.min(200, parseInt((pageSize || limit) as string, 10) || 50));
    const curPage = Math.max(1, parseInt(page as string, 10) || (Math.floor(parseInt(offset as string, 10) || 0) / parsedLimit + 1));
    const parsedOffset = page ? (curPage - 1) * parsedLimit : Math.max(0, parseInt(offset as string, 10) || 0);

    params.push(parsedLimit);
    params.push(parsedOffset);
    sql += ` ORDER BY t.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: curPage,
        pageSize: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit) || 1,
      },
    });
  } catch (err: any) {
    console.error('[Admin Tasks Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取任务调度队列' });
  }
});

// 11. 管理员终止/取消指定任务
adminRouter.post('/admin/tasks/:id/cancel', async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!UUID_REGEX.test(taskId)) {
      return res.status(400).json({ error: 'invalid_task_id', message: '任务ID格式无效' });
    }

    const taskRes = await query('SELECT * FROM user_tasks WHERE id = $1', [taskId]);
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '任务记录不存在' });
    }
    const task = taskRes.rows[0];
    if (!['pending', 'running', 'processing'].includes(task.status)) {
      return res.status(400).json({ error: 'cannot_cancel', message: '任务已处于终态，无法终止' });
    }

    const reason = cleanReason(req.body?.reason) || '管理员手动终止任务';

    const updated = await runMutation(async (client) => {
      const up = await client.query(
        `UPDATE user_tasks
         SET status = 'failed',
             error_message = COALESCE(error_message, $1),
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [reason, taskId]
      );
      await insertAudit({
        actorId: actorId(req),
        action: 'cancel_task',
        targetType: 'task',
        targetId: taskId,
        reason,
        beforeValue: { status: task.status, progress: task.progress },
        afterValue: { status: 'failed', error_message: reason },
      }, client);
      return up.rows[0];
    });

    return res.json({ success: true, message: '任务已成功终止', task: updated });
  } catch (err: any) {
    console.error('[Admin Cancel Task Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '终止任务失败' });
  }
});

// 11.1 管理员重新调度/重试失败任务
adminRouter.post('/admin/tasks/:id/retry', async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!UUID_REGEX.test(taskId)) {
      return res.status(400).json({ error: 'invalid_task_id', message: '任务 ID 格式无效' });
    }

    const taskRes = await query('SELECT * FROM user_tasks WHERE id = $1', [taskId]);
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '任务记录不存在' });
    }
    const task = taskRes.rows[0];
    if (task.status !== 'failed') {
      return res.status(400).json({ error: 'invalid_status', message: '只有失败状态的任务才支持重试' });
    }

    const updated = await runMutation(async (client) => {
      const up = await client.query(
        `UPDATE user_tasks
         SET status = 'pending',
             progress = 0,
             error_message = NULL,
             duration_ms = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [taskId]
      );
      await insertAudit({
        actorId: actorId(req),
        action: 'retry_task',
        targetType: 'task',
        targetId: taskId,
        reason: '管理员重新调度失败任务',
        beforeValue: { status: task.status, progress: task.progress, error: task.error_message },
        afterValue: { status: 'pending', progress: 0 },
      }, client);
      return up.rows[0];
    });

    return res.json({ success: true, message: '任务已重新排队等待调度执行', task: updated });
  } catch (err: any) {
    console.error('[Admin Retry Task Error]', err);
    return res.status(500).json({ error: 'server_error', message: '重试任务调度失败' });
  }
});

// 11.2 管理员清理超时卡滞的任务（状态为 running 且超过 timeoutMinutes 未更新）
adminRouter.post('/admin/tasks/cleanup-stalled', async (req: Request, res: Response) => {
  try {
    const { timeoutMinutes = 30 } = req.body;
    const minutes = Math.max(5, Math.min(1440, parseInt(timeoutMinutes, 10) || 30));
    const reason = cleanReason(req.body?.reason) || `清理超过 ${minutes} 分钟无心跳的卡滞运行中任务`;

    const stalledTasksRes = await query(
      `SELECT id, user_id, task_type, created_at, updated_at
       FROM user_tasks
       WHERE status = 'running' AND updated_at < NOW() - ($1 || ' minutes')::interval`,
      [minutes]
    );

    const count = stalledTasksRes.rows.length;
    if (count === 0) {
      return res.json({ success: true, message: '当前没有超时的运行中任务', cleanedCount: 0 });
    }

    const updated = await runMutation(async (client) => {
      const upRes = await client.query(
        `UPDATE user_tasks
         SET status = 'failed',
             error_message = '执行超时：超过 ' || $1 || ' 分钟未收到执行进度心跳，系统自动置为失败',
             duration_ms = EXTRACT(EPOCH FROM (NOW() - created_at)) * 1000,
             updated_at = NOW()
         WHERE status = 'running' AND updated_at < NOW() - ($1 || ' minutes')::interval
         RETURNING id, user_id, task_type`,
        [minutes]
      );
      await insertAudit({
        actorId: actorId(req),
        action: 'cleanup_stalled_tasks',
        targetType: 'task',
        targetId: 'batch',
        reason,
        beforeValue: { stalled_count: count },
        afterValue: { cleaned_tasks: upRes.rows.map(r => r.id) },
      }, client);
      return upRes.rows;
    });

    return res.json({
      success: true,
      message: `成功清理 ${updated.length} 个超时的运行中任务`,
      cleanedCount: updated.length,
      tasks: updated,
    });
  } catch (err: any) {
    console.error('[Admin Cleanup Stalled Tasks Error]', err);
    return res.status(500).json({ error: 'server_error', message: '清理超时任务失败' });
  }
});

// 12. 管理员查看云端媒体资源与存储统计 (带标准分页)
adminRouter.get('/admin/media', async (req: Request, res: Response) => {
  try {
    const { assetType, keyword, startDate, endDate, userId, limit = '50', offset = '0', page, pageSize } = req.query;

    const statsRes = await query(`
      SELECT COUNT(*) as total_assets,
             COALESCE(SUM(byte_size), 0) as total_bytes,
             COUNT(DISTINCT user_id) as total_users
      FROM media_assets
    `);

    let listSql = `
      SELECT m.id, m.user_id, m.project_id, m.asset_type, m.storage_key, m.cdn_url,
             m.byte_size, m.mime_type, m.created_at,
             u.email, u.phone, u.nickname
      FROM media_assets m
      LEFT JOIN users u ON m.user_id = u.id
    `;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (keyword && typeof keyword === 'string' && keyword.trim()) {
      params.push(`%${keyword.trim()}%`);
      whereClauses.push(`(m.storage_key ILIKE $${params.length} OR m.cdn_url ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.nickname ILIKE $${params.length})`);
    }

    if (assetType && typeof assetType === 'string' && assetType.trim()) {
      params.push(assetType.trim());
      whereClauses.push(`m.asset_type = $${params.length}`);
    }
    if (userId && typeof userId === 'string' && UUID_REGEX.test(userId.trim())) {
      params.push(userId.trim());
      whereClauses.push(`m.user_id = $${params.length}`);
    }
    if (startDate && typeof startDate === 'string' && startDate.trim()) {
      params.push(startDate.trim());
      whereClauses.push(`m.created_at >= $${params.length}::timestamptz`);
    }
    if (endDate && typeof endDate === 'string' && endDate.trim()) {
      params.push(endDate.trim());
      whereClauses.push(`m.created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
    }

    if (whereClauses.length > 0) {
      listSql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const countSql = `
      SELECT count(*) FROM media_assets m
      LEFT JOIN users u ON m.user_id = u.id
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
    `;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const parsedLimit = Math.max(1, Math.min(200, parseInt((pageSize || limit) as string, 10) || 50));
    const curPage = Math.max(1, parseInt(page as string, 10) || (Math.floor(parseInt(offset as string, 10) || 0) / parsedLimit + 1));
    const parsedOffset = page ? (curPage - 1) * parsedLimit : Math.max(0, parseInt(offset as string, 10) || 0);

    params.push(parsedLimit);
    params.push(parsedOffset);
    listSql += ` ORDER BY m.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const listRes = await query(listSql, params);

    return res.json({
      success: true,
      stats: {
        total_assets: parseInt(statsRes.rows[0].total_assets, 10) || 0,
        total_bytes: parseInt(statsRes.rows[0].total_bytes, 10) || 0,
        total_users: parseInt(statsRes.rows[0].total_users, 10) || 0,
      },
      data: listRes.rows,
      pagination: {
        total,
        page: curPage,
        pageSize: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit) || 1,
      },
    });
  } catch (err: any) {
    console.error('[Admin Media Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取媒体资源列表' });
  }
});

// 13. 管理员删除媒体资源记录
adminRouter.delete('/admin/media/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '媒体资源 ID 格式不正确' });
    }

    const before = await query('SELECT * FROM media_assets WHERE id = $1', [id]);
    if (before.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '媒体资源不存在或已被删除' });
    }

    const reason = cleanReason(req.body?.reason) || '管理员移除媒体资源索引';

    await runMutation(async (client) => {
      await client.query('DELETE FROM media_assets WHERE id = $1', [id]);
      await insertAudit({
        actorId: actorId(req),
        action: 'delete_media',
        targetType: 'media',
        targetId: id,
        reason,
        beforeValue: before.rows[0],
        afterValue: null,
      }, client);
    });

    return res.json({
      success: true,
      message: '媒体资源已从云端登记簿中移除',
      id,
    });
  } catch (err: any) {
    console.error('[Admin Delete Media Error]', err);
    return res.status(500).json({ error: 'server_error', message: '删除媒体资源失败' });
  }
});

// 14. 管理员删除任务调度记录
adminRouter.delete('/admin/tasks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '任务 ID 格式不正确' });
    }

    const before = await query('SELECT * FROM user_tasks WHERE id = $1', [id]);
    if (before.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '任务记录不存在或已被删除' });
    }

    const reason = cleanReason(req.body?.reason) || '管理员清理任务调度历史';

    await runMutation(async (client) => {
      await client.query('DELETE FROM user_tasks WHERE id = $1', [id]);
      await insertAudit({
        actorId: actorId(req),
        action: 'delete_task',
        targetType: 'task',
        targetId: id,
        reason,
        beforeValue: before.rows[0],
        afterValue: null,
      }, client);
    });

    return res.json({
      success: true,
      message: '任务记录已从调度队列中删除',
      id,
    });
  } catch (err: any) {
    console.error('[Admin Delete Task Error]', err);
    return res.status(500).json({ error: 'server_error', message: '删除任务记录失败' });
  }
});

// 15. 管理员获取全量套餐配置列表（含上下架状态与订单统计）
adminRouter.get('/admin/plans', async (_req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT p.id, p.name, p.slug, p.description, p.price_cents, p.billing_cycle,
             p.quota_points, p.storage_limit_mb, p.max_concurrency, p.duration_days,
             p.features, p.sort_order, p.is_active, p.created_at,
             COUNT(o.id)::int as total_orders,
             COUNT(CASE WHEN o.status = 'paid' THEN 1 END)::int as paid_orders
      FROM plans p
      LEFT JOIN orders o ON p.id = o.plan_id
      GROUP BY p.id
      ORDER BY p.sort_order ASC
    `);

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (err: any) {
    console.error('[Admin Plans Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取套餐列表' });
  }
});

// 16. 管理员启停指定套餐上架状态
adminRouter.post('/admin/plans/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '套餐 ID 格式无效' });
    }
    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);

    const updated = await runMutation(async (client) => {
      const before = await client.query('SELECT id, name, is_active FROM plans WHERE id = $1 FOR UPDATE', [id]);
      if (before.rows.length === 0) {
        const missing = new Error('not_found');
        (missing as { status?: number }).status = 404;
        throw missing;
      }
      const updateRes = await client.query(
        'UPDATE plans SET is_active = NOT is_active WHERE id = $1 RETURNING *',
        [id],
      );
      await insertAudit({
        actorId: actorId(req),
        action: 'toggle_plan',
        targetType: 'plan',
        targetId: id,
        reason,
        beforeValue: { is_active: before.rows[0].is_active },
        afterValue: { is_active: updateRes.rows[0].is_active },
      }, client);
      return updateRes.rows[0];
    });
    return res.json({
      success: true,
      message: updated.is_active ? `套餐「${updated.name}」已上架` : `套餐「${updated.name}」已下架`,
      plan: updated,
    });
  } catch (err: any) {
    if (err?.status === 404) {
      return res.status(404).json({ error: 'not_found', message: '套餐不存在' });
    }
    console.error('[Admin Toggle Plan Error]', err);
    return res.status(500).json({ error: 'server_error', message: '操作套餐状态失败' });
  }
});

// 16.1 管理员创建新套餐
adminRouter.post('/admin/plans/create', async (req: Request, res: Response) => {
  try {
    const { id, name, slug, description, priceCents, billingCycle = 'monthly', quotaPoints, storageLimitMb = 1024, maxConcurrency = 1, durationDays = 30, features = [], sortOrder = 0 } = req.body;
    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);

    if (!id || !name || !slug || priceCents === undefined || quotaPoints === undefined) {
      return res.status(400).json({ error: 'missing_fields', message: '必须指定套餐ID、名称、标识、价格与算力点数' });
    }

    const created = await runMutation(async (client) => {
      const insertSql = `
        INSERT INTO plans (id, name, slug, description, price_cents, billing_cycle, quota_points, storage_limit_mb, max_concurrency, duration_days, features, sort_order, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
        RETURNING *
      `;
      const result = await client.query(insertSql, [
        String(id).trim(),
        String(name).trim(),
        String(slug).trim(),
        description || null,
        Math.max(0, parseInt(priceCents, 10)),
        billingCycle,
        Math.max(0, parseFloat(quotaPoints)),
        parseInt(storageLimitMb, 10) || 1024,
        parseInt(maxConcurrency, 10) || 1,
        parseInt(durationDays, 10) || 30,
        JSON.stringify(Array.isArray(features) ? features : []),
        parseInt(sortOrder, 10) || 0,
      ]);
      await insertAudit({
        actorId: actorId(req),
        action: 'create_plan',
        targetType: 'plan',
        targetId: id,
        reason,
        beforeValue: null,
        afterValue: result.rows[0],
      }, client);
      return result.rows[0];
    });

    return res.status(201).json({ success: true, plan: created });
  } catch (err: any) {
    console.error('[Admin Create Plan Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '创建套餐失败' });
  }
});

// 16.2 管理员更新套餐配置
adminRouter.post('/admin/plans/:id/update', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, priceCents, quotaPoints, storageLimitMb, maxConcurrency, durationDays, features, sortOrder } = req.body;
    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);

    const beforeRes = await query('SELECT * FROM plans WHERE id = $1', [id]);
    if (beforeRes.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '套餐不存在' });
    }
    const before = beforeRes.rows[0];

    const updated = await runMutation(async (client) => {
      const sql = `
        UPDATE plans
        SET name = COALESCE($1, name),
            description = COALESCE($2, description),
            price_cents = COALESCE($3, price_cents),
            quota_points = COALESCE($4, quota_points),
            storage_limit_mb = COALESCE($5, storage_limit_mb),
            max_concurrency = COALESCE($6, max_concurrency),
            duration_days = COALESCE($7, duration_days),
            features = COALESCE($8, features),
            sort_order = COALESCE($9, sort_order)
        WHERE id = $10
        RETURNING *
      `;
      const result = await client.query(sql, [
        name ? String(name).trim() : null,
        description !== undefined ? description : null,
        priceCents !== undefined ? Math.max(0, parseInt(priceCents, 10)) : null,
        quotaPoints !== undefined ? Math.max(0, parseFloat(quotaPoints)) : null,
        storageLimitMb !== undefined ? parseInt(storageLimitMb, 10) : null,
        maxConcurrency !== undefined ? parseInt(maxConcurrency, 10) : null,
        durationDays !== undefined ? parseInt(durationDays, 10) : null,
        features !== undefined ? JSON.stringify(Array.isArray(features) ? features : []) : null,
        sortOrder !== undefined ? parseInt(sortOrder, 10) : null,
        id,
      ]);

      await insertAudit({
        actorId: actorId(req),
        action: 'update_plan',
        targetType: 'plan',
        targetId: id,
        reason,
        beforeValue: before,
        afterValue: result.rows[0],
      }, client);

      return result.rows[0];
    });

    return res.json({ success: true, plan: updated });
  } catch (err: any) {
    console.error('[Admin Update Plan Error]', err);
    return res.status(500).json({ error: 'server_error', message: '更新套餐失败' });
  }
});

// 17. 管理员查看指定用户的登录审计日志
adminRouter.get('/admin/users/:id/login-logs', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '用户 ID 格式不正确' });
    }

    const result = await query(
      `SELECT id, ip, ip_location, user_agent, status, fail_reason, created_at
       FROM login_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [id]
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (err: any) {
    console.error('[Admin User Login Logs Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取登录审计日志' });
  }
});

// 18. 管理员获取任务详情与提示词透视
adminRouter.get('/admin/tasks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '任务 ID 格式不正确' });
    }

    const sql = `
      SELECT t.*, u.email, u.phone, u.nickname
      FROM user_tasks t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = $1
    `;
    const result = await query(sql, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'task_not_found', message: '任务不存在' });
    }

    return res.json({
      success: true,
      task: result.rows[0],
    });
  } catch (err: any) {
    console.error('[Admin Get Task Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取任务详情' });
  }
});

// 19. 管理员获取全平台登录与安全审计日志
adminRouter.get('/admin/login-logs', async (req: Request, res: Response) => {
  try {
    const { status, keyword, startDate, endDate, limit = '50', offset = '0' } = req.query;
    let sql = `
      SELECT l.id, l.user_id, l.account, l.ip, l.ip_location, l.user_agent, l.status, l.fail_reason, l.created_at,
             u.email, u.phone, u.nickname, u.role
      FROM login_logs l
      LEFT JOIN users u ON l.user_id = u.id
    `;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (status && typeof status === 'string' && (status === 'success' || status === 'failed')) {
      params.push(status);
      whereClauses.push(`l.status = $${params.length}`);
    }

    if (keyword && typeof keyword === 'string' && keyword.trim()) {
      params.push(`%${keyword.trim()}%`);
      whereClauses.push(`(l.account ILIKE $${params.length} OR l.ip ILIKE $${params.length} OR l.ip_location ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.nickname ILIKE $${params.length})`);
    }

    if (startDate && typeof startDate === 'string' && startDate.trim()) {
      params.push(startDate.trim());
      whereClauses.push(`l.created_at >= $${params.length}::timestamptz`);
    }
    if (endDate && typeof endDate === 'string' && endDate.trim()) {
      params.push(endDate.trim());
      whereClauses.push(`l.created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const countSql = `
      SELECT count(*) FROM login_logs l
      LEFT JOIN users u ON u.id = l.user_id
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
    `;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const parsedLimit = Math.max(1, Math.min(200, parseInt((req.query.pageSize || limit) as string, 10) || 50));
    const curPage = Math.max(1, parseInt(req.query.page as string, 10) || (Math.floor(parseInt(offset as string, 10) || 0) / parsedLimit + 1));
    const parsedOffset = req.query.page ? (curPage - 1) * parsedLimit : Math.max(0, parseInt(offset as string, 10) || 0);

    params.push(parsedLimit);
    params.push(parsedOffset);
    sql += ` ORDER BY l.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: curPage,
        pageSize: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit) || 1,
      },
    });
  } catch (err: any) {
    console.error('[Admin Login Logs Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取全局登录审计日志' });
  }
});

// 20. 安全风控大盘指标
adminRouter.get('/admin/security/stats', async (_req: Request, res: Response) => {
  try {
    const todaySql = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'success' AND created_at >= CURRENT_DATE) as today_logins,
        COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= CURRENT_DATE) as today_failed,
        COUNT(DISTINCT ip) FILTER (WHERE created_at >= CURRENT_DATE) as today_ips
      FROM login_logs
    `;
    const userStatsSql = `
      SELECT COUNT(*) as suspended_count FROM users WHERE status = 'suspended'
    `;
    const [todayRes, userRes] = await Promise.all([query(todaySql), query(userStatsSql)]);
    const stats = todayRes.rows[0] || {};
    const suspended = userRes.rows[0] || {};

    return res.json({
      success: true,
      data: {
        today_logins: parseInt(stats.today_logins || '0', 10),
        today_failed: parseInt(stats.today_failed || '0', 10),
        today_ips: parseInt(stats.today_ips || '0', 10),
        suspended_users: parseInt(suspended.suspended_count || '0', 10),
      },
    });
  } catch (err: any) {
    console.error('[Admin Security Stats Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取安全风控统计' });
  }
});

adminRouter.get('/admin/audit', async (req: Request, res: Response) => {
  try {
    const { page, pageSize, limit = '50', offset = '0' } = req.query;
    const countRes = await query('SELECT count(*) FROM admin_audit_logs');
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const parsedLimit = Math.max(1, Math.min(200, parseInt((pageSize || limit) as string, 10) || 50));
    const curPage = Math.max(1, parseInt(page as string, 10) || (Math.floor(parseInt(offset as string, 10) || 0) / parsedLimit + 1));
    const parsedOffset = page ? (curPage - 1) * parsedLimit : Math.max(0, parseInt(offset as string, 10) || 0);

    const result = await query(
      `SELECT id, actor_id, action, target_type, target_id, reason, before_value, after_value, created_at
       FROM admin_audit_logs
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [parsedLimit, parsedOffset],
    );
    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: curPage,
        pageSize: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit) || 1,
      },
    });
  } catch (err: any) {
    console.error('[Admin Audit Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取变更审计' });
  }
});

adminRouter.get('/admin/quota-logs', async (req: Request, res: Response) => {
  try {
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
    const { page, pageSize, limit = '50', offset = '0', startDate, endDate, type, userId } = req.query;
    const params: unknown[] = [];
    const whereClauses: string[] = [];

    if (keyword) {
      params.push(`%${keyword}%`);
      whereClauses.push(`(u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.nickname ILIKE $${params.length} OR q.type ILIKE $${params.length} OR q.remark ILIKE $${params.length})`);
    }
    if (type && typeof type === 'string' && type.trim()) {
      params.push(type.trim());
      whereClauses.push(`q.type = $${params.length}`);
    }
    if (userId && typeof userId === 'string' && UUID_REGEX.test(userId.trim())) {
      params.push(userId.trim());
      whereClauses.push(`q.user_id = $${params.length}`);
    }
    if (startDate && typeof startDate === 'string' && startDate.trim()) {
      params.push(startDate.trim());
      whereClauses.push(`q.created_at >= $${params.length}::timestamptz`);
    }
    if (endDate && typeof endDate === 'string' && endDate.trim()) {
      params.push(endDate.trim());
      whereClauses.push(`q.created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countSql = `
      SELECT count(*) FROM quota_transactions q
      LEFT JOIN users u ON u.id = q.user_id
      ${where}
    `;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const parsedLimit = Math.max(1, Math.min(200, parseInt((pageSize || limit) as string, 10) || 50));
    const curPage = Math.max(1, parseInt(page as string, 10) || (Math.floor(parseInt(offset as string, 10) || 0) / parsedLimit + 1));
    const parsedOffset = page ? (curPage - 1) * parsedLimit : Math.max(0, parseInt(offset as string, 10) || 0);

    params.push(parsedLimit);
    params.push(parsedOffset);

    const result = await query(
      `SELECT q.id, q.user_id, q.amount, q.balance_after, q.type, q.remark, q.created_at,
              u.email, u.phone, u.nickname
       FROM quota_transactions q
       LEFT JOIN users u ON u.id = q.user_id
       ${where}
       ORDER BY q.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: curPage,
        pageSize: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit) || 1,
      },
    });
  } catch (err: any) {
    console.error('[Admin Quota Logs Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取用量流水' });
  }
});

// 21. 用户全貌 360° 画像数据 (聚合基础信息、网关实时探测、最近订单、任务、安全登录与额度流水)
adminRouter.get('/admin/users/:id/detail', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '用户 ID 格式不正确' });
    }

    const userRes = await query(
      `SELECT id, email, phone, nickname, plan, quota, total_quota, role, status,
              new_api_key, new_api_user_id, last_login_at, last_login_ip, last_login_location,
              expires_at, created_at, updated_at
       FROM users WHERE id = $1`,
      [id],
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '用户不存在' });
    }
    const user = userRes.rows[0];

    // 并行获取最近订单、任务、登录日志、流水、累计消费
    const [ordersRes, tasksRes, loginsRes, quotaLogsRes, spentRes] = await Promise.all([
      query(
        `SELECT o.id, o.order_no, o.amount_cents, o.pay_channel, o.pay_trade_no, o.status, o.created_at, o.paid_at,
                p.name as plan_name, p.slug as plan_slug
         FROM orders o
         LEFT JOIN plans p ON o.plan_id = p.id
         WHERE o.user_id = $1
         ORDER BY o.created_at DESC LIMIT 5`,
        [id],
      ),
      query(
        `SELECT id, task_type, prompt, status, progress, duration_ms, created_at
         FROM user_tasks
         WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 5`,
        [id],
      ),
      query(
        `SELECT id, ip, ip_location, user_agent, status, fail_reason, created_at
         FROM login_logs
         WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 5`,
        [id],
      ),
      query(
        `SELECT id, amount, balance_after, type, remark, created_at
         FROM quota_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 5`,
        [id],
      ),
      query(
        `SELECT COALESCE(SUM(amount_cents), 0) as total_cents, count(*) as total_orders
         FROM orders
         WHERE user_id = $1 AND status = 'paid'`,
        [id],
      ),
    ]);

    // 若关联了 New-API，实时探测其网关当前配额
    let liveNewApi: { quota: number; used_quota: number } | null = null;
    if (user.new_api_user_id) {
      try {
        liveNewApi = await newApi.queryUserQuota(user.new_api_user_id);
      } catch (err) {
        console.warn(`[User Detail] Query New-API quota failed for user ${id}:`, err);
      }
    }

    return res.json({
      success: true,
      data: {
        user,
        stats: {
          total_spent_yuan: (parseInt(spentRes.rows[0]?.total_cents || '0', 10) / 100).toFixed(2),
          paid_orders_count: parseInt(spentRes.rows[0]?.total_orders || '0', 10),
        },
        liveNewApi,
        recentOrders: ordersRes.rows,
        recentTasks: tasksRes.rows,
        recentLogins: loginsRes.rows,
        recentQuotaTransactions: quotaLogsRes.rows,
      },
    });
  } catch (err: any) {
    console.error('[Admin User Detail Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取用户全貌数据' });
  }
});

// 22. 安全风控高危 IP 聚类分析 (过去 48 小时恶意或连续失败尝试)
adminRouter.get('/admin/security/threat-ips', async (_req: Request, res: Response) => {
  try {
    const sql = `
      SELECT ip, COALESCE(ip_location, '未知') as ip_location,
             COUNT(*) as fail_count,
             COUNT(DISTINCT account) as targeted_accounts_count,
             ARRAY_AGG(DISTINCT account) FILTER (WHERE account IS NOT NULL) as sample_accounts,
             MAX(created_at) as last_attempt_at
      FROM login_logs
      WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '48 hours'
      GROUP BY ip, ip_location
      ORDER BY fail_count DESC
      LIMIT 20
    `;
    const result = await query(sql);
    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (err: any) {
    console.error('[Admin Security Threat IPs Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取安全威胁分析' });
  }
});

// 22.1 查看已封禁的 IP 访问控制黑名单
adminRouter.get('/admin/security/blocked-ips', async (_req: Request, res: Response) => {
  try {
    const list = await listBlockedIps();
    return res.json({ success: true, data: list });
  } catch (err: any) {
    console.error('[Admin List Blocked IPs Error]', err);
    return res.status(500).json({ error: 'server_error', message: '获取封禁 IP 列表失败' });
  }
});

// 22.2 管理员封禁恶意 IP
adminRouter.post('/admin/security/block-ip', async (req: Request, res: Response) => {
  try {
    const { ip, durationHours } = req.body;
    const cleanIp = typeof ip === 'string' ? normalizeIp(ip) : '';
    if (!cleanIp || cleanIp === '127.0.0.1' || cleanIp.toLowerCase() === 'localhost') {
      return res.status(400).json({ error: 'invalid_ip', message: 'IP 地址无效或不可封禁本地回环地址' });
    }

    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);

    const hours = durationHours !== undefined && durationHours !== null ? Math.max(0, parseFloat(durationHours) || 0) : null;
    const record = await blockIp({
      ip: cleanIp,
      reason,
      blockedBy: actorId(req),
      durationHours: hours && hours > 0 ? hours : null,
    });

    await runMutation(async (client) => {
      await insertAudit({
        actorId: actorId(req),
        action: 'block_ip',
        targetType: 'security',
        targetId: cleanIp,
        reason,
        beforeValue: null,
        afterValue: { ip: cleanIp, durationHours: hours, expires_at: record.expires_at },
      }, client);
    });

    return res.status(201).json({ success: true, message: `IP [${cleanIp}] 已成功拦截`, data: record });
  } catch (err: any) {
    console.error('[Admin Block IP Error]', err);
    return res.status(500).json({ error: 'server_error', message: '封禁 IP 失败' });
  }
});

// 22.3 管理员解封 IP
adminRouter.post('/admin/security/unblock-ip', async (req: Request, res: Response) => {
  try {
    const { ip } = req.body;
    const cleanIp = typeof ip === 'string' ? normalizeIp(ip) : '';
    if (!cleanIp) {
      return res.status(400).json({ error: 'invalid_ip', message: '请指定要解封的 IP 地址' });
    }

    const reason = cleanReason(req.body?.reason);
    if (!reason) return reasonRequired(res);

    await unblockIp(cleanIp);

    await runMutation(async (client) => {
      await insertAudit({
        actorId: actorId(req),
        action: 'unblock_ip',
        targetType: 'security',
        targetId: cleanIp,
        reason,
        beforeValue: { ip: cleanIp },
        afterValue: null,
      }, client);
    });

    return res.json({ success: true, message: `IP [${cleanIp}] 已成功解除拦截` });
  } catch (err: any) {
    console.error('[Admin Unblock IP Error]', err);
    return res.status(500).json({ error: 'server_error', message: '解封 IP 失败' });
  }
});

// 23. 数据导出功能 (支持导出 users, orders, quota-logs 为带有 UTF-8 BOM 的标准 CSV)
function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

adminRouter.get('/admin/export/:entity', async (req: Request, res: Response) => {
  try {
    const { entity } = req.params;
    const { keyword, status, plan, startDate, endDate } = req.query;

    let headers: string[] = [];
    let rows: any[] = [];
    const nowStr = new Date().toISOString().slice(0, 10);

    if (entity === 'users') {
      const params: any[] = [];
      const where: string[] = [];
      if (keyword && typeof keyword === 'string' && keyword.trim()) {
        params.push(`%${keyword.trim()}%`);
        where.push(`(email ILIKE $${params.length} OR phone ILIKE $${params.length} OR nickname ILIKE $${params.length})`);
      }
      if (plan && typeof plan === 'string' && plan.trim()) {
        params.push(plan.trim());
        where.push(`plan = $${params.length}`);
      }
      if (status && typeof status === 'string' && status.trim()) {
        params.push(status.trim());
        where.push(`status = $${params.length}`);
      }
      if (startDate && typeof startDate === 'string' && startDate.trim()) {
        params.push(startDate.trim());
        where.push(`created_at >= $${params.length}::timestamptz`);
      }
      if (endDate && typeof endDate === 'string' && endDate.trim()) {
        params.push(endDate.trim());
        where.push(`created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const sql = `SELECT id, email, phone, nickname, plan, quota, total_quota, role, status, last_login_at, last_login_ip, created_at FROM users ${whereSql} ORDER BY created_at DESC LIMIT 5000`;
      const result = await query(sql, params);

      headers = ['用户ID', '邮箱', '手机号', '昵称', '套餐', '剩余点数', '累计发放点数', '角色', '状态', '最后登录时间', '最后登录IP', '注册时间'];
      rows = result.rows.map(r => [
        r.id,
        r.email || '',
        r.phone || '',
        r.nickname || '',
        r.plan || '',
        r.quota || '0',
        r.total_quota || '0',
        r.role || '',
        r.status || '',
        r.last_login_at ? new Date(r.last_login_at).toISOString() : '',
        r.last_login_ip || '',
        r.created_at ? new Date(r.created_at).toISOString() : '',
      ]);
    } else if (entity === 'orders') {
      const params: any[] = [];
      const where: string[] = [];
      if (keyword && typeof keyword === 'string' && keyword.trim()) {
        params.push(`%${keyword.trim()}%`);
        where.push(`(o.order_no ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR o.pay_trade_no ILIKE $${params.length})`);
      }
      if (status && typeof status === 'string' && status.trim()) {
        params.push(status.trim());
        where.push(`o.status = $${params.length}`);
      }
      if (startDate && typeof startDate === 'string' && startDate.trim()) {
        params.push(startDate.trim());
        where.push(`o.created_at >= $${params.length}::timestamptz`);
      }
      if (endDate && typeof endDate === 'string' && endDate.trim()) {
        params.push(endDate.trim());
        where.push(`o.created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const sql = `
        SELECT o.order_no, o.amount_cents, o.pay_channel, o.pay_trade_no, o.status, o.created_at, o.paid_at,
               u.email, u.phone, u.nickname, p.name as plan_name
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN plans p ON o.plan_id = p.id
        ${whereSql}
        ORDER BY o.created_at DESC LIMIT 5000
      `;
      const result = await query(sql, params);

      headers = ['订单编号', '创作者', '手机号/邮箱', '购买套餐', '金额(元)', '支付通道', '第三方交易号', '支付状态', '下单时间', '支付完成时间'];
      rows = result.rows.map(r => [
        r.order_no,
        r.nickname || r.email || r.phone || '',
        [r.phone, r.email].filter(Boolean).join(' / '),
        r.plan_name || '自定义',
        (r.amount_cents / 100).toFixed(2),
        r.pay_channel || '',
        r.pay_trade_no || '',
        r.status || '',
        r.created_at ? new Date(r.created_at).toISOString() : '',
        r.paid_at ? new Date(r.paid_at).toISOString() : '',
      ]);
    } else if (entity === 'quota-logs') {
      const params: any[] = [];
      const where: string[] = [];
      if (keyword && typeof keyword === 'string' && keyword.trim()) {
        params.push(`%${keyword.trim()}%`);
        where.push(`(u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR q.type ILIKE $${params.length} OR q.remark ILIKE $${params.length})`);
      }
      if (startDate && typeof startDate === 'string' && startDate.trim()) {
        params.push(startDate.trim());
        where.push(`q.created_at >= $${params.length}::timestamptz`);
      }
      if (endDate && typeof endDate === 'string' && endDate.trim()) {
        params.push(endDate.trim());
        where.push(`q.created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const sql = `
        SELECT q.id, q.amount, q.balance_after, q.type, q.remark, q.created_at,
               u.email, u.phone, u.nickname
        FROM quota_transactions q
        LEFT JOIN users u ON u.id = q.user_id
        ${whereSql}
        ORDER BY q.created_at DESC LIMIT 5000
      `;
      const result = await query(sql, params);

      headers = ['流水ID', '创作者', '变动点数', '变动后结存', '业务类型', '备注说明', '记录时间'];
      rows = result.rows.map(r => [
        r.id,
        r.nickname || r.email || r.phone || '',
        r.amount,
        r.balance_after,
        r.type,
        r.remark || '',
        r.created_at ? new Date(r.created_at).toISOString() : '',
      ]);
    } else if (entity === 'tasks') {
      const params: any[] = [];
      const where: string[] = [];
      if (keyword && typeof keyword === 'string' && keyword.trim()) {
        params.push(`%${keyword.trim()}%`);
        where.push(`(t.prompt ILIKE $${params.length} OR t.task_type ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length})`);
      }
      if (status && typeof status === 'string' && status.trim()) {
        params.push(status.trim());
        where.push(`t.status = $${params.length}`);
      }
      if (startDate && typeof startDate === 'string' && startDate.trim()) {
        params.push(startDate.trim());
        where.push(`t.created_at >= $${params.length}::timestamptz`);
      }
      if (endDate && typeof endDate === 'string' && endDate.trim()) {
        params.push(endDate.trim());
        where.push(`t.created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const sql = `
        SELECT t.id, t.task_type, t.status, t.progress, t.prompt, t.duration_ms, t.created_at,
               u.email, u.phone, u.nickname
        FROM user_tasks t
        LEFT JOIN users u ON t.user_id = u.id
        ${whereSql}
        ORDER BY t.created_at DESC LIMIT 5000
      `;
      const result = await query(sql, params);
      headers = ['任务ID', '创作者', '手机号/邮箱', '任务类型', '执行状态', '进度(%)', '耗时(ms)', 'Prompt提示词', '提交时间'];
      rows = result.rows.map(r => [
        r.id,
        r.nickname || r.email || r.phone || '',
        [r.phone, r.email].filter(Boolean).join(' / '),
        r.task_type,
        r.status,
        r.progress,
        r.duration_ms || 0,
        r.prompt || '',
        r.created_at ? new Date(r.created_at).toISOString() : '',
      ]);
    } else if (entity === 'media') {
      const params: any[] = [];
      const where: string[] = [];
      if (keyword && typeof keyword === 'string' && keyword.trim()) {
        params.push(`%${keyword.trim()}%`);
        where.push(`(m.storage_key ILIKE $${params.length} OR m.cdn_url ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
      }
      if (status && typeof status === 'string' && status.trim()) {
        params.push(status.trim());
        where.push(`m.asset_type = $${params.length}`);
      }
      if (startDate && typeof startDate === 'string' && startDate.trim()) {
        params.push(startDate.trim());
        where.push(`m.created_at >= $${params.length}::timestamptz`);
      }
      if (endDate && typeof endDate === 'string' && endDate.trim()) {
        params.push(endDate.trim());
        where.push(`m.created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const sql = `
        SELECT m.id, m.asset_type, m.storage_key, m.cdn_url, m.byte_size, m.mime_type, m.created_at,
               u.email, u.phone, u.nickname
        FROM media_assets m
        LEFT JOIN users u ON m.user_id = u.id
        ${whereSql}
        ORDER BY m.created_at DESC LIMIT 5000
      `;
      const result = await query(sql, params);
      headers = ['资产ID', '创作者', '资产类型', '对象存储Key', '访问URL', '体积(Bytes)', 'MIME类型', '登记时间'];
      rows = result.rows.map(r => [
        r.id,
        r.nickname || r.email || r.phone || '',
        r.asset_type,
        r.storage_key,
        r.cdn_url,
        r.byte_size,
        r.mime_type || '',
        r.created_at ? new Date(r.created_at).toISOString() : '',
      ]);
    } else if (entity === 'login-logs') {
      const params: any[] = [];
      const where: string[] = [];
      if (keyword && typeof keyword === 'string' && keyword.trim()) {
        params.push(`%${keyword.trim()}%`);
        where.push(`(l.account ILIKE $${params.length} OR l.ip ILIKE $${params.length} OR l.ip_location ILIKE $${params.length})`);
      }
      if (status && typeof status === 'string' && status.trim()) {
        params.push(status.trim());
        where.push(`l.status = $${params.length}`);
      }
      if (startDate && typeof startDate === 'string' && startDate.trim()) {
        params.push(startDate.trim());
        where.push(`l.created_at >= $${params.length}::timestamptz`);
      }
      if (endDate && typeof endDate === 'string' && endDate.trim()) {
        params.push(endDate.trim());
        where.push(`l.created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const sql = `
        SELECT l.id, l.account, l.ip, l.ip_location, l.user_agent, l.status, l.fail_reason, l.created_at
        FROM login_logs l
        ${whereSql}
        ORDER BY l.created_at DESC LIMIT 5000
      `;
      const result = await query(sql, params);
      headers = ['日志ID', '登录账号', '来源IP', 'IP归属地', '登录状态', '失败原因', 'User-Agent客户端', '尝试时间'];
      rows = result.rows.map(r => [
        r.id,
        r.account,
        r.ip,
        r.ip_location || '',
        r.status,
        r.fail_reason || '',
        r.user_agent || '',
        r.created_at ? new Date(r.created_at).toISOString() : '',
      ]);
    } else if (entity === 'audit') {
      const params: any[] = [];
      const where: string[] = [];
      if (keyword && typeof keyword === 'string' && keyword.trim()) {
        params.push(`%${keyword.trim()}%`);
        where.push(`(a.action ILIKE $${params.length} OR a.target_type ILIKE $${params.length} OR a.target_id ILIKE $${params.length} OR a.reason ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.nickname ILIKE $${params.length})`);
      }
      if (startDate && typeof startDate === 'string' && startDate.trim()) {
        params.push(startDate.trim());
        where.push(`a.created_at >= $${params.length}::timestamptz`);
      }
      if (endDate && typeof endDate === 'string' && endDate.trim()) {
        params.push(endDate.trim());
        where.push(`a.created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const sql = `
        SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.reason,
               a.before_value, a.after_value, a.created_at,
               u.email as actor_email, u.nickname as actor_nickname
        FROM admin_audit_logs a
        LEFT JOIN users u ON a.actor_id = u.id
        ${whereSql}
        ORDER BY a.created_at DESC LIMIT 5000
      `;
      const result = await query(sql, params);
      headers = ['审计ID', '操作者', '动作类型', '目标类型', '目标编号', '操作原因', '变更前状态', '变更后状态', '记录时间'];
      rows = result.rows.map(r => [
        r.id,
        r.actor_nickname || r.actor_email || r.actor_id || '系统',
        r.action,
        r.target_type,
        r.target_id || '',
        r.reason || '',
        JSON.stringify(r.before_value || {}),
        JSON.stringify(r.after_value || {}),
        r.created_at ? new Date(r.created_at).toISOString() : '',
      ]);
    } else {
      return res.status(400).json({ error: 'invalid_entity', message: '不支持的导出数据类型' });
    }

    const csvContent = '\uFEFF' + [
      headers.map(csvEscape).join(','),
      ...rows.map(r => r.map(csvEscape).join(',')),
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="metaarc-${entity}-${nowStr}.csv"`);
    return res.send(csvContent);
  } catch (err: any) {
    console.error('[Admin Export Error]', err);
    return res.status(500).json({ error: 'server_error', message: '导出数据失败' });
  }
});

// 24. 读取与更新客户端更新清单
adminRouter.get('/admin/releases/manifest', async (_req: Request, res: Response) => {
  try {
    const manifestPath = path.resolve(process.cwd(), 'updates', 'latest.json');
    const examplePath = path.resolve(process.cwd(), 'updates', 'latest.example.json');

    let manifest: any = null;
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch (err) {
        console.error('Failed to parse latest.json', err);
      }
    }

    if (!manifest && fs.existsSync(examplePath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
      } catch {}
    }

    if (!manifest) {
      manifest = {
        channel: 'stable',
        signed: true,
        releases: [],
      };
    }

    return res.json({
      success: true,
      data: manifest,
    });
  } catch (err: any) {
    console.error('[Admin Get Release Manifest Error]', err);
    return res.status(500).json({ error: 'server_error', message: '读取更新清单失败' });
  }
});

adminRouter.post('/admin/releases/manifest', async (req: Request, res: Response) => {
  try {
    const { channel = 'stable', signed = true, releases, reason } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length < 2) {
      return reasonRequired(res);
    }
    if (!Array.isArray(releases)) {
      return res.status(400).json({ error: 'invalid_releases', message: 'releases 必须是发布列表数组' });
    }

    // 校验每个 release entry
    for (const r of releases) {
      if (!r.platform || !['windows', 'macos', 'android', 'linux'].includes(r.platform)) {
        return res.status(400).json({ error: 'invalid_platform', message: `无效平台: ${r.platform}` });
      }
      if (!r.version || typeof r.version !== 'string') {
        return res.status(400).json({ error: 'invalid_version', message: `平台 ${r.platform} 缺少版本号` });
      }
    }

    const updatesDir = path.resolve(process.cwd(), 'updates');
    if (!fs.existsSync(updatesDir)) {
      fs.mkdirSync(updatesDir, { recursive: true });
    }
    const manifestPath = path.join(updatesDir, 'latest.json');
    const tmpPath = path.join(updatesDir, `latest.json.tmp.${Date.now()}`);

    let beforeValue: any = null;
    if (fs.existsSync(manifestPath)) {
      try {
        beforeValue = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {}
    }

    const newManifest = {
      channel,
      signed: Boolean(signed),
      updated_at: new Date().toISOString(),
      releases,
    };

    fs.writeFileSync(tmpPath, JSON.stringify(newManifest, null, 2), 'utf8');
    fs.renameSync(tmpPath, manifestPath);

    await runMutation(async (client) => {
      await insertAudit({
        actorId: actorId(req),
        action: 'update_release_manifest',
        targetType: 'system_updates',
        targetId: 'latest.json',
        reason: cleanReason(reason),
        beforeValue,
        afterValue: newManifest,
      }, client);
    });

    return res.json({
      success: true,
      message: '更新清单已保存并即时生效',
      data: newManifest,
    });
  } catch (err: any) {
    console.error('[Admin Save Release Manifest Error]', err);
    return res.status(500).json({ error: 'server_error', message: '保存更新清单失败' });
  }
});
