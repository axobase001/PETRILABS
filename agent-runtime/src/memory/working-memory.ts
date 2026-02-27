/**
 * Working Memory with Fitness Tracking
 * Task 31: Peak balance tracking and financial decisions
 */

export interface MemoryItem {
  type: 'observation' | 'decision' | 'skill_result' | 'event';
  content: string;
  timestamp: number;
  importance: number;
  metadata?: Record<string, any>;
}

export interface BalancePoint {
  timestamp: number;
  usdcBalance: number;
  ethBalance: number;
}

export interface FinancialDecision {
  action: string;
  pnl: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

export class WorkingMemory {
  private items: MemoryItem[] = [];
  private balanceHistory: BalancePoint[] = [];
  private financialDecisions: FinancialDecision[] = [];
  private readonly maxSize: number;
  private readonly balanceWindowMs: number;
  
  // Task 31: Track peak balance
  private peakBalance: number = 0;
  private initialDeposit: number = 0;
  
  // Decision cycle counter for fitness metrics
  private totalDecisions: number = 0;

  constructor(
    maxSize: number = 100,
    balanceWindowHours: number = 24
  ) {
    this.maxSize = maxSize;
    this.balanceWindowMs = balanceWindowHours * 60 * 60 * 1000;
  }

  /**
   * Add memory item
   */
  add(item: Omit<MemoryItem, 'timestamp'>): void {
    const fullItem: MemoryItem = {
      ...item,
      timestamp: Date.now(),
    };

    this.items.push(fullItem);
    this.maintainSize();
  }

  /**
   * Get recent memories
   */
  getRecent(count: number = 10): MemoryItem[] {
    return this.items.slice(-count);
  }

  /**
   * Get memories by type
   */
  getByType(type: MemoryItem['type']): MemoryItem[] {
    return this.items.filter((item) => item.type === type);
  }

  /**
   * Record balance with peak tracking (Task 31)
   */
  recordBalance(point: BalancePoint): void {
    this.balanceHistory.push(point);
    
    // Task 31: Update peak balance
    if (point.usdcBalance > this.peakBalance) {
      this.peakBalance = point.usdcBalance;
    }
    
    this.maintainBalanceWindow();
  }

  /**
   * Set initial deposit (for fitness calculation)
   */
  setInitialDeposit(amount: number): void {
    this.initialDeposit = amount;
    // Initialize peak with initial deposit
    if (this.peakBalance === 0) {
      this.peakBalance = amount;
    }
  }

  /**
   * Get initial deposit
   */
  getInitialDeposit(): number {
    return this.initialDeposit;
  }

  /**
   * Get peak balance (Task 31)
   */
  getPeakBalance(): number {
    return this.peakBalance;
  }

  /**
   * Record financial decision result (Task 31)
   */
  recordFinancialResult(action: string, pnl: number, metadata?: Record<string, any>): void {
    // Only record financial actions
    const financialActions = [
      'SWAP', 'TRADE', 'POLYMARKET', 'LEVERAGE_TRADE', 
      'PROVIDE_LIQUIDITY', 'ARBITRAGE', 'YIELD_FARM'
    ];
    
    if (financialActions.includes(action)) {
      this.financialDecisions.push({
        action,
        pnl,
        timestamp: Date.now(),
        metadata
      });
    }
    
    // Increment total decisions
    this.totalDecisions++;
  }

  /**
   * Get profitable decisions count (Task 31)
   */
  getProfitableDecisionsCount(): number {
    return this.financialDecisions.filter(d => d.pnl > 0).length;
  }

  /**
   * Get total financial decisions count (Task 31)
   */
  getTotalFinancialDecisionsCount(): number {
    return this.financialDecisions.length;
  }

  /**
   * Get total decisions (including non-financial)
   */
  getTotalDecisions(): number {
    return this.totalDecisions;
  }

  /**
   * Get all financial decisions
   */
  getFinancialDecisions(): FinancialDecision[] {
    return [...this.financialDecisions];
  }

  /**
   * Calculate average PnL per decision
   */
  getAveragePnL(): number {
    if (this.financialDecisions.length === 0) return 0;
    const total = this.financialDecisions.reduce((sum, d) => sum + d.pnl, 0);
    return total / this.financialDecisions.length;
  }

  /**
   * Get win rate
   */
  getWinRate(): number {
    if (this.financialDecisions.length === 0) return 0;
    return this.getProfitableDecisionsCount() / this.financialDecisions.length;
  }

  /**
   * Get balance trend (positive/negative)
   */
  getBalanceTrend(): number {
    if (this.balanceHistory.length < 2) return 0;
    const recent = this.balanceHistory.slice(-10);
    const first = recent[0].usdcBalance;
    const last = recent[recent.length - 1].usdcBalance;
    return last - first;
  }

  /**
   * Format memory for LLM context
   */
  toPromptContext(): string {
    const recent = this.getRecent(5);
    return recent
      .map(
        (item) =>
          `[${new Date(item.timestamp).toISOString()}] ${item.type}: ${item.content}`
      )
      .join('\n');
  }

  /**
   * Get current balance
   */
  getCurrentBalance(): BalancePoint | undefined {
    return this.balanceHistory[this.balanceHistory.length - 1];
  }

  /**
   * Get balance history
   */
  getBalanceHistory(): BalancePoint[] {
    return [...this.balanceHistory];
  }

  /**
   * Maintain memory size
   */
  private maintainSize(): void {
    if (this.items.length > this.maxSize) {
      // Remove lowest importance items first
      const sorted = [...this.items].sort((a, b) => a.importance - b.importance);
      const toRemove = sorted.slice(0, this.items.length - this.maxSize);
      this.items = this.items.filter((item) => !toRemove.includes(item));
    }
  }

  /**
   * Maintain balance window (sliding window)
   */
  private maintainBalanceWindow(): void {
    const cutoff = Date.now() - this.balanceWindowMs;
    this.balanceHistory = this.balanceHistory.filter(
      (point) => point.timestamp > cutoff
    );
  }

  /**
   * Get stats for debugging
   */
  getStats(): {
    memoryCount: number;
    balancePoints: number;
    peakBalance: number;
    financialDecisions: number;
    winRate: number;
  } {
    return {
      memoryCount: this.items.length,
      balancePoints: this.balanceHistory.length,
      peakBalance: this.peakBalance,
      financialDecisions: this.financialDecisions.length,
      winRate: this.getWinRate(),
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.items = [];
    this.balanceHistory = [];
    this.financialDecisions = [];
    this.peakBalance = 0;
    this.initialDeposit = 0;
    this.totalDecisions = 0;
  }
}

export default WorkingMemory;
