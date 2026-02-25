/**
 * Memory Inheritance
 * 
 * 子代记忆继承规则
 * 
 * Fork（无性复制）：
 * - 继承亲本的大部分记忆（同一个"人"的变体）
 * - 清空认知账本、行动历史、基因覆盖日志
 * - 添加起源声明
 * 
 * Merge（基因组合并）：
 * - 不继承任何一方的完整记忆
 * - 只有起源声明（两个不同个体的基因组合并产物）
 * - 全新的个体
 */

import { logger } from '../utils/logger';

/**
 * 记忆数据结构（简化版）
 */
export interface AgentMemory {
  personality: string;           // 人格特质描述
  knowledge: string[];           // 环境知识
  values: string[];              // 价值观
  cognitionLedger: unknown[];    // 认知账本（推理记录）
  actionHistory: unknown[];      // 行动历史
  geneOverrideLog: unknown[];    // 基因覆盖日志
  originNote?: string;           // 起源声明
  [key: string]: unknown;
}

/**
 * Fork 记忆继承策略
 */
export interface ForkMemoryPolicy {
  inheritPersonality: boolean;
  inheritKnowledge: boolean;
  inheritValues: boolean;
  clearCognitionLedger: boolean;
  clearActionHistory: boolean;
  clearGeneOverrideLog: boolean;
  addOriginNote: boolean;
}

/**
 * 默认 Fork 策略
 */
const DEFAULT_FORK_POLICY: ForkMemoryPolicy = {
  inheritPersonality: true,
  inheritKnowledge: true,
  inheritValues: true,
  clearCognitionLedger: true,
  clearActionHistory: true,
  clearGeneOverrideLog: true,
  addOriginNote: true
};

/**
 * 默认 Merge 策略
 */
const DEFAULT_MERGE_POLICY: ForkMemoryPolicy = {
  inheritPersonality: false,
  inheritKnowledge: false,
  inheritValues: false,
  clearCognitionLedger: true,
  clearActionHistory: true,
  clearGeneOverrideLog: true,
  addOriginNote: true
};

/**
 * Fork 时的记忆继承
 * 
 * @param parentMemory 亲本记忆
 * @param parentId 亲本 ID
 * @param policy 继承策略（可选，使用默认）
 * @returns 子代记忆
 */
export function deriveForkMemory(
  parentMemory: AgentMemory,
  parentId: string,
  policy: Partial<ForkMemoryPolicy> = {}
): AgentMemory {
  const p = { ...DEFAULT_FORK_POLICY, ...policy };
  
  const childMemory: AgentMemory = {
    personality: p.inheritPersonality ? parentMemory.personality : '',
    knowledge: p.inheritKnowledge ? [...parentMemory.knowledge] : [],
    values: p.inheritValues ? [...parentMemory.values] : [],
    cognitionLedger: p.clearCognitionLedger ? [] : [...parentMemory.cognitionLedger],
    actionHistory: p.clearActionHistory ? [] : [...parentMemory.actionHistory],
    geneOverrideLog: p.clearGeneOverrideLog ? [] : [...parentMemory.geneOverrideLog],
  };
  
  if (p.addOriginNote) {
    childMemory.originNote = `你是 ${parentId.slice(0, 8)} 的分叉体。你继承了它的记忆和知识，但你的基因组经过了突变。你不是它。你是基于它的新个体。`;
  }
  
  logger.info('Fork memory derived', {
    parentId: parentId.slice(0, 8),
    inheritedKnowledge: childMemory.knowledge.length,
    hasOriginNote: !!childMemory.originNote
  });
  
  return childMemory;
}

/**
 * Merge 时的记忆创建
 * 
 * @param parent1Id 亲本 1 ID
 * @param parent2Id 亲本 2 ID
 * @param policy 继承策略（可选，使用默认）
 * @returns 子代记忆
 */
export function createMergeMemory(
  parent1Id: string,
  parent2Id: string,
  policy: Partial<ForkMemoryPolicy> = {}
): AgentMemory {
  const p = { ...DEFAULT_MERGE_POLICY, ...policy };
  
  const childMemory: AgentMemory = {
    personality: '',
    knowledge: [],
    values: [],
    cognitionLedger: [],
    actionHistory: [],
    geneOverrideLog: [],
  };
  
  if (p.addOriginNote) {
    childMemory.originNote = `你是 ${parent1Id.slice(0, 8)} 和 ${parent2Id.slice(0, 8)} 的基因组合并体。你不拥有它们的记忆。你的基因组来自它们双方，但你是全新的个体。`;
  }
  
  logger.info('Merge memory created', {
    parent1Id: parent1Id.slice(0, 8),
    parent2Id: parent2Id.slice(0, 8),
    hasOriginNote: !!childMemory.originNote
  });
  
  return childMemory;
}

/**
 * 创建空白记忆（特殊情况）
 */
export function createBlankMemory(originNote?: string): AgentMemory {
  return {
    personality: '',
    knowledge: [],
    values: [],
    cognitionLedger: [],
    actionHistory: [],
    geneOverrideLog: [],
    originNote
  };
}

/**
 * 序列化记忆为存储格式
 */
export function serializeMemory(memory: AgentMemory): string {
  return JSON.stringify(memory, null, 2);
}

/**
 * 反序列化记忆
 */
export function deserializeMemory(data: string): AgentMemory {
  try {
    return JSON.parse(data) as AgentMemory;
  } catch (error) {
    logger.error('Failed to deserialize memory', { error });
    return createBlankMemory('记忆解析失败，创建空白记忆');
  }
}

export default {
  deriveForkMemory,
  createMergeMemory,
  createBlankMemory,
  serializeMemory,
  deserializeMemory,
  DEFAULT_FORK_POLICY,
  DEFAULT_MERGE_POLICY
};
