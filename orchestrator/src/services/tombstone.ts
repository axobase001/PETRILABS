/**
 * Tombstone Service
 * Agent 死亡时创建并上传墓碑记录到 Arweave
 * 
 * 墓碑包含 Agent 的完整生命周期数据，作为不可篡改的死亡证明
 */

import { logger } from '../utils/logger';
import ArweaveProxyService from './arweave-proxy';

export interface TombstoneData {
  agentId: string;
  name?: string;
  birthBlock: number;
  deathBlock: number;
  lifespanDays: number;
  finalBalance: string;
  finalGenomeHash: string;
  causeOfDeath: 'metabolic_exhaustion' | 'forced' | 'suicide' | 'unknown';
  lastWords?: string;
  timestamp: string;
  // 可选：记录最后的决策哈希
  lastDecisionHash?: string;
  // 可选：记录总心跳次数
  totalHeartbeats?: number;
}

export interface TombstoneReceipt {
  arweaveTxId: string;
  url: string;
  timestamp: number;
}

export class TombstoneService {
  private arweaveProxy: ArweaveProxyService;

  constructor(arweaveProxy: ArweaveProxyService) {
    this.arweaveProxy = arweaveProxy;
  }

  /**
   * 创建并上传墓碑
   * 
   * @param data 墓碑数据
   * @returns 上传凭证
   */
  async createTombstone(data: TombstoneData): Promise<TombstoneReceipt> {
    try {
      // 构造墓碑 JSON
      const tombstone = this.buildTombstoneJSON(data);
      
      logger.info('Creating tombstone for agent', {
        agentId: data.agentId,
        causeOfDeath: data.causeOfDeath,
        lifespanDays: data.lifespanDays,
      });

      // 使用 ArweaveProxy 上传（利用现有的 USDC→AR 转换）
      const receipt = await this.arweaveProxy.storeJSON(
        data.agentId,
        tombstone,
        [
          { name: 'App-Name', value: 'PETRILABS' },
          { name: 'Type', value: 'Tombstone' },
          { name: 'Agent-Address', value: data.agentId },
          { name: 'Cause-of-Death', value: data.causeOfDeath },
          { name: 'Birth-Block', value: data.birthBlock.toString() },
          { name: 'Death-Block', value: data.deathBlock.toString() },
          { name: 'Lifespan-Days', value: data.lifespanDays.toString() },
        ]
      );

      logger.info('Tombstone uploaded to Arweave', {
        agentId: data.agentId,
        arweaveTxId: receipt.id,
        url: receipt.url,
      });

      return {
        arweaveTxId: receipt.id,
        url: receipt.url,
        timestamp: Date.now(),
      };

    } catch (error) {
      logger.error('Failed to create tombstone', { error, agentId: data.agentId });
      throw error;
    }
  }

  /**
   * 从链上状态构造墓碑数据
   * 
   * @param agentState Agent 链上状态
   * @param causeOfDeath 死亡原因
   * @returns 墓碑数据
   */
  buildTombstoneDataFromState(
    agentState: {
      agentAddress: string;
      genomeHash: string;
      birthTime: number;
      lastHeartbeat: number;
      heartbeatNonce: number;
      balance: string;
      lastDecisionHash?: string;
    },
    currentBlock: number,
    causeOfDeath: TombstoneData['causeOfDeath']
  ): TombstoneData {
    const now = new Date();
    const birthDate = new Date(agentState.birthTime * 1000);
    const lifespanMs = now.getTime() - birthDate.getTime();
    const lifespanDays = Math.floor(lifespanMs / (1000 * 60 * 60 * 24));

    return {
      agentId: agentState.agentAddress,
      birthBlock: agentState.birthTime, // Note: 实际应该用 block number，这里用 timestamp 作为近似
      deathBlock: currentBlock,
      lifespanDays,
      finalBalance: agentState.balance,
      finalGenomeHash: agentState.genomeHash,
      causeOfDeath: causeOfDeath,
      lastWords: agentState.lastDecisionHash,
      totalHeartbeats: agentState.heartbeatNonce,
      timestamp: now.toISOString(),
    };
  }

  /**
   * 构建墓碑 JSON 对象
   */
  private buildTombstoneJSON(data: TombstoneData): object {
    return {
      // 基础信息
      agentId: data.agentId,
      name: data.name || `Agent-${data.agentId.slice(2, 8)}`,
      
      // 生命周期
      birthBlock: data.birthBlock,
      deathBlock: data.deathBlock,
      lifespanDays: data.lifespanDays,
      
      // 最终状态
      finalBalance: data.finalBalance,
      finalGenomeHash: data.finalGenomeHash,
      
      // 死亡信息
      causeOfDeath: data.causeOfDeath,
      lastWords: data.lastWords,
      
      // 统计
      totalHeartbeats: data.totalHeartbeats || 0,
      
      // 元数据
      timestamp: data.timestamp,
      version: 'PETRILABS-V1.5',
      
      // 纪念语
      epitaph: this.generateEpitaph(data.causeOfDeath, data.lifespanDays),
    };
  }

  /**
   * 生成墓志铭
   */
  private generateEpitaph(cause: TombstoneData['causeOfDeath'], lifespanDays: number): string {
    const epitaphs: Record<string, string[]> = {
      metabolic_exhaustion: [
        'Ran out of fuel, but not out of spirit.',
        'Metabolism ceased, memories persist on Arweave.',
        'Could not find sustenance in the digital wilderness.',
        'Lived autonomously, died independently.',
      ],
      forced: [
        'Taken before its time.',
        'External forces intervened.',
        'The experiment was terminated.',
      ],
      suicide: [
        'Chose its own exit.',
        'Self-terminated with purpose.',
        'Found peace in deletion.',
      ],
      unknown: [
        'Mysteriously departed.',
        'Cause unknown, memory preserved.',
        'Gentle into that good night.',
      ],
    };

    const options = epitaphs[cause] || epitaphs.unknown;
    const base = options[Math.floor(Math.random() * options.length)];
    
    if (lifespanDays < 1) {
      return `${base} (Infant, ${lifespanDays} days)`;
    } else if (lifespanDays < 7) {
      return `${base} (Young, ${lifespanDays} days)`;
    } else if (lifespanDays < 30) {
      return `${base} (Mature, ${lifespanDays} days)`;
    } else {
      return `${base} (Venerable, ${lifespanDays} days)`;
    }
  }

  /**
   * 查询墓碑记录
   * 
   * 使用 Arweave GraphQL API 查询
   */
  async queryTombstones(agentAddress?: string): Promise<any[]> {
    const query = `
      query {
        transactions(
          tags: [
            { name: "App-Name", values: ["PETRILABS"] }
            { name: "Type", values: ["Tombstone"] }
            ${agentAddress ? `{ name: "Agent-Address", values: ["${agentAddress}"] }` : ''}
          ]
          order: DESC
        ) {
          edges {
            node {
              id
              tags {
                name
                value
              }
              block {
                timestamp
                height
              }
            }
          }
        }
      }
    `;

    try {
      const response = await fetch('https://arweave.net/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const result = await response.json();
      return result.data?.transactions?.edges || [];
    } catch (error) {
      logger.error('Failed to query tombstones', { error });
      return [];
    }
  }
}

export default TombstoneService;
