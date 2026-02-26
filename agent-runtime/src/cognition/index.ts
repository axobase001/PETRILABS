/**
 * Cognition Module
 * B-认知染色体的双模态推理架构
 * 
 * 导出：
 * - CognitionRouter: 主路由器（免费 + 付费）
 * - PollinationsProvider: 免费层
 * - X402LLMProvider: 付费层（x402）
 * - CognitionBudgetEngine: 预算决策引擎
 */

export { CognitionRouter } from './router';
export { PollinationsProvider } from './providers/pollinations';
export { X402LLMProvider, BudgetExceededError } from './providers/x402-llm';
export { CognitionBudgetEngine } from './budget-engine';

// 导出认知账本（新增：死亡闭环）
export { CognitionLedger } from './ledger';

// 类型导出
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

// 默认导出
export { CognitionRouter as default } from './router';
