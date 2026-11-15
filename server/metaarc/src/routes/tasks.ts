import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getClientIp } from '../utils/ip_helper.js';

export const tasksRouter = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 1. 创建异步调度任务
tasksRouter.post('/tasks/create', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { taskType, inputPayload, novelId, estimatedPoints } = req.body;

    if (!taskType) {
      return res.status(400).json({ error: 'missing_task_type', message: '必须指定任务类型' });
    }

    const clientIp = getClientIp(req);
    const prompt = (inputPayload && typeof inputPayload.prompt === 'string')
      ? inputPayload.prompt
      : (typeof req.body.prompt === 'string' ? req.body.prompt : null);

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

    // 检查当前运行中任务数是否超出套餐最大并发限制
    const [runningTasksRes, planRes] = await Promise.all([
      query("SELECT count(*) FROM user_tasks WHERE user_id = $1 AND status IN ('pending', 'running')", [userId]),
      query('SELECT u.plan, p.max_concurrency FROM users u LEFT JOIN plans p ON u.plan = p.slug WHERE u.id = $1', [userId]),
    ]);
    const activeTasksCount = parseInt(runningTasksRes.rows[0]?.count || '0', 10);
    const maxConcurrency = planRes.rows[0]?.max_concurrency || 1;
    // 允许排队队列有一定缓冲（最大并发数 * 4，最少 5 个），防止恶意滥发刷爆调度队列
    const maxQueueLimit = Math.max(5, maxConcurrency * 4);
    if (activeTasksCount >= maxQueueLimit) {
      return res.status(429).json({
        error: 'concurrency_limit_exceeded',
        message: `当前待处理与执行中任务数已达排队上限（${activeTasksCount}/${maxQueueLimit}），请等待排队任务完成后再发起新任务，或升级更高并发套餐档位。`,
      });
    }

    const insertSql = `
      INSERT INTO user_tasks (user_id, task_type, status, progress, input_payload, prompt, client_ip)
      VALUES ($1, $2, 'pending', 0, $3, $4, $5)
      RETURNING *
    `;
    const result = await query(insertSql, [
      userId,
      taskType,
      inputPayload ? JSON.stringify(inputPayload) : '{}',
      prompt,
      clientIp,
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

    let sql = `
      SELECT id, user_id, task_type, status, progress, input_payload, output_payload,
             prompt, client_ip, duration_ms, error_message, created_at, updated_at
      FROM user_tasks
      WHERE user_id = $1
    `;
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
    if (!UUID_REGEX.test(taskId)) {
      return res.status(400).json({ error: 'invalid_task_id', message: '任务ID格式无效' });
    }
    const userId = req.user!.userId;
    const { status, progress, outputPayload, actualPoints, errorMessage } = req.body;

    const taskRes = await query('SELECT * FROM user_tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'task_not_found', message: '任务不存在' });
    }
    const currentTask = taskRes.rows[0];

    // 计算执行耗时
    const durationMs = currentTask.created_at
      ? Math.max(0, Date.now() - new Date(currentTask.created_at).getTime())
      : null;

    // 更新任务
    const updateSql = `
      UPDATE user_tasks 
      SET status = COALESCE($1, status),
          progress = COALESCE($2, progress),
          output_payload = COALESCE($3, output_payload),
          error_message = $4,
          duration_ms = COALESCE($5, duration_ms),
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `;
    const updatedRes = await query(updateSql, [
      status || null,
      progress !== undefined ? progress : null,
      outputPayload ? JSON.stringify(outputPayload) : null,
      errorMessage || null,
      durationMs,
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

// 4. 用户取消自己的异步任务
tasksRouter.post('/tasks/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!UUID_REGEX.test(taskId)) {
      return res.status(400).json({ error: 'invalid_task_id', message: '任务ID格式无效' });
    }
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    const checkSql = isAdmin
      ? 'SELECT id, status FROM user_tasks WHERE id = $1'
      : 'SELECT id, status FROM user_tasks WHERE id = $1 AND user_id = $2';
    const checkParams = isAdmin ? [taskId] : [taskId, userId];
    const taskRes = await query(checkSql, checkParams);

    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'task_not_found', message: '任务不存在或无权操作' });
    }

    const task = taskRes.rows[0];
    if (task.status === 'completed' || task.status === 'cancelled') {
      return res.status(400).json({ error: 'invalid_status', message: `当前任务处于 ${task.status} 状态，无法取消` });
    }

    const updateRes = await query(
      "UPDATE user_tasks SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *",
      [taskId]
    );

    return res.json({
      success: true,
      message: '任务已取消',
      task: updateRes.rows[0],
    });
  } catch (err: any) {
    console.error('[User Cancel Task Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '取消任务失败' });
  }
});

// 4.1 用户重试自己的失败任务
tasksRouter.post('/tasks/:id/retry', requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!UUID_REGEX.test(taskId)) {
      return res.status(400).json({ error: 'invalid_task_id', message: '任务ID格式无效' });
    }
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    const checkSql = isAdmin
      ? 'SELECT id, status FROM user_tasks WHERE id = $1'
      : 'SELECT id, status FROM user_tasks WHERE id = $1 AND user_id = $2';
    const checkParams = isAdmin ? [taskId] : [taskId, userId];
    const taskRes = await query(checkSql, checkParams);

    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'task_not_found', message: '任务不存在或无权操作' });
    }

    const task = taskRes.rows[0];
    if (task.status !== 'failed') {
      return res.status(400).json({ error: 'invalid_status', message: '只有失败状态的任务才支持重试' });
    }

    const updateRes = await query(
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

    return res.json({
      success: true,
      message: '任务已重新排队等待调度执行',
      task: updateRes.rows[0],
    });
  } catch (err: any) {
    console.error('[User Retry Task Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '重试任务失败' });
  }
});

// 5. 用户删除自己的任务记录（管理员可删除任何人的）
tasksRouter.delete('/tasks/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!UUID_REGEX.test(taskId)) {
      return res.status(400).json({ error: 'invalid_task_id', message: '任务ID格式无效' });
    }
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    const delSql = isAdmin
      ? 'DELETE FROM user_tasks WHERE id = $1 RETURNING id'
      : 'DELETE FROM user_tasks WHERE id = $1 AND user_id = $2 RETURNING id';
    const delParams = isAdmin ? [taskId] : [taskId, userId];
    const delRes = await query(delSql, delParams);

    if (delRes.rows.length === 0) {
      return res.status(404).json({ error: 'task_not_found', message: '任务不存在或无权删除' });
    }

    return res.json({
      success: true,
      message: '任务记录已删除',
      id: delRes.rows[0].id,
    });
  } catch (err: any) {
    console.error('[Delete Task Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '删除任务失败' });
  }
});

// 6. 查询指定任务详情（含输入Prompt、输出交付物及执行指标）
tasksRouter.get('/tasks/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!UUID_REGEX.test(taskId)) {
      return res.status(400).json({ error: 'invalid_task_id', message: '任务ID格式无效' });
    }
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';

    const sql = isAdmin
      ? `SELECT t.*, u.email, u.phone, u.nickname FROM user_tasks t LEFT JOIN users u ON t.user_id = u.id WHERE t.id = $1`
      : `SELECT t.*, u.email, u.phone, u.nickname FROM user_tasks t LEFT JOIN users u ON t.user_id = u.id WHERE t.id = $1 AND t.user_id = $2`;
    const params = isAdmin ? [taskId] : [taskId, userId];

    const result = await query(sql, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'task_not_found', message: '任务不存在或无权查看' });
    }

    return res.json({ success: true, task: result.rows[0] });
  } catch (err: any) {
    console.error('[Get Task Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取任务详情' });
  }
});

// 7. 查询当前用户的配额流水。余额快照在 GET /api/auth/profile，这里是流水。
// 规范路径 GET /api/auth/quota/logs，兼容 GET /api/quota/logs。
const listQuotaLogs = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { type, page, pageSize, limit = '50', offset = '0' } = req.query;

    const params: any[] = [userId];
    const whereClauses: string[] = ['user_id = $1'];

    if (type && typeof type === 'string' && type.trim()) {
      params.push(type.trim());
      whereClauses.push(`type = $${params.length}`);
    }

    const countSql = `SELECT count(*) FROM quota_transactions WHERE ${whereClauses.join(' AND ')}`;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    let sql = `
      SELECT id, amount, balance_after, type, reference_id, remark, created_at
      FROM quota_transactions
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY created_at DESC
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
    console.error('[Quota Logs Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取算力流水' });
  }
};

for (const path of ['/auth/quota/logs', '/quota/logs']) {
  tasksRouter.get(path, requireAuth, (req, res) => {
    void listQuotaLogs(req, res);
  });
}
