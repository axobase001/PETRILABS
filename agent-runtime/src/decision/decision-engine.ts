/**
 * Decision Engine with Instinct Mode Integration
 * 
 * 集成本能模式的决策引擎
 * - 正常情况：使用 LLM 进行智能决策
 * - 认知饥荒：切换到硬编码本能决策
 * - 无缝切换：自动检测、恢复、死亡处理
 */

import OpenAI from 'openai';
import { Decision, DecisionContext, GeneDomain } from '../types';
import { logger } from '../utils/logger';
import { InstinctMode, SurvivalContext, InstinctDecision } from '../cognition/instinct';
import { GeneRouter } from '../cognition/gene-router';
import { NoProviderAvailableError } from '../cognition/types';

export interface IntegratedDecisionEngineConfig {
  apiKey: string;
  model: string;
  router: GeneRouter;
  onInstinctStateChange?: (active: boolean) => void;
}

export class IntegratedDecisionEngine {
  private llm: OpenAI;
  private model: string;
  private router: GeneRouter;
  private instinctMode: InstinctMode;
  private recentDecisions: Decision[] = [];
  private maxRecentDecisions = 20;
  private consecutiveFailures = 0;

  constructor(config: IntegratedDecisionEngineConfig) {
    this.llm = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    this.model = config.model;
    this.router = config.router;
    
    // 初始化本能模式
    this.instinctMode = new InstinctMode(
      this.router,
      (state) => config.onInstinctStateChange?.(state.active)
    );
  }

  /**
   * 主决策入口
   * 集成本能模式：正常时 LLM，饥荒时硬编码
   */
  async makeDecision(context: DecisionContext): Promise<Decision | InstinctDecision> {
    // 如果已经在本能模式，直接获取本能决策
    if (this.instinctMode.isActive()) {
      return this.handleInstinctDecision(context);
    }

    try {
      // 尝试正常 LLM 决策
      const provider = this.router.selectProvider(
        this.assessCriticality(context),
        1000
      );

      if (!provider) {
        // 无可用 provider → 触发本能模式
        throw new NoProviderAvailableError();
      }

      // 执行 LLM 决策
      const decision = await this.executeLLMDecision(context);
      
      // 成功后重置失败计数
      this.consecutiveFailures = 0;
      
      return decision;

    } catch (error) {
      // 处理认知失败
      return this.handleCognitiveFailure(context, error);
    }
  }

  /**
   * 处理认知失败
   */
  private handleCognitiveFailure(
    context: DecisionContext, 
    error: unknown
  ): Decision | InstinctDecision {
    
    // 判断是否应计数为认知失败
    const isCognitiveFailure = 
      error instanceof NoProviderAvailableError ||
      (error instanceof Error && 
        (error.message.includes('NO_COGNITIVE_PROVIDER_AVAILABLE') ||
         error.message.includes('Network') ||
         error.message.includes('timeout')));

    if (isCognitiveFailure) {
      this.consecutiveFailures++;
      
      logger.warn('[DecisionEngine] 认知失败', {
        consecutiveFailures: this.consecutiveFailures,
        error: error instanceof Error ? error.message : 'unknown',
      });

      // 检查是否应进入本能模式
      if (this.instinctMode.shouldActivate(this.consecutiveFailures, error as Error)) {
        return this.handleInstinctDecision(context);
      }

      // 未达阈值，返回重试决策
      return this.createRetryDecision();
    }

    // 非认知失败（如代码错误），向上抛出
    throw error;
  }

  /**
   * 处理本能决策
   */
  private handleInstinctDecision(context: DecisionContext): InstinctDecision {
    const survivalContext = this.buildSurvivalContext(context);
    const decision = this.instinctMode.getInstinctDecision(survivalContext);

    logger.info('[DecisionEngine] 本能决策', {
      type: decision.type,
      priority: decision.priority,
    });

    // 如果是恢复决策，重置状态
    if (decision.type === 'RESUME_COGNITION') {
      this.consecutiveFailures = 0;
    }

    // 如果是死亡决策，触发死亡流程
    if (decision.type === 'DIE') {
      this.handleInstinctDeath(decision);
    }

    return decision;
  }

  /**
   * 执行 LLM 决策
   */
  private async executeLLMDecision(context: DecisionContext): Promise<Decision> {
    const { state, geneExpressions, availableSkills, environmentalFactors } = context;

    const prompt = this.buildDecisionPrompt(context);

    try {
      const response = await this.llm.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI agent's decision-making system. Your genome expresses certain tendencies.

Gene Expressions (0-1 scale):
${this.formatGeneExpressions(geneExpressions)}

Available Skills:
${availableSkills.map(s => `- ${s.id}: ${s.description}`).join('\n')}

Make decisions aligned with your genetic tendencies.`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4 + (geneExpressions.get(GeneDomain.RISK_ASSESSMENT) || 0.5) * 0.4,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('Empty LLM response');
      }

      const decisionData = JSON.parse(content);

      const decision: Decision = {
        id: `dec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        type: decisionData.type,
        skillId: decisionData.skillId,
        params: decisionData.params,
        expectedOutcome: decisionData.expectedOutcome,
        executed: false,
      };

      this.addToRecent(decision);

      logger.info('[DecisionEngine] LLM 决策完成', {
        decisionId: decision.id,
        type: decision.type,
      });

      return decision;

    } catch (error) {
      logger.error('[DecisionEngine] LLM 决策失败', { error });
      throw error;
    }
  }

  /**
   * 构建生存上下文（用于本能模式）
   */
  private buildSurvivalContext(context: DecisionContext): SurvivalContext {
    const { state, environmentalFactors } = context;

    return {
      balance: state.balance || 0,
      ethBalance: environmentalFactors?.ethBalance || 0.001,
      estimatedDays: environmentalFactors?.estimatedDays || 30,
      lastHeartbeat: state.lastHeartbeat || Date.now(),
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /**
   * 评估任务关键性
   */
  private assessCriticality(context: DecisionContext): 'low' | 'medium' | 'high' | 'critical' {
    const { state, environmentalFactors } = context;
    
    // 余额极低 → critical
    if (state.balance < 1.0) return 'critical';
    
    // ETH 不足 → high
    if (environmentalFactors?.ethBalance < 0.0005) return 'high';
    
    // 生存天数紧张 → high
    if (environmentalFactors?.estimatedDays < 3) return 'high';
    
    // 默认 medium
    return 'medium';
  }

  /**
   * 创建重试决策
   */
  private createRetryDecision(): Decision {
    return {
      id: `retry-${Date.now()}`,
      timestamp: Date.now(),
      type: 'REST',
      skillId: undefined,
      params: {
        reason: 'COGNITIVE_RETRY',
        description: `认知失败 ${this.consecutiveFailures} 次，等待后重试`,
        waitTime: Math.min(60000 * this.consecutiveFailures, 300000), // 指数退避
      },
      expectedOutcome: {
        type: 'recovery',
        confidence: 0.5,
      },
      executed: false,
    };
  }

  /**
   * 处理本能模式死亡
   */
  private handleInstinctDeath(decision: InstinctDecision) {
    logger.error('[DecisionEngine] 认知饥荒死亡', {
      cause: decision.params.causeOfDeath,
      reason: decision.params.reason,
    });

    // 触发死亡事件（由外部监听处理）
    process.emit('cognitiveStarvationDeath' as any, decision.params);
  }

  /**
   * 构建决策提示词
   */
  private buildDecisionPrompt(context: DecisionContext): string {
    const { state, environmentalFactors, availableSkills } = context;

    return `Current State:
- Balance: ${state.balance} USDC
- Alive: ${state.isAlive}
- Heartbeat Nonce: ${state.heartbeatNonce}
- Estimated Days: ${environmentalFactors?.estimatedDays || 'unknown'}
- ETH Balance: ${environmentalFactors?.ethBalance || 'unknown'}

Available Skills:
${availableSkills.map(s => `- ${s.id}: ${s.description}`).join('\n')}

Make a decision in JSON format with: type, skillId, params, expectedOutcome`;
  }

  /**
   * 格式化基因表达
   */
  private formatGeneExpressions(expressions: Map<GeneDomain, number>): string {
    return Array.from(expressions.entries())
      .map(([domain, value]) => `- ${GeneDomain[domain]}: ${(value * 100).toFixed(0)}%`)
      .join('\n');
  }

  /**
   * 添加到最近决策列表
   */
  private addToRecent(decision: Decision) {
    this.recentDecisions.push(decision);
    if (this.recentDecisions.length > this.maxRecentDecisions) {
      this.recentDecisions.shift();
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 公共 API
  // ═══════════════════════════════════════════════════════════

  /**
   * 获取本能模式状态（Dashboard 用）
   */
  getInstinctState() {
    return this.instinctMode.getDashboardState();
  }

  /**
   * 是否处于本能模式
   */
  isInInstinctMode(): boolean {
    return this.instinctMode.isActive();
  }

  /**
   * 强制尝试恢复认知（外部干预）
   */
  attemptRecovery(): boolean {
    if (!this.instinctMode.isActive()) return true;
    return this.instinctMode.attemptRecovery();
  }

  /**
   * 获取最近决策历史
   */
  getRecentDecisions(): Decision[] {
    return [...this.recentDecisions];
  }

  /**
   * P0-NEW-4: 标记决策已执行
   * 修复 TypeError: this.decisionEngine.markExecuted is not a function
   */
  markExecuted(decisionId: string, result: { success: boolean; error?: string }): void {
    const decision = this.recentDecisions.find(d => d.id === decisionId);
    if (decision) {
      (decision as any).executed = true;
      (decision as any).result = result;
    }
  }
}

export default IntegratedDecisionEngine;
