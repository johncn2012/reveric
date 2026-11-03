import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { pool } from './db.js';
import { authRouter } from './routes/auth.js';
import { plansRouter } from './routes/plans.js';
import { ordersRouter } from './routes/orders.js';
import { mediaRouter } from './routes/media.js';
import { tasksRouter } from './routes/tasks.js';
import { adminRouter } from './routes/admin.js';
import { createUpdatesRouter, mountDownloads, updateServiceOptionsFromEnv } from './routes/updates.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localPublic = path.resolve(__dirname, '../public');
const devWebsite = path.resolve(__dirname, '../../../designs/website');

export function createApp() {
  const app = express();

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
  app.use(express.static(websiteDist));

  // 健康检查。/api/health 与 /health 共用同一探针。
  // 必须写在下方 /api 路由之前：未命中的 /api/* 会落到管理路由的鉴权中间件并返回 401。
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
  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 MetaArc (元弧) BaaS 业务中台与运营网关已启动`);
    console.log(`📡 服务端口: ${PORT}`);
    console.log(`🌐 绑定域名: ${process.env.APP_DOMAIN || 'MetaArc.COM.CN'}`);
    console.log(`🔌 New-API 节点: ${process.env.NEW_API_BASE_URL || '未配置'}`);
    console.log(`📦 对象存储桶: ${process.env.S3_BUCKET || 'metaarc-media-prod'}`);
    console.log(`=================================================`);
  });
}
