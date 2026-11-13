// 公开的更新清单。不读取账号，也不在没有安装包时编造下载地址。
import express, { type Express, type Request, type Response, Router } from 'express';
import fs from 'fs';

import {
  loadLatestUpdate,
  updateServiceOptionsFromEnv,
  type UpdateQuery,
  type UpdateServiceOptions,
} from '../updates/manifest.js';

export { updateServiceOptionsFromEnv };

export function createUpdatesRouter(
  resolveOptions: () => UpdateServiceOptions = updateServiceOptionsFromEnv,
): Router {
  const router = Router();
  router.get('/updates/latest', (req: Request, res: Response) => {
    const query: UpdateQuery = {
      platform: queryString(req.query.platform),
      arch: queryString(req.query.arch),
      current: queryString(req.query.current),
    };
    res.json(loadLatestUpdate(resolveOptions(), query));
  });
  router.get('/updates/catalog', (_req: Request, res: Response) => {
    const options = resolveOptions();
    const targets = [
      { platform: 'windows', arch: 'x64' },
      { platform: 'macos', arch: 'arm64' },
      { platform: 'android', arch: 'arm64' },
    ];
    const platforms = targets.map((item) => ({
      ...loadLatestUpdate(options, item),
      platform: item.platform,
      arch: item.arch,
    }));
    res.json({ success: true, platforms });
  });
  return router;
}

export function mountDownloads(app: Express, downloadsDir: string): void {
  app.use('/downloads', (req, res, next) => {
    if (!fs.existsSync(downloadsDir)) {
      res.status(404).type('text/plain').send('not found');
      return;
    }
    express.static(downloadsDir, {
      index: false,
      dotfiles: 'deny',
      fallthrough: false,
      redirect: false,
    })(req, res, next);
  });
}

function queryString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return '';
}
