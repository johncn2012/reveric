import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { query } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'metaarc-super-secret-jwt-key-2026';

export interface AuthUser {
  userId: string;
  email?: string;
  phone?: string;
  role: 'user' | 'admin';
  sv?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signJwt(payload: AuthUser, expiresIn = '30d'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresIn as any });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized', message: '请先登录' });
    return;
  }

  const token = authHeader.split(' ')[1];
  let decoded: AuthUser;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    res.status(401).json({ error: 'invalid_token', message: '登录态已失效，请重新登录' });
    return;
  }

  // 每次请求都对照数据库里的状态和角色。只有带 sv 的令牌才额外核对会话版本。
  void query<{ session_version: number; status: string; role: string }>(
    'SELECT session_version, status, role FROM users WHERE id = $1',
    [decoded.userId],
  ).then((result) => {
    if (res.headersSent) return;
    const row = result.rows[0];
    const hasSessionVersion = typeof decoded.sv === 'number' && Number.isFinite(decoded.sv);
    if (!row || (hasSessionVersion && Number(row.session_version) !== decoded.sv)) {
      res.status(401).json({ error: 'session_revoked', message: '登录态已失效，请重新登录' });
      return;
    }
    if (row.status === 'suspended') {
      res.status(403).json({ error: 'account_suspended', message: '账号已被封禁，请联系管理员' });
      return;
    }
    req.user = {
      ...decoded,
      role: row.role === 'admin' ? 'admin' : 'user',
    };
    next();
  }).catch((err: { code?: string }) => {
    console.error('[Auth session check]', err);
    if (res.headersSent) return;
    if (err?.code === '22P02') {
      res.status(401).json({ error: 'invalid_token', message: '登录态已失效，请重新登录' });
      return;
    }
    res.status(500).json({ error: 'server_error', message: '登录态校验失败' });
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'forbidden', message: '需要管理员权限' });
    }
    next();
  });
}
