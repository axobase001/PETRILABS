/**
 * Deployment Service with Cost Calculation
 */

import { v4 as uuidv4 } from 'uuid';
import { Queue, Job } from 'bullmq';
import { config } from '../config';
import { logger } from '../utils/logger';
import LLMService from './llm';
import BlockchainService from './blockchain';
import ArweaveService from './arweave';
import PaymentService from './payment';
import {
  DeploymentRequest,
  DeploymentResponse,
  GeneratedGenome,
  GenomeInput,
  MemoryAnalysis,
} from '../types';

export class DeploymentService {
  private queue: Queue;
  private llm: LLMService;
  private blockchain: BlockchainService;
  private arweave: ArweaveService;
  private payment: PaymentService;

  constructor() {
    this.queue = new Queue('agent-deployment', {
      connection: { url: config.redis.url },
    });
    
    this.llm = new LLMService();
    this.blockchain = new BlockchainService();
    this.arweave = new ArweaveService();
    this.payment = new PaymentService();
  }

  /**
   * Calculate deployment costs
   */
  calculateCosts(
    memoryFileSize: number,
    memoryContentLength: number,
    runwayDays: number = 30
  ) {
    return this.payment.calculateDeploymentCosts(
      memoryFileSize,
      memoryContentLength,
      runwayDays
    );
  }

  /**
   * Start deployment process
   */
  async deploy(request: DeploymentRequest): Promise<DeploymentResponse & { costs?: any }> {
    const jobId = uuidv4();
    
    // Calculate costs
    const memoryContent = request.memoryFile 
      ? request.memoryFile.toString().length 
      : 0;
    const memorySize = request.memoryFile?.length || 0;
    
    const costs = this.calculateCosts(memorySize, memoryContent, 30);
    
    logger.info('Starting deployment with cost estimate', {
      jobId,
      hasMemory: !!request.memoryFile,
      creator: request.creatorAddress,
      totalCost: costs.totalUpfront,
    });

    // Create job
    await this.queue.add(
      'deploy-agent',
      {
        jobId,
        costs,
        ...request,
      },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }
    );

    return {
      jobId,
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      costs: {
        breakdown: this.payment.getCostBreakdown(costs),
        ...costs,
      },
    };
  }

  /**
   * Process deployment (called by worker)
   */
  async processDeployment(job: Job): Promise<DeploymentResponse> {
    const { 
      jobId, 
      costs,
      memoryFile, 
      memoryHash, 
      memoryURI, 
      initialDeposit, 
      creatorAddress, 
      preferredTraits 
    } = job.data;
    
    logger.info('Processing deployment job', { jobId, costs });
    
    let genome: GeneratedGenome | null = null;
    let memoryArweaveId: string | null = memoryURI || null;
    let genomeHash: string | null = null;
    let agentAddress: string | null = null;
    let analysis: MemoryAnalysis | null = null;

    try {
      // Step 1: Upload memory to Arweave if provided
      await job.updateProgress({ step: 'uploading_memory', progress: 5 });
      
      if (memoryFile && !memoryURI) {
        const contentHash = this.computeHash(Buffer.from(memoryFile));
        const upload = await this.arweave.uploadMemory(Buffer.from(memoryFile), {
          creator: creatorAddress,
          timestamp: Date.now(),
          contentHash,
        });
        memoryArweaveId = upload.url;
      }

      // Step 2: Analyze memory or use random
      await job.updateProgress({ step: 'analyzing', progress: 15 });
      
      if (memoryFile) {
        const content = Buffer.from(memoryFile).toString('utf-8');
        analysis = await this.llm.analyzeMemory(content);
        
        // Check match score
        if (analysis.matchScore < 6000) {
          logger.warn('Memory match score too low, falling back to random', {
            matchScore: analysis.matchScore,
          });
          analysis = null;
        }
      }

      // Step 3: Generate genome
      await job.updateProgress({ step: 'generating_genome', progress: 40 });
      
      const input: GenomeInput = {
        memoryDataHash: memoryHash || this.computeHash(Buffer.from(memoryFile || '')),
        memoryDataURI: memoryArweaveId || '',
        useRandom: !analysis,
        preferredGenomeHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      };

      if (analysis) {
        genome = await this.llm.generateGenome(input, analysis);
      } else {
        genome = await this.llm.generateRandomGenome(input);
      }

      // Step 4: Upload genome to Arweave
      await job.updateProgress({ step: 'storing_genome', progress: 60 });
      
      const genomeUpload = await this.arweave.uploadGenome(genome, {
        creator: creatorAddress,
        timestamp: Date.now(),
        genomeHash: 'pending', // Will update after registration
      });

      // Step 5: Submit genome to blockchain
      await job.updateProgress({ step: 'submitting_genome', progress: 75 });
      
      genomeHash = await this.blockchain.submitGenome(
        genome.input,
        genome.genes,
        genome.chromosomes,
        genome.regulatoryEdges
      );

      // Step 6: Create agent on blockchain
      await job.updateProgress({ step: 'creating_agent', progress: 90 });
      
      if (analysis) {
        agentAddress = await this.blockchain.createAgentFromMemory(
          input.memoryDataHash,
          memoryArweaveId || '',
          initialDeposit
        );
      } else {
        agentAddress = await this.blockchain.createAgentRandom(initialDeposit);
      }

      await job.updateProgress({ step: 'completed', progress: 100 });

      logger.info('Deployment completed', {
        jobId,
        agentAddress,
        genomeHash,
        totalCost: costs.totalUpfront,
      });

      return {
        jobId,
        status: 'completed',
        progress: 100,
        agentAddress,
        genomeHash,
        createdAt: job.data.createdAt,
        updatedAt: Date.now(),
      };

    } catch (error) {
      logger.error('Deployment failed', { jobId, error });
      
      return {
        jobId,
        status: 'failed',
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        createdAt: job.data.createdAt,
        updatedAt: Date.now(),
      };
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<DeploymentResponse | null> {
    const job = await this.queue.getJob(jobId);
    
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress || 0;

    return {
      jobId,
      status: state as any,
      progress: typeof progress === 'number' ? progress : 0,
      agentAddress: job.returnvalue?.agentAddress,
      genomeHash: job.returnvalue?.genomeHash,
      error: job.failedReason,
      createdAt: job.timestamp,
      updatedAt: job.processedOn || job.timestamp,
    };
  }

  private computeHash(data: Buffer): string {
    const { ethers } = require('ethers');
    return ethers.keccak256(data);
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export default DeploymentService;
