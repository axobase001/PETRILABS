/**
 * Frontend Types
 */

import { Address } from 'viem';

// Agent Types
export interface Agent {
  address: Address;
  genomeHash: string;
  creator: Address;
  createdAt: number;
  isAlive: boolean;
  balance: string;
  lastHeartbeat: number;
  heartbeatNonce: number;
}

export interface AgentState {
  genomeHash: string;
  birthTime: number;
  lastHeartbeat: number;
  heartbeatNonce: number;
  isAlive: boolean;
  balance: string;
  lastDecisionHash: string;
  totalMetabolicCost: string;
}

// Genome Types
export interface Gene {
  id: number;
  domain: number;
  origin: number;
  expressionState: number;
  value: number;
  weight: number;
  dominance: number;
  plasticity: number;
  essentiality: number;
  metabolicCost: number;
}

export interface Genome {
  genomeHash: string;
  totalGenes: number;
  generation: number;
  birthTimestamp: number;
  lineageId: string;
  isRandom: boolean;
}

export interface GenomeVisualizationData {
  domain: string;
  value: number;
  expression: number;
  genes: Gene[];
}

// Deployment Types
export interface DeploymentRequest {
  memoryFile?: File;
  memoryHash?: string;
  memoryURI?: string;
  initialDeposit: string;
  preferredTraits?: string[];
  useRandom: boolean;
}

export interface DeploymentResponse {
  jobId: string;
  status: 'queued' | 'analyzing' | 'generating_genome' | 'deploying' | 'completed' | 'failed';
  progress: number;
  agentAddress?: string;
  genomeHash?: string;
  akashUri?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

// Memory Analysis Types
export interface PersonalityTrait {
  trait: string;
  confidence: number;
  value: number;
}

export interface MemoryAnalysis {
  personalityTraits: PersonalityTrait[];
  behaviorPatterns: Array<{
    pattern: string;
    frequency: number;
  }>;
  riskProfile: 'conservative' | 'moderate' | 'aggressive';
  socialTendency: 'introverted' | 'ambivert' | 'extroverted';
  cognitiveStyle: 'analytical' | 'intuitive' | 'balanced';
  matchScore: number;
}

// UI Types
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

export type ViewMode = 'grid' | 'list';

export interface FilterState {
  status: 'all' | 'alive' | 'dead';
  sortBy: 'created' | 'balance' | 'heartbeat';
  sortOrder: 'asc' | 'desc';
}
