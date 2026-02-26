/**
 * Genesis Engine
 * 记忆文件 → 动态基因组的完整管线
 * 
 * 导出所有模块和类型
 */

// 核心引擎
export { GenesisEngine, genesisEngine } from './GenesisEngine';
export type { GenesisResult, GenesisOptions } from './GenesisEngine';

// 各层模块
export { StandardizationLayer, standardizationLayer } from './StandardizationLayer';
export { MappingLayer, mappingLayer } from './MappingLayer';
export { GenomeValidator, genomeValidator } from './GenomeValidator';
export { ContainerExporter, containerExporter } from './ContainerExporter';
export { LLMClient, llmClient } from './LLMClient';

// 类型
export type { StandardizedProfile } from './StandardizationLayer';
export type { GenomeMapping, GeneValue } from './MappingLayer';
export type { ValidationResult } from './GenomeValidator';
export type { DeployableGenome } from './ContainerExporter';
export type { LLMCallOptions, LLMResponse } from './LLMClient';

// 默认导出
export { GenesisEngine as default } from './GenesisEngine';

/**
 * 快速开始
 * 
 * ```typescript
 * import { genesisEngine } from 'genesis-engine';
 * 
 * const result = await genesisEngine.generateGenome(rawText);
 * 
 * if (result.success) {
 *   console.log('Genome generated:', result.genome);
 *   console.log('Deployable:', result.deployable);
 * }
 * ```
 */
