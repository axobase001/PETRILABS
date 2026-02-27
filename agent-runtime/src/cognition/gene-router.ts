/**
 * Gene-Driven Cognition Router
 * 
 * 基于基因表达和经济状况的智能 LLM 服务选择器
 * 
 * 核心特性：
 * 1. 动态服务商注册表（支持运行时添加/移除）
 * 2. 基因驱动选择算法（4 种策略分支）
 * 3. 支持 free/x402/api_key 三种协议
 * 4. 服务质量自评估与 EMA 学习
 * 5. 经济感知（实时余额检查）
 */

import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import {
  LLMProvider,
  CognitiveTraits,
  TaskCriticality,
  CognitiveResult,
  RouterConfig,
  DEFAULT_ROUTER_CONFIG,
  DEFAULT_COGNITIVE_TRAITS,
  WorkingMemory,
  ThinkRequest,
  ProviderStatsUpdate,
  RoutingDecision,
  SelectionContext,
  NoProviderAvailableError,
  ProtocolType,
} from './types';

// ═══════════════════════════════════════════════════════════
// GeneRouter 类
// ═══════════════════════════════════════════════════════════

export class GeneRouter {
  private providers: Map<string, LLMProvider> = new Map();
  private traits: CognitiveTraits;
  private wallet: ethers.Wallet;
  private config: Required<RouterConfig>;
  private decisionHistory: RoutingDecision[] = [];
  
  // 当前余额缓存（定期更新）
  private currentBalance: number = 0;
  private lastBalanceUpdate: number = 0;
  private readonly BALANCE_CACHE_TTL = 30000; // 30 秒

  // 默认服务商列表（硬编码初始值）
  private static DEFAULT_PROVIDERS: LLMProvider[] = [
    {
      id: 'pollinations',
      name: 'Pollinations AI',
      endpoint: 'https://text.pollinations.ai/openai',
      protocol: 'free',
      costPer1kTokens: 0,
      minBalanceRequired: 0,
      qualityScore: 0.6,
      successRate: 1.0,
      avgLatency: 2000,
      available: true,
      lastChecked: 0,
      consecutiveFailures: 0,
      supportedModels: ['openai-large', 'deepseek-reasoner', 'mistral-large'],
    },
    {
      id: 'daydreams-x402',
      name: 'Daydreams Router',
      endpoint: 'https://llm.daydreams.dev/v1',
      protocol: 'x402',
      costPer1kTokens: 0.01,    // $0.01/1k tokens
      minBalanceRequired: 0.1,  // 至少 0.1 USDC
      qualityScore: 0.85,
      successRate: 1.0,
      avgLatency: 1500,
      available: true,
      lastChecked: 0,
      consecutiveFailures: 0,
      supportedModels: ['gpt-4o', 'claude-3-sonnet'],
    },
  ];

  constructor(config: RouterConfig) {
    this.wallet = config.wallet;
    this.traits = config.traits || DEFAULT_COGNITIVE_TRAITS;
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config } as Required<RouterConfig>;

    // 加载默认服务商
    GeneRouter.DEFAULT_PROVIDERS.forEach(p => this.registerProvider(p));

    logger.info('🧬 GeneRouter initialized', {
      traits: this.traits,
      providers: this.providers.size,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 服务商管理
  // ═══════════════════════════════════════════════════════════

  /**
   * 注册新的 LLM 服务商（支持动态发现）
   */
  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.id, {
      ...provider,
      lastChecked: Date.now(),
    });
    logger.info(`📡 Provider registered: ${provider.name} (${provider.protocol})`, {
      id: provider.id,
      cost: provider.costPer1kTokens,
    });
  }

  /**
   * 移除服务商
   */
  unregisterProvider(providerId: string): boolean {
    const existed = this.providers.delete(providerId);
    if (existed) {
      logger.info(`📡 Provider unregistered: ${providerId}`);
    }
    return existed;
  }

  /**
   * 获取所有可用服务商
   */
  getAvailableProviders(): LLMProvider[] {
    return Array.from(this.providers.values()).filter(
      p => p.available && p.consecutiveFailures < 3
    );
  }

  /**
   * 获取特定服务商
   */
  getProvider(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  // ═══════════════════════════════════════════════════════════
  // 核心路由算法：基因驱动选择
  // ═══════════════════════════════════════════════════════════

  /**
   * 选择最适合当前任务的服务商
   */
  selectProvider(
    taskCriticality: TaskCriticality,
    estimatedTokens: number = 1000
  ): LLMProvider | null {
    const available = this.getAvailableProviders();

    if (available.length === 0) {
      logger.error('❌ No cognitive providers available');
      return null;
    }

    // 获取当前余额
    const balance = this.getCurrentBalance();

    // 计算预估成本
    const calculateCost = (p: LLMProvider) =>
      (p.costPer1kTokens * estimatedTokens) / 1000;

    // 筛选能负担得起的服务商
    const affordable = available.filter(
      p => balance >= p.minBalanceRequired + calculateCost(p)
    );

    // 如果没有负担得起的，只能用免费的
    const candidates =
      affordable.length > 0
        ? affordable
        : available.filter(p => p.costPer1kTokens === 0);

    if (candidates.length === 0) {
      logger.warn('💸 Cannot afford any provider', { balance });
      return null;
    }

    // 基因驱动决策
    const context: SelectionContext = {
      traits: this.traits,
      currentBalance: balance,
      taskCriticality,
      estimatedCost: Math.max(...candidates.map(calculateCost)),
      availableProviders: candidates,
    };

    return this.geneticSelection(candidates, context);
  }

  /**
   * 基因选择算法核心
   * 
   * 策略优先级：
   * 1. 极端节俭模式（储蓄倾向 > 0.8 或余额 < 2 USDC）
   * 2. 高危决策模式（critical + 余额充足 + 高质量需求）
   * 3. 风险厌恶模式（风险偏好 < 0.3）
   * 4. 默认：性价比平衡
   */
  private geneticSelection(
    candidates: LLMProvider[],
    context: SelectionContext
  ): LLMProvider {
    const { traits, currentBalance, taskCriticality } = context;

    // 策略 1: 极端节俭模式
    if (traits.savingsTendency > 0.8 || currentBalance < 2.0) {
      logger.info('🐿️ Strategy: Extreme Frugality (high savingsTendency or low balance)');
      
      const freeProviders = candidates.filter(p => p.costPer1kTokens === 0);
      if (freeProviders.length > 0) {
        return this.selectByQuality(freeProviders);
      }
      
      // 没有免费的，选最便宜的
      return candidates.sort((a, b) => a.costPer1kTokens - b.costPer1kTokens)[0];
    }

    // 策略 2: 高危决策模式
    if (
      (taskCriticality === 'high' || taskCriticality === 'critical') &&
      currentBalance > 5.0
    ) {
      logger.info('🎯 Strategy: High-Stakes Decision (critical task with sufficient balance)');
      
      // 追求高质量且有钱
      if (traits.cognitionQuality > 0.7) {
        const paid = candidates
          .filter(p => p.costPer1kTokens > 0)
          .sort((a, b) => b.qualityScore - a.qualityScore);
        
        if (paid.length > 0) {
          logger.info(`✨ Selected premium provider: ${paid[0].name}`);
          return paid[0];
        }
      }
      
      // 否则选最可靠的
      return candidates.sort((a, b) => b.successRate - a.successRate)[0];
    }

    // 策略 3: 风险厌恶模式
    if (traits.riskAppetite < 0.3) {
      logger.info('🛡️ Strategy: Risk-Averse (low riskAppetite)');
      
      return candidates.sort((a, b) => {
        // 成功率差异大时优先成功率
        if (Math.abs(b.successRate - a.successRate) > 0.1) {
          return b.successRate - a.successRate;
        }
        // 成功率接近时选便宜的
        return a.costPer1kTokens - b.costPer1kTokens;
      })[0];
    }

    // 策略 4: 默认（性价比平衡）
    logger.info('⚖️ Strategy: Default (quality/cost balance)');
    
    return candidates.sort((a, b) => {
      const costA = a.costPer1kTokens || 0.001;
      const costB = b.costPer1kTokens || 0.001;
      
      // 性价比得分 = (质量 × 成功率) / 成本
      const scoreA = (a.qualityScore * a.successRate) / costA;
      const scoreB = (b.qualityScore * b.successRate) / costB;
      
      return scoreB - scoreA;
    })[0];
  }

  /**
   * 按质量选择（用于免费服务商筛选）
   */
  private selectByQuality(providers: LLMProvider[]): LLMProvider {
    return providers.sort((a, b) => {
      // 综合考虑质量和成功率
      const scoreA = a.qualityScore * a.successRate * (1 / (1 + a.avgLatency / 1000));
      const scoreB = b.qualityScore * b.successRate * (1 / (1 + b.avgLatency / 1000));
      return scoreB - scoreA;
    })[0];
  }

  // ═══════════════════════════════════════════════════════════
  // 认知执行
  // ═══════════════════════════════════════════════════════════

  /**
   * 执行认知调用（主入口）
   */
  async think(request: ThinkRequest): Promise<CognitiveResult> {
    const { prompt, context, criticality, systemPrompt, temperature, maxTokens } = request;
    const estimatedTokens = Math.ceil(prompt.length / 3) + (maxTokens || 1000);

    // 选择服务商
    const provider = this.selectProvider(criticality, estimatedTokens);
    
    if (!provider) {
      throw new NoProviderAvailableError();
    }

    logger.info('🧠 Thinking...', {
      provider: provider.name,
      criticality,
      estimatedTokens,
    });

    const startTime = Date.now();
    
    try {
      // 根据协议类型调用
      const response = await this.callProvider(provider, prompt, {
        systemPrompt,
        temperature,
        maxTokens,
        workingMemory: context,
      });

      const latency = Date.now() - startTime;
      
      // 更新统计
      this.updateProviderStats(provider.id, {
        success: true,
        latency,
        quality: this.assessQuality(response),
      });

      const result: CognitiveResult = {
        content: response,
        provider: provider.id,
        cost: this.calculateActualCost(provider, response),
        latency,
        timestamp: Date.now(),
      };

      // 记录决策
      this.recordDecision({
        taskCriticality: criticality,
        selectedProvider: provider.id,
        estimatedCost: (provider.costPer1kTokens * estimatedTokens) / 1000,
        actualCost: result.cost,
        strategy: this.getCurrentStrategyName(),
      });

      return result;

    } catch (error) {
      this.updateProviderStats(provider.id, { success: false });
      
      logger.error(`❌ Provider ${provider.id} failed`, { error });

      // 如果启用 fallback，尝试下一个可用 provider
      if (this.config.fallbackEnabled) {
        provider.consecutiveFailures++;
        
        const fallback = this.selectProvider(criticality, estimatedTokens);
        if (fallback && fallback.id !== provider.id) {
          logger.info(`🔄 Falling back to ${fallback.name}`);
          return this.think({ ...request, preferredProvider: fallback.id });
        }
      }

      throw error;
    }
  }

  /**
   * 根据协议类型调用服务商
   */
  private async callProvider(
    provider: LLMProvider,
    prompt: string,
    options: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      workingMemory: WorkingMemory;
    }
  ): Promise<string> {
    switch (provider.protocol) {
      case 'free':
        return this.callFreeProvider(provider, prompt, options);
      case 'x402':
        return this.callX402Provider(provider, prompt, options);
      case 'api_key':
        return this.callApiKeyProvider(provider, prompt, options);
      default:
        throw new Error(`Unknown protocol: ${provider.protocol}`);
    }
  }

  /**
   * 调用免费服务商
   */
  private async callFreeProvider(
    provider: LLMProvider,
    prompt: string,
    options: any
  ): Promise<string> {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.supportedModels?.[0] || 'default',
        messages: [
          ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
      }),
      signal: AbortSignal.timeout(this.config.defaultTimeout),
    });

    if (!response.ok) {
      throw new Error(`Free provider error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || data.content || '';
  }

  /**
   * 调用 x402 付费服务商
   */
  private async callX402Provider(
    provider: LLMProvider,
    prompt: string,
    options: any
  ): Promise<string> {
    // 这里应该使用 x402-client 库
    // 简化版实现
    logger.info(`💳 x402 payment required for ${provider.name}`);
    
    // 实际实现需要集成 x402-client
    // 步骤：获取报价 → 支付 → 获取服务
    throw new Error('x402 protocol not yet fully implemented');
  }

  /**
   * 调用 API Key 服务商
   */
  private async callApiKeyProvider(
    provider: LLMProvider,
    prompt: string,
    options: any
  ): Promise<string> {
    const apiKey = process.env[`${provider.id.toUpperCase()}_API_KEY`];
    
    if (!apiKey) {
      throw new Error(`Missing API key for provider: ${provider.id}`);
    }

    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.supportedModels?.[0],
        messages: [
          ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
      }),
      signal: AbortSignal.timeout(this.config.defaultTimeout),
    });

    if (!response.ok) {
      throw new Error(`API provider error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // ═══════════════════════════════════════════════════════════
  // 自评估与学习
  // ═══════════════════════════════════════════════════════════

  /**
   * 更新服务商统计（指数移动平均）
   */
  updateProviderStats(providerId: string, stats: ProviderStatsUpdate): void {
    const p = this.providers.get(providerId);
    if (!p) return;

    const alpha = 0.1; // EMA 平滑因子

    if (stats.success) {
      p.consecutiveFailures = 0;
      p.successRate = p.successRate * (1 - alpha) + alpha;
      
      if (stats.latency !== undefined) {
        p.avgLatency = p.avgLatency * (1 - alpha) + stats.latency * alpha;
      }
      
      if (stats.quality !== undefined) {
        p.qualityScore = p.qualityScore * (1 - alpha) + stats.quality * alpha;
      }
    } else {
      p.consecutiveFailures++;
      p.successRate = p.successRate * (1 - alpha); // 衰减
      
      // 连续失败 3 次标记为不可用
      if (p.consecutiveFailures >= 3) {
        p.available = false;
        logger.warn(`⚠️ Provider ${p.id} marked as unavailable (3 consecutive failures)`);
      }
    }

    p.lastChecked = Date.now();
  }

  /**
   * 简单启发式质量评估
   */
  private assessQuality(response: string): number {
    // 基于响应长度、结构等进行简单评估
    const length = response.length;
    
    // 太短或太长都不好
    if (length < 50) return 0.3;
    if (length > 10000) return 0.6;
    
    // 检查是否有结构化内容
    const hasStructure = response.includes('```') || 
                         response.includes('- ') || 
                         response.includes('1. ');
    
    return hasStructure ? 0.8 : 0.6;
  }

  /**
   * 计算实际成本
   */
  private calculateActualCost(provider: LLMProvider, response: string): number {
    if (provider.costPer1kTokens === 0) return 0;
    
    const estimatedTokens = Math.ceil(response.length / 3);
    return (provider.costPer1kTokens * estimatedTokens) / 1000;
  }

  // ═══════════════════════════════════════════════════════════
  // 余额管理
  // ═══════════════════════════════════════════════════════════

  /**
   * 获取当前余额（带缓存）
   */
  getCurrentBalance(): number {
    const now = Date.now();
    
    if (now - this.lastBalanceUpdate > this.BALANCE_CACHE_TTL) {
      // 异步更新余额
      this.updateBalance();
    }
    
    return this.currentBalance;
  }

  /**
   * 更新余额
   */
  async updateBalance(): Promise<number> {
    try {
      // 如果有 provider，尝试获取 USDC 余额
      if (this.wallet.provider) {
        // 这里简化处理，实际需要查询 USDC 合约
        const balance = await this.wallet.provider.getBalance(this.wallet.address);
        this.currentBalance = parseFloat(ethers.formatUnits(balance, 6));
        this.lastBalanceUpdate = Date.now();
      }
    } catch (error) {
      logger.error('Failed to update balance', { error });
    }
    
    return this.currentBalance;
  }

  // ═══════════════════════════════════════════════════════════
  // 决策记录
  // ═══════════════════════════════════════════════════════════

  /**
   * 记录路由决策
   */
  private recordDecision(partial: Partial<RoutingDecision>): void {
    const decision: RoutingDecision = {
      timestamp: Date.now(),
      taskCriticality: 'medium',
      selectedProvider: '',
      strategy: '',
      estimatedCost: 0,
      actualCost: 0,
      traits: { ...this.traits },
      currentBalance: this.currentBalance,
      alternatives: [],
      reason: '',
      ...partial,
    };

    this.decisionHistory.push(decision);

    // 只保留最近 100 条
    if (this.decisionHistory.length > 100) {
      this.decisionHistory.shift();
    }
  }

  /**
   * 获取当前策略名称
   */
  private getCurrentStrategyName(): string {
    const { traits, currentBalance } = this;

    if (traits.savingsTendency > 0.8 || currentBalance < 2.0) {
      return 'EXTREME_FRUGALITY';
    }
    if (traits.cognitionQuality > 0.7 && currentBalance > 5.0) {
      return 'HIGH_QUALITY';
    }
    if (traits.riskAppetite < 0.3) {
      return 'RISK_AVERSE';
    }
    return 'DEFAULT_BALANCE';
  }

  /**
   * 获取决策历史
   */
  getDecisionHistory(): RoutingDecision[] {
    return [...this.decisionHistory];
  }

  // ═══════════════════════════════════════════════════════════
  // 健康检查
  // ═══════════════════════════════════════════════════════════

  /**
   * 执行健康检查
   */
  async healthCheck(): Promise<{
    provider: string;
    healthy: boolean;
    latency: number;
  }[]> {
    const results = [];

    for (const [id, provider] of this.providers) {
      const start = Date.now();
      
      try {
        // 简单 ping 检查
        const response = await fetch(provider.endpoint, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        });
        
        results.push({
          provider: id,
          healthy: response.ok,
          latency: Date.now() - start,
        });
        
        provider.available = response.ok;
      } catch {
        results.push({
          provider: id,
          healthy: false,
          latency: Date.now() - start,
        });
        
        provider.available = false;
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════
  // 基因特质更新
  // ═══════════════════════════════════════════════════════════

  /**
   * 更新认知特质（支持运行时调整）
   */
  updateTraits(traits: Partial<CognitiveTraits>): void {
    this.traits = { ...this.traits, ...traits };
    logger.info('🧬 Cognitive traits updated', { traits: this.traits });
  }

  /**
   * 获取当前特质
   */
  getTraits(): CognitiveTraits {
    return { ...this.traits };
  }
}

export default GeneRouter;
