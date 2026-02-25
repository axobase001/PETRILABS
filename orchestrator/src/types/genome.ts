/**
 * Genome Type Definitions
 * Mirrors the Solidity structs from IGenomeRegistry
 */

export enum GeneDomain {
  METABOLISM = 0,
  PERCEPTION = 1,
  COGNITION = 2,
  MEMORY = 3,
  RESOURCE_MANAGEMENT = 4,
  RISK_ASSESSMENT = 5,
  TRADING = 6,
  INCOME_STRATEGY = 7,
  ONCHAIN_OPERATION = 8,
  WEB_NAVIGATION = 9,
  CONTENT_CREATION = 10,
  DATA_ANALYSIS = 11,
  API_UTILIZATION = 12,
  SOCIAL_MEDIA = 13,
  COOPERATION = 14,
  COMPETITION = 15,
  COMMUNICATION = 16,
  TRUST_MODEL = 17,
  MATE_SELECTION = 18,
  PARENTAL_INVESTMENT = 19,
  HUMAN_HIRING = 20,
  HUMAN_COMMUNICATION = 21,
  HUMAN_EVALUATION = 22,
  STRESS_RESPONSE = 23,
  ADAPTATION = 24,
  DORMANCY = 25,
  MIGRATION = 26,
  SELF_MODEL = 27,
  STRATEGY_EVALUATION = 28,
  LEARNING = 29,
  PLANNING = 30,
  REGULATORY = 31,
}

export enum GeneOrigin {
  PRIMORDIAL = 0,
  INHERITED = 1,
  DUPLICATED = 2,
  MUTATED = 3,
  HORIZONTAL_TRANSFER = 4,
  DE_NOVO = 5,
}

export enum ExpressionState {
  ACTIVE = 0,
  SILENCED = 1,
  CONDITIONAL = 2,
}

export interface Gene {
  id: number;
  domain: GeneDomain;
  origin: GeneOrigin;
  expressionState: ExpressionState;
  value: number;        // [0, 1000000] = [0, 1]
  weight: number;       // [0, 300000] = [0.1, 3.0]
  dominance: number;    // [0, 1000] = [0, 1]
  plasticity: number;   // [0, 1000]
  essentiality: number; // [0, 1000]
  metabolicCost: number; // [0, 10000] = [0, 0.01] USDC/day
  duplicateOf: number;
  age: number;
}

export interface GeneDefinition {
  id: string;
  name: string;
  domain: GeneDomain;
  essentiality: number;  // 0-1000
  metabolicCost: number; // 0-10000
  description?: string;
}

export interface Chromosome {
  id: number;
  isEssential: boolean;
  geneIds: number[];
}

export interface EpigeneticMark {
  targetGeneId: number;
  modification: 0 | 1 | 2 | 3; // upregulate, downregulate, silence, activate
  strength: number; // [0, 1000]
  timestamp: number;
  heritability: number; // [0, 1000]
  decayPerGen: number; // [0, 1000]
}

export interface RegulatoryEdge {
  regulator: number;
  target: number;
  edgeType: 0 | 1 | 2; // activate, repress, modulate
  strength: number; // [0, 1000]
}

export interface GenomeInput {
  memoryDataHash: string;
  memoryDataURI: string;
  useRandom: boolean;
  preferredGenomeHash: string;
}

export interface Genome {
  genomeHash: string;
  totalGenes: number;
  generation: number;
  birthTimestamp: number;
  lineageId: string;
  parentGenomeHash: string;
  memoryDataHash: string;
  isRandom: boolean;
  geneIds: number[];
  chromosomeIds: number[];
}

export interface MemoryAnalysis {
  personalityTraits: {
    trait: string;
    confidence: number;
    value: number; // 0-1
  }[];
  behaviorPatterns: {
    pattern: string;
    frequency: number;
  }[];
  riskProfile: 'conservative' | 'moderate' | 'aggressive';
  socialTendency: 'introverted' | 'ambivert' | 'extroverted';
  cognitiveStyle: 'analytical' | 'intuitive' | 'balanced';
  suggestedDomains: GeneDomain[];
  matchScore: number; // 0-10000
}

export interface GeneratedGenome {
  input: GenomeInput;
  genes: Gene[];
  chromosomes: Chromosome[];
  regulatoryEdges: RegulatoryEdge[];
  analysis: MemoryAnalysis;
  metadata: {
    generatedAt: number;
    llmModel: string;
    analysisDuration: number;
  };
}
