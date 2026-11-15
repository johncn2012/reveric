import { Router, Request, Response } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { S3StorageService } from '../services/s3_storage_service.js';

export const mediaRouter = Router();
const s3Service = new S3StorageService();

// 1. 获取带有租户隔离的 S3 预签名直传凭据
mediaRouter.post('/media/upload-url', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { projectId, assetType, fileName, mimeType, byteSize } = req.body;

    if (!fileName || !assetType) {
      return res.status(400).json({ error: 'missing_params', message: '必须指定 fileName 和 assetType' });
    }

    // 校验云端对象存储配额
    const [usageRes, planRes] = await Promise.all([
      query('SELECT COALESCE(SUM(byte_size), 0) as total_bytes FROM media_assets WHERE user_id = $1', [userId]),
      query('SELECT u.plan, p.storage_limit_mb FROM users u LEFT JOIN plans p ON u.plan = p.slug WHERE u.id = $1', [userId]),
    ]);
    const currentBytes = parseInt(usageRes.rows[0]?.total_bytes || '0', 10);
    const limitMb = planRes.rows[0]?.storage_limit_mb || 500;
    const maxBytes = limitMb * 1024 * 1024;
    const incomingBytes = byteSize ? Math.max(0, parseInt(byteSize, 10)) : 0;
    if (currentBytes + incomingBytes > maxBytes) {
      return res.status(403).json({
        error: 'storage_quota_exceeded',
        message: `云端媒体存储空间已满（已用 ${(currentBytes / (1024 * 1024)).toFixed(1)} MB / 上限 ${limitMb} MB），请清理历史媒体或升级更高套餐档位。`,
      });
    }

    const presigned = await s3Service.createPresignedPutUrl({
      userId,
      projectId,
      assetType,
      fileName,
      mimeType: mimeType || 'application/octet-stream',
    });

    return res.json({
      success: true,
      data: presigned,
    });
  } catch (err: any) {
    console.error('[Presign URL Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '生成上传签名失败' });
  }
});

// 2. 客户端完成 S3 上传后确认登记资产
mediaRouter.post('/media/confirm', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { projectId, assetType, storageKey, cdnUrl, byteSize, mimeType, meta } = req.body;

    if (!storageKey || !cdnUrl) {
      return res.status(400).json({ error: 'missing_params', message: '缺少 storageKey 或 cdnUrl' });
    }

    const insertSql = `
      INSERT INTO media_assets (user_id, project_id, asset_type, storage_key, cdn_url, byte_size, mime_type, meta)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const result = await query(insertSql, [
      userId,
      projectId || null,
      assetType || 'image',
      storageKey,
      cdnUrl,
      byteSize || 0,
      mimeType || 'application/octet-stream',
      meta ? JSON.stringify(meta) : '{}',
    ]);

    return res.status(201).json({
      success: true,
      asset: result.rows[0],
    });
  } catch (err: any) {
    console.error('[Media Confirm Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '资产登记失败' });
  }
});

// 3. 查询当前用户或项目下的云端对象存储资产列表
mediaRouter.get('/media/list', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { projectId, assetType } = req.query;

    let sql = 'SELECT * FROM media_assets WHERE user_id = $1';
    const params: any[] = [userId];

    if (projectId) {
      params.push(projectId);
      sql += ` AND project_id = $${params.length}`;
    }
    if (assetType) {
      params.push(assetType);
      sql += ` AND asset_type = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC LIMIT 100';

    const result = await query(sql, params);
    return res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[Media List Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取媒体资产列表' });
  }
});

// 4. 用户删除自己的云端媒体资源（管理员可删除任何人的）
mediaRouter.delete('/media/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin';
    const { id } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      return res.status(400).json({ error: 'invalid_id', message: '媒体资产 ID 格式无效' });
    }

    let delRes;
    if (isAdmin) {
      delRes = await query('DELETE FROM media_assets WHERE id = $1 RETURNING id, storage_key', [id]);
    } else {
      delRes = await query(
        'DELETE FROM media_assets WHERE id = $1 AND user_id = $2 RETURNING id, storage_key',
        [id, userId]
      );
    }

    if (delRes.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: '媒体资产不存在或无权删除' });
    }

    return res.json({
      success: true,
      message: '媒体资产已成功删除',
      id: delRes.rows[0].id,
    });
  } catch (err: any) {
    console.error('[Media Delete Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '删除媒体资产失败' });
  }
});
