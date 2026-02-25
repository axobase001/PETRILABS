import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Worker } from 'bullmq';

import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { DeploymentService } from './services/deployment';

// Routes
import agentsRouter from './routes/agents';
import healthRouter from './routes/health';

// Validate config
validateConfig();

const app = express();
const deploymentService = new DeploymentService();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://petrilabs.io', 'https://app.petrilabs.io'] 
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));
app.use(express.json({ limit: '10mb' }));

// Request ID middleware
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || 
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  req.headers['x-request-id'] = requestId as string;
  res.setHeader('X-Request-ID', requestId);
  next();
});

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    requestId: req.headers['x-request-id'],
    ip: req.ip,
  });
  next();
});

// Routes
app.use('/api/agents', agentsRouter);
app.use('/health', healthRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.path} not found`,
    },
    meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] },
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    requestId: req.headers['x-request-id'],
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
    meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] },
  });
});

// Start worker for processing deployment jobs
const worker = new Worker(
  'agent-deployment',
  async (job) => {
    logger.info('Processing job', { jobId: job.id });
    return deploymentService.processDeployment(job);
  },
  {
    connection: { url: config.redis.url },
    concurrency: 2,
  }
);

worker.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.id });
});

worker.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job?.id, error: err.message });
});

// Start server
const server = app.listen(config.server.port, () => {
  logger.info(`🚀 Orchestrator service running on port ${config.server.port}`);
  logger.info(`📊 Environment: ${config.server.nodeEnv}`);
  logger.info(`🔗 Blockchain: ${config.blockchain.rpcUrl}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  await worker.close();
  await deploymentService.close();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  await worker.close();
  await deploymentService.close();
  
  process.exit(0);
});

export default app;
