import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const ordersRouter = Router();

function paymentUnavailable(_req: Request, res: Response) {
  return res.status(403).json({
    error: 'payment_unavailable',
    message: '在线支付尚未开通，不能创建或完成订单。',
  });
}

// 支付渠道未接入。创建、手动完成和未验签通知都不再发放点数。
ordersRouter.post('/orders/create', requireAuth, paymentUnavailable);
ordersRouter.post('/orders/:id/pay', requireAuth, paymentUnavailable);
ordersRouter.post('/orders/notify/:channel', paymentUnavailable);

// 4. 查询当前用户的订单历史。
// 规范路径 GET /api/auth/orders，兼容 GET /api/user/orders。两条路径共用下面这个处理函数。
const listUserOrders = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { status, page, pageSize, limit = '50', offset = '0' } = req.query;

    const params: any[] = [userId];
    const whereClauses: string[] = ['o.user_id = $1'];

    if (status && typeof status === 'string' && status.trim()) {
      params.push(status.trim());
      whereClauses.push(`o.status = $${params.length}`);
    }

    const countSql = `SELECT count(*) FROM orders o WHERE ${whereClauses.join(' AND ')}`;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    let sql = `
      SELECT o.id, o.order_no, o.amount_cents, o.pay_channel, o.pay_trade_no, o.status, o.created_at, o.paid_at,
             p.name as plan_name, p.slug as plan_slug, p.quota_points
      FROM orders o
      LEFT JOIN plans p ON o.plan_id = p.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY o.created_at DESC
    `;

    const parsedLimit = Math.max(1, Math.min(100, parseInt((pageSize || limit) as string, 10) || 50));
    const curPage = Math.max(1, parseInt(page as string, 10) || 1);
    const parsedOffset = page ? (curPage - 1) * parsedLimit : Math.max(0, parseInt(offset as string, 10) || 0);

    params.push(parsedLimit);
    params.push(parsedOffset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

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
    console.error('[User Orders Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取订单列表' });
  }
};

for (const path of ['/auth/orders', '/user/orders']) {
  ordersRouter.get(path, requireAuth, (req, res) => {
    void listUserOrders(req, res);
  });
}

// 5. 用户取消待支付的订单
const cancelUserOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const check = await query('SELECT id, status FROM orders WHERE id = $1 AND user_id = $2', [id, userId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'order_not_found', message: '订单不存在' });
    }
    if (check.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'invalid_status', message: '只有待支付状态的订单可以取消' });
    }
    const updateRes = await query("UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *", [id]);
    return res.json({ success: true, message: '订单已取消', order: updateRes.rows[0] });
  } catch (err: any) {
    console.error('[User Cancel Order Error]', err);
    return res.status(500).json({ error: 'server_error', message: '取消订单失败' });
  }
};

for (const path of ['/orders/:id/cancel', '/auth/orders/:id/cancel']) {
  ordersRouter.post(path, requireAuth, (req, res) => {
    void cancelUserOrder(req, res);
  });
}
