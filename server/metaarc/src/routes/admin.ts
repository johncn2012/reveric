import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, pool } from '../db.js';
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

    const userRes = await query(
      'UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, phone, nickname, plan, quota, total_quota, role',
      [plan, targetUserId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '目标用户不存在' });
    }

    return res.json({
      success: true,
      message: '套餐变更成功',
      user: userRes.rows[0],
    });
  } catch (err: any) {
    console.error('[Admin Set Plan Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '套餐设置失败' });
  }
});

// 5. 全站订单列表
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

    const newPassword = req.body.newPassword || req.body.new_password;
    const pwd = (typeof newPassword === 'string' && newPassword.trim().length >= 6)
      ? newPassword.trim()
      : `MetaArc@${Math.random().toString(36).substring(2, 8).toUpperCase()}!`;

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(pwd, salt);
    const userRes = await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, phone, nickname',
      [hash, targetUserId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '目标用户不存在' });
    }

    return res.json({
      success: true,
      message: '密码重置成功',
      temporary_password: pwd,
      newPassword: pwd,
      user: userRes.rows[0],
    });
  } catch (err: any) {
    console.error('[Admin Reset Password Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '重置密码失败' });
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

    const userRes = await query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, phone, nickname, status',
      [status, targetUserId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '目标用户不存在' });
    }

    return res.json({
      success: true,
      message: `用户状态已更新为 ${status === 'active' ? '正常' : '已封禁'}`,
      user: userRes.rows[0],
    });
  } catch (err: any) {
    console.error('[Admin Set Status Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '更新用户状态失败' });
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
    const { status, limit } = req.query;
    const take = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 100);

    let sql = `
      SELECT t.id, t.user_id, t.task_type, t.status, t.progress, t.error_message, t.created_at, t.updated_at,
             u.email, u.phone, u.nickname
      FROM user_tasks t
      LEFT JOIN users u ON t.user_id = u.id
    `;
    const params: any[] = [];
    if (status && typeof status === 'string') {
      params.push(status.trim());
      sql += ` WHERE t.status = $1`;
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
    const { assetType, limit } = req.query;
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
    if (assetType && typeof assetType === 'string') {
      params.push(assetType.trim());
      listSql += ` WHERE m.asset_type = $1`;
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
