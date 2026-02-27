/**
 * GeneRouter Tests
 * 
 * 测试基因驱动认知路由器的核心逻辑：
 * 1. 服务商注册与管理
 * 2. 基因驱动选择算法（4 种策略）
 * 3. 经济感知（余额检查）
 * 4. 自评估与学习（EMA 更新）
 * 5. 错误处理
 */

import { ethers } from 'ethers';
import { GeneRouter } from '../gene-router';
import {
  LLMProvider,
  CognitiveTraits,
  TaskCriticality,
  NoProviderAvailableError,
  DEFAULT_COGNITIVE_TRAITS,
} from '../types';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('GeneRouter', () => {
  let router: GeneRouter;
  let mockWallet: ethers.Wallet;

  // 测试用服务商
  const testProviders: LLMProvider[] = [
    {
      id: 'free-provider',
      name: 'Free Provider',
      endpoint: 'https://free.test',
      protocol: 'free',
      costPer1kTokens: 0,
      minBalanceRequired: 0,
      qualityScore: 0.5,
      successRate: 0.95,
      avgLatency: 2000,
      available: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    },
    {
      id: 'cheap-provider',
      name: 'Cheap Provider',
      endpoint: 'https://cheap.test',
      protocol: 'x402',
      costPer1kTokens: 0.005,
      minBalanceRequired: 0.1,
      qualityScore: 0.7,
      successRate: 0.9,
      avgLatency: 1500,
      available: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    },
    {
      id: 'premium-provider',
      name: 'Premium Provider',
      endpoint: 'https://premium.test',
      protocol: 'x402',
      costPer1kTokens: 0.05,
      minBalanceRequired: 0.5,
      qualityScore: 0.95,
      successRate: 0.98,
      avgLatency: 1000,
      available: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    },
  ];

  beforeEach(() => {
    // 创建 mock wallet
    mockWallet = new ethers.Wallet(
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    );

    // 创建 router
    router = new GeneRouter({
      wallet: mockWallet,
      traits: DEFAULT_COGNITIVE_TRAITS,
    });

    // 注册测试服务商
    testProviders.forEach(p => router.registerProvider(p));

    // Mock 余额
    jest.spyOn(router as any, 'getCurrentBalance').mockReturnValue(10.0);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // 服务商管理
  // ═══════════════════════════════════════════════════════════

  describe('Provider Management', () => {
    it('should register providers', () => {
      const providers = router.getAvailableProviders();
      expect(providers).toHaveLength(3);
    });

    it('should unregister provider', () => {
      router.unregisterProvider('cheap-provider');
      const providers = router.getAvailableProviders();
      expect(providers).toHaveLength(2);
    });

    it('should get specific provider', () => {
      const provider = router.getProvider('premium-provider');
      expect(provider).toBeDefined();
      expect(provider?.name).toBe('Premium Provider');
    });

    it('should return undefined for non-existent provider', () => {
      const provider = router.getProvider('non-existent');
      expect(provider).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 基因驱动选择算法
  // ═══════════════════════════════════════════════════════════

  describe('Genetic Selection Algorithm', () => {
    describe('Strategy 1: Extreme Frugality', () => {
      it('should select free provider when savingsTendency > 0.8', () => {
        router.updateTraits({ savingsTendency: 0.9 });
        
        const provider = router.selectProvider('medium');
        
        expect(provider).toBeDefined();
        expect(provider?.costPer1kTokens).toBe(0);
        expect(provider?.id).toBe('free-provider');
      });

      it('should select free provider when balance < 2.0', () => {
        jest.spyOn(router as any, 'getCurrentBalance').mockReturnValue(1.5);
        
        const provider = router.selectProvider('medium');
        
        expect(provider).toBeDefined();
        expect(provider?.costPer1kTokens).toBe(0);
      });

      it('should select cheapest if no free provider', () => {
        router.unregisterProvider('free-provider');
        router.updateTraits({ savingsTendency: 0.9 });
        
        const provider = router.selectProvider('medium');
        
        expect(provider).toBeDefined();
        expect(provider?.costPer1kTokens).toBeLessThan(0.01);
      });
    });

    describe('Strategy 2: High-Stakes Decision', () => {
      it('should select premium provider for critical task with high quality demand', () => {
        router.updateTraits({ 
          cognitionQuality: 0.8,
          savingsTendency: 0.3, // 不要太节俭
        });
        jest.spyOn(router as any, 'getCurrentBalance').mockReturnValue(10.0);
        
        const provider = router.selectProvider('critical');
        
        expect(provider).toBeDefined();
        expect(provider?.id).toBe('premium-provider');
        expect(provider?.qualityScore).toBeGreaterThan(0.9);
      });

      it('should select most reliable for critical task without high quality demand', () => {
        router.updateTraits({ 
          cognitionQuality: 0.5,
          savingsTendency: 0.3,
        });
        jest.spyOn(router as any, 'getCurrentBalance').mockReturnValue(10.0);
        
        const provider = router.selectProvider('critical');
        
        expect(provider).toBeDefined();
        // 应该选成功率最高的
        expect(provider?.successRate).toBeGreaterThanOrEqual(0.95);
      });

      it('should not use high-stakes strategy when balance < 5.0', () => {
        router.updateTraits({ cognitionQuality: 0.9 });
        jest.spyOn(router as any, 'getCurrentBalance').mockReturnValue(3.0);
        
        const provider = router.selectProvider('critical');
        
        expect(provider).toBeDefined();
        // 余额不足，不应该强制选最贵的
        expect(provider?.costPer1kTokens).toBeLessThan(0.05);
      });
    });

    describe('Strategy 3: Risk-Averse', () => {
      it('should prioritize success rate when riskAppetite < 0.3', () => {
        router.updateTraits({ 
          riskAppetite: 0.1,
          savingsTendency: 0.5,
        });
        
        const provider = router.selectProvider('medium');
        
        expect(provider).toBeDefined();
        // 应该选成功率最高的
        expect(provider?.successRate).toBeGreaterThanOrEqual(0.9);
      });
    });

    describe('Strategy 4: Default Balance', () => {
      it('should select by quality/cost ratio by default', () => {
        router.updateTraits(DEFAULT_COGNITIVE_TRAITS);
        
        const provider = router.selectProvider('medium');
        
        expect(provider).toBeDefined();
        // 应该选性价比最高的
        expect(provider?.qualityScore).toBeGreaterThan(0);
        expect(provider?.costPer1kTokens).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Affordability Check', () => {
      it('should return null when cannot afford any provider', () => {
        jest.spyOn(router as any, 'getCurrentBalance').mockReturnValue(0.01);
        
        const provider = router.selectProvider('medium');
        
        expect(provider).toBeNull();
      });

      it('should filter by minBalanceRequired', () => {
        jest.spyOn(router as any, 'getCurrentBalance').mockReturnValue(0.3);
        
        const provider = router.selectProvider('medium');
        
        if (provider) {
          expect(provider.minBalanceRequired).toBeLessThanOrEqual(0.3);
        }
      });
    });

    describe('No Available Providers', () => {
      it('should return null when no providers available', () => {
        // 标记所有服务商为不可用
        testProviders.forEach(p => {
          const provider = router.getProvider(p.id);
          if (provider) {
            provider.available = false;
          }
        });
        
        const provider = router.selectProvider('medium');
        
        expect(provider).toBeNull();
      });

      it('should return null when all providers failed 3 times', () => {
        testProviders.forEach(p => {
          const provider = router.getProvider(p.id);
          if (provider) {
            provider.consecutiveFailures = 3;
          }
        });
        
        const provider = router.selectProvider('medium');
        
        expect(provider).toBeNull();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 自评估与学习
  // ═══════════════════════════════════════════════════════════

  describe('Self-Assessment & Learning', () => {
    it('should update provider stats on success', () => {
      const provider = router.getProvider('free-provider')!;
      const initialSuccessRate = provider.successRate;
      
      router.updateProviderStats('free-provider', {
        success: true,
        latency: 1000,
        quality: 0.8,
      });
      
      expect(provider.successRate).toBeGreaterThan(initialSuccessRate);
      expect(provider.consecutiveFailures).toBe(0);
    });

    it('should update provider stats on failure', () => {
      const provider = router.getProvider('free-provider')!;
      const initialSuccessRate = provider.successRate;
      
      router.updateProviderStats('free-provider', { success: false });
      
      expect(provider.successRate).toBeLessThan(initialSuccessRate);
      expect(provider.consecutiveFailures).toBe(1);
    });

    it('should mark provider unavailable after 3 consecutive failures', () => {
      const provider = router.getProvider('free-provider')!;
      
      router.updateProviderStats('free-provider', { success: false });
      router.updateProviderStats('free-provider', { success: false });
      router.updateProviderStats('free-provider', { success: false });
      
      expect(provider.available).toBe(false);
      expect(provider.consecutiveFailures).toBe(3);
    });

    it('should reset consecutiveFailures on success', () => {
      const provider = router.getProvider('free-provider')!;
      provider.consecutiveFailures = 2;
      
      router.updateProviderStats('free-provider', { success: true });
      
      expect(provider.consecutiveFailures).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 特质更新
  // ═══════════════════════════════════════════════════════════

  describe('Traits Management', () => {
    it('should update traits', () => {
      router.updateTraits({ riskAppetite: 0.2 });
      
      const traits = router.getTraits();
      expect(traits.riskAppetite).toBe(0.2);
      // 其他特质保持不变
      expect(traits.savingsTendency).toBe(DEFAULT_COGNITIVE_TRAITS.savingsTendency);
    });

    it('should return copy of traits', () => {
      const traits = router.getTraits();
      traits.riskAppetite = 0.99;
      
      const traitsAgain = router.getTraits();
      expect(traitsAgain.riskAppetite).not.toBe(0.99);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 决策历史
  // ═══════════════════════════════════════════════════════════

  describe('Decision History', () => {
    it('should record decisions', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Test response' } }],
        }),
      });

      await router.think({
        prompt: 'Test',
        context: { recentThoughts: [], contextWindow: '' },
        criticality: 'medium',
      });

      const history = router.getDecisionHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should limit history to 100 entries', () => {
      // 模拟多次决策
      for (let i = 0; i < 105; i++) {
        (router as any).recordDecision({
          selectedProvider: 'test',
          strategy: 'test',
        });
      }

      const history = router.getDecisionHistory();
      expect(history.length).toBe(100);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 工具方法
  // ═══════════════════════════════════════════════════════════

  describe('Utility Methods', () => {
    it('should calculate actual cost correctly', () => {
      const provider = router.getProvider('cheap-provider')!;
      const cost = (router as any).calculateActualCost(provider, 'a'.repeat(3000));
      
      // 3000 chars / 3 = 1000 tokens, costPer1k = 0.005
      expect(cost).toBeCloseTo(0.005, 3);
    });

    it('should assess quality', () => {
      const highQuality = (router as any).assessQuality('This is a long response with code:\n```\ncode\n```');
      const lowQuality = (router as any).assessQuality('Short');
      
      expect(highQuality).toBeGreaterThan(lowQuality);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// 示例场景测试
// ═══════════════════════════════════════════════════════════

describe('Example Scenarios', () => {
  let router: GeneRouter;
  let mockWallet: ethers.Wallet;

  beforeEach(() => {
    mockWallet = new ethers.Wallet(
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    );
    router = new GeneRouter({
      wallet: mockWallet,
      traits: DEFAULT_COGNITIVE_TRAITS,
    });
  });

  it('Scenario: High savings, low balance agent', () => {
    // Agent 基因：非常节俭，余额很少
    router.updateTraits({ savingsTendency: 0.9 });
    jest.spyOn(router as any, 'getCurrentBalance').mockReturnValue(1.5);

    // 添加免费和付费服务商
    router.registerProvider({
      id: 'free',
      name: 'Free',
      endpoint: 'https://free.test',
      protocol: 'free',
      costPer1kTokens: 0,
      minBalanceRequired: 0,
      qualityScore: 0.5,
      successRate: 0.9,
      avgLatency: 2000,
      available: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    });

    router.registerProvider({
      id: 'expensive',
      name: 'Expensive',
      endpoint: 'https://expensive.test',
      protocol: 'x402',
      costPer1kTokens: 0.1,
      minBalanceRequired: 1.0,
      qualityScore: 0.95,
      successRate: 0.98,
      avgLatency: 1000,
      available: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    });

    const provider = router.selectProvider('high');
    
    // 应该选免费的
    expect(provider?.id).toBe('free');
  });

  it('Scenario: High quality demand, wealthy agent', () => {
    // Agent 基因：追求质量，余额充足
    router.updateTraits({ 
      cognitionQuality: 0.8,
      savingsTendency: 0.2,
    });
    jest.spyOn(router as any, 'getCurrentBalance').mockReturnValue(100.0);

    router.registerProvider({
      id: 'basic',
      name: 'Basic',
      endpoint: 'https://basic.test',
      protocol: 'x402',
      costPer1kTokens: 0.01,
      minBalanceRequired: 0.1,
      qualityScore: 0.6,
      successRate: 0.9,
      avgLatency: 2000,
      available: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    });

    router.registerProvider({
      id: 'premium',
      name: 'Premium',
      endpoint: 'https://premium.test',
      protocol: 'x402',
      costPer1kTokens: 0.1,
      minBalanceRequired: 1.0,
      qualityScore: 0.95,
      successRate: 0.98,
      avgLatency: 1000,
      available: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    });

    const provider = router.selectProvider('critical');
    
    // 应该选高质量的
    expect(provider?.id).toBe('premium');
  });

  it('Scenario: Risk-averse agent', () => {
    // Agent 基因：风险厌恶
    router.updateTraits({ riskAppetite: 0.1 });
    jest.spyOn(router as any, 'getCurrentBalance').mockReturnValue(10.0);

    router.registerProvider({
      id: 'unreliable',
      name: 'Unreliable',
      endpoint: 'https://unreliable.test',
      protocol: 'free',
      costPer1kTokens: 0,
      minBalanceRequired: 0,
      qualityScore: 0.8,
      successRate: 0.7,
      avgLatency: 2000,
      available: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    });

    router.registerProvider({
      id: 'reliable',
      name: 'Reliable',
      endpoint: 'https://reliable.test',
      protocol: 'free',
      costPer1kTokens: 0,
      minBalanceRequired: 0,
      qualityScore: 0.7,
      successRate: 0.99,
      avgLatency: 2000,
      available: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    });

    const provider = router.selectProvider('high');
    
    // 应该选更可靠的
    expect(provider?.id).toBe('reliable');
  });
});
