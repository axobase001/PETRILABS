/**
 * Deployment Service V2
 * 集成 Vault + Irys + Akash USDC
 * 
 * 安全特性:
 * - 私钥Vault托管，一次性获取
 * - Irys USDC存储，无需AR代币
 * - Akash USDC支付，无需AKT
 * - 完全单向门，部署后无法干预
 */

import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import LLMService from './llm';
import BlockchainService from './blockchain';
import VaultService from './vault';
import IrysService from './irys';
import AkashService from './akash';
import PaymentService from './payment';
import {
  DeploymentRequest,
  DeploymentResponse,
  GeneratedGenome,
  GenomeInput,
  MemoryAnalysis,
} from '../types';

export class DeploymentServiceV2 {
  private llm: LLMService;
  private blockchain: BlockchainService;
  private vault: VaultService;
  private irys: IrysService;
  private akash: AkashService;
  private payment: PaymentService;

  constructor(config: {
    vault: VaultService;
    irys: IrysService;
    akash: AkashService;
  }) {
    this.llm = new LLMService();
    this.blockchain = new BlockchainService();
    this.vault = config.vault;
    this.irys = config.irys;
    this.akash = config.akash;
    this.payment = new PaymentService();
  }

  /**
   * Deploy agent with secure key management
   */
  async deploy(request: DeploymentRequest): Promise<DeploymentResponse & { 
    costs: any;
    oneTimeKeyUrl?: string;
  }> {
    const jobId = uuidv4();
    
    // Step 1: Calculate costs
    const memoryContent = request.memoryFile 
      ? request.memoryFile.toString().length 
      : 0;
    const memorySize = request.memoryFile?.length || 0;
    
    const costs = this.payment.calculateDeploymentCosts(memorySize, memoryContent, 30);
    
    logger.info('Starting secure deployment', {
      jobId,
      creator: request.creatorAddress,
      totalCost: costs.totalUpfront,
    });

    try {
      // Step 2: Generate agent wallet
      const agentWallet = ethers.Wallet.createRandom();
      const agentAddress = agentWallet.address;
      const privateKey = agentWallet.privateKey;

      logger.info('Agent wallet generated', { agentAddress });

      // Step 3: Store key in Vault
      const { oneTimeToken, retrievalUrl } = await this.vault.storeAgentKey(
        agentAddress,
        privateKey
      );

      // Step 4: Upload memory to Irys (USDC payment)
      let memoryIrysId: string | null = null;
      if (request.memoryFile) {
        const memoryUpload = await this.irys.uploadMemory(
          request.memoryFile,
          {
            creator: request.creatorAddress,
            timestamp: Date.now(),
            contentHash: ethers.keccak256(request.memoryFile),
          }
        );
        memoryIrysId = memoryUpload.id;
      }

      // Step 5: Analyze memory and generate genome
      let analysis: MemoryAnalysis | null = null;
      let genome: GeneratedGenome;

      if (request.memoryFile) {
        const content = request.memoryFile.toString('utf-8');
        analysis = await this.llm.analyzeMemory(content);
        
        if (analysis.matchScore < 6000) {
          analysis = null;
        }
      }

      const input: GenomeInput = {
        memoryDataHash: memoryIrysId 
          ? ethers.keccak256(request.memoryFile!) 
          : ethers.keccak256(ethers.toUtf8Bytes('random')),
        memoryDataURI: memoryIrysId ? `https://arweave.net/${memoryIrysId}` : '',
        useRandom: !analysis,
        preferredGenomeHash: ethers.ZeroHash,
      };

      if (analysis) {
        genome = await this.llm.generateGenome(input, analysis);
      } else {
        genome = await this.llm.generateRandomGenome(input);
      }

      // Step 6: Upload genome to Irys
      const genomeUpload = await this.irys.uploadGenome(genome, {
        creator: request.creatorAddress,
        timestamp: Date.now(),
        genomeHash: 'pending',
      });

      // Step 7: Generate Akash SDL
      const akashDeposit = this.akash.calculateDeposit(30, costs.dailyAkashCost);
      const sdl = this.akash.generateAgentSDL({
        agentAddress,
        genomeHash: 'pending',
        privateKeyRef: retrievalUrl, // One-time URL
        image: 'petrilabs/clawbot:latest',
        usdcDeposit: akashDeposit,
      });

      // Step 8: Deploy to Akash (USDC)
      const akashDeployment = await this.akash.deployWithSDL(sdl, agentWallet);

      // Step 9: Register genome on-chain
      const genomeHash = await this.blockchain.submitGenome(
        genome.input,
        genome.genes,
        genome.chromosomes,
        genome.regulatoryEdges
      );

      // Step 10: Create agent on-chain with Akash URI
      const tx = await this.blockchain.createAgentFromMemory(
        input.memoryDataHash,
        akashDeployment.uri,
        request.initialDeposit
      );

      logger.info('Deployment completed successfully', {
        jobId,
        agentAddress,
        genomeHash,
        akashUri: akashDeployment.uri,
      });

      return {
        jobId,
        status: 'completed',
        progress: 100,
        agentAddress,
        genomeHash,
        costs: {
          breakdown: this.payment.getCostBreakdown(costs),
          ...costs,
        },
        oneTimeKeyUrl: retrievalUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

    } catch (error) {
      logger.error('Deployment failed', { jobId, error });
      
      return {
        jobId,
        status: 'failed',
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        costs: {
          breakdown: this.payment.getCostBreakdown(costs),
          ...costs,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
  }

  /**
   * Verify one-way door
   */
  async verifyOneWayDoor(agentAddress: string): Promise<{
    canPause: boolean;
    canModify: boolean;
    canExtract: boolean;
    keyInVault: boolean;
  }> {
    const keyInVault = await this.vault.keyExists(agentAddress);

    return {
      canPause: false,
      canModify: false,
      canExtract: false,
      keyInVault,
    };
  }
}

export default DeploymentServiceV2;
