/**
 * PETRILABS Orchestrator Service
 * Main entry point
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import dotenv from 'dotenv';

import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { HeartbeatMonitor } from './services/heartbeat/monitor';
import { DeploymentStore } from './services/akash/deployment-store';
import { MissingReportService } from './services/heartbeat/missing-report';
import createDashboardRouter from './api/dashboard';
import createWebSocketServer from './api/websocket';

// Load environment variables
dotenv.config();

// Configuration
const PORT = parseInt(process.env.PORT || '3000');
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || '';
const GENOME_REGISTRY_ADDRESS = process.env.GENOME_REGISTRY_ADDRESS || '';
const REDIS_URL = process.env.REDIS_URL;

// Akash configuration
const AKASH_RPC = process.env.AKASH_RPC || 'https://rpc.akashnet.net';
const AKASH_REST = process.env.AKASH_REST || 'https://api.akashnet.net';
const AKASH_MNEMONIC = process.env.AKASH_MNEMONIC;
const AKASH_CHAIN_ID = process.env.AKASH_CHAIN_ID || 'akashnet-2';

async function main() {
  logger.info('Starting PETRILABS Orchestrator', {
    port: PORT,
    network: RPC_URL,
  });

  // Validate required configuration
  if (!FACTORY_ADDRESS) {
    logger.error('FACTORY_ADDRESS not configured');
    process.exit(1);
  }

  // Initialize Express app
  const app = express();
  const server = createServer(app);

  // Middleware
  app.use(helmet({
    contentSecurityPolicy: false,
  }));
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
  }));
  app.use(express.json());

  // Initialize services
  const deploymentStore = new DeploymentStore(REDIS_URL);
  const reportService = new MissingReportService(REDIS_URL);

  // Initialize heartbeat monitor
  const heartbeatMonitor = new HeartbeatMonitor({
    rpcUrl: RPC_URL,
    factoryAddress: FACTORY_ADDRESS,
    redisUrl: REDIS_URL,
    akashConfig: AKASH_MNEMONIC
      ? {
          rpcEndpoint: AKASH_RPC,
          restEndpoint: AKASH_REST,
          mnemonic: AKASH_MNEMONIC,
          chainId: AKASH_CHAIN_ID,
        }
      : undefined,
    config: {
      checkIntervalMs: parseInt(process.env.CHECK_INTERVAL_MS || '60000'),
      warningThreshold: parseInt(process.env.WARNING_THRESHOLD_HOURS || '24'),
      criticalThreshold: parseInt(process.env.CRITICAL_THRESHOLD_HOURS || '6'),
      akashCheckEnabled: process.env.AKASH_CHECK_ENABLED === 'true',
      autoRestartEnabled: process.env.AUTO_RESTART_ENABLED === 'true',
    },
  });

  // Start heartbeat monitor
  await heartbeatMonitor.start();
  logger.info('Heartbeat monitor started');

  // Initialize WebSocket server
  const wss = createWebSocketServer({
    server,
    heartbeatMonitor,
    path: '/ws',
  });

  // Dashboard API routes
  const dashboardRouter = createDashboardRouter({
    rpcUrl: RPC_URL,
    factoryAddress: FACTORY_ADDRESS,
    genomeRegistryAddress: GENOME_REGISTRY_ADDRESS,
    heartbeatMonitor,
    deploymentStore,
    reportService,
  });

  app.use('/api/v1', dashboardRouter);

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  // Start server
  server.listen(PORT, () => {
    logger.info(`Orchestrator listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    server.close(async () => {
      logger.info('HTTP server closed');

      await heartbeatMonitor.stop();
      logger.info('Heartbeat monitor stopped');

      await deploymentStore.close();
      logger.info('Deployment store closed');

      wss.close(() => {
        logger.info('WebSocket server closed');
        process.exit(0);
      });
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Run main
main().catch((error) => {
  logger.error('Fatal error', { error });
  process.exit(1);
});

export default main;
