/**
 * Storage Service for Agent Runtime
 * 通过编排服务代理存储到 Arweave
 * 
 * 流程：
 * Agent(数据) → 编排服务 API → 编排代付 AR → Arweave
 * 
 * 优点：
 * - Agent 无需 AR 代币
 * - Agent 无需 Arweave keyfile
 * - 用户只需 USDC
 * 
 * 注意：
 * - 依赖编排服务可用性
 * - 需要预存 AR 额度
 */

import axios from 'axios';
import { logger } from '../utils/logger';

export interface StorageConfig {
  orchestratorUrl: string;
  agentAddress: string;
}

export interface StorageReceipt {
  id: string;
  url: string;
  size: number;
  arCost: string;
  remainingBalance: string;
}

export class StorageService {
  private orchestratorUrl: string;
  private agentAddress: string;

  constructor(config: StorageConfig) {
    this.orchestratorUrl = config.orchestratorUrl;
    this.agentAddress = config.agentAddress;
  }

  /**
   * 存储数据到 Arweave（通过编排代理）
   */
  async upload(
    data: Buffer | string,
    tags: { name: string; value: string }[] = []
  ): Promise<StorageReceipt> {
    try {
      // 调用编排服务存储 API
      const response = await axios.post(
        `${this.orchestratorUrl}/api/storage/store`,
        {
          data: Buffer.isBuffer(data) ? data.toString('base64') : data,
          tags,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Agent-Address': this.agentAddress,
          },
          // 大文件需要更长的超时
          timeout: 60000,
        }
      );

      const receipt: StorageReceipt = response.data.data;

      logger.info('Data stored via orchestrator proxy', {
        txId: receipt.id,
        cost: receipt.arCost,
        remainingBalance: receipt.remainingBalance,
      });

      return receipt;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 402) {
          logger.error('Storage failed: Insufficient AR balance', {
            agentAddress: this.agentAddress,
          });
          throw new Error(
            'Insufficient AR storage balance. Agent needs more USDC for storage.'
          );
        }
        if (error.response?.status === 404) {
          logger.error('Storage failed: No storage account found');
          throw new Error(
            'No storage account found. Deployment may be incomplete.'
          );
        }
      }

      logger.error('Storage upload failed', { error });
      throw error;
    }
  }

  /**
   * 存储 JSON 数据
   */
  async uploadJSON(
    data: unknown,
    tags: { name: string; value: string }[] = []
  ): Promise<StorageReceipt> {
    const jsonString = JSON.stringify(data);
    return this.upload(Buffer.from(jsonString), [
      { name: 'Content-Type', value: 'application/json' },
      ...tags,
    ]);
  }

  /**
   * 存储心跳记录
   */
  async uploadHeartbeat(
    nonce: number,
    decisionHash: string,
    metadata: {
      geneExpressions?: Record<number, number>;
      decisionsCount?: number;
      balance?: string;
    }
  ): Promise<StorageReceipt> {
    const heartbeatData = {
      type: 'heartbeat',
      agentAddress: this.agentAddress,
      nonce,
      timestamp: Date.now(),
      decisionHash,
      ...metadata,
    };

    return this.uploadJSON(heartbeatData, [
      { name: 'App-Name', value: 'PETRILABS' },
      { name: 'Type', value: 'Heartbeat' },
      { name: 'Agent', value: this.agentAddress },
      { name: 'Nonce', value: nonce.toString() },
    ]);
  }

  /**
   * 存储决策记录
   */
  async uploadDecision(
    decisionId: string,
    decision: {
      type: string;
      skillId?: string;
      params?: unknown;
      result?: { success: boolean; error?: string };
    }
  ): Promise<StorageReceipt> {
    const decisionData = {
      type: 'decision',
      agentAddress: this.agentAddress,
      decisionId,
      timestamp: Date.now(),
      ...decision,
    };

    return this.uploadJSON(decisionData, [
      { name: 'App-Name', value: 'PETRILABS' },
      { name: 'Type', value: 'Decision' },
      { name: 'Agent', value: this.agentAddress },
      { name: 'Decision-ID', value: decisionId },
    ]);
  }

  /**
   * 存储记忆/学习记录
   */
  async uploadMemory(
    memoryType: 'observation' | 'learning' | 'interaction',
    content: unknown
  ): Promise<StorageReceipt> {
    const memoryData = {
      type: 'memory',
      agentAddress: this.agentAddress,
      memoryType,
      timestamp: Date.now(),
      content,
    };

    return this.uploadJSON(memoryData, [
      { name: 'App-Name', value: 'PETRILABS' },
      { name: 'Type', value: 'Memory' },
      { name: 'Agent', value: this.agentAddress },
      { name: 'Memory-Type', value: memoryType },
    ]);
  }

  /**
   * 检查存储余额
   */
  async checkBalance(): Promise<{
    arBalance: string;
    totalUsed: string;
    lastUsed: number;
  } | null> {
    try {
      const response = await axios.get(
        `${this.orchestratorUrl}/api/storage/account/${this.agentAddress}`
      );
      return response.data.data;
    } catch (error) {
      logger.error('Failed to check storage balance', { error });
      return null;
    }
  }

  /**
   * 估算存储成本
   */
  async estimateCost(bytes: number): Promise<string> {
    try {
      const response = await axios.get(
        `${this.orchestratorUrl}/api/storage/estimate`,
        {
          params: { bytes },
        }
      );
      return response.data.data.usdcCost;
    } catch (error) {
      // 默认估算
      return Math.ceil((bytes / 1024) * 0.01 * 1e6).toString(); // ~$0.01 per KB
    }
  }
}

export default StorageService;
