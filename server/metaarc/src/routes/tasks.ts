import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const tasksRouter = Router();

// 1. 创建异步调度任务
tasksRouter.post('/tasks/create', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { taskType, inputPayload, novelId, estimatedPoints } = req.body;

    if (!taskType) {
      return res.status(400).json({ error: 'missing_task_type', message: '必须指定任务类型' });
    }

    // 检查余额是否足够
    const userRes = await query('SELECT quota FROM users WHERE id = $1', [userId]);
    const currentQuota = parseFloat(userRes.rows[0]?.quota || '0');
    const est = estimatedPoints ? parseFloat(estimatedPoints) : 0;

    if (currentQuota < est) {
      return res.status(402).json({
        error: 'insufficient_quota',
        message: `算力不足，当前剩余 ${currentQuota} 点，预估需要 ${est} 点，请先充值`,
      });
    }

    const insertSql = `
      INSERT INTO user_tasks (user_id, task_type, status, progress, input_payload)
      VALUES ($1, $2, 'pending', 0, $3)
      RETURNING *
    `;
    const result = await query(insertSql, [
      userId,
      taskType,
      inputPayload ? JSON.stringify(inputPayload) : '{}',
    ]);

    return res.status(201).json({
      success: true,
      task: result.rows[0],
    });
  } catch (err: any) {
    console.error('[Create Task Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '创建任务失败' });
  }
});

// 2. 查询当前用户的任务调度队列
tasksRouter.get('/tasks/list', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { status } = req.query;

    let sql = 'SELECT * FROM user_tasks WHERE user_id = $1';
    const params: any[] = [userId];

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC LIMIT 50';

    const result = await query(sql, params);
    return res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[Task List Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取任务列表' });
  }
});

// 3. 更新任务进度与完成结算（扣除配额）
tasksRouter.post('/tasks/:id/update-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const userId = req.user!.userId;
    const { status, progress, outputPayload, actualPoints, errorMessage } = req.body;

    const taskRes = await query('SELECT * FROM user_tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'task_not_found', message: '任务不存在' });
    }
    const currentTask = taskRes.rows[0];

    // 更新任务
    const updateSql = `
      UPDATE user_tasks 
      SET status = COALESCE($1, status),
          progress = COALESCE($2, progress),
          output_payload = COALESCE($3, output_payload),
          error_message = $4,
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `;
    const updatedRes = await query(updateSql, [
      status || null,
      progress !== undefined ? progress : null,
      outputPayload ? JSON.stringify(outputPayload) : null,
      errorMessage || null,
      taskId,
    ]);

    // 如果任务完成且产生了实际扣费，且先前尚未扣费
    if (status === 'completed' && actualPoints && parseFloat(actualPoints) > 0 && currentTask.status !== 'completed') {
      const points = parseFloat(actualPoints);
      const userUpdateRes = await query(
        'UPDATE users SET quota = GREATEST(0, quota - $1), updated_at = NOW() WHERE id = $2 RETURNING quota',
        [points, userId]
      );
      const newQuota = userUpdateRes.rows[0].quota;

      // 记流水
      await query(
        `INSERT INTO quota_transactions (user_id, amount, balance_after, type, reference_id, remark)
         VALUES ($1, $2, $3, 'consumption', $4, $5)`,
        [userId, -points, newQuota, taskId, `任务完成结算：${currentTask.task_type}`]
      );
    }

    return res.json({
      success: true,
      task: updatedRes.rows[0],
    });
  } catch (err: any) {
    console.error('[Update Task Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '更新任务状态失败' });
  }
});

// 4. 查询当前用户的配额流水明细（可量化明细）
tasksRouter.get('/quota/logs', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const sql = `
      SELECT id, amount, balance_after, type, reference_id, remark, created_at
      FROM quota_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `;
    const result = await query(sql, [userId]);
    return res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[Quota Logs Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取算力流水' });
  }
});
