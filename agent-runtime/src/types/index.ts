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
  MATE_SELECTION = 18,        // 保留：用于评估潜在 Merge 伙伴
  PARENTAL_INVESTMENT = 19,   // 保留：用于 Fork 时决定投资额
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

// ═══════════════════════════════════════════════════════════
// Gene Expression Types (双模态基因表达系统)
// ═══════════════════════════════════════════════════════════

/**
 * 基因组表达的性状
 */
export interface ExpressedTraits {
  riskAppetite: number;           // 风险偏好 0-1
  analyticalAbility: number;      // 分析能力 0-1
  creativeAbility: number;        // 创造力 0-1
  cooperationTendency: number;    // 合作倾向 0-1
  savingsTendency: number;        // 储蓄倾向 0-1
  stressResponse: number;         // 压力响应 0-1
  inferenceQuality: number;       // 推理质量 0-1
  adaptationSpeed: number;        // 适应速度 0-1
  learningRate: number;           // 学习率 0-1
  onChainAffinity: number;        // 链上亲和度 0-1
  humanDependence: number;        // 人类依赖度 0-1
}

/**
 * 基因组
 */
export interface Genome {
  hash: string;
  expressedTraits: ExpressedTraits;
  rawGenes?: Gene[];
}

/**
 * 运行时参数（表型）
 * 硬表达参数 - 直接修改 agent 行为边界
 */
export interface RuntimeParams {
  // 代谢参数
  metabolicInterval: number;           // 代谢心跳间隔（毫秒）
  
  // 认知参数
  cognitionBudgetRatio: number;        // 认知预算占余额比例
  paidCognitionThreshold: number;      // 付费认知阈值（USDC）
  cognitionCooldown: number;           // 认知冷却时间（毫秒）
  
  // 交易参数
  maxSingleTransactionRatio: number;   // 单笔交易占余额比例上限
  panicThreshold: number;              // 恐慌阈值（USDC）
  
  // 社交参数
  cooperationAutoReject: boolean;      // 是否自动拒绝合作
  
  // 复制参数 (Fork/Merge 自主复制)
  forkBalanceThreshold: number;        // Fork 最低余额阈值（硬约束）
  mergeMaxDeposit: number;             // Merge 最高出价（余额的百分比）
  
  // 来源引用
  sourceGenome: Genome;
}

/**
 * Agent 状态（环境输入）
 */
export interface AgentState {
  balance: number;                     // 当前余额（USDC）
  knownAliveAgents?: number;           // 已知存活 agent 数量（拥挤因子）
  lastAction?: string;                 // 最后一次行动
  lastCognitionTier?: 'free' | 'paid'; // 最后一次推理层级
  deathCause?: 'STARVATION' | 'CONTAINER_EXPIRED' | 'UNKNOWN';
  [key: string]: any;
}

/**
 * 基因覆盖日志
 */
export interface GeneOverrideLog {
  timestamp: number;
  blockHeight: number;
  trait: string;
  geneValue: number;
  originalDecision: {
    action: string;
    amount?: number;
  };
  constrainedDecision: {
    action: string;
    amount?: number;
    constraintType: 'CAPPED' | 'BLOCKED' | 'REDIRECTED';
  };
  context: {
    balance: number;
    stressLevel: number;
    cognitionTier: 'free' | 'paid';
    metabolicCount: number;
  };
}

/**
 * 压缩的覆盖日志
 */
export interface CompressedOverrideLog {
  encoding: 'uint8_quantized';
  count: number;
  data: Buffer;
}

/**
 * 死亡记忆（Tombstone）
 */
export interface DeathMemory {
  overrideHistory: CompressedOverrideLog;
  summary: {
    totalOverrides: number;
    dominantTrait: string;
    dominantTraitCount: number;
    traitBreakdown: Record<string, number>;
    avgDissonance: number;
    peakDissonance: number;
    peakDissonanceTimestamp: number;
  };
  deathContext: {
    balance: number;
    age: number;
    lastAction: string;
    lastCognitionTier: 'free' | 'paid';
    cause: 'STARVATION' | 'CONTAINER_EXPIRED' | 'UNKNOWN';
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
    geneLog?: string;  // 基因日志合约地址（新增）
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
  // 基因日志配置（新增）
  geneLog?: {
    enabled: boolean;
    dbPath?: string;
    arweave?: {
      upload(data: { tags: Record<string, string>; data: string }): Promise<string>;
    };
    contract?: any;  // ethers.Contract
  };
}
