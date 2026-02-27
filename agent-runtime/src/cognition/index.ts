/**
 * Cognition Module
 * B-认知染色体的双模态推理架构 + 基因驱动路由
 * 
 * 导出：
 * - CognitionRouter: 传统双模态路由器（免费 + 付费）
 * - GeneRouter: 基因驱动认知路由器（新）
 * - PollinationsProvider: 免费层
 * - X402LLMProvider: 付费层（x402）
 * - CognitionBudgetEngine: 预算决策引擎
 */

// 传统路由器（向后兼容）
export { CognitionRouter } from './router';
export { PollinationsProvider } from './providers/pollinations';
export { X402LLMProvider, BudgetExceededError } from './providers/x402-llm';
export { CognitionBudgetEngine } from './budget-engine';

// 基因驱动路由器（新）
export { GeneRouter } from './gene-router';
export {
  // 类型
  LLMProvider,
  CognitiveTraits,
  TaskCriticality,
  CognitiveResult,
  RouterConfig,
  WorkingMemory,
  ThinkRequest,
  RoutingDecision,
  SelectionContext,
  ProviderStatsUpdate,
  ProtocolType,
  // 错误类
  NoProviderAvailableError,
  ProviderRejectedError,
  // 常量
  DEFAULT_COGNITIVE_TRAITS,
  DEFAULT_ROUTER_CONFIG,
  CRITICALITY_WEIGHTS,
  PROTOCOL_LABELS,
} from './types';

// 本能模式（认知饥荒生存系统）
export { InstinctMode } from './instinct';
export type {
  InstinctState,
  SurvivalContext,
  InstinctDecision,
  InstinctDecisionType,
  InstinctDashboardState,
} from './instinct';

// 导出认知账本（死亡闭环）
export { CognitionLedger } from './ledger';

// 类型导出（传统）
export type { 
  ReasoningRequest, 
  ReasoningResult,
  CognitionRouterConfig 
} from './router';

export type {
  CognitionRecord,
  CognitionSummary,
} from './ledger';

export type { 
  ReasoningRequest as PollinationsRequest,
  ReasoningResult as PollinationsResult 
} from './providers/pollinations';

export type { 
  X402ReasoningRequest, 
  X402ReasoningResult,
  X402LLMConfig 
} from './providers/x402-llm';

export type { 
  BudgetDecision, 
  EvaluationContext 
} from './budget-engine';

// 默认导出（推荐：使用新的 GeneRouter）
export { GeneRouter as default } from './gene-router';
