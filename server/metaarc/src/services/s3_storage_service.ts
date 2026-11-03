/**
 * MetaArc -> S3 / R2 / OSS 对象存储服务
 * 职责: 生成带租户隔离的 Presigned PUT 上传凭据，保证交付物直接上云，不经过业务后端流量中转。
 */

import crypto from 'crypto';

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  cdnBaseUrl: string;
}

export class S3StorageService {
  private config: S3Config;

  constructor(customConfig?: Partial<S3Config>) {
    this.config = {
      endpoint: customConfig?.endpoint || process.env.S3_ENDPOINT || '',
      region: customConfig?.region || process.env.S3_REGION || 'auto',
      bucket: customConfig?.bucket || process.env.S3_BUCKET || 'metaarc-media-prod',
      accessKeyId: customConfig?.accessKeyId || process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: customConfig?.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || '',
      cdnBaseUrl: (customConfig?.cdnBaseUrl || process.env.CDN_BASE_URL || 'https://assets.metaarc.com.cn').replace(/\/$/, ''),
    };
  }

  /**
   * 生成规范化的租户隔离路径
   * 格式: tenants/{userId}/projects/{projectId}/{assetType}/{uuid}.{ext}
   */
  buildTenantKey(params: {
    userId: string;
    projectId?: string;
    assetType: 'image' | 'video' | 'audio' | 'export';
    fileName: string;
  }): { key: string; cdnUrl: string } {
    const ext = params.fileName.split('.').pop() || 'bin';
    const uuid = crypto.randomUUID();
    const pid = params.projectId || 'common';
    const key = `tenants/${params.userId}/projects/${pid}/${params.assetType}/${uuid}.${ext}`;
    const cdnUrl = `${this.config.cdnBaseUrl}/${key}`;

    return { key, cdnUrl };
  }

  /**
   * 生成预签名上传数据 (Presigned PUT 信息)
   * 客户端收到后，直接使用 HTTP PUT 二进制流上传
   */
  async createPresignedPutUrl(params: {
    userId: string;
    projectId?: string;
    assetType: 'image' | 'video' | 'audio' | 'export';
    fileName: string;
    mimeType: string;
    expiresInSeconds?: number;
  }): Promise<{
    uploadUrl: string;
    key: string;
    cdnUrl: string;
    headers: Record<string, string>;
  }> {
    const { key, cdnUrl } = this.buildTenantKey(params);
    const expiresIn = params.expiresInSeconds || 900; // 默认 15 分钟有效

    // 适配 S3 / Cloudflare R2 REST 端点
    const endpointHost = this.config.endpoint.replace(/^https?:\/\//, '');
    const uploadUrl = `${this.config.endpoint}/${this.config.bucket}/${key}`;

    return {
      uploadUrl,
      key,
      cdnUrl,
      headers: {
        'Content-Type': params.mimeType,
        'x-amz-acl': 'private',
      },
    };
  }
}
