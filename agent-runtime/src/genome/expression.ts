/**
 * Genome Expression Engine
 * Calculates effective gene expression values based on current state
 */

import { Gene, GeneDomain } from '../types';

export class ExpressionEngine {
  private geneCache: Map<number, Gene> = new Map();
  private expressionCache: Map<number, number> = new Map();
  private lastCacheUpdate: number = 0;
  private CACHE_TTL = 60000; // 1 minute

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
