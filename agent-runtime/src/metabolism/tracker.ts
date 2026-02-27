/**
 * Metabolism Tracker
 * 代谢成本追踪器
 * 
 * 职责：
 * 1. 追踪所有代谢成本（基因维护、存储、API 调用）
 * 2. 与 C-经济染色体系统集成
 * 3. 每日代谢结算
 * 4. 墓碑日志记录
 */

import { logger } from '../utils/logger';
import { Gene } from '../types';

// 代谢成本结构
interface MetabolicCosts {
  // 基础成本
  geneMaintenance: number;    // 基因维护成本 (USDC/天)
  storageWrite: number;       // 存储写入成本
  
  // API 调用成本
  apiCall: {
    base: number;             // 基础调用费
    dynamic: (actualCost: number) => number; // 动态计算 (含缓冲)
  };
  
  // 其他服务成本
  llmInference: number;       // LLM 推理成本
  heartbeatGas: number;       // 链上心跳 gas 成本
}

// 每日代谢账单
interface DailyMetabolismBill {
  date: string;
  totalCost: number;
  breakdown: {
    geneMaintenance: number;
    storageCost: number;
    apiCalls: number;
    llmInference: number;
    heartbeatGas: number;
  };
  apiCallDetails: {
    count: number;
    services: Record<string, { count: number; cost: number }>;
  };
}

// API 调用记录
interface ApiCallCost {
  timestamp: number;
  service: string;
  capability: string;
  cost: number;
}

// 认知支出记录
interface CognitionCost {
  timestamp: number;
  provider: 'pollinations' | 'x402-llm';
  model: string;
  cost: number;
  geneId: string;
  tokens: number;
}

export class MetabolismTracker {
  // 默认成本配置
  private costs: MetabolicCosts = {
    geneMaintenance: 0.001,    // $0.001/天/基因
    storageWrite: 0.002,       // $0.002/次存储
    apiCall: {
      base: 0.0001,            // $0.0001 基础费
      dynamic: (actual) => actual * 1.1, // 实际费用 + 10% 缓冲
    },
    llmInference: 0.01,        // $0.01/次推理
    heartbeatGas: 0.001,       // $0.001/次心跳 gas
  };

  private apiCalls: ApiCallCost[] = [];
  private storageWrites: number = 0;
  private llmCalls: number = 0;
  private heartbeats: number = 0;
  private genes: Gene[] = [];
  private cognitionCalls: CognitionCost[] = [];  // 新增：认知支出记录
  
  private dailyBill?: DailyMetabolismBill;
  private lastSettlementTime: number = 0;

  constructor(config?: { costs?: Partial<MetabolicCosts> }) {
    if (config?.costs) {
      this.costs = { ...this.costs, ...config.costs };
    }
    
    logger.info('MetabolismTracker initialized');
  }

  /**
   * 设置基因列表（用于计算维护成本）
   */
  setGenes(genes: Gene[]): void {
    this.genes = genes;
  }

  /**
   * 记录 API 调用成本
   * 由 CapabilityRouter 调用
   */
  recordApiCall(cost: number, service: string, capability: string): void {
    this.apiCalls.push({
      timestamp: Date.now(),
      service,
      capability,
      cost,
    });
    
    // 应用动态成本计算（含缓冲）
    const adjustedCost = this.costs.apiCall.dynamic(cost);
    
    logger.debug('API call cost recorded', {
      service,
      capability,
      rawCost: cost,
      adjustedCost,
    });
  }

  /**
   * 记录存储写入
   */
  recordStorageWrite(): void {
    this.storageWrites++;
    logger.debug('Storage write recorded', { total: this.storageWrites });
  }

  /**
   * 记录 LLM 推理
   */
  recordLlmCall(): void {
    this.llmCalls++;
    logger.debug('LLM call recorded', { total: this.llmCalls });
  }

  /**
   * 记录认知支出（新增：双模态认知）
   */
  recordCognition(cost: CognitionCost): void {
    this.cognitionCalls.push(cost);
    
    // 同时计入 API 调用（如果是付费的）
    if (cost.cost > 0) {
      this.recordApiCall(cost.cost, cost.provider, cost.geneId);
    }
    
    logger.debug('Cognition recorded', {
      provider: cost.provider,
      model: cost.model,
      cost: cost.cost,
      geneId: cost.geneId,
    });
  }

  /**
   * 记录心跳
   */
  recordHeartbeat(): void {
    this.heartbeats++;
    logger.debug('Heartbeat recorded', { total: this.heartbeats });
  }

  /**
   * 计算每日代谢成本
   * 由 C-经济染色体系统调用
   */
  calculateDailyMetabolism(): DailyMetabolismBill {
    // 基因维护成本
    const geneMaintenance = this.genes.length * this.costs.geneMaintenance;
    
    // 存储成本
    const storageCost = this.storageWrites * this.costs.storageWrite;
    
    // API 调用成本（包含认知）
    const apiCallCosts = this.calculateApiCallCosts();
    const cognitionCosts = this.calculateCognitionCosts();
    
    // LLM 推理成本
    const llmCost = this.llmCalls * this.costs.llmInference;
    
    // 心跳 gas 成本
    const heartbeatCost = this.heartbeats * this.costs.heartbeatGas;
    
    // 汇总
    const totalCost = geneMaintenance + storageCost + apiCallCosts.total + llmCost + heartbeatCost + cognitionCosts.total;
    
    const bill: DailyMetabolismBill = {
      date: new Date().toISOString().split('T')[0],
      totalCost,
      breakdown: {
        geneMaintenance,
        storageCost,
        apiCalls: apiCallCosts.total + cognitionCosts.total,
        llmInference: llmCost,
        heartbeatGas: heartbeatCost,
      },
      apiCallDetails: {
        ...apiCallCosts.details,
        cognition: cognitionCosts.details,
      },
    };
    
    this.dailyBill = bill;
    this.lastSettlementTime = Date.now();
    
    logger.info('Daily metabolism calculated', {
      total: totalCost.toFixed(6),
      genes: this.genes.length,
      apiCalls: apiCallCosts.details.count,
      cognitionCalls: cognitionCosts.details.count,
    });
    
    return bill;
  }

  /**
   * 计算认知成本（新增）
   */
  private calculateCognitionCosts(): { 
    total: number; 
    details: { count: number; byProvider: Record<string, { count: number; cost: number }> };
  } {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentCalls = this.cognitionCalls.filter(c => c.timestamp > oneDayAgo);
    
    const byProvider: Record<string, { count: number; cost: number }> = {};
    let totalCost = 0;
    
    for (const call of recentCalls) {
      totalCost += call.cost;
      
      if (!byProvider[call.provider]) {
        byProvider[call.provider] = { count: 0, cost: 0 };
      }
      byProvider[call.provider].count++;
      byProvider[call.provider].cost += call.cost;
    }
    
    return {
      total: totalCost,
      details: {
        count: recentCalls.length,
        byProvider,
      },
    };
  }

  /**
   * 计算 API 调用成本详情
   */
  private calculateApiCallCosts(): { total: number; details: DailyMetabolismBill['apiCallDetails'] } {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentCalls = this.apiCalls.filter(c => c.timestamp > oneDayAgo);
    
    const serviceMap: Record<string, { count: number; cost: number }> = {};
    let totalCost = 0;
    
    for (const call of recentCalls) {
      // 应用动态成本
      const adjustedCost = this.costs.apiCall.dynamic(call.cost);
      totalCost += adjustedCost;
      
      // 按服务聚合
      if (!serviceMap[call.service]) {
        serviceMap[call.service] = { count: 0, cost: 0 };
      }
      serviceMap[call.service].count++;
      serviceMap[call.service].cost += adjustedCost;
    }
    
    return {
      total: totalCost,
      details: {
        count: recentCalls.length,
        services: serviceMap,
      },
    };
  }

  /**
   * 获取当前代谢状态
   */
  getMetabolicStatus(): {
    dailyCost: number;
    currentBill: DailyMetabolismBill | null;
    pendingApiCalls: number;
    geneCount: number;
    lastSettlement: number;
  } {
    return {
      dailyCost: this.dailyBill?.totalCost || 0,
      currentBill: this.dailyBill || null,
      pendingApiCalls: this.apiCalls.length,
      geneCount: this.genes.length,
      lastSettlement: this.lastSettlementTime,
    };
  }

  /**
   * 获取 API 调用日报
   * 用于墓碑日志
   */
  getApiCallReport(): {
    totalCalls: number;
    totalCost: number;
    byService: Record<string, { count: number; cost: number }>;
    byCapability: Record<string, { count: number; cost: number }>;
  } {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentCalls = this.apiCalls.filter(c => c.timestamp > oneDayAgo);
    
    const byService: Record<string, { count: number; cost: number }> = {};
    const byCapability: Record<string, { count: number; cost: number }> = {};
    let totalCost = 0;
    
    for (const call of recentCalls) {
      const adjustedCost = this.costs.apiCall.dynamic(call.cost);
      totalCost += adjustedCost;
      
      // 按服务聚合
      if (!byService[call.service]) {
        byService[call.service] = { count: 0, cost: 0 };
      }
      byService[call.service].count++;
      byService[call.service].cost += adjustedCost;
      
      // 按能力聚合
      if (!byCapability[call.capability]) {
        byCapability[call.capability] = { count: 0, cost: 0 };
      }
      byCapability[call.capability].count++;
      byCapability[call.capability].cost += adjustedCost;
    }
    
    return {
      totalCalls: recentCalls.length,
      totalCost,
      byService,
      byCapability,
    };
  }

  /**
   * 检查预算是否充足
   */
  checkBudget(balance: number, runway: number): {
    sufficient: boolean;
    daysRemaining: number;
    warning: boolean;
  } {
    const dailyCost = this.dailyBill?.totalCost || this.estimateDailyCost();
    
    if (dailyCost === 0) {
      return { sufficient: true, daysRemaining: Infinity, warning: false };
    }
    
    const daysRemaining = balance / dailyCost;
    const sufficient = daysRemaining >= runway;
    const warning = daysRemaining < runway * 1.5; // 少于 1.5x  runway 时警告
    
    return { sufficient, daysRemaining, warning };
  }

  /**
   * 估算每日成本（无历史数据时）
   */
  private estimateDailyCost(): number {
    // 基础估计
    const geneCost = this.genes.length * this.costs.geneMaintenance;
    const apiCost = 10 * this.costs.apiCall.base; // 假设 10 次 API 调用/天
    const llmCost = 5 * this.costs.llmInference;   // 假设 5 次推理/天
    const heartbeatCost = 4 * this.costs.heartbeatGas; // 4 次心跳/天
    
    return geneCost + apiCost + llmCost + heartbeatCost;
  }

  /**
   * 结算并重置计数器
   */
  settle(): DailyMetabolismBill {
    const bill = this.calculateDailyMetabolism();
    
    // 重置计数器
    this.apiCalls = [];
    this.storageWrites = 0;
    this.llmCalls = 0;
    this.heartbeats = 0;
    this.cognitionCalls = [];  // 新增：重置认知记录
    
    logger.info('Metabolism settled', { date: bill.date, total: bill.totalCost });
    
    return bill;
  }

  /**
   * 获取成本配置
   */
  getCostConfig(): MetabolicCosts {
    return { ...this.costs };
  }
  
  // ============ Auto-Epigenetic Support ============
  
  /**
   * 计算代谢压力水平（用于自主表观遗传）
   * @returns 0.0 - 1.0，越高表示压力越大
   */
  getStressLevel(currentBalance: number): number {
    const dailyCost = this.dailyBill?.totalCost || this.estimateDailyCost();
    
    if (dailyCost === 0) return 0;
    
    // 基于剩余天数的压力计算
    const daysRemaining = currentBalance / dailyCost;
    
    if (daysRemaining < 1) return 1.0;        // 临界：不到1天
    if (daysRemaining < 3) return 0.9;        // 高：不到3天
    if (daysRemaining < 7) return 0.7;        // 中高：不到1周
    if (daysRemaining < 14) return 0.5;       // 中：不到2周
    if (daysRemaining < 30) return 0.3;       // 低：不到1月
    return 0.1;                                // 极低：1月以上
  }
  
  /**
   * 获取余额趋势（简化实现，实际应该追踪历史）
   */
  getBalanceTrend(): 'increasing' | 'stable' | 'decreasing' {
    // 简化：基于最近结算时间判断
    // 实际实现应该追踪余额历史
    const hoursSinceSettlement = (Date.now() - this.lastSettlementTime) / (1000 * 60 * 60);
    
    if (hoursSinceSettlement < 1) {
      return 'stable';
    }
    
    // 默认保守估计
    return 'stable';
  }
  
  /**
   * 获取每日成本（用于外部计算）
   */
  getDailyCost(): number {
    return this.dailyBill?.totalCost || this.estimateDailyCost();
  }

  /**
   * Task 31: Get total cost by type
   * Used for cognitive efficiency calculation
   */
  getTotalCostByType(type: 'api' | 'llm' | 'cognition' | 'storage' | 'heartbeat' | 'gene'): number {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    switch (type) {
      case 'cognition':
      case 'llm':
        // Sum cognition costs
        return this.cognitionCalls
          .filter(c => c.timestamp > oneDayAgo)
          .reduce((sum, c) => sum + c.cost, 0);
      
      case 'api':
        // Sum API call costs
        return this.apiCalls
          .filter(c => c.timestamp > oneDayAgo)
          .reduce((sum, c) => sum + this.costs.apiCall.dynamic(c.cost), 0);
      
      case 'storage':
        return this.storageWrites * this.costs.storageWrite;
      
      case 'heartbeat':
        return this.heartbeats * this.costs.heartbeatGas;
      
      case 'gene':
        return this.genes.length * this.costs.geneMaintenance;
      
      default:
        return 0;
    }
  }

  /**
   * Task 31: Get total cognition cost (for fitness calculation)
   */
  getTotalCognitionCost(): number {
    return this.getTotalCostByType('cognition');
  }
}

export default MetabolismTracker;
