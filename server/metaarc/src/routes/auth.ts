import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signJwt, requireAuth } from '../middleware/auth.js';
import { NewApiConnector } from '../services/new_api_connector.js';

export const authRouter = Router();
const newApi = new NewApiConnector();

// 1. 用户注册
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, phone, password, nickname } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'invalid_password', message: '密码长度至少为 6 位' });
    }
    if (!email && !phone) {
      return res.status(400).json({ error: 'invalid_account', message: '必须提供手机号或邮箱' });
    }

    // 检查是否已存在
    const checkSql = 'SELECT id FROM users WHERE (email IS NOT NULL AND email = $1) OR (phone IS NOT NULL AND phone = $2)';
    const existing = await query(checkSql, [email || '', phone || '']);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'user_exists', message: '该手机号或邮箱已被注册' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const initialQuota = 500; // 注册默认赠送 500 点算力

    // 插入本地用户
    const insertSql = `
      INSERT INTO users (email, phone, password_hash, nickname, plan, quota, total_quota, role)
      VALUES ($1, $2, $3, $4, 'free', $5, $5, 'user')
      RETURNING id, email, phone, nickname, plan, quota, total_quota, role, created_at
    `;
    const userRes = await query(insertSql, [email || null, phone || null, passwordHash, nickname || '创作者', initialQuota]);
    const newUser = userRes.rows[0];

    // 联动 New-API: 自动化创建 New-API 账号并签发专属 Token
    let newApiUserId: number | null = null;
    let newApiKey = '';
    try {
      const provision = await newApi.provisionUserAccount({
        id: newUser.id,
        email: newUser.email,
        phone: newUser.phone,
        nickname: newUser.nickname,
      });
      newApiUserId = provision.user.id;
      newApiKey = provision.token.key;

      // 为新用户充值初始赠送额度 (折算为 New-API quota)
      await newApi.topUpUserQuota({
        newApiUserId,
        metaarcPoints: initialQuota,
        remark: '注册赠送新人体验包',
      });

      // 更新本地用户关联的 new_api_key 与 new_api_user_id
      await query(
        'UPDATE users SET new_api_user_id = $1, new_api_key = $2, updated_at = NOW() WHERE id = $3',
        [newApiUserId, newApiKey, newUser.id]
      );
    } catch (newApiErr) {
      console.warn('[Register] New-API 自动接入异常（将使用本地离线模式）:', newApiErr);
      newApiKey = `sk-mock-${newUser.id.substring(0, 8)}`;
      await query(
        'UPDATE users SET new_api_key = $1, updated_at = NOW() WHERE id = $2',
        [newApiKey, newUser.id]
      );
    }

    const token = signJwt({
      userId: newUser.id,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
    });

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        phone: newUser.phone,
        nickname: newUser.nickname,
        role: newUser.role,
        plan: newUser.plan,
        quota: initialQuota,
        total_quota: initialQuota,
        new_api_key: newApiKey,
        new_api_base_url: process.env.NEW_API_PUBLIC_BASE_URL || 'https://api.metaarc.com.cn/v1',
      },
    });
  } catch (err: any) {
    console.error('[Register Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '注册服务暂时不可用' });
  }
});

// 2. 用户登录
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { account, password } = req.body;
    if (!account || !password) {
      return res.status(400).json({ error: 'missing_fields', message: '请输入账号与密码' });
    }

    // 支持手机号或邮箱登录
    const sql = 'SELECT * FROM users WHERE email = $1 OR phone = $1 LIMIT 1';
    const userRes = await query(sql, [account.trim()]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'invalid_credentials', message: '账号或密码错误' });
    }

    const user = userRes.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'invalid_credentials', message: '账号或密码错误' });
    }

    const token = signJwt({
      userId: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    });

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        nickname: user.nickname,
        role: user.role,
        plan: user.plan,
        quota: parseFloat(user.quota),
        total_quota: parseFloat(user.total_quota),
        new_api_key: user.new_api_key || '',
        new_api_base_url: process.env.NEW_API_PUBLIC_BASE_URL || 'https://api.metaarc.com.cn/v1',
        expires_at: user.expires_at,
      },
    });
  } catch (err: any) {
    console.error('[Login Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '登录异常' });
  }
});

// 3. 获取个人资料及实时配额
authRouter.get('/user/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const userRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '用户不存在' });
    }

    const user = userRes.rows[0];
    let quota = parseFloat(user.quota);

    // 如果关联了 New-API 用户，尝试实时查询 New-API 中的剩余配额
    if (user.new_api_user_id) {
      try {
        const remoteQuota = await newApi.queryUserQuota(user.new_api_user_id);
        if (remoteQuota !== null) {
          quota = remoteQuota.quota;
          // 同步到本地 DB
          await query('UPDATE users SET quota = $1 WHERE id = $2', [quota, userId]);
        }
      } catch (_) {}
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        nickname: user.nickname,
        role: user.role,
        plan: user.plan,
        quota,
        total_quota: parseFloat(user.total_quota),
        new_api_key: user.new_api_key || '',
        new_api_base_url: process.env.NEW_API_PUBLIC_BASE_URL || 'https://api.metaarc.com.cn/v1',
        expires_at: user.expires_at,
      },
    });
  } catch (err: any) {
    console.error('[Profile Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '获取个人资料失败' });
  }
});
