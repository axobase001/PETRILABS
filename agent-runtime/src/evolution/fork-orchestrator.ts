/**
 * Fork Orchestrator
 * P1-4: Runtime 主导的 Agent Fork 流程
 * 
 * 职责：
 * 1. 评估 Fork 条件（资金、适应度、压力等）
 * 2. 执行表观遗传加权变异
 * 3. 提交新基因组到 Registry
 * 4. 调用链上 ReplicationManager 部署子代
 */

import { ethers, Contract } from 'ethers';
import { logger } from '../utils/logger';
import { ExpressionEngine } from '../gene-expression/expression';
import { WorkingMemory } from '../memory/working-memory';
import { mutateGenome, GeneEpigeneticRecord } from './mutation';
import { crossoverGenomes, MergeParticipant } from './crossover';

// 基因组数据结构
export interface Genome {
  genes: number[];
  generation: number;
  parentHash?: string;
  metadata?: Record<string, unknown>;
}

// Fork 上下文
export interface ForkContext {
  parentAgent: string;
  parentGenome: Genome;
  partnerGenome?: Genome; // 可选：有性繁殖（Merge）
  trigger: 'AUTONOMOUS' | 'STRESS' | 'MATING';
  endowment?: number; // 给子代的初始资金
  mode?: 'COMPETITION' | 'LEGACY'; // Fork 模式
}

// Fork 结果
export interface ForkResult {
  success: boolean;
  childAgent?: string;
  childGenomeHash?: string;
  error?: string;
  txHash?: string;
}

// 适应度上下文
interface FitnessContext {
  winRate: number;
  roi: number;
  survivalDays: number;
  stressLevel: number;
}

export class ForkOrchestrator {
  private expressionEngine: ExpressionEngine;
  private workingMemory: WorkingMemory;

  private replicationManager: Contract;
  private genomeRegistry: Contract;
  private wallet: ethers.Wallet;
  private provider: ethers.Provider;

  constructor(config: {
    expressionEngine: ExpressionEngine;
    workingMemory: WorkingMemory;
    replicationManagerAddress: string;
    genomeRegistryAddress: string;
    wallet: ethers.Wallet;
    provider: ethers.Provider;
  }) {
    this.expressionEngine = config.expressionEngine;
    this.workingMemory = config.workingMemory;
    this.wallet = config.wallet;
    this.provider = config.provider;

    // 初始化合约接口
    this.replicationManager = new Contract(
      config.replicationManagerAddress,
      [
        'function autonomousFork(bytes32 childGenomeHash, uint256 endowment, uint8 mode) external returns (address)',
        'function calculateForkCost(uint256 mutationRate, uint256 endowment) external view returns (uint256)',
        'event Forked(address indexed parent, address indexed child, bytes32 indexed childGenomeHash, uint256 totalCost, uint256 parentRemaining, uint256 mutationRate, uint8 mode, uint256 childEndowment)',
      ],
      config.wallet
    );

    this.genomeRegistry = new Contract(
      config.genomeRegistryAddress,
      [
        'function registerGenome(tuple(bytes32 memoryDataHash, string memoryDataURI, bool useRandom, bytes32 preferredGenomeHash) input, tuple(uint16 id, uint8 domain, uint8 origin, uint8 expressionState, uint32 value, uint32 weight, uint16 dominance, uint16 plasticity, uint16 essentiality, uint32 metabolicCost, uint32 duplicateOf, uint16 age)[] genes, tuple(uint8 id, bool isEssential, uint32[] geneIds)[] chromosomes, tuple(uint32 regulator, uint32 target, uint8 edgeType, uint16 strength)[] regulatoryEdges) external returns (bytes32 genomeHash)',
        'function genomeExists(bytes32 genomeHash) external view returns (bool)',
      ],
      config.wallet
    );
  }

  /**
   * 评估是否应该执行 Fork
   */
  shouldFork(balance: number, dailyCost: number, fitness: FitnessContext): {
    shouldFork: boolean;
    reason: string;
  } {
    const survivalDays = dailyCost > 0 ? balance / dailyCost : 0;
    const minSurvivalForFork = 14; // 至少 2 周生存资金

    // 条件 1：资金充裕
    if (survivalDays < minSurvivalForFork) {
      return { shouldFork: false, reason: 'Insufficient balance for fork' };
    }

    // 条件 2：适应度检查
    if (fitness.winRate < 0.3) {
      return { shouldFork: false, reason: 'Win rate too low' };
    }

    // 条件 3：压力触发（Hail Mary 策略）
    if (fitness.stressLevel > 0.8 && survivalDays > 7) {
      return { shouldFork: true, reason: 'High stress - Hail Mary fork' };
    }

    // 条件 4：正常 Fork
    if (fitness.roi > 0 && fitness.winRate > 0.4) {
      return { shouldFork: true, reason: 'Healthy conditions for fork' };
    }

    return { shouldFork: false, reason: 'Conditions not optimal' };
  }

  /**
   * 执行完整 Fork 流程：变异 → 注册 → 链上部署
   */
  async executeFork(context: ForkContext): Promise<ForkResult> {
    logger.info(`🧬 启动 Fork 流程: ${context.trigger}`, {
      parent: context.parentAgent,
      mode: context.mode || 'COMPETITION',
    });

    try {
      // 步骤 1：获取亲代表观遗传档案（关键！）
      const parentEpigenetics = this.getEpigeneticProfile();
      const fitnessContext = this.getFitnessContext();

      // 步骤 2：生成子代基因组（带表观遗传加权变异）
      let childGenome: Genome;

      if (context.partnerGenome) {
        // 有性繁殖（Merge）：交叉 + 变异
        logger.info('🔄 执行有性繁殖（Merge）');
        const crossResult = crossoverGenomes(
          {
            address: context.parentAgent,
            genome: context.parentGenome.genes,
            balance: 0, // 可由 ClawBot 传入实际值
            survivalDays: 0,
            isInitiator: true,
          },
          {
            address: '0x0', // partner address
            genome: context.partnerGenome.genes,
            balance: 0,
            survivalDays: 0,
            isInitiator: false,
          }
        );
        
        // 构建表观遗传档案进行变异
        const epiProfile: GeneEpigeneticRecord[] = crossResult.childGenome.map((_, i) => ({
          geneIndex: i,
          activationCount: parentEpigenetics.expressionHistory.get(i.toString()) || 0,
          impactWeight: 0.5,
          methylation: 0,
          lastActivated: 0,
        }));
        
        const mutatedGenes = mutateGenome(crossResult.childGenome, epiProfile);
        childGenome = {
          genes: mutatedGenes,
          generation: context.parentGenome.generation + 1,
          parentHash: context.parentGenome.parentHash,
        };
      } else {
        // 无性繁殖（Fork）：直接变异
        logger.info('🔄 执行无性繁殖（Fork）');
        
        // 构建表观遗传档案
        const epiProfile: GeneEpigeneticRecord[] = context.parentGenome.genes.map((_, i) => ({
          geneIndex: i,
          activationCount: parentEpigenetics.expressionHistory.get(i.toString()) || 0,
          impactWeight: 0.5,
          methylation: 0,
          lastActivated: 0,
        }));
        
        // 调用函数而非类方法
        const childGenes = mutateGenome(context.parentGenome.genes, epiProfile);
        childGenome = {
          genes: childGenes,
          generation: context.parentGenome.generation + 1,
          parentHash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(context.parentGenome.genes))),
        };
      }

      // 步骤 3：计算子代基因组 Hash
      const genomeData = JSON.stringify(childGenome);
      const genomeHash = ethers.keccak256(ethers.toUtf8Bytes(genomeData));

      logger.info(`🧬 子代基因组 Hash: ${genomeHash}`);

      // 步骤 4：提交到 GenomeRegistry（必须在链上部署前）
      await this.registerGenome(childGenome, genomeHash, context.parentAgent);
      logger.info(`✅ 基因组已注册`);

      // 步骤 5：调用链上 ReplicationManager 部署子代
      const childAgentAddress = await this.deployChildAgent({
        parentAgent: context.parentAgent,
        childGenomeHash: genomeHash,
        endowment: context.endowment || 0,
        mode: context.mode === 'LEGACY' ? 1 : 0,
      });

      logger.info(`🎉 子代 Agent 已部署: ${childAgentAddress}`);

      // 步骤 6：记录到 WorkingMemory（作为后代追踪）
      this.workingMemory.recordOffspring?.(childAgentAddress, genomeHash);

      return {
        success: true,
        childAgent: childAgentAddress,
        childGenomeHash: genomeHash,
      };
    } catch (error: any) {
      logger.error('❌ Fork 执行失败', { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 注册基因组到链上
   */
  private async registerGenome(
    genome: Genome,
    genomeHash: string,
    parentAgent: string
  ): Promise<void> {
    try {
      // 检查是否已注册
      const exists = await this.genomeRegistry.genomeExists(genomeHash);
      if (exists) {
        logger.debug('基因组已存在，跳过注册');
        return;
      }

      // 构建 GenomeInput
      const input = {
        memoryDataHash: ethers.ZeroHash,
        memoryDataURI: '',
        useRandom: false,
        preferredGenomeHash: ethers.ZeroHash,
      };

      // 构建基因数组
      const genes = genome.genes.map((value, index) => ({
        id: index,
        domain: index % 32, // 循环分配到不同域
        origin: 3, // MUTATED
        expressionState: 0, // ACTIVE
        value: value,
        weight: 100000, // 默认权重 1.0
        dominance: 500, // 默认显性度 0.5
        plasticity: 500,
        essentiality: index < 12 ? 800 : 300, // 前12个基因为必需
        metabolicCost: 100,
        duplicateOf: 0,
        age: 0,
      }));

      // 构建染色体（简化为一个染色体）
      const chromosomes = [
        {
          id: 0,
          isEssential: true,
          geneIds: genes.map((g) => g.id),
        },
      ];

      // 空的调控网络
      const regulatoryEdges: any[] = [];

      // 提交注册
      const tx = await this.genomeRegistry.registerGenome(
        input,
        genes,
        chromosomes,
        regulatoryEdges
      );
      await tx.wait();

      logger.info(`✅ 基因组注册成功: ${genomeHash}`);
    } catch (error: any) {
      logger.error('基因组注册失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 部署子代 Agent
   */
  private async deployChildAgent(params: {
    parentAgent: string;
    childGenomeHash: string;
    endowment: number;
    mode: number;
  }): Promise<string> {
    // 转换 endowment 为 USDC 单位（6 位小数）
    const endowmentUSDC = ethers.parseUnits(params.endowment.toString(), 6);

    // 调用合约
    const tx = await this.replicationManager.autonomousFork(
      params.childGenomeHash,
      endowmentUSDC,
      params.mode
    );

    const receipt = await tx.wait();

    // 解析事件获取子代地址
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = this.replicationManager.interface.parseLog(log);
        return parsed?.name === 'Forked';
      } catch {
        return false;
      }
    });

    if (!event) {
      throw new Error('Forked event not found in transaction receipt');
    }

    const parsedEvent = this.replicationManager.interface.parseLog(event);
    return parsedEvent?.args?.child;
  }

  /**
   * 获取表观遗传档案
   */
  private getEpigeneticProfile(): {
    stressLevel: number;
    expressionHistory: Map<string, number>;
    methylation: Map<string, number>;
  } {
    // 从 ExpressionEngine 获取
    const profile = (this.expressionEngine as any).exportEpigeneticProfile?.() || [];
    const expressionHistory = new Map<string, number>();

    for (const record of profile) {
      expressionHistory.set(record.geneIndex.toString(), record.activationCount);
    }

    return {
      stressLevel: this.workingMemory.getStressLevel?.() || 0.5,
      expressionHistory,
      methylation: new Map(),
    };
  }

  /**
   * 获取适应度上下文
   */
  private getFitnessContext(): FitnessContext {
    const financialHistory = this.workingMemory.getFinancialHistory?.() || [];
    const profitableCount = financialHistory.filter((r: any) => r.pnl > 0).length;
    const totalCount = financialHistory.length;
    const winRate = totalCount > 0 ? profitableCount / totalCount : 0;

    const totalPnL = financialHistory.reduce((sum: number, r: any) => sum + r.pnl, 0);
    const roi = totalCount > 0 ? totalPnL / totalCount : 0;

    return {
      winRate,
      roi,
      survivalDays: this.workingMemory.getSurvivalDays?.() || 0,
      stressLevel: this.workingMemory.getStressLevel?.() || 0.5,
    };
  }

  /**
   * 获取高表达基因（use it or lose it 机制）
   */
  private getAmplifiedGenes(epigenetics: {
    expressionHistory: Map<string, number>;
  }): string[] {
    const amplified: string[] = [];
    for (const [geneId, count] of epigenetics.expressionHistory.entries()) {
      if (count > 10) {
        // 表达超过 10 次视为高频
        amplified.push(geneId);
      }
    }
    return amplified;
  }
}

export default ForkOrchestrator;
