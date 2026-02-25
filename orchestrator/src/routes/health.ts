import { Router } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';
import { HealthCheckResponse, ApiResponse } from '../types';

const router = Router();

/**
 * GET /health
 * Health check endpoint
 */
router.get('/', async (req, res) => {
  const health: HealthCheckResponse = {
    status: 'healthy',
    services: {
      blockchain: true,
      redis: true,
      llm: true,
      arweave: true,
      akash: true,
    },
    timestamp: Date.now(),
    version: process.env.npm_package_version || '1.0.0',
  };

  // Check services (simplified - in production would actually test connections)
  try {
    // TODO: Implement actual health checks
  } catch {
    health.status = 'degraded';
  }

  const response: ApiResponse<HealthCheckResponse> = {
    success: true,
    data: health,
    meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
  };

  res.json(response);
});

export default router;
