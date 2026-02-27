/**
 * Skill Registry
 * Manages skill discovery, loading, and execution
 */

import { Skill, SkillContext, SkillResult, GeneDomain } from '../types';
import { logger } from '../utils/logger';

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private context: SkillContext;

  constructor(context: SkillContext) {
    this.context = context;
  }

  /**
   * Register a skill
   */
  register(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      logger.warn(`Skill ${skill.id} already registered, overwriting`);
    }

    this.skills.set(skill.id, skill);
    logger.info(`Skill registered: ${skill.name} (${skill.id})`);
  }

  /**
   * Unregister a skill
   */
  unregister(skillId: string): void {
    const skill = this.skills.get(skillId);
    if (skill) {
      skill.shutdown().catch(err => {
        logger.error(`Error shutting down skill ${skillId}`, { error: err });
      });
      this.skills.delete(skillId);
      logger.info(`Skill unregistered: ${skillId}`);
    }
  }

  /**
   * Get a skill by ID
   */
  get(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Get all registered skills
   */
  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get skills available given current gene expressions
   */
  getAvailable(expressions: Map<GeneDomain, number>): Skill[] {
    return this.getAll().filter(skill => {
      // Check if all required domains meet minimum expression
      return skill.requiredDomains.every(domain => {
        const expression = expressions.get(domain) || 0;
        return expression >= skill.minExpression;
      });
    });
  }

  /**
   * Execute a skill
   */
  async execute(skillId: string, params?: unknown): Promise<SkillResult> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return {
        success: false,
        error: `Skill not found: ${skillId}`,
        timestamp: Date.now(),
      };
    }

    // Initialize if needed
    try {
      await skill.initialize(this.context);
    } catch (err) {
      logger.error(`Failed to initialize skill ${skillId}`, { error: err });
      return {
        success: false,
        error: `Initialization failed: ${err}`,
        timestamp: Date.now(),
      };
    }

    // Execute
    const startTime = Date.now();
    try {
      const result = await skill.execute(params);
      
      logger.info(`Skill executed: ${skillId}`, {
        success: result.success,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (err) {
      logger.error(`Skill execution failed: ${skillId}`, { error: err });
      
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Initialize all skills
   */
  async initializeAll(): Promise<void> {
    for (const skill of this.skills.values()) {
      try {
        await skill.initialize(this.context);
        logger.info(`Skill initialized: ${skill.id}`);
      } catch (err) {
        logger.error(`Failed to initialize skill ${skill.id}`, { error: err });
      }
    }
  }

  /**
   * Shutdown all skills
   */
  async shutdownAll(): Promise<void> {
    for (const skill of this.skills.values()) {
      try {
        await skill.shutdown();
        logger.info(`Skill shutdown: ${skill.id}`);
      } catch (err) {
        logger.error(`Error shutting down skill ${skill.id}`, { error: err });
      }
    }
  }
  
  // ============ P3-1: 公共方法替代私有属性访问 ============
  
  /**
   * Log memory event via context
   * P3-1 Fix: 公共方法替代 this.skillRegistry['context'].memory.log()
   */
  async logMemoryEvent(event: import('../types').MemoryEvent): Promise<void> {
    await this.context.memory.log(event);
  }
  
  /**
   * Get context for external access (readonly)
   * P3-1 Fix: 提供只读访问而不暴露内部结构
   */
  getContext(): Readonly<SkillContext> {
    return this.context;
  }
        logger.error(`Error shutting down skill ${skill.id}`, { error: err });
      }
    }
    this.skills.clear();
  }
}

export default SkillRegistry;
