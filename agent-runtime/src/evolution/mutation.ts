/**
 * Task 32: Epigenetic Weighted Mutation Operator
 * Used during Fork to mutate genome based on gene activity
 */

import { GeneEpigeneticRecord } from '../genome/expression';

export interface MutationConfig {
  /** Base mutation probability for most active genes (default: 5%) */
  baseMutationProb: number;
  /** Max additional probability for silent genes (default: 35%) */
  maxProbIncrease: number;
  /** Base mutation scale for most active genes (default: 3%) */
  baseMutationScale: number;
  /** Max additional scale for silent genes (default: 25%) */
  maxScaleIncrease: number;
  /** Gene value range (default: 0-100000) */
  minValue: number;
  maxValue: number;
}

export const DEFAULT_MUTATION_CONFIG: MutationConfig = {
  baseMutationProb: 0.05,      // 5% for active genes
  maxProbIncrease: 0.35,       // +35% for silent genes = 40% total
  baseMutationScale: 0.03,     // ±3% for active genes
  maxScaleIncrease: 0.25,      // +25% for silent genes = ±28% total
  minValue: 0,
  maxValue: 100000,
};

/**
 * Mutate genome based on epigenetic profile
 * 
 * Active genes: low mutation rate (5%), small changes (±3%)
 * Silent genes: high mutation rate (40%), large changes (±28%)
 * 
 * @param parentGenome Parent genome (array of values 0-100000)
 * @param epiProfile Epigenetic profile (same length as genome)
 * @param config Mutation configuration
 * @returns Child genome after mutation
 */
export function mutateGenome(
  parentGenome: number[],
  epiProfile: GeneEpigeneticRecord[],
  config: Partial<MutationConfig> = {}
): number[] {
  const cfg = { ...DEFAULT_MUTATION_CONFIG, ...config };
  
  if (parentGenome.length !== epiProfile.length) {
    throw new Error(`Genome and epigenetic profile length mismatch: ${parentGenome.length} vs ${epiProfile.length}`);
  }

  const child = [...parentGenome];
  
  // Calculate max activation for normalization
  const maxActivation = Math.max(
    ...epiProfile.map(g => g.activationCount),
    1  // Avoid divide by zero
  );

  for (let i = 0; i < parentGenome.length; i++) {
    const gene = epiProfile[i];
    const parentValue = parentGenome[i];

    // Normalize activity: 0 = never used, 1 = most active
    const activity = gene.activationCount / maxActivation;

    // Mutation probability: active ~5%, silent ~40%
    // Formula: base 5% + (1 - activity) * 35%
    const mutationProb = cfg.baseMutationProb + (1 - activity) * cfg.maxProbIncrease;

    // Mutation scale: active ±3%, silent ±28%
    // Formula: base 3% + (1 - activity) * 25%
    const mutationScale = cfg.baseMutationScale + (1 - activity) * cfg.maxScaleIncrease;

    // Apply mutation with probability
    if (Math.random() < mutationProb) {
      // Random direction: -1 to 1
      const direction = Math.random() * 2 - 1;
      
      // Calculate noise (percentage of current gene value)
      const noise = direction * mutationScale * parentValue;
      
      // Apply mutation and clamp to valid range
      let newValue = Math.round(parentValue + noise);
      newValue = Math.max(cfg.minValue, Math.min(cfg.maxValue, newValue));
      
      child[i] = newValue;
    }
    // Else: no mutation, keep parent value
  }

  return child;
}

/**
 * Batch mutation for generating multiple offspring
 */
export function mutateGenomeBatch(
  parentGenome: number[],
  epiProfile: GeneEpigeneticRecord[],
  count: number,
  config?: Partial<MutationConfig>
): number[][] {
  return Array.from({ length: count }, () => 
    mutateGenome(parentGenome, epiProfile, config)
  );
}

/**
 * Calculate expected mutation statistics (for testing/validation)
 */
export function calculateMutationStats(
  epiProfile: GeneEpigeneticRecord[],
  config: Partial<MutationConfig> = {}
): {
  avgMutationProb: number;
  avgMutationScale: number;
  expectedMutatedGenes: number;
} {
  const cfg = { ...DEFAULT_MUTATION_CONFIG, ...config };
  const maxActivation = Math.max(...epiProfile.map(g => g.activationCount), 1);
  
  let totalProb = 0;
  let totalScale = 0;
  let expectedMutations = 0;
  
  for (const gene of epiProfile) {
    const activity = gene.activationCount / maxActivation;
    const prob = cfg.baseMutationProb + (1 - activity) * cfg.maxProbIncrease;
    const scale = cfg.baseMutationScale + (1 - activity) * cfg.maxScaleIncrease;
    
    totalProb += prob;
    totalScale += scale;
    expectedMutations += prob; // Expected value = probability for each gene
  }
  
  return {
    avgMutationProb: totalProb / epiProfile.length,
    avgMutationScale: totalScale / epiProfile.length,
    expectedMutatedGenes: expectedMutations,
  };
}

/**
 * Test helper: Verify mutation rate distribution
 */
export function testMutationDistribution(
  parentGenome: number[],
  epiProfile: GeneEpigeneticRecord[],
  iterations: number = 1000,
  config?: Partial<MutationConfig>
): Map<number, { mutations: number; expectedRate: number }> {
  const mutationCounts = new Map<number, number>();
  
  // Initialize counts
  for (let i = 0; i < parentGenome.length; i++) {
    mutationCounts.set(i, 0);
  }
  
  // Run mutations
  for (let iter = 0; iter < iterations; iter++) {
    const child = mutateGenome(parentGenome, epiProfile, config);
    for (let i = 0; i < parentGenome.length; i++) {
      if (child[i] !== parentGenome[i]) {
        mutationCounts.set(i, (mutationCounts.get(i) || 0) + 1);
      }
    }
  }
  
  // Calculate expected rates
  const maxActivation = Math.max(...epiProfile.map(g => g.activationCount), 1);
  const cfg = { ...DEFAULT_MUTATION_CONFIG, ...config };
  
  // Build result
  const result = new Map<number, { mutations: number; expectedRate: number }>();
  for (let i = 0; i < parentGenome.length; i++) {
    const activity = epiProfile[i].activationCount / maxActivation;
    const expectedRate = cfg.baseMutationProb + (1 - activity) * cfg.maxProbIncrease;
    result.set(i, {
      mutations: mutationCounts.get(i) || 0,
      expectedRate,
    });
  }
  
  return result;
}

export default mutateGenome;
