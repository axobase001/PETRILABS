/**
 * Cognition Types - Gene-Driven Cognitive Router
 * 
 * 认知路由系统的核心类型定义
 * 支持基因驱动的动态 LLM 服务商选择
 */

import { ethers } from 'ethers';

// ═══════════════════════════════════════════════════════════
// 服务商协议类型
// ═══════════════════════════════════════════════════════════

export type ProtocolType = 'free' | 'x402' | 'api_key';

export const PROTOCOL_LABELS: Record<ProtocolType, string> = {
  free: '免费服务',
  x402: 'x402 微支付',
  api_key: 'API Key 订阅',
};

// ═══════════════════════════════════════════════════════════
// LLM 服务商定义
// ═══════════════════════════════════════════════════════════

export interface LLMProvider {
  id: string;                    // 唯一标识：pollinations, daydreams-x402, etc.
  name: string;                  // 显示名称
  endpoint: string;              // API 端点
  protocol: ProtocolType;        // 支付协议
  
  // 经济参数
  costPer1kTokens: number;       // USDC 每千 token，0 = 免费
  minBalanceRequired: number;    // 调用所需的最低余额（防止透支）
  
  // 质量评估（由 Agent 自我评估更新）
  qualityScore: number;          // 0-1，基于历史响应质量
  successRate: number;           // 0-1，最近成功率
  avgLatency: number;            // 平均延迟 ms
  
  // 状态
  available: boolean;            // 当前是否可用
  lastChecked: number;           // 上次健康检查时间戳
  consecutiveFailures: number;   // 连续失败次数
  
  // 可选：模型支持
  supportedModels?: string[];    // 支持的模型列表
}

// ═══════════════════════════════════════════════════════════
// 基因表达（认知特质）
// ═══════════════════════════════════════════════════════════

export interface CognitiveTraits {
  riskAppetite: number;          // 0-1，风险偏好（影响高危决策时的选择）
  savingsTendency: number;       // 0-1，储蓄倾向（0=花钱如流水，1=一毛不拔）
  cognitionQuality: number;      // 0-1，认知质量需求（0=能用就行，1=追求最好）
  cooperationTendency: number;   // 0-1，合作倾向（影响是否选择社区免费服务）
  stressResponse: 'aggressive' | 'conservative' | 'adaptive'; // 压力响应模式
}

// 默认特质（中性）
export const DEFAULT_COGNITIVE_TRAITS: CognitiveTraits = {
  riskAppetite: 0.5,
  savingsTendency: 0.5,
  cognitionQuality: 0.5,
  cooperationTendency: 0.5,
  stressResponse: 'adaptive',
};

// ═══════════════════════════════════════════════════════════
// 任务关键性级别
// ═══════════════════════════════════════════════════════════

export type TaskCriticality = 'low' | 'medium' | 'high' | 'critical';

export const CRITICALITY_WEIGHTS: Record<TaskCriticality, number> = {
  low: 1.0,
  medium: 2.0,
  high: 3.0,
  critical: 5.0,
};

// ═══════════════════════════════════════════════════════════
// 认知结果
// ═══════════════════════════════════════════════════════════

export interface CognitiveResult {
  content: string;
  provider: string;
  cost: number;                  // 实际花费 USDC
  latency: number;               // 延迟 ms
  timestamp: number;
  model?: string;                // 使用的模型
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  fallback?: boolean;            // 是否使用了 fallback
  error?: string;                // 错误信息（如果失败）
}

// ═══════════════════════════════════════════════════════════
// 路由器配置
// ═══════════════════════════════════════════════════════════

export interface RouterConfig {
  wallet: ethers.Wallet;
  traits: CognitiveTraits;
  maxRetries: number;
  fallbackEnabled: boolean;
  qualityThreshold: number;      // 最低可接受质量（0-1）
  defaultTimeout: number;        // 默认超时 ms
}

export const DEFAULT_ROUTER_CONFIG: Partial<RouterConfig> = {
  maxRetries: 3,
  fallbackEnabled: true,
  qualityThreshold: 0.3,
  defaultTimeout: 60000,
};

// ═══════════════════════════════════════════════════════════
// 选择策略结果
// ═══════════════════════════════════════════════════════════

export interface SelectionStrategy {
  name: string;
  description: string;
  priority: number;
  condition: (context: SelectionContext) => boolean;
}

export interface SelectionContext {
  traits: CognitiveTraits;
  currentBalance: number;
  taskCriticality: TaskCriticality;
  estimatedCost: number;
  availableProviders: LLMProvider[];
}

// ═══════════════════════════════════════════════════════════
// 服务商统计更新
// ═══════════════════════════════════════════════════════════

export interface ProviderStatsUpdate {
  success: boolean;
  latency?: number;
  quality?: number;              // 0-1 质量评分
  error?: string;
}

// ═══════════════════════════════════════════════════════════
// 工作记忆（与任务 16 对接）
// ═══════════════════════════════════════════════════════════

export interface WorkingMemory {
  recentThoughts: string[];
  currentGoal?: string;
  contextWindow: string;
  emotionalState?: {
    stressLevel: number;         // 0-1
    urgency: number;             // 0-1
  };
}

// ═══════════════════════════════════════════════════════════
// 认知请求
// ═══════════════════════════════════════════════════════════

export interface ThinkRequest {
  prompt: string;
  context: WorkingMemory;
  criticality: TaskCriticality;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  preferredProvider?: string;    // 可选：指定服务商
}

// ═══════════════════════════════════════════════════════════
// 路由决策记录（用于学习和审计）
// ═══════════════════════════════════════════════════════════

export interface RoutingDecision {
  timestamp: number;
  taskCriticality: TaskCriticality;
  selectedProvider: string;
  strategy: string;
  estimatedCost: number;
  actualCost: number;
  traits: CognitiveTraits;
  currentBalance: number;
  alternatives: string[];
  reason: string;
}

// ═══════════════════════════════════════════════════════════
// 基因解码函数类型
// ═══════════════════════════════════════════════════════════

export type DecodeCognitiveTraitsFn = (genome: any) => CognitiveTraits;

// ═══════════════════════════════════════════════════════════
// 错误类型
// ═══════════════════════════════════════════════════════════

export class NoProviderAvailableError extends Error {
  constructor(message: string = 'No cognitive provider available') {
    super(message);
    this.name = 'NoProviderAvailableError';
  }
}

export class ProviderRejectedError extends Error {
  constructor(
    public providerId: string,
    public reason: string
  ) {
    super(`Provider ${providerId} rejected: ${reason}`);
    this.name = 'ProviderRejectedError';
  }
}

// ═══════════════════════════════════════════════════════════
// 基因表达与选择策略的映射关系（文档说明）
// ═══════════════════════════════════════════════════════════

/**
 * 基因驱动选择逻辑映射：
 * 
 * 1. 高 savingsTendency (>0.8) 或 余额 < 2 USDC
 *    → 极端节俭模式：优先免费服务
 * 
 * 2. 高 cognitionQuality (>0.7) + 余额充足 + 高危任务
 *    → 高质量模式：选最好的付费服务
 * 
 * 3. 低 riskAppetite (<0.3)
 *    → 保守模式：优先选成功率高的
 * 
 * 4. 默认策略
 *    → 性价比平衡：quality / cost
 * 
 * 5. 所有服务商都失败
 *    → 触发 NO_PROVIDER_AVAILABLE，进入本能模式
 */
