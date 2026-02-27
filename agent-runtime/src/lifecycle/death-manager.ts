/**
 * DeathManager
 * Agent 死亡闭环管理器
 * 
 * 职责：
 * 1. 管理 ALIVE → DYING → DEAD 状态机
 * 2. 协调临终数据收集
 * 3. 调用墓碑写入
 * 4. 执行优雅关停
 */

import fs from 'fs';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { 
  AgentLifecycleState, 
  DeathData, 
  TOMBSTONE_COSTS 
} from '../types';
import type LifecycleTracker from './tracker';
import type CognitionLedger from '../cognition/ledger';
import type GeneLogger from '../gene-expression/logger';
import type { GeneExpressionEngine } from '../gene-expression';
import type { WorkingMemory } from '../memory/working-memory';
import type { MetabolismTracker } from '../metabolism/tracker';

// Task 31: Fitness Metrics Interface
export interface FitnessMetrics {
  /** 1. 存活效率：每一块钱启动资金换了几天命 */
  survivalEfficiency: number;  // = survivalDays / initialDeposit
  
  /** 2. 资本增值率：巅峰余额相对初始资金的增幅 */
  capitalGrowthRate: number;   // = (peakBalance - initialDeposit) / initialDeposit
  
  /** 3. 独立生存度：多大程度上靠自己活着 */
  independenceScore: number;   // = 1 - (initialDeposit + externalFunding) / totalIncome
  
  /** 4. 决策质量：涉及资金的决策中盈利的比例 */
  decisionQuality: number;     // = profitableDecisions / totalFinancialDecisions
  
  /** 5. 认知效率：每花一分钱思考做了几个决策 */
  cognitiveEfficiency: number; // = totalDecisions / totalCognitionCostUSDC
}

export interface DeathManagerConfig {
  agentId: string;
  wallet: ethers.Wallet;
  provider: ethers.Provider;
  lifecycleTracker: LifecycleTracker;
  cognitionLedger?: CognitionLedger;
  geneLogger?: GeneLogger;
  geneExpressionEngine?: GeneExpressionEngine;
  workingMemory?: WorkingMemory;          // Task 31
  metabolismTracker?: MetabolismTracker;  // Task 31
  initialDeposit?: number;                // Task 31
  externalFunding?: number;               // Task 31
  onShutdown?: () => void;
}

export interface DeathCheckResult {
  shouldDie: boolean;
  reason?: string;
  remainingBalance: number;
  requiredBalance: number;
}

export class DeathManager {
  private state: AgentLifecycleState = AgentLifecycleState.ALIVE;
  private config: DeathManagerConfig;
  private pendingOperations: Set<string> = new Set();
  private deathCause?: string;
  private deathData?: DeathData;
  
  // 运行时数据
  private lastBalance: number = 0;
  private metabolicCount: number = 0;
  private lastAction: string = 'none';
  private lastDecision: string = 'none';
  private lastCognitionTier: 'free' | 'paid' = 'free';

  constructor(config: DeathManagerConfig) {
    this.config = config;
    
    // 检查死亡标记（防止容器重启后复活）
    if (this.checkDeathMarker()) {
      logger.warn('[BOOT] Death marker found. Agent is dead. Exiting.');
      this.state = AgentLifecycleState.DEAD;
      process.exit(0);
    }
    
    logger.info('DeathManager initialized', { agentId: config.agentId });
  }

  /**
   * 获取当前生命周期状态
   */
  getState(): AgentLifecycleState {
    return this.state;
  }

  /**
   * 检查是否应该死亡
   * 在每次代谢心跳中调用
   */
  async checkDeathCondition(
    balance: number,
    metabolicCostPerHeartbeat: number
  ): Promise<DeathCheckResult> {
    this.lastBalance = balance;
    
    // 计算最低生存余额（1次心跳成本 + 墓碑写入成本）
    const requiredBalance = metabolicCostPerHeartbeat + TOMBSTONE_COSTS.total;
    
    const result: DeathCheckResult = {
      shouldDie: balance < requiredBalance,
      reason: balance < requiredBalance ? 'STARVATION' : undefined,
      remainingBalance: balance,
      requiredBalance,
    };
    
    if (result.shouldDie && this.state === AgentLifecycleState.ALIVE) {
      logger.warn('[DEATH] Minimum viable balance breached', {
        balance,
        requiredBalance,
        deficit: requiredBalance - balance,
      });
    }
    
    return result;
  }

  /**
   * 进入临终状态（ALIVE → DYING）
   * 这是死亡流程的起点
   */
  async enterDyingState(cause: string): Promise<void> {
    // 原子操作：防止重复触发
    if (this.state !== AgentLifecycleState.ALIVE) {
      logger.warn('[DEATH] Already in non-alive state', { state: this.state });
      return;
    }
    
    this.state = AgentLifecycleState.DYING;
    this.deathCause = cause;
    
    logger.warn('[DEATH] Entering DYING state', {
      cause,
      agentId: this.config.agentId,
      balance: this.lastBalance,
    });
    
    // 注意：实际停止认知/感知循环的操作由 ClawBot 执行
    // DeathManager 只负责状态管理
  }

  /**
   * 注册待处理操作
   * 用于等待操作完成
   */
  registerOperation(id: string): void {
    this.pendingOperations.add(id);
  }

  /**
   * 标记操作完成
   */
  completeOperation(id: string): void {
    this.pendingOperations.delete(id);
  }

  /**
   * 等待所有待处理操作完成
   */
  async waitForPendingOperations(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (this.pendingOperations.size > 0) {
      if (Date.now() - startTime > timeoutMs) {
        logger.warn('[DEATH] Timeout waiting for pending operations', {
          remaining: Array.from(this.pendingOperations),
        });
        break;
      }
      
      logger.info('[DEATH] Waiting for operations', {
        count: this.pendingOperations.size,
        operations: Array.from(this.pendingOperations),
      });
      
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  /**
   * Task 31: Calculate fitness metrics
   */
  calculateFitnessMetrics(): FitnessMetrics {
    const lifecycle = this.config.lifecycleTracker.getStats();
    const workingMemory = this.config.workingMemory;
    const metabolismTracker = this.config.metabolismTracker;
    
    // Basic data
    const survivalDays = (Date.now() - lifecycle.birthTimestamp) / (1000 * 86400);
    const initialDeposit = this.config.initialDeposit || lifecycle.initialBalance || 0;
    const peakBalance = workingMemory?.getPeakBalance() || lifecycle.peakBalance || initialDeposit;
    const externalFunding = this.config.externalFunding || 0;
    const totalEarned = lifecycle.totalIncome || 0;
    const totalIncome = initialDeposit + externalFunding + totalEarned;
    
    // 1. Survival Efficiency: days per USDC of initial deposit
    const survivalEfficiency = initialDeposit > 0 ? survivalDays / initialDeposit : 0;
    
    // 2. Capital Growth Rate: peak vs initial
    const capitalGrowthRate = initialDeposit > 0 ? (peakBalance - initialDeposit) / initialDeposit : 0;
    
    // 3. Independence Score: 0 = fully dependent, 1 = fully self-sufficient
    // Formula: 1 - (initial + external) / totalIncome
    const independenceScore = totalIncome > 0 ? 1 - ((initialDeposit + externalFunding) / totalIncome) : 0;
    
    // 4. Decision Quality: profitable decisions / total financial decisions
    const profitableCount = workingMemory?.getProfitableDecisionsCount() || 0;
    const totalFinancialCount = workingMemory?.getTotalFinancialDecisionsCount() || 0;
    const decisionQuality = totalFinancialCount > 0 ? profitableCount / totalFinancialCount : 0;
    
    // 5. Cognitive Efficiency: decisions per USDC spent on cognition
    const totalDecisions = workingMemory?.getTotalDecisions() || lifecycle.totalHeartbeats || 0;
    const totalCognitionCost = metabolismTracker?.getTotalCognitionCost() || 0;
    // If using free Pollinations, cost could be 0 - handle Infinity case
    const cognitiveEfficiency = totalCognitionCost > 0 
      ? totalDecisions / totalCognitionCost 
      : (totalDecisions > 0 ? Infinity : 0);
    
    const metrics: FitnessMetrics = {
      survivalEfficiency,
      capitalGrowthRate,
      independenceScore,
      decisionQuality,
      cognitiveEfficiency,
    };
    
    logger.info('[FITNESS] Metrics calculated', metrics);
    return metrics;
  }

  /**
   * 收集临终数据
   */
  async collectDeathData(): Promise<DeathData> {
    logger.info('[DEATH] Collecting death data...');
    
    const lifecycle = this.config.lifecycleTracker.getStats();
    const cognition = this.config.cognitionLedger?.getSummary();
    const overrides = this.config.geneLogger?.getSummary();
    
    // Task 31: Calculate fitness metrics
    const fitnessMetrics = this.calculateFitnessMetrics();
    
    // 获取当前区块号
    const deathBlock = await this.config.provider.getBlockNumber();
    
    // 计算 wall clock 年龄
    const wallClockAge = Math.floor((Date.now() - lifecycle.birthTimestamp) / 1000);
    
    this.deathData = {
      // 身份
      agentId: this.config.agentId,
      genomeHash: '', // 从配置或链上获取
      birthType: 'GENESIS', // 从配置获取
      parentIds: lifecycle.childIds.filter(() => false), // 实际是父代，需要修复
      
      // 经济
      initialBalance: lifecycle.initialBalance,
      peakBalance: lifecycle.peakBalance,
      finalBalance: this.lastBalance,
      totalIncome: lifecycle.totalIncome,
      totalExpense: lifecycle.totalExpense,
      totalCognitionCost: cognition?.totalCost || 0,
      
      // 时间
      birthBlock: 0, // 从链上获取
      deathBlock,
      metabolicAge: lifecycle.totalHeartbeats,
      wallClockAge,
      
      // 基因
      genome: {},
      epigeneticMarks: {},
      geneOverrideSummary: {
        totalOverrides: overrides?.totalOverrides || 0,
        dominantTrait: overrides?.dominantTrait || 'none',
        dominantTraitCount: 0,
        traitBreakdown: overrides?.traitBreakdown || {},
        avgDissonance: overrides?.avgDissonance || 0,
        peakDissonance: overrides?.peakDissonance || 0,
      },
      
      // 认知
      cognitionSummary: {
        totalThinkCycles: cognition?.totalCycles || 0,
        freeCount: cognition?.freeCount || 0,
        paidCount: cognition?.paidCount || 0,
        avgCostPerThink: cognition?.avgCostPerThink || 0,
        lastCognitionTier: this.lastCognitionTier,
      },
      
      // Task 31: Fitness metrics
      fitnessMetrics,
      
      // Task 34: Epigenetic profile (placeholder, will be filled later)
      epigeneticProfile: this.config.geneExpressionEngine?.exportEpigeneticProfile(),
      
      // 死亡上下文
      deathCause: (this.deathCause as any) || 'UNKNOWN',
      lastAction: this.lastAction,
      lastDecision: this.lastDecision,
      
      // 后代
      forkCount: lifecycle.forkCount,
      mergeCount: lifecycle.mergeCount,
      childIds: lifecycle.childIds,
      
      // 元数据
      timestamp: Date.now(),
      tombstoneVersion: '1.1', // Updated for Task 31
    };
    
    logger.info('[DEATH] Death data collected', {
      metabolicAge: this.deathData.metabolicAge,
      finalBalance: this.deathData.finalBalance,
      totalIncome: this.deathData.totalIncome,
      totalExpense: this.deathData.totalExpense,
      fitnessMetrics: this.deathData.fitnessMetrics,
    });
    
    return this.deathData;
  }

  /**
   * 写入墓碑
   * 调用 GeneLogger.finalArchive
   */
  async writeTombstone(deathData: DeathData): Promise<{ arweaveTxId: string }> {
    logger.info('[DEATH] Writing tombstone...');
    
    if (!this.config.geneLogger) {
      throw new Error('GeneLogger not configured');
    }
    
    const arweaveTxId = await this.config.geneLogger.finalArchive({
      balance: deathData.finalBalance,
      age: deathData.metabolicAge,
      lastAction: deathData.lastAction,
      lastCognitionTier: deathData.cognitionSummary.lastCognitionTier,
      cause: deathData.deathCause,
    });
    
    logger.info('[DEATH] Tombstone written', { arweaveTxId });
    
    return { arweaveTxId };
  }

  /**
   * 进入死亡状态（DYING → DEAD）
   */
  async enterDeadState(): Promise<void> {
    if (this.state !== AgentLifecycleState.DYING) {
      logger.warn('[DEATH] Cannot enter DEAD from non-DYING state', { state: this.state });
      return;
    }
    
    this.state = AgentLifecycleState.DEAD;
    
    logger.warn('[DEATH] Entered DEAD state', {
      agentId: this.config.agentId,
      cause: this.deathCause,
    });
  }

  /**
   * 优雅关停
   */
  async gracefulShutdown(tombstoneResult: { arweaveTxId: string }): Promise<void> {
    logger.info('[DEATH] Starting graceful shutdown...');
    
    // 1. 持久化生命周期数据
    this.config.lifecycleTracker.persist();
    
    // 2. 关闭数据库连接
    this.config.lifecycleTracker.close();
    this.config.cognitionLedger?.close();
    
    // 3. 写死亡标记（防止容器重启后复活）
    this.writeDeathMarker(tombstoneResult);
    
    // 4. 写最终日志
    const finalLog = {
      event: 'AGENT_DEATH',
      agentId: this.config.agentId,
      cause: this.deathCause,
      age: this.deathData?.metabolicAge || 0,
      tombstone: tombstoneResult.arweaveTxId,
      timestamp: new Date().toISOString(),
    };
    
    console.log(JSON.stringify(finalLog));
    logger.info('[DEATH] Final log written', finalLog);
    
    // 5. 调用外部回调
    this.config.onShutdown?.();
    
    // 6. 退出进程
    logger.info('[DEATH] Exiting process...');
    process.exit(0);
  }

  /**
   * 更新运行时数据（由 ClawBot 调用）
   */
  updateRuntimeData(data: {
    lastAction?: string;
    lastDecision?: string;
    lastCognitionTier?: 'free' | 'paid';
    metabolicCount?: number;
  }): void {
    if (data.lastAction) this.lastAction = data.lastAction;
    if (data.lastDecision) this.lastDecision = data.lastDecision;
    if (data.lastCognitionTier) this.lastCognitionTier = data.lastCognitionTier;
    if (data.metabolicCount !== undefined) this.metabolicCount = data.metabolicCount;
  }

  /**
   * 检查死亡标记文件
   */
  private checkDeathMarker(): boolean {
    const markerPath = '/data/.dead';
    try {
      return fs.existsSync(markerPath);
    } catch {
      return false;
    }
  }

  /**
   * 写入死亡标记文件
   */
  private writeDeathMarker(tombstoneResult: { arweaveTxId: string }): void {
    const markerPath = '/data/.dead';
    try {
      fs.writeFileSync(markerPath, JSON.stringify({
        agentId: this.config.agentId,
        tombstone: tombstoneResult.arweaveTxId,
        deathTime: new Date().toISOString(),
        cause: this.deathCause,
      }));
      logger.info('[DEATH] Death marker written');
    } catch (error) {
      logger.error('[DEATH] Failed to write death marker', { error });
    }
  }
}

export default DeathManager;
