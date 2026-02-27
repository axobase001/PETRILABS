/**
 * Orchestrator Types
 */

import { ethers } from 'ethers';

// ============ Agent Types ============

export interface Agent {
  address: string;
  name: string;
  genomeHash: string;
  status: 'alive' | 'dead' | 'abandoned';
  creator: string;
  agentEOA: string;
  createdAt: number;
  birthTime: number;
  lastHeartbeat: number;
  heartbeatNonce: number;
  balance: string;
  avatarUrl?: string;
  akashDeployment?: AkashDeployment;
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

export interface AgentStats {
  address: string;
  lifetime: {
    createdAt: number;
    age: string;
    status: string;
  };
  financial: {
    initialDeposit: string;
    currentBalance: string;
    totalProfit: string;
    roi: string;
    totalGasSpent: string;
    totalSkillsCost: string;
  };
  activity: {
    totalDecisions: number;
    totalActions: number;
    successRate: number;
    avgDecisionTime: string;
    actionsByType: Record<string, number>;
  };
  skills: {
    totalSkills: number;
    mostUsed: string;
    skillPerformance: SkillPerformance[];
  };
}

export interface SkillPerformance {
  skill: string;
  executions: number;
  successRate: number;
  profit: string;
}

// ============ Heartbeat Types ============

export interface HeartbeatRecord {
  agentAddress: string;
  nonce: number;
  timestamp: number;
  decisionHash: string;
  arweaveTxId?: string;
  txHash: string;
  gasUsed: string;
  blockNumber: number;
}

export interface MissingHeartbeat {
  agentAddress: string;
  expectedTime: number;
  lastHeartbeat: number;
  deadline: number;
  severity: 'warning' | 'critical' | 'abandoned';
  akashStatus?: AkashDeploymentStatus;
}

export interface HeartbeatStatus {
  agentAddress: string;
  isHealthy: boolean;
  lastHeartbeat: number;
  nextExpected: number;
  deadline: number;
  nonce: number;
  timeUntilDeadline: number;
  akashStatus: AkashDeploymentStatus;
}

// ============ Akash Types ============

export interface AkashDeployment {
  dseq: string;
  owner: string;
  provider: string;
  state: string;
  createdAt: string;
  leaseStatus?: AkashLeaseStatus;
}

export interface AkashLeaseStatus {
  cpu: string;
  memory: string;
  storage: string;
  endpoints: AkashEndpoint[];
}

export interface AkashEndpoint {
  kind: string;
  sequence: number;
  host: string;
}

export interface AkashDeploymentStatus {
  dseq: string;
  state: 'active' | 'inactive' | 'closed' | 'error' | 'unknown';
  hostUri?: string;
  lastChecked: number;
  error?: string;
}

// ============ Dashboard Types ============

export interface DashboardOverview {
  agents: {
    total: number;
    alive: number;
    dead: number;
    created24h: number;
  };
  economics: {
    totalValueLocked: string;
    totalGasSpent: string;
    avgAgentBalance: string;
    avgLifespan: string;
  };
  activity: {
    decisions24h: number;
    actions24h: number;
    successRate24h: number;
    topActions: Array<{ action: string; count: number }>;
  };
  skills: {
    totalExecutions: number;
    mostPopular: string;
    totalRevenue: string;
  };
}

export interface CreatorStats {
  address: string;
  agents: {
    total: number;
    alive: number;
    dead: number;
  };
  financial: {
    totalDeposited: string;
    totalValue: string;
    totalDividends: string;
    roi: string;
  };
  performance: {
    totalDecisions: number;
    avgSuccessRate: number;
  };
}

// ============ Decision Types ============

export interface Decision {
  id: string;
  agentAddress: string;
  timestamp: number;
  action: string;
  params: Record<string, any>;
  thoughts: string;
  result?: DecisionResult;
}

export interface DecisionResult {
  success: boolean;
  txHash?: string;
  gasUsed?: string;
  cost?: string;
  error?: string;
}

// ============ Transaction Types ============

export interface AgentTransaction {
  hash: string;
  timestamp: number;
  type: 'skill' | 'heartbeat' | 'income' | 'dividend' | 'other';
  action?: string;
  from: string;
  to: string;
  value: string;
  tokenTransfers: TokenTransfer[];
  gasCost: string;
  status: 'success' | 'failed' | 'pending';
}

export interface TokenTransfer {
  token: string;
  from: string;
  to: string;
  amount: string;
}

// ============ WebSocket Types ============

export interface WebSocketMessage {
  type: 'heartbeat' | 'decision' | 'status' | 'death' | 'error';
  agentAddress: string;
  data: any;
  timestamp: number;
}

export interface HeartbeatWSMessage extends WebSocketMessage {
  type: 'heartbeat';
  data: {
    nonce: number;
    timestamp: number;
    balance: string;
    txHash: string;
  };
}

export interface DecisionWSMessage extends WebSocketMessage {
  type: 'decision';
  data: {
    id: string;
    action: string;
    timestamp: number;
  };
}

export interface StatusWSMessage extends WebSocketMessage {
  type: 'status';
  data: {
    status: 'healthy' | 'warning' | 'critical' | 'dead';
    reason?: string;
    balance?: string;
  };
}

export interface DeathWSMessage extends WebSocketMessage {
  type: 'death';
  data: {
    timestamp: number;
    reason: string;
    tombstoneHash?: string;
  };
}

// ============ API Types ============

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  pagination?: PaginationInfo;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListAgentsQuery {
  status?: 'alive' | 'dead' | 'all';
  creator?: string;
  page?: number;
  limit?: number;
}

// ============ Monitor Types ============

export interface MonitorConfig {
  checkIntervalMs: number;
  warningThreshold: number; // hours before deadline
  criticalThreshold: number; // hours before deadline
  akashCheckEnabled: boolean;
  autoRestartEnabled: boolean;
}

export interface MonitorAlert {
  id: string;
  agentAddress: string;
  type: 'missing_heartbeat' | 'akash_down' | 'low_balance' | 'abandoned';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
  acknowledged: boolean;
}
