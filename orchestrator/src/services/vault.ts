/**
 * HashiCorp Vault Service
 * 安全的私钥托管和分发
 * 
 * 官网: https://www.vaultproject.io
 * 替代: AWS Secrets Manager, Azure Key Vault
 */

import axios from 'axios';
import { logger } from '../utils/logger';

export interface VaultConfig {
  endpoint: string;
  token: string;
  path: string;
}

export interface SecretWrapper {
  privateKey: string;
  address: string;
  createdAt: number;
  oneTimeToken: string;
}

export class VaultService {
  private endpoint: string;
  private token: string;
  private basePath: string;

  constructor(config: VaultConfig) {
    this.endpoint = config.endpoint;
    this.token = config.token;
    this.basePath = config.path;
  }

  /**
   * Store agent private key in Vault
   */
  async storeAgentKey(
    agentAddress: string,
    privateKey: string
  ): Promise<{ oneTimeToken: string; retrievalUrl: string }> {
    try {
      // Generate one-time access token
      const oneTimeToken = this.generateOneTimeToken();

      const secret: SecretWrapper = {
        privateKey,
        address: agentAddress,
        createdAt: Date.now(),
        oneTimeToken,
      };

      // Store in Vault
      await axios.post(
        `${this.endpoint}/v1/secret/data${this.basePath}/${agentAddress}`,
        { data: secret },
        {
          headers: {
            'X-Vault-Token': this.token,
          },
        }
      );

      // Create one-time access URL
      const retrievalUrl = `${this.endpoint}/v1/secret/data${this.basePath}/${agentAddress}?token=${oneTimeToken}`;

      logger.info('Agent key stored in Vault', {
        agentAddress,
        path: `${this.basePath}/${agentAddress}`,
      });

      return { oneTimeToken, retrievalUrl };
    } catch (error) {
      logger.error('Failed to store key in Vault', { error, agentAddress });
      throw error;
    }
  }

  /**
   * Retrieve and delete key (one-time use)
   */
  async retrieveAndDeleteKey(
    agentAddress: string,
    oneTimeToken: string
  ): Promise<SecretWrapper> {
    try {
      // Verify token and retrieve
      const response = await axios.get(
        `${this.endpoint}/v1/secret/data${this.basePath}/${agentAddress}`,
        {
          headers: {
            'X-Vault-Token': this.token,
            'X-One-Time-Token': oneTimeToken,
          },
        }
      );

      const secret: SecretWrapper = response.data.data.data;

      // Verify token matches
      if (secret.oneTimeToken !== oneTimeToken) {
        throw new Error('Invalid one-time token');
      }

      // Delete immediately after retrieval
      await axios.delete(
        `${this.endpoint}/v1/secret/data${this.basePath}/${agentAddress}`,
        {
          headers: {
            'X-Vault-Token': this.token,
          },
        }
      );

      logger.info('Agent key retrieved and deleted from Vault', { agentAddress });

      return secret;
    } catch (error) {
      logger.error('Failed to retrieve key from Vault', { error, agentAddress });
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  async keyExists(agentAddress: string): Promise<boolean> {
    try {
      await axios.get(
        `${this.endpoint}/v1/secret/data${this.basePath}/${agentAddress}`,
        {
          headers: {
            'X-Vault-Token': this.token,
          },
        }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate cryptographically secure one-time token
   */
  private generateOneTimeToken(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }
}

export default VaultService;
