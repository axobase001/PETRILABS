/**
 * MappingLayer
 * 映射层：标准化人格摘要 → 63基因动态基因组
 */

import { llmClient } from './LLMClient';
import * as fs from 'fs';
import * as path from 'path';
import type { StandardizedProfile } from './StandardizationLayer';

export interface GeneValue {
  value: number;       // 0.00-1.00
  confidence: number;  // 0.00-1.00
  evidence: string;    // 文本证据
}

export interface GenomeMapping {
  genome_version: string;
  generated_from: string;
  generation_method: string;
  timestamp: string;
  chromosomes: {
    A_metabolism: Record<string, GeneValue>;
    B_cognition: Record<string, GeneValue>;
    C_behavior: Record<string, GeneValue>;
    D_capability: Record<string, GeneValue>;
    E_social: Record<string, GeneValue>;
    F_strategy: Record<string, GeneValue>;
    G_resilience: Record<string, GeneValue>;
    H_identity: Record<string, GeneValue>;
  };
  quality_metrics: {
    total_genes: number;
    high_confidence_count: number;
    medium_confidence_count: number;
    low_confidence_count: number;
    extreme_value_count: number;
    average_confidence: number;
    mapping_notes: string;
  };
}

export class MappingLayer {
  private prompt: string;
  
  constructor() {
    const promptPath = path.join(__dirname, 'prompts', 'mapping.txt');
    this.prompt = fs.readFileSync(promptPath, 'utf-8');
  }
  
  /**
   * 将标准化人格摘要映射为基因组
   */
  async map(profile: StandardizedProfile): Promise<GenomeMapping> {
    const profileJson = JSON.stringify(profile, null, 2);
    
    console.log('[Mapping] Starting genome mapping...');
    
    const response = await llmClient.call({
      system: this.prompt,
      user: `请将以下标准化人格摘要映射为 63 基因基因组：\n\n${profileJson}`,
      jsonMode: true,
      temperature: 0.3,  // 低温度确保一致性
      seed: 42
    });
    
    try {
      const genome = JSON.parse(response.content) as GenomeMapping;
      
      // 验证结构
      this.validateGenome(genome);
      
      // 计算质量指标（如果 LLM 没提供）
      if (!genome.quality_metrics) {
        genome.quality_metrics = this.calculateQualityMetrics(genome);
      }
      
      console.log(`[Mapping] Complete. Total genes: ${genome.quality_metrics.total_genes}`);
      console.log(`[Mapping] High confidence: ${genome.quality_metrics.high_confidence_count}`);
      console.log(`[Mapping] Average confidence: ${genome.quality_metrics.average_confidence.toFixed(2)}`);
      
      return genome;
      
    } catch (error) {
      console.error('[Mapping] Failed to parse LLM response:', response.content.substring(0, 500));
      throw new Error(`Failed to parse genome mapping: ${error}`);
    }
  }
  
  /**
   * 验证基因组结构
   */
  private validateGenome(genome: any): void {
    if (!genome.chromosomes) {
      throw new Error('Missing chromosomes in genome');
    }
    
    const expectedChromosomes = [
      'A_metabolism', 'B_cognition', 'C_behavior', 'D_capability',
      'E_social', 'F_strategy', 'G_resilience', 'H_identity'
    ];
    
    for (const chrom of expectedChromosomes) {
      if (!genome.chromosomes[chrom]) {
        throw new Error(`Missing chromosome: ${chrom}`);
      }
    }
  }
  
  /**
   * 计算质量指标
   */
  private calculateQualityMetrics(genome: GenomeMapping): GenomeMapping['quality_metrics'] {
    let totalGenes = 0;
    let highConfidence = 0;
    let mediumConfidence = 0;
    let lowConfidence = 0;
    let extremeValues = 0;
    let totalConfidence = 0;
    
    for (const chromName in genome.chromosomes) {
      const chrom = genome.chromosomes[chromName as keyof typeof genome.chromosomes];
      for (const geneName in chrom) {
        const gene = chrom[geneName];
        totalGenes++;
        totalConfidence += gene.confidence;
        
        if (gene.confidence >= 0.8) {
          highConfidence++;
        } else if (gene.confidence >= 0.6) {
          mediumConfidence++;
        } else {
          lowConfidence++;
        }
        
        if (gene.value <= 0.25 || gene.value >= 0.75) {
          extremeValues++;
        }
      }
    }
    
    return {
      total_genes: totalGenes,
      high_confidence_count: highConfidence,
      medium_confidence_count: mediumConfidence,
      low_confidence_count: lowConfidence,
      extreme_value_count: extremeValues,
      average_confidence: totalGenes > 0 ? totalConfidence / totalGenes : 0,
      mapping_notes: `Auto-calculated. ${highConfidence} high, ${mediumConfidence} medium, ${lowConfidence} low confidence genes.`
    };
  }
}

// 单例
export const mappingLayer = new MappingLayer();

export default MappingLayer;
