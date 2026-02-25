/**
 * Memory Skill
 * Manages agent memory and learning
 */

import { Skill, SkillContext, SkillResult, GeneDomain } from '@petrilabs/agent-runtime';

export interface MemoryEntry {
  id: string;
  timestamp: number;
  type: 'observation' | 'decision' | 'interaction' | 'learning';
  content: unknown;
  importance: number; // 0-1
  tags: string[];
}

export class MemorySkill implements Skill {
  id = 'core.memory';
  name = 'Memory Management';
  version = '1.0.0';
  description = 'Manages agent memory and learning';
  
  requiredDomains = [GeneDomain.MEMORY, GeneDomain.COGNITION];
  minExpression = 0.3;
  
  private context!: SkillContext;
  private shortTermMemory: MemoryEntry[] = [];
  private maxShortTermItems = 100;

  async initialize(context: SkillContext): Promise<void> {
    this.context = context;
    
    // Load working memory capacity from gene expression
    const capacity = context.agent.getGeneExpression(GeneDomain.MEMORY);
    this.maxShortTermItems = Math.floor(50 + capacity * 150);
    
    console.log(`[Memory] Initialized with capacity: ${this.maxShortTermItems}`);
  }

  async execute(params: { action: string; data?: unknown }): Promise<SkillResult> {
    switch (params.action) {
      case 'store':
        return this.storeMemory(params.data as MemoryEntry);
      case 'recall':
        return this.recallMemory(params.data as { tags?: string[]; limit?: number });
      case 'consolidate':
        return this.consolidateMemory();
      case 'summarize':
        return this.summarizeRecent();
      default:
        return {
          success: false,
          error: `Unknown action: ${params.action}`,
          timestamp: Date.now(),
        };
    }
  }

  async shutdown(): Promise<void> {
    // Persist any unsaved memories
    await this.consolidateMemory();
  }

  private async storeMemory(entry: MemoryEntry): Promise<SkillResult> {
    // Add to short-term memory
    this.shortTermMemory.unshift(entry);
    
    // Trim if over capacity
    if (this.shortTermMemory.length > this.maxShortTermItems) {
      const removed = this.shortTermMemory.splice(this.maxShortTermItems);
      // Important memories get consolidated
      const important = removed.filter(m => m.importance > 0.7);
      for (const mem of important) {
        await this.persistToLongTerm(mem);
      }
    }

    // Log to chain memory
    await this.context.memory.log({
      type: 'observation',
      timestamp: entry.timestamp,
      data: entry,
    });

    return {
      success: true,
      data: { stored: true, id: entry.id },
      timestamp: Date.now(),
    };
  }

  private async recallMemory(query: { tags?: string[]; limit?: number }): Promise<SkillResult> {
    let results = this.shortTermMemory;
    
    // Filter by tags if provided
    if (query.tags && query.tags.length > 0) {
      results = results.filter(m => 
        query.tags!.some(tag => m.tags.includes(tag))
      );
    }
    
    // Sort by importance and recency
    results = results
      .sort((a, b) => {
        const scoreA = a.importance * 0.6 + (1 - (Date.now() - a.timestamp) / 86400000) * 0.4;
        const scoreB = b.importance * 0.6 + (1 - (Date.now() - b.timestamp) / 86400000) * 0.4;
        return scoreB - scoreA;
      })
      .slice(0, query.limit || 10);

    return {
      success: true,
      data: { memories: results },
      timestamp: Date.now(),
    };
  }

  private async consolidateMemory(): Promise<SkillResult> {
    // Group memories by type and create summaries
    const byType = this.groupByType(this.shortTermMemory);
    const summaries: Record<string, unknown> = {};

    for (const [type, memories] of Object.entries(byType)) {
      if (memories.length > 5) {
        summaries[type] = await this.createSummary(memories);
      }
    }

    return {
      success: true,
      data: { summaries },
      timestamp: Date.now(),
    };
  }

  private async summarizeRecent(): Promise<SkillResult> {
    const recent = this.shortTermMemory.slice(0, 20);
    const summary = await this.createSummary(recent);

    return {
      success: true,
      data: { summary },
      timestamp: Date.now(),
    };
  }

  private async persistToLongTerm(entry: MemoryEntry): Promise<void> {
    // Store in long-term memory (Arweave/chain)
    await this.context.memory.set(`memory:${entry.id}`, entry);
  }

  private groupByType(memories: MemoryEntry[]): Record<string, MemoryEntry[]> {
    return memories.reduce((acc, mem) => {
      acc[mem.type] = acc[mem.type] || [];
      acc[mem.type].push(mem);
      return acc;
    }, {} as Record<string, MemoryEntry[]>);
  }

  private async createSummary(memories: MemoryEntry[]): Promise<string> {
    // Use LLM to create summary
    const contents = memories.map(m => JSON.stringify(m.content)).join('\n');
    
    const summary = await this.context.llm.complete(
      `Summarize the following events concisely:\n${contents}`
    );
    
    return summary;
  }
}

export default MemorySkill;
