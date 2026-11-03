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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// 中间件
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// 静态托管 Web 官网与管理面板
const localPublic = path.resolve(__dirname, '../public');
const devWebsite = path.resolve(__dirname, '../../../designs/website');
const websiteDist = fs.existsSync(localPublic) ? localPublic : devWebsite;
app.use(express.static(websiteDist));

// 健康检查
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', brand: 'MetaArc', db: 'connected', timestamp: new Date() });
  } catch (err: any) {
    res.status(500).json({ status: 'error', db: err.message });
  }
});

// API 路由挂载
app.use('/api', authRouter);
app.use('/api', plansRouter);
app.use('/api', ordersRouter);
app.use('/api', mediaRouter);
app.use('/api', tasksRouter);
app.use('/api', adminRouter);

// 启动服务
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 MetaArc (元弧) BaaS 业务中台与运营网关已启动`);
  console.log(`📡 服务端口: ${PORT}`);
  console.log(`🌐 绑定域名: ${process.env.APP_DOMAIN || 'MetaArc.COM.CN'}`);
  console.log(`🔌 New-API 节点: ${process.env.NEW_API_BASE_URL || '未配置'}`);
  console.log(`📦 对象存储桶: ${process.env.S3_BUCKET || 'metaarc-media-prod'}`);
  console.log(`=================================================`);
});
