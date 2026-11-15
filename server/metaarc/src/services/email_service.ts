// 职责: 邮箱验证码发送与核验服务 (支持 SMTP 与本地开发模拟)
// 关联文件:
//   server/metaarc/src/db.ts
//   server/metaarc/src/routes/auth.ts

import nodemailer from 'nodemailer';
import { query } from '../db.js';

const CODE_EXPIRY_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;

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
 * 发送邮箱注册验证码
 */
export async function sendRegisterEmailCode(
  email: string,
  clientIp: string
): Promise<{ success: boolean; message: string; cooldownSeconds?: number }> {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. 检查该邮箱 60 秒内是否已发送过
  const recent = await query<{ created_at: Date }>(
    `SELECT created_at FROM email_verifications 
     WHERE email = $1 AND created_at > NOW() - INTERVAL '60 seconds'
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail]
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

  // 2. 检查同一 IP 10 分钟内发送次数上限 (防恶意轰炸)
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
    `INSERT INTO email_verifications (email, code, ip, verified, expires_at)
     VALUES ($1, $2, $3, FALSE, $4)`,
    [normalizedEmail, code, clientIp, expiresAt]
  );

  // 5. 尝试通过 SMTP 发送，若未配置则控制台输出模拟日志
  const mailer = getTransporter();
  const from = process.env.SMTP_FROM || `"MetaArc 平台" <${process.env.SMTP_USER || 'noreply@metaarc.com.cn'}>`;

  if (mailer) {
    try {
      await mailer.sendMail({
        from,
        to: normalizedEmail,
        subject: `【MetaArc】账号注册验证码：${code}`,
        text: `您好！您正在注册 MetaArc 账号，您的验证码为：${code}。验证码 ${CODE_EXPIRY_MINUTES} 分钟内有效。如非本人操作，请忽略此邮件。`,
        html: `
          <div style="max-width: 520px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; color: #1e293b;">
            <div style="font-size: 22px; font-weight: 700; color: #0284c7; margin-bottom: 16px;">MetaArc 矩阵智能计算平台</div>
            <p style="font-size: 15px; line-height: 1.6; color: #334155;">您好！感谢您加入 MetaArc。您的注册验证码为：</p>
            <div style="margin: 24px 0; padding: 16px; background: #f0f9ff; border: 1px dashed #38bdf8; border-radius: 8px; text-align: center;">
              <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0369a1;">${code}</span>
            </div>
            <p style="font-size: 13px; color: #64748b; line-height: 1.5;">该验证码在 ${CODE_EXPIRY_MINUTES} 分钟内有效，请勿将验证码泄露给他人。<br/>如非您本人发起的注册请求，请忽略本邮件。</p>
            <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; text-align: center;">
              MetaArc 官方安全中心 · 自动化安全邮件
            </div>
          </div>
        `,
      });
      console.log(`[EmailService] 验证码邮件已成功发送至 ${normalizedEmail}`);
    } catch (err) {
      console.error(`[EmailService] SMTP 发送失败:`, err);
      return { success: false, message: '邮件服务暂时不可用，请稍后重试' };
    }
  } else {
    console.log(`[EmailService] [未配置 SMTP 模拟发送] 邮箱: ${normalizedEmail}, 验证码: ${code}, 有效期: ${CODE_EXPIRY_MINUTES} 分钟`);
  }

  return { success: true, message: '验证码已发送至您的邮箱，请注意查收' };
}

/**
 * 校验邮箱验证码
 */
export async function verifyEmailCode(email: string, code: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedCode = code.trim();

  if (!normalizedEmail || !trimmedCode) return false;

  const res = await query<{ id: string }>(
    `SELECT id FROM email_verifications
     WHERE email = $1 AND code = $2 AND verified = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail, trimmedCode]
  );

  if (res.rows.length === 0) {
    return false;
  }

  // 验证成功后标记为已核验
  await query(`UPDATE email_verifications SET verified = TRUE WHERE id = $1`, [res.rows[0].id]);
  return true;
}
