import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const ordersRouter = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const REMITTANCE_INFO = {
  companyName: '北京元弧智能科技有限公司',
  bankName: '招商银行股份有限公司北京分行',
  bankAccount: '1109 4528 8910 801',
  supportEmail: 'contact@metaarc.com.cn',
  instructions: '请在银行转账附言/备注中务必填写您的【订单号】或【注册手机号】；完成转账后可在订单列表填写转账流水号，管理员核对到账后将立即为您开通套餐权益与算力配额。',
};

function paymentUnavailable(_req: Request, res: Response) {
  return res.status(403).json({
    error: 'payment_unavailable',
    message: '在线即时自动代扣渠道对接中，请选用对公转账或线下对账方式，或联系管理员开通。',
  });
}

// 1. 创建套餐订购订单 (支持企业对公转账、支付宝线下对账、微信线下对账)
const createOrder = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { planId, payChannel = 'bank_transfer', payTradeNo } = req.body;

    if (!planId || typeof planId !== 'string') {
      return res.status(400).json({ error: 'invalid_params', message: '请指定要订购的套餐档位' });
    }

    const cleanPlan = planId.trim();
    const planRes = await query(
      'SELECT id, name, slug, price_cents, quota_points, duration_days, is_active FROM plans WHERE (id = $1 OR slug = $1) AND is_active = TRUE',
      [cleanPlan]
    );

    if (planRes.rows.length === 0) {
      return res.status(404).json({ error: 'plan_not_found', message: '未找到指定套餐或该套餐暂未开放订购' });
    }

    const plan = planRes.rows[0];
    if (plan.price_cents <= 0) {
      return res.status(400).json({ error: 'invalid_plan', message: '基础体验版无需购买，注册后已自动享有基础算力' });
    }

    const allowedChannels = ['bank_transfer', 'offline_alipay', 'offline_wechat'];
    const channel = (payChannel && typeof payChannel === 'string') ? payChannel.trim().toLowerCase() : 'bank_transfer';
    if (!allowedChannels.includes(channel)) {
      return res.status(400).json({
        error: 'channel_unsupported',
        message: '在线即时自动代扣渠道对接中，请选用对公转账（bank_transfer）或线下对账渠道，管理员确认后将立即生效。',
      });
    }

    const tradeNo = (payTradeNo && typeof payTradeNo === 'string') ? payTradeNo.trim().slice(0, 128) : null;
    const orderNo = `MO${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const insertRes = await query(
      `INSERT INTO orders (order_no, user_id, plan_id, amount_cents, pay_channel, pay_trade_no, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())
       RETURNING *`,
      [orderNo, userId, plan.id, plan.price_cents, channel, tradeNo]
    );

    const order = insertRes.rows[0];
    return res.status(201).json({
      success: true,
      message: '转账订购单已生成，请根据以下对公转账指引完成付款',
      order: {
        ...order,
        plan_name: plan.name,
        plan_slug: plan.slug,
        quota_points: plan.quota_points,
      },
      paymentInfo: {
        ...REMITTANCE_INFO,
        amountYuan: (plan.price_cents / 100).toFixed(2),
        orderNo: order.order_no,
      },
    });
  } catch (err: any) {
    console.error('[Create Order Error]', err);
    return res.status(500).json({ error: 'server_error', message: '生成订单失败' });
  }
};

for (const path of ['/orders/create', '/auth/orders/create']) {
  ordersRouter.post(path, requireAuth, (req, res) => {
    void createOrder(req, res);
  });
}

// 2. 补充或登记付款流水凭据 (供管理员核账)
const submitOrderVoucher = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const { payTradeNo } = req.body;

    if (!payTradeNo || typeof payTradeNo !== 'string' || !payTradeNo.trim()) {
      return res.status(400).json({ error: 'missing_voucher', message: '请提供银行转账流水号或付款单号' });
    }

    const cleanTradeNo = payTradeNo.trim().slice(0, 128);
    const check = await query(
      'SELECT id, status FROM orders WHERE (id::text = $1 OR order_no = $1) AND user_id = $2',
      [id, userId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'order_not_found', message: '订单不存在' });
    }
    const orderRecord = check.rows[0];
    if (orderRecord.status !== 'pending') {
      return res.status(400).json({ error: 'invalid_status', message: '只有待对账/待审核状态的订单可提交或修改流水号' });
    }

    const updateRes = await query(
      "UPDATE orders SET pay_trade_no = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [cleanTradeNo, orderRecord.id]
    );

    return res.json({
      success: true,
      message: '付款凭单流水号已登记，管理员确认后将尽快为您核账并到账点数',
      order: updateRes.rows[0],
    });
  } catch (err: any) {
    console.error('[Submit Order Voucher Error]', err);
    return res.status(500).json({ error: 'server_error', message: '提交凭单失败' });
  }
};

for (const path of ['/orders/:id/voucher', '/auth/orders/:id/voucher']) {
  ordersRouter.post(path, requireAuth, (req, res) => {
    void submitOrderVoucher(req, res);
  });
}

// 3. 查询单笔订单详情
const getUserOrderDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const result = await query(
      `SELECT o.*, p.name as plan_name, p.slug as plan_slug, p.quota_points, p.description as plan_description
       FROM orders o
       LEFT JOIN plans p ON o.plan_id = p.id
       WHERE (o.id::text = $1 OR o.order_no = $1) AND o.user_id = $2`,
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'order_not_found', message: '订单不存在' });
    }
    const order = result.rows[0];
    return res.json({
      success: true,
      data: order,
      paymentInfo: {
        ...REMITTANCE_INFO,
        amountYuan: (order.amount_cents / 100).toFixed(2),
        orderNo: order.order_no,
      },
    });
  } catch (err: any) {
    console.error('[Get Order Detail Error]', err);
    return res.status(500).json({ error: 'server_error', message: '获取订单详情失败' });
  }
};

for (const path of ['/orders/:id', '/auth/orders/:id']) {
  ordersRouter.get(path, requireAuth, (req, res) => {
    void getUserOrderDetail(req, res);
  });
}

// 4. 查询当前用户的订单历史
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

for (const path of ['/auth/orders', '/user/orders', '/orders']) {
  ordersRouter.get(path, requireAuth, (req, res) => {
    void listUserOrders(req, res);
  });
}

// 5. 用户取消待支付的订单
const cancelUserOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const check = await query(
      'SELECT id, status FROM orders WHERE (id::text = $1 OR order_no = $1) AND user_id = $2',
      [id, userId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'order_not_found', message: '订单不存在' });
    }
    if (check.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'invalid_status', message: '只有待支付/待对账状态的订单可以取消' });
    }
    const updateRes = await query("UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *", [check.rows[0].id]);
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

// 6. 严防直接调用完成与回调通道
ordersRouter.post('/orders/:id/pay', requireAuth, paymentUnavailable);
ordersRouter.post('/orders/notify/:channel', paymentUnavailable);
