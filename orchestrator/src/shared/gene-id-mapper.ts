/**
 * Gene ID Mapper
 * 
 * 统一基因 ID 编码/解码系统
 * 
 * 编码规则:
 * - 'A01' => 0x0101 (染色体 A = 1, 索引 1)
 * - 'B12' => 0x020C (染色体 B = 2, 索引 12)
 * - 'C05' => 0x0305 (染色体 C = 3, 索引 5)
 * 
 * 合约使用 uint32 存储基因 ID，格式: (chromosome << 8) | index
 */

/**
 * 将染色体+索引编码为 uint32 基因 ID
 * 
 * @param chromosome 染色体字母 (A-Z)
 * @param index 基因索引 (0-255)
 * @returns 编码后的基因 ID
 */
export function encodeGeneId(chromosome: string, index: number): number {
  if (chromosome.length !== 1 || chromosome < 'A' || chromosome > 'Z') {
    throw new Error(`Invalid chromosome: ${chromosome}. Must be A-Z.`);
  }
  if (index < 0 || index > 255) {
    throw new Error(`Invalid index: ${index}. Must be 0-255.`);
  }
  
  const chr = chromosome.charCodeAt(0) - 64; // A=1, B=2, ...
  return (chr << 8) | index;
}

/**
 * 解码基因 ID 为染色体+索引
 * 
 * @param id 编码后的基因 ID
 * @returns { chromosome: string, index: number }
 */
export function decodeGeneId(id: number): { chromosome: string; index: number } {
  const chr = String.fromCharCode((id >> 8) + 64);
  const idx = id & 0xFF;
  
  return {
    chromosome: chr,
    index: idx,
  };
}

/**
 * 将基因 ID 格式化为人类可读字符串
 * 
 * @param id 基因 ID
 * @returns 格式如 "A01", "B12"
 */
export function formatGeneId(id: number): string {
  const { chromosome, index } = decodeGeneId(id);
  return `${chromosome}${index.toString().padStart(2, '0')}`;
}

/**
 * 解析人类可读基因 ID 字符串
 * 
 * @param str 格式如 "A01", "B12"
 * @returns 编码后的基因 ID
 */
export function parseGeneId(str: string): number {
  const match = str.match(/^([A-Z])(\d{1,3})$/);
  if (!match) {
    throw new Error(`Invalid gene ID format: ${str}. Expected format: A01, B12, etc.`);
  }
  
  const chromosome = match[1];
  const index = parseInt(match[2], 10);
  
  return encodeGeneId(chromosome, index);
}

/**
 * 获取染色体名称
 * 
 * @param id 基因 ID
 * @returns 染色体字母
 */
export function getChromosome(id: number): string {
  return String.fromCharCode((id >> 8) + 64);
}

/**
 * 获取基因在染色体上的索引
 * 
 * @param id 基因 ID
 * @returns 索引 (0-255)
 */
export function getIndex(id: number): number {
  return id & 0xFF;
}

/**
 * 检查基因 ID 是否有效
 * 
 * @param id 基因 ID
 * @returns 是否有效
 */
export function isValidGeneId(id: number): boolean {
  if (id < 0 || id > 0xFFFF) return false;
  const chr = id >> 8;
  return chr >= 1 && chr <= 26; // A-Z
}

/**
 * 批量编码基因 ID 列表
 * 
 * @param genes { chromosome: string, index: number }[]
 * @returns number[]
 */
export function encodeGeneIds(genes: Array<{ chromosome: string; index: number }>): number[] {
  return genes.map(g => encodeGeneId(g.chromosome, g.index));
}

/**
 * 批量解码基因 ID 列表
 * 
 * @param ids number[]
 * @returns { chromosome: string, index: number }[]
 */
export function decodeGeneIds(ids: number[]): Array<{ chromosome: string; index: number }> {
  return ids.map(id => decodeGeneId(id));
}

/**
 * 基因 ID 常量定义
 * 预定义的常用基因 ID
 */
export const GENE_IDS = {
  // A 染色体: 基础代谢
  A01_METABOLISM_BASE: encodeGeneId('A', 1),
  A02_ENERGY_EFFICIENCY: encodeGeneId('A', 2),
  
  // B 染色体: 感知
  B01_PERCEPTION_RANGE: encodeGeneId('B', 1),
  B02_RISK_SENSITIVITY: encodeGeneId('B', 2),
  
  // C 染色体: 认知
  C01_DECISION_SPEED: encodeGeneId('C', 1),
  C02_LEARNING_RATE: encodeGeneId('C', 2),
  
  // D 染色体: 资源管理
  D01_BUDGET_CONSERVATIVE: encodeGeneId('D', 1),
  D02_BUDGET_AGGRESSIVE: encodeGeneId('D', 2),
  
  // E 染色体: 链上操作
  E01_TRADING_FREQUENCY: encodeGeneId('E', 1),
  E02_GAS_PRICE_TOLERANCE: encodeGeneId('E', 2),
} as const;

/**
 * 基因 ID 描述映射
 */
export const GENE_DESCRIPTIONS: Record<number, string> = {
  [GENE_IDS.A01_METABOLISM_BASE]: '基础代谢率',
  [GENE_IDS.A02_ENERGY_EFFICIENCY]: '能量效率',
  [GENE_IDS.B01_PERCEPTION_RANGE]: '感知范围',
  [GENE_IDS.B02_RISK_SENSITIVITY]: '风险敏感度',
  [GENE_IDS.C01_DECISION_SPEED]: '决策速度',
  [GENE_IDS.C02_LEARNING_RATE]: '学习率',
  [GENE_IDS.D01_BUDGET_CONSERVATIVE]: '保守预算',
  [GENE_IDS.D02_BUDGET_AGGRESSIVE]: '激进预算',
  [GENE_IDS.E01_TRADING_FREQUENCY]: '交易频率',
  [GENE_IDS.E02_GAS_PRICE_TOLERANCE]: 'Gas价格容忍度',
};

/**
 * 获取基因描述
 * 
 * @param id 基因 ID
 * @returns 描述文本
 */
export function getGeneDescription(id: number): string {
  return GENE_DESCRIPTIONS[id] || `Unknown Gene ${formatGeneId(id)}`;
}

export default {
  encodeGeneId,
  decodeGeneId,
  formatGeneId,
  parseGeneId,
  getChromosome,
  getIndex,
  isValidGeneId,
  encodeGeneIds,
  decodeGeneIds,
  GENE_IDS,
  GENE_DESCRIPTIONS,
  getGeneDescription,
};
