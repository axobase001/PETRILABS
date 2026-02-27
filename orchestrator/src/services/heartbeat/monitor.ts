/**
 * Heartbeat Monitor Service
 * Monitors agent liveness, handles Akash container crashes, writes missing reports
 */

import { ethers, Contract, JsonRpcProvider } from 'ethers';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../../utils/logger';
import {
  Agent,
  AgentState,
  HeartbeatStatus,
  MissingHeartbeat,
  MonitorConfig,
  MonitorAlert,
  WebSocketMessage,
} from '../../types';
import { AkashClient } from '../akash/client';
import { DeploymentStore } from '../akash/deployment-store';
import { MissingReportService } from './missing-report';

// ABI for PetriAgentV2
const AGENT_ABI = [
  'function getState() external view returns (tuple(bytes32 genomeHash, uint256 birthTime, uint256 lastHeartbeat, uint256 heartbeatNonce, bool isAlive, uint256 balance, bytes32 lastDecisionHash, uint256 totalMetabolicCost))',
  'function heartbeat(bytes32 _decisionHash, string calldata _arweaveTxId) external returns (bool)',
  'function declareAbandoned() external',
  'function die(string calldata arweaveTxId) external',
  'function isAlive() external view returns (bool)',
  'function agentEOA() external view returns (address)',
  'function heartbeatInterval() external view returns (uint256)',
  'event Heartbeat(uint256 indexed nonce, uint256 timestamp, bytes32 decisionHash)',
  'event AbandonedDeclared(address indexed agent, uint256 timeSinceLastHeartbeat)',
  'event AgentDied(address indexed agentAddress, uint256 timestamp, string reason, string arweaveTxId, uint256 finalBalance, bytes32 indexed tombstoneId, address indexed creator)',
];

// ABI for PetriAgentFactory
const FACTORY_ABI = [
  'function getAgentsByCreator(address creator) external view returns (address[])',
  'function getAllAgents() external view returns (address[])',
  'function getAgentCount() external view returns (uint256)',
  'event AgentCreated(address indexed agent, address indexed creator, bytes32 indexed genomeHash)',
];

export interface HeartbeatMonitorOptions {
  rpcUrl: string;
  factoryAddress: string;
  redisUrl?: string;
  akashConfig?: {
    rpcEndpoint: string;
    restEndpoint: string;
    mnemonic?: string;
    privateKey?: string;
    chainId: string;
  };
  config?: Partial<MonitorConfig>;
}

export class HeartbeatMonitor {
  private provider: JsonRpcProvider;
  private factory: Contract;
  private redis: Redis;
  private akashClient?: AkashClient;
  private deploymentStore: DeploymentStore;
  private reportService: MissingReportService;
  private checkQueue: Queue;
  private alertQueue: Queue;
  private worker?: Worker;
  private config: MonitorConfig;
  private wsClients: Set<WebSocket> = new Set();
  private alertHandlers: Array<(alert: MonitorAlert) => void> = [];
  private isRunning = false;

  // Track last known states
  private agentStates: Map<string, AgentState> = new Map();
  private lastCheckTime: Map<string, number> = new Map();

  constructor(private options: HeartbeatMonitorOptions) {
    this.provider = new JsonRpcProvider(options.rpcUrl);
    this.factory = new Contract(options.factoryAddress, FACTORY_ABI, this.provider);
    this.redis = options.redisUrl ? new Redis(options.redisUrl) : new Redis();
    this.deploymentStore = new DeploymentStore(options.redisUrl);
    this.reportService = new MissingReportService(options.redisUrl);

    // Initialize queues
    this.checkQueue = new Queue('heartbeat-checks', { connection: this.redis });
    this.alertQueue = new Queue('heartbeat-alerts', { connection: this.redis });

    // Default config
    this.config = {
      checkIntervalMs: 60000, // 1 minute
      warningThreshold: 24, // 24 hours before deadline
      criticalThreshold: 6, // 6 hours before deadline
      akashCheckEnabled: true,
      autoRestartEnabled: false,
      ...options.config,
    };
  }

  /**
   * Initialize Akash client
   */
  async initializeAkash(): Promise<void> {
    if (this.options.akashConfig) {
      this.akashClient = new AkashClient(this.options.akashConfig);
      await this.akashClient.initialize();
      logger.info('Akash client initialized');
    }
  }

  /**
   * Start the monitor
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.info('Starting heartbeat monitor', { config: this.config });

    // Initialize Akash if config provided
    if (this.options.akashConfig) {
      await this.initializeAkash();
    }

    // Start the worker
    this.worker = new Worker(
      'heartbeat-checks',
      async (job) => {
        const { agentAddress } = job.data;
        await this.checkAgent(agentAddress);
      },
      { connection: this.redis }
    );

    // Schedule periodic checks for all agents
    await this.scheduleAllAgentsCheck();

    // Listen for blockchain events
    this.listenToEvents();

    logger.info('Heartbeat monitor started');
  }

  /**
   * Stop the monitor
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.worker) {
      await this.worker.close();
    }

    await this.checkQueue.close();
    await this.alertQueue.close();
    await this.redis.quit();
    await this.deploymentStore.close();
    await this.reportService.close();

    logger.info('Heartbeat monitor stopped');
  }

  /**
   * Register a WebSocket client for real-time updates
   */
  registerWebSocket(ws: WebSocket): void {
    this.wsClients.add(ws);
    ws.addEventListener('close', () => {
      this.wsClients.delete(ws);
    });
  }

  /**
   * Register an alert handler
   */
  onAlert(handler: (alert: MonitorAlert) => void): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Get heartbeat status for an agent
   */
  async getHeartbeatStatus(agentAddress: string): Promise<HeartbeatStatus | null> {
    try {
      const state = await this.fetchAgentState(agentAddress);
      if (!state) return null;

      const deployment = await this.deploymentStore.get(agentAddress);
      let akashStatus = { state: 'unknown' as const, lastChecked: Date.now() };

      if (this.akashClient && deployment) {
        akashStatus = await this.akashClient.getDeploymentStatus(
          deployment.dseq,
          deployment.owner
        );
      }

      // Calculate heartbeat deadline
      const maxInterval = 7 * 24 * 60 * 60; // 7 days in seconds (from contract)
      const deadline = state.lastHeartbeat + maxInterval;
      const nextExpected = state.lastHeartbeat + this.getExpectedInterval(state);

      return {
        agentAddress,
        isHealthy: this.isHeartbeatHealthy(state),
        lastHeartbeat: state.lastHeartbeat,
        nextExpected,
        deadline,
        nonce: state.heartbeatNonce,
        timeUntilDeadline: deadline - Math.floor(Date.now() / 1000),
        akashStatus,
      };
    } catch (error) {
      logger.error('Failed to get heartbeat status', { agentAddress, error });
      return null;
    }
  }

  /**
   * Check a specific agent
   */
  async checkAgent(agentAddress: string): Promise<void> {
    const checkStart = Date.now();
    logger.debug('Checking agent', { agentAddress });

    try {
      // Fetch current state from blockchain
      const state = await this.fetchAgentState(agentAddress);
      if (!state) {
        logger.warn('Agent not found', { agentAddress });
        return;
      }

      // Update cached state
      this.agentStates.set(agentAddress, state);
      this.lastCheckTime.set(agentAddress, checkStart);

      // Skip if agent is already dead
      if (!state.isAlive) {
        logger.debug('Agent is already dead', { agentAddress });
        return;
      }

      // Check for missing heartbeats
      const missingReport = this.checkMissingHeartbeat(agentAddress, state);
      if (missingReport) {
        await this.handleMissingHeartbeat(missingReport);
      }

      // Check Akash deployment if enabled
      if (this.config.akashCheckEnabled && this.akashClient) {
        await this.checkAkashDeployment(agentAddress);
      }

      // Broadcast status update
      const status = await this.getHeartbeatStatus(agentAddress);
      if (status) {
        this.broadcast({
          type: 'status',
          agentAddress,
          data: {
            status: status.isHealthy ? 'healthy' : 'warning',
            balance: state.balance,
          },
          timestamp: Date.now(),
        });
      }

    } catch (error) {
      logger.error('Failed to check agent', { agentAddress, error });
    }
  }

  /**
   * Schedule checks for all agents
   */
  private async scheduleAllAgentsCheck(): Promise<void> {
    const schedule = async () => {
      if (!this.isRunning) return;

      try {
        const agents = await this.getAllAgents();
        logger.debug('Scheduling checks for agents', { count: agents.length });

        for (const agentAddress of agents) {
          await this.checkQueue.add(
            `check-${agentAddress}`,
            { agentAddress },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            }
          );
        }
      } catch (error) {
        logger.error('Failed to schedule agent checks', { error });
      }

      // Schedule next run
      setTimeout(schedule, this.config.checkIntervalMs);
    };

    // Initial schedule
    schedule();
  }

  /**
   * Fetch agent state from blockchain
   */
  private async fetchAgentState(agentAddress: string): Promise<AgentState | null> {
    try {
      const agent = new Contract(agentAddress, AGENT_ABI, this.provider);
      const state = await agent.getState();

      return {
        genomeHash: state.genomeHash,
        birthTime: Number(state.birthTime),
        lastHeartbeat: Number(state.lastHeartbeat),
        heartbeatNonce: Number(state.heartbeatNonce),
        isAlive: state.isAlive,
        balance: state.balance.toString(),
        lastDecisionHash: state.lastDecisionHash,
        totalMetabolicCost: state.totalMetabolicCost.toString(),
      };
    } catch (error) {
      logger.error('Failed to fetch agent state', { agentAddress, error });
      return null;
    }
  }

  /**
   * Get all agent addresses
   */
  private async getAllAgents(): Promise<string[]> {
    try {
      const count = await this.factory.getAgentCount();
      const agents: string[] = [];

      // Batch fetch if there are many agents
      const batchSize = 100;
      for (let i = 0; i < Math.ceil(Number(count) / batchSize); i++) {
        const batch = await this.factory.getAllAgents();
        agents.push(...batch);
      }

      return agents;
    } catch (error) {
      logger.error('Failed to get all agents', { error });
      return [];
    }
  }

  /**
   * Check if heartbeat is healthy
   */
  private isHeartbeatHealthy(state: AgentState): boolean {
    const maxInterval = 7 * 24 * 60 * 60; // 7 days
    const deadline = state.lastHeartbeat + maxInterval;
    const timeUntilDeadline = deadline - Math.floor(Date.now() / 1000);
    
    return timeUntilDeadline > this.config.warningThreshold * 3600;
  }

  /**
   * Get expected heartbeat interval based on state
   */
  private getExpectedInterval(state: AgentState): number {
    // Default 6 hours minimum, can be higher based on gene expression
    // For now, use a conservative estimate
    const baseInterval = 6 * 3600; // 6 hours
    return baseInterval;
  }

  /**
   * Check for missing heartbeats
   */
  private checkMissingHeartbeat(
    agentAddress: string,
    state: AgentState
  ): MissingHeartbeat | null {
    const maxInterval = 7 * 24 * 60 * 60; // 7 days
    const deadline = state.lastHeartbeat + maxInterval;
    const now = Math.floor(Date.now() / 1000);
    const timeUntilDeadline = deadline - now;

    // Check if heartbeat is overdue
    const expectedInterval = this.getExpectedInterval(state);
    const expectedNextHeartbeat = state.lastHeartbeat + expectedInterval;

    if (now < expectedNextHeartbeat) {
      return null; // Not due yet
    }

    // Determine severity
    let severity: 'warning' | 'critical' | 'abandoned' = 'warning';
    if (timeUntilDeadline <= 0) {
      severity = 'abandoned';
    } else if (timeUntilDeadline <= this.config.criticalThreshold * 3600) {
      severity = 'critical';
    }

    return {
      agentAddress,
      expectedTime: expectedNextHeartbeat,
      lastHeartbeat: state.lastHeartbeat,
      deadline,
      severity,
    };
  }

  /**
   * Handle missing heartbeat
   */
  private async handleMissingHeartbeat(report: MissingHeartbeat): Promise<void> {
    logger.warn('Missing heartbeat detected', { report });

    // Create alert
    const alert: MonitorAlert = {
      id: `alert-${report.agentAddress}-${Date.now()}`,
      agentAddress: report.agentAddress,
      type: 'missing_heartbeat',
      severity: report.severity,
      message: `Agent ${report.agentAddress} missed heartbeat. Severity: ${report.severity}`,
      timestamp: Date.now(),
      acknowledged: false,
    };

    // Send to alert queue
    await this.alertQueue.add('alert', alert);

    // Notify handlers
    this.alertHandlers.forEach((handler) => handler(alert));

    // Create missing report
    try {
      await this.reportService.createReport(report);
    } catch (error) {
      logger.error('Failed to create missing report', { report, error });
    }

    // Handle based on severity
    if (report.severity === 'abandoned') {
      await this.handleAbandonedAgent(report);
    }
  }

  /**
   * Check Akash deployment status
   */
  private async checkAkashDeployment(agentAddress: string): Promise<void> {
    if (!this.akashClient) return;

    try {
      const deployment = await this.deploymentStore.get(agentAddress);
      if (!deployment) {
        logger.warn('No Akash deployment found for agent', { agentAddress });
        return;
      }

      const status = await this.akashClient.getDeploymentStatus(
        deployment.dseq,
        deployment.owner
      );

      // Update stored status
      await this.deploymentStore.update(agentAddress, { metadata: { akashStatus: status } });

      // Check for issues
      if (status.state === 'closed' || status.state === 'error') {
        const alert: MonitorAlert = {
          id: `alert-${agentAddress}-akash-${Date.now()}`,
          agentAddress,
          type: 'akash_down',
          severity: 'critical',
          message: `Akash deployment ${status.state} for agent ${agentAddress}`,
          timestamp: Date.now(),
          acknowledged: false,
        };

        await this.alertQueue.add('alert', alert);
        this.alertHandlers.forEach((handler) => handler(alert));

        // Try to restart if enabled
        if (this.config.autoRestartEnabled) {
          await this.handleAkashRestart(agentAddress, deployment);
        }
      }

      // Check container health
      if (status.hostUri) {
        const isHealthy = await this.akashClient.checkContainerHealth(status.hostUri);
        if (!isHealthy) {
          logger.warn('Container health check failed', { agentAddress, hostUri: status.hostUri });
        }
      }
    } catch (error) {
      logger.error('Failed to check Akash deployment', { agentAddress, error });
    }
  }

  /**
   * Handle abandoned agent (declare abandoned on-chain)
   */
  private async handleAbandonedAgent(report: MissingHeartbeat): Promise<void> {
    logger.info('Declaring agent abandoned', { agentAddress: report.agentAddress });

    try {
      // Anyone can call declareAbandoned on the contract
      const agent = new Contract(report.agentAddress, AGENT_ABI, this.provider);
      
      // We need a signer to actually send this transaction
      // For now, just log and alert - the actual transaction would need a signer
      logger.info('Agent eligible for abandonment declaration', {
        agentAddress: report.agentAddress,
        timeSinceLastHeartbeat: Math.floor(Date.now() / 1000) - report.lastHeartbeat,
      });
    } catch (error) {
      logger.error('Failed to handle abandoned agent', {
        agentAddress: report.agentAddress,
        error,
      });
    }
  }

  /**
   * Handle Akash deployment restart
   */
  private async handleAkashRestart(
    agentAddress: string,
    deployment: any
  ): Promise<void> {
    logger.info('Attempting Akash restart', { agentAddress, dseq: deployment.dseq });
    // Implementation would require SDL re-deployment
    // This is a placeholder for the restart logic
  }

  /**
   * Listen to blockchain events
   */
  private listenToEvents(): void {
    // Listen for AgentCreated events
    this.factory.on('AgentCreated', async (agent, creator, genomeHash, event) => {
      logger.info('New agent created', { agent, creator, genomeHash });
      
      // Schedule immediate check
      await this.checkQueue.add(
        `check-${agent}`,
        { agentAddress: agent },
        { priority: 1 }
      );

      // Broadcast
      this.broadcast({
        type: 'status',
        agentAddress: agent,
        data: { status: 'healthy', event: 'created' },
        timestamp: Date.now(),
      });
    });

    logger.info('Event listeners registered');
  }

  /**
   * Broadcast message to all WebSocket clients
   */
  private broadcast(message: WebSocketMessage): void {
    const data = JSON.stringify(message);
    this.wsClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }
}

import WebSocket from 'ws';

export default HeartbeatMonitor;
