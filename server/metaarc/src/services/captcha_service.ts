// 职责: 图形验证码生成与核验服务 (纯 SVG 实现，无需 C++ 原生模块)
// 关联文件:
//   server/metaarc/src/routes/auth.ts
//   server/metaarc/src/services/system_settings_service.ts

import crypto from 'crypto';

interface CaptchaItem {
  code: string;
  expiresAt: number;
}

const captchaStore = new Map<string, CaptchaItem>();
const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5 分钟有效
const MAX_CAPTCHA_STORE_SIZE = 5000; // 最大缓存条目，防内存爆破 DoS 攻击

// 定期清理过期验证码
setInterval(() => {
  const now = Date.now();
  for (const [id, item] of captchaStore.entries()) {
    if (item.expiresAt < now) {
      captchaStore.delete(id);
    }
  }
}, 60 * 1000).unref();

// 避免使用容易混淆的字符：去掉 0, O, 1, I, l
const CHAR_SET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomColor(min = 40, max = 180): string {
  const r = randomInt(min, max);
  const g = randomInt(min, max);
  const b = randomInt(min, max);
  return `rgb(${r},${g},${b})`;
}

/**
 * 生成纯 SVG 图形验证码
 */
export function generateCaptcha(length = 4): { captchaId: string; svg: string; dataUri: string } {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CHAR_SET[randomInt(0, CHAR_SET.length - 1)];
  }

  const width = 120;
  const height = 40;
  const captchaId = crypto.randomUUID();

  // 随机干扰线
  const lines: string[] = [];
  for (let i = 0; i < 4; i++) {
    const x1 = randomInt(0, width / 2);
    const y1 = randomInt(0, height);
    const x2 = randomInt(width / 2, width);
    const y2 = randomInt(0, height);
    const cx1 = randomInt(20, width - 20);
    const cy1 = randomInt(0, height);
    const color = randomColor(120, 220);
    lines.push(
      `<path d="M ${x1} ${y1} Q ${cx1} ${cy1} ${x2} ${y2}" stroke="${color}" stroke-width="${randomInt(1, 2)}" fill="none" opacity="0.6"/>`
    );
  }

  // 随机噪点
  const dots: string[] = [];
  for (let i = 0; i < 20; i++) {
    const cx = randomInt(0, width);
    const cy = randomInt(0, height);
    const r = randomInt(1, 2);
    const color = randomColor(140, 230);
    dots.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.5"/>`);
  }

  // 绘制文字
  const charsSvg: string[] = [];
  const charSpacing = width / (length + 1);
  for (let i = 0; i < length; i++) {
    const char = code[i];
    const x = Math.round(charSpacing * (i + 0.8));
    const y = randomInt(26, 32);
    const rotate = randomInt(-25, 25);
    const color = randomColor(30, 140);
    const fontSize = randomInt(22, 26);
    charsSvg.push(
      `<text x="${x}" y="${y}" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="700" fill="${color}" transform="rotate(${rotate}, ${x}, ${y})">${char}</text>`
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background: #f1f5f9; border-radius: 6px; user-select: none;">
    <rect width="100%" height="100%" fill="#f8fafc"/>
    ${dots.join('')}
    ${lines.join('')}
    ${charsSvg.join('')}
  </svg>`.trim();

  // 达到最大容量时淘汰最旧条目，防止内存耗尽
  if (captchaStore.size >= MAX_CAPTCHA_STORE_SIZE) {
    const oldestKey = captchaStore.keys().next().value;
    if (oldestKey) captchaStore.delete(oldestKey);
  }

  // 存入内存缓存
  captchaStore.set(captchaId, {
    code,
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  });

  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  return { captchaId, svg, dataUri };
}

/**
 * 校验图形验证码 (校验后单次即毁，防止重放)
 */
export function verifyCaptcha(captchaId?: string, inputCode?: string): boolean {
  if (!captchaId || !inputCode) {
    return false;
  }

  const item = captchaStore.get(captchaId);
  if (!item) {
    return false;
  }

  // 立即作废（防止重放爆破）
  captchaStore.delete(captchaId);

  if (Date.now() > item.expiresAt) {
    return false;
  }

  return item.code.toUpperCase() === inputCode.trim().toUpperCase();
}
