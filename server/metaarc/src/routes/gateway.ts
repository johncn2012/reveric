import { Router, Request, Response } from 'express';

export const gatewayRouter = Router();

const DEFAULT_MODELS = [
  { id: 'gpt-5.4', object: 'model', created: 1715000000, owned_by: 'metaarc' },
  { id: 'gpt-5.4-mini', object: 'model', created: 1715000000, owned_by: 'metaarc' },
  { id: 'claude-sonnet-4-6', object: 'model', created: 1715000000, owned_by: 'metaarc' },
  { id: 'claude-opus-4-6', object: 'model', created: 1715000000, owned_by: 'metaarc' },
  { id: 'gemini-2.5-pro', object: 'model', created: 1715000000, owned_by: 'metaarc' },
  { id: 'gemini-2.5-flash', object: 'model', created: 1715000000, owned_by: 'metaarc' },
  { id: 'deepseek-r1', object: 'model', created: 1715000000, owned_by: 'metaarc' },
  { id: 'deepseek-v3', object: 'model', created: 1715000000, owned_by: 'metaarc' },
];

/**
 * 统一 OpenAI / Anthropic 兼容 AI 算力网关反向代理
 * 路径: /v1/*
 */
gatewayRouter.all('*', async (req: Request, res: Response) => {
  const newApiBaseUrl = (process.env.NEW_API_BASE_URL || '').replace(/\/$/, '');
  const isConfigured = newApiBaseUrl && !newApiBaseUrl.includes('your-new-api-host');

  // 如果上游 New-API 未正式接入，提供兼容保底逻辑
  if (!isConfigured) {
    // 兼容客户端获取模型列表 (GET /v1/models)
    if (req.method === 'GET' && (req.path === '/models' || req.path === '/models/')) {
      return res.json({
        object: 'list',
        data: DEFAULT_MODELS,
      });
    }

    // 其它接口返回标准的 OpenAI API 错误格式
    return res.status(503).json({
      error: {
        message: 'MetaArc AI 算力中枢正在配置上线中。请前往 https://metaarc.com.cn 控制台核对密钥与算力额度。',
        type: 'gateway_offline',
        param: null,
        code: 'service_unavailable',
      },
    });
  }

  // 正常转发至上游 New-API 网关
  try {
    const targetUrl = `${newApiBaseUrl}/v1${req.path}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
    const headers: Record<string, string> = {};

    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (lower !== 'host' && lower !== 'content-length' && typeof value === 'string') {
        headers[key] = value;
      }
    }

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase());
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body) : undefined,
      signal: controller.signal,
    });

    res.status(upstreamRes.status);
    upstreamRes.headers.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (lower !== 'content-encoding' && lower !== 'transfer-encoding') {
        res.setHeader(key, val);
      }
    });

    if (upstreamRes.body) {
      const reader = upstreamRes.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch {
        // 客户端断开连接或流终止
      } finally {
        res.end();
      }
    } else {
      res.end();
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(502).json({
        error: {
          message: '上游网关连接超时或网络异常: ' + (err.message || '未知错误'),
          type: 'bad_gateway',
          param: null,
          code: 'upstream_connect_failed',
        },
      });
    }
  }
});
