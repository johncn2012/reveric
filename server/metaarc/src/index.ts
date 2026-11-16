import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { pool, initDbSchema } from './db.js';
import { authRouter } from './routes/auth.js';
import { plansRouter } from './routes/plans.js';
import { ordersRouter } from './routes/orders.js';
import { mediaRouter } from './routes/media.js';
import { tasksRouter } from './routes/tasks.js';
import { adminRouter } from './routes/admin.js';
import { gatewayRouter } from './routes/gateway.js';
import { createUpdatesRouter, mountDownloads, updateServiceOptionsFromEnv } from './routes/updates.js';
import { initIpBlocker, isIpBlocked } from './services/ip_blocker.js';
import { getClientIp } from './utils/ip_helper.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localPublic = path.resolve(__dirname, '../public');
const devWebsite = path.resolve(__dirname, '../../../designs/website');

export function createApp() {
  const app = express();

  // 禁用 Express 默认标记，增强基础安全响应头
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // 全局 IP 访问控制黑名单拦截中间件
  app.use((req, res, next) => {
    const clientIp = getClientIp(req);
    if (isIpBlocked(clientIp)) {
      return res.status(403).json({
        error: 'ip_blocked',
        message: '当前 IP 地址已被系统安全防护策略拦截。如属误封请联系 contact@metaarc.com.cn',
        client_ip: clientIp,
      });
    }
    next();
  });

  // 中间件
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  // 安装包目录。清单不在这里，避免把 latest.json 当成可下载文件。
  const updateOptions = updateServiceOptionsFromEnv();
  mountDownloads(app, updateOptions.downloadsDir);

  // 静态托管门户页面。线上用 public/；没有 public 时回退到 designs/website。
  const websiteDist = fs.existsSync(localPublic) ? localPublic : devWebsite;
  const accountPage = path.join(websiteDist, 'account', 'index.html');
  const sendAccountPage: express.RequestHandler = (_req, res) => {
    res.sendFile(accountPage, (err) => {
      if (err && !res.headersSent) {
        res.status(404).type('text/plain').send('account page missing');
      }
    });
  };
  // 同域账号中心。/account 与 /account/ 都返回这一页，不另开子域。
  app.get('/account', sendAccountPage);
  app.get('/account/', sendAccountPage);
  // 管理员工作台与账号中心同一页，入口仍要先登录，角色不符时页面不会打开操作区。
  app.get('/admin', sendAccountPage);
  app.get('/admin/', sendAccountPage);
  const helpPage = path.join(websiteDist, 'help', 'index.html');
  const sendHelpPage: express.RequestHandler = (_req, res) => {
    res.sendFile(helpPage, (err) => {
      if (err && !res.headersSent) {
        res.status(404).type('text/plain').send('help page missing');
      }
    });
  };
  app.get('/help', sendHelpPage);
  app.get('/help/', sendHelpPage);
  app.use(express.static(websiteDist));

  // 健康检查。/api/health 与 /health 共用同一探针。
  // 必须写在下方 /api 路由之前：未命中的 /api/* 会落到管理路由的鉴权中间件并返回 401。
  app.get('/api/portal/capabilities', (_req, res) => {
    res.json({
      payment: 'unavailable',
      password_reset: 'unavailable',
      diagnostics_inbox: 'not_connected',
      email: 'not_configured',
    });
  });

  app.get(['/health', '/api/health'], async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', brand: 'MetaArc', db: 'connected', timestamp: new Date() });
    } catch (err: any) {
      res.status(500).json({ status: 'error', db: err.message });
    }
  });

  // API 路由挂载。账号规范路径在各路由文件注释里。
  // 更新清单是公开只读接口，必须排在管理路由之前，否则会被管理员鉴权拦住。
  app.use('/api', createUpdatesRouter());
  app.use('/api', authRouter);
  app.use('/api', plansRouter);
  app.use('/api', ordersRouter);
  app.use('/api', mediaRouter);
  app.use('/api', tasksRouter);
  app.use('/api', adminRouter);
  app.use('/v1', gatewayRouter);

  // 全局未捕获异常处理中间件
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Unhandled Server Error]', err);
    if (res.headersSent) return;

    // 处理客户端请求体 JSON 格式解析错误 (如 body-parser entity.parse.failed)
    if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      if (req.originalUrl && req.originalUrl.startsWith('/v1')) {
        return res.status(400).json({
          error: {
            message: 'Invalid JSON in request body',
            type: 'invalid_request_error',
            param: null,
            code: 'invalid_json',
          },
        });
      }
      return res.status(400).json({
        error: 'invalid_json',
        message: '请求 JSON 格式无效，请检查请求体格式',
      });
    }

    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      error: err.code || 'server_error',
      message: process.env.NODE_ENV === 'production' && status === 500
        ? '服务处理异常，请稍后再试'
        : (err.message || '服务异常'),
    });
  });

  return app;
}

const app = createApp();

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const PORT = process.env.PORT || 8080;
  void initDbSchema().finally(() => {
    initIpBlocker();
    const server = app.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(`🚀 MetaArc (元弧) BaaS 业务中台与运营网关已启动`);
      console.log(`📡 服务端口: ${PORT}`);
      console.log(`🌐 绑定域名: ${process.env.APP_DOMAIN || 'MetaArc.COM.CN'}`);
      console.log(`🔌 New-API 节点: ${process.env.NEW_API_BASE_URL || '未配置'}`);
      console.log(`📦 对象存储桶: ${process.env.S3_BUCKET || 'metaarc-media-prod'}`);
      console.log(`=================================================`);
    });

    const shutdown = (signal: string) => {
      console.log(`[MetaArc] 接收到 ${signal} 信号，开始平滑停止服务...`);
      server.close(async () => {
        console.log('[MetaArc] HTTP 监听已停止，正在关闭数据库连接池...');
        try {
          await pool.end();
          console.log('[MetaArc] 数据库连接池已安全关闭，退出进程。');
        } catch (poolErr) {
          console.error('[MetaArc] 关闭连接池异常:', poolErr);
        }
        process.exit(0);
      });
      setTimeout(() => {
        console.error('[MetaArc] 平滑停止超时 (8s)，强制终止进程。');
        process.exit(1);
      }, 8000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  });
}
