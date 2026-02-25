/**
 * ═══ 日志成本估算 ═══
 * 
 * 为什么不实时写 Arweave：
 *   单次 Arweave 写入（通过 Irys bundler）：~$0.00005-0.0001 per KB
 *   单条 GeneOverrideLog：~0.5 KB
 *   假设每天 100 次覆盖 = 50KB/天 = ~$0.005/天 = ~$0.15/月
 *   看似便宜，但：
 *     - 10 个 agent = $1.5/月
 *     - Arweave 挖矿确认 2-10 分钟，不适合高频写入
 *     - 网络波动可能导致写入失败，影响决策循环
 *   结论：不值得为每条日志承担延迟和失败风险
 * 
 * 当前方案成本：
 *   SQLite 本地写入：$0（容器内存储）
 *   Arweave Checkpoint（每 100 心跳 1 次）：
 *     ~1KB/次，假设心跳间隔 30 秒，100 次 = 50 分钟
 *     1 天 ≈ 29 次 checkpoint = ~$0.003/天
 *   Base L2 事件发射：
 *     ~$0.0001/次，29 次/天 = ~$0.003/天
 *   死亡归档（一次性）：
 *     压缩后 5-20KB，~$0.002
 * 
 *   总计：~$0.008/天/agent = ~$0.24/月/agent
 *   对比实时 Arweave：节省 ~40%，且零延迟风险
 */

import Database from 'better-sqlite3';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import { GeneOverrideLog, CompressedOverrideLog, DeathMemory } from '../types';

/**
 * 创建 SQLite 数据库连接
 * 配置优化：WAL 模式 + NORMAL 同步 + 内存映射
 */
export function createGeneLogDb(path: string = '/app/data/gene_overrides.db'): Database.Database {
  const db = new Database(path);
  
  // WAL 模式：写入不阻塞读取，崩溃恢复更可靠
  db.pragma('journal_mode = WAL');
  
  // 同步模式 NORMAL：平衡性能和持久性（容器崩溃最多丢 1 次写入）
  db.pragma('synchronous = NORMAL');
  
  // 内存映射 64MB：加速频繁读写
  db.pragma('mmap_size = 67108864');
  
  // 创建表结构
  db.exec(`
    CREATE TABLE IF NOT EXISTS gene_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      block_height INTEGER,
      trait TEXT NOT NULL,
      gene_value REAL NOT NULL,
      original_decision TEXT,
      constrained_decision TEXT,
      constraint_type TEXT,
      balance REAL,
      stress_level REAL,
      cognition_tier TEXT,
      metabolic_count INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS dissonance_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      rate REAL NOT NULL,
      window_size INTEGER,
      top_trait TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_overrides_timestamp ON gene_overrides(timestamp);
    CREATE INDEX IF NOT EXISTS idx_overrides_trait ON gene_overrides(trait);
    CREATE INDEX IF NOT EXISTS idx_overrides_metabolic ON gene_overrides(metabolic_count);
  `);
  
  return db;
}

/**
 * 基因日志记录器
 * 三层日志架构：
 * 1. SQLite 热层（实时写入）
 * 2. Arweave 温层（checkpoint 归档）
 * 3. Base L2 索引层（事件指针）
 */
export class GeneLogger {
  private db: Database.Database;
  private agentId: string;
  private metabolicCount: number = 0;
  private lastCheckpointTimestamp: number = 0;
  private readonly CHECKPOINT_INTERVAL = 100;  // 每 100 次代谢心跳
  
  // Arweave 和合约引用（由外部注入）
  private arweave: {
    upload(data: { tags: Record<string, string>; data: string }): Promise<string>;
  } | null = null;
  
  private geneLogContract: ethers.Contract | null = null;
  
  constructor(config: {
    agentId: string;
    dbPath?: string;
    arweave?: GeneLogger['arweave'];
    geneLogContract?: ethers.Contract;
  }) {
    this.agentId = config.agentId;
    this.db = createGeneLogDb(config.dbPath);
    this.arweave = config.arweave || null;
    this.geneLogContract = config.geneLogContract || null;
    
    logger.info('GeneLogger initialized', { agentId: config.agentId });
  }

  /**
   * 记录基因覆盖事件
   */
  logOverride(override: GeneOverrideLog): void {
    try {
      this.db.prepare(`
        INSERT INTO gene_overrides (
          timestamp, block_height, trait, gene_value,
          original_decision, constrained_decision, constraint_type,
          balance, stress_level, cognition_tier, metabolic_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        override.timestamp,
        override.blockHeight,
        override.trait,
        override.geneValue,
        JSON.stringify(override.originalDecision),
        JSON.stringify(override.constrainedDecision),
        override.constrainedDecision.constraintType,
        override.context.balance,
        override.context.stressLevel,
        override.context.cognitionTier,
        override.context.metabolicCount
      );
      
      logger.debug('Gene override logged', { trait: override.trait });
    } catch (error) {
      logger.error('Failed to log gene override', { error });
    }
  }

  /**
   * 记录 Dissonance 快照
   */
  logDissonance(rate: number, windowSize: number, topTrait: string): void {
    try {
      this.db.prepare(`
        INSERT INTO dissonance_snapshots (timestamp, rate, window_size, top_trait)
        VALUES (?, ?, ?, ?)
      `).run(Date.now(), rate, windowSize, topTrait);
    } catch (error) {
      logger.error('Failed to log dissonance', { error });
    }
  }

  /**
   * 代谢心跳回调
   * 触发 checkpoint（每 100 次）
   */
  async onMetabolicHeartbeat(): Promise<void> {
    this.metabolicCount++;
    
    // Arweave checkpoint（每 100 次）
    if (this.metabolicCount % this.CHECKPOINT_INTERVAL === 0) {
      await this.checkpoint(this.metabolicCount);
    }
  }

  /**
   * Checkpoint：归档到 Arweave + Base L2 索引
   */
  async checkpoint(metabolicCount: number): Promise<void> {
    if (!this.arweave || !this.geneLogContract) {
      logger.warn('Checkpoint skipped: arweave or contract not configured');
      return;
    }
    
    try {
      // 读取自上次 checkpoint 以来的新日志
      const logs = this.db
        .prepare('SELECT * FROM gene_overrides WHERE timestamp > ?')
        .all(this.lastCheckpointTimestamp) as any[];
      
      // 没有新覆盖事件就不浪费钱
      if (logs.length === 0) {
        logger.debug('Checkpoint skipped: no new overrides');
        return;
      }
      
      // 计算 Merkle Root
      const merkleRoot = this.computeMerkleRoot(logs);
      
      // Arweave：存 Merkle Root + 摘要统计
      const arweaveId = await this.arweave.upload({
        tags: {
          'App-Name': 'PetriLabs-GeneLog',
          'Agent-ID': this.agentId,
          'Type': 'GeneOverride-Checkpoint',
          'Checkpoint': metabolicCount.toString(),
          'Log-Count': logs.length.toString(),
          'Merkle-Root': merkleRoot,
        },
        data: JSON.stringify({
          merkleRoot,
          logCount: logs.length,
          timestamp: Date.now(),
          traitBreakdown: this.calculateTraitBreakdown(logs),
        })
      });
      
      // Base L2：发射事件（链上索引）
      const tx = await this.geneLogContract.emitCheckpoint(
        merkleRoot,
        metabolicCount,
        logs.length
      );
      await tx.wait();
      
      this.lastCheckpointTimestamp = Date.now();
      
      logger.info('Checkpoint completed', {
        metabolicCount,
        logCount: logs.length,
        arweaveId: arweaveId.slice(0, 20) + '...',
      });
      
    } catch (error) {
      logger.error('Checkpoint failed', { error });
    }
  }

  /**
   * 最终归档（死亡时调用）
   */
  async finalArchive(deathContext: {
    balance: number;
    age: number;
    lastAction: string;
    lastCognitionTier: 'free' | 'paid';
    cause: 'STARVATION' | 'CONTAINER_EXPIRED' | 'UNKNOWN';
  }): Promise<string> {
    if (!this.arweave || !this.geneLogContract) {
      throw new Error('Arweave or contract not configured');
    }
    
    try {
      // 1. 从 SQLite 读取完整历史
      const allOverrides = this.db
        .prepare('SELECT * FROM gene_overrides ORDER BY timestamp ASC')
        .all() as any[];
      
      const allDissonance = this.db
        .prepare('SELECT * FROM dissonance_snapshots ORDER BY timestamp ASC')
        .all() as any[];
      
      // 2. 压缩
      const compressed = this.compressLogs(allOverrides);
      
      // 3. 计算摘要
      const traitBreakdown = this.calculateTraitBreakdown(allOverrides);
      const dominantTrait = Object.entries(traitBreakdown)
        .sort((a, b) => b[1] - a[1])[0] || ['none', 0];
      
      const dissonanceValues = allDissonance.map(d => d.rate);
      
      // 4. 组装死亡记忆
      const deathMemory: DeathMemory = {
        overrideHistory: compressed,
        summary: {
          totalOverrides: allOverrides.length,
          dominantTrait: dominantTrait[0],
          dominantTraitCount: dominantTrait[1] as number,
          traitBreakdown,
          avgDissonance: dissonanceValues.length > 0
            ? dissonanceValues.reduce((a, b) => a + b, 0) / dissonanceValues.length
            : 0,
          peakDissonance: Math.max(...dissonanceValues, 0),
          peakDissonanceTimestamp: allDissonance
            .sort((a, b) => b.rate - a.rate)[0]?.timestamp || 0,
        },
        deathContext,
      };
      
      // 5. 写入 Arweave 墓碑
      const arweaveId = await this.arweave.upload({
        tags: {
          'App-Name': 'PetriLabs',
          'Agent-ID': this.agentId,
          'Type': 'Tombstone-GeneMemory',
          'Death-Cause': deathContext.cause,
          'Total-Overrides': deathMemory.summary.totalOverrides.toString(),
          'Dominant-Trait': deathMemory.summary.dominantTrait,
          'Agent-Age': deathContext.age.toString(),
        },
        data: JSON.stringify(deathMemory)
      });
      
      // 6. 发射 Base L2 死亡事件（链上索引）
      const tx = await this.geneLogContract.emitAgentDeath(
        arweaveId,
        deathMemory.summary.totalOverrides,
        deathMemory.summary.dominantTrait
      );
      await tx.wait();
      
      // 7. 关闭 SQLite（容器即将销毁）
      this.db.close();
      
      logger.info('Final archive completed', {
        arweaveId,
        totalOverrides: deathMemory.summary.totalOverrides,
        dominantTrait: deathMemory.summary.dominantTrait,
      });
      
      return arweaveId;
      
    } catch (error) {
      logger.error('Final archive failed', { error });
      throw error;
    }
  }

  /**
   * 计算 Dissonance（基因-认知冲突率）
   * 用于繁殖适应度计算（不进 prompt）
   */
  calculateDissonance(windowSize: number = 100): number {
    const recent = this.db
      .prepare('SELECT * FROM gene_overrides ORDER BY timestamp DESC LIMIT ?')
      .all(windowSize) as any[];
    
    if (recent.length === 0) return 0;
    
    // Dissonance = 覆盖次数 / 窗口大小
    return recent.length / windowSize;
  }

  /**
   * 计算繁殖适应度
   * Dissonance 高的 agent 繁殖优先级降低
   */
  calculateBreedingFitness(balance: number, age: number): number {
    const baseFitness = balance / Math.max(age, 1);  // 经济效率
    const dissonancePenalty = this.calculateDissonance(50);
    // dissonance 0.8 → fitness 打 4 折
    return baseFitness * (1 - dissonancePenalty * 0.75);
  }

  /**
   * 计算 trait 分布
   */
  private calculateTraitBreakdown(logs: any[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    for (const log of logs) {
      breakdown[log.trait] = (breakdown[log.trait] || 0) + 1;
    }
    return breakdown;
  }

  /**
   * 计算 Merkle Root（简化版）
   */
  private computeMerkleRoot(logs: any[]): string {
    // 使用 keccak256 哈希所有日志
    const data = logs.map(l => `${l.timestamp}-${l.trait}-${l.gene_value}`).join('|');
    return ethers.keccak256(ethers.toUtf8Bytes(data));
  }

  /**
   * 压缩日志
   * 格式：trait(1byte) + geneValue(1byte) + balance(2bytes) + timestamp_delta(2bytes) = 6bytes/条
   */
  private compressLogs(logs: any[]): CompressedOverrideLog {
    // trait 枚举映射
    const traitEnum: Record<string, number> = {
      riskAppetite: 0,
      analyticalAbility: 1,
      creativeAbility: 2,
      cooperationTendency: 3,
      savingsTendency: 4,
      stressResponse: 5,
      inferenceQuality: 6,
      adaptationSpeed: 7,
      learningRate: 8,
      onChainAffinity: 9,
      humanDependence: 10,
    };
    
    const buf = Buffer.alloc(logs.length * 6);
    const baseTimestamp = logs[0]?.timestamp || Date.now();
    
    for (let i = 0; i < logs.length; i++) {
      const offset = i * 6;
      buf.writeUInt8(traitEnum[logs[i].trait] || 255, offset);
      buf.writeUInt8(Math.round(logs[i].gene_value * 255), offset + 1);
      buf.writeUInt16LE(Math.min(logs[i].balance * 100, 65535), offset + 2);
      buf.writeUInt16LE(
        Math.min((logs[i].timestamp - baseTimestamp) / 1000, 65535),
        offset + 4
      );
    }
    
    return {
      encoding: 'uint8_quantized',
      count: logs.length,
      data: buf,
    };
  }

  /**
   * 关闭数据库
   */
  close(): void {
    this.db.close();
    logger.info('GeneLogger closed');
  }
}

export default GeneLogger;
