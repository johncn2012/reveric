// 职责: 邮箱验证码发送与核验服务 (支持注册与找回密码、防暴力猜解、SMTP 与本地开发模拟)
// 关联文件:
//   server/metaarc/src/db.ts
//   server/metaarc/src/routes/auth.ts

import nodemailer from 'nodemailer';
import { query } from '../db.js';

const CODE_EXPIRY_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFICATION_ATTEMPTS = 5; // 单次验证码最大尝试次数，超出自动作废

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });

  return transporter;
}

/**
 * 发送通用邮箱验证码 (注册或密码重置)
 */
async function sendVerificationCode(params: {
  email: string;
  clientIp: string;
  type: 'register' | 'reset_password';
}): Promise<{ success: boolean; message: string; cooldownSeconds?: number }> {
  const { email, clientIp, type } = params;
  const normalizedEmail = email.trim().toLowerCase();

  // 1. 检查该邮箱 60 秒内是否已发送过相同类型的验证码
  const recent = await query<{ created_at: Date }>(
    `SELECT created_at FROM email_verifications 
     WHERE email = $1 AND type = $2 AND created_at > NOW() - INTERVAL '60 seconds'
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail, type]
  );
  if (recent.rows.length > 0) {
    const elapsed = Math.floor((Date.now() - new Date(recent.rows[0].created_at).getTime()) / 1000);
    const remaining = Math.max(1, RESEND_COOLDOWN_SECONDS - elapsed);
    return {
      success: false,
      message: `发送过于频繁，请等待 ${remaining} 秒后重试`,
      cooldownSeconds: remaining,
    };
  }

  // 2. 检查该邮箱 24 小时内累计发送次数上限 (防单邮箱轰炸)
  const emailDailyCheck = await query<{ cnt: string }>(
    `SELECT COUNT(*) as cnt FROM email_verifications
     WHERE email = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [normalizedEmail]
  );
  if (parseInt(emailDailyCheck.rows[0]?.cnt || '0', 10) >= 10) {
    return {
      success: false,
      message: '该邮箱今日请求验证码已达上限（单日最多 10 次），请明日再试',
    };
  }

  // 3. 检查同一 IP 10 分钟内发送次数上限 (防恶意轰炸)
  const ipCheck = await query<{ cnt: string }>(
    `SELECT COUNT(*) as cnt FROM email_verifications
     WHERE ip = $1 AND created_at > NOW() - INTERVAL '10 minutes'`,
    [clientIp]
  );
  if (parseInt(ipCheck.rows[0]?.cnt || '0', 10) >= 10) {
    return {
      success: false,
      message: '当前 IP 请求验证码过于频繁，请稍后再试',
    };
  }

  // 3. 生成 6 位纯数字验证码
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

  // 4. 存入数据库
  await query(
    `INSERT INTO email_verifications (email, code, ip, verified, fail_attempts, type, expires_at)
     VALUES ($1, $2, $3, FALSE, 0, $4, $5)`,
    [normalizedEmail, code, clientIp, type, expiresAt]
  );

  // 5. 邮件文案定制
  const isReset = type === 'reset_password';
  const actionText = isReset ? '重置密码' : '注册账号';
  const mailSubject = isReset
    ? `【MetaArc】密码重置验证码：${code}`
    : `【MetaArc】账号注册验证码：${code}`;

  const mailer = getTransporter();
  const from = process.env.SMTP_FROM || `"MetaArc 平台" <${process.env.SMTP_USER || 'noreply@metaarc.com.cn'}>`;

  if (mailer) {
    try {
      await mailer.sendMail({
        from,
        to: normalizedEmail,
        subject: mailSubject,
        text: `您好！您正在 ${actionText}，您的验证码为：${code}。验证码 ${CODE_EXPIRY_MINUTES} 分钟内有效。如非本人操作，请忽略此邮件。`,
        html: `
          <div style="max-width: 520px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #1e293b;">
            <div style="font-size: 22px; font-weight: 700; color: #0284c7; margin-bottom: 16px;">MetaArc 矩阵智能计算平台</div>
            <p style="font-size: 15px; line-height: 1.6; color: #334155;">您好！您正在申请<strong>${actionText}</strong>，您的验证码为：</p>
            <div style="margin: 24px 0; padding: 16px; background: #f0f9ff; border: 1px dashed #38bdf8; border-radius: 8px; text-align: center;">
              <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0369a1;">${code}</span>
            </div>
            <p style="font-size: 13px; color: #64748b; line-height: 1.5;">该验证码在 ${CODE_EXPIRY_MINUTES} 分钟内有效，累计输错 5 次将自动作废。<br/>如非您本人发起的请求，请忽略本邮件，切勿将验证码告知他人。</p>
            <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; text-align: center;">
              MetaArc 官方安全中心 · 自动化安全邮件
            </div>
          </div>
        `,
      });
      console.log(`[EmailService] ${actionText}验证码邮件已成功发送至 ${normalizedEmail}`);
    } catch (err) {
      console.error(`[EmailService] SMTP 发送失败:`, err);
      return { success: false, message: '邮件服务暂时不可用，请稍后重试' };
    }
  } else {
    console.log(`[EmailService] [未配置 SMTP 模拟发送] 类型: ${type}, 邮箱: ${normalizedEmail}, 验证码: ${code}, 有效期: ${CODE_EXPIRY_MINUTES} 分钟`);
  }

  return { success: true, message: '验证码已发送至您的邮箱，请注意查收' };
}

/**
 * 发送注册邮箱验证码
 */
export async function sendRegisterEmailCode(
  email: string,
  clientIp: string
): Promise<{ success: boolean; message: string; cooldownSeconds?: number }> {
  return sendVerificationCode({ email, clientIp, type: 'register' });
}

/**
 * 发送密码重置邮箱验证码
 */
export async function sendResetPasswordEmailCode(
  email: string,
  clientIp: string
): Promise<{ success: boolean; message: string; cooldownSeconds?: number }> {
  return sendVerificationCode({ email, clientIp, type: 'reset_password' });
}

/**
 * 校验邮箱验证码 (单次验证码累计错误达到 5 次自动作废，防暴力枚举)
 */
export async function verifyEmailCode(
  email: string,
  code: string,
  type: 'register' | 'reset_password' = 'register'
): Promise<{ success: boolean; message?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedCode = code.trim();

  if (!normalizedEmail || !trimmedCode) {
    return { success: false, message: '请输入有效的邮箱和验证码' };
  }

  const res = await query<{ id: string; code: string; fail_attempts: number }>(
    `SELECT id, code, fail_attempts FROM email_verifications
     WHERE email = $1 AND type = $2 AND verified = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail, type]
  );

  if (res.rows.length === 0) {
    return { success: false, message: '验证码不存在或已过期，请重新获取' };
  }

  const record = res.rows[0];

  // 检查是否已达到最大错误尝试次数
  if (record.fail_attempts >= MAX_VERIFICATION_ATTEMPTS) {
    await query(`UPDATE email_verifications SET expires_at = NOW() WHERE id = $1`, [record.id]);
    return { success: false, message: '该验证码由于多次输入错误已被锁定废弃，请重新获取' };
  }

  // 匹配验证码
  if (record.code !== trimmedCode) {
    const nextAttempts = record.fail_attempts + 1;
    if (nextAttempts >= MAX_VERIFICATION_ATTEMPTS) {
      await query(`UPDATE email_verifications SET fail_attempts = $1, expires_at = NOW() WHERE id = $2`, [
        nextAttempts,
        record.id,
      ]);
      return { success: false, message: '验证码错误次数已达上限（5次），已自动失效，请重新获取' };
    } else {
      await query(`UPDATE email_verifications SET fail_attempts = $1 WHERE id = $2`, [nextAttempts, record.id]);
      const remain = MAX_VERIFICATION_ATTEMPTS - nextAttempts;
      return { success: false, message: `验证码错误，还剩 ${remain} 次尝试机会` };
    }
  }

  // 验证成功后标记为已核验
  await query(`UPDATE email_verifications SET verified = TRUE WHERE id = $1`, [record.id]);
  return { success: true };
}
