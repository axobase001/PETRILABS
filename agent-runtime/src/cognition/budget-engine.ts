/**
 * Cognition Budget Engine
 * 认知预算决策引擎
 * 
 * Agent 的"经济理性"核心：
 * - 评估任务复杂度 vs 成本效益
 * - 决定是否值得付费升级
 * - 选择最优模型（性价比）
 */

import { logger } from '../utils/logger';
import { Gene, GeneDomain } from '../types';

export interface BudgetDecision {
  shouldPay: boolean;
  selectedModel?: string;
  estimatedCost: number;
  reason: string;
  fallbackModel?: string;  // 免费层备选
}

export interface EvaluationContext {
  gene: Gene;
  complexity: 'standard' | 'deep' | 'critical';
  promptLength: number;
  currentBalance: number;
  taskCriticality: number;  // 0-1，基因 priority
  historicalSuccess?: number; // 历史成功率（可选）
}

export class CognitionBudgetEngine {
  // 生存准备金（USDC）- 必须保留用于代谢成本
  private readonly SURVIVAL_RESERVE = 0.5;
  
  // 认知预算占总余额的比例上限
  private readonly MAX_COGNITION_RATIO = 0.3;
  
  // 模型价格表（每 1K tokens，用于估算）
  private readonly MODEL_PRICES: Record<string, number> = {
    'gpt-4o': 0.005,
    'gpt-4o-mini': 0.0006,
    'claude-3-5-sonnet': 0.003,
    'claude-3-haiku': 0.0005,
    'deepseek-chat': 0.0007,
    'deepseek-reasoner': 0.002,
    'pollinations-free': 0,  // 免费层
  };

  /**
   * 评估是否值得付费升级
   */
  async evaluate(context: EvaluationContext): Promise<BudgetDecision> {
    const { gene, complexity, currentBalance, taskCriticality, promptLength } = context;
    
    // 获取基因的代谢预算
    const geneBudget = gene.metabolicCost / 10000; // 转换为 USDC
    
    logger.debug('Evaluating cognition budget', {
      geneId: gene.id,
      complexity,
      currentBalance,
      geneBudget,
      taskCriticality,
    });

    // 决策 1：简单任务 → 坚决不付费
    if (complexity === 'standard') {
      return {
        shouldPay: false,
        reason: 'standard_task_use_free_tier',
        fallbackModel: 'openai-large',  // Pollinations 免费模型
        estimatedCost: 0,
      };
    }

    // 决策 2：检查生存准备金
    if (currentBalance < this.SURVIVAL_RESERVE) {
      logger.warn('Balance below survival reserve, forcing free tier', {
        balance: currentBalance,
        reserve: this.SURVIVAL_RESERVE,
      });
      
      return {
        shouldPay: false,
        reason: 'balance_below_survival_reserve',
        fallbackModel: this.selectFreeModel(complexity),
        estimatedCost: 0,
      };
    }

    // 决策 3：检查基因预算是否足以支付任何付费模型
    const cheapestPaidModel = this.findCheapestModel('paid');
    const minPaidCost = this.estimateCost(cheapestPaidModel, promptLength);
    
    if (geneBudget < minPaidCost) {
      logger.info('Gene budget insufficient for paid models', {
        geneBudget,
        minPaidCost,
      });
      
      return {
        shouldPay: false,
        reason: 'gene_budget_insufficient',
        fallbackModel: this.selectFreeModel(complexity),
        estimatedCost: 0,
      };
    }

    // 决策 4：成本效益分析
    // 价值分数 = 任务关键性 * 复杂度权重
    const complexityWeight = this.getComplexityWeight(complexity);
    const valueScore = taskCriticality * complexityWeight * 10; // 0-10
    
    // 成本分数 = 基因预算 * 100（归一化）
    const costScore = geneBudget * 100;
    
    // 如果价值分数 > 成本分数，且预算充足 → 付费
    if (valueScore > costScore && geneBudget >= minPaidCost) {
      const selectedModel = this.selectOptimalModel(geneBudget, complexity);
      const estimatedCost = this.estimateCost(selectedModel, promptLength);
      
      // 预留 20% 缓冲
      const bufferedCost = estimatedCost * 1.2;
      
      if (bufferedCost <= geneBudget && bufferedCost <= currentBalance - this.SURVIVAL_RESERVE) {
        return {
          shouldPay: true,
          selectedModel,
          estimatedCost: bufferedCost,
          reason: 'high_value_task_worth_premium',
        };
      }
    }

    // 决策 5：默认使用免费层
    return {
      shouldPay: false,
      reason: 'cost_efficiency_preference',
      fallbackModel: this.selectFreeModel(complexity),
      estimatedCost: 0,
    };
  }

  /**
   * 选择最优模型（预算内最好的）
   */
  private selectOptimalModel(budget: number, complexity: string): string {
    // 按质量排序（贵的在前）
    const candidates = Object.entries(this.MODEL_PRICES)
      .filter(([model, price]) => {
        if (price === 0) return false; // 跳过免费模型
        if (complexity === 'critical' && price < 0.002) return false; // 关键任务用高端模型
        return price <= budget;
      })
      .sort((a, b) => b[1] - a[1]); // 价格降序 = 质量降序

    if (candidates.length > 0) {
      return candidates[0][0];
    }

    // 预算不足，返回最便宜的付费模型
    return 'deepseek-chat';
  }

  /**
   * 选择免费层模型
   */
  private selectFreeModel(complexity: string): string {
    switch (complexity) {
      case 'critical':
        return 'deepseek-reasoner';  // Pollinations 支持的最好模型
      case 'deep':
        return 'deepseek-reasoner';
      case 'standard':
      default:
        return 'openai-large';
    }
  }

  /**
   * 估算成本
   */
  private estimateCost(model: string, promptLength: number): number {
    const pricePer1K = this.MODEL_PRICES[model] || 0.001;
    const estimatedTokens = Math.ceil(promptLength / 3) + 1000; // +1000 for completion
    return (estimatedTokens / 1000) * pricePer1K;
  }

  /**
   * 获取复杂度权重
   */
  private getComplexityWeight(complexity: string): number {
    switch (complexity) {
      case 'critical':
        return 1.5;
      case 'deep':
        return 1.2;
      case 'standard':
      default:
        return 0.8;
    }
  }

  /**
   * 找到指定类型最便宜的模型
   */
  private findCheapestModel(type: 'free' | 'paid'): string {
    const entries = Object.entries(this.MODEL_PRICES)
      .filter(([_, price]) => type === 'free' ? price === 0 : price > 0)
      .sort((a, b) => a[1] - b[1]);
    
    return entries[0]?.[0] || 'deepseek-chat';
  }

  /**
   * 计算建议的每日认知预算
   */
  calculateDailyCognitionBudget(
    totalBalance: number,
    dailyMetabolism: number,
    daysTarget: number = 30
  ): { cognitionBudget: number; reasoning: number } {
    // 保留生存资金
    const survivalReserve = this.SURVIVAL_RESERVE;
    
    // 保留代谢资金
    const metabolismReserve = dailyMetabolism * daysTarget;
    
    // 可用资金
    const available = Math.max(0, totalBalance - survivalReserve - metabolismReserve);
    
    // 认知预算（最多 30% 的可用资金）
    const cognitionBudget = available * this.MAX_COGNITION_RATIO;
    
    // 建议的推理次数（假设每次平均 $0.005）
    const avgCostPerReasoning = 0.005;
    const reasoning = Math.floor(cognitionBudget / avgCostPerReasoning);
    
    return { cognitionBudget, reasoning };
  }

  /**
   * 动态调整预算策略
   * 根据当前余额状态返回建议
   */
  getBudgetStrategy(
    currentBalance: number,
    dailyMetabolism: number
  ): {
    tier: 'survival' | 'economy' | 'standard' | 'premium';
    maxComplexity: string;
    description: string;
  } {
    const runway = currentBalance / dailyMetabolism;
    
    if (runway < 3 || currentBalance < 1) {
      return {
        tier: 'survival',
        maxComplexity: 'standard',
        description: 'Critical low balance: Only use free tier (Pollinations)',
      };
    }
    
    if (runway < 7) {
      return {
        tier: 'economy',
        maxComplexity: 'standard',
        description: 'Low balance: Prefer free tier, paid only for critical tasks',
      };
    }
    
    if (runway < 30) {
      return {
        tier: 'standard',
        maxComplexity: 'deep',
        description: 'Moderate balance: Use paid tier for deep reasoning',
      };
    }
    
    return {
      tier: 'premium',
      maxComplexity: 'critical',
      description: 'Healthy balance: Full cognitive capabilities available',
    };
  }
}

export default CognitionBudgetEngine;
