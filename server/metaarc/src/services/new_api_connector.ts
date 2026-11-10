/**
 * MetaArc -> New-API 服务连接器
 * 职责: 编排已有 New-API 实例的管理接口，实现“用户注册自动开 Key、充值自动充额度、实时查询额度流水”。
 */

export interface NewApiConfig {
  baseUrl: string; // e.g. http://your-new-api-host:3000
  adminKey: string; // Master Admin API Key
}

export interface NewApiUser {
  id: number;
  username: string;
  role: number;
  status: number;
  quota: number; // 当前剩余配额 (以 500,000 = $1 折算)
}

export interface NewApiToken {
  id: number;
  user_id: number;
  key: string; // sk-xxxx
  status: number;
  name: string;
  remain_quota: number;
}

export class NewApiConnector {
  private baseUrl: string;
  private adminKey: string;

  constructor(config?: Partial<NewApiConfig>) {
    this.baseUrl = (config?.baseUrl || process.env.NEW_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    this.adminKey = config?.adminKey || process.env.NEW_API_ADMIN_KEY || '';
    if (!this.adminKey) {
      console.warn('[NewApiConnector] 警告: 未配置 NEW_API_ADMIN_KEY，调用管理接口可能会返回 401');
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.adminKey}`,
      ...(options.headers || {}),
    };

    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    let json: { success?: boolean; message?: string; data?: T };
    try {
      json = JSON.parse(text) as { success?: boolean; message?: string; data?: T };
    } catch {
      throw new Error(`[NewApiConnector Error] ${path}: HTTP ${res.status}: ${text.slice(0, 160)}`);
    }

    if (!res.ok || json.success === false) {
      const errMsg = json.message || `HTTP ${res.status}: ${res.statusText}`;
      throw new Error(`[NewApiConnector Error] ${path}: ${errMsg}`);
    }

    return (json.data !== undefined ? json.data : json) as T;
  }

  /**
   * 1. 为新注册的 MetaArc 用户在 New-API 中创建对应账户
   */
  async createUser(params: {
    username: string;
    password?: string;
    displayName?: string;
  }): Promise<{ id: number; username: string }> {
    const defaultPassword = params.password || `MetaArc_${Math.random().toString(36).substring(2, 10)}`;
    const result = await this.request<{ id: number; username: string }>('/api/user', {
      method: 'POST',
      body: JSON.stringify({
        username: params.username,
        password: defaultPassword,
        display_name: params.displayName || params.username,
        role: 1, // 普通用户
      }),
    });
    return result;
  }

  /**
   * 2. 为该用户生成专属的 sk-xxx 密钥
   */
  async createTokenForUser(params: {
    userId: number;
    tokenName?: string;
    unlimitedQuota?: boolean;
    initialRemainQuota?: number;
  }): Promise<NewApiToken> {
    const result = await this.request<NewApiToken>('/api/token', {
      method: 'POST',
      body: JSON.stringify({
        name: params.tokenName || 'MetaArc Default Client Key',
        remain_quota: params.unlimitedQuota ? -1 : (params.initialRemainQuota ?? 500000),
        expired_time: -1, // 永不过期
        unlimited_quota: params.unlimitedQuota ?? false,
        user_id: params.userId,
      }),
    });
    return result;
  }

  /**
   * 3. 用户充值或超管调账: 增加用户的配额 (Quota)
   * @param userId New-API 中的用户 ID
   * @param deltaQuota 充值点数 (正数代表增加，负数代表扣减)
   */
  async addQuota(userId: number, deltaQuota: number): Promise<{ quota: number }> {
    const result = await this.request<{ quota: number }>(`/api/user/${userId}/quota`, {
      method: 'POST',
      body: JSON.stringify({
        quota: deltaQuota,
      }),
    });
    return result;
  }

  /**
   * 4. 查询用户在 New-API 中的当前剩余配额
   */
  async getUserQuota(userId: number): Promise<{ quota: number; used_quota: number }> {
    const user = await this.request<NewApiUser>(`/api/user/${userId}`, {
      method: 'GET',
    });
    return {
      quota: user.quota,
      used_quota: (user as any).used_quota || 0,
    };
  }

  /**
   * 高级业务门面: 为 MetaArc 注册用户一键建号与签发 Token
   */
  async provisionUserAccount(user: { id: string; email?: string; phone?: string; nickname?: string }) {
    const username = `u_${user.id.replace(/-/g, '').substring(0, 12)}`;
    const createdUser = await this.createUser({
      username,
      displayName: user.nickname || user.phone || user.email || 'MetaArc User',
    });
    const token = await this.createTokenForUser({
      userId: createdUser.id,
      tokenName: `MetaArc Client Key - ${username}`,
    });
    return { user: createdUser, token };
  }

  /**
   * 高级业务门面: 用户充值加点 (将 MetaArc 算力点数折算为 New-API quota)
   */
  async topUpUserQuota(params: { newApiUserId: number; metaarcPoints: number; remark?: string }) {
    const delta = Math.round(params.metaarcPoints * 1000);
    return await this.addQuota(params.newApiUserId, delta);
  }

  /**
   * 高级业务门面: 实时查询用户剩余配额并换算为 MetaArc 算力点数
   */
  async queryUserQuota(newApiUserId: number) {
    const res = await this.getUserQuota(newApiUserId);
    return {
      quota: res.quota / 1000,
      used_quota: res.used_quota / 1000,
    };
  }
}
