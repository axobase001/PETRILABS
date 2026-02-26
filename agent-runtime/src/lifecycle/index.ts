/**
 * Lifecycle Module
 * Agent 生命周期管理
 * 
 * 导出：
 * - LifecycleTracker: 生命周期数据追踪（余额、收入、支出、Fork/Merge）
 * - DeathManager: 死亡闭环管理器（状态机、临终处理、优雅关停）
 */

export { LifecycleTracker } from './tracker';
export { DeathManager } from './death-manager';

export type { 
  LifecycleStats, 
  BalanceUpdate 
} from './tracker';

export type { 
  DeathManagerConfig,
  DeathCheckResult 
} from './death-manager';

// 默认导出
export { LifecycleTracker as default } from './tracker';
