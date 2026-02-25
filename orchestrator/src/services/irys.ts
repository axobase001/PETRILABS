/**
 * Irys Storage Service
 * Irys (原Bundlr) 支持 USDC 支付的 Arweave 存储
 * 无需 AR 代币，无需 keyfile
 * 
 * 官网: https://irys.xyz
 */

import Irys from '@irys/sdk';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';

export interface IrysConfig {
  privateKey: string;
  rpcUrl: string;
  token?: string; // 'usd-c' for USDC on Base
}

export interface StorageReceipt {
  id: string;
  url: string;
  size: number;
  cost: string; // in USD
}

export class IrysService {
  private irys: Irys | null = null;
  private walletAddress: string;

  constructor(config: IrysConfig) {
    this.walletAddress = new ethers.Wallet(config.privateKey).address;
  }

  /**
   * Initialize Irys client
   */
  async initialize(config: IrysConfig): Promise<void> {
    try {
      this.irys = new Irys({
        url: 'https://node1.irys.xyz',
        token: config.token || 'usd-c', // USDC on Base
        key: config.privateKey,
        config: {
          providerUrl: config.rpcUrl,
        },
      });

      // Fund node if needed
      const balance = await this.irys.getBalance(this.walletAddress);
      logger.info('Irys initialized', { 
        address: this.walletAddress,
        balance: balance.toString(),
      });
    } catch (error) {
      logger.error('Failed to initialize Irys', { error });
      throw error;
    }
  }

  /**
   * Upload data with USDC payment
   */
  async upload(
    data: Buffer | string,
    tags: { name: string; value: string }[] = []
  ): Promise<StorageReceipt> {
    if (!this.irys) {
      throw new Error('Irys not initialized');
    }

    try {
      // Get price quote
      const price = await this.irys.getPrice(data.length);
      logger.info('Irys storage price', { 
        bytes: data.length,
        price: price.toString(),
      });

      // Upload
      const receipt = await this.irys.upload(data, { tags });

      const result: StorageReceipt = {
        id: receipt.id,
        url: `https://arweave.net/${receipt.id}`,
        size: data.length,
        cost: receipt.reward, // actual cost
      };

      logger.info('Irys upload complete', {
        txId: result.id,
        cost: result.cost,
      });

      return result;
    } catch (error) {
      logger.error('Irys upload failed', { error });
      throw error;
    }
  }

  /**
   * Upload JSON
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
   * Upload memory file
   */
  async uploadMemory(
    content: Buffer,
    metadata: {
      creator: string;
      timestamp: number;
      contentHash: string;
    }
  ): Promise<StorageReceipt> {
    return this.upload(content, [
      { name: 'App-Name', value: 'PETRILABS' },
      { name: 'Type', value: 'Memory' },
      { name: 'Creator', value: metadata.creator },
      { name: 'Timestamp', value: metadata.timestamp.toString() },
      { name: 'Content-Hash', value: metadata.contentHash },
    ]);
  }

  /**
   * Upload genome
   */
  async uploadGenome(
    genome: unknown,
    metadata: {
      creator: string;
      timestamp: number;
      genomeHash: string;
    }
  ): Promise<StorageReceipt> {
    return this.uploadJSON(genome, [
      { name: 'App-Name', value: 'PETRILABS' },
      { name: 'Type', value: 'Genome' },
      { name: 'Creator', value: metadata.creator },
      { name: 'Timestamp', value: metadata.timestamp.toString() },
      { name: 'Genome-Hash', value: metadata.genomeHash },
    ]);
  }

  /**
   * Get balance
   */
  async getBalance(): Promise<string> {
    if (!this.irys) return '0';
    const balance = await this.irys.getBalance(this.walletAddress);
    return balance.toString();
  }

  /**
   * Fund Irys node (transfer USDC to Irys)
   */
  async fund(amount: string): Promise<void> {
    if (!this.irys) throw new Error('Irys not initialized');
    
    try {
      const response = await this.irys.fund(amount);
      logger.info('Irys funded', { 
        amount,
        txId: response.id,
      });
    } catch (error) {
      logger.error('Irys funding failed', { error });
      throw error;
    }
  }
}

export default IrysService;
