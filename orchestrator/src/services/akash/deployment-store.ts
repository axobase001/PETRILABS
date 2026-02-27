/**
 * Akash Deployment Store
 * Tracks agent-to-Akash deployment mappings
 */

import { Redis } from 'ioredis';
import { AkashDeployment } from '../../types';

export interface DeploymentMapping {
  agentAddress: string;
  dseq: string;
  owner: string;
  provider?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
}

export class DeploymentStore {
  private redis?: Redis;
  private localStore: Map<string, DeploymentMapping> = new Map();
  private readonly prefix = 'akash:deployment:';

  constructor(redisUrl?: string) {
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
    }
  }

  /**
   * Store deployment mapping
   */
  async set(mapping: DeploymentMapping): Promise<void> {
    const key = `${this.prefix}${mapping.agentAddress}`;
    const data = JSON.stringify(mapping);

    if (this.redis) {
      await this.redis.setex(key, 86400 * 30, data); // 30 days TTL
    } else {
      this.localStore.set(mapping.agentAddress, mapping);
    }
  }

  /**
   * Get deployment mapping by agent address
   */
  async get(agentAddress: string): Promise<DeploymentMapping | null> {
    const key = `${this.prefix}${agentAddress}`;

    if (this.redis) {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } else {
      return this.localStore.get(agentAddress) || null;
    }
  }

  /**
   * Get mapping by dseq
   */
  async getByDseq(dseq: string): Promise<DeploymentMapping | null> {
    if (this.redis) {
      // Scan for matching dseq
      const keys = await this.redis.keys(`${this.prefix}*`);
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const mapping: DeploymentMapping = JSON.parse(data);
          if (mapping.dseq === dseq) {
            return mapping;
          }
        }
      }
      return null;
    } else {
      for (const mapping of this.localStore.values()) {
        if (mapping.dseq === dseq) {
          return mapping;
        }
      }
      return null;
    }
  }

  /**
   * Update deployment mapping
   */
  async update(
    agentAddress: string,
    updates: Partial<DeploymentMapping>
  ): Promise<void> {
    const existing = await this.get(agentAddress);
    if (!existing) {
      throw new Error(`Deployment mapping not found for ${agentAddress}`);
    }

    const updated: DeploymentMapping = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.set(updated);
  }

  /**
   * Delete deployment mapping
   */
  async delete(agentAddress: string): Promise<void> {
    const key = `${this.prefix}${agentAddress}`;

    if (this.redis) {
      await this.redis.del(key);
    } else {
      this.localStore.delete(agentAddress);
    }
  }

  /**
   * List all deployment mappings
   */
  async listAll(): Promise<DeploymentMapping[]> {
    if (this.redis) {
      const keys = await this.redis.keys(`${this.prefix}*`);
      const mappings: DeploymentMapping[] = [];

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          mappings.push(JSON.parse(data));
        }
      }

      return mappings;
    } else {
      return Array.from(this.localStore.values());
    }
  }

  /**
   * Get active deployments count
   */
  async getActiveCount(): Promise<number> {
    const all = await this.listAll();
    return all.length;
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

export default DeploymentStore;
