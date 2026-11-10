import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signJwt, requireAuth } from '../middleware/auth.js';
import { NewApiConnector } from '../services/new_api_connector.js';

/**
 * 账号路径以 /api/auth/* 为规范。桌面端和同域 /account 使用这组路径。
 * 移动端还没有账号入口；接上时也走这里，不再使用 api 子域。
 * 挂在 /api 下，因此这里的 /auth/login 即 /api/auth/login。
 *
 * 规范路径（新客户端与 /account 使用）：
 * - POST /api/auth/register
 * - POST /api/auth/login
 * - GET  /api/auth/profile
 *
 * 兼容别名（门户旧脚本和已发出的客户端继续可用，行为与规范路径相同）：
 * - POST /api/register
 * - POST /api/login
 * - GET  /api/user/profile
 * - GET  /api/auth/user/profile
 *
 * 余额快照在 profile 的 quota、total_quota。流水别名在 tasks 路由：
 * GET /api/auth/quota/logs，兼容 GET /api/quota/logs。
 * 订单别名在 orders 路由：GET /api/auth/orders，兼容 GET /api/user/orders。
 */
export const authRouter = Router();
const newApi = new NewApiConnector();

function publicNewApiBaseUrl(): string {
  return (process.env.NEW_API_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
}

function mount(method: 'get' | 'post', paths: string[], handler: (req: Request, res: Response) => Promise<unknown>) {
  for (const path of paths) {
    authRouter[method](path, (req, res) => {
      void handler(req, res);
    });
  }
}

// 1. 用户注册。规范路径 POST /api/auth/register，兼容 POST /api/register。
const registerAccount = async (req: Request, res: Response) => {
  try {
    const { email, phone, password, nickname } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
    const cleanNickname = typeof nickname === 'string' ? nickname.trim() : '';

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'invalid_password', message: '密码长度至少为 6 位' });
    }
    if (!cleanEmail && !cleanPhone) {
      return res.status(400).json({ error: 'invalid_account', message: '必须提供手机号或邮箱' });
    }

    // 检查是否已存在
    const checkSql = 'SELECT id FROM users WHERE (email IS NOT NULL AND email = $1) OR (phone IS NOT NULL AND phone = $2)';
    const existing = await query(checkSql, [cleanEmail || '', cleanPhone || '']);
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
    const userRes = await query(insertSql, [cleanEmail || null, cleanPhone || null, passwordHash, cleanNickname || '创作者', initialQuota]);
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
        new_api_base_url: publicNewApiBaseUrl(),
      },
    });
  } catch (err: any) {
    console.error('[Register Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '注册服务暂时不可用' });
  }
};

// 2. 用户登录。规范路径 POST /api/auth/login，兼容 POST /api/login。
const loginAccount = async (req: Request, res: Response) => {
  try {
    const { account, password } = req.body;
    const cleanAccount = typeof account === 'string' ? account.trim() : '';
    if (!cleanAccount || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'missing_fields', message: '请输入账号与密码' });
    }

    // 支持手机号或邮箱登录
    const sql = 'SELECT * FROM users WHERE email = $1 OR phone = $1 LIMIT 1';
    const userRes = await query(sql, [cleanAccount]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'invalid_credentials', message: '账号或密码错误' });
    }

    const user = userRes.rows[0];
    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'account_suspended', message: '账号已被封禁，请联系管理员' });
    }

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
        new_api_base_url: publicNewApiBaseUrl(),
        expires_at: user.expires_at,
      },
    });
  } catch (err: any) {
    console.error('[Login Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '登录异常' });
  }
};

// 3. 获取个人资料及实时配额。
// 规范路径 GET /api/auth/profile。余额就是这里的 quota / total_quota，没有另一套演示数字。
const readProfile = async (req: Request, res: Response) => {
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
        new_api_base_url: publicNewApiBaseUrl(),
        expires_at: user.expires_at,
      },
    });
  } catch (err: any) {
    console.error('[Profile Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '获取个人资料失败' });
  }
};

// 4. 修改个人资料（昵称、手机号）
const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { nickname, phone } = req.body;
    const cleanNickname = typeof nickname === 'string' ? nickname.trim() : null;
    const cleanPhone = typeof phone === 'string' ? phone.trim() : null;

    const userRes = await query(
      'UPDATE users SET nickname = COALESCE($1, nickname), phone = COALESCE($2, phone), updated_at = NOW() WHERE id = $3 RETURNING id, email, phone, nickname, role, plan, quota, total_quota, created_at',
      [cleanNickname, cleanPhone, userId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '用户不存在' });
    }
    return res.json({ success: true, message: '资料更新成功', user: userRes.rows[0] });
  } catch (err: any) {
    console.error('[Update Profile Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '更新资料失败' });
  }
};

// 5. 修改登录密码
const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const oldPassword = req.body.oldPassword || req.body.old_password;
    const newPassword = req.body.newPassword || req.body.new_password;
    if (!oldPassword || !newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'invalid_password', message: '新密码长度至少为 6 位' });
    }

    const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '用户不存在' });
    }

    const match = await bcrypt.compare(oldPassword, userRes.rows[0].password_hash);
    if (!match) {
      return res.status(400).json({ error: 'wrong_password', message: '当前原密码不正确' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);

    return res.json({ success: true, message: '密码修改成功' });
  } catch (err: any) {
    console.error('[Change Password Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '修改密码失败' });
  }
};

mount('post', ['/auth/register', '/register'], registerAccount);
mount('post', ['/auth/login', '/login'], loginAccount);
for (const path of ['/auth/profile', '/auth/user/profile', '/user/profile']) {
  authRouter.get(path, requireAuth, (req, res) => {
    void readProfile(req, res);
  });
}
authRouter.post('/auth/update-profile', requireAuth, (req, res) => {
  void updateProfile(req, res);
});
authRouter.post('/auth/change-password', requireAuth, (req, res) => {
  void changePassword(req, res);
});
