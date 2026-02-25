/**
 * Agent Runtime Types
 */

// Genome Types (mirrored from orchestrator)
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

export interface Gene {
  id: number;
  domain: GeneDomain;
  origin: number;
  expressionState: number;
  value: number;
  weight: number;
  dominance: number;
  plasticity: number;
  essentiality: number;
  metabolicCost: number;
  duplicateOf: number;
  age: number;
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

// Skill System Types
export interface Skill {
  id: string;
  name: string;
  version: string;
  description: string;
  requiredDomains: GeneDomain[];
  minExpression: number; // Minimum gene expression required
  
  // Lifecycle
  initialize(context: SkillContext): Promise<void>;
  execute(params: unknown): Promise<SkillResult>;
  shutdown(): Promise<void>;
}

export interface SkillContext {
  agent: {
    address: string;
    genomeHash: string;
    getGeneExpression(domain: GeneDomain): number;
    getState(): AgentState;
  };
  llm: {
    complete(prompt: string): Promise<string>;
    analyze(data: unknown): Promise<unknown>;
  };
  memory: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    log(event: MemoryEvent): Promise<void>;
  };
  chain: {
    call(method: string, args: unknown[]): Promise<unknown>;
    getBalance(): Promise<string>;
  };
}

export interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: string;
  gasUsed?: string;
  timestamp: number;
}

export interface MemoryEvent {
  type: 'decision' | 'action' | 'observation' | 'error';
  timestamp: number;
  data: unknown;
  geneExpressions?: Record<number, number>;
}

// Decision Types
export interface Decision {
  id: string;
  timestamp: number;
  type: 'skill_execution' | 'rest' | 'social' | 'learning';
  skillId?: string;
  params?: unknown;
  expectedOutcome?: {
    type: string;
    confidence: number;
    value?: number;
  };
  executed: boolean;
  result?: SkillResult;
}

export interface DecisionContext {
  state: AgentState;
  geneExpressions: Map<GeneDomain, number>;
  availableSkills: Skill[];
  recentDecisions: Decision[];
  environmentalFactors: {
    balanceTrend: 'increasing' | 'stable' | 'decreasing';
    timeSinceLastDecision: number;
    timeOfDay: number;
  };
}

// Heartbeat Types
export interface HeartbeatData {
  nonce: number;
  timestamp: number;
  decisionHash: string;
  arweaveTxId?: string;
  geneExpressions?: Record<number, number>;
  summary?: {
    decisionsCount: number;
    skillsExecuted: string[];
    balanceChange: string;
  };
}

// Config Types
export interface AgentConfig {
  agentAddress: string;
  genomeHash: string;
  privateKey: string;
  rpcUrl: string;
  chainId: number;
  contracts: {
    genomeRegistry: string;
    petriAgent: string;
  };
  llm: {
    apiKey: string;
    model: string;
  };
  intervals: {
    heartbeat: number;
    decision: number;
  };
  redis?: string;
  // nkmc 网关配置（新增）
  nkmc?: {
    jwt: string;
    baseUrl?: string;
    cachePath?: string;
  };
}
