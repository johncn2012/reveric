import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { NewApiConnector } from '../services/new_api_connector.js';

export const ordersRouter = Router();
const newApi = new NewApiConnector();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 1. 创建订单
ordersRouter.post('/orders/create', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { planSlug, payChannel } = req.body; // payChannel: 'wechat' | 'alipay'

    // 查询目标套餐
    const planRes = await query('SELECT * FROM plans WHERE slug = $1 AND is_active = true', [planSlug]);
    if (planRes.rows.length === 0) {
      return res.status(404).json({ error: 'plan_not_found', message: '所选套餐不存在或已下架' });
    }
    const plan = planRes.rows[0];

    const insertSql = `
      INSERT INTO orders (user_id, plan_id, amount_cents, pay_channel, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING id, user_id, plan_id, amount_cents, pay_channel, status, created_at
    `;
    const orderRes = await query(insertSql, [userId, plan.id, plan.price_cents, payChannel || 'wechat']);
    const order = orderRes.rows[0];

    return res.status(201).json({
      success: true,
      order: {
        ...order,
        plan_name: plan.name,
        quota_points: plan.quota_points,
      },
    });
  } catch (err: any) {
    console.error('[Create Order Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '创建订单失败' });
  }
});

// 内部订单完成充值逻辑
async function completeOrderPayment(orderId: string, tradeNo: string) {
  const orderRes = await query(
    'SELECT o.*, p.slug as plan_slug, p.name as plan_name, p.quota_points FROM orders o JOIN plans p ON o.plan_id = p.id WHERE o.id = $1',
    [orderId]
  );
  if (orderRes.rows.length === 0) return null;
  const order = orderRes.rows[0];
  if (order.status === 'paid') return order;

  const addedPoints = parseFloat(order.quota_points);

  // 1. 更新订单为已支付
  await query(
    'UPDATE orders SET status = $1, pay_trade_no = $2, paid_at = NOW(), updated_at = NOW() WHERE id = $3',
    ['paid', tradeNo, order.id]
  );

  // 2. 更新用户的套餐、配额与总额度
  const userRes = await query(
    'UPDATE users SET plan = $1, quota = quota + $2, total_quota = total_quota + $2, updated_at = NOW() WHERE id = $3 RETURNING *',
    [order.plan_slug, addedPoints, order.user_id]
  );
  const updatedUser = userRes.rows[0];

  // 3. 记录额度流水
  await query(
    `INSERT INTO quota_transactions (user_id, amount, balance_after, type, reference_id, remark)
     VALUES ($1, $2, $3, 'purchase', $4, $5)`,
    [order.user_id, addedPoints, updatedUser.quota, order.id, `购买套餐：${order.plan_name}`]
  );

  // 4. 联动 New-API 充值
  if (updatedUser.new_api_user_id) {
    try {
      await newApi.topUpUserQuota({
        newApiUserId: updatedUser.new_api_user_id,
        metaarcPoints: addedPoints,
        remark: `MetaArc 订单 ${order.id} 充值`,
      });
    } catch (newApiErr) {
      console.error('[Pay Callback] New-API 充值异常:', newApiErr);
    }
  }

  return order;
}

// 2. 模拟支付 / 内部手动触发支付回调
ordersRouter.post('/orders/:id/pay', requireAuth, async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    if (!UUID_REGEX.test(orderId)) {
      return res.status(400).json({ error: 'invalid_order_id', message: '订单ID格式无效' });
    }

    const existingRes = await query('SELECT user_id, status FROM orders WHERE id = $1', [orderId]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'order_not_found', message: '订单不存在' });
    }

    if (existingRes.rows[0].user_id !== req.user!.userId && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'forbidden', message: '无权操作此订单' });
    }

    const tradeNo = `MANUAL_PAY_${Date.now()}`;
    const order = await completeOrderPayment(orderId, tradeNo);

    if (!order) {
      return res.status(404).json({ error: 'order_not_found', message: '订单不存在' });
    }

    return res.json({
      success: true,
      message: '支付成功，点数已即时到账！',
      order,
    });
  } catch (err: any) {
    console.error('[Pay Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '支付处理失败' });
  }
});

// 3. 生产环境通用异步支付通知 Webhook (对接微信/支付宝/易支付等)
ordersRouter.post('/orders/notify/:channel', async (req: Request, res: Response) => {
  try {
    const channel = req.params.channel;
    const body = req.body || {};
    // 支持各支付通道常用出参：out_trade_no 或 order_id
    const orderId = body.out_trade_no || body.order_id || req.query.out_trade_no;
    const tradeNo = body.trade_no || body.transaction_id || `NOTIFY_${Date.now()}`;

    if (!orderId) {
      return res.status(400).send('fail: missing orderId');
    }

    console.log(`[Payment Webhook Received] Channel: ${channel}, OrderId: ${orderId}, TradeNo: ${tradeNo}`);

    const result = await completeOrderPayment(orderId.toString(), tradeNo.toString());
    if (!result) {
      return res.status(404).send('fail: order not found');
    }

    if (channel === 'wechat') {
      return res.json({ code: 'SUCCESS', message: '成功' });
    }
    return res.send('success');
  } catch (err: any) {
    console.error('[Webhook Error]', err);
    return res.status(500).send('fail: server error');
  }
});

// 4. 查询当前用户的订单历史。
// 规范路径 GET /api/auth/orders，兼容 GET /api/user/orders。两条路径共用下面这个处理函数。
const listUserOrders = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const sql = `
      SELECT o.id, o.amount_cents, o.pay_channel, o.status, o.created_at, o.paid_at,
             p.name as plan_name, p.slug as plan_slug, p.quota_points
      FROM orders o
      JOIN plans p ON o.plan_id = p.id
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
    `;
    const result = await query(sql, [userId]);
    return res.json({ success: true, data: result.rows });
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
