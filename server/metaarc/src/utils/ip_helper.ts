import type { Request } from 'express';

export function getClientIp(req: Request): string {
  // 1. Cloudflare 边缘真实用户 IP (防伪造)
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    return cfIp.trim();
  }

  // 2. Nginx 反向代理强行覆写的 X-Real-IP ($remote_addr，不可被客户端伪造)
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  // 3. 多级代理 X-Forwarded-For: 取最靠近反向代理的最末端真实 IP ($proxy_add_x_forwarded_for)
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const ips = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    if (ips.length > 0) {
      return ips[ips.length - 1];
    }
  }

  const remote = req.socket?.remoteAddress || '';
  if (remote === '::1' || remote === '::ffff:127.0.0.1') return '127.0.0.1';
  return remote.replace(/^::ffff:/, '');
}

export function resolveIpLocation(ip: string, headers: Record<string, any> = {}): string {
  if (!ip || ip === '127.0.0.1' || ip === 'localhost') return '本地开发机 (Localhost)';
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) {
    return '内网/局域网专线';
  }
  const country = headers['cf-ipcountry'] || headers['x-country-code'];
  const city = headers['x-client-city'];
  if (country || city) {
    return [country, city].filter(Boolean).join(' · ');
  }
  return '中国大陆电信/移动节点';
}
