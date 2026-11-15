// 职责: Cloudflare Turnstile 人机验证服务端核验
// 关联文件:
//   server/metaarc/src/services/system_settings_service.ts
//   server/metaarc/src/routes/auth.ts

import { getSystemSecuritySettings } from './system_settings_service.js';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * 核验 Cloudflare Turnstile Token
 * @param token 前端 Turnstile 控件生成的 cf-turnstile-response
 * @param remoteIp 客户端真实 IP (可选)
 */
export async function verifyTurnstileToken(token?: string, remoteIp?: string): Promise<boolean> {
  const settings = await getSystemSecuritySettings();

  // 若未开启 Turnstile 或未配置 Secret Key，则宽容放行，防止误杀
  if (!settings.cf_turnstile_enabled || !settings.cf_turnstile_secret_key) {
    return true;
  }

  // 开启了但客户端未提交 token，则拒绝
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', settings.cf_turnstile_secret_key);
    formData.append('response', token.trim());
    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.warn(`[Turnstile] Cloudflare 接口返回非 200: ${resp.status}`);
      return false;
    }

    const result = (await resp.json()) as TurnstileVerifyResponse;
    if (!result.success) {
      console.warn(`[Turnstile] 验证失败:`, result['error-codes']);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[Turnstile] 请求 Cloudflare 验证异常:`, err);
    // 网络波动或超时若不想彻底阻塞用户，可根据需要配置；默认安全优先返回 false
    return false;
  }
}
