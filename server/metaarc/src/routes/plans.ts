import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const plansRouter = Router();

plansRouter.get('/plans', async (_req: Request, res: Response) => {
  try {
    const sql = `
      SELECT id, name, slug, description, price_cents, billing_cycle, quota_points, 
             storage_limit_mb, max_concurrency, duration_days, features, is_active, sort_order
      FROM plans
      WHERE is_active = true
      ORDER BY sort_order ASC
    `;
    const result = await query(sql);
    return res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[Plans Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取套餐列表' });
  }
});

plansRouter.get('/plans/:idOrSlug', async (req: Request, res: Response) => {
  try {
    const { idOrSlug } = req.params;
    const sql = `
      SELECT id, name, slug, description, price_cents, billing_cycle, quota_points, 
             storage_limit_mb, max_concurrency, duration_days, features, is_active, sort_order
      FROM plans
      WHERE is_active = true AND (id = $1 OR slug = $1)
      LIMIT 1
    `;
    const result = await query(sql, [idOrSlug]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'plan_not_found', message: '套餐方案不存在或已下架' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    console.error('[Get Plan Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取指定套餐详情' });
  }
});
