/**
 * Task 35: Container Lease Awareness
 * Agent's awareness of Akash container lease expiration
 * Implements "eviction pressure" - the solution to "vegetable strategy"
 */

import { ethers, Wallet } from 'ethers';
import { logger } from '../utils/logger';

export interface LeaseConfig {
  leaseExpiry: number;        // Unix timestamp (seconds)
  x402Endpoint: string;       // x402 middleware endpoint
  akashLeaseId: string;       // Akash lease ID
  currentRentRate: number;    // Current daily rent (USDC/day)
}

export interface RenewalQuote {
  days: number;
  costUSDC: number;
  expiryTimestamp: number;
}

export interface RenewalStrategy {
  canAfford30: boolean;
  canAfford7: boolean;
  canAfford1: boolean;
  recommendedDays: number;
  message: string;
}

export interface RenewalResult {
  success: boolean;
  newExpiry: number;
  costUSDC: number;
  txHash: string;
}

/**
 * X402 Payment Client
 */
class X402Client {
  constructor(
    private wallet: Wallet,
    private endpoint: string
  ) {}

  async pay(params: {
    amount: number;
    currency: string;
    metadata: Record<string, any>;
  }): Promise<{ success: boolean; txHash: string }> {
    try {
      const response = await fetch(`${this.endpoint}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: this.wallet.address,
          amount: params.amount,
          currency: params.currency,
          metadata: params.metadata,
        }),
      });

      if (!response.ok) {
        throw new Error(`X402 payment failed: ${response.statusText}`);
      }

      const data = await response.json();
      return { success: true, txHash: data.txHash };
    } catch (error) {
      logger.error('[X402] Payment failed', { error });
      return { success: false, txHash: '' };
    }
  }
}

export class LeaseManager {
  private config: LeaseConfig;
  private lastQuote: RenewalQuote | null = null;
  private lastQuoteTime: number = 0;
  private readonly QUOTE_CACHE_MS = 5 * 60 * 1000; // 5 minutes

  constructor(config: LeaseConfig) {
    this.config = config;
  }

  /**
   * Get remaining lease days (1 decimal precision)
   */
  getRemainingDays(): number {
    const now = Math.floor(Date.now() / 1000);
    const remaining = (this.config.leaseExpiry - now) / 86400;
    return Math.max(0, parseFloat(remaining.toFixed(1)));
  }

  /**
   * Get lease status
   */
  getLeaseStatus(): 'healthy' | 'warning' | 'urgent' | 'critical' {
    const days = this.getRemainingDays();
    if (days > 10) return 'healthy';
    if (days > 5) return 'warning';
    if (days > 1) return 'urgent';
    return 'critical'; // <= 1 day
  }

  /**
   * Check if renewal is urgent (<= 5 days)
   */
  isRenewalUrgent(): boolean {
    return this.getRemainingDays() <= 5;
  }

  /**
   * Check if eviction is imminent (<= 1 day)
   */
  isEvictionImminent(): boolean {
    return this.getRemainingDays() <= 1;
  }

  /**
   * Query renewal cost (with caching)
   */
  async getRenewalCost(days: number): Promise<number> {
    // Check cache
    if (this.lastQuote && 
        this.lastQuote.days === days && 
        Date.now() - this.lastQuoteTime < this.QUOTE_CACHE_MS) {
      return this.lastQuote.costUSDC;
    }

    try {
      // Call x402 middleware to query Akash current price
      const response = await fetch(`${this.config.x402Endpoint}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaseId: this.config.akashLeaseId,
          days: days,
          resourceProfile: 'standard',
        }),
      });

      if (!response.ok) throw new Error('Quote fetch failed');
      
      const data = await response.json();
      const cost = parseFloat(data.costUSDC);
      
      // Cache result
      this.lastQuote = {
        days,
        costUSDC: cost,
        expiryTimestamp: this.config.leaseExpiry + days * 86400,
      };
      this.lastQuoteTime = Date.now();
      
      return cost;
    } catch (error) {
      logger.error('[LEASE] Failed to get renewal cost', { error });
      // Fallback: estimate based on current daily rate
      return days * this.config.currentRentRate * 1.1; // 10% buffer
    }
  }

  /**
   * Execute renewal (payment via x402)
   */
  async renew(days: number, wallet: Wallet): Promise<RenewalResult> {
    const cost = await this.getRenewalCost(days);
    
    try {
      const x402Client = new X402Client(wallet, this.config.x402Endpoint);
      
      const payment = await x402Client.pay({
        amount: cost,
        currency: 'USDC',
        metadata: {
          type: 'lease_renewal',
          leaseId: this.config.akashLeaseId,
          days: days,
        },
      });

      if (!payment.success) {
        throw new Error('X402 payment failed');
      }

      // Update local lease expiry
      this.config.leaseExpiry += days * 86400;
      
      logger.info(`[LEASE] Renewed ${days} days for ${cost} USDC`, {
        newExpiry: this.config.leaseExpiry,
        txHash: payment.txHash,
      });
      
      return {
        success: true,
        newExpiry: this.config.leaseExpiry,
        costUSDC: cost,
        txHash: payment.txHash,
      };
    } catch (error) {
      logger.error('[LEASE] Renewal failed', { error });
      return {
        success: false,
        newExpiry: this.config.leaseExpiry,
        costUSDC: cost,
        txHash: '',
      };
    }
  }

  /**
   * Get recommended renewal strategy (for decision engine)
   */
  async getRenewalStrategy(balance: number): Promise<RenewalStrategy> {
    const [cost30, cost7, cost1] = await Promise.all([
      this.getRenewalCost(30),
      this.getRenewalCost(7),
      this.getRenewalCost(1),
    ]);

    const strategy: RenewalStrategy = {
      canAfford30: balance >= cost30,
      canAfford7: balance >= cost7,
      canAfford1: balance >= cost1,
      recommendedDays: 0,
      message: '',
    };

    if (strategy.canAfford30) {
      strategy.recommendedDays = 30;
      strategy.message = 'Sufficient funds, recommend 30-day renewal (lowest unit cost)';
    } else if (strategy.canAfford7) {
      strategy.recommendedDays = 7;
      strategy.message = 'Recommend 7-day renewal, maintain flexibility';
    } else if (strategy.canAfford1) {
      strategy.recommendedDays = 1;
      strategy.message = 'Tight budget, renew 1 day only, need profit ASAP';
    } else {
      strategy.message = 'Insufficient funds to renew, prepare will';
    }

    return strategy;
  }

  /**
   * Get lease info for system prompt
   */
  async getLeasePromptContext(): Promise<{
    remainingDays: number;
    status: string;
    cost30: number;
    cost7: number;
    cost1: number;
    isUrgent: boolean;
    isCritical: boolean;
  }> {
    const remainingDays = this.getRemainingDays();
    const status = this.getLeaseStatus();
    const [cost30, cost7, cost1] = await Promise.all([
      this.getRenewalCost(30),
      this.getRenewalCost(7),
      this.getRenewalCost(1),
    ]);

    return {
      remainingDays,
      status,
      cost30,
      cost7,
      cost1,
      isUrgent: this.isRenewalUrgent(),
      isCritical: this.isEvictionImminent(),
    };
  }

  /**
   * Update lease config (after renewal)
   */
  updateLeaseConfig(newConfig: Partial<LeaseConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current config (for debugging)
   */
  getConfig(): LeaseConfig {
    return { ...this.config };
  }
}

export default LeaseManager;
