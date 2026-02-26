/**
 * LifecycleTracker
 * Agent 生命周期数据追踪器
 * 
 * 职责：
 * 1. 追踪完整生命周期经济数据（峰值余额、总收入/支出）
 * 2. 追踪 Fork/Merge 历史
 * 3. 持久化到 SQLite（防止崩溃丢数据）
 * 4. 为死亡墓碑提供完整统计数据
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger';

export interface LifecycleStats {
  // 经济数据
  peakBalance: number;
  totalIncome: number;
  totalExpense: number;
  lastBalance: number;
  
  // 复制历史
  forkCount: number;
  mergeCount: number;
  childIds: string[];
  
  // 时间数据
  birthTimestamp: number;
  totalHeartbeats: number;
}

export interface BalanceUpdate {
  timestamp: number;
  newBalance: number;
  blockNumber?: number;
}

export class LifecycleTracker {
  private db: Database.Database;
  private agentId: string;
  
  // 内存中的当前值
  private peakBalance: number = 0;
  private totalIncome: number = 0;
  private totalExpense: number = 0;
  private lastBalance: number = 0;
  private forkCount: number = 0;
  private mergeCount: number = 0;
  private childIds: string[] = [];
  private birthTimestamp: number;
  private totalHeartbeats: number = 0;
  private initialBalance: number = 0;

  constructor(config: {
    agentId: string;
    dbPath?: string;
    initialBalance?: number;
    birthTimestamp?: number;
  }) {
    this.agentId = config.agentId;
    this.birthTimestamp = config.birthTimestamp || Date.now();
    this.initialBalance = config.initialBalance || 0;
    this.lastBalance = this.initialBalance;
    this.peakBalance = this.initialBalance;
    
    // 初始化数据库
    this.db = this.initDatabase(config.dbPath || '/app/data/lifecycle.db');
    
    // 尝试从数据库恢复状态
    this.restoreFromDatabase();
    
    logger.info('LifecycleTracker initialized', {
      agentId: config.agentId,
      initialBalance: this.initialBalance,
    });
  }

  /**
   * 初始化数据库表结构
   */
  private initDatabase(path: string): Database.Database {
    const db = new Database(path);
    
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    
    // 生命周期主表
    db.exec(`
      CREATE TABLE IF NOT EXISTS lifecycle_stats (
        agent_id TEXT PRIMARY KEY,
        peak_balance REAL DEFAULT 0,
        total_income REAL DEFAULT 0,
        total_expense REAL DEFAULT 0,
        last_balance REAL DEFAULT 0,
        fork_count INTEGER DEFAULT 0,
        merge_count INTEGER DEFAULT 0,
        birth_timestamp INTEGER DEFAULT 0,
        total_heartbeats INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS child_agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id TEXT NOT NULL,
        child_id TEXT NOT NULL,
        birth_type TEXT DEFAULT 'FORK',
        created_at INTEGER DEFAULT 0,
        UNIQUE(parent_id, child_id)
      );
      
      CREATE TABLE IF NOT EXISTS balance_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        balance REAL NOT NULL,
        delta REAL NOT NULL,
        block_number INTEGER,
        created_at INTEGER DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_balance_agent ON balance_history(agent_id);
      CREATE INDEX IF NOT EXISTS idx_balance_time ON balance_history(timestamp);
    `);
    
    // 初始化记录
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO lifecycle_stats 
      (agent_id, peak_balance, last_balance, birth_timestamp, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(this.agentId, this.initialBalance, this.initialBalance, this.birthTimestamp, Date.now());
    
    return db;
  }

  /**
   * 从数据库恢复状态
   */
  private restoreFromDatabase(): void {
    try {
      const row = this.db
        .prepare('SELECT * FROM lifecycle_stats WHERE agent_id = ?')
        .get(this.agentId) as any;
      
      if (row) {
        this.peakBalance = row.peak_balance;
        this.totalIncome = row.total_income;
        this.totalExpense = row.total_expense;
        this.lastBalance = row.last_balance;
        this.forkCount = row.fork_count;
        this.mergeCount = row.merge_count;
        this.birthTimestamp = row.birth_timestamp;
        this.totalHeartbeats = row.total_heartbeats;
        
        // 恢复子代列表
        const children = this.db
          .prepare('SELECT child_id FROM child_agents WHERE parent_id = ?')
          .all(this.agentId) as any[];
        this.childIds = children.map(c => c.child_id);
        
        logger.info('Lifecycle state restored from database', {
          peakBalance: this.peakBalance,
          totalIncome: this.totalIncome,
          totalExpense: this.totalExpense,
          heartbeats: this.totalHeartbeats,
        });
      }
    } catch (error) {
      logger.error('Failed to restore lifecycle state', { error });
    }
  }

  /**
   * 余额更新（每次心跳调用）
   * 计算收入/支出和峰值余额
   */
  onBalanceUpdate(newBalance: number, blockNumber?: number): void {
    const delta = newBalance - this.lastBalance;
    
    // 更新收入/支出
    if (delta > 0) {
      this.totalIncome += delta;
    } else if (delta < 0) {
      this.totalExpense += Math.abs(delta);
    }
    
    // 更新峰值余额
    if (newBalance > this.peakBalance) {
      this.peakBalance = newBalance;
    }
    
    this.lastBalance = newBalance;
    
    // 记录历史（用于分析趋势）
    this.recordBalanceHistory(newBalance, delta, blockNumber);
    
    logger.debug('Balance updated', {
      newBalance,
      delta,
      peakBalance: this.peakBalance,
      totalIncome: this.totalIncome,
      totalExpense: this.totalExpense,
    });
  }

  /**
   * 记录余额历史
   */
  private recordBalanceHistory(balance: number, delta: number, blockNumber?: number): void {
    try {
      this.db.prepare(`
        INSERT INTO balance_history (agent_id, timestamp, balance, delta, block_number)
        VALUES (?, ?, ?, ?, ?)
      `).run(this.agentId, Date.now(), balance, delta, blockNumber || 0);
    } catch (error) {
      logger.error('Failed to record balance history', { error });
    }
  }

  /**
   * 心跳计数
   */
  onHeartbeat(): void {
    this.totalHeartbeats++;
    
    // 每 10 次心跳持久化一次
    if (this.totalHeartbeats % 10 === 0) {
      this.persist();
    }
  }

  /**
   * 记录 Fork 事件
   */
  recordFork(childId: string): void {
    this.forkCount++;
    this.childIds.push(childId);
    
    try {
      this.db.prepare(`
        INSERT INTO child_agents (parent_id, child_id, birth_type, created_at)
        VALUES (?, ?, 'FORK', ?)
      `).run(this.agentId, childId, Date.now());
      
      this.persist();
      
      logger.info('Fork recorded', { childId, totalForks: this.forkCount });
    } catch (error) {
      logger.error('Failed to record fork', { error });
    }
  }

  /**
   * 记录 Merge 事件
   */
  recordMerge(partnerId: string): void {
    this.mergeCount++;
    this.persist();
    
    logger.info('Merge recorded', { partnerId, totalMerges: this.mergeCount });
  }

  /**
   * 持久化到数据库
   */
  persist(): void {
    try {
      this.db.prepare(`
        UPDATE lifecycle_stats SET
          peak_balance = ?,
          total_income = ?,
          total_expense = ?,
          last_balance = ?,
          fork_count = ?,
          merge_count = ?,
          total_heartbeats = ?,
          updated_at = ?
        WHERE agent_id = ?
      `).run(
        this.peakBalance,
        this.totalIncome,
        this.totalExpense,
        this.lastBalance,
        this.forkCount,
        this.mergeCount,
        this.totalHeartbeats,
        Date.now(),
        this.agentId
      );
    } catch (error) {
      logger.error('Failed to persist lifecycle stats', { error });
    }
  }

  /**
   * 获取完整统计
   */
  getStats(): LifecycleStats & { initialBalance: number; agentId: string } {
    return {
      agentId: this.agentId,
      initialBalance: this.initialBalance,
      peakBalance: this.peakBalance,
      totalIncome: this.totalIncome,
      totalExpense: this.totalExpense,
      lastBalance: this.lastBalance,
      forkCount: this.forkCount,
      mergeCount: this.mergeCount,
      childIds: [...this.childIds],
      birthTimestamp: this.birthTimestamp,
      totalHeartbeats: this.totalHeartbeats,
    };
  }

  /**
   * 获取余额趋势（最近 N 次记录）
   */
  getBalanceTrend(limit: number = 100): BalanceUpdate[] {
    try {
      const rows = this.db
        .prepare(`
          SELECT timestamp, balance, block_number 
          FROM balance_history 
          WHERE agent_id = ? 
          ORDER BY timestamp DESC 
          LIMIT ?
        `)
        .all(this.agentId, limit) as any[];
      
      return rows.map(r => ({
        timestamp: r.timestamp,
        newBalance: r.balance,
        blockNumber: r.block_number,
      })).reverse();
    } catch (error) {
      logger.error('Failed to get balance trend', { error });
      return [];
    }
  }

  /**
   * 计算平均每日余额变化
   */
  getAverageDailyChange(): number {
    const trend = this.getBalanceTrend(288); // 最近 288 次记录（约 2 天，假设心跳 10 分钟一次）
    if (trend.length < 2) return 0;
    
    const oldest = trend[0];
    const newest = trend[trend.length - 1];
    const timeDiff = newest.timestamp - oldest.timestamp;
    const days = timeDiff / (1000 * 60 * 60 * 24);
    
    if (days === 0) return 0;
    
    return (newest.newBalance - oldest.newBalance) / days;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.persist();
    this.db.close();
    logger.info('LifecycleTracker closed');
  }
}

export default LifecycleTracker;
