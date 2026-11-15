import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db.js';
import { signJwt, requireAuth } from '../middleware/auth.js';
import { NewApiConnector } from '../services/new_api_connector.js';
import { getClientIp, resolveIpLocation } from '../utils/ip_helper.js';

async function recordLoginLog(params: {
  userId?: string;
  account: string;
  ip: string;
  location?: string;
  userAgent?: string;
  status: 'success' | 'failed';
  failReason?: string;
}) {
  try {
    await query(
      `INSERT INTO login_logs (user_id, account, ip, ip_location, user_agent, status, fail_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        params.userId || null,
        params.account,
        params.ip,
        params.location || '未知归属地',
        params.userAgent || null,
        params.status,
        params.failReason || null,
      ]
    );
  } catch (err) {
    console.warn('[Record Login Log Warning]', err);
  }
}

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

async function ensureNewApiAccount(user: { id: string; email?: string; phone?: string; nickname?: string; quota?: string | number }) {
  try {
    const initialQuota = parseFloat(String(user.quota || '0'));
    const provision = await newApi.provisionUserAccount({
      id: user.id,
      email: user.email,
      phone: user.phone,
      nickname: user.nickname,
    });
    const newApiUserId = provision.user.id;
    const newApiKey = provision.token.key;

    if (initialQuota > 0) {
      try {
        await newApi.topUpUserQuota({
          newApiUserId,
          metaarcPoints: initialQuota,
          remark: '账号补建同步初始点数',
        });
      } catch (topUpErr) {
        console.warn(`[Auto-heal New-API] 充值同步失败:`, topUpErr);
      }
    }

    await query(
      'UPDATE users SET new_api_user_id = $1, new_api_key = $2, updated_at = NOW() WHERE id = $3',
      [newApiUserId, newApiKey, user.id]
    );
    return { newApiUserId, newApiKey };
  } catch (err) {
    console.warn(`[Auto-heal New-API] Failed for user ${user.id}:`, err);
    return null;
  }
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
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'invalid_email', message: '邮箱格式不正确' });
    }
    if (cleanPhone && !/^\+?[0-9]{5,20}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'invalid_phone', message: '手机号格式不正确' });
    }

    const clientIp = getClientIp(req);
    const userAgent = (req.headers['user-agent'] || '').slice(0, 255);
    const location = resolveIpLocation(clientIp, req.headers);

    // 防脚本批量灌水注册: 同 IP 1 小时内最多注册 10 个账号
    const regCheck = await query(
      `SELECT count(*) FROM users
       WHERE last_login_ip = $1 AND created_at >= NOW() - INTERVAL '1 hour'`,
      [clientIp]
    );
    const regCount = parseInt(regCheck.rows[0]?.count || '0', 10);
    if (regCount >= 10) {
      return res.status(429).json({
        error: 'too_many_registrations',
        message: '当前网络来源注册请求过于频繁，请稍后再试。',
      });
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
      INSERT INTO users (email, phone, password_hash, nickname, plan, quota, total_quota, role, last_login_ip, last_login_location, last_login_at)
      VALUES ($1, $2, $3, $4, 'free', $5, $5, 'user', $6, $7, NOW())
      RETURNING id, email, phone, nickname, plan, quota, total_quota, role, created_at
    `;
    const userRes = await query(insertSql, [
      cleanEmail || null,
      cleanPhone || null,
      passwordHash,
      cleanNickname || '创作者',
      initialQuota,
      clientIp,
      location,
    ]);
    const newUser = userRes.rows[0];

    // 记录首次注册安全日志
    await recordLoginLog({
      userId: newUser.id,
      account: cleanEmail || cleanPhone,
      ip: clientIp,
      location,
      userAgent,
      status: 'success',
      failReason: 'registration',
    });

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
      newApiKey = `sk-metaarc-${crypto.randomBytes(16).toString('hex')}`;
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
      sv: 0,
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

    const clientIp = getClientIp(req);
    const userAgent = (req.headers['user-agent'] || '').slice(0, 255);
    const location = resolveIpLocation(clientIp, req.headers);

    // 防暴力撞库与恶意扫描: 5 分钟内同 IP 连续失败 >= 10 次则临时封锁
    const bruteForceCheck = await query(
      `SELECT count(*) FROM login_logs
       WHERE ip = $1 AND status = 'failed' AND created_at >= NOW() - INTERVAL '5 minutes'`,
      [clientIp]
    );
    const failCount = parseInt(bruteForceCheck.rows[0]?.count || '0', 10);
    if (failCount >= 10) {
      await recordLoginLog({
        account: cleanAccount,
        ip: clientIp,
        location,
        userAgent,
        status: 'failed',
        failReason: 'rate_limited: 连续登录失败频次过高',
      });
      return res.status(429).json({
        error: 'too_many_attempts',
        message: '登录失败频次过高，该来源 IP 已被临时锁定 5 分钟，请稍后再试。',
      });
    }

    // 支持手机号或邮箱登录
    const sql = 'SELECT * FROM users WHERE email = $1 OR phone = $1 LIMIT 1';
    const userRes = await query(sql, [cleanAccount]);
    if (userRes.rows.length === 0) {
      await recordLoginLog({
        account: cleanAccount,
        ip: clientIp,
        location,
        userAgent,
        status: 'failed',
        failReason: 'account_not_found',
      });
      return res.status(401).json({ error: 'invalid_credentials', message: '账号或密码错误' });
    }

    const user = userRes.rows[0];
    if (user.status === 'suspended') {
      await recordLoginLog({
        userId: user.id,
        account: cleanAccount,
        ip: clientIp,
        location,
        userAgent,
        status: 'failed',
        failReason: 'account_suspended',
      });
      return res.status(403).json({ error: 'account_suspended', message: '账号已被封禁，请联系管理员' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      await recordLoginLog({
        userId: user.id,
        account: cleanAccount,
        ip: clientIp,
        location,
        userAgent,
        status: 'failed',
        failReason: 'wrong_password',
      });
      return res.status(401).json({ error: 'invalid_credentials', message: '账号或密码错误' });
    }

    await recordLoginLog({
      userId: user.id,
      account: cleanAccount,
      ip: clientIp,
      location,
      userAgent,
      status: 'success',
    });

    await query(
      'UPDATE users SET last_login_at = NOW(), last_login_ip = $1, last_login_location = $2, updated_at = NOW() WHERE id = $3',
      [clientIp, location, user.id]
    );

    // 检查订阅是否已过期，到期自动降级为基础体验版
    if (user.expires_at && new Date(user.expires_at) < new Date() && user.plan !== 'free') {
      await query("UPDATE users SET plan = 'free', updated_at = NOW() WHERE id = $1", [user.id]);
      user.plan = 'free';
    }

    // 若用户未绑定 New-API 账号，尝试延迟补建
    if (!user.new_api_user_id) {
      try {
        const healed = await ensureNewApiAccount(user);
        if (healed) {
          user.new_api_user_id = healed.newApiUserId;
          user.new_api_key = healed.newApiKey;
        }
      } catch (_) {}
    }

    const token = signJwt({
      userId: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      sv: Number(user.session_version) || 0,
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
        last_login_at: new Date().toISOString(),
        last_login_ip: clientIp,
        last_login_location: location,
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
    // 检查订阅是否已过期，到期自动降级为基础体验版
    if (user.expires_at && new Date(user.expires_at) < new Date() && user.plan !== 'free') {
      await query("UPDATE users SET plan = 'free', updated_at = NOW() WHERE id = $1", [user.id]);
      user.plan = 'free';
    }
    let quota = parseFloat(user.quota);

    // 如果未绑定 New-API 用户，尝试延迟补建
    if (!user.new_api_user_id) {
      try {
        const healed = await ensureNewApiAccount(user);
        if (healed) {
          user.new_api_user_id = healed.newApiUserId;
          user.new_api_key = healed.newApiKey;
        }
      } catch (_) {}
    }

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

    const [mediaUsageRes, planRes] = await Promise.all([
      query(
        'SELECT count(*) as count, COALESCE(SUM(byte_size), 0) as total_bytes FROM media_assets WHERE user_id = $1',
        [userId]
      ),
      query(
        'SELECT storage_limit_mb, max_concurrency FROM plans WHERE slug = $1',
        [user.plan]
      ),
    ]);

    const storageUsedBytes = parseInt(mediaUsageRes.rows[0]?.total_bytes || '0', 10);
    const mediaCount = parseInt(mediaUsageRes.rows[0]?.count || '0', 10);
    const storageLimitMb = planRes.rows[0]?.storage_limit_mb || 500;
    const maxConcurrency = planRes.rows[0]?.max_concurrency || 1;

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
        storage_used_bytes: storageUsedBytes,
        storage_limit_mb: storageLimitMb,
        media_count: mediaCount,
        max_concurrency: maxConcurrency,
        last_login_at: user.last_login_at,
        last_login_ip: user.last_login_ip,
        last_login_location: user.last_login_location,
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
    let cleanPhone = typeof phone === 'string' ? phone.trim() : null;

    if (cleanPhone) {
      if (!/^[0-9+ -]{6,20}$/.test(cleanPhone)) {
        return res.status(400).json({ error: 'invalid_phone', message: '手机号格式不正确' });
      }
      const dup = await query('SELECT id FROM users WHERE phone = $1 AND id != $2', [cleanPhone, userId]);
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'phone_exists', message: '该手机号已被其他账号绑定' });
      }
    }

    const userRes = await query(
      'UPDATE users SET nickname = COALESCE($1, nickname), phone = COALESCE($2, phone), updated_at = NOW() WHERE id = $3 RETURNING id, email, phone, nickname, role, plan, quota, total_quota, created_at',
      [cleanNickname, cleanPhone, userId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '用户不存在' });
    }
    return res.json({ success: true, message: '资料更新成功', user: userRes.rows[0] });
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'phone_exists', message: '该手机号已被其他账号绑定' });
    }
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
    const updated = await query(
      `UPDATE users
       SET password_hash = $1, session_version = session_version + 1, updated_at = NOW()
       WHERE id = $2
       RETURNING email, phone, role, session_version`,
      [newHash, userId],
    );
    const nextUser = updated.rows[0];
    const token = signJwt({
      userId,
      email: nextUser.email,
      phone: nextUser.phone,
      role: nextUser.role,
      sv: Number(nextUser.session_version) || 0,
    });

    return res.json({ success: true, message: '密码已更新，其他带会话版本的登录已退出', token });
  } catch (err: any) {
    console.error('[Change Password Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '修改密码失败' });
  }
};

/**
 * 用户重置 / 轮换专属 API 客户端密钥
 * POST /api/auth/reset-api-key
 */
const resetApiKey = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const userRes = await query('SELECT id, new_api_user_id, email, phone, nickname FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '用户不存在' });
    }

    const user = userRes.rows[0];
    let newApiKey = '';
    let newApiUserId = user.new_api_user_id;

    if (!newApiUserId) {
      const healed = await ensureNewApiAccount(user);
      if (healed) {
        newApiUserId = healed.newApiUserId;
        newApiKey = healed.newApiKey;
      }
    }

    if (newApiUserId && !newApiKey) {
      try {
        const token = await newApi.createTokenForUser({
          userId: newApiUserId,
          tokenName: `MetaArc Key - ${Date.now().toString(36)}`,
        });
        newApiKey = token.key;
      } catch (tokenErr) {
        console.warn('[Reset API Key] New-API 签发异常，降级生成标准离线 Key', tokenErr);
        newApiKey = `sk-metaarc-${crypto.randomBytes(16).toString('hex')}`;
      }
    } else if (!newApiKey) {
      newApiKey = `sk-metaarc-${crypto.randomBytes(16).toString('hex')}`;
    }

    await query('UPDATE users SET new_api_key = $1, updated_at = NOW() WHERE id = $2', [newApiKey, userId]);

    return res.json({
      success: true,
      message: 'API 密钥已重置并立即生效',
      new_api_key: newApiKey,
      new_api_base_url: publicNewApiBaseUrl(),
    });
  } catch (err: any) {
    console.error('[Reset API Key Error]', err);
    return res.status(500).json({ error: 'server_error', message: err.message || '重置 API 密钥失败' });
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
authRouter.post('/auth/forgot-password', (_req, res) => {
  res.status(501).json({
    error: 'reset_unavailable',
    message: '找回密码尚未开通。请写信到 contact@metaarc.com.cn。本次没有发送重置邮件。',
  });
});
authRouter.post('/auth/logout-others', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const updated = await query(
      `UPDATE users
       SET session_version = session_version + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING email, phone, role, session_version`,
      [userId],
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '用户不存在' });
    }
    const nextUser = updated.rows[0];
    const token = signJwt({
      userId,
      email: nextUser.email,
      phone: nextUser.phone,
      role: nextUser.role,
      sv: Number(nextUser.session_version) || 0,
    });
    return res.json({
      success: true,
      message: '其他带会话版本的网页登录已退出。更早签发、没有会话版本的客户端登录态会保持到过期。',
      token,
    });
  } catch (err: any) {
    console.error('[Logout Others Error]', err);
    return res.status(500).json({ error: 'server_error', message: '退出其他会话失败' });
  }
});
authRouter.post('/auth/reset-api-key', requireAuth, (req, res) => {
  void resetApiKey(req, res);
});
authRouter.get('/auth/login-logs', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const result = await query(
      `SELECT id, ip, ip_location, user_agent, status, fail_reason, created_at
       FROM login_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [userId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[Login Logs Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取登录日志' });
  }
});
