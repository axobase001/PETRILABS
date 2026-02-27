/**
 * Akash Network Client
 * Queries deployment status and manages container lifecycle
 */

import { SigningStargateClient } from '@cosmjs/stargate';
import { DirectSecp256k1HdWallet, DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import axios, { AxiosInstance } from 'axios';
import { AkashDeployment, AkashDeploymentStatus, AkashLeaseStatus } from '../../types';

// Akash certificate manager imports
import { getAkashTypeRegistry } from '@akashnetwork/akashjs/build/stargate';
import { MsgCloseDeployment } from '@akashnetwork/akashjs/build/codegen/akash/deployment/v1beta3/deploymentmsg';

export interface AkashConfig {
  rpcEndpoint: string;
  restEndpoint: string;
  mnemonic?: string;
  privateKey?: string;
  chainId: string;
}

export class AkashClient {
  private restClient: AxiosInstance;
  private config: AkashConfig;
  private wallet?: DirectSecp256k1HdWallet | DirectSecp256k1Wallet;
  private signingClient?: SigningStargateClient;

  constructor(config: AkashConfig) {
    this.config = config;
    this.restClient = axios.create({
      baseURL: config.restEndpoint,
      timeout: 30000,
    });
  }

  /**
   * Initialize wallet and signing client
   */
  async initialize(): Promise<void> {
    if (this.config.mnemonic) {
      this.wallet = await DirectSecp256k1HdWallet.fromMnemonic(this.config.mnemonic, {
        prefix: 'akash',
      });
    } else if (this.config.privateKey) {
      // Convert hex private key to wallet
      const privateKey = Buffer.from(this.config.privateKey.replace('0x', ''), 'hex');
      this.wallet = await DirectSecp256k1Wallet.fromKey(privateKey, 'akash');
    }

    if (this.wallet) {
      this.signingClient = await SigningStargateClient.connectWithSigner(
        this.config.rpcEndpoint,
        this.wallet,
        {
          registry: getAkashTypeRegistry(),
        }
      );
    }
  }

  /**
   * Get deployment status by dseq and owner
   */
  async getDeploymentStatus(dseq: string, owner: string): Promise<AkashDeploymentStatus> {
    try {
      const response = await this.restClient.get(
        `/akash/deployment/v1beta3/deployments/info?id.owner=${owner}&id.dseq=${dseq}`
      );

      const deployment = response.data?.deployment;
      if (!deployment) {
        return {
          dseq,
          state: 'unknown',
          lastChecked: Date.now(),
        };
      }

      const state = this.mapDeploymentState(deployment.state);
      
      // Get lease status if deployment is active
      let hostUri: string | undefined;
      if (state === 'active') {
        try {
          const leaseStatus = await this.getLeaseStatus(dseq, owner);
          hostUri = leaseStatus.endpoints?.[0]?.host;
        } catch (error) {
          // Lease might not be ready yet
        }
      }

      return {
        dseq,
        state,
        hostUri,
        lastChecked: Date.now(),
      };
    } catch (error: any) {
      return {
        dseq,
        state: 'error',
        lastChecked: Date.now(),
        error: error.message,
      };
    }
  }

  /**
   * Get lease status for a deployment
   */
  async getLeaseStatus(dseq: string, owner: string): Promise<AkashLeaseStatus> {
    // First find the lease
    const leasesResponse = await this.restClient.get(
      `/akash/market/v1beta3/leases/list?filters.owner=${owner}&filters.dseq=${dseq}`
    );

    const leases = leasesResponse.data?.leases || [];
    if (leases.length === 0) {
      throw new Error('No leases found for deployment');
    }

    const lease = leases[0];
    const provider = lease.lease?.leased?.provider;

    if (!provider) {
      throw new Error('Lease provider not found');
    }

    // Query lease status from provider
    const statusResponse = await this.restClient.get(
      `/akash/provider/${provider}/lease-status`,
      {
        params: {
          owner,
          dseq,
          gseq: lease.lease?.leased?.gseq || 1,
          oseq: lease.lease?.leased?.oseq || 1,
          provider,
        },
      }
    );

    const status = statusResponse.data;
    return {
      cpu: status.cpu || '0',
      memory: status.memory || '0',
      storage: status.storage || '0',
      endpoints: status.endpoints || [],
    };
  }

  /**
   * List all deployments for an owner
   */
  async listDeployments(owner: string): Promise<AkashDeployment[]> {
    const response = await this.restClient.get(
      `/akash/deployment/v1beta3/deployments/list?filters.owner=${owner}`
    );

    const deployments = response.data?.deployments || [];
    return deployments.map((d: any) => this.parseDeployment(d));
  }

  /**
   * Check if container is healthy via HTTP health endpoint
   */
  async checkContainerHealth(hostUri: string): Promise<boolean> {
    try {
      const response = await axios.get(`http://${hostUri}/health`, {
        timeout: 10000,
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Close a deployment (requires signing)
   */
  async closeDeployment(dseq: string): Promise<string | undefined> {
    if (!this.signingClient || !this.wallet) {
      throw new Error('Client not initialized with wallet');
    }

    const [account] = await this.wallet.getAccounts();
    const owner = account.address;

    const msg: MsgCloseDeployment = {
      typeUrl: '/akash.deployment.v1beta3.MsgCloseDeployment',
      value: {
        id: {
          owner,
          dseq: Long.fromString(dseq),
        },
      },
    };

    const result = await this.signingClient.signAndBroadcast(owner, [msg], 'auto');
    return result.transactionHash;
  }

  /**
   * Get account address from wallet
   */
  async getAddress(): Promise<string | undefined> {
    if (!this.wallet) return undefined;
    const [account] = await this.wallet.getAccounts();
    return account.address;
  }

  /**
   * Map Akash deployment state to our status enum
   */
  private mapDeploymentState(state: string): 'active' | 'inactive' | 'closed' | 'error' | 'unknown' {
    switch (state.toLowerCase()) {
      case 'active':
        return 'active';
      case 'closed':
        return 'closed';
      case 'inactive':
        return 'inactive';
      default:
        return 'unknown';
    }
  }

  /**
   * Parse deployment response
   */
  private parseDeployment(data: any): AkashDeployment {
    return {
      dseq: data.deployment?.deployment_id?.dseq || '',
      owner: data.deployment?.deployment_id?.owner || '',
      provider: data.escrow_account?.owner || '',
      state: data.deployment?.state || 'unknown',
      createdAt: data.deployment?.created_at || '0',
    };
  }
}

// Long type for protobuf
import Long from 'long';

export default AkashClient;
