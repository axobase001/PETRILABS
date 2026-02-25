/**
 * Genome Expression Engine
 * Calculates effective gene expression values based on current state
 */

import { Gene, GeneDomain } from '../types';
import { logger } from '../utils/logger';

export class ExpressionEngine {
  private geneCache: Map<number, Gene> = new Map();
  private expressionCache: Map<number, number> = new Map();
  private lastCacheUpdate: number = 0;
  private CACHE_TTL = 60000; // 1 minute
  
  // 压力修饰符（新增）
  private stressModifiers: Map<number, number> = new Map();

  constructor(private genomeHash: string) {}

  /**
   * Load genes from registry
   */
  async loadGenes(fetchGenes: (genomeHash: string) => Promise<Gene[]>): Promise<void> {
    const genes = await fetchGenes(this.genomeHash);
    
    this.geneCache.clear();
    for (const gene of genes) {
      this.geneCache.set(gene.id, gene);
    }
    
    this.lastCacheUpdate = Date.now();
  }

  /**
   * Calculate expression for a single gene
   * Formula: value * weight * environment_modifiers
   */
  calculateExpression(geneId: number, environment: EnvironmentContext = {}): number {
    const gene = this.geneCache.get(geneId);
    if (!gene) return 0;

    // Base expression = value * weight / scale
    let expression = (gene.value * gene.weight) / 1000000;

    // Apply stress modifiers（新增）
    const stressModifier = this.stressModifiers.get(geneId);
    if (stressModifier) {
      expression *= stressModifier;
    }

    // Apply environmental modifiers
    if (environment.stressLevel && gene.domain === GeneDomain.STRESS_RESPONSE) {
      expression *= (1 + environment.stressLevel * 0.5);
    }

    if (environment.socialContext && gene.domain === GeneDomain.COOPERATION) {
      expression *= (1 + environment.socialContext * 0.3);
    }

    if (environment.timeOfDay !== undefined) {
      // Circadian rhythm effect
      const hour = environment.timeOfDay;
      if (gene.domain === GeneDomain.COGNITION) {
        // Peak cognition at midday
        const circadianFactor = 1 + 0.2 * Math.sin((hour - 6) * Math.PI / 12);
        expression *= Math.max(0.5, circadianFactor);
      }
    }

    // Apply resource scarcity modifier
    if (environment.resourceLevel !== undefined) {
      if (gene.domain === GeneDomain.DORMANCY && environment.resourceLevel < 0.3) {
        expression *= 1.5; // Increase dormancy when resources low
      }
      if (gene.domain === GeneDomain.METABOLISM && environment.resourceLevel < 0.2) {
        expression *= 0.7; // Decrease metabolism when starving
      }
    }

    // Cap at 2x max
    return Math.min(expression, 2.0);
  }

  /**
   * Get aggregated expression for a domain
   */
  getDomainExpression(domain: GeneDomain, environment: EnvironmentContext = {}): number {
    let totalExpression = 0;
    let totalWeight = 0;

    for (const gene of this.geneCache.values()) {
      if (gene.domain === domain) {
        const expression = this.calculateExpression(gene.id, environment);
        const weight = gene.weight / 100000; // Normalize
        
        totalExpression += expression * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) return 0.5; // Default

    return totalExpression / totalWeight;
  }

  /**
   * Get expression map for all domains
   */
  getAllDomainExpressions(environment: EnvironmentContext = {}): Map<GeneDomain, number> {
    const result = new Map<GeneDomain, number>();

    for (const domain of Object.values(GeneDomain).filter(v => typeof v === 'number')) {
      result.set(domain as GeneDomain, this.getDomainExpression(domain as GeneDomain, environment));
    }

    return result;
  }

  /**
   * Express a gene - 基因表达主入口（新增）
   * D-染色体基因通过外部路由器执行
   */
  expressGene(geneId: number, router?: {
    route(gene: Gene, params?: unknown): Promise<{
      success: boolean;
      data?: unknown;
      cost: number;
      error?: string;
    }>;
  }, params?: unknown): Promise<{
    success: boolean;
    data?: unknown;
    cost: number;
    error?: string;
  }> | number {
    const gene = this.geneCache.get(geneId);
    if (!gene) {
      return { success: false, cost: 0, error: 'Gene not found' };
    }

    // D-染色体（互联网技能）通过路由器执行
    if (gene.domain === GeneDomain.API_UTILIZATION || 
        gene.domain === GeneDomain.WEB_NAVIGATION) {
      if (!router) {
        return { success: false, cost: 0, error: 'Router not provided for D-chromosome gene' };
      }
      return router.route(gene, params);
    }

    // 其他染色体返回表达值
    return this.calculateExpression(geneId);
  }

  /**
   * Apply stress modifier to a gene（新增）
   * 由压力响应系统调用
   */
  applyStressModifier(geneId: number, modifier: number = 1.5): void {
    this.stressModifiers.set(geneId, modifier);
    
    // 清除表达缓存以强制重新计算
    this.expressionCache.delete(geneId);
    
    logger.debug('Applied stress modifier', { geneId, modifier });
  }

  /**
   * Clear stress modifiers（新增）
   */
  clearStressModifiers(): void {
    this.stressModifiers.clear();
    this.expressionCache.clear();
  }

  /**
   * Check if cache needs refresh
   */
  needsRefresh(): boolean {
    return Date.now() - this.lastCacheUpdate > this.CACHE_TTL;
  }

  /**
   * Get metabolic cost
   */
  calculateMetabolicCost(): number {
    let totalCost = 0;

    for (const gene of this.geneCache.values()) {
      const expression = this.calculateExpression(gene.id);
      totalCost += (gene.metabolicCost / 10000) * expression;
    }

    // Add genome size overhead
    totalCost += this.geneCache.size * 0.00005;

    return totalCost;
  }
}

export interface EnvironmentContext {
  stressLevel?: number;      // 0-1
  socialContext?: number;    // 0-1
  timeOfDay?: number;        // 0-24
  resourceLevel?: number;    // 0-1 (balance relative to needs)
  temperature?: 'hot' | 'cold' | 'normal';
}

export default ExpressionEngine;
