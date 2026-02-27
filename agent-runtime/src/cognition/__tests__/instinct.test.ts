/**
 * InstinctMode Tests
 * 
 * 测试本能模式的核心逻辑：
 * 1. 触发条件（连续 5 次失败）
 * 2. 4 级生存优先级决策
 * 3. 72 小时超时死亡
 * 4. 恢复检测
 * 5. Dashboard 状态
 */

import { InstinctMode, SurvivalContext, InstinctDecision } from '../instinct';
import { GeneRouter } from '../gene-router';
import { NoProviderAvailableError } from '../types';
import { ethers } from 'ethers';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('InstinctMode', () => {
  let instinctMode: InstinctMode;
  let mockRouter: jest.Mocked<GeneRouter>;
  let stateChangeCallback: jest.Mock;

  beforeEach(() => {
    // Mock router
    mockRouter = {
      selectProvider: jest.fn(),
    } as unknown as jest.Mocked<GeneRouter>;

    stateChangeCallback = jest.fn();
    instinctMode = new InstinctMode(mockRouter, stateChangeCallback);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // 触发测试
  // ═══════════════════════════════════════════════════════════

  describe('Activation', () => {
    it('should not activate below threshold', () => {
      const result = instinctMode.shouldActivate(4);
      expect(result).toBe(false);
      expect(instinctMode.isActive()).toBe(false);
    });

    it('should activate at threshold (5 failures)', () => {
      const result = instinctMode.shouldActivate(5);
      expect(result).toBe(true);
      expect(instinctMode.isActive()).toBe(true);
      expect(stateChangeCallback).toHaveBeenCalledWith(
        expect.objectContaining({ active: true })
      );
    });

    it('should not activate if already active', () => {
      instinctMode.forceActivate();
      expect(instinctMode.isActive()).toBe(true);

      const result = instinctMode.shouldActivate(10);
      expect(result).toBe(false);
    });

    it('should track last error message', () => {
      const error = new Error('Provider timeout');
      instinctMode.shouldActivate(5, error);

      const state = instinctMode.getState();
      expect(state.lastProviderError).toBe('Provider timeout');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 决策优先级测试
  // ═══════════════════════════════════════════════════════════

  describe('Survival Priority Levels', () => {
    beforeEach(() => {
      instinctMode.forceActivate();
    });

    it('Priority 1: ETH critical (< 0.0002)', () => {
      const context: SurvivalContext = {
        balance: 100,
        ethBalance: 0.0001, // 低于临界值
        estimatedDays: 30,
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      const decision = instinctMode.getInstinctDecision(context);

      expect(decision.type).toBe('REST');
      expect(decision.priority).toBe(1);
      expect(decision.params.reason).toBe('ETH_CRITICAL');
      expect(decision.params.nextHeartbeatDelay).toBe(48 * 60 * 60 * 1000);
    });

    it('Priority 2: USDC depleted (< 2 days)', () => {
      const context: SurvivalContext = {
        balance: 0.5,
        ethBalance: 0.01,
        estimatedDays: 1.5, // 低于 2 天
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      const decision = instinctMode.getInstinctDecision(context);

      expect(decision.type).toBe('FINALIZE_LEGACY');
      expect(decision.priority).toBe(2);
      expect(decision.params.reason).toBe('RESOURCES_DEPLETED');
      expect(decision.params.prepareDeath).toBe(true);
    });

    it('Priority 3: USDC conservation (2-7 days)', () => {
      const context: SurvivalContext = {
        balance: 5,
        ethBalance: 0.01,
        estimatedDays: 4, // 2-7 天之间
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      const decision = instinctMode.getInstinctDecision(context);

      expect(decision.type).toBe('RESOURCE_CONSERVATION');
      expect(decision.priority).toBe(3);
      expect(decision.params.heartbeatInterval).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('Priority 4: Resource sufficient, waiting for recovery', () => {
      const context: SurvivalContext = {
        balance: 100,
        ethBalance: 0.01,
        estimatedDays: 30, // 充足
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      const decision = instinctMode.getInstinctDecision(context);

      expect(decision.type).toBe('REST');
      expect(decision.priority).toBe(4);
      expect(decision.params.reason).toBe('COGNITIVE_STARVATION');
      expect(decision.params.heartbeatInterval).toBe(24 * 60 * 60 * 1000);
    });

    it('ETH critical takes precedence over USDC depleted', () => {
      const context: SurvivalContext = {
        balance: 0.1, // 低 USDC
        ethBalance: 0.0001, // 极低 ETH（更高优先级）
        estimatedDays: 0.5,
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      const decision = instinctMode.getInstinctDecision(context);

      expect(decision.priority).toBe(1); // ETH critical
      expect(decision.params.reason).toBe('ETH_CRITICAL');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 恢复检测测试
  // ═══════════════════════════════════════════════════════════

  describe('Recovery Detection', () => {
    beforeEach(() => {
      instinctMode.forceActivate();
    });

    it('should attempt recovery every 3 cycles', () => {
      mockRouter.selectProvider.mockReturnValue(null);

      const context: SurvivalContext = {
        balance: 100,
        ethBalance: 0.01,
        estimatedDays: 30,
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      // 前 2 个周期不尝试恢复
      instinctMode.getInstinctDecision(context);
      instinctMode.getInstinctDecision(context);
      expect(mockRouter.selectProvider).not.toHaveBeenCalled();

      // 第 3 个周期尝试恢复
      instinctMode.getInstinctDecision(context);
      expect(mockRouter.selectProvider).toHaveBeenCalled();
    });

    it('should deactivate when provider available', () => {
      mockRouter.selectProvider.mockReturnValue({
        id: 'test-provider',
      } as any);

      const context: SurvivalContext = {
        balance: 100,
        ethBalance: 0.01,
        estimatedDays: 30,
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      // 执行到第 3 周期触发恢复
      instinctMode.getInstinctDecision(context);
      instinctMode.getInstinctDecision(context);
      const decision = instinctMode.getInstinctDecision(context);

      expect(decision.type).toBe('RESUME_COGNITION');
      expect(instinctMode.isActive()).toBe(false);
      expect(stateChangeCallback).toHaveBeenLastCalledWith(
        expect.objectContaining({ active: false })
      );
    });

    it('should track recovery attempts', () => {
      mockRouter.selectProvider.mockReturnValue(null);

      const context: SurvivalContext = {
        balance: 100,
        ethBalance: 0.01,
        estimatedDays: 30,
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      // 多个恢复周期
      for (let i = 0; i < 9; i++) {
        instinctMode.getInstinctDecision(context);
      }

      const state = instinctMode.getState();
      expect(state.recoveryAttempts).toBe(3); // 9 / 3 = 3 次恢复尝试
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 死亡机制测试
  // ═══════════════════════════════════════════════════════════

  describe('Starvation Death', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      instinctMode.forceActivate();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should trigger death after 72 hours', () => {
      const context: SurvivalContext = {
        balance: 100,
        ethBalance: 0.01,
        estimatedDays: 30,
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      // 推进 72 小时
      jest.advanceTimersByTime(72 * 60 * 60 * 1000);

      const decision = instinctMode.getInstinctDecision(context);

      expect(decision.type).toBe('DIE');
      expect(decision.params.causeOfDeath).toBe('COGNITIVE_STARVATION');
      expect(decision.priority).toBe(0);
    });

    it('should include death metadata', () => {
      const context: SurvivalContext = {
        balance: 50,
        ethBalance: 0.01,
        estimatedDays: 20,
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      jest.advanceTimersByTime(72 * 60 * 60 * 1000);

      const decision = instinctMode.getInstinctDecision(context);

      expect(decision.params.arweaveContent).toMatchObject({
        type: 'COGNITIVE_STARVATION',
        finalState: 'INSTINCT_MODE_EXHAUSTED',
      });
      expect(decision.params.arweaveContent.consecutiveCycles).toBeGreaterThan(0);
      expect(decision.params.arweaveContent.duration).toBe(72 * 60 * 60 * 1000);
    });

    it('should not trigger death before 72 hours', () => {
      const context: SurvivalContext = {
        balance: 100,
        ethBalance: 0.01,
        estimatedDays: 30,
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      // 推进 71 小时
      jest.advanceTimersByTime(71 * 60 * 60 * 1000);

      const decision = instinctMode.getInstinctDecision(context);

      expect(decision.type).not.toBe('DIE');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Dashboard 状态测试
  // ═══════════════════════════════════════════════════════════

  describe('Dashboard State', () => {
    it('should return inactive state when not active', () => {
      const state = instinctMode.getDashboardState();
      
      expect(state).toMatchObject({
        isActive: false,
        duration: 0,
        cycles: 0,
        recoveryAttempts: 0,
        currentPriority: 0,
      });
    });

    it('should return active state with metrics', () => {
      instinctMode.forceActivate();
      
      const state = instinctMode.getDashboardState();
      
      expect(state?.isActive).toBe(true);
      expect(state?.duration).toBeGreaterThanOrEqual(0);
      expect(state?.cycles).toBe(0);
      expect(state?.recoveryAttempts).toBe(0);
    });

    it('should estimate death time when near timeout', () => {
      jest.useFakeTimers();
      instinctMode.forceActivate();

      // 推进 65 小时（超过 80% 阈值）
      jest.advanceTimersByTime(65 * 60 * 60 * 1000);

      const state = instinctMode.getDashboardState();
      
      expect(state?.estimatedDeathTime).toBeDefined();
      
      jest.useRealTimers();
    });

    it('should track cycles correctly', () => {
      instinctMode.forceActivate();

      const context: SurvivalContext = {
        balance: 100,
        ethBalance: 0.01,
        estimatedDays: 30,
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      instinctMode.getInstinctDecision(context);
      instinctMode.getInstinctDecision(context);
      instinctMode.getInstinctDecision(context);

      const state = instinctMode.getState();
      expect(state.consecutiveCycles).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 工具方法测试
  // ═══════════════════════════════════════════════════════════

  describe('Utility Methods', () => {
    it('should generate unique decision IDs', () => {
      instinctMode.forceActivate();

      const context: SurvivalContext = {
        balance: 100,
        ethBalance: 0.01,
        estimatedDays: 30,
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      const decision1 = instinctMode.getInstinctDecision(context);
      const decision2 = instinctMode.getInstinctDecision(context);

      expect(decision1.id).not.toBe(decision2.id);
      expect(decision1.id).toMatch(/^instinct-/);
    });

    it('should return immutable state copy', () => {
      instinctMode.forceActivate();
      
      const state1 = instinctMode.getState();
      const state2 = instinctMode.getState();
      
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // 不同引用
    });

    it('should get stats only when active', () => {
      expect(instinctMode.getStats()).toBeNull();

      instinctMode.forceActivate();
      const stats = instinctMode.getStats();
      
      expect(stats).toMatchObject({
        duration: expect.any(Number),
        cycles: 0,
        recoveryAttempts: 0,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 集成场景测试
  // ═══════════════════════════════════════════════════════════

  describe('Integration Scenarios', () => {
    it('Full lifecycle: normal -> instinct -> recovery', () => {
      // 1. 激活本能模式
      expect(instinctMode.shouldActivate(5)).toBe(true);
      expect(instinctMode.isActive()).toBe(true);

      const context: SurvivalContext = {
        balance: 100,
        ethBalance: 0.01,
        estimatedDays: 30,
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      // 2. 获取几个本能决策
      instinctMode.getInstinctDecision(context);
      instinctMode.getInstinctDecision(context);

      // 3. 模拟恢复
      mockRouter.selectProvider.mockReturnValue({ id: 'recovered' } as any);
      
      // 4. 第 3 个决策应触发恢复
      const recoveryDecision = instinctMode.getInstinctDecision(context);
      
      expect(recoveryDecision.type).toBe('RESUME_COGNITION');
      expect(instinctMode.isActive()).toBe(false);
    });

    it('Full lifecycle: normal -> instinct -> death', () => {
      jest.useFakeTimers();

      // 1. 激活
      instinctMode.shouldActivate(5);

      const context: SurvivalContext = {
        balance: 100,
        ethBalance: 0.01,
        estimatedDays: 30,
        lastHeartbeat: Date.now(),
        consecutiveFailures: 5,
      };

      // 2. 推进 72 小时
      jest.advanceTimersByTime(72 * 60 * 60 * 1000);

      // 3. 应触发死亡
      const deathDecision = instinctMode.getInstinctDecision(context);
      
      expect(deathDecision.type).toBe('DIE');
      expect(deathDecision.params.causeOfDeath).toBe('COGNITIVE_STARVATION');

      jest.useRealTimers();
    });

    it('Force activation and manual recovery', () => {
      // 1. 强制激活
      instinctMode.forceActivate('TEST_EMERGENCY');
      expect(instinctMode.isActive()).toBe(true);

      // 2. 模拟 provider 可用
      mockRouter.selectProvider.mockReturnValue({ id: 'manual' } as any);

      // 3. 手动恢复
      const recovered = instinctMode.attemptRecovery();
      
      expect(recovered).toBe(true);
      expect(instinctMode.isActive()).toBe(false);
    });
  });
});
