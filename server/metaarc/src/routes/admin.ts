import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { query, pool } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { NewApiConnector } from '../services/new_api_connector.js';
import { cleanReason, insertAudit, runMutation } from '../services/admin_audit.js';

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

    return res.json({
      success: true,
      data: {
        total_users: parseInt(userCountRes.rows[0].count, 10),
        today_new_users: parseInt(todayUserRes.rows[0].count, 10),
        today_revenue_yuan: (parseInt(todayRevenueRes.rows[0].total, 10) / 100).toFixed(2),
        total_revenue_yuan: (parseInt(totalRevenueRes.rows[0].total, 10) / 100).toFixed(2),
        active_tasks: parseInt(activeTasksRes.rows[0].count, 10),
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
    const { keyword, plan, status, filter, limit = '50', offset = '0' } = req.query;
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

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const parsedLimit = Math.max(1, Math.min(200, parseInt(limit as string, 10) || 50));
    const parsedOffset = Math.max(0, parseInt(offset as string, 10) || 0);
    params.push(parsedLimit);
    params.push(parsedOffset);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    return res.json({ success: true, data: result.rows });
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
    const apiKey = 'sk-metaarc-' + crypto.randomBytes(16).toString('hex');

    const newUser = await runMutation(async (client) => {
      const inserted = await client.query(
        `INSERT INTO users (email, phone, password_hash, nickname, role, status, plan, quota, total_quota, new_api_key)
         VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9)
         RETURNING id, email, phone, nickname, role, status, plan, quota, total_quota, new_api_key, created_at`,
        [cleanEmail, cleanPhone || null, hash, cleanNickname || null, cleanRole, cleanPlan, initQuota, initQuota, apiKey],
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
    const newApiKey = 'sk-metaarc-' + crypto.randomBytes(16).toString('hex');
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

    // 同步到 New-API
    if (updatedUser.new_api_user_id && delta > 0) {
      try {
        await newApi.topUpUserQuota({
          newApiUserId: updatedUser.new_api_user_id,
          metaarcPoints: delta,
          remark: `管理员手工调账：${reason || ''}`,
        });
      } catch (e) {
        console.error('[Admin Sync New-API Error]', e);
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

// 5. 全站订单列表
adminRouter.get('/admin/orders', async (req: Request, res: Response) => {
  try {
    const { status, userId, limit = '100' } = req.query;
    let sql = `
      SELECT o.id, o.user_id, o.amount_cents, o.pay_channel, o.status, o.created_at, o.paid_at,
             u.email, u.phone, u.nickname, p.name as plan_name, p.quota_points
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN plans p ON o.plan_id = p.id
    `;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (status && typeof status === 'string' && status.trim()) {
      params.push(status.trim());
      whereClauses.push(`o.status = $${params.length}`);
    }
    if (userId && typeof userId === 'string' && UUID_REGEX.test(userId.trim())) {
      params.push(userId.trim());
      whereClauses.push(`o.user_id = $${params.length}`);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const take = Math.min(Math.max(parseInt(limit as string, 10) || 100, 1), 200);
    sql += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1}`;
    params.push(take);

    const result = await query(sql, params);
    return res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[Admin Orders Error]', err);
    return res.status(500).json({ error: 'server_error', message: '订单列表获取失败' });
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

// 10. 管理员获取全平台任务调度队列
adminRouter.get('/admin/tasks', async (req: Request, res: Response) => {
  try {
    const { status, userId, limit } = req.query;
    const take = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 100);

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

    if (status && typeof status === 'string' && status.trim()) {
      params.push(status.trim());
      whereClauses.push(`t.status = $${params.length}`);
    }
    if (userId && typeof userId === 'string' && UUID_REGEX.test(userId.trim())) {
      params.push(userId.trim());
      whereClauses.push(`t.user_id = $${params.length}`);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    sql += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1}`;
    params.push(take);

    const result = await query(sql, params);
    return res.json({ success: true, data: result.rows });
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

    const sql = `
      UPDATE user_tasks
      SET status = 'failed',
          error_message = COALESCE(error_message, '管理员手动终止任务'),
          updated_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'running', 'processing')
      RETURNING *
    `;
    const result = await query(sql, [taskId]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'cannot_cancel', message: '任务不存在或已处于终态，无法终止' });
    }

    return res.json({ success: true, message: '任务已成功终止', task: result.rows[0] });
  } catch (err: any) {
    console.error('[Admin Cancel Task Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '终止任务失败' });
  }
});

// 12. 管理员查看云端媒体资源与存储统计
adminRouter.get('/admin/media', async (req: Request, res: Response) => {
  try {
    const { assetType, userId, limit } = req.query;
    const take = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 100);

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

    if (assetType && typeof assetType === 'string' && assetType.trim()) {
      params.push(assetType.trim());
      whereClauses.push(`m.asset_type = $${params.length}`);
    }
    if (userId && typeof userId === 'string' && UUID_REGEX.test(userId.trim())) {
      params.push(userId.trim());
      whereClauses.push(`m.user_id = $${params.length}`);
    }

    if (whereClauses.length > 0) {
      listSql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    listSql += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(take);

    const listRes = await query(listSql, params);

    return res.json({
      success: true,
      stats: {
        total_assets: parseInt(statsRes.rows[0].total_assets, 10) || 0,
        total_bytes: parseInt(statsRes.rows[0].total_bytes, 10) || 0,
        total_users: parseInt(statsRes.rows[0].total_users, 10) || 0,
      },
      data: listRes.rows,
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
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '媒体资源 ID 格式不正确' });
    }

    const delRes = await query('DELETE FROM media_assets WHERE id = $1 RETURNING id, storage_key', [id]);
    if (delRes.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '媒体资源不存在或已被删除' });
    }

    return res.json({
      success: true,
      message: '媒体资源已从云端登记簿中移除',
      id: delRes.rows[0].id,
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
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '任务 ID 格式不正确' });
    }

    const delRes = await query('DELETE FROM user_tasks WHERE id = $1 RETURNING id', [id]);
    if (delRes.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '任务记录不存在或已被删除' });
    }

    return res.json({
      success: true,
      message: '任务记录已从调度队列中删除',
      id: delRes.rows[0].id,
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
    const { status, keyword, limit = '50', offset = '0' } = req.query;
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

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const parsedLimit = Math.max(1, Math.min(200, parseInt(limit as string, 10) || 50));
    const parsedOffset = Math.max(0, parseInt(offset as string, 10) || 0);
    params.push(parsedLimit);
    params.push(parsedOffset);
    sql += ` ORDER BY l.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    return res.json({ success: true, data: result.rows });
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
    const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit || '50'), 10) || 50));
    const result = await query(
      `SELECT id, actor_id, action, target_type, target_id, reason, before_value, after_value, created_at
       FROM admin_audit_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    return res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[Admin Audit Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取变更审计' });
  }
});

adminRouter.get('/admin/quota-logs', async (req: Request, res: Response) => {
  try {
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
    const params: unknown[] = [];
    let where = '';
    if (keyword) {
      params.push(`%${keyword}%`);
      where = `WHERE u.email ILIKE $1 OR u.phone ILIKE $1 OR u.nickname ILIKE $1 OR q.type ILIKE $1 OR q.remark ILIKE $1`;
    }
    const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit || '50'), 10) || 50));
    params.push(limit);
    const result = await query(
      `SELECT q.id, q.user_id, q.amount, q.balance_after, q.type, q.remark, q.created_at,
              u.email, u.phone, u.nickname
       FROM quota_transactions q
       LEFT JOIN users u ON u.id = q.user_id
       ${where}
       ORDER BY q.created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[Admin Quota Logs Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取用量流水' });
  }
});
