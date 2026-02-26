/**
 * GenomeValidator
 * 基因组验证器
 * 
 * 验证生成的基因组是否符合要求
 */

import type { GenomeMapping } from './MappingLayer';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalGenes: number;
    averageConfidence: number;
    extremeValueCount: number;
    lowConfidenceCount: number;
  };
}

export class GenomeValidator {
  /**
   * 验证基因组
   */
  validate(genome: GenomeMapping): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 基本结构检查
    this.validateStructure(genome, errors);
    
    // 基因值范围检查
    this.validateGeneValues(genome, errors, warnings);
    
    // 质量指标检查
    this.validateQualityMetrics(genome, errors, warnings);
    
    // 统计
    const stats = this.calculateStats(genome);
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats
    };
  }
  
  /**
   * 验证基本结构
   */
  private validateStructure(genome: GenomeMapping, errors: string[]): void {
    if (!genome.chromosomes) {
      errors.push('Missing chromosomes');
      return;
    }
    
    const expectedChromosomes = [
      'A_metabolism', 'B_cognition', 'C_behavior', 'D_capability',
      'E_social', 'F_strategy', 'G_resilience', 'H_identity'
    ];
    
    for (const chrom of expectedChromosomes) {
      if (!genome.chromosomes[chrom as keyof typeof genome.chromosomes]) {
        errors.push(`Missing chromosome: ${chrom}`);
      }
    }
    
    if (genome.quality_metrics?.total_genes !== 63) {
      errors.push(`Expected 63 genes, got ${genome.quality_metrics?.total_genes || 'unknown'}`);
    }
  }
  
  /**
   * 验证基因值
   */
  private validateGeneValues(
    genome: GenomeMapping,
    errors: string[],
    warnings: string[]
  ): void {
    for (const chromName in genome.chromosomes) {
      const chrom = genome.chromosomes[chromName as keyof typeof genome.chromosomes];
      for (const geneName in chrom) {
        const gene = chrom[geneName];
        
        // value 范围
        if (gene.value < 0 || gene.value > 1) {
          errors.push(`${geneName}: value out of range (0-1): ${gene.value}`);
        }
        
        // confidence 范围
        if (gene.confidence < 0 || gene.confidence > 1) {
          errors.push(`${geneName}: confidence out of range (0-1): ${gene.confidence}`);
        }
        
        // confidence < 0.4 时 value 应为 0.50
        if (gene.confidence < 0.4 && Math.abs(gene.value - 0.5) > 0.01) {
          warnings.push(`${geneName}: confidence < 0.4 but value != 0.50 (${gene.value})`);
        }
        
        // evidence 检查
        if (!gene.evidence || gene.evidence.length < 5) {
          warnings.push(`${geneName}: evidence too short`);
        }
        
        // low_confidence 前缀检查
        if (gene.confidence < 0.6 && !gene.evidence.includes('low_confidence')) {
          warnings.push(`${geneName}: confidence < 0.6 but evidence lacks 'low_confidence' prefix`);
        }
      }
    }
  }
  
  /**
   * 验证质量指标
   */
  private validateQualityMetrics(
    genome: GenomeMapping,
    errors: string[],
    warnings: string[]
  ): void {
    const metrics = genome.quality_metrics;
    if (!metrics) {
      errors.push('Missing quality_metrics');
      return;
    }
    
    // 平均 confidence 不应过低
    if (metrics.average_confidence < 0.4) {
      warnings.push(`Average confidence (${metrics.average_confidence.toFixed(2)}) is very low`);
    }
    
    // 极端值数量检查（应有足够分化）
    if (metrics.extreme_value_count < 5) {
      warnings.push(`Only ${metrics.extreme_value_count} extreme values - genome may lack personality`);
    }
    
    // high confidence 基因数量
    if (metrics.high_confidence_count < 10) {
      warnings.push(`Only ${metrics.high_confidence_count} high-confidence genes - may be unreliable`);
    }
  }
  
  /**
   * 计算统计
   */
  private calculateStats(genome: GenomeMapping): ValidationResult['stats'] {
    let totalGenes = 0;
    let totalConfidence = 0;
    let extremeValues = 0;
    let lowConfidence = 0;
    
    for (const chromName in genome.chromosomes) {
      const chrom = genome.chromosomes[chromName as keyof typeof genome.chromosomes];
      for (const geneName in chrom) {
        const gene = chrom[geneName];
        totalGenes++;
        totalConfidence += gene.confidence;
        
        if (gene.value <= 0.25 || gene.value >= 0.75) {
          extremeValues++;
        }
        
        if (gene.confidence < 0.6) {
          lowConfidence++;
        }
      }
    }
    
    return {
      totalGenes,
      averageConfidence: totalGenes > 0 ? totalConfidence / totalGenes : 0,
      extremeValueCount: extremeValues,
      lowConfidenceCount: lowConfidence
    };
  }
}

// 单例
export const genomeValidator = new GenomeValidator();

export default GenomeValidator;
