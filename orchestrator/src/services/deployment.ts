/**
 * Deployment Service V3
 * 使用原生 Arweave + 托管支付模式
 * 
 * 支付流程：
 * 1. 用户 USDC → 编排服务
 * 2. 编排服务兑换为 AR
 * 3. AR 存入托管钱包
 * 4. Agent 调用编排 API 存储，编排代付 AR
 */

import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';
import LLMService from './llm';
import BlockchainService from './blockchain';
import VaultService from './vault';
import ArweaveProxyService from './arweave-proxy';
import AkashService from './akash';
import PaymentService from './payment';
import {
  DeploymentRequest,
  DeploymentResponse,
  GeneratedGenome,
  GenomeInput,
  MemoryAnalysis,
} from '../types';

export class DeploymentServiceV3 {
  private llm: LLMService;
  private blockchain: BlockchainService;
  private vault: VaultService;
  private arweaveProxy: ArweaveProxyService;
  private akash: AkashService;
  private payment: PaymentService;

  constructor(config: {
    vault: VaultService;
    arweaveProxy: ArweaveProxyService;
    akash: AkashService;
  }) {
    this.llm = new LLMService();
    this.blockchain = new BlockchainService();
    this.vault = config.vault;
    this.arweaveProxy = config.arweaveProxy;
    this.akash = config.akash;
    this.payment = new PaymentService();
  }

  /**
   * 计算部署成本（包含 AR 存储费用）
   */
  async calculateCosts(
    memoryFileSize: number,
    memoryContentLength: number,
    runwayDays: number = 30
  ) {
    const baseCosts = this.payment.calculateDeploymentCosts(
      memoryFileSize,
      memoryContentLength,
      runwayDays
    );

    // 计算 AR 存储费用
    // 基因组 ~50KB，记忆文件可变，心跳/决策每天 ~10KB
    const estimatedDailyBytes = 10 * 1024; // 10KB per day
    const totalBytes = 50 * 1024 + memoryFileSize + (estimatedDailyBytes * runwayDays);
    
    const arweaveCostUSDC = await this.arweaveProxy.estimateCostUSDC(totalBytes);
    const arweaveCostAR = await this.estimateARCost(totalBytes);

    return {
      ...baseCosts,
      arweave: {
        usdc: arweaveCostUSDC,
        ar: arweaveCostAR,
        bytes: totalBytes,
      },
      totalUpfront: parseFloat(baseCosts.totalUpfront.toString()) + parseFloat(arweaveCostUSDC) / 1e6,
    };
  }

  private async estimateARCost(bytes: number): Promise<string> {
    // 简化估算：~0.01 AR per 100KB
    const ar = (bytes / 100 / 1024).toFixed(4);
    return ar;
  }

  /**
   * 部署 Agent
   */
  async deploy(request: DeploymentRequest & { 
    arweaveDepositUSDC: string  // 额外的 AR 存储预付费
  }): Promise<DeploymentResponse & { 
    costs: any;
    oneTimeKeyUrl?: string;
  }> {
    const jobId = uuidv4();
    
    // 计算成本
    const memoryContent = request.memoryFile 
      ? request.memoryFile.toString().length 
      : 0;
    const memorySize = request.memoryFile?.length || 0;
    
    const costs = await this.calculateCosts(memorySize, memoryContent, 30);
    
    logger.info('Starting deployment V3 (Arweave proxy)', {
      jobId,
      creator: request.creatorAddress,
      totalCost: costs.totalUpfront,
      arweaveDeposit: request.arweaveDepositUSDC,
    });

    try {
      // Step 1: 生成 Agent 钱包
      const agentWallet = ethers.Wallet.createRandom();
      const agentAddress = agentWallet.address;
      const privateKey = agentWallet.privateKey;

      logger.info('Agent wallet generated', { agentAddress });

      // Step 2: 存储私钥到 Vault
      const { oneTimeToken, retrievalUrl } = await this.vault.storeAgentKey(
        agentAddress,
        privateKey
      );

      // Step 3: 为 Agent 充值 AR 存储额度
      await this.arweaveProxy.depositUSDC(
        agentAddress,
        request.arweaveDepositUSDC
      );

      // Step 4: 上传记忆文件到 Arweave（使用代理）
      let memoryArweaveId: string | null = null;
      if (request.memoryFile) {
        const memoryUpload = await this.arweaveProxy.store({
          agentAddress,
          data: request.memoryFile,
          tags: [
            { name: 'App-Name', value: 'PETRILABS' },
            { name: 'Type', value: 'Memory' },
            { name: 'Creator', value: request.creatorAddress },
          ],
        });
        memoryArweaveId = memoryUpload.id;
      }

      // Step 5: 分析记忆并生成基因组
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
        memoryDataURI: memoryArweaveId ? `https://arweave.net/${memoryArweaveId}` : '',
        useRandom: !analysis,
        preferredGenomeHash: ethers.ZeroHash,
      };

      if (analysis) {
        genome = await this.llm.generateGenome(input, analysis);
      } else {
        genome = await this.llm.generateRandomGenome(input);
      }

      // Step 6: 上传基因组到 Arweave（使用代理）
      const genomeUpload = await this.arweaveProxy.storeJSON(
        agentAddress,
        genome,
        [
          { name: 'App-Name', value: 'PETRILABS' },
          { name: 'Type', value: 'Genome' },
          { name: 'Creator', value: request.creatorAddress },
        ]
      );

      // Step 7: 生成 Akash SDL
      const akashDeposit = this.akash.calculateDeposit(30, 1.5);
      const sdl = this.akash.generateAgentSDL({
        agentAddress,
        genomeHash: 'pending',
        privateKeyRef: retrievalUrl,
        image: 'petrilabs/clawbot:latest',
        usdcDeposit: akashDeposit,
      });

      // Step 8: 部署到 Akash
      const akashDeployment = await this.akash.deployWithSDL(sdl, agentWallet);

      // Step 9: 注册基因组上链
      const genomeHash = await this.blockchain.submitGenome(
        genome.input,
        genome.genes,
        genome.chromosomes,
        genome.regulatoryEdges
      );

      // Step 10: 创建 Agent 合约
      const tx = await this.blockchain.createAgentFromMemory(
        input.memoryDataHash,
        akashDeployment.uri,
        request.initialDeposit
      );

      logger.info('Deployment V3 completed', {
        jobId,
        agentAddress,
        genomeHash,
        akashUri: akashDeployment.uri,
        memoryArweaveId,
        genomeArweaveId: genomeUpload.id,
      });

      return {
        jobId,
        status: 'completed',
        progress: 100,
        agentAddress,
        genomeHash,
        costs: {
          breakdown: [
            ...this.payment.getCostBreakdown(costs as any),
            {
              label: 'Arweave Storage (AR via Proxy)',
              amount: parseFloat(costs.arweave.usdc) / 1e6,
              description: `${costs.arweave.ar} AR for ${Math.round(costs.arweave.bytes / 1024)}KB storage`,
              isRequired: true,
            },
          ],
          ...costs,
        },
        oneTimeKeyUrl: retrievalUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

    } catch (error) {
      logger.error('Deployment V3 failed', { jobId, error });
      
      return {
        jobId,
        status: 'failed',
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        costs: {
          breakdown: this.payment.getCostBreakdown(costs as any),
          ...costs,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
  }

  /**
   * 获取存储账户状态
   */
  async getStorageAccount(agentAddress: string) {
    return this.arweaveProxy.getAccount(agentAddress);
  }
}

export default DeploymentServiceV3;
