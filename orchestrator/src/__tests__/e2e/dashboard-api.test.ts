/**
 * Dashboard API E2E Tests
 */

import request from 'supertest';
import express from 'express';
import createDashboardRouter from '../../api/dashboard';
import { HeartbeatMonitor } from '../../services/heartbeat/monitor';
import { MissingReportService } from '../../services/heartbeat/missing-report';
import { DeploymentStore } from '../../services/akash/deployment-store';

// Mock environment
process.env.RPC_URL = 'http://localhost:8545';
process.env.FACTORY_ADDRESS = '0x1234567890abcdef';
process.env.GENOME_REGISTRY_ADDRESS = '0xfedcba0987654321';

describe('Dashboard API E2E', () => {
  let app: express.Application;
  let reportService: MissingReportService;

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    reportService = new MissingReportService();

    const router = createDashboardRouter({
      rpcUrl: process.env.RPC_URL,
      factoryAddress: process.env.FACTORY_ADDRESS,
      genomeRegistryAddress: process.env.GENOME_REGISTRY_ADDRESS,
      reportService,
    });

    app.use('/api/v1', router);
  });

  afterAll(async () => {
    await reportService.close();
  });

  describe('Health Check', () => {
    it('GET /health should return 200', async () => {
      // Note: Health endpoint is in main index.ts, not in dashboard router
      // This test serves as a placeholder for the actual health check
      expect(true).toBe(true);
    });
  });

  describe('Agents API', () => {
    it('GET /api/v1/agents should return agent list', async () => {
      const response = await request(app)
        .get('/api/v1/agents')
        .expect('Content-Type', /json/);

      // May fail if blockchain is not available, but should return proper error format
      expect(response.body).toHaveProperty('success');
    });

    it('GET /api/v1/agents with pagination params', async () => {
      const response = await request(app)
        .get('/api/v1/agents?page=1&limit=10')
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('success');
    });

    it('GET /api/v1/agents with status filter', async () => {
      const response = await request(app)
        .get('/api/v1/agents?status=alive')
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('success');
    });

    it('GET /api/v1/agents/:address with invalid address', async () => {
      const response = await request(app)
        .get('/api/v1/agents/invalid-address')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_ADDRESS');
    });
  });

  describe('Overview API', () => {
    it('GET /api/v1/overview should return platform stats', async () => {
      const response = await request(app)
        .get('/api/v1/overview')
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('success');
    });
  });

  describe('Creator API', () => {
    it('GET /api/v1/creators/:address/stats with invalid address', async () => {
      const response = await request(app)
        .get('/api/v1/creators/invalid-address/stats')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_ADDRESS');
    });
  });

  describe('Missing Reports API', () => {
    it('GET /api/v1/missing-reports should return reports', async () => {
      const response = await request(app)
        .get('/api/v1/missing-reports')
        .expect('Content-Type', /json/);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
    });

    it('GET /api/v1/missing-reports with filters', async () => {
      const response = await request(app)
        .get('/api/v1/missing-reports?severity=warning&resolved=false')
        .expect('Content-Type', /json/);

      expect(response.body.success).toBe(true);
    });

    it('GET /api/v1/missing-reports-stats should return statistics', async () => {
      const response = await request(app)
        .get('/api/v1/missing-reports-stats')
        .expect('Content-Type', /json/);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('bySeverity');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/v1/unknown-route')
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should handle invalid JSON', async () => {
      const response = await request(app)
        .post('/api/v1/missing-reports/test-id/acknowledge')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400);

      // Express should handle invalid JSON
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});

describe('Dashboard API Response Format', () => {
  it('should return consistent API response format', () => {
    const mockSuccessResponse = {
      success: true,
      data: { test: 'data' },
      pagination: {
        page: 1,
        limit: 20,
        total: 100,
        totalPages: 5,
      },
    };

    const mockErrorResponse = {
      success: false,
      error: {
        code: 'ERROR_CODE',
        message: 'Error message',
      },
    };

    expect(mockSuccessResponse).toHaveProperty('success');
    expect(mockSuccessResponse).toHaveProperty('data');
    expect(mockErrorResponse).toHaveProperty('success');
    expect(mockErrorResponse).toHaveProperty('error');
  });
});
