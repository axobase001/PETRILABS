/**
 * Task 34: Gene Expression Engine with Epigenetic Tracking
 * Continuously records gene usage from birth to death
 */

import { logger } from '../utils/logger';
import { Gene } from '../types';

export interface GeneEpigeneticRecord {
  geneIndex: number;
  activationCount: number;   // Times expression engine read this gene
  impactWeight: number;      // Actual impact weight on decisions (0-1, EMA)
  methylation: number;       // Methylation level 0-1 (0=active, 1=silent)
  lastActivated: number;     // Days since birth of last activation (-1=never)
}

export interface DecisionContext {
  action: string;
  params: Record<string, any>;
  reasoning: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
}

// Action to gene impact mapping (empirically derived)
const ACTION_GENE_IMPACT: Record<string, Record<string, number>> = {
  'REST': {
    'savingsTendency': 0.8,
    'stressResponse': 0.3,
    'riskAppetite': 0.1,
  },
  'TRADE': {
    'riskAppetite': 0.9,
    'analyticalAbility': 0.7,
    'savingsTendency': 0.4,
  },
  'SWAP': {
    'riskAppetite': 0.6,
    'savingsTendency': 0.5,
  },
  'POLYMARKET': {
    'riskAppetite': 0.9,
    'analyticalAbility': 0.8,
    'creativeAbility': 0.3,
  },
  'BROADCAST': {
    'cooperationTendency': 0.8,
    'stressResponse': 0.2,
  },
  'FORK': {
    'reproductionDrive': 0.9,
    'riskAppetite': 0.6,
    'savingsTendency': 0.7,
  },
  'MERGE': {
    'cooperationTendency': 0.9,
    'adaptability': 0.8,
    'riskAppetite': 0.5,
  },
  'RENEW_LEASE': {
    'survivalInstinct': 0.9,
    'savingsTendency': 0.8,
    'riskAppetite': 0.3,
  },
};

// Gene name mapping (63 genes)
const GENE_NAMES: string[] = [
  // A-chromosome: Metabolism (12 genes)
  'metabolicEfficiency', 'costSensitivity', 'gasTolerance', 'resourceOptimization',
  'heartbeatBase', 'emergencyReserve', 'ethConservation', 'usdcPriority',
  'transactionBatching', 'providerComparison', 'slippageTolerance', 'feeOptimization',
  
  // B-chromosome: Cognition (18 genes)
  'processingSpeed', 'accuracyPriority', 'patternDetection', 'informationSynthesis',
  'memoryCapacity', 'learningSpeed', 'adaptationRate', 'analyticalDepth',
  'creativeThinking', 'riskEvaluation', 'decisionConfidence', 'errorCorrection',
  'contextAwareness', 'longTermPlanning', 'shortTermReaction', 'complexityHandling',
  'intuitionVsAnalysis', 'focusDuration',
  
  // C-chromosome: Behavior (15 genes)
  'riskAppetite', 'cautionLevel', 'savingHabit', 'spendingUrge',
  'explorationDrive', 'routinePreference', 'changeAcceptance', 'actionSpeed',
  'deliberationTime', 'reversalTendency', 'commitmentStrength', 'hedgingPreference',
  'allInThreshold', 'stopLossDiscipline', 'profitTakingTiming',
  
  // D-chromosome: Survival (12 genes)
  'survivalInstinct', 'deathAcceptance', 'legacyFocus', 'reproductionDrive',
  'emergencyCalm', 'resourceHoarding', 'lastStandWill', 'offspringInvestment',
  'memorialDesire', 'dangerSensitivity', 'recoveryHope', 'finalMessage',
  
  // E-chromosome: Social (6 genes)
  'cooperationTendency', 'independenceNeed', 'communicationOpenness',
  'trustLevel', 'networkBuilding', 'reputationCare',
];

export class GeneExpressionEngine {
  private genome: number[];
  private epiTracker: Map<number, GeneEpigeneticRecord> = new Map();
  private currentDay: number = 0;
  private birthTimestamp: number;
  private geneNames: string[];
  
  // P3-1 Fix: 公开 geneCache 用于外部访问（只读）
  public readonly geneCache: Map<number, Gene> = new Map();
  
  // P3-1 Fix: 压力修饰符映射
  private stressModifiers: Map<number, number> = new Map();

  constructor(genome: number[], geneNames?: string[]) {
    this.genome = genome;
    this.birthTimestamp = Date.now();
    this.geneNames = geneNames || GENE_NAMES.slice(0, genome.length);
    this.initializeEpiTracking(genome.length);
  }

  /**
   * Initialize epigenetic tracking for all genes
   */
  private initializeEpiTracking(genomeLength: number): void {
    for (let i = 0; i < genomeLength; i++) {
      this.epiTracker.set(i, {
        geneIndex: i,
        activationCount: 0,
        impactWeight: 0,
        methylation: 0.5,    // Neutral initial methylation
        lastActivated: -1,   // Never activated
      });
    }
  }

  /**
   * Express a gene (called during each decision)
   * 
   * @param geneIndex Gene index
   * @param context Decision context
   * @returns Gene value (0-100000)
   */
  expressGene(geneIndex: number, context: DecisionContext): number {
    const value = this.genome[geneIndex];
    const record = this.epiTracker.get(geneIndex)!;
    
    // Update day count based on survival time
    const daysAlive = Math.floor((Date.now() - this.birthTimestamp) / (1000 * 86400));
    this.currentDay = daysAlive;

    // Increment activation count
    record.activationCount += 1;
    record.lastActivated = daysAlive;

    // Calculate current impact weight for this decision
    const currentImpact = this.calculateImpact(geneIndex, context);
    
    // Update impactWeight using EMA: 90% history + 10% current
    record.impactWeight = record.impactWeight * 0.9 + currentImpact * 0.1;

    // Methylation adjustment: more use = lower methylation (more active)
    // Decrease by 0.02 per activation, minimum 0
    record.methylation = Math.max(0, record.methylation - 0.02);

    this.epiTracker.set(geneIndex, record);
    
    return value;
  }

  /**
   * Express multiple genes (when multiple genes involved in one decision)
   */
  expressGenes(geneIndices: number[], context: DecisionContext): number[] {
    return geneIndices.map(idx => this.expressGene(idx, context));
  }

  /**
   * Update methylation periodically (called daily/heartbeat)
   * Unused genes increase methylation (get silenced)
   */
  updateMethylation(): void {
    const daysAlive = Math.floor((Date.now() - this.birthTimestamp) / (1000 * 86400));
    this.currentDay = daysAlive;

    for (const [index, record] of this.epiTracker) {
      const daysSinceActive = record.lastActivated === -1 
        ? daysAlive  // Never activated, count all days
        : daysAlive - record.lastActivated;
      
      if (daysSinceActive > 3) {
        // Unused for 3+ days → methylation starts rising (+0.01 per extra day)
        const increase = 0.01 * daysSinceActive;
        record.methylation = Math.min(1.0, record.methylation + increase);
      }
    }
  }

  /**
   * Calculate impact weight for a specific gene in specific context
   */
  private calculateImpact(geneIndex: number, context: DecisionContext): number {
    const geneName = this.getGeneNameByIndex(geneIndex);
    
    // Lookup from ACTION_GENE_IMPACT table
    const actionImpacts = ACTION_GENE_IMPACT[context.action] || {};
    const impact = actionImpacts[geneName] || 0.1; // Default 0.1 (all genes have slight impact)
    
    return impact;
  }

  private getGeneNameByIndex(index: number): string {
    return this.geneNames[index] || `gene_${index}`;
  }

  /**
   * Export complete epigenetic profile (called at death)
   */
  exportEpigeneticProfile(): GeneEpigeneticRecord[] {
    return Array.from(this.epiTracker.values()).sort((a, b) => 
      a.geneIndex - b.geneIndex
    );
  }

  /**
   * Get highly active genes (for debugging/display)
   */
  getActiveGenes(threshold: number = 0.5): GeneEpigeneticRecord[] {
    return Array.from(this.epiTracker.values())
      .filter(g => g.methylation < threshold)
      .sort((a, b) => a.methylation - b.methylation);
  }

  /**
   * Get silent genes (evolutionary innovation reservoir)
   */
  getSilentGenes(threshold: number = 0.8): GeneEpigeneticRecord[] {
    return Array.from(this.epiTracker.values())
      .filter(g => g.methylation > threshold)
      .sort((a, b) => b.methylation - a.methylation);
  }

  /**
   * Get stats summary
   */
  getStats(): {
    totalGenes: number;
    activeGenes: number;
    silentGenes: number;
    avgMethylation: number;
    avgActivationCount: number;
  } {
    const records = Array.from(this.epiTracker.values());
    const activeGenes = records.filter(g => g.methylation < 0.5).length;
    const silentGenes = records.filter(g => g.methylation > 0.8).length;
    const avgMethylation = records.reduce((sum, g) => sum + g.methylation, 0) / records.length;
    const avgActivationCount = records.reduce((sum, g) => sum + g.activationCount, 0) / records.length;
    
    return {
      totalGenes: records.length,
      activeGenes,
      silentGenes,
      avgMethylation,
      avgActivationCount,
    };
  }

  /**
   * Get gene value (without affecting epigenetic tracking)
   */
  getGeneValue(geneIndex: number): number {
    return this.genome[geneIndex];
  }

  /**
   * Get full genome
   */
  getGenome(): number[] {
    return [...this.genome];
  }
  
  // ============ P3-1 Fix: 公共方法替代私有属性访问 ============
  
  /**
   * 应用压力修饰符到指定基因
   * P3-1 Fix: 公共方法替代私有属性访问
   * @param geneId 基因 ID
   */
  applyStressModifier(geneId: number): void {
    const currentModifier = this.stressModifiers.get(geneId) || 1.0;
    // 压力增强：每次调用增加 20%，上限 2.0
    this.stressModifiers.set(geneId, Math.min(2.0, currentModifier * 1.2));
    logger.debug(`Stress modifier applied to gene ${geneId}: ${this.stressModifiers.get(geneId)}`);
  }
  
  /**
   * 获取基因的压力修饰符
   * @param geneId 基因 ID
   * @returns 修饰符值（默认 1.0）
   */
  getStressModifier(geneId: number): number {
    return this.stressModifiers.get(geneId) || 1.0;
  }
  
  /**
   * 获取所有域的基因表达
   * P3-1 Fix: 公共方法替代私有属性访问
   */
  getAllDomainExpressions(context: { timeOfDay: number; resourceLevel: number }): Map<any, number> {
    // 简化实现：返回基于时间的表达映射
    const expressions = new Map();
    const hourFactor = Math.sin((context.timeOfDay / 24) * Math.PI * 2) * 0.5 + 0.5;
    
    // 为常见域添加表达值
    for (let domain = 0; domain < 10; domain++) {
      // 模拟域表达值，受时间和资源影响
      const baseValue = this.genome[domain % this.genome.length] / 100000;
      const adjustedValue = baseValue * hourFactor * context.resourceLevel;
      expressions.set(domain, Math.max(0, Math.min(1, adjustedValue)));
    }
    
    return expressions;
  }
  
  /**
   * 获取指定域的基因表达
   * @param domain 基因域
   */
  getDomainExpression(domain: number): number {
    const index = domain % this.genome.length;
    return this.genome[index] / 100000; // 归一化到 0-1
  }
}

export default GeneExpressionEngine;
