/**
 * CognitionRouter
 * 双模态认知路由器
 * 
 * 职责：
 * - 协调免费层（Pollinations）和付费层（X402 LLM）
 * - 根据预算决策引擎选择最优路径
 * - 处理失败回退（付费失败 → 免费层）
 * - 记录认知支出到代谢系统
 */

import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { Gene, GeneDomain } from '../types';
import { PollinationsProvider } from './providers/pollinations';
import { X402LLMProvider, BudgetExceededError } from './providers/x402-llm';
import { CognitionBudgetEngine } from './budget-engine';
import MetabolismTracker from '../metabolism/tracker';

export interface CognitionRouterConfig {
  wallet: ethers.Wallet;
  metabolism: MetabolismTracker;
  genome: {
    triggerStressResponse(type: string, context: unknown): Promise<void>;
  };
  x402Client?: unknown;
}

export interface ReasoningRequest {
  gene: Gene;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  context?: {
    promptLength: number;
    taskDescription?: string;
  };
}

export interface ReasoningResult {
  success: boolean;
  content: string;
  model: string;
  provider: 'pollinations' | 'x402-llm';
  cost: number;
  latency: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  fallback?: boolean;  // 是否使用了 fallback
  error?: string;
}

export class CognitionRouter {
  private freeProvider: PollinationsProvider;
  private premiumProvider: X402LLMProvider;
  private budgetEngine: CognitionBudgetEngine;
  private metabolism: MetabolismTracker;
  private genome: CognitionRouterConfig['genome'];
  private wallet: ethers.Wallet;

  constructor(config: CognitionRouterConfig) {
    this.wallet = config.wallet;
    this.metabolism = config.metabolism;
    this.genome = config.genome;
    
    // 初始化免费层
    this.freeProvider = new PollinationsProvider();
    
    // 初始化付费层
    this.premiumProvider = new X402LLMProvider({
      wallet: config.wallet,
    });
    
    // 初始化预算决策引擎
    this.budgetEngine = new CognitionBudgetEngine();
    
    logger.info('CognitionRouter initialized (dual-mode)');
  }

  /**
   * 执行推理 - 主入口
   * B-染色体基因的推理请求路由到这里
   */
  async reason(request: ReasoningRequest): Promise<ReasoningResult> {
    const startTime = Date.now();
    const { gene, prompt, systemPrompt, temperature, context } = request;
    
    logger.info('Cognition routing', {
      geneId: gene.id,
      complexity: this.extractComplexity(gene),
      promptLength: prompt.length,
    });

    try {
      // 步骤 1：预算决策
      const decision = await this.budgetEngine.evaluate({
        gene,
        complexity: this.extractComplexity(gene),
        promptLength: context?.promptLength || prompt.length,
        currentBalance: await this.getCurrentBalance(),
        taskCriticality: gene.weight / 100000, // 转换为 0-1
      });

      logger.debug('Budget decision', {
        shouldPay: decision.shouldPay,
        reason: decision.reason,
        selectedModel: decision.selectedModel,
      });

      // 步骤 2：执行推理
      if (decision.shouldPay && decision.selectedModel) {
        try {
          // 路径 B：付费层
          const result = await this.executePremium({
            gene,
            prompt,
            systemPrompt,
            temperature,
            model: decision.selectedModel,
            maxCost: decision.estimatedCost,
          });
          
          // 记录支出
          await this.recordExpense(result, gene);
          
          return result;
          
        } catch (error) {
          // 付费失败 → 回退到免费层
          logger.warn('Premium reasoning failed, falling back to free tier', { error });
          
          // 触发压力响应
          await this.genome.triggerStressResponse('G-ECON-001', {
            type: 'cognition_affordability_crisis',
            attemptedCost: decision.estimatedCost,
            error: error instanceof Error ? error.message : 'unknown',
          });
          
          // 回退到免费层
          return this.executeFallback({
            gene,
            prompt,
            systemPrompt,
            temperature,
            complexity: this.extractComplexity(gene),
            originalError: error,
          });
        }
      }
      
      // 路径 A（默认）：免费层
      return await this.executeFree({
        gene,
        prompt,
        systemPrompt,
        temperature,
        complexity: this.extractComplexity(gene),
      });

    } catch (error) {
      logger.error('Cognition routing failed', { error });
      
      // 最后防线：尝试免费层
      try {
        return await this.executeFree({
          gene,
          prompt,
          systemPrompt,
          temperature,
          complexity: 'standard',
        });
      } catch (fallbackError) {
        return {
          success: false,
          content: '',
          model: 'none',
          provider: 'pollinations',
          cost: 0,
          latency: Date.now() - startTime,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  }

  /**
   * 执行付费层推理
   */
  private async executePremium(params: {
    gene: Gene;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    model: string;
    maxCost: number;
  }): Promise<ReasoningResult> {
    const startTime = Date.now();
    
    const result = await this.premiumProvider.reason({
      model: params.model,
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      maxCost: params.maxCost,
    });

    return {
      success: true,
      content: result.content,
      model: result.model,
      provider: 'x402-llm',
      cost: result.actualCost,
      latency: result.latency,
      usage: result.usage,
    };
  }

  /**
   * 执行免费层推理
   */
  private async executeFree(params: {
    gene: Gene;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    complexity: string;
  }): Promise<ReasoningResult> {
    const startTime = Date.now();
    
    const result = await this.freeProvider.reason({
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      complexity: params.complexity as 'standard' | 'deep' | 'critical',
    });

    return {
      success: true,
      content: result.content,
      model: result.model,
      provider: 'pollinations',
      cost: 0, // 免费层成本为 0
      latency: result.latency,
      usage: result.usage,
    };
  }

  /**
   * 执行回退（付费失败后的免费层）
   */
  private async executeFallback(params: {
    gene: Gene;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    complexity: string;
    originalError: unknown;
  }): Promise<ReasoningResult> {
    const startTime = Date.now();
    
    const result = await this.executeFree({
      gene: params.gene,
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      temperature: params.temperature,
      complexity: params.complexity,
    });

    return {
      ...result,
      fallback: true,
    };
  }

  /**
   * 记录认知支出
   */
  private async recordExpense(result: ReasoningResult, gene: Gene): Promise<void> {
    // 记录到代谢追踪器
    if (result.provider === 'x402-llm') {
      this.metabolism.recordApiCall(result.cost, 'x402-llm', gene.id.toString());
    }
    
    // 记录 LLM 调用（无论免费付费都记录）
    this.metabolism.recordLlmCall();
    
    logger.info('Cognition expense recorded', {
      geneId: gene.id,
      provider: result.provider,
      cost: result.cost,
      model: result.model,
    });
  }

  /**
   * 从基因中提取复杂度
   */
  private extractComplexity(gene: Gene): 'standard' | 'deep' | 'critical' {
    // 根据基因 value 和 weight 判断复杂度
    const expression = (gene.value * gene.weight) / 1000000;
    
    if (expression > 1.5 || gene.domain === GeneDomain.PLANNING) {
      return 'critical';
    }
    if (expression > 1.0 || gene.domain === GeneDomain.COGNITION) {
      return 'deep';
    }
    return 'standard';
  }

  /**
   * 获取当前余额
   */
  private async getCurrentBalance(): Promise<number> {
    try {
      const balance = await this.wallet.provider?.getBalance(this.wallet.address);
      if (balance) {
        return parseFloat(ethers.formatUnits(balance, 6)); // USDC 有 6 位小数
      }
    } catch (error) {
      logger.error('Failed to get balance', { error });
    }
    return 0;
  }

  /**
   * 获取认知预算状态
   */
  async getBudgetStatus(): Promise<{
    currentBalance: number;
    strategy: ReturnType<CognitionBudgetEngine['getBudgetStrategy']>;
    dailyBudget: ReturnType<CognitionBudgetEngine['calculateDailyCognitionBudget']>;
  }> {
    const balance = await this.getCurrentBalance();
    const metabolism = this.metabolism.getMetabolicStatus();
    
    const strategy = this.budgetEngine.getBudgetStrategy(
      balance,
      metabolism.dailyCost
    );
    
    const dailyBudget = this.budgetEngine.calculateDailyCognitionBudget(
      balance,
      metabolism.dailyCost
    );
    
    return {
      currentBalance: balance,
      strategy,
      dailyBudget,
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    free: boolean;
    premium: boolean;
    balance: number;
  }> {
    const [freeHealth, balance] = await Promise.all([
      this.freeProvider.healthCheck(),
      this.getCurrentBalance(),
    ]);
    
    // 检查付费层余额
    const premiumHealth = balance > 0.5;
    
    return {
      free: freeHealth.healthy,
      premium: premiumHealth,
      balance,
    };
  }
}

export default CognitionRouter;
