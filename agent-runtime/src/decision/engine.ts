/**
 * Decision Engine
 * Makes decisions based on genome expression and current state
 */

import OpenAI from 'openai';
import { Decision, DecisionContext, Skill, GeneDomain } from '../types';
import { logger } from '../utils/logger';

export class DecisionEngine {
  private llm: OpenAI;
  private model: string;
  private recentDecisions: Decision[] = [];
  private maxRecentDecisions = 20;

  constructor(apiKey: string, model: string) {
    this.llm = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    this.model = model;
  }

  /**
   * Make a decision based on current context
   */
  async makeDecision(context: DecisionContext): Promise<Decision> {
    const { state, geneExpressions, availableSkills, environmentalFactors } = context;

    // Build decision prompt
    const prompt = this.buildDecisionPrompt(context);

    try {
      const response = await this.llm.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an AI agent's decision-making system. Your genome expresses certain tendencies that should influence your decisions.

Current Gene Expressions (0-1 scale, higher = stronger):
${this.formatGeneExpressions(geneExpressions)}

Available Skills:
${availableSkills.map(s => `- ${s.id}: ${s.description} (requires: ${s.requiredDomains.map(d => GeneDomain[d]).join(', ')})`).join('\n')}

Make decisions that align with your genetic tendencies while considering survival needs.`,
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

      logger.info('Decision made', {
        decisionId: decision.id,
        type: decision.type,
        skillId: decision.skillId,
      });

      return decision;

    } catch (error) {
      logger.error('Decision making failed', { error });
      
      // Fallback: rest
      return this.fallbackDecision();
    }
  }

  /**
   * Build decision prompt
   */
  private buildDecisionPrompt(context: DecisionContext): string {
    const { state, environmentalFactors, availableSkills } = context;

    return `Current State:
- Balance: ${state.balance} USDC
- Alive: ${state.isAlive}
- Heartbeat Nonce: ${state.heartbeatNonce}
- Last Decision: ${state.lastDecisionHash}
- Metabolic Cost: ${state.totalMetabolicCost} USDC/day

Environmental Factors:
- Balance Trend: ${environmentalFactors.balanceTrend}
- Time Since Last Decision: ${Math.floor(environmentalFactors.timeSinceLastDecision / 1000 / 60)} minutes
- Time of Day: ${environmentalFactors.timeOfDay}:00

Available Skills: ${availableSkills.map(s => s.id).join(', ')}

Decide what to do next. Respond with JSON:
{
  "type": "skill_execution" | "rest" | "social" | "learning",
  "skillId": "skill-id-if-applicable",
  "params": { /* skill-specific params */ },
  "expectedOutcome": {
    "type": "description",
    "confidence": 0.8,
    "value": 100
  },
  "reasoning": "explanation"
}`;
  }

  /**
   * Format gene expressions for prompt
   */
  private formatGeneExpressions(expressions: Map<GeneDomain, number>): string {
    const lines: string[] = [];
    
    for (const [domain, value] of expressions) {
      const domainName = GeneDomain[domain];
      const bar = '█'.repeat(Math.floor(value * 20)) + '░'.repeat(20 - Math.floor(value * 20));
      lines.push(`${domainName.padEnd(25)} ${bar} ${(value * 100).toFixed(1)}%`);
    }

    return lines.join('\n');
  }

  /**
   * Fallback decision when LLM fails
   */
  private fallbackDecision(): Decision {
    return {
      id: `dec-${Date.now()}-fallback`,
      timestamp: Date.now(),
      type: 'rest',
      executed: false,
      expectedOutcome: {
        type: 'recovery',
        confidence: 0.9,
      },
    };
  }

  /**
   * Add decision to recent history
   */
  private addToRecent(decision: Decision): void {
    this.recentDecisions.unshift(decision);
    if (this.recentDecisions.length > this.maxRecentDecisions) {
      this.recentDecisions.pop();
    }
  }

  /**
   * Get recent decisions
   */
  getRecentDecisions(): Decision[] {
    return [...this.recentDecisions];
  }

  /**
   * Mark decision as executed
   */
  markExecuted(decisionId: string, result: unknown): void {
    const decision = this.recentDecisions.find(d => d.id === decisionId);
    if (decision) {
      decision.executed = true;
      decision.result = result as any;
    }
  }
}

export default DecisionEngine;
