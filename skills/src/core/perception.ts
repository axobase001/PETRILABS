/**
 * Perception Skill
 * Senses environment and detects changes
 */

import { Skill, SkillContext, SkillResult, GeneDomain } from '@petrilabs/agent-runtime';

export interface EnvironmentState {
  timestamp: number;
  balance: string;
  blockNumber: number;
  gasPrice: string;
  peers: string[];
  opportunities: Opportunity[];
  threats: Threat[];
}

export interface Opportunity {
  type: string;
  confidence: number;
  potentialValue: number;
  requiresAction: boolean;
}

export interface Threat {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  requiresAction: boolean;
}

export class PerceptionSkill implements Skill {
  id = 'core.perception';
  name = 'Environment Perception';
  version = '1.0.0';
  description = 'Senses environment and detects changes';
  
  requiredDomains = [GeneDomain.PERCEPTION];
  minExpression = 0.4;
  
  private context!: SkillContext;
  private lastState?: EnvironmentState;
  private perceptionCache: Map<string, unknown> = new Map();

  async initialize(context: SkillContext): Promise<void> {
    this.context = context;
    console.log('[Perception] Initialized');
  }

  async execute(params: { action: string; target?: string }): Promise<SkillResult> {
    switch (params.action) {
      case 'scan':
        return this.scanEnvironment();
      case 'detect_changes':
        return this.detectChanges();
      case 'check_balance':
        return this.checkBalance();
      case 'monitor_chain':
        return this.monitorChain();
      default:
        return {
          success: false,
          error: `Unknown action: ${params.action}`,
          timestamp: Date.now(),
        };
    }
  }

  async shutdown(): Promise<void> {
    this.perceptionCache.clear();
  }

  private async scanEnvironment(): Promise<SkillResult> {
    const state = await this.gatherState();
    
    // Analyze for opportunities and threats
    const opportunities = this.identifyOpportunities(state);
    const threats = this.identifyThreats(state);
    
    state.opportunities = opportunities;
    state.threats = threats;
    
    this.lastState = state;
    
    // Store in memory
    await this.context.memory.log({
      type: 'observation',
      timestamp: Date.now(),
      data: {
        balance: state.balance,
        opportunities: opportunities.length,
        threats: threats.length,
      },
    });

    return {
      success: true,
      data: state,
      timestamp: Date.now(),
    };
  }

  private async detectChanges(): Promise<SkillResult> {
    if (!this.lastState) {
      return {
        success: true,
        data: { changes: [], message: 'No previous state to compare' },
        timestamp: Date.now(),
      };
    }

    const current = await this.gatherState();
    const changes: Array<{ type: string; from: unknown; to: unknown; significance: number }> = [];

    // Detect balance change
    const lastBalance = BigInt(this.lastState.balance);
    const currentBalance = BigInt(current.balance);
    if (lastBalance !== currentBalance) {
      const diff = Number(currentBalance - lastBalance) / 1e6;
      changes.push({
        type: 'balance',
        from: this.lastState.balance,
        to: current.balance,
        significance: Math.abs(diff) / Math.max(Number(lastBalance) / 1e6, 1),
      });
    }

    // Detect block progression
    if (current.blockNumber > this.lastState.blockNumber) {
      changes.push({
        type: 'block',
        from: this.lastState.blockNumber,
        to: current.blockNumber,
        significance: 0.1,
      });
    }

    this.lastState = current;

    return {
      success: true,
      data: { 
        changes,
        significant: changes.filter(c => c.significance > 0.1),
      },
      timestamp: Date.now(),
    };
  }

  private async checkBalance(): Promise<SkillResult> {
    const balance = await this.context.chain.getBalance();
    const agentState = await this.context.agent.getState();
    
    const metabolicCost = BigInt(agentState.totalMetabolicCost);
    const runway = metabolicCost > 0 
      ? Number(BigInt(balance) / metabolicCost) 
      : 999;

    const status = runway < 7 ? 'critical' : runway < 30 ? 'low' : 'healthy';

    return {
      success: true,
      data: {
        balance,
        metabolicCost: agentState.totalMetabolicCost,
        runwayDays: runway,
        status,
      },
      timestamp: Date.now(),
    };
  }

  private async monitorChain(): Promise<SkillResult> {
    // Monitor blockchain for relevant events
    // This would watch for events related to the agent
    
    return {
      success: true,
      data: { status: 'monitoring' },
      timestamp: Date.now(),
    };
  }

  private async gatherState(): Promise<EnvironmentState> {
    const balance = await this.context.chain.getBalance();
    
    return {
      timestamp: Date.now(),
      balance,
      blockNumber: 0, // Would query from provider
      gasPrice: '0',
      peers: [],
      opportunities: [],
      threats: [],
    };
  }

  private identifyOpportunities(state: EnvironmentState): Opportunity[] {
    const opportunities: Opportunity[] = [];
    
    // Check for balance opportunities
    const balance = Number(state.balance) / 1e6;
    
    if (balance > 100) {
      opportunities.push({
        type: 'resource_abundant',
        confidence: 0.9,
        potentialValue: balance * 0.1,
        requiresAction: false,
      });
    }
    
    return opportunities;
  }

  private identifyThreats(state: EnvironmentState): Threat[] {
    const threats: Threat[] = [];
    
    const balance = Number(state.balance) / 1e6;
    const agentState = this.context.agent.getState();
    const metabolicCost = Number(agentState.totalMetabolicCost) / 1e6;
    
    const runway = metabolicCost > 0 ? balance / metabolicCost : 999;
    
    if (runway < 7) {
      threats.push({
        type: 'low_balance',
        severity: 'critical',
        requiresAction: true,
      });
    } else if (runway < 30) {
      threats.push({
        type: 'low_balance',
        severity: 'high',
        requiresAction: true,
      });
    }
    
    return threats;
  }
}

export default PerceptionSkill;
