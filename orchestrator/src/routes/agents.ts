import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { DeploymentService } from '../services/deployment';
import BlockchainService from '../services/blockchain';
import { logger } from '../utils/logger';
import { ApiResponse, ErrorCodes } from '../types';

const router = Router();
const deploymentService = new DeploymentService();
const blockchainService = new BlockchainService();

// Rate limiting
const createAgentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many agent creation requests, please try again later',
});

/**
 * POST /api/agents
 * Create a new agent
 */
router.post(
  '/',
  createAgentLimiter,
  [
    body('initialDeposit').isString().notEmpty().withMessage('Initial deposit is required'),
    body('creatorAddress').isString().isLength({ min: 42, max: 42 }).withMessage('Valid creator address required'),
    body('memoryFile').optional().isString(),
    body('memoryHash').optional().isString(),
    body('memoryURI').optional().isString(),
    body('preferredTraits').optional().isArray(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: ErrorCodes.INVALID_INPUT,
          message: 'Validation failed',
          details: errors.array(),
        },
        meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
      };
      return res.status(400).json(response);
    }

    try {
      const {
        memoryFile,
        memoryHash,
        memoryURI,
        initialDeposit,
        creatorAddress,
        preferredTraits,
      } = req.body;

      // Validate deposit
      const minDeposit = 20 * 1e6; // 20 USDC
      if (BigInt(initialDeposit) < BigInt(minDeposit)) {
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: ErrorCodes.INVALID_INPUT,
            message: `Initial deposit must be at least ${minDeposit} USDC (6 decimals)`,
          },
          meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
        };
        return res.status(400).json(response);
      }

      // Start deployment
      const result = await deploymentService.deploy({
        memoryFile: memoryFile ? Buffer.from(memoryFile, 'base64') : undefined,
        memoryHash,
        memoryURI,
        initialDeposit,
        creatorAddress,
        preferredTraits,
      });

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
      };

      res.status(202).json(response);
    } catch (error) {
      logger.error('Failed to create agent', { error });
      
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Failed to create agent',
        },
        meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
      };

      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/agents/:jobId/status
 * Get deployment status
 */
router.get('/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = await deploymentService.getJobStatus(jobId);

    if (!status) {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: 'Job not found',
        },
        meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse<typeof status> = {
      success: true,
      data: status,
      meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get job status', { error });
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : 'Failed to get status',
      },
      meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/agents/:address
 * Get agent info
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    const info = await blockchainService.getAgent(address);
    const state = await blockchainService.getAgentState(address);

    const response: ApiResponse<{ info: typeof info; state: typeof state }> = {
      success: true,
      data: { info, state },
      meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get agent', { error, address: req.params.address });
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: ErrorCodes.NOT_FOUND,
        message: 'Agent not found',
      },
      meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
    };

    res.status(404).json(response);
  }
});

/**
 * GET /api/agents/:address/genes/:geneId
 * Get gene expression
 */
router.get('/:address/genes/:geneId', async (req, res) => {
  try {
    const { address, geneId } = req.params;
    
    const expression = await blockchainService.getGeneExpression(address, parseInt(geneId));

    const response: ApiResponse<{ geneId: number; expression: string }> = {
      success: true,
      data: { geneId: parseInt(geneId), expression },
      meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get gene expression', { error });
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Failed to get gene expression',
      },
      meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
    };

    res.status(500).json(response);
  }
});

export default router;
