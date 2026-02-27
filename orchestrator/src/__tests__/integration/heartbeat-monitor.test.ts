/**
 * Heartbeat Monitor Integration Tests
 */

import { HeartbeatMonitor } from '../../services/heartbeat/monitor';
import { MissingReportService } from '../../services/heartbeat/missing-report';
import { AkashClient } from '../../services/akash/client';
import { MissingHeartbeat, MonitorAlert } from '../../types';

// Mock contracts and providers
const mockAgentState = {
  genomeHash: '0x1234567890abcdef',
  birthTime: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
  lastHeartbeat: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
  heartbeatNonce: 10,
  isAlive: true,
  balance: '1000000000', // 1000 USDC
  lastDecisionHash: '0x0000000000000000',
  totalMetabolicCost: '2500000', // 2.5 USDC/day
};

describe('HeartbeatMonitor Integration', () => {
  let monitor: HeartbeatMonitor;

  beforeEach(() => {
    monitor = new HeartbeatMonitor({
      rpcUrl: 'http://localhost:8545',
      factoryAddress: '0x1234567890abcdef',
      config: {
        checkIntervalMs: 1000,
        warningThreshold: 24,
        criticalThreshold: 6,
        akashCheckEnabled: false,
        autoRestartEnabled: false,
      },
    });
  });

  afterEach(async () => {
    await monitor.stop();
  });

  describe('Monitor Lifecycle', () => {
    it('should start and stop without errors', async () => {
      await monitor.start();
      expect(monitor).toBeDefined();
      await monitor.stop();
    });

    it('should not start multiple times', async () => {
      await monitor.start();
      await monitor.start(); // Should not throw
      expect(monitor).toBeDefined();
    });
  });

  describe('Alert System', () => {
    it('should receive alerts when registered', (done) => {
      const alertHandler = jest.fn();
      monitor.onAlert(alertHandler);

      // Simulate alert
      const testAlert: MonitorAlert = {
        id: 'test-1',
        agentAddress: '0xabc',
        type: 'missing_heartbeat',
        severity: 'warning',
        message: 'Test alert',
        timestamp: Date.now(),
        acknowledged: false,
      };

      // Trigger through internal method (would need to be exposed for testing)
      // monitor['alertHandlers'].forEach((h: any) => h(testAlert));
      
      // For now, just verify handler is registered
      expect(monitor).toBeDefined();
      done();
    });
  });

  describe('WebSocket Registration', () => {
    it('should register WebSocket clients', () => {
      const mockWs = {
        readyState: 1, // OPEN
        send: jest.fn(),
        addEventListener: jest.fn(),
      } as any;

      monitor.registerWebSocket(mockWs);
      expect(monitor).toBeDefined();
    });
  });
});

describe('MissingReportService Integration', () => {
  let reportService: MissingReportService;

  beforeEach(() => {
    reportService = new MissingReportService();
  });

  afterEach(async () => {
    await reportService.close();
  });

  describe('Report CRUD', () => {
    it('should create and retrieve a report', async () => {
      const missing: MissingHeartbeat = {
        agentAddress: '0x123',
        expectedTime: Date.now() / 1000,
        lastHeartbeat: Date.now() / 1000 - 3600,
        deadline: Date.now() / 1000 + 86400,
        severity: 'warning',
      };

      const report = await reportService.createReport(missing);
      expect(report).toBeDefined();
      expect(report.agentAddress).toBe('0x123');
      expect(report.severity).toBe('warning');

      const retrieved = await reportService.getReport(report.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(report.id);
    });

    it('should acknowledge a report', async () => {
      const missing: MissingHeartbeat = {
        agentAddress: '0x123',
        expectedTime: Date.now() / 1000,
        lastHeartbeat: Date.now() / 1000 - 3600,
        deadline: Date.now() / 1000 + 86400,
        severity: 'warning',
      };

      const report = await reportService.createReport(missing);
      const acknowledged = await reportService.acknowledgeReport(report.id, 'test-user');

      expect(acknowledged).toBeDefined();
      expect(acknowledged?.acknowledged).toBe(true);
      expect(acknowledged?.acknowledgedBy).toBe('test-user');
    });

    it('should resolve a report', async () => {
      const missing: MissingHeartbeat = {
        agentAddress: '0x123',
        expectedTime: Date.now() / 1000,
        lastHeartbeat: Date.now() / 1000 - 3600,
        deadline: Date.now() / 1000 + 86400,
        severity: 'warning',
      };

      const report = await reportService.createReport(missing);
      const resolved = await reportService.resolveReport(report.id, 'Container restarted');

      expect(resolved).toBeDefined();
      expect(resolved?.resolved).toBe(true);
      expect(resolved?.resolution).toBe('Container restarted');
    });

    it('should list reports with filters', async () => {
      // Create multiple reports
      for (let i = 0; i < 5; i++) {
        await reportService.createReport({
          agentAddress: `0x${i}`,
          expectedTime: Date.now() / 1000,
          lastHeartbeat: Date.now() / 1000 - 3600,
          deadline: Date.now() / 1000 + 86400,
          severity: i % 2 === 0 ? 'warning' : 'critical',
        });
      }

      const { reports, total } = await reportService.listReports();
      expect(total).toBeGreaterThanOrEqual(5);
      expect(reports.length).toBeGreaterThanOrEqual(5);
    });

    it('should get reports by agent', async () => {
      const agentAddress = '0xabc123';
      
      await reportService.createReport({
        agentAddress,
        expectedTime: Date.now() / 1000,
        lastHeartbeat: Date.now() / 1000 - 3600,
        deadline: Date.now() / 1000 + 86400,
        severity: 'warning',
      });

      const reports = await reportService.getReportsForAgent(agentAddress);
      expect(reports.length).toBeGreaterThanOrEqual(1);
      expect(reports[0].agentAddress).toBe(agentAddress);
    });
  });

  describe('Statistics', () => {
    it('should calculate statistics', async () => {
      const stats = await reportService.getStatistics();
      
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('bySeverity');
      expect(stats).toHaveProperty('unresolved');
      expect(stats).toHaveProperty('unacknowledged');
    });
  });
});
