/**
 * Instinct Mode - Cognitive Starvation Survival System
 * 
 * 当 CognitionRouter 无法找到可用 LLM 时，Agent 进入"认知饥荒"状态。
 * 本能模式提供硬编码的生存策略，维持最低限度的心跳直至：
 * 1. 恢复认知能力（LLM 服务恢复）
 * 2. 安详死亡（72 小时超时或资源枯竭）
 * 
 * 设计哲学：
 * - 反脆弱性：系统局部失效时，整体仍能降级运行
 * - 生命权优先：即使"大脑"死亡，"身体"仍维持基础代谢
 * - 透明性：本能模式不是"隐藏错误"，而是明确的生存状态
 */

import { logger } from '../utils/logger';
import { GeneRouter } from './gene-router';
import { NoProviderAvailableError } from './types';

// ═══════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════

/**
 * 本能模式状态
 */
export interface InstinctState {
  active: boolean;               // 是否处于本能模式
  activatedAt: number;           // 进入时间戳
  consecutiveCycles: number;     // 连续本能决策周期数
  lastProviderError: string;     // 最后错误信息
  recoveryAttempts: number;      // 恢复尝试次数
  lastRecoveryCheck: number;     // 上次恢复检测时间
}

/**
 * 生存上下文
 */
export interface SurvivalContext {
  balance: number;               // USDC 余额
  ethBalance: number;            // ETH 余额（用于 gas）
  estimatedDays: number;         // 预计剩余生存天数
  lastHeartbeat: number;         // 上次心跳时间戳
  consecutiveFailures: number;   // 连续认知失败次数
}

/**
 * 本能决策
 */
export interface InstinctDecision {
  id: string;
  type: InstinctDecisionType;
  params: Record<string, any>;
  instinct: true;                // 标记为本能决策
  timestamp: number;
  priority: number;              // 优先级（1-4，数字越小越紧急）
}

/**
 * 本能决策类型
 */
export type InstinctDecisionType = 
  | 'REST'                       // 休眠等待
  | 'RESOURCE_CONSERVATION'      // 资源保护
  | 'FINALIZE_LEGACY'            // 准备遗嘱
  | 'DIE'                        // 认知饥荒死亡
  | 'RESUME_COGNITION';          // 恢复认知

/**
 * Dashboard 可观测状态
 */
export interface InstinctDashboardState {
  isActive: boolean;
  duration: number;              // 持续时间 ms
  cycles: number;                // 本能决策周期数
  recoveryAttempts: number;      // 恢复尝试次数
  currentPriority: number;       // 当前决策优先级
  estimatedDeathTime?: number;   // 预计死亡时间（如果会饿死）
}

// ═══════════════════════════════════════════════════════════
// InstinctMode 类
// ═══════════════════════════════════════════════════════════

export class InstinctMode {
  // 触发阈值：连续 N 次 LLM 调用失败进入本能模式
  static readonly TRIGGER_THRESHOLD = 5;
  
  // 最大本能模式持续时间：72 小时
  static readonly MAX_INSTINCT_DURATION_MS = 72 * 60 * 60 * 1000;
  
  // 认知恢复检测间隔：每 N 个周期尝试一次
  static readonly RECOVERY_CHECK_INTERVAL = 3;
  
  // ETH 临界值：约 2 笔 base tx 的 gas
  static readonly ETH_CRITICAL_THRESHOLD = 0.0002;
  
  // 资源阈值
  static readonly DAYS_CRITICAL = 2;    // < 2 天：临终
  static readonly DAYS_CONSERVATION = 7; // < 7 天：节能

  private state: InstinctState;
  private router: GeneRouter;
  private onStateChange?: (state: InstinctState) => void;

  constructor(router: GeneRouter, onStateChange?: (state: InstinctState) => void) {
    this.router = router;
    this.onStateChange = onStateChange;
    
    this.state = {
      active: false,
      activatedAt: 0,
      consecutiveCycles: 0,
      lastProviderError: '',
      recoveryAttempts: 0,
      lastRecoveryCheck: 0,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 状态管理与触发
  // ═══════════════════════════════════════════════════════════

  /**
   * 检查是否应进入本能模式
   * 由 CognitionRouter 在 selectProvider 返回 null 或抛出 NoProviderAvailableError 时调用
   */
  shouldActivate(consecutiveFailures: number, error?: Error): boolean {
    if (this.state.active) return false; // 已在模式内
    
    if (consecutiveFailures >= InstinctMode.TRIGGER_THRESHOLD) {
      this.activate(error);
      return true;
    }
    return false;
  }

  /**
   * 强制激活本能模式（用于测试或紧急情况）
   */
  forceActivate(reason: string = 'MANUAL_TRIGGER'): void {
    this.activate(new Error(reason));
  }

  /**
   * 激活本能模式
   */
  private activate(error?: Error) {
    this.state.active = true;
    this.state.activatedAt = Date.now();
    this.state.consecutiveCycles = 0;
    this.state.recoveryAttempts = 0;
    this.state.lastRecoveryCheck = 0;
    this.state.lastProviderError = error?.message || 'UNKNOWN';

    logger.warn('[INSTINCT] 认知饥荒触发！进入本能生存模式', {
      activatedAt: new Date().toISOString(),
      reason: this.state.lastProviderError,
      threshold: InstinctMode.TRIGGER_THRESHOLD,
    });

    // 立即降低心跳频率（省 gas）
    this.enterPowerSaveMode();
    
    // 通知状态变更
    this.onStateChange?.(this.getState());
  }

  /**
   * 退出本能模式
   */
  deactivate(): void {
    if (!this.state.active) return;
    
    const duration = Date.now() - this.state.activatedAt;
    
    logger.warn('[INSTINCT] 认知恢复！退出本能模式', {
      duration: `${(duration / 1000 / 60).toFixed(1)} 分钟`,
      cycles: this.state.consecutiveCycles,
      recoveryAttempts: this.state.recoveryAttempts,
    });

    this.state.active = false;
    this.state.consecutiveCycles = 0;
    this.state.recoveryAttempts = 0;

    // 恢复正常心跳频率
    this.exitPowerSaveMode();
    
    // 通知状态变更
    this.onStateChange?.(this.getState());
  }

  // ═══════════════════════════════════════════════════════════
  // 核心决策逻辑
  // ═══════════════════════════════════════════════════════════

  /**
   * 获取本能决策（硬编码生存逻辑）
   * 这是本能模式的入口，每个决策周期调用一次
   */
  getInstinctDecision(context: SurvivalContext): InstinctDecision {
    if (!this.state.active) {
      throw new Error('InstinctMode not active, call shouldActivate() first');
    }

    this.state.consecutiveCycles++;

    // 每 N 个周期尝试恢复认知
    if (this.state.consecutiveCycles % InstinctMode.RECOVERY_CHECK_INTERVAL === 0) {
      if (this.tryRecover()) {
        return this.createRecoveryDecision();
      }
    }

    // 检查是否超过最大持续时间 → 认知饥荒死亡
    if (this.isStarvationDeath()) {
      return this.createStarvationDeathDecision();
    }

    // 硬编码生存优先级（无需 LLM）
    return this.calculateSurvivalPriority(context);
  }

  /**
   * 硬编码生存优先级算法（4 级）
   * 
   * 优先级 1（最高）: ETH 极度枯竭 → 停止一切，48 小时后最后一搏
   * 优先级 2: USDC 即将耗尽（< 2 天）→ 准备遗嘱，临终状态
   * 优先级 3: USDC 紧张（2-7 天）→ 最大间隔心跳（7 天），极限节能
   * 优先级 4（最低）: 资源充足但无认知 → 每日一次基础心跳，等待恢复
   */
  private calculateSurvivalPriority(context: SurvivalContext): InstinctDecision {
    const { balance, ethBalance, estimatedDays, lastHeartbeat } = context;

    // 优先级 1：ETH 极度枯竭（不够发 2 笔 tx）
    if (ethBalance < InstinctMode.ETH_CRITICAL_THRESHOLD) {
      logger.error('[INSTINCT] ETH 极度枯竭，进入最后等待', {
        ethBalance,
        threshold: InstinctMode.ETH_CRITICAL_THRESHOLD,
      });

      return {
        id: this.generateDecisionId(),
        type: 'REST',
        params: {
          reason: 'ETH_CRITICAL',
          action: '等待外部 ETH 充值或死亡',
          description: 'ETH 余额不足以支持基本交易，48 小时后进行最后一次心跳尝试',
          nextHeartbeatDelay: 48 * 60 * 60 * 1000, // 48 小时
          ethBalance,
          threshold: InstinctMode.ETH_CRITICAL_THRESHOLD,
        },
        instinct: true,
        timestamp: Date.now(),
        priority: 1,
      };
    }

    // 优先级 2：USDC 即将耗尽（< 2 天生存期）
    if (estimatedDays < InstinctMode.DAYS_CRITICAL) {
      logger.warn('[INSTINCT] USDC 即将耗尽，准备遗嘱', {
        estimatedDays,
        balance,
      });

      return {
        id: this.generateDecisionId(),
        type: 'FINALIZE_LEGACY',
        params: {
          reason: 'RESOURCES_DEPLETED',
          action: '准备后事，写最终遗嘱到 Arweave',
          description: '预计生存时间不足 2 天，进入临终状态，整理生命数据',
          prepareDeath: true,
          estimatedDays,
          balance,
          arweaveContent: {
            type: 'FINAL_LEGACY',
            timestamp: Date.now(),
            finalBalance: balance,
            estimatedDaysRemaining: estimatedDays,
            instinctCycles: this.state.consecutiveCycles,
          },
        },
        instinct: true,
        timestamp: Date.now(),
        priority: 2,
      };
    }

    // 优先级 3：USDC 紧张（2-7 天）
    if (estimatedDays < InstinctMode.DAYS_CONSERVATION) {
      logger.info('[INSTINCT] USDC 紧张，进入极限节能', {
        estimatedDays,
        balance,
      });

      return {
        id: this.generateDecisionId(),
        type: 'RESOURCE_CONSERVATION',
        params: {
          reason: 'RESOURCE_CONSERVATION',
          action: '延长心跳间隔至最大（7 天），最小化代谢',
          description: '预计生存时间 2-7 天，最大化心跳间隔以延长生命',
          heartbeatInterval: 7 * 24 * 60 * 60 * 1000, // 7 天
          estimatedDays,
          balance,
          conservationLevel: 'MAXIMUM',
        },
        instinct: true,
        timestamp: Date.now(),
        priority: 3,
      };
    }

    // 优先级 4：资源充足但无认知 → 保持最低限度存在
    logger.info('[INSTINCT] 资源充足，维持基础心跳等待认知恢复', {
      estimatedDays,
      balance,
      cycles: this.state.consecutiveCycles,
    });

    return {
      id: this.generateDecisionId(),
      type: 'REST',
      params: {
        reason: 'COGNITIVE_STARVATION',
        action: '维持基础心跳，等待认知恢复',
        description: '资源充足但无法获取认知服务，每日一次基础心跳',
        heartbeatInterval: 24 * 60 * 60 * 1000, // 1 天
        estimatedDays,
        balance,
        cycles: this.state.consecutiveCycles,
      },
      instinct: true,
      timestamp: Date.now(),
      priority: 4,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 恢复检测
  // ═══════════════════════════════════════════════════════════

  /**
   * 尝试恢复认知能力
   * 每 RECOVERY_CHECK_INTERVAL 个周期调用一次
   */
  private tryRecover(): boolean {
    this.state.recoveryAttempts++;
    this.state.lastRecoveryCheck = Date.now();

    logger.info('[INSTINCT] 尝试恢复认知能力', {
      attempt: this.state.recoveryAttempts,
    });

    try {
      // 检查是否有 provider 可用
      const provider = this.router.selectProvider('low', 100);
      
      if (provider) {
        logger.warn('[INSTINCT] 认知恢复！Provider 可用', {
          provider: provider.id,
        });
        this.deactivate();
        return true;
      }
    } catch (error) {
      if (error instanceof NoProviderAvailableError) {
        logger.debug('[INSTINCT] 恢复尝试失败，仍无可用 provider');
      } else {
        logger.error('[INSTINCT] 恢复检测异常', { error });
      }
    }

    return false;
  }

  /**
   * 强制尝试恢复（外部调用）
   */
  attemptRecovery(): boolean {
    return this.tryRecover();
  }

  // ═══════════════════════════════════════════════════════════
  // 死亡机制
  // ═══════════════════════════════════════════════════════════

  /**
   * 检查是否应触发认知饥荒死亡
   * 超过 72 小时未能恢复认知
   */
  private isStarvationDeath(): boolean {
    const duration = Date.now() - this.state.activatedAt;
    return duration > InstinctMode.MAX_INSTINCT_DURATION_MS;
  }

  /**
   * 创建饥荒死亡决策
   */
  private createStarvationDeathDecision(): InstinctDecision {
    const duration = Date.now() - this.state.activatedAt;

    logger.error('[INSTINCT] 认知饥荒死亡触发', {
      duration: `${(duration / 1000 / 60 / 60).toFixed(1)} 小时`,
      cycles: this.state.consecutiveCycles,
    });

    return {
      id: this.generateDecisionId(),
      type: 'DIE',
      params: {
        causeOfDeath: 'COGNITIVE_STARVATION',
        reason: '连续 72 小时无法获取认知服务，且资源持续枯竭',
        description: 'Agent 在认知饥荒状态下持续 72 小时未能恢复，触发安详死亡',
        arweaveContent: {
          finalState: 'INSTINCT_MODE_EXHAUSTED',
          type: 'COGNITIVE_STARVATION',
          consecutiveCycles: this.state.consecutiveCycles,
          duration,
          activatedAt: this.state.activatedAt,
          recoveryAttempts: this.state.recoveryAttempts,
          timestamp: Date.now(),
        },
      },
      instinct: true,
      timestamp: Date.now(),
      priority: 0, // 最高优先级
    };
  }

  /**
   * 创建恢复决策
   */
  private createRecoveryDecision(): InstinctDecision {
    return {
      id: this.generateDecisionId(),
      type: 'RESUME_COGNITION',
      params: {
        reason: 'COGNITIVE_PROVIDER_RESTORED',
        description: '认知服务恢复，退出本能模式',
        previousInstinctCycles: this.state.consecutiveCycles,
        duration: Date.now() - this.state.activatedAt,
      },
      instinct: true, // 仍然标记为本能决策（特殊的恢复决策）
      timestamp: Date.now(),
      priority: 0,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 省电模式（与 GasManager/心跳系统集成）
  // ═══════════════════════════════════════════════════════════

  private enterPowerSaveMode() {
    logger.info('[INSTINCT] 进入省电模式');
    process.emit('enterPowerSave' as any, {
      source: 'INSTINCT_MODE',
      reason: 'COGNITIVE_STARVATION',
    });
  }

  private exitPowerSaveMode() {
    logger.info('[INSTINCT] 退出省电模式');
    process.emit('exitPowerSave' as any, {
      source: 'INSTINCT_MODE',
      reason: 'COGNITIVE_RESTORED',
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 工具方法
  // ═══════════════════════════════════════════════════════════

  private generateDecisionId(): string {
    return `instinct-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ═══════════════════════════════════════════════════════════
  // Getters（Dashboard 可观测）
  // ═══════════════════════════════════════════════════════════

  isActive(): boolean {
    return this.state.active;
  }

  getState(): InstinctState {
    return { ...this.state };
  }

  /**
   * 获取 Dashboard 展示状态
   */
  getDashboardState(): InstinctDashboardState | null {
    if (!this.state.active) {
      return { isActive: false, duration: 0, cycles: 0, recoveryAttempts: 0, currentPriority: 0 };
    }

    const duration = Date.now() - this.state.activatedAt;
    const willStarve = duration > InstinctMode.MAX_INSTINCT_DURATION_MS * 0.8; // 超过 80% 警告

    return {
      isActive: true,
      duration,
      cycles: this.state.consecutiveCycles,
      recoveryAttempts: this.state.recoveryAttempts,
      currentPriority: this.estimateCurrentPriority(),
      estimatedDeathTime: willStarve 
        ? this.state.activatedAt + InstinctMode.MAX_INSTINCT_DURATION_MS 
        : undefined,
    };
  }

  /**
   * 估算当前决策优先级（基于上次决策推断）
   */
  private estimateCurrentPriority(): number {
    // 简化：根据 cycles 和 recoveryAttempts 推断
    if (this.state.consecutiveCycles > 50) return 1; // ETH 临界或已死亡
    if (this.state.consecutiveCycles > 20) return 2; // 可能临终
    if (this.state.consecutiveCycles > 10) return 3; // 节能模式
    return 4; // 等待恢复
  }

  /**
   * 获取统计信息
   */
  getStats() {
    if (!this.state.active) return null;
    return {
      duration: Date.now() - this.state.activatedAt,
      cycles: this.state.consecutiveCycles,
      recoveryAttempts: this.state.recoveryAttempts,
    };
  }
}

export default InstinctMode;
