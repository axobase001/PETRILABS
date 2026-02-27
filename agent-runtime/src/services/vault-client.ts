/**
 * @deprecated Vault Client - DEPRECATED
 * 
 * This module is deprecated. Use SecureKeyManager from './secure-key-manager' instead.
 * 
 * Migration:
 * - Replace: import { VaultClient } from './vault-client'
 * - With:    import { SecureKeyManager } from './secure-key-manager'
 * 
 * - Replace: const secret = await new VaultClient(url).retrieveKey()
 * - With:    const { privateKey, address } = SecureKeyManager.loadPrivateKey()
 * 
 * Reason: PetriLabs follows "Wild Release" principle - agents are fully autonomous
 * without external Vault dependencies. Keys are injected via env vars.
 * 
 * This file will be removed in a future version.
 */

import axios from 'axios';
import { logger } from '../utils/logger';

export interface VaultSecret {
  privateKey: string;
  address: string;
  createdAt: number;
}

export class VaultClient {
  private retrievalUrl: string;

  constructor(retrievalUrl: string) {
    this.retrievalUrl = retrievalUrl;
  }

  /**
   * Retrieve and immediately delete private key from Vault
   * 这是唯一一次获取私钥的机会
   */
  async retrieveKey(): Promise<VaultSecret> {
    try {
      logger.info('Retrieving private key from Vault...');

      const response = await axios.get(this.retrievalUrl);
      const secret: VaultSecret = response.data.data.data;

      // Verify we got the key
      if (!secret.privateKey || !secret.address) {
        throw new Error('Invalid secret format from Vault');
      }

      logger.info('Private key retrieved from Vault', {
        address: secret.address,
        createdAt: secret.createdAt,
      });

      // Key is automatically deleted from Vault after retrieval
      // This is guaranteed by Vault service

      return secret;
    } catch (error) {
      logger.error('Failed to retrieve key from Vault', { error });
      
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(
          'Vault key not found or already retrieved. ' +
          'This container may be a restart, which is not allowed.'
        );
      }
      
      throw error;
    }
  }

  /**
   * Verify key format
   */
  static isValidPrivateKey(key: string): boolean {
    // Check if it's a valid Ethereum private key
    const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
    return cleanKey.length === 64 && /^[0-9a-fA-F]+$/.test(cleanKey);
  }
}

export default VaultClient;
