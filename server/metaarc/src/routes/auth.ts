import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db.js';
import { signJwt, requireAuth } from '../middleware/auth.js';
import { NewApiConnector } from '../services/new_api_connector.js';
import { getClientIp, resolveIpLocation, getIpSubnetPrefix } from '../utils/ip_helper.js';
import { getSystemSecuritySettings, getPublicAuthConfig } from '../services/system_settings_service.js';
import { generateCaptcha, verifyCaptcha } from '../services/captcha_service.js';
import { sendRegisterEmailCode, sendResetPasswordEmailCode, verifyEmailCode } from '../services/email_service.js';
import { verifyTurnstileToken } from '../services/turnstile_service.js';
import { checkEmailDomainPolicy } from '../services/email_shield.js';

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
  const custom = (process.env.NEW_API_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (custom) return custom;
  const appOrigin = (process.env.APP_URL || process.env.BASE_URL || 'https://metaarc.com.cn').trim().replace(/\/$/, '');
  return `${appOrigin}/v1`;
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
    const settings = await getSystemSecuritySettings();

    // 1. 注册功能开启 / 关闭检查与准入模式 (open:自由开放, invite_only:内测邀请码, closed:暂停注册)
    const regMode = settings.registration_mode || (settings.allow_registration ? 'open' : 'closed');
    if (regMode === 'closed' || !settings.allow_registration) {
      return res.status(403).json({
        error: 'registration_closed',
        message: '当前系统已暂停开放新用户自主注册，请联系管理员或稍后重试。',
      });
    }

    const { email, phone, password, nickname, email_code, turnstile_token, invite_code } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
    const cleanNickname = typeof nickname === 'string' ? nickname.trim() : '';
    const cleanInviteCode = typeof invite_code === 'string' ? invite_code.trim().toUpperCase() : '';

    // 2. 内测邀请码模式准入与校验
    if (regMode === 'invite_only' && !cleanInviteCode) {
      return res.status(400).json({
        error: 'invite_code_required',
        message: '当前系统处于内测特邀阶段，必须填写有效邀请码方可注册。',
      });
    }

    let verifiedInvite: any = null;
    if (cleanInviteCode) {
      const inviteRes = await query(
        'SELECT * FROM invite_codes WHERE UPPER(code) = $1 LIMIT 1',
        [cleanInviteCode]
      );
      if (inviteRes.rows.length === 0) {
        return res.status(400).json({
          error: 'invalid_invite_code',
          message: '输入的邀请码不存在或已作废，请核对后重试。',
        });
      }
      const inv = inviteRes.rows[0];
      if (inv.status !== 'active') {
        return res.status(400).json({
          error: 'invite_code_disabled',
          message: '该邀请码已被管理员禁用。',
        });
      }
      if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
        return res.status(400).json({
          error: 'invite_code_expired',
          message: '该邀请码已过期失效。',
        });
      }
      if (inv.max_uses > 0 && inv.used_count >= inv.max_uses) {
        return res.status(400).json({
          error: 'invite_code_exhausted',
          message: '该邀请码可用次数已达上限。',
        });
      }
      verifiedInvite = inv;
    }

    const clientIp = getClientIp(req);
    const userAgent = (req.headers['user-agent'] || '').slice(0, 255);
    const location = resolveIpLocation(clientIp, req.headers);

    // 3. Cloudflare Turnstile 人机验证校验
    if (settings.cf_turnstile_enabled && settings.cf_turnstile_site_key) {
      const token = turnstile_token || req.body['cf-turnstile-response'];
      const passed = await verifyTurnstileToken(token, clientIp);
      if (!passed) {
        return res.status(400).json({
          error: 'invalid_turnstile',
          message: '人机交互安全校验未通过，请完成验证后再提交。',
        });
      }
    }

    // 4. 同 IP 24小时内注册频率限制
    const maxPerIpDay = typeof settings.max_reg_per_ip_day === 'number' ? settings.max_reg_per_ip_day : 5;
    if (maxPerIpDay > 0) {
      const regCheck = await query(
        `SELECT count(*) FROM users
         WHERE (reg_ip = $1 OR last_login_ip = $1) AND created_at >= NOW() - INTERVAL '24 hours'`,
        [clientIp]
      );
      const regCount = parseInt(regCheck.rows[0]?.count || '0', 10);
      if (regCount >= maxPerIpDay) {
        return res.status(429).json({
          error: 'too_many_registrations',
          message: `当前网络来源今日注册账号已达上限（单日最多允许 ${maxPerIpDay} 个账号），请明天再试。`,
        });
      }
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'invalid_password', message: '密码长度至少为 6 位' });
    }
    if (!cleanEmail && !cleanPhone) {
      return res.status(400).json({ error: 'invalid_account', message: '必须提供手机号或邮箱' });
    }
    if (cleanEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'invalid_email', message: '邮箱格式不正确' });
      }
      // 5. 邮箱准入控制 (临时一次性邮箱拦截、白名单/黑名单校验)
      const emailPolicy = checkEmailDomainPolicy(cleanEmail, settings);
      if (!emailPolicy.allowed) {
        return res.status(400).json({
          error: 'disallowed_email_domain',
          message: emailPolicy.reason || '不支持使用该邮箱注册',
        });
      }
    }
    if (cleanPhone && !/^\+?[0-9]{5,20}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'invalid_phone', message: '手机号格式不正确' });
    }

    // 6. 注册邮箱验证码校验 (若系统开启，强制要求邮箱注册并核验验证码，防止虚假手机号绕过)
    if (settings.require_email_code) {
      if (!cleanEmail) {
        return res.status(400).json({
          error: 'email_required',
          message: '系统当前已开启邮箱安全校验，请使用邮箱地址进行注册。',
        });
      }
      if (!email_code || typeof email_code !== 'string' || !email_code.trim()) {
        return res.status(400).json({ error: 'missing_email_code', message: '请输入邮箱收到的验证码' });
      }
      const verifyRes = await verifyEmailCode(cleanEmail, email_code.trim(), 'register');
      if (!verifyRes.success) {
        return res.status(400).json({ error: 'invalid_email_code', message: verifyRes.message || '邮箱验证码错误或已失效，请重新获取' });
      }
    }

    // 检查是否已存在
    const checkSql = 'SELECT id FROM users WHERE (email IS NOT NULL AND email = $1) OR (phone IS NOT NULL AND phone = $2)';
    const existing = await query(checkSql, [cleanEmail || '', cleanPhone || '']);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'user_exists', message: '该手机号或邮箱已被注册' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const bonusQuota = verifiedInvite ? (parseInt(verifiedInvite.bonus_quota, 10) || 0) : 0;
    const initialQuota = 500 + bonusQuota; // 注册默认赠送 500 点算力 + 邀请码奖励
    const targetPlan = (verifiedInvite && verifiedInvite.target_plan) ? verifiedInvite.target_plan : 'free';

    // 插入本地用户，显式记录 reg_ip, reg_location, reg_ip_prefix, invited_by_code
    const ipPrefix = getIpSubnetPrefix(clientIp);
    const insertSql = `
      INSERT INTO users (email, phone, password_hash, nickname, plan, quota, total_quota, role, last_login_ip, last_login_location, last_login_at, reg_ip, reg_location, reg_ip_prefix, invited_by_code)
      VALUES ($1, $2, $3, $4, $5, $6, $6, 'user', $7, $8, NOW(), $7, $8, $9, $10)
      RETURNING id, email, phone, nickname, plan, quota, total_quota, role, created_at
    `;
    const userRes = await query(insertSql, [
      cleanEmail || null,
      cleanPhone || null,
      passwordHash,
      cleanNickname || '创作者',
      targetPlan,
      initialQuota,
      clientIp,
      location,
      ipPrefix,
      verifiedInvite ? verifiedInvite.code : null,
    ]);
    const newUser = userRes.rows[0];

    // 原子增加邀请码使用次数
    if (verifiedInvite) {
      await query(
        'UPDATE invite_codes SET used_count = used_count + 1 WHERE code = $1',
        [verifiedInvite.code]
      );
    }

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
    const settings = await getSystemSecuritySettings();
    const { account, password, captcha_id, captcha_code, turnstile_token } = req.body;
    const cleanAccount = typeof account === 'string' ? account.trim() : '';
    if (!cleanAccount || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'missing_fields', message: '请输入账号与密码' });
    }

    const clientIp = getClientIp(req);
    const userAgent = (req.headers['user-agent'] || '').slice(0, 255);
    const location = resolveIpLocation(clientIp, req.headers);

    // 1. Cloudflare Turnstile 人机验证校验 (若开启)
    if (settings.cf_turnstile_enabled && settings.cf_turnstile_site_key) {
      const token = turnstile_token || req.body['cf-turnstile-response'];
      const passed = await verifyTurnstileToken(token, clientIp);
      if (!passed) {
        return res.status(400).json({
          error: 'invalid_turnstile',
          message: '人机交互安全校验未通过，请完成验证后再登录。',
        });
      }
    }

    // 2. 登录图形验证码校验 (若开启)
    if (settings.require_login_captcha) {
      const valid = verifyCaptcha(captcha_id, captcha_code);
      if (!valid) {
        await recordLoginLog({
          account: cleanAccount,
          ip: clientIp,
          location,
          userAgent,
          status: 'failed',
          failReason: 'invalid_captcha: 图形验证码错误或已过期',
        });
        return res.status(400).json({
          error: 'invalid_captcha',
          message: '图形验证码错误或已过期，请点击验证码刷新后重新输入',
        });
      }
    }

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

    // 支持手机号、邮箱或管理员快捷别名登录
    const sql = `
      SELECT * FROM users 
      WHERE email = $1 OR phone = $1 OR (role = 'admin' AND ($1 = 'admin' OR $1 = 'root'))
      LIMIT 1
    `;
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

    const ipPrefix = getIpSubnetPrefix(clientIp);
    await query(
      `UPDATE users 
       SET last_login_at = NOW(), 
           last_login_ip = $1, 
           last_login_location = $2, 
           reg_ip = COALESCE(reg_ip, $1), 
           reg_location = COALESCE(reg_location, $2), 
           reg_ip_prefix = COALESCE(reg_ip_prefix, $3), 
           updated_at = NOW() 
       WHERE id = $4`,
      [clientIp, location, ipPrefix, user.id]
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

    // 异地登录告警检测：对比最近两次成功登录的地点与网络特征
    let securityAlert: any = null;
    try {
      const recentLoginsRes = await query(
        `SELECT ip, ip_location, created_at FROM login_logs 
         WHERE user_id = $1 AND status = 'success' 
         ORDER BY created_at DESC LIMIT 2`,
        [userId]
      );
      if (recentLoginsRes.rows.length >= 2) {
        const curLogin = recentLoginsRes.rows[0];
        const prevLogin = recentLoginsRes.rows[1];
        const curLoc = (curLogin.ip_location || '').trim();
        const prevLoc = (prevLogin.ip_location || '').trim();
        const isLocalOrUnknown = (loc: string) =>
          !loc || loc.includes('未知') || loc.includes('局域网') || loc.includes('本地');

        if (!isLocalOrUnknown(curLoc) && !isLocalOrUnknown(prevLoc) && curLoc !== prevLoc) {
          securityAlert = {
            is_cross_region: true,
            current_location: curLoc,
            current_ip: curLogin.ip,
            prev_location: prevLoc,
            prev_ip: prevLogin.ip,
            prev_time: prevLogin.created_at,
            message: `检测到本次登录地点（${curLoc}）与上次（${prevLoc}）存在异地变动，若非本人操作请立即前往修改密码。`,
          };
        }
      }
    } catch (alertErr) {
      console.warn('[Profile Security Alert Warning]', alertErr);
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
        storage_used_bytes: storageUsedBytes,
        storage_limit_mb: storageLimitMb,
        media_count: mediaCount,
        max_concurrency: maxConcurrency,
        last_login_at: user.last_login_at,
        last_login_ip: user.last_login_ip,
        last_login_location: user.last_login_location,
        expires_at: user.expires_at,
        security_alert: securityAlert,
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

// 3. 获取前台公开认证与安全策略配置
const getAuthConfig = async (_req: Request, res: Response) => {
  try {
    const config = await getPublicAuthConfig();
    return res.json({ success: true, data: config });
  } catch (err: any) {
    console.error('[Get Auth Config Error]', err);
    return res.status(500).json({ error: 'server_error', message: '无法获取安全配置' });
  }
};

// 4. 生成登录图形验证码
const getAuthCaptcha = async (_req: Request, res: Response) => {
  try {
    const captcha = generateCaptcha(4);
    return res.json({
      success: true,
      data: {
        captchaId: captcha.captchaId,
        svg: captcha.svg,
        dataUri: captcha.dataUri,
      },
    });
  } catch (err: any) {
    console.error('[Generate Captcha Error]', err);
    return res.status(500).json({ error: 'server_error', message: '验证码生成失败' });
  }
};

// 5. 发送注册邮箱验证码
const sendEmailCode = async (req: Request, res: Response) => {
  try {
    const { email, turnstile_token } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'invalid_email', message: '请输入有效的邮箱地址' });
    }

    const settings = await getSystemSecuritySettings();
    const regMode = settings.registration_mode || (settings.allow_registration ? 'open' : 'closed');
    if (regMode === 'closed' || !settings.allow_registration) {
      return res.status(403).json({ error: 'registration_closed', message: '当前系统已暂停开放新用户注册' });
    }

    // 邮箱准入控制 (临时一次性邮箱拦截、白名单/黑名单校验)
    const emailPolicy = checkEmailDomainPolicy(cleanEmail, settings);
    if (!emailPolicy.allowed) {
      return res.status(400).json({
        error: 'disallowed_email_domain',
        message: emailPolicy.reason || '不支持使用该邮箱获取验证码',
      });
    }

    const clientIp = getClientIp(req);

    // 如果开启了 Turnstile，发送邮箱验证码前也必须校验 Turnstile，防止机器人自动化刷邮件轰炸
    if (settings.cf_turnstile_enabled && settings.cf_turnstile_site_key) {
      const token = turnstile_token || req.body['cf-turnstile-response'];
      const passed = await verifyTurnstileToken(token, clientIp);
      if (!passed) {
        return res.status(400).json({ error: 'invalid_turnstile', message: '人机交互安全校验未通过，请完成验证后再发送' });
      }
    }

    // 检查邮箱是否已被注册
    const existing = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [cleanEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'user_exists', message: '该邮箱已被注册，请直接登录' });
    }

    const sendRes = await sendRegisterEmailCode(cleanEmail, clientIp);
    if (!sendRes.success) {
      return res.status(429).json({ error: 'send_failed', message: sendRes.message, cooldownSeconds: sendRes.cooldownSeconds });
    }

    return res.json({ success: true, message: sendRes.message });
  } catch (err: any) {
    console.error('[Send Email Code Error]', err);
    return res.status(500).json({ error: 'server_error', message: '发送验证码失败，请稍后重试' });
  }
};

// 6. 发送找回密码邮件验证码
const sendForgotPasswordCode = async (req: Request, res: Response) => {
  try {
    const { email, turnstile_token } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'invalid_email', message: '请输入有效的注册邮箱地址' });
    }

    const settings = await getSystemSecuritySettings();
    const clientIp = getClientIp(req);

    if (settings.cf_turnstile_enabled && settings.cf_turnstile_site_key) {
      const token = turnstile_token || req.body['cf-turnstile-response'];
      const passed = await verifyTurnstileToken(token, clientIp);
      if (!passed) {
        return res.status(400).json({ error: 'invalid_turnstile', message: '人机交互安全校验未通过，请完成验证后再发送' });
      }
    }

    const userCheck = await query('SELECT id, status FROM users WHERE email = $1 LIMIT 1', [cleanEmail]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '未找到该邮箱对应的账号，请核对后重试' });
    }
    if (userCheck.rows[0].status === 'suspended') {
      return res.status(403).json({ error: 'account_suspended', message: '该账号已被系统封禁，无法自助找回密码，请联系管理员' });
    }

    const sendRes = await sendResetPasswordEmailCode(cleanEmail, clientIp);
    if (!sendRes.success) {
      return res.status(429).json({ error: 'send_failed', message: sendRes.message, cooldownSeconds: sendRes.cooldownSeconds });
    }

    return res.json({ success: true, message: '重置验证码已发送至您的邮箱，请注意查收' });
  } catch (err: any) {
    console.error('[Send Forgot Password Code Error]', err);
    return res.status(500).json({ error: 'server_error', message: '发送重置验证码失败，请稍后重试' });
  }
};

// 7. 凭邮箱验证码自助重置密码
const resetPasswordWithCode = async (req: Request, res: Response) => {
  try {
    const { email, code, email_code, new_password, turnstile_token } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const cleanCode = typeof (code || email_code) === 'string' ? String(code || email_code).trim() : '';
    const cleanPassword = typeof new_password === 'string' ? new_password : '';

    if (!cleanEmail || !cleanCode || !cleanPassword) {
      return res.status(400).json({ error: 'missing_fields', message: '请完整填写邮箱、验证码与新密码' });
    }
    if (cleanPassword.length < 8) {
      return res.status(400).json({ error: 'invalid_password', message: '新密码长度至少为 8 位' });
    }

    const settings = await getSystemSecuritySettings();
    const clientIp = getClientIp(req);

    if (settings.cf_turnstile_enabled && settings.cf_turnstile_site_key) {
      const token = turnstile_token || req.body['cf-turnstile-response'];
      const passed = await verifyTurnstileToken(token, clientIp);
      if (!passed) {
        return res.status(400).json({ error: 'invalid_turnstile', message: '人机交互安全校验未通过，请完成验证后再提交' });
      }
    }

    const verifyRes = await verifyEmailCode(cleanEmail, cleanCode, 'reset_password');
    if (!verifyRes.success) {
      return res.status(400).json({ error: 'invalid_code', message: verifyRes.message || '重置验证码错误或已失效' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(cleanPassword, salt);
    const updateRes = await query(
      `UPDATE users 
       SET password_hash = $1, session_version = session_version + 1, updated_at = NOW()
       WHERE email = $2
       RETURNING id`,
      [passwordHash, cleanEmail]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found', message: '用户不存在' });
    }

    await recordLoginLog({
      userId: updateRes.rows[0].id,
      account: cleanEmail,
      ip: clientIp,
      location: resolveIpLocation(clientIp, req.headers),
      userAgent: (req.headers['user-agent'] || '').slice(0, 255),
      status: 'success',
      failReason: 'password_reset_with_email_code',
    });

    return res.json({ success: true, message: '密码已成功重置，请使用新密码重新登录' });
  } catch (err: any) {
    console.error('[Reset Password Error]', err);
    return res.status(500).json({ error: 'server_error', message: '重置密码失败，请稍后重试' });
  }
};

mount('get', ['/auth/config', '/config'], getAuthConfig);
mount('get', ['/auth/captcha', '/captcha'], getAuthCaptcha);
mount('post', ['/auth/send-email-code', '/send-email-code'], sendEmailCode);
mount('post', ['/auth/forgot-password/send-code', '/forgot-password/send-code'], sendForgotPasswordCode);
mount('post', ['/auth/forgot-password/reset', '/forgot-password/reset'], resetPasswordWithCode);
mount('post', ['/auth/forgot-password', '/forgot-password'], sendForgotPasswordCode);
mount('post', ['/auth/register', '/register'], registerAccount);
mount('post', ['/auth/login', '/login'], loginAccount);

for (const path of ['/auth/profile', '/auth/user/profile', '/user/profile', '/profile']) {
  authRouter.get(path, requireAuth, (req, res) => {
    void readProfile(req, res);
  });
}

for (const path of ['/auth/update-profile', '/update-profile']) {
  authRouter.post(path, requireAuth, (req, res) => {
    void updateProfile(req, res);
  });
}

for (const path of ['/auth/change-password', '/change-password']) {
  authRouter.post(path, requireAuth, (req, res) => {
    void changePassword(req, res);
  });
}
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
