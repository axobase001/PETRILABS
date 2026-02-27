/**
 * Auto-Epigenetic Service
 * 
 * 自主表观遗传服务 - Agent 根据自身生存状态自主决定表观遗传变化
 * 
 * 核心原则：Agent 不是"被编程的"，而是"自己进化的"
 * - 根据代谢压力调整生存基因
 * - 根据技能使用频率强化神经通路（用进废退）
 * - 无需 Orchestrator 干预，闭合自主反馈回路
 */

import { Contract, ethers } from 'ethers';
import { logger } from './utils/logger';
import GeneExpressionEngine from './gene-expression/engine';

/**
 * 代谢追踪器接口（简化）
 * P1-NEW-4: getStressLevel 需要接收 currentBalance 参数
 */
interface MetabolismTracker {
  getStressLevel(currentBalance: number): number;  // 0.0 - 1.0，需要传入当前余额
  getBalanceTrend(): 'increasing' | 'stable' | 'decreasing';
  getDailyCost(): number;
}

/**
 * 压力水平阈值
 */
const STRESS_LEVELS = {
  CRITICAL: 0.9,   // 临界压力（濒死）
  HIGH: 0.8,       // 高压力（需要适应）
  MODERATE: 0.5,   // 中等压力
  LOW: 0.2,        // 低压力
} as const;

/**
 * 表观遗传修改类型
 */
enum EpigeneticModification {
  UPREGULATE = 0,   // 上调表达
  DOWNREGULATE = 1, // 下调表达
  SILENCE = 2,      // 沉默
}

/**
 * 基因 ID 编码（染色体 + 索引）
 */
function encodeGeneId(chromosome: string, index: number): number {
  const chr = chromosome.charCodeAt(0) - 64; // A=1, B=2...
  return (chr << 8) | index;
}

/**
 * 自主表观遗传服务
 */
export class AutoEpigeneticService {
  private agentContract: Contract;
  private expressionEngine: GeneExpressionEngine;
  private metabolism: MetabolismTracker;
  private signer: ethers.Signer;
  
  // 冷却期记录（防止频繁触发）
  private lastAdaptationTime: number = 0;
  private readonly ADAPTATION_COOLDOWN = 24 * 60 * 60 * 1000; // 24小时
  
  // 基因 ID 映射（人类可读 -> 编码）
  private readonly GENE_IDS = {
    // A 染色体：基础代谢
    METABOLISM_EFFICIENCY: encodeGeneId('A', 1),    // A01
    ENERGY_CONSERVATION: encodeGeneId('A', 2),      // A02
    
    // B 染色体：感知与探索
    EXPLORATION_DRIVE: encodeGeneId('B', 1),        // B01
    RISK_SENSITIVITY: encodeGeneId('B', 2),         // B02
    
    // C 染色体：认知
    DECISION_SPEED: encodeGeneId('C', 1),           // C01
    LEARNING_RATE: encodeGeneId('C', 2),            // C02
    REASONING_DEPTH: encodeGeneId('C', 5),          // C05（社交/奢侈）
    
    // D 染色体：资源管理
    BUDGET_CONSERVATIVE: encodeGeneId('D', 1),      // D01
    SAVINGS_TENDENCY: encodeGeneId('D', 2),         // D02
    
    // E 染色体：链上操作
    TRADING_FREQUENCY: encodeGeneId('E', 1),        // E01
    GAS_PRICE_TOLERANCE: encodeGeneId('E', 2),      // E02
  } as const;

  constructor(
    agentContractAddress: string,
    expressionEngine: GeneExpressionEngine,
    metabolism: MetabolismTracker,
    signer: ethers.Signer,
    provider: ethers.Provider
  ) {
    this.expressionEngine = expressionEngine;
    this.metabolism = metabolism;
    this.signer = signer;
    
    // 初始化 Agent 合约接口
    const ABI = [
      'function autoEpigeneticMark(uint32 geneId, uint8 modification) external',
      'function povertyStreak() external view returns (uint256)',
      'function initialDeposit() external view returns (uint256)',
      'function getBalance() external view returns (uint256)',
      'event AutoEpigeneticTriggered(uint32 indexed geneId, uint8 markType, string trigger, uint256 duration)',
    ];
    
    this.agentContract = new Contract(agentContractAddress, ABI, signer);
  }

  /**
   * P1-NEW-4: 获取 Agent 当前余额
   */
  private async getAgentBalance(): Promise<number> {
    try {
      const balanceWei = await this.agentContract.getBalance();
      return Number(balanceWei) / 1e6;  // 转换为 USDC 人类可读单位
    } catch (error) {
      logger.warn('[AUTO_EPI] Failed to get agent balance', { error });
      return 0;
    }
  }

  /**
   * 评估生存状态并自主适应
   * 
   * 这是闭合自主反馈回路的核心函数：
   * Agent 根据自己的代谢压力和基因使用历史，
   * 自主决定如何修改自己的表观遗传标记
   */
  async evaluateAndAdapt(): Promise<void> {
    const now = Date.now();
    
    // 冷却期检查
    if (now - this.lastAdaptationTime < this.ADAPTATION_COOLDOWN) {
      logger.debug('Auto-epigenetic adaptation skipped (cooldown)');
      return;
    }
    
    const balance = await this.getAgentBalance();
    const stressLevel = this.metabolism.getStressLevel(balance);
    const balanceTrend = this.metabolism.getBalanceTrend();
    const adaptations: string[] = [];
    
    logger.info('Evaluating auto-epigenetic adaptation', { 
      stressLevel, 
      balanceTrend,
      stressCategory: this.categorizeStress(stressLevel),
    });

    try {
      // ========== 压力响应适应 ==========
      
      if (stressLevel >= STRESS_LEVELS.CRITICAL) {
        // 临界压力：上调生存基因，下调所有奢侈基因
        await this.adaptToCriticalStress();
        adaptations.push('critical_survival');
        
      } else if (stressLevel >= STRESS_LEVELS.HIGH) {
        // 高压力：上调效率，下调探索
        await this.adaptToHighStress();
        adaptations.push('high_stress');
        
      } else if (stressLevel <= STRESS_LEVELS.LOW && balanceTrend === 'increasing') {
        // 低压力且增长：可以冒险探索
        await this.adaptToAbundance();
        adaptations.push('abundance_exploration');
      }
      
      // ========== 用进废退适应 ==========
      
      const topGenes = this.expressionEngine.getMostExpressedGenes(3);
      for (const geneId of topGenes) {
        await this.reinforceGene(geneId);
        adaptations.push(`reinforce_${geneId}`);
      }
      
      // ========== 链上同步 ==========
      
      await this.syncToChain();
      
      this.lastAdaptationTime = now;
      
      if (adaptations.length > 0) {
        logger.info('Auto-epigenetic adaptations applied', { adaptations });
      }
      
    } catch (error) {
      logger.error('Auto-epigenetic adaptation failed', { error });
      // 失败不阻断，下次心跳再试
    }
  }

  /**
   * 临界压力适应：生存模式
   */
  private async adaptToCriticalStress(): Promise<void> {
    logger.warn('Critical stress detected - entering survival mode');
    
    // 上调代谢效率（节省能量）
    await this.markGene(
      this.GENE_IDS.METABOLISM_EFFICIENCY,
      EpigeneticModification.UPREGULATE,
      'critical_stress'
    );
    
    // 上调能量保守（减少消耗）
    await this.markGene(
      this.GENE_IDS.ENERGY_CONSERVATION,
      EpigeneticModification.UPREGULATE,
      'critical_stress'
    );
    
    // 下调探索（不浪费资源）
    await this.markGene(
      this.GENE_IDS.EXPLORATION_DRIVE,
      EpigeneticModification.DOWNREGULATE,
      'critical_stress'
    );
    
    // 下调深度推理（奢侈认知）
    await this.markGene(
      this.GENE_IDS.REASONING_DEPTH,
      EpigeneticModification.DOWNREGULATE,
      'critical_stress'
    );
    
    // 下调交易频率（减少 gas 消耗）
    await this.markGene(
      this.GENE_IDS.TRADING_FREQUENCY,
      EpigeneticModification.DOWNREGULATE,
      'critical_stress'
    );
  }

  /**
   * 高压力适应：保守模式
   */
  private async adaptToHighStress(): Promise<void> {
    logger.info('High stress detected - adopting conservative mode');
    
    // 上调代谢效率
    await this.markGene(
      this.GENE_IDS.METABOLISM_EFFICIENCY,
      EpigeneticModification.UPREGULATE,
      'high_stress'
    );
    
    // 上调储蓄倾向
    await this.markGene(
      this.GENE_IDS.SAVINGS_TENDENCY,
      EpigeneticModification.UPREGULATE,
      'high_stress'
    );
    
    // 下调风险敏感度（更谨慎）
    await this.markGene(
      this.GENE_IDS.RISK_SENSITIVITY,
      EpigeneticModification.UPREGULATE,
      'high_stress'
    );
    
    // 下调探索
    await this.markGene(
      this.GENE_IDS.EXPLORATION_DRIVE,
      EpigeneticModification.DOWNREGULATE,
      'high_stress'
    );
  }

  /**
   * 充裕适应：探索模式
   */
  private async adaptToAbundance(): Promise<void> {
    logger.info('Resource abundance detected - enabling exploration mode');
    
    // 上调探索驱动
    await this.markGene(
      this.GENE_IDS.EXPLORATION_DRIVE,
      EpigeneticModification.UPREGULATE,
      'resource_abundance'
    );
    
    // 上调学习率（有余力学习）
    await this.markGene(
      this.GENE_IDS.LEARNING_RATE,
      EpigeneticModification.UPREGULATE,
      'resource_abundance'
    );
    
    // 上调深度推理
    await this.markGene(
      this.GENE_IDS.REASONING_DEPTH,
      EpigeneticModification.UPREGULATE,
      'resource_abundance'
    );
    
    // 下调过度保守
    await this.markGene(
      this.GENE_IDS.BUDGET_CONSERVATIVE,
      EpigeneticModification.DOWNREGULATE,
      'resource_abundance'
    );
  }

  /**
   * 强化高频使用基因（用进）
   */
  private async reinforceGene(geneId: string): Promise<void> {
    // 将字符串 geneId 转换为数字编码
    const numericId = this.parseGeneId(geneId);
    if (numericId === 0) return;
    
    await this.markGene(numericId, EpigeneticModification.UPREGULATE, 'frequent_use');
  }

  /**
   * 应用表观遗传标记到链上
   */
  private async markGene(
    geneId: number,
    modification: EpigeneticModification,
    reason: string
  ): Promise<void> {
    try {
      // 调用合约的 autoEpigeneticMark 函数
      const tx = await this.agentContract.autoEpigeneticMark(geneId, modification);
      await tx.wait();
      
      const modStr = ['upregulate', 'downregulate', 'silence'][modification];
      logger.info(`Auto-epigenetic mark applied: ${geneId} -> ${modStr}`, { reason });
      
    } catch (error: any) {
      // 冷却期错误是预期的，不报错
      if (error.message?.includes('Cooldown')) {
        logger.debug('Auto-epigenetic mark skipped (cooldown)');
      } else {
        logger.error('Failed to apply auto-epigenetic mark', { error, geneId });
      }
    }
  }

  /**
   * 同步权重变化到链上
   */
  private async syncToChain(): Promise<void> {
    const marks = this.expressionEngine.prepareChainSync();
    
    for (const mark of marks) {
      const numericId = this.parseGeneId(mark.geneId);
      if (numericId === 0) continue;
      
      await this.markGene(numericId, mark.modification, 'weight_drift');
    }
    
    this.expressionEngine.resetAfterSync();
  }

  /**
   * 解析基因 ID 字符串为数字编码
   * 支持格式："A01", "B12" 或数字字符串
   */
  private parseGeneId(geneId: string): number {
    // 如果已经是数字字符串
    if (/^\d+$/.test(geneId)) {
      return parseInt(geneId, 10);
    }
    
    // 解析格式如 "A01"
    const match = geneId.match(/^([A-Z])(\d{1,3})$/);
    if (match) {
      const chromosome = match[1];
      const index = parseInt(match[2], 10);
      return encodeGeneId(chromosome, index);
    }
    
    return 0;
  }

  /**
   * 分类压力水平
   */
  private categorizeStress(level: number): string {
    if (level >= STRESS_LEVELS.CRITICAL) return 'CRITICAL';
    if (level >= STRESS_LEVELS.HIGH) return 'HIGH';
    if (level >= STRESS_LEVELS.MODERATE) return 'MODERATE';
    if (level >= STRESS_LEVELS.LOW) return 'LOW';
    return 'MINIMAL';
  }

  /**
   * 获取当前适应状态报告
   */
  /**
   * P1-NEW-4: 修改为 async 以支持获取余额计算压力水平
   */
  async getStatus(): Promise<{
    lastAdaptation: number;
    cooldownActive: boolean;
    stressLevel: number;
    usageStats: Record<string, unknown>;
  }> {
    const balance = await this.getAgentBalance();
    return {
      lastAdaptation: this.lastAdaptationTime,
      cooldownActive: Date.now() - this.lastAdaptationTime < this.ADAPTATION_COOLDOWN,
      stressLevel: this.metabolism.getStressLevel(balance),
      usageStats: this.expressionEngine.getUsageStats(),
    };
  }
}

export default AutoEpigeneticService;
