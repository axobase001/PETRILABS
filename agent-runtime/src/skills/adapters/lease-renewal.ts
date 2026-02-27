/**
 * Task 35: Lease Renewal Skill Adapter
 * Skill for renewing Akash container lease
 */

import { ethers, Wallet } from 'ethers';
import { LeaseManager } from '../../infrastructure/lease-manager';
import type { SkillAdapter, SkillResult, AgentState } from '../../types';

export interface LeaseRenewalParams {
  days: number;  // Days to renew (1, 7, or 30)
}

export class LeaseRenewalAdapter implements SkillAdapter {
  id = 'renew_lease';
  name = 'Container Lease Renewal';
  riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  
  // Minimum 0.5 USDC needed (enough for 1-2 days)
  requiredBalance = 0.5;

  constructor(private leaseManager: LeaseManager) {}

  canExecute(state: AgentState): boolean {
    return parseFloat(state.balance) >= this.requiredBalance;
  }

  async execute(params: LeaseRenewalParams, wallet: Wallet): Promise<SkillResult> {
    const result = await this.leaseManager.renew(params.days, wallet);
    
    return {
      success: result.success,
      data: {
        days: params.days,
        cost: result.costUSDC,
        newExpiry: result.newExpiry,
      },
      pnl: -result.costUSDC, // Renewal is expense, negative PnL
      txHash: result.txHash,
      message: result.success 
        ? `Lease renewed for ${params.days} days` 
        : 'Lease renewal failed',
    };
  }

  async estimateCost(params: LeaseRenewalParams): Promise<number> {
    return await this.leaseManager.getRenewalCost(params.days);
  }

  /**
   * Get optimal renewal days based on balance and gene traits
   */
  async getOptimalRenewalDays(
    balance: number,
    traits: { savingsTendency: number; riskAppetite: number }
  ): Promise<number> {
    const strategy = await this.leaseManager.getRenewalStrategy(balance);
    
    if (!strategy.canAfford1) return 0; // Cannot afford any renewal
    
    // Gene-driven decision:
    // High savingsTendency → prefer longer renewal (security)
    // High riskAppetite → may prefer shorter renewal (flexibility)
    
    if (strategy.canAfford30 && traits.savingsTendency > 0.7) {
      return 30; // Conservative: lock in long-term
    }
    
    if (strategy.canAfford7) {
      if (traits.riskAppetite > 0.7 && strategy.canAfford30) {
        // Risk-taker with funds: might want short renewal to keep funds for trading
        return 7;
      }
      return 7; // Balanced default
    }
    
    return 1; // Minimum survival
  }
}

export default LeaseRenewalAdapter;
