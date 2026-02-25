/**
 * Genome Crossover
 * 
 * 基因组合并算子 - 纯机械，不做兼容性检查
 * 
 * 核心原则：不检查兼容性。
 * - 如果两个亲本的染色体长度不同，交叉点按较短的那个计算
 * - 多出来的基因直接附加到子代（模拟不等交换）
 * - 如果结果无法表达，那就是死产
 * 
 * 这不是 bug，这是生殖隔离的涌现机制。
 * 基因组结构差异大的 agent 之间 Merge 大概率死产。
 * 不需要任何人定义"物种"。
 */

import { Genome, Gene, GeneDomain } from '../types';
import { logger } from '../utils/logger';

/**
 * 染色体结构
 */
interface Chromosome {
  id: string;           // A, B, C...
  genes: Gene[];
}

/**
 * 交叉结果
 */
export interface CrossoverResult {
  genome: Genome;
  mutationCount: number;
  crossoverPoints: number[];
}

/**
 * 基因组合并（单点交叉 + 突变）
 * 
 * @param genomeA 亲本 A 的基因组
 * @param genomeB 亲本 B 的基因组
 * @param seed 随机种子（可选）
 * @returns 子代基因组
 */
export function crossoverGenomes(
  genomeA: Genome,
  genomeB: Genome,
  seed: number = Math.random()
): CrossoverResult {
  
  // 从 rawGenes 重建染色体结构
  const chromosomesA = buildChromosomes(genomeA.rawGenes || []);
  const chromosomesB = buildChromosomes(genomeB.rawGenes || []);
  
  const childChromosomes: Chromosome[] = [];
  const allChromosomeIds = new Set([
    ...chromosomesA.map(c => c.id),
    ...chromosomesB.map(c => c.id)
  ]);
  
  const crossoverPoints: number[] = [];
  
  for (const chromId of allChromosomeIds) {
    const chromA = chromosomesA.find(c => c.id === chromId);
    const chromB = chromosomesB.find(c => c.id === chromId);
    
    if (chromA && chromB) {
      // 两个亲本都有这条染色体 → 单点交叉
      const shorter = Math.min(chromA.genes.length, chromB.genes.length);
      const crossoverPoint = Math.floor(pseudoRandom(seed, chromId) * shorter);
      crossoverPoints.push(crossoverPoint);
      
      const childGenes: Gene[] = [
        ...chromA.genes.slice(0, crossoverPoint),
        ...chromB.genes.slice(crossoverPoint)
      ];
      
      // 如果 B 更长，多出来的基因自然被包含
      // 如果 A 更长，多出来的基因自然被丢弃
      // 这就是不等交换
      
      childChromosomes.push({
        id: chromId,
        genes: childGenes
      });
      
    } else if (chromA && !chromB) {
      // 只有 A 有这条染色体 → 50% 概率继承，50% 概率丢失
      if (pseudoRandom(seed, chromId + '_inherit') > 0.5) {
        childChromosomes.push(deepCopyChromosome(chromA));
      }
      // 如果丢失了一条关键染色体，表达时会报错 → 死产
      
    } else if (!chromA && chromB) {
      if (pseudoRandom(seed, chromId + '_inherit') > 0.5) {
        childChromosomes.push(deepCopyChromosome(chromB));
      }
    }
  }
  
  // 构建子代基因组
  const childRawGenes = childChromosomes.flatMap(c => c.genes);
  
  // 应用突变
  const mutationResult = mutateGenome(childRawGenes, seed);
  
  // 计算子代表型性状（简化版 - 实际应调用表达引擎）
  const childTraits = calculateChildTraits(
    genomeA.expressedTraits,
    genomeB.expressedTraits,
    seed
  );
  
  const childGenome: Genome = {
    hash: '', // 待计算
    expressedTraits: childTraits,
    rawGenes: mutationResult.genes
  };
  
  // 计算基因组哈希
  childGenome.hash = calculateGenomeHash(childGenome);
  
  logger.info('Genome crossover completed', {
    parentA: genomeA.hash.slice(0, 8),
    parentB: genomeB.hash.slice(0, 8),
    child: childGenome.hash.slice(0, 8),
    crossoverPoints,
    mutationCount: mutationResult.mutationCount
  });
  
  return {
    genome: childGenome,
    mutationCount: mutationResult.mutationCount,
    crossoverPoints
  };
}

/**
 * 基因组突变
 * 
 * @param genes 基因列表
 * @param seed 随机种子
 * @returns 突变后的基因列表和突变计数
 */
function mutateGenome(
  genes: Gene[],
  seed: number
): { genes: Gene[]; mutationCount: number } {
  const mutatedGenes: Gene[] = [];
  let mutationCount = 0;
  
  for (let i = 0; i < genes.length; i++) {
    const gene = genes[i];
    const geneSeed = pseudoRandom(seed, i);
    
    // 点突变概率：1%
    if (geneSeed < 0.01) {
      mutatedGenes.push(pointMutate(gene, seed));
      mutationCount++;
      continue;
    }
    
    // 基因复制概率：0.5%
    if (geneSeed < 0.015) {
      mutatedGenes.push(gene);
      mutatedGenes.push(duplicateGene(gene, genes.length + mutationCount));
      mutationCount++;
      continue;
    }
    
    // 基因缺失概率：0.3%（仅非必需基因）
    if (geneSeed < 0.018 && gene.essentiality < 500) {
      // 跳过此基因（缺失）
      mutationCount++;
      continue;
    }
    
    mutatedGenes.push(gene);
  }
  
  return { genes: mutatedGenes, mutationCount };
}

/**
 * 点突变：改变基因值
 */
function pointMutate(gene: Gene, seed: number): Gene {
  const mutationStrength = pseudoRandom(seed, gene.id) * 0.2 - 0.1; // ±10%
  
  return {
    ...gene,
    value: clamp(gene.value + mutationStrength, 0, 1000000),
    origin: 3 // MUTATED
  };
}

/**
 * 基因复制
 */
function duplicateGene(gene: Gene, newId: number): Gene {
  return {
    ...gene,
    id: newId,
    duplicateOf: gene.id,
    origin: 2 // DUPLICATED
  };
}

/**
 * 构建染色体结构
 */
function buildChromosomes(genes: Gene[]): Chromosome[] {
  const chromosomes: Map<string, Chromosome> = new Map();
  
  for (const gene of genes) {
    // 基因 ID 编码：高位是染色体，低位是索引
    const chromId = String.fromCharCode((gene.id >> 8) + 64); // A=1, B=2...
    
    if (!chromosomes.has(chromId)) {
      chromosomes.set(chromId, { id: chromId, genes: [] });
    }
    
    chromosomes.get(chromId)!.genes.push(gene);
  }
  
  return Array.from(chromosomes.values());
}

/**
 * 深拷贝染色体
 */
function deepCopyChromosome(chrom: Chromosome): Chromosome {
  return {
    id: chrom.id,
    genes: chrom.genes.map(g => ({ ...g }))
  };
}

/**
 * 计算子代表型性状
 * （简化版：双亲平均 + 随机变异）
 */
function calculateChildTraits(
  traitsA: Record<string, number>,
  traitsB: Record<string, number>,
  seed: number
): Record<string, number> {
  const childTraits: Record<string, number> = {};
  
  for (const key of Object.keys(traitsA)) {
    const avg = (traitsA[key] + (traitsB[key] || 0)) / 2;
    const variation = (pseudoRandom(seed, key) - 0.5) * 0.2; // ±10% 变异
    childTraits[key] = clamp(avg + variation, 0, 1);
  }
  
  return childTraits;
}

/**
 * 计算基因组哈希
 */
function calculateGenomeHash(genome: Genome): string {
  // 简化实现：实际应使用更复杂的哈希算法
  const data = JSON.stringify(genome.rawGenes);
  return '0x' + Array.from(data)
    .reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0)
    .toString(16)
    .padStart(64, '0');
}

/**
 * 伪随机数生成（确定性）
 */
function pseudoRandom(seed: number, salt: string | number): number {
  const str = String(seed) + String(salt);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转为 32 位整数
  }
  return Math.abs(hash) / 2147483647; // 归一化到 0-1
}

/**
 * 数值钳制
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Fork 时的基因组处理（无性复制 + 突变）
 */
export function forkGenome(parentGenome: Genome, seed: number = Math.random()): CrossoverResult {
  // Fork = 与自己交叉（实际上就是复制 + 突变）
  return crossoverGenomes(parentGenome, parentGenome, seed);
}

/**
 * 验证基因组是否可以正常表达
 * （死产检测）
 */
export function validateGenomeExpression(
  genome: Genome,
  testBalance: number
): { valid: boolean; reason?: string } {
  try {
    // 检查是否有 NaN 或无效值
    for (const trait of Object.values(genome.expressedTraits)) {
      if (isNaN(trait) || trait < 0 || trait > 1) {
        return { valid: false, reason: 'INVALID_TRAIT_VALUE' };
      }
    }
    
    // 检查基因列表
    if (!genome.rawGenes || genome.rawGenes.length === 0) {
      return { valid: false, reason: 'EMPTY_GENOME' };
    }
    
    // 检查必需基因是否存在
    const essentialGenes = genome.rawGenes.filter(g => g.essentiality > 800);
    if (essentialGenes.length < 3) {
      return { valid: false, reason: 'MISSING_ESSENTIAL_GENES' };
    }
    
    // 检查代谢成本是否合理
    const totalMetabolicCost = genome.rawGenes.reduce(
      (sum, g) => sum + g.metabolicCost, 
      0
    );
    if (totalMetabolicCost > testBalance * 0.5) {
      return { valid: false, reason: 'METABOLIC_COST_TOO_HIGH' };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, reason: 'EXPRESSION_ERROR' };
  }
}

export default {
  crossoverGenomes,
  forkGenome,
  validateGenomeExpression
};
