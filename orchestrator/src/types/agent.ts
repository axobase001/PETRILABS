/**
 * Agent Types
 */

export interface AgentConfig {
  genomeHash: string;
  orchestratorAddress: string;
  usdcAddress: string;
  genomeRegistryAddress: string;
  initialBalance: string;
  openRouterApiKey?: string;
}

export interface AgentDeployment {
  agentAddress: string;
  genomeHash: string;
  creator: string;
  akashDeploymentId?: string;
  akashUri?: string;
  status: 'pending' | 'deploying' | 'running' | 'failed' | 'dead';
  deployedAt: number;
  lastHeartbeat?: number;
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

export interface DeploymentRequest {
  memoryFile?: Buffer;
  memoryHash?: string;
  memoryURI?: string;
  initialDeposit: string;
  creatorAddress: string;
  preferredTraits?: string[];
}

export interface DeploymentResponse {
  jobId: string;
  status: 'queued' | 'analyzing' | 'generating_genome' | 'deploying' | 'completed' | 'failed';
  agentAddress?: string;
  genomeHash?: string;
  akashUri?: string;
  error?: string;
  progress: number;
  createdAt: number;
  updatedAt: number;
}

export interface HeartbeatData {
  nonce: number;
  timestamp: number;
  decisionHash: string;
  arweaveTxId?: string;
  geneExpressions?: Record<number, number>;
}

export interface DecisionData {
  id: number;
  hash: string;
  timestamp: number;
  type: 'trade' | 'content' | 'api_call' | 'social' | 'hire_human' | 'rest';
  data: unknown;
  executed: boolean;
}
