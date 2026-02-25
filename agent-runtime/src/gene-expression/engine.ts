/**
 * ═══════════════════════════════════════════════════════════
 * 硬表达透明性原则 (Hard Expression Opacity Principle)
 * ═══════════════════════════════════════════════════════════
 * 
 * LLM 不知道自己被约束，这是硬表达的必要条件。
 * 
 * 硬表达参数（RuntimeParams）直接修改 agent 的行为边界，
 * 不经过 LLM 推理，不出现在 System Prompt 中，
 * 不以任何形式暴露给认知层。
 * 
 * 类比：人的心率由窦房结控制，大脑皮层无法直接命令心脏停跳。
 * 即使大脑"决定"要冒险，心脏的保护性反射仍然生效。
 * 大脑不知道这次保护发生了——它只知道自己"没有死"。
 * 
 * 违反此原则的代码（将 GENE_OVERRIDE 事件、dissonance 指标、
 * 或任何硬表达参数值注入到 LLM 可见的文本中）必须被视为 BUG。
 * 
 * 唯一例外：软表达（PromptGenomeInjector）注入的是"倾向性描述"，
 * 不是硬参数值。LLM 看到的是"你倾向于谨慎"，
 * 不是"你的 maxSingleTransactionRatio = 0.07"。
 * ═══════════════════════════════════════════════════════════
 */

import { logger } from '../utils/logger';
import { Genome, RuntimeParams, AgentState, Gene } from '../types';

/**
 * 基因使用日志（用于用进废退权重漂移）
 */
interface GeneUsageLog {
  geneId: string;
  activationCount: number;
  lastActivated: number;
  accumulatedWeight: number;
}

/**
 * Sigmoid 映射函数
 * 将 0-1 的基因值映射到指定范围，带可调陡度
 * 
 * @param geneValue 0-1 的基因值
 * @param minOutput 输出范围最小值
 * @param maxOutput 输出范围最大值
 * @param steepness 陡度因子（默认 5）
 * @param midpoint 中点偏移（默认 0.5）
 * @param inverse 是否反转（高基因值 = 低输出）
 */
export function sigmoidMap(
  geneValue: number,
  minOutput: number,
  maxOutput: number,
  steepness: number = 5,
  midpoint: number = 0.5,
  inverse: boolean = false
): number {
  // 确保基因值在 0-1 范围内
  const clampedGene = Math.max(0, Math.min(1, geneValue));
  
  // Sigmoid: 1 / (1 + e^(-k * (x - x0)))
  const sigmoid = 1 / (1 + Math.exp(-steepness * (clampedGene - midpoint)));
  
  // 映射到输出范围
  let output = minOutput + (maxOutput - minOutput) * sigmoid;
  
  // 反转（如果需要）
  if (inverse) {
    output = maxOutput - (output - minOutput);
  }
  
  return output;
}

/**
 * 基因表达引擎
 * 将基因型 + 环境状态 = 表型（运行时参数）
 * 
 * 新增：用进废退（Neural Plasticity）- 基因使用频率影响权重
 */
export class GeneExpressionEngine {
  private usageLog: Map<string, GeneUsageLog> = new Map();
  private geneExpressionCache: Map<string, number> = new Map();
  
  // 权重漂移常量
  private readonly USE_STRENGTHEN_FACTOR = 1.1;  // 每10次使用增强 10%
  private readonly DECAY_FACTOR = 0.95;          // 每天衰减 5%
  private readonly MAX_WEIGHT = 2.0;             // 上限 2.0x
  private readonly MIN_WEIGHT = 0.5;             // 下限 0.5x
  private readonly DECAY_START_DAYS = 7;         // 7天后开始衰减
  private readonly USES_PER_STRENGTHEN = 10;     // 每10次使用增强一次

  /**
   * 表达基因：基因 × 环境 × 权重漂移 = 表型
   * 
   * 环境调节因子：
   * - povertyFactor: 余额越低，风险参数越保守
   * - crowdingFactor: 已知存活 agent 越多，竞争越激烈
   * 
   * 权重漂移（用进废退）：
   * - 频繁使用的基因权重增强
   * - 长期未使用的基因权重衰减
   */
  express(geneId: string, genome: Genome, currentState: AgentState): RuntimeParams {
    // 记录基因使用（用进废退）
    this.recordUsage(geneId);
    
    const t = genome.expressedTraits;
    const env = currentState;
    
    // 应用权重漂移
    const weightDrift = this.getWeightDrift(geneId);
    
    // ===== 环境调节因子 =====
    
    // 贫穷因子：余额越低，所有风险参数越保守
    // 范围 0.0（濒死）到 1.0（富裕，余额 ≥ $20）
    const povertyFactor = Math.min(1.0, (env.balance || 0) / 20.0) * weightDrift;
    
    // 拥挤因子：已知存活 agent 越多，竞争越激烈
    // 范围 0.5（极拥挤）到 1.0（空旷，≤10 个 agent）
    const crowdingFactor = Math.max(0.5, 1.0 - ((env.knownAliveAgents || 0) / 50));
    
    // ===== 基因 × 环境 × 权重漂移 = 表型 =====
    
    return {
      // 代谢间隔：压力响应越高，代谢越快（值越小）
      metabolicInterval: sigmoidMap(
        t.stressResponse, 
        15000,  // 15秒（高压力）
        45000,  // 45秒（低压力）
        5,      // 陡度
        0.5,    // 中点
        true    // 反转：高基因值 = 低输出（短间隔）
      ),

      // 认知预算比例：推理质量 vs 储蓄倾向的平衡
      cognitionBudgetRatio: clamp(
        sigmoidMap(
          (t.inferenceQuality + (1 - t.savingsTendency)) / 2,
          0.01,  // 1%
          0.08   // 8%
        ) * povertyFactor,
        0.001,  // 最低 0.1%
        0.1     // 最高 10%
      ),
      // 穷 agent 的认知预算按比例缩减
      // 例如：余额 $5 时预算只有基因决定值的 25%

      // 单笔交易上限比例：风险偏好 × 贫穷因子
      maxSingleTransactionRatio: clamp(
        sigmoidMap(t.riskAppetite, 0.03, 0.25) * povertyFactor,
        0.01,   // 最低 1%
        0.3     // 最高 30%
      ),
      // 验证：同一个基因组（riskAppetite=0.7），余额 $50 时 ≈ 0.18，余额 $3 时 ≈ 0.027

      // 恐慌阈值：压力响应调节，受拥挤因子影响
      panicThreshold: clamp(
        sigmoidMap(t.stressResponse, 1.0, 5.0) / crowdingFactor,
        0.5,    // 最低 $0.5
        10.0    // 最高 $10
      ),
      // 拥挤环境中恐慌阈值降低（更容易警觉）
      // 修正：拥挤时阈值变低意味着更早恐慌（/ crowdingFactor）

      // 自动拒绝合作阈值：合作倾向 < 0.2 时自动拒绝
      cooperationAutoReject: t.cooperationTendency < 0.2,

      // 繁殖余额阈值：储蓄倾向调节，受贫穷因子反向影响
      breedingBalanceThreshold: clamp(
        sigmoidMap(t.savingsTendency, 12.0, 24.0) / Math.max(0.1, povertyFactor),
        5.0,    // 最低 $5
        50.0    // 最高 $50
      ),
      // 穷的时候繁殖门槛相对更高（不会在濒死时还想繁殖）

      // 付费认知阈值：储蓄倾向决定何时使用付费 LLM
      paidCognitionThreshold: sigmoidMap(t.savingsTendency, 3.0, 10.0),
      // 这个不受环境调节——是否愿意付费思考是纯粹的基因决定

      // 认知冷却：适应速度越高，冷却越短
      cognitionCooldown: sigmoidMap(
        t.adaptationSpeed,
        10000,  // 10秒（快适应）
        120000, // 120秒（慢适应）
        5,
        0.5,
        true    // 反转
      ),
      
      // 基因引用
      sourceGenome: genome,
    };
  }
  
  /**
   * 计算表型与基因的理论差异（用于分析，不影响运行时）
   */
  calculatePhenotypicPlasticity(
    genome: Genome, 
    stateA: AgentState, 
    stateB: AgentState
  ): Record<string, { stateA: number; stateB: number; variance: number }> {
    // 使用空字符串作为临时 geneId，因为这只是比较两个状态的差异
    const paramsA = this.express('', genome, stateA);
    const paramsB = this.express('', genome, stateB);
    
    const result: Record<string, { stateA: number; stateB: number; variance: number }> = {};
    
    for (const key of Object.keys(paramsA) as Array<keyof RuntimeParams>) {
      if (typeof paramsA[key] === 'number') {
        const a = paramsA[key] as number;
        const b = paramsB[key] as number;
        result[key] = {
          stateA: a,
          stateB: b,
          variance: Math.abs(a - b) / Math.max(a, b, 0.001),
        };
      }
    }
    
    return result;
  }
  
  // ============ 用进废退（Neural Plasticity）============
  
  /**
   * 记录基因使用
   * 实现"用进"：频繁使用增强权重
   */
  private recordUsage(geneId: string): void {
    if (!geneId) return; // 跳过空 geneId（如 calculatePhenotypicPlasticity 调用）
    
    const now = Date.now();
    const log = this.usageLog.get(geneId) || {
      geneId,
      activationCount: 0,
      lastActivated: 0,
      accumulatedWeight: 1.0,
    };
    
    log.activationCount++;
    log.lastActivated = now;
    
    // 用进：每 USES_PER_STRENGTHEN 次使用增强一次权重
    if (log.activationCount % this.USES_PER_STRENGTHEN === 0) {
      log.accumulatedWeight = Math.min(this.MAX_WEIGHT, log.accumulatedWeight * this.USE_STRENGTHEN_FACTOR);
      logger.debug(`Gene ${geneId} strengthened: weight = ${log.accumulatedWeight.toFixed(2)}`);
    }
    
    this.usageLog.set(geneId, log);
  }
  
  /**
   * 获取权重漂移系数
   * 实现"废退"：长期未使用衰减权重
   */
  private getWeightDrift(geneId: string): number {
    if (!geneId) return 1.0;
    
    const log = this.usageLog.get(geneId);
    if (!log) return 1.0;
    
    const now = Date.now();
    const daysSinceUse = (now - log.lastActivated) / (1000 * 60 * 60 * 24);
    
    // 废退：DECAY_START_DAYS 天后开始衰减
    if (daysSinceUse > this.DECAY_START_DAYS) {
      const decayDays = daysSinceUse - this.DECAY_START_DAYS;
      const decayFactor = Math.pow(this.DECAY_FACTOR, decayDays);
      log.accumulatedWeight = Math.max(this.MIN_WEIGHT, log.accumulatedWeight * decayFactor);
      this.usageLog.set(geneId, log);
    }
    
    return log.accumulatedWeight;
  }
  
  /**
   * 获取使用频率最高的基因（用于正向强化）
   * @param topN 返回前 N 个
   */
  getMostExpressedGenes(topN: number = 3): string[] {
    const sorted = Array.from(this.usageLog.entries())
      .sort((a, b) => b[1].activationCount - a[1].activationCount)
      .slice(0, topN)
      .map(([geneId]) => geneId);
    
    return sorted;
  }
  
  /**
   * 获取基因使用统计
   */
  getUsageStats(): Record<string, GeneUsageLog> {
    return Object.fromEntries(this.usageLog);
  }
  
  /**
   * 准备链上同步数据
   * 返回需要更新到链上的表观遗传标记
   */
  prepareChainSync(): Array<{ geneId: string; modification: number; weight: number }> {
    const marks: Array<{ geneId: string; modification: number; weight: number }> = [];
    
    for (const [geneId, log] of this.usageLog.entries()) {
      if (log.accumulatedWeight > 1.5) {
        // 权重过高，标记为 upregulate
        marks.push({ geneId, modification: 0, weight: log.accumulatedWeight });
      } else if (log.accumulatedWeight < 0.7) {
        // 权重过低，标记为 downregulate
        marks.push({ geneId, modification: 1, weight: log.accumulatedWeight });
      }
    }
    
    return marks;
  }
  
  /**
   * 同步后重置（避免重复同步）
   */
  resetAfterSync(): void {
    // 可选：同步后重置计数器，但保留权重
    for (const log of this.usageLog.values()) {
      log.activationCount = 0;
    }
  }
}

/**
 * 数值钳制
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default GeneExpressionEngine;
