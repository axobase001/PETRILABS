/**
 * Gene Expression Module
 * 基因表达引擎 - 双模态基因表达系统的核心
 * 
 * 包含：
 * - GeneExpressionEngine: 基因 × 环境 = 表型
 * - GeneLogger: 三层日志系统（SQLite + Arweave + Base L2）
 * - Contract Interface: Base L2 事件发射
 */

export { GeneExpressionEngine, sigmoidMap } from './engine';
export { GeneLogger, createGeneLogDb } from './logger';
export {
  GENE_LOG_ABI,
  createGeneLogContract,
  emitGeneCheckpoint,
  emitAgentDeath,
} from './contract';

// 类型导出
export type { GeneExpressionEngine as default } from './engine';
export type { GeneLogger as default } from './logger';
