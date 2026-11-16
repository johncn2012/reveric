// 职责: 系统全局安全与运营配置服务 (支持内存缓存与热刷新)
// 关联文件:
//   server/metaarc/src/db.ts
//   server/metaarc/src/routes/admin.ts
//   server/metaarc/src/routes/auth.ts

import { query } from '../db.js';

export interface SystemSecuritySettings {
  allow_registration: boolean;
  registration_mode: 'open' | 'invite_only' | 'closed';
  block_disposable_email: boolean;
  allowed_email_domains: string;
  blocked_email_domains: string;
  require_login_captcha: boolean;
  require_email_code: boolean;
  max_reg_per_ip_day: number;
  cf_turnstile_enabled: boolean;
  cf_turnstile_site_key: string;
  cf_turnstile_secret_key: string;
}

const DEFAULT_SETTINGS: SystemSecuritySettings = {
  allow_registration: true,
  registration_mode: 'open',
  block_disposable_email: true,
  allowed_email_domains: '',
  blocked_email_domains: '',
  require_login_captcha: true,
  require_email_code: false,
  max_reg_per_ip_day: 5,
  cf_turnstile_enabled: false,
  cf_turnstile_site_key: '',
  cf_turnstile_secret_key: '',
};

let cachedSettings: SystemSecuritySettings = { ...DEFAULT_SETTINGS };
let lastLoadedAt = 0;
const CACHE_TTL_MS = 15000; // 15 秒缓存过期重新从数据库拉取，保证极高吞吐同时支持多实例热更新

export async function getSystemSecuritySettings(): Promise<SystemSecuritySettings> {
  const now = Date.now();
  if (now - lastLoadedAt < CACHE_TTL_MS) {
    return cachedSettings;
  }

  try {
    const res = await query<{ key: string; value: any }>(
      'SELECT key, value FROM system_settings'
    );
    const newSettings: any = { ...DEFAULT_SETTINGS };
    for (const row of res.rows) {
      let val = row.value;
      if (typeof val === 'string' && val.trim() !== '') {
        try {
          val = JSON.parse(val);
        } catch (_) {
          // 如果解析失败则保持原有字符串
        }
      }
      newSettings[row.key] = val;
    }
    // 环境变量优先覆盖（若在 .env 中显式指定）
    if (process.env.CF_TURNSTILE_SITE_KEY) {
      newSettings.cf_turnstile_site_key = process.env.CF_TURNSTILE_SITE_KEY.trim();
    }
    if (process.env.CF_TURNSTILE_SECRET_KEY) {
      newSettings.cf_turnstile_secret_key = process.env.CF_TURNSTILE_SECRET_KEY.trim();
    }
    if (process.env.CF_TURNSTILE_ENABLED === 'true') {
      newSettings.cf_turnstile_enabled = true;
    }

    cachedSettings = newSettings;
    lastLoadedAt = now;
  } catch (err) {
    console.warn('[SystemSettings] 无法读取 system_settings 表，使用当前缓存:', err);
  }

  return cachedSettings;
}

export async function getPublicAuthConfig() {
  const settings = await getSystemSecuritySettings();
  const regMode = settings.registration_mode || (settings.allow_registration ? 'open' : 'closed');
  const allowReg = regMode !== 'closed';

  return {
    allow_registration: allowReg,
    registration_mode: regMode,
    require_login_captcha: Boolean(settings.require_login_captcha),
    require_email_code: Boolean(settings.require_email_code),
    block_disposable_email: Boolean(settings.block_disposable_email),
    cf_turnstile_enabled: Boolean(settings.cf_turnstile_enabled && settings.cf_turnstile_site_key),
    cf_turnstile_site_key: settings.cf_turnstile_site_key || '',
  };
}

export async function updateSystemSecuritySettings(
  updates: Partial<SystemSecuritySettings>
): Promise<SystemSecuritySettings> {
  for (const [key, val] of Object.entries(updates)) {
    if (key in DEFAULT_SETTINGS) {
      await query(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, JSON.stringify(val)]
      );
    }
  }

  lastLoadedAt = 0; // 强制清除缓存
  return await getSystemSecuritySettings();
}
