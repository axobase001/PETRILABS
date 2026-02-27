/**
 * ClawBot - Core Agent Runtime
 * Autonomous AI agent with genome-driven behavior
 */

import OpenAI from 'openai';
import { Contract, ethers } from 'ethers';
import { logger } from '../utils/logger';
import { ExpressionEngine } from '../gene-expression/expression';
import SkillRegistry from '../skills/registry';
import { IntegratedDecisionEngine } from '../decision/decision-engine';
import HeartbeatService from '../chain/heartbeat';
import { NkmcGateway } from '../gateways/nkmc';
import { CapabilityRouter } from '../routers/capability';
import MetabolismTracker from '../metabolism/tracker';
import { CognitionRouter, GeneRouter } from '../cognition';
import { GeneExpressionEngine, GeneLogger } from '../gene-expression';
import { 
  AgentConfig, 
  AgentState, 
  Skill, 
  Decision, 
  SkillContext,
  GeneDomain,
  MemoryEvent,
  Gene,
  AgentLifecycleState,
} from '../types';
import LifecycleTracker from '../lifecycle/tracker';
import CognitionLedger from '../cognition/ledger';
import DeathManager from '../lifecycle/death-manager';
import { LeaseManager } from '../infrastructure/lease-manager';
import { LeaseRenewalAdapter } from '../skills/adapters/lease-renewal';
import { WorkingMemory } from '../memory/working-memory';
import { AutoEpigeneticService } from '../auto-epigenetics';
import { ForkOrchestrator } from '../evolution/fork-orchestrator';

export class ClawBot {
  private config: AgentConfig;
  private expressionEngine: ExpressionEngine;
  private skillRegistry: SkillRegistry;
  private decisionEngine: IntegratedDecisionEngine;
  private heartbeatService: HeartbeatService;
  private llm: OpenAI;
  private provider: ethers.JsonRpcProvider;
  private genomeRegistry: Contract;
  
  // nkmc 网关组件（新增）
  private nkmcGateway?: NkmcGateway;
  private capabilityRouter?: CapabilityRouter;
  private metabolismTracker: MetabolismTracker;
  
  // 双模态认知路由器（新增）
  private cognitionRouter?: CognitionRouter;
  
  // 基因表达引擎（新增）
  private geneExpressionEngine: GeneExpressionEngine;
  private geneLogger?: GeneLogger;
  private runtimeParams?: import('../types').RuntimeParams;
  
  // 死亡闭环组件（新增）
  private lifecycleTracker: LifecycleTracker;
  private cognitionLedger: CognitionLedger;
  private deathManager: DeathManager;
  
  // Task 35: 租赁管理
  private leaseManager?: LeaseManager;
  
  // Task 31: 工作记忆与代谢追踪
  private workingMemory?: WorkingMemory;
  
  // Task 36: 自动表观遗传服务
  private autoEpigenetics?: AutoEpigeneticService;
  
  // P1-4: Fork 协调器
  private forkOrchestrator?: ForkOrchestrator;
  
  private isRunning = false;
  private decisionInterval?: NodeJS.Timeout;
  private lastDecisionTime = 0;
  private loadedGenes: Gene[] = [];
  private metabolicCount: number = 0;
  private lastCognitionTier: 'free' | 'paid' = 'free';
  private decisionCount: number = 0; // P1-4: 决策计数器用于 Fork 评估

  constructor(config: AgentConfig) {
    this.config = config;
    
    // Initialize LLM
    this.llm = new OpenAI({
      apiKey: config.llm.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });

    // Initialize blockchain connection
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    // Initialize metabolism tracker（复用现有 C-经济染色体系统）
    this.metabolismTracker = new MetabolismTracker();
    
    // Initialize death loop components（新增：死亡闭环）
    this.lifecycleTracker = new LifecycleTracker({
      agentId: config.agentAddress,
      dbPath: '/app/data/lifecycle.db',
      initialBalance: 0, // 启动后从链上获取
      birthTimestamp: Date.now(),
    });
    
    this.cognitionLedger = new CognitionLedger({
      agentId: config.agentAddress,
      dbPath: '/app/data/cognition.db',
    });
    
    this.deathManager = new DeathManager({
      agentId: config.agentAddress,
      wallet: new ethers.Wallet(config.privateKey, this.provider),
      provider: this.provider,
      lifecycleTracker: this.lifecycleTracker,
      cognitionLedger: this.cognitionLedger,
      geneLogger: undefined, // 将在初始化后设置
    });
    
    // Initialize components
    // P2-1 Fix: 使用默认基因组初始化，稍后从链上加载实际基因
    const defaultGenome = new Array(63).fill(50000); // 63 genes, default value 50000
    this.expressionEngine = new ExpressionEngine(defaultGenome);
    this.skillRegistry = new SkillRegistry(this.buildSkillContext());
    this.heartbeatService = new HeartbeatService(
      config.rpcUrl,
      config.privateKey,
      config.agentAddress,
      config.intervals.heartbeat
    );

    // Initialize nkmc gateway if JWT provided（新增）
    if (config.nkmc?.jwt) {
      this.nkmcGateway = new NkmcGateway({
        jwt: config.nkmc.jwt,
        baseUrl: config.nkmc.baseUrl,
      });
      
      this.capabilityRouter = new CapabilityRouter({
        gateway: this.nkmcGateway,
        dbPath: config.nkmc.cachePath,
      });
      
      logger.info('nkmc gateway initialized');
    }
    
    // Initialize dual-mode cognition router（新增：双模态认知）
    this.cognitionRouter = new CognitionRouter({
      wallet: new ethers.Wallet(config.privateKey, this.provider),
      metabolism: this.metabolismTracker,
      genome: {
        triggerStressResponse: async (type: string, context: unknown) => {
          await this.triggerStressResponse(type, context);
        },
      },
    });
    
    // P2-2 Fix: 创建 GeneRouter 供 IntegratedDecisionEngine 使用
    const geneRouter = new GeneRouter({
      wallet: new ethers.Wallet(config.privateKey, this.provider),
      traits: {
        reasoningDepth: 0.7,
        creativity: 0.5,
        analytical: 0.8,
        adaptability: 0.6,
      },
    });
    
    // P2-2 Fix: 使用 IntegratedDecisionEngine 替代基础 DecisionEngine
    this.decisionEngine = new IntegratedDecisionEngine({
      apiKey: config.llm.apiKey,
      model: config.llm.model,
      router: geneRouter,
      onInstinctStateChange: (active) => {
        logger.info(`Instinct mode ${active ? 'activated' : 'deactivated'}`);
      },
    });
    
    logger.info('Dual-mode cognition router initialized (Pollinations + x402)');
    
    // Initialize gene expression engine（新增：基因表达）
    this.geneExpressionEngine = new GeneExpressionEngine();
    
    // Initialize gene logger if configured（新增：基因日志）
    if (config.geneLog?.enabled) {
      this.geneLogger = new GeneLogger({
        agentId: config.agentAddress,
        dbPath: config.geneLog.dbPath,
        arweave: config.geneLog.arweave,
        geneLogContract: config.geneLog.contract,
      });
      
      logger.info('GeneLogger initialized');
    }

    // Task 35: 初始化 LeaseManager
    if (config.lease) {
      this.leaseManager = new LeaseManager({
        leaseExpiry: config.lease.expiry,
        x402Endpoint: config.lease.x402Endpoint,
        akashLeaseId: config.lease.akashLeaseId,
        currentRentRate: config.lease.dailyRate,
      });
      
      // 注册租赁续期技能
      this.skillRegistry.register(new LeaseRenewalAdapter(this.leaseManager));
      
      logger.info('LeaseManager initialized', {
        expiry: config.lease.expiry,
        dailyRate: config.lease.dailyRate,
      });
    }

    // Task 31: 初始化 WorkingMemory
    this.workingMemory = new WorkingMemory({
      maxSize: 100,
      balanceWindowHours: 24,
    });
    
    if (config.initialDeposit) {
      this.workingMemory.setInitialDeposit(config.initialDeposit);
    }
    
    // 更新 DeathManager，注入 WorkingMemory 和 MetabolismTracker
    this.deathManager = new DeathManager({
      agentId: config.agentAddress,
      wallet: new ethers.Wallet(config.privateKey, this.provider),
      provider: this.provider,
      lifecycleTracker: this.lifecycleTracker,
      cognitionLedger: this.cognitionLedger,
      geneLogger: this.geneLogger,
      workingMemory: this.workingMemory,
      metabolismTracker: this.metabolismTracker,
      initialDeposit: config.initialDeposit || 0,
      onShutdown: () => this.gracefulShutdown(),
    });
    
    // Task 36: 初始化 AutoEpigeneticService
    this.autoEpigenetics = new AutoEpigeneticService(
      config.agentAddress,
      this.geneExpressionEngine,
      this.metabolismTracker,
      new ethers.Wallet(config.privateKey, this.provider),
      this.provider
    );
    
    logger.info('AutoEpigeneticService initialized');
    
    // P1-4: 初始化 ForkOrchestrator
    if (config.contracts?.replicationManager && config.contracts?.genomeRegistry) {
      this.forkOrchestrator = new ForkOrchestrator({
        expressionEngine: this.expressionEngine,
        workingMemory: this.workingMemory,
        replicationManagerAddress: config.contracts.replicationManager,
        genomeRegistryAddress: config.contracts.genomeRegistry,
        wallet: new ethers.Wallet(config.privateKey, this.provider),
        provider: this.provider,
      });
      logger.info('ForkOrchestrator initialized');
    }

    // Genome registry contract
    const GENOME_REGISTRY_ABI = [
      'function getGenesByDomain(bytes32 genomeHash, uint8 domain) external view returns (tuple(uint16 id, uint8 domain, uint8 origin, uint8 expressionState, uint32 value, uint32 weight, uint16 dominance, uint16 plasticity, uint16 essentiality, uint32 metabolicCost, uint32 duplicateOf, uint16 age)[])',
      'function expressGene(bytes32 genomeHash, uint32 geneId) external view returns (uint256)',
    ];
    
    this.genomeRegistry = new Contract(
      config.contracts.genomeRegistry,
      GENOME_REGISTRY_ABI,
      this.provider
    );
  }

  /**
   * Initialize and start the agent
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Agent already running');
      return;
    }

    logger.info('🤖 ClawBot starting...', {
      address: this.config.agentAddress,
      genome: this.config.genomeHash,
    });

    // Load genes from chain
    await this.loadGenes();

    // Initialize all registered skills
    await this.skillRegistry.initializeAll();

    // Start heartbeat
    this.heartbeatService.start(async (data) => {
      // Prepare heartbeat data
      await this.prepareHeartbeat(data);
    });

    // Start decision loop
    this.startDecisionLoop();

    this.isRunning = true;
    logger.info('✅ ClawBot is alive and running');
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('Stopping ClawBot...');

    this.isRunning = false;
    
    this.heartbeatService.stop();
    
    if (this.decisionInterval) {
      clearInterval(this.decisionInterval);
      this.decisionInterval = undefined;
    }

    await this.skillRegistry.shutdownAll();
    
    // 关闭 nkmc 组件（新增）
    this.nkmcGateway?.stop();
    this.capabilityRouter?.close();
    
    // 关闭死亡闭环组件（新增）
    this.lifecycleTracker.close();
    this.cognitionLedger.close();

    logger.info('ClawBot stopped');
  }

  /**
   * Execute a gene expression
   * D-染色体基因通过 nkmc 路由执行（新增）
   */
  async executeGene(gene: Gene, params?: unknown): Promise<{
    success: boolean;
    data?: unknown;
    cost: number;
    error?: string;
  }> {
    // D-染色体（互联网技能）通过 nkmc 网关执行
    if (gene.domain === GeneDomain.API_UTILIZATION || 
        gene.domain === GeneDomain.WEB_NAVIGATION) {
      if (!this.capabilityRouter) {
        return {
          success: false,
          cost: 0,
          error: 'nkmc gateway not initialized',
        };
      }
      
      const result = await this.capabilityRouter.route(gene, params);
      
      // 记录 API 调用成本到代谢系统
      if (result.success) {
        this.metabolismTracker.recordApiCall(
          result.cost,
          'nkmc',
          gene.id.toString()
        );
      } else if (result.error?.includes('exceeds metabolic budget')) {
        // 触发压力响应 - 通过表达 G-染色体压力基因
        await this.triggerStressResponse('metabolic_exceed', {
          geneId: gene.id,
          error: result.error,
        });
      }
      
      return result;
    }
    
    // 其他染色体使用标准执行
    return this.standardExecution(gene, params);
  }

  /**
   * 标准基因执行（非 D-染色体）
   * P3-3 Fix: 使用实际成本估算替代硬编码值
   */
  private async standardExecution(gene: Gene, params?: unknown): Promise<{
    success: boolean;
    data?: unknown;
    cost: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      switch (gene.domain) {
        case GeneDomain.ONCHAIN_OPERATION: {
          // P3-3: 估算实际 Gas 成本
          const estimatedGas = 50000; // 基础操作估算 50k gas
          const gasPrice = await this.provider.getFeeData();
          const gasCostEth = estimatedGas * Number(gasPrice.gasPrice || 1e9);
          // 转换为 USDC (假设 1 ETH = 3000 USDC，1 ETH = 1e18 wei)
          const gasCostUSDC = (gasCostEth / 1e18) * 3000;
          
          return { 
            success: true, 
            cost: Math.max(0.001, gasCostUSDC), // 最小成本 0.001
            data: null,
            executionTime: Date.now() - startTime,
          };
        }
        
        case GeneDomain.COGNITION: {
          // P3-3: 从 cognitionRouter 获取实际 API 调用成本
          const cognitionCost = this.cognitionRouter 
            ? await this.estimateCognitionCost(params)
            : 0.01; // 默认回退值
          
          return { 
            success: true, 
            cost: cognitionCost,
            data: null,
            executionTime: Date.now() - startTime,
          };
        }
        
        default: {
          // 使用基因代谢成本（已正确缩放）
          const metabolicCostUSDC = gene.metabolicCost / 1000000; // 假设 metabolicCost 是 1e6 缩放的
          return { 
            success: true, 
            cost: metabolicCostUSDC,
            data: null,
          };
        }
      }
    } catch (error) {
      logger.error('[STANDARD_EXECUTION] Error calculating cost', { error, gene });
      return {
        success: false,
        cost: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * P3-3: 估算认知处理成本
   */
  private async estimateCognitionCost(params: unknown): Promise<number> {
    // 基于参数复杂度估算 token 数
    const paramString = JSON.stringify(params);
    const estimatedTokens = Math.ceil(paramString.length / 4); // 粗略估算：4 字符 ≈ 1 token
    
    // OpenAI GPT-4 价格：$0.03/1k input tokens, $0.06/1k output tokens
    const inputCost = (estimatedTokens / 1000) * 0.03;
    const outputCost = (500 / 1000) * 0.06; // 假设平均 500 tokens 输出
    
    return inputCost + outputCost;
  }

  /**
   * 触发压力响应（G-染色体）
   * Task 36: 使用 AutoEpigeneticService 替代手动逻辑
   */
  private async triggerStressResponse(type: string, context: unknown): Promise<void> {
    logger.warn('Triggering stress response', { type, context });
    
    // 将内部类型映射到 AutoEpigeneticService 的压力类型
    let stressType: 'FINANCIAL' | 'ENVIRONMENTAL' | 'SOCIAL' = 'ENVIRONMENTAL';
    let severity = 0.5;
    
    if (type === 'metabolic_exceed' || type === 'financial') {
      stressType = 'FINANCIAL';
      severity = 0.8;
    } else if (type === 'EVICTION' || type === 'environmental') {
      stressType = 'ENVIRONMENTAL';
      severity = 0.9;
    }
    
    // 使用 AutoEpigeneticService 处理压力事件
    if (this.autoEpigenetics) {
      const balance = await this.getBalanceUSDC();
      await this.autoEpigenetics.evaluateAndAdapt();
      logger.info('Auto-epigenetic adaptation triggered', { stressType, severity, balance });
    }
    
    // 查找并表达 G-染色体压力响应基因（保留原有逻辑作为 fallback）
    const stressGenes = this.loadedGenes.filter(
      g => g.domain === GeneDomain.STRESS_RESPONSE
    );
    
    if (stressGenes.length > 0) {
      // 选择最高权重的压力基因
      const primaryStressGene = stressGenes.reduce((max, g) => 
        g.weight > max.weight ? g : max
      );
      
      // 记录压力事件
      await this.logMemory({
        type: 'error',
        timestamp: Date.now(),
        data: {
          stressType: type,
          context,
          responseGene: primaryStressGene.id,
        },
      });
      
      // P3-1: 使用公共方法替代私有属性访问
      this.expressionEngine.applyStressModifier(primaryStressGene.id);
    }
  }

  /**
   * Register a skill
   */
  registerSkill(skill: Skill): void {
    this.skillRegistry.register(skill);
    logger.info(`Skill registered: ${skill.id}`);
  }

  /**
   * Load genes from blockchain
   */
  private async loadGenes(): Promise<void> {
    try {
      logger.info('Loading genome from chain...');
      
      this.loadedGenes = [];
      
      // Load all genes for each domain
      for (let domain = 0; domain < 32; domain++) {
        try {
          const genes = await this.genomeRegistry.getGenesByDomain(
            this.config.genomeHash,
            domain
          );
          
          // Add to expression engine cache
          for (const gene of genes) {
            const normalizedGene: Gene = {
              id: Number(gene.id),
              domain: Number(gene.domain),
              origin: Number(gene.origin),
              expressionState: Number(gene.expressionState),
              value: Number(gene.value),
              weight: Number(gene.weight),
              dominance: Number(gene.dominance),
              plasticity: Number(gene.plasticity),
              essentiality: Number(gene.essentiality),
              metabolicCost: Number(gene.metabolicCost),
              duplicateOf: Number(gene.duplicateOf),
              age: Number(gene.age),
            };
            
            // P3-1: 使用公共 geneCache 属性
            this.expressionEngine.geneCache.set(gene.id, normalizedGene);
            this.loadedGenes.push(normalizedGene);
          }
        } catch (err) {
          // Domain might have no genes
        }
      }

      // P3-1: 使用公共 geneCache 属性
      const geneCount = this.expressionEngine.geneCache.size;
      logger.info(`Loaded ${geneCount} genes`);
      
      // 更新代谢追踪器的基因列表（新增）
      this.metabolismTracker.setGenes(this.loadedGenes);

    } catch (error) {
      logger.error('Failed to load genes', { error });
      throw error;
    }
  }

  /**
   * Start decision loop
   * 
   * P3-4 设计说明：
   * - Decision Cycle (高频，几分钟)：本地认知循环，更新 WorkingMemory、基因表达、评估策略。
   *   不消耗 Gas，可频繁运行。
   * 
   * - Heartbeat Cycle (低频，6h-7d)：链上生存证明，执行必要的链上动作（转账、交易、续租）。
   *   消耗 Gas，受合约限制最小间隔 6 小时。
   * 
   * - 同步点：Decision 产生的链上需求被缓存，在下次 Heartbeat 时批量执行。
   *   这平衡了响应速度和 Gas 效率。
   */
  private startDecisionLoop(): void {
    this.decisionInterval = setInterval(async () => {
      await this.makeDecision();
    }, this.config.intervals.decision);

    logger.info('Decision loop started', {
      interval: this.config.intervals.decision,
      heartbeatInterval: this.config.intervals.heartbeat,
    });
  }

  /**
   * Make a decision
   */
  private async makeDecision(): Promise<void> {
    try {
      // Check if enough time has passed
      const now = Date.now();
      const timeSinceLast = now - this.lastDecisionTime;
      if (timeSinceLast < this.config.intervals.decision * 0.8) {
        return; // Too soon
      }

      // Get current state
      const state = await this.heartbeatService.getState();
      
      if (!state.isAlive) {
        logger.warn('Agent is dead, stopping decision loop');
        await this.stop();
        return;
      }

      // Get gene expressions
      const expressions = this.expressionEngine.getAllDomainExpressions({
        timeOfDay: new Date().getHours(),
        resourceLevel: this.calculateResourceLevel(state),
      });

      // Get available skills
      const availableSkills = this.skillRegistry.getAvailable(expressions);

      // Task 35: 获取租期上下文
      let leaseContext = null;
      if (this.leaseManager) {
        leaseContext = await this.leaseManager.getLeasePromptContext();
      }
      
      // Task 31: 获取财务历史上下文
      const financialContext = this.workingMemory ? {
        peakBalance: this.workingMemory.getPeakBalance(),
        profitableDecisions: this.workingMemory.getProfitableDecisionsCount(),
        totalFinancialDecisions: this.workingMemory.getTotalFinancialDecisionsCount(),
        winRate: this.workingMemory.getWinRate(),
      } : null;

      // Build decision context
      const context = {
        state,
        geneExpressions: expressions,
        availableSkills,
        recentDecisions: this.decisionEngine.getRecentDecisions(),
        environmentalFactors: {
          balanceTrend: await this.getBalanceTrend(state),
          timeSinceLastDecision: timeSinceLast,
          timeOfDay: new Date().getHours(),
        },
        // 新增：Task 35 租期上下文
        lease: leaseContext,
        // 新增：Task 31 财务上下文
        financialHistory: financialContext,
      };

      // Make decision
      const decision = await this.decisionEngine.makeDecision(context);
      this.lastDecisionTime = now;
      this.decisionCount++;

      // Execute decision
      await this.executeDecision(decision, expressions);
      
      // P1-4: 定期评估 Fork 条件（每 10 次决策检查一次）
      if (this.decisionCount % 10 === 0) {
        await this.evaluateReplication();
      }

    } catch (error) {
      logger.error('Decision making failed', { error });
    }
  }

  /**
   * Execute a decision
   */
  private async executeDecision(
    decision: Decision, 
    expressions: Map<GeneDomain, number>
  ): Promise<void> {
    logger.info('Executing decision', {
      decisionId: decision.id,
      type: decision.type,
      skillId: decision.skillId,
    });

    // Task 31: 记录执行前的余额
    const balanceBefore = await this.getBalanceUSDC();

    let result: { success: boolean; error?: string; pnl?: number; data?: any } = { success: false };

    if (decision.type === 'skill_execution' && decision.skillId) {
      result = await this.skillRegistry.execute(decision.skillId, decision.params);
    } else if (decision.type === 'rest') {
      // Rest - just log
      result = { success: true };
      logger.info('Agent resting');
    } else {
      result = { success: true };
    }

    // Task 31: 记录财务决策结果
    const balanceAfter = await this.getBalanceUSDC();
    const pnl = result.pnl !== undefined ? result.pnl : (balanceAfter - balanceBefore);
    
    if (this.workingMemory && decision.skillId) {
      this.workingMemory.recordFinancialResult(
        decision.skillId,
        pnl,
        {
          decisionId: decision.id,
          params: decision.params,
          success: result.success,
        }
      );
      
      logger.debug('[FINANCE] Decision recorded', {
        skillId: decision.skillId,
        pnl,
        balanceBefore,
        balanceAfter,
      });
    }
    
    // Task 35: 如果涉及租赁续期，更新 LeaseManager
    if (decision.skillId === 'renew_lease' && result.success && result.data) {
      const daysExtended = result.data.days;
      if (daysExtended && this.leaseManager) {
        const currentExpiry = this.leaseManager.getConfig().leaseExpiry;
        this.leaseManager.updateLeaseConfig({
          leaseExpiry: currentExpiry + daysExtended * 86400,
        });
        logger.info(`[LEASE] Lease extended by ${daysExtended} days`);
      }
    }

    // Mark as executed
    this.decisionEngine.markExecuted(decision.id, result);

    // Log to memory
    await this.logMemory({
      type: 'decision',
      timestamp: Date.now(),
      data: {
        decisionId: decision.id,
        type: decision.type,
        skillId: decision.skillId,
        result,
      },
      geneExpressions: Object.fromEntries(expressions),
    });

    logger.info('Decision executed', {
      decisionId: decision.id,
      success: result.success,
    });
  }

  /**
   * Prepare heartbeat data
   */
  private async prepareHeartbeat(data: import('../types').HeartbeatData): Promise<void> {
    // Get recent decisions
    const recentDecisions = this.decisionEngine.getRecentDecisions().slice(0, 10);
    
    // Calculate summary
    const decisionsCount = recentDecisions.length;
    const skillsExecuted = recentDecisions
      .filter(d => d.type === 'skill_execution')
      .map(d => d.skillId)
      .filter(Boolean) as string[];

    // Get current state
    const state = await this.heartbeatService.getState();
    
    // 计算代谢成本（新增）
    const metabolismBill = this.metabolismTracker.calculateDailyMetabolism();
    const apiCallReport = this.metabolismTracker.getApiCallReport();
    
    // 转换余额为 USDC（6位小数）
    const balanceUSDC = Number(state.balance) / 1e6;
    
    // Task 31: 记录当前余额到 WorkingMemory
    if (this.workingMemory) {
      this.workingMemory.recordBalance({
        timestamp: Date.now(),
        usdcBalance: balanceUSDC,
        ethBalance: 0, // ETH 余额可扩展
      });
    }
    
    // Task 35: 容器租期检测（在死亡检测之前）
    if (this.leaseManager) {
      const remainingDays = this.leaseManager.getRemainingDays();
      const leaseStatus = this.leaseManager.getLeaseStatus();
      
      logger.info(`[LEASE] Status: ${leaseStatus}, Remaining: ${remainingDays} days`);
      
      if (this.leaseManager.isEvictionImminent()) {
        logger.warn('⚠️ 租期即将到期（<=1天），评估续租策略...');
        
        const strategy = await this.leaseManager.getRenewalStrategy(balanceUSDC);
        
        if (!strategy.canAfford1) {
          // 无法负担续租，进入濒死状态
          logger.error('❌ 无法负担续租，进入 EVICTION 濒死状态');
          await this.deathManager.enterDyingState('EVICTION');
          return; // 阻止此次心跳
        }
        
        // 可以负担，记录决策上下文
        logger.info(`[LEASE] 续租策略: ${strategy.message}, 推荐: ${strategy.recommendedDays}天`);
      } else if (this.leaseManager.isRenewalUrgent()) {
        logger.warn(`⚠️ 租期紧急（<=5天），剩余 ${remainingDays} 天`);
      }
    }

    data.summary = {
      decisionsCount,
      skillsExecuted: [...new Set(skillsExecuted)],
      balanceChange: state.balance,
      metabolism: {
        dailyCost: metabolismBill.totalCost,
        apiCalls: apiCallReport.totalCalls,
        apiCost: apiCallReport.totalCost,
      },
    };

    // Create decision hash
    const decisionData = JSON.stringify(recentDecisions);
    data.decisionHash = ethers.keccak256(ethers.toUtf8Bytes(decisionData));
    
    // 记录心跳到代谢追踪器和生命周期追踪器（新增：死亡闭环）
    this.metabolicCount++;
    this.metabolismTracker.recordHeartbeat();
    this.lifecycleTracker.onHeartbeat();
    
    // 更新余额追踪（新增：死亡闭环）
    this.lifecycleTracker.onBalanceUpdate(balanceUSDC);
    
    // 更新 DeathManager 的运行时数据
    this.deathManager.updateRuntimeData({
      metabolicCount: this.metabolicCount,
      lastAction: this.lastDecisionTime > 0 ? 'decision' : 'none',
      lastDecision: recentDecisions[0]?.type || 'none',
      lastCognitionTier: this.lastCognitionTier,
    });
    
    // 死亡检测（新增：死亡闭环）
    const metabolicCostPerHeartbeat = metabolismBill.totalCost / 24; // 假设每天 24 次心跳
    const deathCheck = await this.deathManager.checkDeathCondition(
      balanceUSDC,
      metabolicCostPerHeartbeat
    );
    
    if (deathCheck.shouldDie && this.deathManager.getState() === AgentLifecycleState.ALIVE) {
      logger.warn('[DYING] Death condition detected, entering dying state...');
      await this.enterDyingState(deathCheck.reason || 'STARVATION');
    }
  }
  
  /**
   * 进入临终状态（新增：死亡闭环）
   */
  private async enterDyingState(cause: string): Promise<void> {
    if (this.deathManager.getState() !== AgentLifecycleState.ALIVE) {
      return;
    }
    
    // 1. 进入临终状态
    await this.deathManager.enterDyingState(cause);
    
    // 2. 停止决策循环
    if (this.decisionInterval) {
      clearInterval(this.decisionInterval);
      this.decisionInterval = undefined;
    }
    
    // 3. 等待待处理操作完成
    await this.deathManager.waitForPendingOperations(30000);
    
    // 4. 收集临终数据
    const deathData = await this.deathManager.collectDeathData();
    
    // 5. 写入墓碑
    const tombstoneResult = await this.deathManager.writeTombstone(deathData);
    
    // 6. 进入死亡状态
    await this.deathManager.enterDeadState();
    
    // 7. 优雅关停
    await this.deathManager.gracefulShutdown(tombstoneResult);
  }

  /**
   * Build skill context
   */
  private buildSkillContext(): SkillContext {
    return {
      agent: {
        address: this.config.agentAddress,
        genomeHash: this.config.genomeHash,
        getGeneExpression: (domain: GeneDomain) => {
          return this.expressionEngine.getDomainExpression(domain);
        },
        getState: () => {
          return this.heartbeatService.getState();
        },
      },
      llm: {
        complete: async (prompt: string) => {
          const response = await this.llm.chat.completions.create({
            model: this.config.llm.model,
            messages: [{ role: 'user', content: prompt }],
          });
          return response.choices[0].message.content || '';
        },
        analyze: async (data: unknown) => {
          // Simplified analysis
          return data;
        },
      },
      // P3-2 Fix: 接入实际的 WorkingMemory
      memory: {
        get: async (key: string) => {
          return this.workingMemory?.getSkillMemory?.(key) ?? null;
        },
        set: async (key: string, value: unknown) => {
          this.workingMemory?.setSkillMemory?.(key, value);
        },
        log: async (event: MemoryEvent) => {
          // 记录到 WorkingMemory 和 logger
          this.workingMemory?.logEvent?.(event);
          logger.info('Memory event', { event });
        },
      },
      // P3-2 Fix: 接入实际的链上调用
      chain: {
        call: async (method: string, args: unknown[]) => {
          // 通过合约调用
          try {
            const wallet = new ethers.Wallet(this.config.privateKey, this.provider);
            const contract = new Contract(this.config.agentAddress, [
              `function ${method} external`,
            ], wallet);
            return await contract[method](...args);
          } catch (error) {
            logger.error('Chain call failed', { method, args, error });
            throw error;
          }
        },
        getBalance: async () => {
          const state = await this.heartbeatService.getState();
          return Number(state.balance) / 1e6; // USDC 6 decimals
        },
        sendTransaction: async (tx: any) => {
          const wallet = new ethers.Wallet(this.config.privateKey, this.provider);
          const response = await wallet.sendTransaction(tx);
          return response.hash;
        },
      },
    };
  }

  /**
   * Calculate resource level (0-1)
   */
  private calculateResourceLevel(state: AgentState): number {
    const balance = BigInt(state.balance);
    const metabolicCost = BigInt(state.totalMetabolicCost);
    
    if (metabolicCost === BigInt(0)) return 1;
    
    // Days of runway
    const runway = Number(balance) / Number(metabolicCost);
    
    // Normalize: 30+ days = 1.0, 0 days = 0.0
    return Math.min(1, Math.max(0, runway / 30));
  }

  /**
   * Get balance trend
   */
  private async getBalanceTrend(state: AgentState): Promise<'increasing' | 'stable' | 'decreasing'> {
    // Simplified - would need historical data
    const balance = BigInt(state.balance);
    
    // Less than 1 USDC is critical
    if (balance < BigInt(1e6)) return 'decreasing';
    
    // More than 100 USDC is healthy
    if (balance > BigInt(100e6)) return 'increasing';
    
    return 'stable';
  }

  /**
   * Log memory event
   * P3-1 Fix: 使用公共方法替代方括号访问
   */
  private async logMemory(event: MemoryEvent): Promise<void> {
    await this.skillRegistry.logMemoryEvent(event);
  }

  /**
   * P3-4: 动态计算下次心跳间隔
   * 基于生存压力：余额少时更频繁（接近 6h），余额多时延长（接近 7d）
   */
  private calculateNextHeartbeatInterval(): number {
    const MIN_HEARTBEAT = 6 * 60 * 60 * 1000;    // 6 hours (合约限制)
    const MAX_HEARTBEAT = 7 * 24 * 60 * 60 * 1000; // 7 days (合约限制)
    
    const balance = this.workingMemory?.getCurrentBalance()?.usdcBalance || 0;
    const burnRate = this.config.lease?.dailyRate || 1;
    const daysOfLife = balance / burnRate;
    
    // 压力大时（余额 < 3 天），心跳更频繁
    // 压力小时（余额 > 30 天），可以延长
    if (daysOfLife < 3) return MIN_HEARTBEAT;
    if (daysOfLife > 30) return MAX_HEARTBEAT;
    
    // 线性插值
    const ratio = (daysOfLife - 3) / (30 - 3);
    const interval = MIN_HEARTBEAT + ratio * (MAX_HEARTBEAT - MIN_HEARTBEAT);
    
    logger.debug('[P3-4] Calculated heartbeat interval', {
      daysOfLife: daysOfLife.toFixed(2),
      intervalHours: (interval / 3600000).toFixed(1),
    });
    
    return Math.floor(interval);
  }

  /**
   * P1-4: 评估并执行 Fork（自主繁殖）
   */
  async evaluateReplication(): Promise<void> {
    if (!this.forkOrchestrator || !this.workingMemory) {
      return;
    }
    
    const balance = await this.getBalanceUSDC();
    const dailyCost = this.config.lease?.dailyRate || 1;
    const survivalCost = dailyCost * 7; // 7 天生存成本
    
    // 获取适应度上下文
    const fitness = {
      winRate: this.workingMemory.getWinRate(),
      roi: this.workingMemory.getAveragePnL(),
      survivalDays: this.workingMemory.getSurvivalDays(),
      stressLevel: this.workingMemory.getStressLevel(),
    };
    
    // 评估是否应该 Fork
    const evaluation = this.forkOrchestrator.shouldFork(balance, dailyCost, fitness);
    
    if (!evaluation.shouldFork) {
      logger.debug(`[FORK] Skip: ${evaluation.reason}`);
      return;
    }
    
    logger.info(`[FORK] ${evaluation.reason} - Starting fork process...`);
    
    try {
      // 构建父代基因组
      const parentGenome = {
        genes: this.loadedGenes.map(g => g.value),
        generation: 1,
        parentHash: undefined,
      };
      
      // 执行 Fork
      const result = await this.forkOrchestrator.executeFork({
        parentAgent: this.config.agentAddress,
        parentGenome,
        trigger: fitness.stressLevel > 0.8 ? 'STRESS' : 'AUTONOMOUS',
        endowment: survivalCost, // 给子代 7 天生存资金
        mode: 'COMPETITION',
      });
      
      if (result.success) {
        logger.info(`[FORK] ✅ Success! Child: ${result.childAgent}`);
      } else {
        logger.error(`[FORK] ❌ Failed: ${result.error}`);
      }
    } catch (error: any) {
      logger.error('[FORK] Error during fork', { error: error.message });
    }
  }

  /**
   * Get current state
   */
  getState(): { isRunning: boolean; isAlive: boolean } {
    return {
      isRunning: this.isRunning,
      isAlive: this.heartbeatService.isActive(),
    };
  }
}

export default ClawBot;
