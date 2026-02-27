/**
 * Dashboard Types
 */

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
}

export interface AgentDetails extends Agent {
  genome: {
    expression: Record<string, number>;
    genes: any[];
  };
  metabolism: {
    theoretical: string;
    actual7d: string;
    efficiency: number;
    projectedDays: number;
  };
  skills: {
    active: string[];
    totalExecuted: number;
    successRate: number;
  };
  tombstone: {
    status: string;
    contentHash: string | null;
    lastUpdated: number | null;
  };
  heartbeatStatus?: HeartbeatStatus;
}

export interface HeartbeatStatus {
  agentAddress: string;
  isHealthy: boolean;
  lastHeartbeat: number;
  nextExpected: number;
  deadline: number;
  nonce: number;
  timeUntilDeadline: number;
}

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

export interface MissingReport {
  id: string;
  agentAddress: string;
  severity: 'warning' | 'critical' | 'abandoned';
  expectedTime: number;
  lastHeartbeat: number;
  deadline: number;
  akashStatus?: {
    dseq: string;
    state: string;
  };
  createdAt: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  resolved: boolean;
  resolvedAt?: number;
  resolution?: string;
}

export interface Decision {
  id: string;
  agentAddress: string;
  timestamp: number;
  action: string;
  params: Record<string, any>;
  thoughts: string;
  result?: {
    success: boolean;
    txHash?: string;
    gasUsed?: string;
    cost?: string;
  };
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

export interface WebSocketMessage {
  type: 'heartbeat' | 'decision' | 'status' | 'death' | 'error';
  agentAddress: string;
  data: any;
  timestamp: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
