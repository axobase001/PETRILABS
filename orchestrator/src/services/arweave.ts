import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { config } from '../config';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export class ArweaveService {
  private arweave: Arweave;
  private wallet: JWKInterface | null = null;

  constructor() {
    this.arweave = Arweave.init({
      host: 'arweave.net',
      port: 443,
      protocol: 'https',
    });

    this.loadWallet();
  }

  private loadWallet(): void {
    try {
      const keyPath = path.resolve(process.cwd(), config.arweave.keyFile);
      if (fs.existsSync(keyPath)) {
        const keyData = fs.readFileSync(keyPath, 'utf-8');
        this.wallet = JSON.parse(keyData);
        logger.info('Arweave wallet loaded');
      } else {
        logger.warn('Arweave key file not found, storage will be disabled');
      }
    } catch (error) {
      logger.error('Failed to load Arweave wallet', { error });
    }
  }

  /**
   * Upload data to Arweave
   */
  async upload(
    data: Buffer | string,
    contentType: string,
    tags: { name: string; value: string }[] = []
  ): Promise<{ id: string; url: string }> {
    if (!this.wallet) {
      throw new Error('Arweave wallet not initialized');
    }

    try {
      // Create transaction
      const transaction = await this.arweave.createTransaction(
        { data },
        this.wallet
      );

      // Add tags
      transaction.addTag('Content-Type', contentType);
      tags.forEach(tag => {
        transaction.addTag(tag.name, tag.value);
      });

      // Sign and post
      await this.arweave.transactions.sign(transaction, this.wallet);
      
      const response = await this.arweave.transactions.post(transaction);

      if (response.status === 200 || response.status === 202) {
        const url = `${config.arweave.gateway}/${transaction.id}`;
        
        logger.info('Data uploaded to Arweave', {
          txId: transaction.id,
          url,
          size: data.length,
        });

        return { id: transaction.id, url };
      } else {
        throw new Error(`Failed to post transaction: ${response.status}`);
      }
    } catch (error) {
      logger.error('Failed to upload to Arweave', { error });
      throw error;
    }
  }

  /**
   * Upload JSON data
   */
  async uploadJSON(
    data: unknown,
    tags: { name: string; value: string }[] = []
  ): Promise<{ id: string; url: string }> {
    const jsonString = JSON.stringify(data, null, 2);
    return this.upload(Buffer.from(jsonString), 'application/json', tags);
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
  ): Promise<{ id: string; url: string }> {
    return this.upload(content, 'text/plain', [
      { name: 'App-Name', value: 'PETRILABS' },
      { name: 'Type', value: 'Memory' },
      { name: 'Creator', value: metadata.creator },
      { name: 'Timestamp', value: metadata.timestamp.toString() },
      { name: 'Content-Hash', value: metadata.contentHash },
    ]);
  }

  /**
   * Upload genome data
   */
  async uploadGenome(
    genome: unknown,
    metadata: {
      creator: string;
      timestamp: number;
      genomeHash: string;
    }
  ): Promise<{ id: string; url: string }> {
    return this.uploadJSON(genome, [
      { name: 'App-Name', value: 'PETRILABS' },
      { name: 'Type', value: 'Genome' },
      { name: 'Creator', value: metadata.creator },
      { name: 'Timestamp', value: metadata.timestamp.toString() },
      { name: 'Genome-Hash', value: metadata.genomeHash },
    ]);
  }

  /**
   * Upload decision record
   */
  async uploadDecision(
    decision: unknown,
    metadata: {
      agentAddress: string;
      nonce: number;
      timestamp: number;
    }
  ): Promise<{ id: string; url: string }> {
    return this.uploadJSON(decision, [
      { name: 'App-Name', value: 'PETRILABS' },
      { name: 'Type', value: 'Decision' },
      { name: 'Agent', value: metadata.agentAddress },
      { name: 'Nonce', value: metadata.nonce.toString() },
      { name: 'Timestamp', value: metadata.timestamp.toString() },
    ]);
  }

  /**
   * Get transaction data
   */
  async getData(txId: string): Promise<Buffer> {
    try {
      const data = await this.arweave.transactions.getData(txId, {
        decode: true,
        string: false,
      });
      return Buffer.from(data as Uint8Array);
    } catch (error) {
      logger.error('Failed to get Arweave data', { error, txId });
      throw error;
    }
  }

  /**
   * Get transaction status
   */
  async getStatus(txId: string): Promise<{
    confirmed: boolean;
    confirmations: number;
  }> {
    try {
      const status = await this.arweave.transactions.getStatus(txId);
      return {
        confirmed: status.confirmed !== undefined,
        confirmations: status.confirmed?.number_of_confirmations || 0,
      };
    } catch (error) {
      return { confirmed: false, confirmations: 0 };
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<string> {
    if (!this.wallet) {
      return '0';
    }

    try {
      const address = await this.arweave.wallets.jwkToAddress(this.wallet);
      const winston = await this.arweave.wallets.getBalance(address);
      return this.arweave.ar.winstonToAr(winston);
    } catch (error) {
      logger.error('Failed to get Arweave balance', { error });
      return '0';
    }
  }
}

export default ArweaveService;
