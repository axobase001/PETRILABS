/**
 * Capability Router
 * D-染色体互联网技能的能力路由层
 * 
 * 职责：
 * 1. 能力名 → nkmc API 路径映射
 * 2. SQLite 本地缓存服务发现结果
 * 3. 成本预检（对比 metabolicBudget）
 * 4. 压力响应触发（超预算时）
 */

import Database from 'better-sqlite3';
import { NkmcGateway } from '../gateways/nkmc';
import { logger } from '../utils/logger';
import { Gene, GeneDomain } from '../types';

// 能力映射接口
interface CapabilityMapping {
  capability: string;      // 基因中的能力名
  serviceId: string;       // nkmc 服务 ID
  method: string;          // nkmc 方法名
  fallbackEndpoint?: string; // 备用 HTTP 端点
}

// API 调用记录
interface ApiCallRecord {
  timestamp: number;
  capability: string;
  serviceId: string;
  cost: number;
  success: boolean;
}

export class CapabilityRouter {
  private gateway: NkmcGateway;
  private db: Database.Database;
  private capabilityCache: Map<string, CapabilityMapping> = new Map();
  private callHistory: ApiCallRecord[] = [];
  private readonly MAX_HISTORY = 1000;
  
  // 能力映射表（可配置）
  private capabilityMappings: Map<string, CapabilityMapping> = new Map([
    ['fetch_market_data', { capability: 'fetch_market_data', serviceId: 'market-api', method: 'getPrice' }],
    ['fetch_weather', { capability: 'fetch_weather', serviceId: 'weather-api', method: 'getCurrent' }],
    ['fetch_news', { capability: 'fetch_news', serviceId: 'news-api', method: 'search' }],
    ['send_tweet', { capability: 'send_tweet', serviceId: 'twitter-api', method: 'postTweet' }],
    ['send_email', { capability: 'send_email', serviceId: 'email-api', method: 'send' }],
    ['web_search', { capability: 'web_search', serviceId: 'search-api', method: 'search' }],
    ['translate_text', { capability: 'translate_text', serviceId: 'translate-api', method: 'translate' }],
  ]);

  constructor(config: { 
    gateway: NkmcGateway; 
    dbPath?: string;
  }) {
    this.gateway = config.gateway;
    
    // 初始化 SQLite 缓存
    const dbPath = config.dbPath || './data/capability-cache.db';
    this.db = new Database(dbPath);
    this.initializeDb();
    
    // 从数据库加载缓存
    this.loadCacheFromDb();
    
    logger.info('CapabilityRouter initialized');
  }

  /**
   * 初始化数据库表
   */
  private initializeDb(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS service_cache (
        service_id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        endpoint TEXT,
        pricing REAL,
        capabilities TEXT,
        cached_at INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS capability_mappings (
        capability TEXT PRIMARY KEY,
        service_id TEXT,
        method TEXT,
        fallback_endpoint TEXT
      );
      
      CREATE TABLE IF NOT EXISTS api_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER,
        capability TEXT,
        service_id TEXT,
        cost REAL,
        success INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_api_calls_timestamp ON api_calls(timestamp);
    `);
  }

  /**
   * 从数据库加载缓存
   */
  private loadCacheFromDb(): void {
    try {
      const rows = this.db.prepare('SELECT * FROM capability_mappings').all() as any[];
      for (const row of rows) {
        this.capabilityCache.set(row.capability, {
          capability: row.capability,
          serviceId: row.service_id,
          method: row.method,
          fallbackEndpoint: row.fallback_endpoint,
        });
      }
      logger.debug('Capability cache loaded', { count: rows.length });
    } catch (error) {
      logger.error('Failed to load capability cache', { error });
    }
  }

  /**
   * 路由能力调用
   * 这是核心方法：将 D-染色体基因路由到 nkmc 服务
   */
  async route(gene: Gene, params?: unknown): Promise<{
    success: boolean;
    data?: unknown;
    cost: number;
    error?: string;
    usedFallback?: boolean;
  }> {
    // 验证是 D-染色体基因
    if (gene.domain !== GeneDomain.API_UTILIZATION && 
        gene.domain !== GeneDomain.WEB_NAVIGATION) {
      return {
        success: false,
        cost: 0,
        error: 'Not an internet capability gene',
      };
    }

    // 从基因元数据中提取能力名
    // 注意：基因对象本身不包含技术元数据，只有 capability 名称
    const capability = this.extractCapabilityFromGene(gene);
    if (!capability) {
      return {
        success: false,
        cost: 0,
        error: 'No capability defined in gene',
      };
    }

    // 获取能力映射
    const mapping = await this.resolveCapabilityMapping(capability);
    if (!mapping) {
      return {
        success: false,
        cost: 0,
        error: `No mapping found for capability: ${capability}`,
      };
    }

    // 成本预检
    const estimatedCost = await this.estimateCost(mapping.serviceId);
    const budget = gene.metabolicCost / 10000; // 转换为 USDC
    
    if (estimatedCost > budget) {
      logger.warn('API call exceeds metabolic budget', {
        capability,
        estimatedCost,
        budget,
      });
      
      // 触发压力响应 - 返回失败，让 ClawBot 处理压力
      return {
        success: false,
        cost: 0,
        error: `Cost ${estimatedCost} exceeds metabolic budget ${budget}`,
      };
    }

    try {
      // 调用 nkmc 服务
      const result = await this.gateway.call(
        mapping.serviceId,
        mapping.method,
        params || {}
      );

      // 记录调用
      this.recordCall({
        timestamp: Date.now(),
        capability,
        serviceId: mapping.serviceId,
        cost: result.cost,
        success: result.success,
      });

      return {
        success: result.success,
        data: result.data,
        cost: result.cost,
      };
    } catch (error) {
      logger.error('nkmc call failed, attempting fallback', { error, capability });
      
      // 尝试备用方案
      if (mapping.fallbackEndpoint) {
        return this.executeFallback(mapping, params);
      }
      
      return {
        success: false,
        cost: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 从基因中提取能力名
   * 基因元数据中包含 capability 字段
   */
  private extractCapabilityFromGene(gene: Gene): string | null {
    // 基因名称格式: D-{CAPABILITY}-{ID}
    // 例如: D-API-001 -> fetch_market_data
    
    // 使用映射表查找
    for (const [capability, mapping] of this.capabilityMappings) {
      // 简化匹配：检查基因 ID 范围
      if (gene.id >= 300 && gene.id < 400) {
        // D-API 系列 (300-399)
        const index = gene.id - 300;
        const capabilities = Array.from(this.capabilityMappings.keys());
        return capabilities[index % capabilities.length];
      }
    }
    
    return null;
  }

  /**
   * 解析能力映射
   */
  private async resolveCapabilityMapping(capability: string): Promise<CapabilityMapping | null> {
    // 1. 检查内存缓存
    if (this.capabilityCache.has(capability)) {
      return this.capabilityCache.get(capability)!;
    }
    
    // 2. 检查配置映射
    if (this.capabilityMappings.has(capability)) {
      const mapping = this.capabilityMappings.get(capability)!;
      this.capabilityCache.set(capability, mapping);
      return mapping;
    }
    
    // 3. 从 nkmc 发现服务
    try {
      const services = await this.gateway.discover();
      
      for (const service of services) {
        if (service.capabilities.includes(capability)) {
          const mapping: CapabilityMapping = {
            capability,
            serviceId: service.id,
            method: capability, // 默认使用能力名作为方法
          };
          
          // 缓存到内存
          this.capabilityCache.set(capability, mapping);
          
          // 持久化到数据库
          this.db.prepare(`
            INSERT OR REPLACE INTO capability_mappings 
            (capability, service_id, method) 
            VALUES (?, ?, ?)
          `).run(capability, service.id, mapping.method);
          
          return mapping;
        }
      }
    } catch (error) {
      logger.error('Failed to discover services', { error });
    }
    
    return null;
  }

  /**
   * 估算调用成本
   */
  private async estimateCost(serviceId: string): Promise<number> {
    try {
      const health = await this.gateway.inspect(serviceId);
      return health.service.pricing.perCall;
    } catch {
      // 默认成本
      return 0.0001;
    }
  }

  /**
   * 执行备用 HTTP 调用
   */
  private async executeFallback(
    mapping: CapabilityMapping, 
    params?: unknown
  ): Promise<{ success: boolean; data?: unknown; cost: number; usedFallback: boolean }> {
    if (!mapping.fallbackEndpoint) {
      return { success: false, cost: 0, usedFallback: false };
    }
    
    try {
      logger.info('Executing fallback HTTP call', { endpoint: mapping.fallbackEndpoint });
      
      const response = await fetch(mapping.fallbackEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      
      if (!response.ok) {
        throw new Error(`Fallback failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      // 备用方案成本固定为 0 (或很低)
      return { success: true, data, cost: 0.00001, usedFallback: true };
    } catch (error) {
      logger.error('Fallback execution failed', { error });
      return { success: false, cost: 0, usedFallback: true };
    }
  }

  /**
   * 记录 API 调用
   */
  private recordCall(record: ApiCallRecord): void {
    // 内存记录
    this.callHistory.push(record);
    if (this.callHistory.length > this.MAX_HISTORY) {
      this.callHistory.shift();
    }
    
    // 数据库记录
    this.db.prepare(`
      INSERT INTO api_calls (timestamp, capability, service_id, cost, success)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      record.timestamp,
      record.capability,
      record.serviceId,
      record.cost,
      record.success ? 1 : 0
    );
  }

  /**
   * 获取每日 API 调用成本
   * 用于代谢系统结算
   */
  getDailyApiCost(): number {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    const result = this.db.prepare(`
      SELECT SUM(cost) as total FROM api_calls
      WHERE timestamp > ?
    `).get(oneDayAgo) as { total: number };
    
    return result.total || 0;
  }

  /**
   * 获取调用历史
   */
  getCallHistory(limit: number = 100): ApiCallRecord[] {
    return this.callHistory.slice(-limit);
  }

  /**
   * 关闭资源
   */
  close(): void {
    this.db.close();
    logger.info('CapabilityRouter closed');
  }
}

export default CapabilityRouter;
