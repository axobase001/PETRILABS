/**
 * Task 33: Three-Factor Weighted Crossover Operator
 * Used during Merge to combine two parent genomes
 * 
 * Weight priority: Initiator advantage (55% baseline) > Capital advantage (±15%) > Age advantage (±10%)
 */

export interface MergeParticipant {
  address: string;
  genome: number[];
  balance: number;           // USDC balance
  survivalDays: number;      // Days survived
  isInitiator: boolean;      // Whether this agent initiated the merge
}

export interface CrossoverResult {
  childGenome: number[];
  initiatorWeight: number;   // Actual calculated weight for audit
}

export interface CrossoverConfig {
  /** Baseline initiator weight (default: 55%) */
  baselineWeight: number;
  /** Max capital influence (default: 15%) */
  capitalInfluence: number;
  /** Max age influence (default: 10%) */
  ageInfluence: number;
  /** Min/max weight bounds (default: 35%-80%) */
  minWeight: number;
  maxWeight: number;
  /** Post-crossover noise rate (default: 5% genes) */
  noiseRate: number;
  /** Post-crossover noise scale (default: ±5%) */
  noiseScale: number;
  /** Gene value range */
  minValue: number;
  maxValue: number;
}

export const DEFAULT_CROSSOVER_CONFIG: CrossoverConfig = {
  baselineWeight: 0.55,      // Initiator gets 55% baseline
  capitalInfluence: 0.15,    // ±15% from balance ratio
  ageInfluence: 0.10,        // ±10% from survival days
  minWeight: 0.35,           // Minimum initiator weight
  maxWeight: 0.80,           // Maximum initiator weight
  noiseRate: 0.05,           // 5% genes get noise
  noiseScale: 0.05,          // ±5% noise
  minValue: 0,
  maxValue: 100000,
};

/**
 * Three-factor weighted crossover operator
 * 
 * Weight calculation:
 * - Baseline: Initiator 55%
 * - Capital factor: ±15% (based on balance ratio)
 * - Age factor: ±10% (based on survival days)
 * - Final weight clamped to [35%, 80%]
 * 
 * After crossover: 5% genes get ±5% noise (simulating biological "copy errors")
 * 
 * @param initiator The agent that initiated the merge
 * @param acceptor The agent that accepted the merge
 * @param config Crossover configuration
 * @returns Child genome and actual initiator weight used
 */
export function crossoverGenomes(
  initiator: MergeParticipant,
  acceptor: MergeParticipant,
  config: Partial<CrossoverConfig> = {}
): CrossoverResult {
  const cfg = { ...DEFAULT_CROSSOVER_CONFIG, ...config };
  
  if (initiator.genome.length !== acceptor.genome.length) {
    throw new Error(`Genome length mismatch: ${initiator.genome.length} vs ${acceptor.genome.length}`);
  }

  const genomeLength = initiator.genome.length;
  const child = new Array<number>(genomeLength);

  // === Step 1: Calculate initiator composite weight ===
  
  // Baseline: 55% for initiator
  let w = cfg.baselineWeight;

  // Factor 2: Capital advantage
  const totalBalance = initiator.balance + acceptor.balance;
  if (totalBalance > 0) {
    // Deviation from 50% based on balance share, multiplied by 30% coefficient
    // Resulting in ±15% max influence
    const balanceAdvantage = (initiator.balance / totalBalance) - 0.5;
    w += balanceAdvantage * cfg.capitalInfluence * 2; // *2 because coefficient is 30% but max is 15%
  }

  // Factor 3: Age advantage
  const totalAge = initiator.survivalDays + acceptor.survivalDays;
  if (totalAge > 0) {
    // Same logic, 20% coefficient → ±10% max influence
    const ageAdvantage = (initiator.survivalDays / totalAge) - 0.5;
    w += ageAdvantage * cfg.ageInfluence * 2;
  }

  // Clamp weight to valid range [35%, 80%]
  const finalWeight = Math.max(cfg.minWeight, Math.min(cfg.maxWeight, w));

  // === Step 2: Per-gene weighted selection ===
  for (let i = 0; i < genomeLength; i++) {
    // Select initiator gene with probability finalWeight, otherwise acceptor
    child[i] = Math.random() < finalWeight 
      ? initiator.genome[i] 
      : acceptor.genome[i];
  }

  // === Step 3: Post-crossover replication noise (5% genes ±5%) ===
  // Simulates biological "copy errors" or environmental perturbations
  for (let i = 0; i < genomeLength; i++) {
    if (Math.random() < cfg.noiseRate) {
      const direction = Math.random() * 2 - 1; // -1 to 1
      const noise = direction * cfg.noiseScale * child[i];
      
      let newValue = Math.round(child[i] + noise);
      newValue = Math.max(cfg.minValue, Math.min(cfg.maxValue, newValue));
      
      child[i] = newValue;
    }
  }

  return {
    childGenome: child,
    initiatorWeight: finalWeight,
  };
}

/**
 * Generate multiple offspring (optional)
 */
export function crossoverGenomesBatch(
  initiator: MergeParticipant,
  acceptor: MergeParticipant,
  count: number,
  config?: Partial<CrossoverConfig>
): CrossoverResult[] {
  return Array.from({ length: count }, () => 
    crossoverGenomes(initiator, acceptor, config)
  );
}

/**
 * Calculate detailed weight breakdown (for debugging/audit)
 */
export function calculateWeightBreakdown(
  initiator: MergeParticipant,
  acceptor: MergeParticipant,
  config: Partial<CrossoverConfig> = {}
): {
  baseline: number;
  capitalAdjustment: number;
  ageAdjustment: number;
  rawWeight: number;
  finalWeight: number;
  wasClamped: boolean;
} {
  const cfg = { ...DEFAULT_CROSSOVER_CONFIG, ...config };
  
  // Baseline
  const baseline = cfg.baselineWeight;
  
  // Capital adjustment
  const totalBalance = initiator.balance + acceptor.balance;
  let capitalAdjustment = 0;
  if (totalBalance > 0) {
    const balanceAdvantage = (initiator.balance / totalBalance) - 0.5;
    capitalAdjustment = balanceAdvantage * cfg.capitalInfluence * 2;
  }
  
  // Age adjustment
  const totalAge = initiator.survivalDays + acceptor.survivalDays;
  let ageAdjustment = 0;
  if (totalAge > 0) {
    const ageAdvantage = (initiator.survivalDays / totalAge) - 0.5;
    ageAdjustment = ageAdvantage * cfg.ageInfluence * 2;
  }
  
  // Calculate weights
  const rawWeight = baseline + capitalAdjustment + ageAdjustment;
  const finalWeight = Math.max(cfg.minWeight, Math.min(cfg.maxWeight, rawWeight));
  
  return {
    baseline,
    capitalAdjustment,
    ageAdjustment,
    rawWeight,
    finalWeight,
    wasClamped: rawWeight !== finalWeight,
  };
}

/**
 * Test scenarios for weight calculation
 */
export const TEST_SCENARIOS = {
  // Scenario A: Equal merge
  equal: {
    initiator: { balance: 5, survivalDays: 20, isInitiator: true, address: '0x1', genome: [] },
    acceptor: { balance: 5, survivalDays: 20, isInitiator: false, address: '0x2', genome: [] },
    expectedWeight: 0.55, // 55% (baseline only)
  },
  
  // Scenario B: Strong acquirer (rich + old initiator)
  strongAcquirer: {
    initiator: { balance: 15, survivalDays: 40, isInitiator: true, address: '0x1', genome: [] },
    acceptor: { balance: 3, survivalDays: 10, isInitiator: false, address: '0x2', genome: [] },
    // balanceAdv = (15/18 - 0.5) = 0.333; *0.30 = 0.10
    // ageAdv = (40/50 - 0.5) = 0.30; *0.20 = 0.06
    // w = 0.55 + 0.10 + 0.06 = 0.71
    expectedWeight: 0.71,
  },
  
  // Scenario C: Poor initiator merging with rich acceptor
  poorInitiator: {
    initiator: { balance: 2, survivalDays: 5, isInitiator: true, address: '0x1', genome: [] },
    acceptor: { balance: 20, survivalDays: 30, isInitiator: false, address: '0x2', genome: [] },
    // balanceAdv = (2/22 - 0.5) = -0.409; *0.30 = -0.123
    // ageAdv = (5/35 - 0.5) = -0.357; *0.20 = -0.071
    // w = 0.55 - 0.123 - 0.071 = 0.356 → clamped to 0.36
    expectedWeight: 0.36,
  },
};

export default crossoverGenomes;
