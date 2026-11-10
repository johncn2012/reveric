import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { NewApiConnector } from '../services/new_api_connector.js';

export const adminRouter = Router();
const newApi = new NewApiConnector();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const { keyword, limit = '50', offset = '0' } = req.query;
    let sql = 'SELECT id, email, phone, nickname, plan, quota, total_quota, role, new_api_key, created_at FROM users';
    const params: any[] = [];

    if (keyword) {
      params.push(`%${keyword}%`);
      sql += ` WHERE email ILIKE $1 OR phone ILIKE $1 OR nickname ILIKE $1`;
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

// 3. 人工调账（加点 / 扣点）
adminRouter.post('/admin/users/:id/adjust-quota', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    if (!UUID_REGEX.test(targetUserId)) {
      return res.status(400).json({ error: 'invalid_user_id', message: '用户ID格式无效' });
    }

    const { amount, reason } = req.body; // 正数加点，负数扣点

    if (amount === undefined || isNaN(Number(amount))) {
      return res.status(400).json({ error: 'invalid_amount', message: '必须指定有效调账金额' });
    }

    const delta = parseFloat(amount);
    if (!Number.isFinite(delta)) {
      return res.status(400).json({ error: 'invalid_amount', message: '必须指定有效调账金额' });
    }
    const userRes = await query(
      'UPDATE users SET quota = GREATEST(0, quota + $1), total_quota = total_quota + GREATEST(0, $1), updated_at = NOW() WHERE id = $2 RETURNING *',
      [delta, targetUserId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '目标用户不存在' });
    }
    const updatedUser = userRes.rows[0];

    // 记录审计流水
    await query(
      `INSERT INTO quota_transactions (user_id, amount, balance_after, type, remark)
       VALUES ($1, $2, $3, 'admin_grant', $4)`,
      [targetUserId, delta, updatedUser.quota, `管理员调账：${reason || '手工调整'}`]
    );

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
    console.error('[Admin Adjust Quota Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '调账失败' });
  }
});

// 4. 全站订单列表
adminRouter.get('/admin/orders', async (_req: Request, res: Response) => {
  try {
    const sql = `
      SELECT o.id, o.user_id, o.amount_cents, o.pay_channel, o.status, o.created_at, o.paid_at,
             u.email, u.phone, u.nickname, p.name as plan_name, p.quota_points
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN plans p ON o.plan_id = p.id
      ORDER BY o.created_at DESC
      LIMIT 100
    `;
    const result = await query(sql);
    return res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[Admin Orders Error]', err);
    return res.status(500).json({ error: 'server_error', message: '订单列表获取失败' });
  }
});
