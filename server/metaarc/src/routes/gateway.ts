import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const gatewayRouter = Router();

const DEFAULT_MODELS = [
  // 核心文本大模型 (Chat / Completions)
  { id: 'gpt-4o', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'openai'] },
  { id: 'gpt-4o-mini', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'openai'] },
  { id: 'gpt-5.4', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'openai', 'responses'] },
  { id: 'gpt-5.4-mini', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'openai', 'responses'] },
  { id: 'claude-3-5-sonnet', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'anthropic'] },
  { id: 'claude-sonnet-4-6', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'anthropic'] },
  { id: 'claude-opus-4-6', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'anthropic'] },
  { id: 'gemini-2.5-pro', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'gemini'] },
  { id: 'gemini-2.5-flash', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'gemini'] },
  { id: 'deepseek-chat', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'openai'] },
  { id: 'deepseek-reasoner', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'openai'] },
  { id: 'deepseek-r1', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'openai'] },
  { id: 'deepseek-v3', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'openai'] },
  { id: 'qwen-max', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'openai'] },
  { id: 'qwen-plus', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['chat', 'openai'] },

  // 图像生成模型 (Image Generation)
  { id: 'dall-e-3', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['image-generation', 'openai'] },
  { id: 'flux-schnell', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['image-generation', 'openai'] },
  { id: 'flux-pro', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['image-generation', 'openai'] },
  { id: 'flux-dev', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['image-generation', 'openai'] },

  // 语音合成与角色配音 (Audio / Speech)
  { id: 'tts-1', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['audio', 'openai'] },
  { id: 'tts-1-hd', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['audio', 'openai'] },

  // 视频生成与动态分镜 (Video Generation)
  { id: 'kling-v1', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['video-generation', 'openai'] },
  { id: 'luma-dream-machine', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['video-generation', 'openai'] },

  // 向量嵌入检索 (Embeddings)
  { id: 'text-embedding-3-small', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['embeddings', 'openai'] },
  { id: 'text-embedding-3-large', object: 'model', created: 1715000000, owned_by: 'metaarc', supported_endpoint_types: ['embeddings', 'openai'] },
];

/**
 * 校验请求方的 API Key 是否有效，以及账号算力配额与状态
 */
async function authenticateApiKey(authHeader?: string): Promise<{ ok: boolean; user?: any; error?: string; code?: string; status?: number }> {
  if (!authHeader || typeof authHeader !== 'string') {
    return { ok: false, error: '未提供 Authorization 凭证头，请在请求头附带 Bearer API Key', code: 'missing_api_key', status: 401 };
  }
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return { ok: false, error: 'Authorization 请求头格式不正确，标准格式为: Bearer <API_KEY>', code: 'invalid_auth_header', status: 401 };
  }
  const rawToken = parts[1].trim();
  if (!rawToken) {
    return { ok: false, error: 'API Key 不能为空', code: 'empty_api_key', status: 401 };
  }

  // 1. 查询 MetaArc 用户主库中的 new_api_key
  const res = await query(
    'SELECT id, email, phone, nickname, plan, quota, total_quota, status, new_api_key, new_api_user_id FROM users WHERE new_api_key = $1',
    [rawToken]
  );

  if (res.rows.length === 0) {
    // 允许使用管理密钥或开发主密钥
    const adminKey = process.env.NEW_API_ADMIN_KEY;
    if (adminKey && rawToken === adminKey) {
      return { ok: true, user: { id: 'admin', email: 'admin@metaarc.com.cn', plan: 'studio', quota: 999999, status: 'active' } };
    }
    return { ok: false, error: '无效的 API Key，未找到匹配的 MetaArc 账号', code: 'invalid_api_key', status: 401 };
  }

  const user = res.rows[0];
  if (user.status === 'suspended' || user.status === 'banned') {
    return { ok: false, error: '该 MetaArc 账号已被封禁，禁止调用 AI 算力接口', code: 'account_banned', status: 403 };
  }

  const quota = parseFloat(user.quota || '0');
  if (quota <= 0) {
    return {
      ok: false,
      error: '您当前的 MetaArc 算力点数已耗尽（剩余 0 点），请前往 https://metaarc.com.cn/account 续费或充值算力套餐。',
      code: 'insufficient_quota',
      status: 429,
    };
  }

  return { ok: true, user };
}

/**
 * 统一 OpenAI / Anthropic 兼容 AI 算力网关反向代理
 * 路径: /v1/*
 */
gatewayRouter.all('*', async (req: Request, res: Response) => {
  const isModelsPath = req.path === '/models' || req.path === '/models/';

  // 1. 模型目录读取兼容逻辑
  if (req.method === 'GET' && isModelsPath) {
    // 如果附带了 Authorization 请求头，执行身份校验
    if (req.headers.authorization) {
      const auth = await authenticateApiKey(req.headers.authorization);
      if (!auth.ok) {
        return res.status(auth.status || 401).json({
          error: {
            message: auth.error,
            type: auth.code === 'insufficient_quota' ? 'insufficient_quota' : 'invalid_request_error',
            param: null,
            code: auth.code,
          },
        });
      }
    }
    return res.json({
      object: 'list',
      data: DEFAULT_MODELS,
    });
  }

  // 2. 算力生成类接口（Completions, Embeddings, Images, Audio 等）强制执行 API Key 鉴权与配额检查
  const auth = await authenticateApiKey(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status || 401).json({
      error: {
        message: auth.error,
        type: auth.code === 'insufficient_quota' ? 'insufficient_quota' : 'invalid_request_error',
        param: null,
        code: auth.code,
      },
    });
  }

  const newApiBaseUrl = (process.env.NEW_API_BASE_URL || '').replace(/\/$/, '');
  const isConfigured = newApiBaseUrl && !newApiBaseUrl.includes('your-new-api-host');

  // 如果上游 New-API 未正式接入，返回结构化的 503 网关维护中状态
  if (!isConfigured) {
    return res.status(503).json({
      error: {
        message: 'MetaArc AI 算力中枢服务正在调度扩容中。您的账号已验证成功（剩余点数: ' + (auth.user?.quota || 0) + ' 点），请稍后重试或联系客服。',
        type: 'gateway_offline',
        param: null,
        code: 'service_unavailable',
      },
    });
  }

  // 3. 正常转发至上游 New-API 网关集群
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
