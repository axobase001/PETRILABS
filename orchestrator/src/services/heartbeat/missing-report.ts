/**
 * Missing Heartbeat Report Service
 * Generates and stores reports for missing heartbeats
 */

import { Redis } from 'ioredis';
import { logger } from '../../utils/logger';
import { MissingHeartbeat, MonitorAlert } from '../../types';

export interface MissingReport {
  id: string;
  agentAddress: string;
  severity: 'warning' | 'critical' | 'abandoned';
  expectedTime: number;
  lastHeartbeat: number;
  deadline: number;
  akashStatus?: {
    dseq: string;
    state: string;
    error?: string;
  };
  createdAt: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  resolved: boolean;
  resolvedAt?: number;
  resolution?: string;
}

export class MissingReportService {
  private redis?: Redis;
  private localStore: Map<string, MissingReport> = new Map();
  private readonly REPORT_PREFIX = 'missing_report:';
  private readonly AGENT_REPORTS_PREFIX = 'agent_reports:';

  constructor(redisUrl?: string) {
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
    }
  }

  /**
   * Create a new missing heartbeat report
   */
  async createReport(missing: MissingHeartbeat): Promise<MissingReport> {
    const id = `report-${missing.agentAddress}-${Date.now()}`;
    
    const report: MissingReport = {
      id,
      agentAddress: missing.agentAddress,
      severity: missing.severity,
      expectedTime: missing.expectedTime,
      lastHeartbeat: missing.lastHeartbeat,
      deadline: missing.deadline,
      akashStatus: missing.akashStatus
        ? {
            dseq: missing.akashStatus.dseq,
            state: missing.akashStatus.state,
            error: missing.akashStatus.error,
          }
        : undefined,
      createdAt: Date.now(),
      acknowledged: false,
      resolved: false,
    };

    await this.saveReport(report);

    logger.info('Missing heartbeat report created', {
      reportId: id,
      agentAddress: missing.agentAddress,
      severity: missing.severity,
    });

    return report;
  }

  /**
   * Save report to storage
   */
  private async saveReport(report: MissingReport): Promise<void> {
    const key = `${this.REPORT_PREFIX}${report.id}`;
    const data = JSON.stringify(report);

    if (this.redis) {
      const pipeline = this.redis.pipeline();
      pipeline.setex(key, 86400 * 30, data); // 30 days TTL
      pipeline.sadd(`${this.AGENT_REPORTS_PREFIX}${report.agentAddress}`, report.id);
      await pipeline.exec();
    } else {
      this.localStore.set(report.id, report);
    }
  }

  /**
   * Get report by ID
   */
  async getReport(id: string): Promise<MissingReport | null> {
    const key = `${this.REPORT_PREFIX}${id}`;

    if (this.redis) {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } else {
      return this.localStore.get(id) || null;
    }
  }

  /**
   * Get all reports for an agent
   */
  async getReportsForAgent(agentAddress: string): Promise<MissingReport[]> {
    if (this.redis) {
      const reportIds = await this.redis.smembers(
        `${this.AGENT_REPORTS_PREFIX}${agentAddress}`
      );
      
      const reports: MissingReport[] = [];
      for (const id of reportIds) {
        const report = await this.getReport(id);
        if (report) {
          reports.push(report);
        }
      }
      
      return reports.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      return Array.from(this.localStore.values())
        .filter((r) => r.agentAddress === agentAddress)
        .sort((a, b) => b.createdAt - a.createdAt);
    }
  }

  /**
   * List all reports with filtering
   */
  async listReports(options?: {
    severity?: string;
    resolved?: boolean;
    acknowledged?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: MissingReport[]; total: number }> {
    const opts = options || {};
    
    // Get all reports
    let reports: MissingReport[];
    
    if (this.redis) {
      const keys = await this.redis.keys(`${this.REPORT_PREFIX}*`);
      reports = [];
      
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          reports.push(JSON.parse(data));
        }
      }
    } else {
      reports = Array.from(this.localStore.values());
    }

    // Apply filters
    if (opts.severity) {
      reports = reports.filter((r) => r.severity === opts.severity);
    }
    if (opts.resolved !== undefined) {
      reports = reports.filter((r) => r.resolved === opts.resolved);
    }
    if (opts.acknowledged !== undefined) {
      reports = reports.filter((r) => r.acknowledged === opts.acknowledged);
    }

    // Sort by createdAt desc
    reports.sort((a, b) => b.createdAt - a.createdAt);

    const total = reports.length;

    // Apply pagination
    const offset = opts.offset || 0;
    const limit = opts.limit || 50;
    reports = reports.slice(offset, offset + limit);

    return { reports, total };
  }

  /**
   * Acknowledge a report
   */
  async acknowledgeReport(
    reportId: string,
    acknowledgedBy: string
  ): Promise<MissingReport | null> {
    const report = await this.getReport(reportId);
    if (!report) return null;

    report.acknowledged = true;
    report.acknowledgedBy = acknowledgedBy;

    await this.saveReport(report);

    logger.info('Report acknowledged', { reportId, acknowledgedBy });

    return report;
  }

  /**
   * Resolve a report
   */
  async resolveReport(
    reportId: string,
    resolution: string
  ): Promise<MissingReport | null> {
    const report = await this.getReport(reportId);
    if (!report) return null;

    report.resolved = true;
    report.resolvedAt = Date.now();
    report.resolution = resolution;

    await this.saveReport(report);

    logger.info('Report resolved', { reportId, resolution });

    return report;
  }

  /**
   * Create report from alert
   */
  async createFromAlert(alert: MonitorAlert): Promise<MissingReport | null> {
    if (alert.type !== 'missing_heartbeat') return null;

    const missing: MissingHeartbeat = {
      agentAddress: alert.agentAddress,
      expectedTime: alert.timestamp,
      lastHeartbeat: 0,
      deadline: 0,
      severity: alert.severity as 'warning' | 'critical' | 'abandoned',
    };

    return this.createReport(missing);
  }

  /**
   * Get report statistics
   */
  async getStatistics(): Promise<{
    total: number;
    bySeverity: Record<string, number>;
    unresolved: number;
    unacknowledged: number;
  }> {
    const { reports } = await this.listReports({ limit: 10000 });

    const bySeverity: Record<string, number> = {};
    let unresolved = 0;
    let unacknowledged = 0;

    for (const report of reports) {
      bySeverity[report.severity] = (bySeverity[report.severity] || 0) + 1;
      if (!report.resolved) unresolved++;
      if (!report.acknowledged) unacknowledged++;
    }

    return {
      total: reports.length,
      bySeverity,
      unresolved,
      unacknowledged,
    };
  }

  /**
   * Clean up old resolved reports
   */
  async cleanup(daysToKeep = 30): Promise<number> {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const { reports } = await this.listReports({ resolved: true, limit: 10000 });
    
    let deleted = 0;
    
    for (const report of reports) {
      if (report.resolvedAt && report.resolvedAt < cutoff) {
        if (this.redis) {
          await this.redis.del(`${this.REPORT_PREFIX}${report.id}`);
          await this.redis.srem(
            `${this.AGENT_REPORTS_PREFIX}${report.agentAddress}`,
            report.id
          );
        } else {
          this.localStore.delete(report.id);
        }
        deleted++;
      }
    }

    logger.info('Cleaned up old reports', { deleted, daysToKeep });

    return deleted;
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

export default MissingReportService;
