import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const plansRouter = Router();

plansRouter.get('/plans', async (_req: Request, res: Response) => {
  try {
    const sql = `
      SELECT id, name, slug, price_cents, billing_cycle, quota_points, 
             features, is_active, sort_order
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
