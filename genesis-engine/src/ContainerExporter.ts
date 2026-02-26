/**
 * ContainerExporter
 * 容器导出器
 * 
 * 将完整基因组导出为容器部署格式
 */

import * as fs from 'fs';
import type { GenomeMapping } from './MappingLayer';

export interface DeployableGenome {
  genome_version: string;
  agent_id: string;
  birth_type: 'GENESIS';
  timestamp: string;
  chromosomes: {
    [chromosome: string]: {
      [gene: string]: {
        value: number;
        confidence: number;
      };
    };
  };
  expression_config: {
    confidence_threshold: number;
    default_value: number;
  };
}

export class ContainerExporter {
  /**
   * 导出为容器部署格式
   */
  exportForContainer(
    mapping: GenomeMapping,
    agentId: string
  ): DeployableGenome {
    const deployable: DeployableGenome = {
      genome_version: mapping.genome_version || '1.0',
      agent_id: agentId,
      birth_type: 'GENESIS',
      timestamp: new Date().toISOString(),
      chromosomes: {},
      expression_config: {
        confidence_threshold: 0.6,
        default_value: 0.50
      }
    };
    
    // 复制染色体数据（去除 evidence）
    for (const [chromName, genes] of Object.entries(mapping.chromosomes)) {
      deployable.chromosomes[chromName] = {};
      for (const [geneName, geneData] of Object.entries(genes)) {
        deployable.chromosomes[chromName][geneName] = {
          value: geneData.value,
          confidence: geneData.confidence
        };
      }
    }
    
    return deployable;
  }
  
  /**
   * 保存为 JSON 文件
   */
  saveToFile(genome: DeployableGenome, filePath: string): void {
    fs.writeFileSync(filePath, JSON.stringify(genome, null, 2));
    console.log(`[ContainerExporter] Genome saved to ${filePath}`);
  }
  
  /**
   * 序列化为 JSON 字符串
   */
  serialize(genome: DeployableGenome): string {
    return JSON.stringify(genome, null, 2);
  }
}

/**
 * 容器端读取接口（在 Akash 容器内运行）
 */
export function loadGenome(path: string = '/data/genome.json'): DeployableGenome {
  const raw = fs.readFileSync(path, 'utf-8');
  const genome = JSON.parse(raw) as DeployableGenome;
  
  // 验证
  if (genome.genome_version !== '1.0') {
    throw new Error(`Unsupported genome version: ${genome.genome_version}`);
  }
  
  return genome;
}

/**
 * 获取基因值（支持 confidence 阈值）
 */
export function getGeneValue(
  genome: DeployableGenome,
  chromosome: string,
  gene: string
): number {
  const geneData = genome.chromosomes[chromosome]?.[gene];
  if (!geneData) {
    return genome.expression_config.default_value;
  }
  
  // confidence 低于阈值时返回默认值
  if (geneData.confidence < genome.expression_config.confidence_threshold) {
    return genome.expression_config.default_value;
  }
  
  return geneData.value;
}

/**
 * 获取基因详情（包含 confidence）
 */
export function getGeneDetail(
  genome: DeployableGenome,
  chromosome: string,
  gene: string
): { value: number; confidence: number; isDefault: boolean } | null {
  const geneData = genome.chromosomes[chromosome]?.[gene];
  if (!geneData) {
    return {
      value: genome.expression_config.default_value,
      confidence: 0,
      isDefault: true
    };
  }
  
  const isDefault = geneData.confidence < genome.expression_config.confidence_threshold;
  
  return {
    value: isDefault ? genome.expression_config.default_value : geneData.value,
    confidence: geneData.confidence,
    isDefault
  };
}

// 单例
export const containerExporter = new ContainerExporter();

export default ContainerExporter;
