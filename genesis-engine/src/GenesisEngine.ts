/**
 * GenesisEngine
 * 基因组生成引擎 - 完整调用流程
 * 
 * standardize → map → validate → export
 */

import { StandardizationLayer, StandardizedProfile } from './StandardizationLayer';
import { MappingLayer, GenomeMapping } from './MappingLayer';
import { GenomeValidator, ValidationResult } from './GenomeValidator';
import { ContainerExporter, DeployableGenome } from './ContainerExporter';

export interface GenesisResult {
  success: boolean;
  standardized: StandardizedProfile | null;
  genome: GenomeMapping | null;
  deployable: DeployableGenome | null;
  validation: ValidationResult | null;
  agentId: string;
  error?: string;
}

export interface GenesisOptions {
  agentId?: string;
  skipValidation?: boolean;
}

export class GenesisEngine {
  private standardizationLayer: StandardizationLayer;
  private mappingLayer: MappingLayer;
  private validator: GenomeValidator;
  private exporter: ContainerExporter;
  
  constructor() {
    this.standardizationLayer = new StandardizationLayer();
    this.mappingLayer = new MappingLayer();
    this.validator = new GenomeValidator();
    this.exporter = new ContainerExporter();
  }
  
  /**
   * 从原始输入生成完整基因组
   * 
   * 完整流程：
   * 1. 标准化（任意格式 → 人格摘要）
   * 2. 映射（人格摘要 → 63基因基因组）
   * 3. 验证（检查基因组质量）
   * 4. 导出（生成容器部署格式）
   */
  async generateGenome(
    rawInput: string,
    options: GenesisOptions = {}
  ): Promise<GenesisResult> {
    const agentId = options.agentId || `agent-${Date.now()}`;
    
    console.log(`[GenesisEngine] Starting genome generation for ${agentId}`);
    console.log(`[GenesisEngine] Input length: ${rawInput.length} chars`);
    
    try {
      // Step 1: 标准化
      console.log('[GenesisEngine] Step 1/4: Standardizing...');
      const standardized = await this.standardizationLayer.standardize(rawInput);
      
      // Step 2: 映射
      console.log('[GenesisEngine] Step 2/4: Mapping to genome...');
      const genome = await this.mappingLayer.map(standardized);
      
      // Step 3: 验证
      let validation: ValidationResult | null = null;
      if (!options.skipValidation) {
        console.log('[GenesisEngine] Step 3/4: Validating...');
        validation = this.validator.validate(genome);
        
        if (!validation.valid) {
          console.error('[GenesisEngine] Validation failed:', validation.errors);
          return {
            success: false,
            standardized,
            genome,
            deployable: null,
            validation,
            agentId,
            error: `Validation failed: ${validation.errors.join(', ')}`
          };
        }
        
        if (validation.warnings.length > 0) {
          console.warn('[GenesisEngine] Validation warnings:', validation.warnings);
        }
      }
      
      // Step 4: 导出
      console.log('[GenesisEngine] Step 4/4: Exporting...');
      const deployable = this.exporter.exportForContainer(genome, agentId);
      
      console.log('[GenesisEngine] Genome generation complete!');
      
      return {
        success: true,
        standardized,
        genome,
        deployable,
        validation,
        agentId
      };
      
    } catch (error) {
      console.error('[GenesisEngine] Generation failed:', error);
      return {
        success: false,
        standardized: null,
        genome: null,
        deployable: null,
        validation: null,
        agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * 批量生成（预留接口）
   */
  async batchGenerate(
    inputs: string[],
    options: GenesisOptions = {}
  ): Promise<GenesisResult[]> {
    const results: GenesisResult[] = [];
    
    for (let i = 0; i < inputs.length; i++) {
      console.log(`[GenesisEngine] Processing ${i + 1}/${inputs.length}`);
      const result = await this.generateGenome(inputs[i], {
        ...options,
        agentId: `${options.agentId || 'agent'}-${i}`
      });
      results.push(result);
    }
    
    return results;
  }
}

// 单例
export const genesisEngine = new GenesisEngine();

export default GenesisEngine;

// 重新导出所有类型
export { StandardizedProfile } from './StandardizationLayer';
export { GenomeMapping, GeneValue } from './MappingLayer';
export { ValidationResult } from './GenomeValidator';
export { DeployableGenome } from './ContainerExporter';
