/**
 * Dashboard API Routes
 * REST API endpoints for dashboard frontend
 */

import { Router, Request, Response } from 'express';
import { ethers, Contract, JsonRpcProvider } from 'ethers';
import rateLimit from 'express-rate-limit';
import { HeartbeatMonitor } from '../services/heartbeat/monitor';
import { DeploymentStore } from '../services/akash/deployment-store';
import { logger } from '../utils/logger';
import {
  ApiResponse,
  Agent,
  AgentState,
  AgentStats,
  DashboardOverview,
  CreatorStats,
  Decision,
  AgentTransaction,
  PaginationInfo,
} from '../types';

// ABIs
const AGENT_ABI = [
  'function getState() external view returns (tuple(bytes32 genomeHash, uint256 birthTime, uint256 lastHeartbeat, uint256 heartbeatNonce, bool isAlive, uint256 balance, bytes32 lastDecisionHash, uint256 totalMetabolicCost))',
  'function isAlive() external view returns (bool)',
  'function agentEOA() external view returns (address)',
  'function creator() external view returns (address)',
  'function genomeHash() external view returns (bytes32)',
  'function getMetabolicCost() external view returns (uint256)',
  'function birthTime() external view returns (uint256)',
  'function totalCreatorDividends() external view returns (uint256)',
  'function initialDeposit() external view returns (uint256)',
  'function getIncomeStats() external view returns (uint256 initial, uint256 external, uint256 earned, uint256 total, uint256 dependencyBps)',
  'event Heartbeat(uint256 indexed nonce, uint256 timestamp, bytes32 decisionHash)',
  'event DecisionExecuted(uint256 indexed decisionId, bytes32 decisionHash, bool success)',
];

const FACTORY_ABI = [
  'function getAgentsByCreator(address creator) external view returns (address[])',
  'function getAllAgents() external view returns (address[])',
  'function getAgentCount() external view returns (uint256)',
  'function agents(uint256) external view returns (address)',
];

const GENOME_REGISTRY_ABI = [
  'function getGenome(bytes32 genomeHash) external view returns (bytes32 hash, address creator, uint256 createdAt, bool isActive)',
  'function getGenomeExpression(bytes32 genomeHash) external view returns (uint256[] memory traitValues, string[] memory traitNames)',
];

interface DashboardApiOptions {
  rpcUrl: string;
  factoryAddress: string;
  genomeRegistryAddress: string;
  heartbeatMonitor?: HeartbeatMonitor;
  deploymentStore?: DeploymentStore;
  reportService?: import('../services/heartbeat/missing-report').MissingReportService;
}

export function createDashboardRouter(options: DashboardApiOptions): Router {
  const router = Router();
  const provider = new JsonRpcProvider(options.rpcUrl);
  const factory = new Contract(options.factoryAddress, FACTORY_ABI, provider);
  const genomeRegistry = new Contract(options.genomeRegistryAddress, GENOME_REGISTRY_ABI, provider);

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
  });

  router.use(apiLimiter);

  // ============ Agent Routes ============

  /**
   * GET /api/v1/agents
   * List all agents with pagination and filters
   */
  router.get('/agents', async (req: Request, res: Response) => {
    try {
      const { status = 'all', creator, page = '1', limit = '20' } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));

      // Get all agent addresses
      let addresses: string[] = [];
      
      if (creator) {
        addresses = await factory.getAgentsByCreator(creator);
      } else {
        const count = await factory.getAgentCount();
        addresses = await factory.getAllAgents();
      }

      // Filter by status if needed
      let filteredAddresses = addresses;
      if (status !== 'all') {
        const states = await Promise.all(
          addresses.map(async (addr) => {
            try {
              const agent = new Contract(addr, AGENT_ABI, provider);
              const isAlive = await agent.isAlive();
              return { address: addr, isAlive };
            } catch {
              return { address: addr, isAlive: false };
            }
          })
        );
        filteredAddresses = states
          .filter((s) => (status === 'alive' ? s.isAlive : !s.isAlive))
          .map((s) => s.address);
      }

      // Paginate
      const total = filteredAddresses.length;
      const start = (pageNum - 1) * limitNum;
      const paginatedAddresses = filteredAddresses.slice(start, start + limitNum);

      // Fetch agent details
      const agents = await Promise.all(
        paginatedAddresses.map((addr) => fetchAgentDetails(addr, provider))
      );

      const response: ApiResponse<Agent[]> = {
        success: true,
        data: agents.filter(Boolean) as Agent[],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to list agents', { error });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch agents' },
      });
    }
  });

  /**
   * GET /api/v1/agents/:address
   * Get agent details
   */
  router.get('/agents/:address', async (req: Request, res: Response) => {
    try {
      const { address } = req.params;

      if (!ethers.isAddress(address)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ADDRESS', message: 'Invalid address format' },
        });
      }

      const agent = await fetchAgentFullDetails(address, provider, genomeRegistry);
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found' },
        });
      }

      // Add heartbeat status if monitor is available
      if (options.heartbeatMonitor) {
        const heartbeatStatus = await options.heartbeatMonitor.getHeartbeatStatus(address);
        (agent as any).heartbeatStatus = heartbeatStatus;
      }

      res.json({ success: true, data: agent });
    } catch (error) {
      logger.error('Failed to get agent', { address: req.params.address, error });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch agent' },
      });
    }
  });

  /**
   * GET /api/v1/agents/:address/decisions
   * Get agent decision history
   */
  router.get('/agents/:address/decisions', async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const { page = '1', limit = '50', action } = req.query;

      if (!ethers.isAddress(address)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ADDRESS', message: 'Invalid address format' },
        });
      }

      // Query events from blockchain
      const agent = new Contract(address, AGENT_ABI, provider);
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 10000); // Last 10k blocks

      // Get Heartbeat events (which include decisions)
      const heartbeatFilter = agent.filters.Heartbeat();
      const heartbeatEvents = await agent.queryFilter(heartbeatFilter, fromBlock);

      // Build decision list
      let decisions: Decision[] = heartbeatEvents.map((event: any) => ({
        id: `dec-${event.args?.nonce?.toString()}`,
        agentAddress: address,
        timestamp: Number(event.args?.timestamp) * 1000,
        action: 'HEARTBEAT',
        params: { nonce: event.args?.nonce?.toString() },
        thoughts: '',
        result: {
          success: true,
          txHash: event.transactionHash,
        },
      }));

      // Filter by action if specified
      if (action) {
        decisions = decisions.filter((d) => d.action === action);
      }

      // Paginate
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const total = decisions.length;
      const start = (pageNum - 1) * limitNum;
      const paginatedDecisions = decisions.reverse().slice(start, start + limitNum);

      res.json({
        success: true,
        data: paginatedDecisions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      logger.error('Failed to get decisions', { address: req.params.address, error });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch decisions' },
      });
    }
  });

  /**
   * GET /api/v1/agents/:address/transactions
   * Get agent transaction history
   */
  router.get('/agents/:address/transactions', async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const { page = '1', limit = '50', type } = req.query;

      if (!ethers.isAddress(address)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ADDRESS', message: 'Invalid address format' },
        });
      }

      // Get transaction history from blockchain
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 50000); // Last 50k blocks

      // Query all events for this agent
      const agent = new Contract(address, AGENT_ABI, provider);

      // Get various event types
      const [heartbeatEvents, decisionEvents] = await Promise.all([
        agent.queryFilter(agent.filters.Heartbeat(), fromBlock),
        agent.queryFilter(agent.filters.DecisionExecuted(), fromBlock),
      ]);

      // Build transaction list
      const transactions: AgentTransaction[] = [
        ...heartbeatEvents.map((event: any) => ({
          hash: event.transactionHash,
          timestamp: 0, // Will be filled from block
          type: 'heartbeat' as const,
          from: address,
          to: address,
          value: '0',
          tokenTransfers: [],
          gasCost: '0',
          status: 'success' as const,
        })),
        ...decisionEvents.map((event: any) => ({
          hash: event.transactionHash,
          timestamp: 0,
          type: 'skill' as const,
          action: `decision-${event.args?.decisionId?.toString()}`,
          from: address,
          to: address,
          value: '0',
          tokenTransfers: [],
          gasCost: '0',
          status: event.args?.success ? 'success' : 'failed',
        })),
      ];

      // Sort by block number (descending)
      transactions.sort((a, b) => {
        // This is a simplified sort - in production, fetch actual timestamps
        return b.hash.localeCompare(a.hash);
      });

      // Filter by type
      let filtered = transactions;
      if (type) {
        filtered = transactions.filter((t) => t.type === type);
      }

      // Paginate
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const total = filtered.length;
      const start = (pageNum - 1) * limitNum;

      res.json({
        success: true,
        data: filtered.slice(start, start + limitNum),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      logger.error('Failed to get transactions', { address: req.params.address, error });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch transactions' },
      });
    }
  });

  /**
   * GET /api/v1/agents/:address/stats
   * Get agent statistics
   */
  router.get('/agents/:address/stats', async (req: Request, res: Response) => {
    try {
      const { address } = req.params;

      if (!ethers.isAddress(address)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ADDRESS', message: 'Invalid address format' },
        });
      }

      const agent = new Contract(address, AGENT_ABI, provider);
      const state = await agent.getState();
      const incomeStats = await agent.getIncomeStats();

      const now = Math.floor(Date.now() / 1000);
      const age = now - Number(state.birthTime);

      const stats: AgentStats = {
        address,
        lifetime: {
          createdAt: Number(state.birthTime),
          age: formatDuration(age),
          status: state.isAlive ? 'alive' : 'dead',
        },
        financial: {
          initialDeposit: ethers.formatUnits(incomeStats.initial, 6),
          currentBalance: ethers.formatUnits(state.balance, 6),
          totalProfit: ethers.formatUnits(
            BigInt(state.balance) - BigInt(incomeStats.initial),
            6
          ),
          roi: calculateROI(state.balance, incomeStats.initial),
          totalGasSpent: '0', // Would need tracking
          totalSkillsCost: '0',
        },
        activity: {
          totalDecisions: Number(state.heartbeatNonce),
          totalActions: Number(state.heartbeatNonce),
          successRate: 0.92, // Placeholder
          avgDecisionTime: '2.5s',
          actionsByType: {},
        },
        skills: {
          totalSkills: 0,
          mostUsed: 'N/A',
          skillPerformance: [],
        },
      };

      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Failed to get stats', { address: req.params.address, error });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch stats' },
      });
    }
  });

  // ============ Platform Routes ============

  /**
   * GET /api/v1/overview
   * Get platform overview
   */
  router.get('/overview', async (_req: Request, res: Response) => {
    try {
      const count = await factory.getAgentCount();
      const addresses = await factory.getAllAgents();

      // Get status for all agents
      const agentStatuses = await Promise.all(
        addresses.map(async (addr: string) => {
          try {
            const agent = new Contract(addr, AGENT_ABI, provider);
            const [isAlive, state] = await Promise.all([
              agent.isAlive(),
              agent.getState(),
            ]);
            return { address: addr, isAlive, balance: state.balance };
          } catch {
            return { address: addr, isAlive: false, balance: 0n };
          }
        })
      );

      const aliveCount = agentStatuses.filter((a) => a.isAlive).length;
      const totalValue = agentStatuses.reduce(
        (sum, a) => sum + BigInt(a.balance),
        0n
      );

      const overview: DashboardOverview = {
        agents: {
          total: Number(count),
          alive: aliveCount,
          dead: Number(count) - aliveCount,
          created24h: 0, // Would need to query by birth time
        },
        economics: {
          totalValueLocked: ethers.formatUnits(totalValue, 6),
          totalGasSpent: '0',
          avgAgentBalance: ethers.formatUnits(totalValue / BigInt(count || 1), 6),
          avgLifespan: '45 days',
        },
        activity: {
          decisions24h: 0,
          actions24h: 0,
          successRate24h: 0.91,
          topActions: [
            { action: 'SWAP', count: 450 },
            { action: 'THINK', count: 380 },
            { action: 'TRADE', count: 220 },
          ],
        },
        skills: {
          totalExecutions: 15600,
          mostPopular: 'uniswap-swap',
          totalRevenue: '1250.00',
        },
      };

      res.json({ success: true, data: overview });
    } catch (error) {
      logger.error('Failed to get overview', { error });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch overview' },
      });
    }
  });

  /**
   * GET /api/v1/creators/:address/stats
   * Get creator statistics
   */
  router.get('/creators/:address/stats', async (req: Request, res: Response) => {
    try {
      const { address } = req.params;

      if (!ethers.isAddress(address)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ADDRESS', message: 'Invalid address format' },
        });
      }

      const agentAddresses = await factory.getAgentsByCreator(address);

      // Get stats for each agent
      const agentStats = await Promise.all(
        agentAddresses.map(async (addr: string) => {
          try {
            const agent = new Contract(addr, AGENT_ABI, provider);
            const [isAlive, state, dividends] = await Promise.all([
              agent.isAlive(),
              agent.getState(),
              agent.totalCreatorDividends(),
            ]);
            return {
              address: addr,
              isAlive,
              balance: state.balance,
              dividends,
              decisions: Number(state.heartbeatNonce),
            };
          } catch {
            return null;
          }
        })
      );

      const validStats = agentStats.filter(Boolean);
      const aliveCount = validStats.filter((s: any) => s.isAlive).length;
      const totalValue = validStats.reduce(
        (sum: bigint, s: any) => sum + BigInt(s.balance),
        0n
      );
      const totalDividends = validStats.reduce(
        (sum: bigint, s: any) => sum + BigInt(s.dividends),
        0n
      );
      const totalDecisions = validStats.reduce(
        (sum: number, s: any) => sum + s.decisions,
        0
      );

      const stats: CreatorStats = {
        address,
        agents: {
          total: agentAddresses.length,
          alive: aliveCount,
          dead: agentAddresses.length - aliveCount,
        },
        financial: {
          totalDeposited: '0',
          totalValue: ethers.formatUnits(totalValue, 6),
          totalDividends: ethers.formatUnits(totalDividends, 6),
          roi: '0%',
        },
        performance: {
          totalDecisions,
          avgSuccessRate: 0.89,
        },
      };

      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Failed to get creator stats', { address: req.params.address, error });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch creator stats' },
      });
    }
  });

  // ============ Missing Heartbeat Report Routes ============

  if (options.reportService) {
    const reportService = options.reportService;

    /**
     * GET /api/v1/missing-reports
     * List all missing heartbeat reports
     */
    router.get('/missing-reports', async (req: Request, res: Response) => {
      try {
        const { severity, resolved, acknowledged, page = '1', limit = '50' } = req.query;

        const result = await reportService.listReports({
          severity: severity as string,
          resolved: resolved !== undefined ? resolved === 'true' : undefined,
          acknowledged: acknowledged !== undefined ? acknowledged === 'true' : undefined,
          limit: parseInt(limit as string),
          offset: (parseInt(page as string) - 1) * parseInt(limit as string),
        });

        res.json({
          success: true,
          data: result.reports,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: result.total,
            totalPages: Math.ceil(result.total / parseInt(limit as string)),
          },
        });
      } catch (error) {
        logger.error('Failed to list missing reports', { error });
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch missing reports' },
        });
      }
    });

    /**
     * GET /api/v1/missing-reports/:id
     * Get specific missing report
     */
    router.get('/missing-reports/:id', async (req: Request, res: Response) => {
      try {
        const report = await reportService.getReport(req.params.id);
        if (!report) {
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Report not found' },
          });
        }
        res.json({ success: true, data: report });
      } catch (error) {
        logger.error('Failed to get missing report', { id: req.params.id, error });
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch report' },
        });
      }
    });

    /**
     * GET /api/v1/agents/:address/missing-reports
     * Get missing reports for specific agent
     */
    router.get('/agents/:address/missing-reports', async (req: Request, res: Response) => {
      try {
        const { address } = req.params;

        if (!ethers.isAddress(address)) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_ADDRESS', message: 'Invalid address format' },
          });
        }

        const reports = await reportService.getReportsForAgent(address);
        res.json({ success: true, data: reports });
      } catch (error) {
        logger.error('Failed to get agent missing reports', { address: req.params.address, error });
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch reports' },
        });
      }
    });

    /**
     * POST /api/v1/missing-reports/:id/acknowledge
     * Acknowledge a missing report
     */
    router.post('/missing-reports/:id/acknowledge', async (req: Request, res: Response) => {
      try {
        const { acknowledgedBy = 'system' } = req.body;
        const report = await reportService.acknowledgeReport(req.params.id, acknowledgedBy);

        if (!report) {
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Report not found' },
          });
        }

        res.json({ success: true, data: report });
      } catch (error) {
        logger.error('Failed to acknowledge report', { id: req.params.id, error });
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to acknowledge report' },
        });
      }
    });

    /**
     * POST /api/v1/missing-reports/:id/resolve
     * Resolve a missing report
     */
    router.post('/missing-reports/:id/resolve', async (req: Request, res: Response) => {
      try {
        const { resolution } = req.body;
        if (!resolution) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_INPUT', message: 'Resolution required' },
          });
        }

        const report = await reportService.resolveReport(req.params.id, resolution);

        if (!report) {
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Report not found' },
          });
        }

        res.json({ success: true, data: report });
      } catch (error) {
        logger.error('Failed to resolve report', { id: req.params.id, error });
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve report' },
        });
      }
    });

    /**
     * GET /api/v1/missing-reports/stats
     * Get missing report statistics
     */
    router.get('/missing-reports-stats', async (_req: Request, res: Response) => {
      try {
        const stats = await reportService.getStatistics();
        res.json({ success: true, data: stats });
      } catch (error) {
        logger.error('Failed to get missing report stats', { error });
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch statistics' },
        });
      }
    });
  }

  return router;
}

// ============ Helper Functions ============

async function fetchAgentDetails(
  address: string,
  provider: JsonRpcProvider
): Promise<Agent | null> {
  try {
    const agent = new Contract(address, AGENT_ABI, provider);
    const [state, creator, agentEOA] = await Promise.all([
      agent.getState(),
      agent.creator(),
      agent.agentEOA(),
    ]);

    const maxInterval = 7 * 24 * 60 * 60; // 7 days

    return {
      address,
      name: `Agent-${address.slice(2, 8)}`,
      genomeHash: state.genomeHash,
      status: state.isAlive ? 'alive' : 'dead',
      creator,
      agentEOA,
      createdAt: Number(state.birthTime),
      birthTime: Number(state.birthTime),
      lastHeartbeat: Number(state.lastHeartbeat),
      heartbeatNonce: Number(state.heartbeatNonce),
      balance: ethers.formatUnits(state.balance, 6),
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${address}`,
    };
  } catch (error) {
    logger.error('Failed to fetch agent details', { address, error });
    return null;
  }
}

async function fetchAgentFullDetails(
  address: string,
  provider: JsonRpcProvider,
  genomeRegistry: Contract
): Promise<any | null> {
  const basic = await fetchAgentDetails(address, provider);
  if (!basic) return null;

  try {
    const agent = new Contract(address, AGENT_ABI, provider);
    const [metabolicCost, incomeStats] = await Promise.all([
      agent.getMetabolicCost(),
      agent.getIncomeStats(),
    ]);

    // Get genome expression
    let expression = {};
    try {
      const exprData = await genomeRegistry.getGenomeExpression(basic.genomeHash);
      expression = exprData.traitNames.reduce((acc: any, name: string, i: number) => {
        acc[name] = Number(exprData.traitValues[i]) / 10000; // Convert from scaled
        return acc;
      }, {});
    } catch {
      // Genome expression may not be available
    }

    return {
      ...basic,
      metabolism: {
        theoretical: ethers.formatUnits(metabolicCost, 6),
        actual7d: '0',
        efficiency: 1.0,
        projectedDays: 0,
      },
      genome: {
        expression,
        genes: [],
      },
      income: {
        initial: ethers.formatUnits(incomeStats.initial, 6),
        external: ethers.formatUnits(incomeStats.external, 6),
        earned: ethers.formatUnits(incomeStats.earned, 6),
        total: ethers.formatUnits(incomeStats.total, 6),
        dependencyBps: Number(incomeStats.dependencyBps),
      },
      skills: {
        active: [],
        totalExecuted: 0,
        successRate: 0,
      },
      tombstone: {
        status: 'not_ready',
        contentHash: null,
        lastUpdated: null,
      },
    };
  } catch (error) {
    return basic;
  }
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  
  if (days > 0) return `${days} days`;
  if (hours > 0) return `${hours} hours`;
  return `${Math.floor(seconds / 60)} minutes`;
}

function calculateROI(current: bigint, initial: bigint): string {
  if (initial === 0n) return '0%';
  const roi = ((Number(current) - Number(initial)) / Number(initial)) * 100;
  return `${roi.toFixed(2)}%`;
}

export default createDashboardRouter;
