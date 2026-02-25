/**
 * ClawBot - Core Agent Runtime
 * Autonomous AI agent with genome-driven behavior
 */

import OpenAI from 'openai';
import { Contract, ethers } from 'ethers';
import { logger } from '../utils/logger';
import ExpressionEngine from '../genome/expression';
import SkillRegistry from '../skills/registry';
import DecisionEngine from '../decision/engine';
import HeartbeatService from '../chain/heartbeat';
import { NkmcGateway } from '../gateways/nkmc';
import { CapabilityRouter } from '../routers/capability';
import MetabolismTracker from '../metabolism/tracker';
import { CognitionRouter } from '../cognition';
import { 
  AgentConfig, 
  AgentState, 
  Skill, 
  Decision, 
  SkillContext,
  GeneDomain,
  MemoryEvent,
  Gene,
} from '../types';

export class ClawBot {
  private config: AgentConfig;
  private expressionEngine: ExpressionEngine;
  private skillRegistry: SkillRegistry;
  private decisionEngine: DecisionEngine;
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
  
  private isRunning = false;
  private decisionInterval?: NodeJS.Timeout;
  private lastDecisionTime = 0;
  private loadedGenes: Gene[] = [];

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
    
    // Initialize components
    this.expressionEngine = new ExpressionEngine(config.genomeHash);
    this.skillRegistry = new SkillRegistry(this.buildSkillContext());
    this.decisionEngine = new DecisionEngine(config.llm.apiKey, config.llm.model);
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
    
    logger.info('Dual-mode cognition router initialized (Pollinations + x402)');

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
   */
  private async standardExecution(gene: Gene, params?: unknown): Promise<{
    success: boolean;
    data?: unknown;
    cost: number;
    error?: string;
  }> {
    // 根据基因域执行相应逻辑
    switch (gene.domain) {
      case GeneDomain.ONCHAIN_OPERATION:
        // 链上操作
        return { success: true, cost: 0.001, data: null };
        
      case GeneDomain.COGNITION:
        // 认知处理
        return { success: true, cost: 0.01, data: null };
        
      default:
        return { success: true, cost: gene.metabolicCost / 10000, data: null };
    }
  }

  /**
   * 触发压力响应（G-染色体）
   */
  private async triggerStressResponse(type: string, context: unknown): Promise<void> {
    logger.warn('Triggering stress response', { type, context });
    
    // 查找并表达 G-染色体压力响应基因
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
      
      // 表达压力基因（影响后续决策）
      this.expressionEngine['applyStressModifier'](primaryStressGene.id);
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
            
            this.expressionEngine['geneCache'].set(gene.id, normalizedGene);
            this.loadedGenes.push(normalizedGene);
          }
        } catch (err) {
          // Domain might have no genes
        }
      }

      const geneCount = this.expressionEngine['geneCache'].size;
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
   */
  private startDecisionLoop(): void {
    this.decisionInterval = setInterval(async () => {
      await this.makeDecision();
    }, this.config.intervals.decision);

    logger.info('Decision loop started', {
      interval: this.config.intervals.decision,
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
      };

      // Make decision
      const decision = await this.decisionEngine.makeDecision(context);
      this.lastDecisionTime = now;

      // Execute decision
      await this.executeDecision(decision, expressions);

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

    let result: { success: boolean; error?: string } = { success: false };

    if (decision.type === 'skill_execution' && decision.skillId) {
      result = await this.skillRegistry.execute(decision.skillId, decision.params);
    } else if (decision.type === 'rest') {
      // Rest - just log
      result = { success: true };
      logger.info('Agent resting');
    } else {
      result = { success: true };
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
    
    // 记录心跳到代谢追踪器
    this.metabolismTracker.recordHeartbeat();
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
      memory: {
        get: async (key: string) => {
          // TODO: Implement Redis/memory storage
          return null;
        },
        set: async (key: string, value: unknown) => {
          // TODO: Implement Redis/memory storage
        },
        log: async (event: MemoryEvent) => {
          logger.info('Memory event', { event });
        },
      },
      chain: {
        call: async (method: string, args: unknown[]) => {
          // Generic blockchain call
          return null;
        },
        getBalance: async () => {
          const state = await this.heartbeatService.getState();
          return state.balance;
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
   */
  private async logMemory(event: MemoryEvent): Promise<void> {
    await this.skillRegistry['context'].memory.log(event);
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
