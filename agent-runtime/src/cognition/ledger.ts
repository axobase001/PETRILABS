/**
 * CognitionLedger
 * 认知账本 - 追踪所有认知调用历史
 * 
 * 职责：
 * 1. 记录每次推理调用的详细数据（免费/付费、成本、模型、基因）
 * 2. 为死亡墓碑提供认知摘要
 * 3. 持久化到 SQLite
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger';

export interface CognitionRecord {
  timestamp: number;
  geneId: number;
  provider: 'pollinations' | 'x402-llm';
  model: string;
  cost: number;
  tier: 'free' | 'paid';
  latency: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  success: boolean;
  error?: string;
}

export interface CognitionSummary {
  totalCycles: number;
  freeCount: number;
  paidCount: number;
  totalCost: number;
  avgCostPerThink: number;
  lastTier: 'free' | 'paid';
  byProvider: {
    pollinations: { count: number; cost: number };
    'x402-llm': { count: number; cost: number };
  };
  byModel: Record<string, { count: number; cost: number }>;
}

export class CognitionLedger {
  private db: Database.Database;
  private agentId: string;
  
  // 内存缓存（最近 100 条）
  private recentRecords: CognitionRecord[] = [];
  private readonly CACHE_SIZE = 100;

  constructor(config: {
    agentId: string;
    dbPath?: string;
  }) {
    this.agentId = config.agentId;
    this.db = this.initDatabase(config.dbPath || '/app/data/cognition.db');
    
    logger.info('CognitionLedger initialized', { agentId: config.agentId });
  }

  /**
   * 初始化数据库
   */
  private initDatabase(path: string): Database.Database {
    const db = new Database(path);
    
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS cognition_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        gene_id INTEGER NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        cost REAL DEFAULT 0,
        tier TEXT NOT NULL,
        latency INTEGER DEFAULT 0,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        success BOOLEAN DEFAULT 1,
        error TEXT,
        created_at INTEGER DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_cognition_agent ON cognition_records(agent_id);
      CREATE INDEX IF NOT EXISTS idx_cognition_time ON cognition_records(timestamp);
      CREATE INDEX IF NOT EXISTS idx_cognition_provider ON cognition_records(provider);
      CREATE INDEX IF NOT EXISTS idx_cognition_gene ON cognition_records(gene_id);
    `);
    
    return db;
  }

  /**
   * 记录一次认知调用
   */
  record(record: CognitionRecord): void {
    // 添加到缓存
    this.recentRecords.push(record);
    if (this.recentRecords.length > this.CACHE_SIZE) {
      this.recentRecords.shift();
    }
    
    // 写入数据库
    try {
      this.db.prepare(`
        INSERT INTO cognition_records 
        (agent_id, timestamp, gene_id, provider, model, cost, tier, latency, 
         prompt_tokens, completion_tokens, total_tokens, success, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        this.agentId,
        record.timestamp,
        record.geneId,
        record.provider,
        record.model,
        record.cost,
        record.tier,
        record.latency,
        record.tokens.prompt,
        record.tokens.completion,
        record.tokens.total,
        record.success ? 1 : 0,
        record.error || null
      );
      
      logger.debug('Cognition recorded', {
        geneId: record.geneId,
        provider: record.provider,
        cost: record.cost,
        tier: record.tier,
      });
    } catch (error) {
      logger.error('Failed to record cognition', { error });
    }
  }

  /**
   * 获取认知摘要（用于墓碑）
   */
  getSummary(): CognitionSummary {
    try {
      // 从数据库统计
      const stats = this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN tier = 'free' THEN 1 ELSE 0 END) as free_count,
          SUM(CASE WHEN tier = 'paid' THEN 1 ELSE 0 END) as paid_count,
          SUM(cost) as total_cost,
          AVG(cost) as avg_cost,
          provider,
          model
        FROM cognition_records
        WHERE agent_id = ?
        GROUP BY provider, model
      `).all(this.agentId) as any[];
      
      let totalCycles = 0;
      let freeCount = 0;
      let paidCount = 0;
      let totalCost = 0;
      let totalAvgCost = 0;
      let countForAvg = 0;
      
      const byProvider = {
        pollinations: { count: 0, cost: 0 },
        'x402-llm': { count: 0, cost: 0 },
      };
      
      const byModel: Record<string, { count: number; cost: number }> = {};
      
      for (const row of stats) {
        totalCycles += row.total;
        freeCount += row.free_count;
        paidCount += row.paid_count;
        totalCost += row.total_cost;
        
        if (row.avg_cost > 0) {
          totalAvgCost += row.avg_cost;
          countForAvg++;
        }
        
        // 按 provider 统计
        if (row.provider === 'pollinations' || row.provider === 'x402-llm') {
          byProvider[row.provider].count += row.total;
          byProvider[row.provider].cost += row.total_cost;
        }
        
        // 按 model 统计
        if (!byModel[row.model]) {
          byModel[row.model] = { count: 0, cost: 0 };
        }
        byModel[row.model].count += row.total;
        byModel[row.model].cost += row.total_cost;
      }
      
      // 获取最后一次的 tier
      const lastRecord = this.db.prepare(`
        SELECT tier FROM cognition_records
        WHERE agent_id = ?
        ORDER BY timestamp DESC
        LIMIT 1
      `).get(this.agentId) as any;
      
      return {
        totalCycles,
        freeCount,
        paidCount,
        totalCost,
        avgCostPerThink: countForAvg > 0 ? totalAvgCost / countForAvg : 0,
        lastTier: lastRecord?.tier || 'free',
        byProvider,
        byModel,
      };
    } catch (error) {
      logger.error('Failed to get cognition summary', { error });
      return {
        totalCycles: 0,
        freeCount: 0,
        paidCount: 0,
        totalCost: 0,
        avgCostPerThink: 0,
        lastTier: 'free',
        byProvider: {
          pollinations: { count: 0, cost: 0 },
          'x402-llm': { count: 0, cost: 0 },
        },
        byModel: {},
      };
    }
  }

  /**
   * 获取最近记录
   */
  getRecent(limit: number = 10): CognitionRecord[] {
    try {
      const rows = this.db.prepare(`
        SELECT 
          timestamp, gene_id, provider, model, cost, tier, latency,
          prompt_tokens, completion_tokens, total_tokens, success, error
        FROM cognition_records
        WHERE agent_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(this.agentId, limit) as any[];
      
      return rows.map(r => ({
        timestamp: r.timestamp,
        geneId: r.gene_id,
        provider: r.provider,
        model: r.model,
        cost: r.cost,
        tier: r.tier,
        latency: r.latency,
        tokens: {
          prompt: r.prompt_tokens,
          completion: r.completion_tokens,
          total: r.total_tokens,
        },
        success: r.success === 1,
        error: r.error,
      }));
    } catch (error) {
      logger.error('Failed to get recent cognition', { error });
      return [];
    }
  }

  /**
   * 获取最近 24 小时的统计
   */
  getDailyStats(): CognitionSummary {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    try {
      const row = this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN tier = 'free' THEN 1 ELSE 0 END) as free_count,
          SUM(CASE WHEN tier = 'paid' THEN 1 ELSE 0 END) as paid_count,
          SUM(cost) as total_cost
        FROM cognition_records
        WHERE agent_id = ? AND timestamp > ?
      `).get(this.agentId, oneDayAgo) as any;
      
      return {
        totalCycles: row?.total || 0,
        freeCount: row?.free_count || 0,
        paidCount: row?.paid_count || 0,
        totalCost: row?.total_cost || 0,
        avgCostPerThink: row?.total > 0 ? (row?.total_cost || 0) / row.total : 0,
        lastTier: this.getSummary().lastTier,
        byProvider: { pollinations: { count: 0, cost: 0 }, 'x402-llm': { count: 0, cost: 0 } },
        byModel: {},
      };
    } catch (error) {
      logger.error('Failed to get daily stats', { error });
      return {
        totalCycles: 0,
        freeCount: 0,
        paidCount: 0,
        totalCost: 0,
        avgCostPerThink: 0,
        lastTier: 'free',
        byProvider: { pollinations: { count: 0, cost: 0 }, 'x402-llm': { count: 0, cost: 0 } },
        byModel: {},
      };
    }
  }

  /**
   * 关闭数据库
   */
  close(): void {
    this.db.close();
    logger.info('CognitionLedger closed');
  }
}

export default CognitionLedger;
