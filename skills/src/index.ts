/**
 * PETRILABS Skills - Export all pre-installed skills
 */

// Core Skills
export { MemorySkill, MemoryEntry } from './core/memory';
export { PerceptionSkill, EnvironmentState } from './core/perception';

// Domain Skills
export { OnChainSkill } from './domain/onchain';

// Economy Skills (Framework)
export { TradingSkill } from './economy/trading';

// Skill loader utility
import { Skill } from '@petrilabs/agent-runtime';
import { MemorySkill } from './core/memory';
import { PerceptionSkill } from './core/perception';
import { OnChainSkill } from './domain/onchain';
import { TradingSkill } from './economy/trading';

/**
 * Get all pre-installed skills
 */
export function getPreInstalledSkills(): Skill[] {
  return [
    new MemorySkill(),
    new PerceptionSkill(),
    new OnChainSkill(),
    new TradingSkill(),
  ];
}

/**
 * Load skill by ID
 */
export function loadSkill(id: string): Skill | null {
  const skills: Record<string, new () => Skill> = {
    'core.memory': MemorySkill,
    'core.perception': PerceptionSkill,
    'domain.onchain': OnChainSkill,
    'economy.trading': TradingSkill,
  };

  const SkillClass = skills[id];
  return SkillClass ? new SkillClass() : null;
}

export default getPreInstalledSkills;
