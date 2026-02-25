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
import { Genome, RuntimeParams, AgentState } from '../types';

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
 */
export class GeneExpressionEngine {
  /**
   * 表达基因：基因 × 环境 = 表型
   * 
   * 环境调节因子：
   * - povertyFactor: 余额越低，风险参数越保守
   * - crowdingFactor: 已知存活 agent 越多，竞争越激烈
   */
  express(genome: Genome, currentState: AgentState): RuntimeParams {
    const t = genome.expressedTraits;
    const env = currentState;
    
    // ===== 环境调节因子 =====
    
    // 贫穷因子：余额越低，所有风险参数越保守
    // 范围 0.0（濒死）到 1.0（富裕，余额 ≥ $20）
    const povertyFactor = Math.min(1.0, (env.balance || 0) / 20.0);
    
    // 拥挤因子：已知存活 agent 越多，竞争越激烈
    // 范围 0.5（极拥挤）到 1.0（空旷，≤10 个 agent）
    const crowdingFactor = Math.max(0.5, 1.0 - ((env.knownAliveAgents || 0) / 50));
    
    // ===== 基因 × 环境 = 表型 =====
    
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
    const paramsA = this.express(genome, stateA);
    const paramsB = this.express(genome, stateB);
    
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
}

/**
 * 数值钳制
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default GeneExpressionEngine;
