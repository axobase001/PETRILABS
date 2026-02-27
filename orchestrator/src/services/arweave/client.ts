/**
 * Arweave Client
 * Upload and retrieve data from Arweave permaweb
 */

import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { logger } from '../../utils/logger';

export interface ArweaveConfig {
  host: string;
  port: number;
  protocol: 'https' | 'http';
  timeout?: number;
  logging?: boolean;
}

export interface UploadResult {
  id: string;
  url: string;
  size: number;
  reward: string;
  timestamp: number;
}

export interface ArweaveTags {
  [key: string]: string;
}

export class ArweaveClient {
  private client: Arweave;
  private wallet?: JWKInterface;
  private address?: string;

  constructor(config: ArweaveConfig, privateKey?: string | JWKInterface) {
    this.client = new Arweave({
      host: config.host,
      port: config.port,
      protocol: config.protocol,
      timeout: config.timeout || 20000,
      logging: config.logging || false,
    });

    if (privateKey) {
      if (typeof privateKey === 'string') {
        this.wallet = JSON.parse(privateKey);
      } else {
        this.wallet = privateKey;
      }
    }
  }

  /**
   * Initialize wallet and get address
   */
  async initialize(): Promise<string | undefined> {
    if (!this.wallet) {
      logger.warn('No wallet configured, Arweave uploads will be read-only');
      return undefined;
    }

    this.address = await this.client.wallets.jwkToAddress(this.wallet);
    const balance = await this.getBalance();

    logger.info('Arweave client initialized', {
      address: this.address,
      balance: `${balance} AR`,
    });

    return this.address;
  }

  /**
   * Get wallet balance in AR
   */
  async getBalance(): Promise<string> {
    if (!this.address) return '0';
    const winston = await this.client.wallets.getBalance(this.address);
    return this.client.ar.winstonToAr(winston);
  }

  /**
   * Upload data to Arweave
   */
  async upload(
    data: string | Buffer | object,
    tags?: ArweaveTags,
    options?: {
      contentType?: string;
    }
  ): Promise<UploadResult> {
    if (!this.wallet) {
      throw new Error('Wallet not configured');
    }

    const content = typeof data === 'object' && !(data instanceof Buffer)
      ? JSON.stringify(data)
      : data;

    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');

    // Create transaction
    const transaction = await this.client.createTransaction(
      { data: buffer },
      this.wallet
    );

    // Add tags
    const defaultTags: ArweaveTags = {
      'App-Name': 'PETRILABS',
      'App-Version': '1.0.0',
      'Content-Type': options?.contentType || 'application/json',
      'Timestamp': Date.now().toString(),
    };

    Object.entries({ ...defaultTags, ...tags }).forEach(([key, value]) => {
      transaction.addTag(key, value);
    });

    // Sign transaction
    await this.client.transactions.sign(transaction, this.wallet);

    // Submit transaction
    const response = await this.client.transactions.post(transaction);

    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`Upload failed with status ${response.status}: ${response.statusText}`);
    }

    const result: UploadResult = {
      id: transaction.id,
      url: `${this.client.api.config.protocol}://${this.client.api.config.host}:${this.client.api.config.port}/${transaction.id}`,
      size: buffer.length,
      reward: transaction.reward,
      timestamp: Date.now(),
    };

    logger.info('Data uploaded to Arweave', {
      id: result.id,
      size: result.size,
      reward: result.reward,
    });

    return result;
  }

  /**
   * Upload JSON data
   */
  async uploadJSON(
    data: object,
    tags?: ArweaveTags
  ): Promise<UploadResult> {
    return this.upload(data, tags, { contentType: 'application/json' });
  }

  /**
   * Upload file (for larger files, consider using bundlr)
   */
  async uploadFile(
    buffer: Buffer,
    filename: string,
    contentType: string,
    tags?: ArweaveTags
  ): Promise<UploadResult> {
    return this.upload(buffer, {
      ...tags,
      Filename: filename,
    }, { contentType });
  }

  /**
   * Get data from Arweave
   */
  async get(id: string): Promise<Buffer | null> {
    try {
      const data = await this.client.transactions.getData(id, {
        decode: true,
        string: false,
      });

      return Buffer.from(data);
    } catch (error) {
      logger.error('Failed to get data from Arweave', { id, error });
      return null;
    }
  }

  /**
   * Get JSON data from Arweave
   */
  async getJSON<T = any>(id: string): Promise<T | null> {
    const data = await this.get(id);
    if (!data) return null;

    try {
      return JSON.parse(data.toString('utf-8')) as T;
    } catch {
      return null;
    }
  }

  /**
   * Get transaction status
   */
  async getStatus(id: string): Promise<{
    confirmed: boolean;
    blockHeight?: number;
    blockHash?: string;
    confirmations?: number;
  } | null> {
    try {
      const status = await this.client.transactions.getStatus(id);
      return {
        confirmed: status.confirmed !== undefined,
        blockHeight: status.confirmed?.block_height,
        blockHash: status.confirmed?.block_hash,
        confirmations: status.confirmed?.number_of_confirmations,
      };
    } catch (error) {
      logger.error('Failed to get transaction status', { id, error });
      return null;
    }
  }

  /**
   * Wait for confirmation
   */
  async waitForConfirmation(
    id: string,
    maxAttempts = 30,
    intervalMs = 30000
  ): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.getStatus(id);
      
      if (status?.confirmed) {
        logger.info('Transaction confirmed', {
          id,
          blockHeight: status.blockHeight,
          confirmations: status.confirmations,
        });
        return true;
      }

      logger.debug(`Waiting for confirmation... (${i + 1}/${maxAttempts})`);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    logger.warn('Transaction confirmation timeout', { id });
    return false;
  }

  /**
   * Get gateway URL for an ID
   */
  getGatewayUrl(id: string, gateway?: string): string {
    const gw = gateway || 'https://arweave.net';
    return `${gw}/${id}`;
  }
}

// Predefined configurations
export const ArweaveConfigs = {
  mainnet: {
    host: 'arweave.net',
    port: 443,
    protocol: 'https' as const,
  },
  testnet: {
    host: 'testnet.redstone.tools',
    port: 443,
    protocol: 'https' as const,
  },
  localhost: {
    host: 'localhost',
    port: 1984,
    protocol: 'http' as const,
  },
};

export default ArweaveClient;
