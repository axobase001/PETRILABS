/**
 * Skill Result Processor
 * Processes skill execution results and records earned income (net profit only)
 * Fix: Dividend is only paid on net profit, not gross income
 */

import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import type { SkillResult } from '../types';
import type { WorkingMemory } from '../memory/working-memory';

export interface SkillCostRecord {
  action: string;
  principalCost: number;  // Initial investment/cost
  grossIncome: number;    // Total return
  netProfit: number;      // grossIncome - principalCost
  timestamp: number;
}

export class SkillResultProcessor {
  private skillCosts: Map<string, number> = new Map(); // action -> accumulated principal cost
  private costHistory: SkillCostRecord[] = [];

  constructor(
    private agentContract: ethers.Contract,
    private workingMemory?: WorkingMemory
  ) {}

  /**
   * Record principal cost before skill execution
   * Call this before executing a skill that requires capital
   */
  recordPrincipalCost(action: string, principalCost: number): void {
    const current = this.skillCosts.get(action) || 0;
    this.skillCosts.set(action, current + principalCost);
    
    logger.info('[SKILL] Principal cost recorded', { action, principalCost, accumulated: current + principalCost });
  }

  /**
   * Process skill result and record net profit
   * This is the main entry point after skill execution
   */
  async processResult(action: string, result: SkillResult): Promise<void> {
    if (!result.success) {
      logger.warn('[SKILL] Skill failed, no income to record', { action, error: result.error });
      return;
    }

    // Extract PnL from result
    const grossIncome = result.pnl || 0;
    
    // Get accumulated principal cost for this action
    const principalCost = this.skillCosts.get(action) || 0;
    
    // Calculate net profit
    const netProfit = grossIncome > 0 ? Math.max(0, grossIncome - principalCost) : grossIncome;
    
    // Record in history
    const record: SkillCostRecord = {
      action,
      principalCost,
      grossIncome,
      netProfit,
      timestamp: Date.now(),
    };
    this.costHistory.push(record);
    
    // Clear accumulated cost for this action (it's been accounted for)
    if (grossIncome > 0) {
      this.skillCosts.set(action, 0);
    }

    // Record in working memory for fitness calculation
    if (this.workingMemory) {
      this.workingMemory.recordFinancialResult(action, netProfit, {
        principalCost,
        grossIncome,
        txHash: result.txHash,
      });
    }

    // Only record earned income if there's net profit
    if (netProfit > 0) {
      try {
        // Call contract to record earned income (net profit only)
        const tx = await this.agentContract.recordEarnedIncome(
          ethers.parseUnits(netProfit.toFixed(6), 6)
        );
        await tx.wait();
        
        logger.info('[SKILL] Net profit recorded as earned income', {
          action,
          grossIncome,
          principalCost,
          netProfit,
          txHash: tx.hash,
        });
      } catch (error) {
        logger.error('[SKILL] Failed to record earned income', { error, netProfit });
      }
    } else if (netProfit < 0) {
      logger.info('[SKILL] Skill resulted in loss', {
        action,
        grossIncome,
        principalCost,
        netLoss: netProfit,
      });
    }
  }

  /**
   * Get cost history for analysis
   */
  getCostHistory(action?: string): SkillCostRecord[] {
    if (action) {
      return this.costHistory.filter(r => r.action === action);
    }
    return [...this.costHistory];
  }

  /**
   * Get total net profit across all skills
   */
  getTotalNetProfit(): number {
    return this.costHistory.reduce((sum, r) => sum + r.netProfit, 0);
  }

  /**
   * Get accumulated principal cost for an action
   */
  getAccumulatedCost(action: string): number {
    return this.skillCosts.get(action) || 0;
  }

  /**
   * Clear history (use with caution)
   */
  clearHistory(): void {
    this.costHistory = [];
    this.skillCosts.clear();
  }
}

export default SkillResultProcessor;
