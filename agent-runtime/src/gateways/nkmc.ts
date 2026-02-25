/**
 * nkmc.ai Gateway Client
 * 封装 @nkmc/cli 的核心功能，为 D-染色体互联网技能提供技术实现层
 * 
 * 职责：
 * 1. 封装 nkmc CLI 命令 (auth/discover/inspect/call)
 * 2. 自动 Token 刷新（24h 周期）
 * 3. 错误处理和重试机制
 */

import { logger } from '../utils/logger';

// nkmc API 响应类型
interface NkmcAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface NkmcService {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  pricing: {
    perCall: number;
    currency: string;
  };
  capabilities: string[];
}

interface NkmcDiscoverResponse {
  services: NkmcService[];
  timestamp: number;
}

interface NkmcInspectResponse {
  service: NkmcService;
  health: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
}

interface NkmcCallResponse<T = unknown> {
  success: boolean;
  data: T;
  cost: number;
  transactionId: string;
}

export class NkmcGateway {
  private jwt: string;
  private refreshToken: string;
  private baseUrl: string;
  private tokenExpiry: number = 0;
  private readonly REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  private refreshTimer?: NodeJS.Timeout;

  constructor(config: { jwt: string; baseUrl?: string }) {
    this.jwt = config.jwt;
    this.baseUrl = config.baseUrl || 'https://api.nkmc.ai/v1';
    
    // 启动自动刷新
    this.startTokenRefresh();
  }

  /**
   * 认证 - 获取访问令牌
   */
  async auth(): Promise<string> {
    try {
      logger.debug('nkmc: Authenticating...');
      
      const response = await fetch(`${this.baseUrl}/auth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwt}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Auth failed: ${response.status}`);
      }

      const data: NkmcAuthResponse = await response.json();
      
      this.jwt = data.access_token;
      this.refreshToken = data.refresh_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000);
      
      logger.info('nkmc: Authentication successful');
      return this.jwt;
    } catch (error) {
      logger.error('nkmc: Authentication failed', { error });
      throw error;
    }
  }

  /**
   * 服务发现 - 获取可用服务列表
   */
  async discover(): Promise<NkmcService[]> {
    try {
      await this.ensureAuth();
      
      logger.debug('nkmc: Discovering services...');
      
      const response = await fetch(`${this.baseUrl}/services`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.jwt}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Discover failed: ${response.status}`);
      }

      const data: NkmcDiscoverResponse = await response.json();
      
      logger.info('nkmc: Discovered services', { count: data.services.length });
      return data.services;
    } catch (error) {
      logger.error('nkmc: Service discovery failed', { error });
      throw error;
    }
  }

  /**
   * 服务检查 - 获取服务健康状态
   */
  async inspect(serviceId: string): Promise<NkmcInspectResponse> {
    try {
      await this.ensureAuth();
      
      logger.debug('nkmc: Inspecting service...', { serviceId });
      
      const response = await fetch(`${this.baseUrl}/services/${serviceId}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.jwt}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Inspect failed: ${response.status}`);
      }

      const data: NkmcInspectResponse = await response.json();
      
      logger.debug('nkmc: Service health', { 
        serviceId, 
        health: data.health,
        latency: data.latency 
      });
      
      return data;
    } catch (error) {
      logger.error('nkmc: Service inspection failed', { error, serviceId });
      throw error;
    }
  }

  /**
   * 调用服务 - 执行 API 调用
   */
  async call<T = unknown>(
    serviceId: string, 
    method: string, 
    params: unknown
  ): Promise<NkmcCallResponse<T>> {
    try {
      await this.ensureAuth();
      
      logger.debug('nkmc: Calling service...', { serviceId, method });
      
      const response = await fetch(`${this.baseUrl}/services/${serviceId}/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwt}`,
        },
        body: JSON.stringify({ method, params }),
      });

      if (!response.ok) {
        throw new Error(`Call failed: ${response.status}`);
      }

      const data: NkmcCallResponse<T> = await response.json();
      
      logger.info('nkmc: Service call successful', { 
        serviceId, 
        method,
        cost: data.cost,
        txId: data.transactionId 
      });
      
      return data;
    } catch (error) {
      logger.error('nkmc: Service call failed', { error, serviceId, method });
      throw error;
    }
  }

  /**
   * 确保认证有效
   */
  private async ensureAuth(): Promise<void> {
    // Token 将在 5 分钟内过期时刷新
    if (Date.now() > this.tokenExpiry - 5 * 60 * 1000) {
      await this.auth();
    }
  }

  /**
   * 启动自动刷新定时器
   */
  private startTokenRefresh(): void {
    this.refreshTimer = setInterval(async () => {
      try {
        await this.auth();
      } catch (error) {
        logger.error('nkmc: Token refresh failed', { error });
      }
    }, this.REFRESH_INTERVAL);
    
    logger.debug('nkmc: Token refresh scheduled', { interval: '24h' });
  }

  /**
   * 停止自动刷新
   */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    logger.debug('nkmc: Token refresh stopped');
  }
}

export default NkmcGateway;
