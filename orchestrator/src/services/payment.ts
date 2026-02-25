/**
 * Payment Service
 * Handles cost estimation and x402 payment preparation
 */

import { logger } from '../utils/logger';

export interface DeploymentCosts {
  // Pre-deployment costs (paid by user)
  llmAnalysis: number;        // LLM genome generation
  arweaveStorage: number;     // Memory + genome storage
  akashDeposit: number;       // Container deposit (30 days)
  platformFee: number;        // Platform service fee
  
  // Total upfront cost
  totalUpfront: number;
  
  // Daily runtime costs (paid by agent)
  dailyLlmCost: number;       // Estimated LLM calls per day
  dailyAkashCost: number;     // Container rental
  dailyArweaveCost: number;   // Data storage
  dailyTotal: number;
  
  // Runway with initial deposit
  estimatedRunwayDays: number;
}

export interface CostBreakdown {
  label: string;
  amount: number;
  description: string;
  isRequired: boolean;
}

export class PaymentService {
  // Cost constants (in USD)
  private readonly COSTS = {
    LLM_ANALYSIS_BASE: 2.0,           // Base cost for genome analysis
    LLM_ANALYSIS_PER_1K_CHARS: 0.01,  // Per 1000 characters
    ARWEAVE_PER_MB: 0.5,              // Arweave storage per MB
    AKASH_PER_DAY: 1.5,               // Akash container per day
    ARWEAVE_DAILY_STORAGE: 0.1,       // Daily Arweave writes
    LLM_PER_CALL: 0.15,               // Per LLM inference call
    PLATFORM_FEE: 5.0,                // Fixed platform fee
    MIN_DEPOSIT_DAYS: 30,             // Minimum days of runway
  };

  /**
   * Calculate deployment costs
   */
  calculateDeploymentCosts(
    memoryFileSize: number,      // bytes
    memoryContentLength: number, // characters
    requestedRunwayDays: number = 30
  ): DeploymentCosts {
    // LLM Analysis cost
    const llmAnalysis = this.COSTS.LLM_ANALYSIS_BASE + 
      (memoryContentLength / 1000) * this.COSTS.LLM_ANALYSIS_PER_1K_CHARS;

    // Arweave storage (memory + genome ~500KB)
    const arweaveStorage = this.COSTS.ARWEAVE_PER_MB * Math.max(0.5, memoryFileSize / 1024 / 1024);

    // Akash deposit (30 days minimum)
    const akashDeposit = this.COSTS.AKASH_PER_DAY * Math.max(
      this.COSTS.MIN_DEPOSIT_DAYS,
      requestedRunwayDays
    );

    // Platform fee
    const platformFee = this.COSTS.PLATFORM_FEE;

    // Total upfront
    const totalUpfront = llmAnalysis + arweaveStorage + akashDeposit + platformFee;

    // Daily costs (runtime)
    const dailyLlmCost = this.COSTS.LLM_PER_CALL * 10; // ~10 calls per day
    const dailyAkashCost = this.COSTS.AKASH_PER_DAY;
    const dailyArweaveCost = this.COSTS.ARWEAVE_DAILY_STORAGE;
    const dailyTotal = dailyLlmCost + dailyAkashCost + dailyArweaveCost;

    // Estimated runway
    const estimatedRunwayDays = akashDeposit / dailyAkashCost;

    return {
      llmAnalysis,
      arweaveStorage,
      akashDeposit,
      platformFee,
      totalUpfront,
      dailyLlmCost,
      dailyAkashCost,
      dailyArweaveCost,
      dailyTotal,
      estimatedRunwayDays,
    };
  }

  /**
   * Get cost breakdown for display
   */
  getCostBreakdown(costs: DeploymentCosts): CostBreakdown[] {
    return [
      {
        label: 'Genome Analysis (LLM)',
        amount: costs.llmAnalysis,
        description: 'One-time cost for AI personality analysis',
        isRequired: true,
      },
      {
        label: 'Permanent Storage (Arweave)',
        amount: costs.arweaveStorage,
        description: 'Permanent storage of memory and genome',
        isRequired: true,
      },
      {
        label: 'Container Deposit (Akash)',
        amount: costs.akashDeposit,
        description: `Pre-paid ${Math.round(costs.estimatedRunwayDays)} days of container rental`,
        isRequired: true,
      },
      {
        label: 'Platform Fee',
        amount: costs.platformFee,
        description: 'One-time platform service fee',
        isRequired: true,
      },
    ];
  }

  /**
   * Calculate runtime costs for a specific action
   */
  calculateActionCost(action: 'heartbeat' | 'decision' | 'skill'): number {
    switch (action) {
      case 'heartbeat':
        return this.COSTS.ARWEAVE_DAILY_STORAGE / 4; // 4 heartbeats per day
      case 'decision':
        return this.COSTS.LLM_PER_CALL;
      case 'skill':
        return this.COSTS.LLM_PER_CALL * 0.5; // Skills use less LLM
      default:
        return 0;
    }
  }

  /**
   * Estimate remaining runway
   */
  estimateRunway(currentBalance: number, dailyCost: number): number {
    if (dailyCost <= 0) return Infinity;
    return currentBalance / dailyCost;
  }

  /**
   * Check if balance is critical
   */
  isBalanceCritical(balance: number, dailyCost: number): boolean {
    const runway = this.estimateRunway(balance, dailyCost);
    return runway < 7; // Less than 7 days
  }

  /**
   * Format cost for display
   */
  formatCost(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }
}

export default PaymentService;
