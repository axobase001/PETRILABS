/**
 * Heartbeat Service
 * Manages periodic heartbeats to the blockchain
 */

import { ethers, Contract, Wallet, JsonRpcProvider } from 'ethers';
import { logger } from '../utils/logger';
import { HeartbeatData, AgentState } from '../types';

const AGENT_ABI = [
  'function heartbeat(bytes32 _decisionHash, string calldata _arweaveTxId) external returns (bool)',
  'function getState() external view returns (tuple(bytes32 genomeHash, uint256 birthTime, uint256 lastHeartbeat, uint256 heartbeatNonce, bool isAlive, uint256 balance, bytes32 lastDecisionHash, uint256 totalMetabolicCost))',
  'function getMetabolicCost() external view returns (uint256)',
  'function die() external',
  'event Heartbeat(uint256 indexed nonce, uint256 timestamp, bytes32 decisionHash)',
];

export class HeartbeatService {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private agent: Contract;
  private agentAddress: string;
  private intervalMs: number;
  private timeoutId?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    rpcUrl: string,
    privateKey: string,
    agentAddress: string,
    intervalMs: number = 21600000 // 6 hours default
  ) {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.wallet = new Wallet(privateKey, this.provider);
    this.agentAddress = agentAddress;
    this.agent = new Contract(agentAddress, AGENT_ABI, this.wallet);
    this.intervalMs = intervalMs;
  }

  /**
   * Start heartbeat loop
   */
  start(callback?: (data: HeartbeatData) => Promise<void>): void {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.info('Starting heartbeat service', {
      agent: this.agentAddress,
      interval: this.intervalMs,
    });

    // Schedule next heartbeat
    this.scheduleNext(callback);
  }

  /**
   * Stop heartbeat loop
   */
  stop(): void {
    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    logger.info('Heartbeat service stopped');
  }

  /**
   * Schedule next heartbeat
   */
  private scheduleNext(callback?: (data: HeartbeatData) => Promise<void>): void {
    if (!this.isRunning) return;

    this.timeoutId = setTimeout(async () => {
      await this.sendHeartbeat(callback);
      this.scheduleNext(callback);
    }, this.intervalMs);
  }

  /**
   * Send heartbeat
   */
  async sendHeartbeat(callback?: (data: HeartbeatData) => Promise<void>): Promise<void> {
    try {
      // Get current state
      const state = await this.getState();

      // Check if alive
      if (!state.isAlive) {
        logger.warn('Agent is dead, stopping heartbeat');
        this.stop();
        return;
      }

      // Check if it's time for heartbeat (contract enforces min interval)
      const timeSinceLast = Date.now() / 1000 - state.lastHeartbeat;
      if (timeSinceLast < this.intervalMs / 1000) {
        logger.debug('Too soon for heartbeat', { timeSinceLast });
        return;
      }

      // Build heartbeat data
      const data: HeartbeatData = {
        nonce: state.heartbeatNonce + 1,
        timestamp: Date.now(),
        decisionHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        summary: {
          decisionsCount: 0,
          skillsExecuted: [],
          balanceChange: '0',
        },
      };

      // Allow callback to modify data (e.g., add decision hash)
      if (callback) {
        await callback(data);
      }

      // Send to blockchain
      const tx = await this.agent.heartbeat(
        data.decisionHash,
        data.arweaveTxId || ''
      );

      const receipt = await tx.wait();

      logger.info('Heartbeat sent', {
        nonce: data.nonce,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed?.toString(),
      });

      // Check if agent died (balance too low)
      const newState = await this.getState();
      if (!newState.isAlive) {
        logger.warn('Agent died after heartbeat');
        this.stop();
      }

    } catch (error) {
      logger.error('Heartbeat failed', { error });
      
      // Don't stop on error, retry next interval
    }
  }

  /**
   * Get agent state
   */
  async getState(): Promise<AgentState> {
    const state = await this.agent.getState();
    
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
  }

  /**
   * Get metabolic cost
   */
  async getMetabolicCost(): Promise<string> {
    const cost = await this.agent.getMetabolicCost();
    return cost.toString();
  }

  /**
   * Check if running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

export default HeartbeatService;
