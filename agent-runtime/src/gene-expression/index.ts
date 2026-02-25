/**
 * Gene Expression Module
 * 基因表达引擎 - 双模态基因表达系统的核心
 * 
 * 包含：
 * - GeneExpressionEngine: 硬表达 - 基因 × 环境 = 表型（透明约束）
 * - PromptGenomeInjector: 软表达 - Prompt 性格注入（可见影响）
 * - GeneLogger: 三层日志系统（SQLite + Arweave + Base L2）
 * - Contract Interface: Base L2 事件发射
 */

// 硬表达 (Hard Expression)
export { GeneExpressionEngine, sigmoidMap } from './engine';
export { GeneLogger, createGeneLogDb } from './logger';
export {
  GENE_LOG_ABI,
  createGeneLogContract,
  emitGeneCheckpoint,
  emitAgentDeath,
} from './contract';

// 软表达 (Soft Expression)
export {
  PromptGenomeInjector,
  createPromptInjector,
} from './soft-expression';

// 类型导出
export type { GeneExpressionEngine as default } from './engine';
export type { GeneLogger as default } from './logger';
export type { PromptGenomeInjector as default } from './soft-expression';
