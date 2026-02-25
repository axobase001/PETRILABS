/**
 * Storage API Routes
 * Agent 运行时调用这些 API 来进行 Arweave 存储
 * 
 * 所有请求都需要 X-Agent-Address 头
 * 编排服务验证 Agent 身份并代付 AR
 */

import { Router } from 'express';
import { body, header, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { ArweaveProxyService } from '../services/arweave-proxy';
import { logger } from '../utils/logger';
import { ApiResponse, ErrorCodes } from '../types';

const router = Router();

// 存储请求限流：每个 Agent 每分钟最多 10 次
const storageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.headers['x-agent-address'] as string || req.ip || 'unknown',
  message: 'Storage rate limit exceeded',
});

// 存储服务实例（需要在应用启动时初始化）
let arweaveProxy: ArweaveProxyService;

export function setArweaveProxy(service: ArweaveProxyService) {
  arweaveProxy = service;
}

/**
 * POST /api/storage/store
 * 存储数据到 Arweave（通过代理）
 */
router.post(
  '/store',
  storageLimiter,
  [
    header('x-agent-address').isEthereumAddress().withMessage('Valid agent address required'),
    body('data').isString().withMessage('Data is required'),
    body('tags').optional().isArray(),
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
      const agentAddress = req.headers['x-agent-address'] as string;
      const { data, tags = [] } = req.body;

      // 解码 base64 数据
      const dataBuffer = Buffer.from(data, 'base64');

      // 检查 Agent 存储账户
      const account = arweaveProxy.getAccount(agentAddress);
      if (!account) {
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: 'Storage account not found for this agent',
          },
          meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
        };
        return res.status(404).json(response);
      }

      // 检查余额是否充足
      const estimatedCost = await arweaveProxy['estimateARCost'](dataBuffer.length);
      if (BigInt(account.arBalance) < BigInt(estimatedCost) * BigInt(2)) {
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: ErrorCodes.INSUFFICIENT_PAYMENT,
            message: 'Insufficient AR storage balance',
            details: {
              required: estimatedCost,
              available: account.arBalance,
            },
          },
          meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
        };
        return res.status(402).json(response);
      }

      // 执行存储
      const receipt = await arweaveProxy.store({
        agentAddress,
        data: dataBuffer,
        tags,
      });

      const response: ApiResponse<typeof receipt> = {
        success: true,
        data: receipt,
        meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
      };

      res.json(response);

    } catch (error) {
      logger.error('Storage API error', { error });
      
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Storage failed',
        },
        meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
      };

      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/storage/account/:agentAddress
 * 获取 Agent 存储账户信息
 */
router.get('/account/:agentAddress', async (req, res) => {
  try {
    const { agentAddress } = req.params;
    
    const account = arweaveProxy.getAccount(agentAddress);
    
    if (!account) {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: 'Storage account not found',
        },
        meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse<typeof account> = {
      success: true,
      data: account,
      meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
    };

    res.json(response);

  } catch (error) {
    logger.error('Get storage account error', { error });
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Failed to get storage account',
      },
      meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/storage/estimate
 * 估算存储成本
 */
router.get('/estimate', async (req, res) => {
  try {
    const bytes = parseInt(req.query.bytes as string) || 0;
    
    const usdcCost = await arweaveProxy.estimateCostUSDC(bytes);
    
    const response: ApiResponse<{ bytes: number; usdcCost: string }> = {
      success: true,
      data: { bytes, usdcCost },
      meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
    };

    res.json(response);

  } catch (error) {
    logger.error('Estimate storage cost error', { error });
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Failed to estimate cost',
      },
      meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/storage/proxy/balance
 * 获取托管钱包余额（管理员用）
 */
router.get('/proxy/balance', async (req, res) => {
  try {
    const balance = await arweaveProxy.getWalletBalance();
    const accounts = arweaveProxy.getAllAccounts();
    
    const totalOwed = accounts.reduce(
      (sum, acc) => sum + BigInt(acc.arBalance),
      BigInt(0)
    );

    const response: ApiResponse<{
      walletBalance: string;
      totalOwed: string;
      agentCount: number;
    }> = {
      success: true,
      data: {
        walletBalance: balance,
        totalOwed: totalOwed.toString(),
        agentCount: accounts.length,
      },
      meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
    };

    res.json(response);

  } catch (error) {
    logger.error('Get proxy balance error', { error });
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Failed to get proxy balance',
      },
      meta: { timestamp: Date.now(), requestId: req.headers['x-request-id'] as string },
    };

    res.status(500).json(response);
  }
});

export default router;
