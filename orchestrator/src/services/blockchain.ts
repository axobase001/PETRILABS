import { ethers, Contract, Wallet, JsonRpcProvider } from 'ethers';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Gene, Chromosome, RegulatoryEdge, GenomeInput } from '../types';

// ABI imports (simplified - full ABIs would be in separate files)
const GENOME_REGISTRY_ABI = [
  'function registerGenome(tuple(bytes32 memoryDataHash, string memoryDataURI, bool useRandom, bytes32 preferredGenomeHash) calldata input, tuple(uint16 id, uint8 domain, uint8 origin, uint8 expressionState, uint32 value, uint32 weight, uint16 dominance, uint16 plasticity, uint16 essentiality, uint32 metabolicCost, uint32 duplicateOf, uint16 age)[] calldata _genes, tuple(uint8 id, bool isEssential, uint32[] geneIds)[] calldata _chromosomes, tuple(uint32 regulator, uint32 target, uint8 edgeType, uint16 strength)[] calldata regulatoryEdges) external returns (bytes32 genomeHash)',
  'function getGenome(bytes32 genomeHash) external view returns (tuple(bytes32 genomeHash, uint32 totalGenes, uint16 generation, uint64 birthTimestamp, bytes32 lineageId, bytes32 parentGenomeHash, bytes32 memoryDataHash, bool isRandom, uint256[] geneIds, uint8[] chromosomeIds))',
  'function genomeExists(bytes32 genomeHash) external view returns (bool)',
  'function setAuthorizedCreator(address creator, bool authorized) external',
  'function calculateMetabolicCost(bytes32 genomeHash) external view returns (uint256)',
  'function expressGene(bytes32 genomeHash, uint32 geneId) external view returns (uint256)',
  'function computeGenomeHash(tuple(uint16 id, uint8 domain, uint8 origin, uint8 expressionState, uint32 value, uint32 weight, uint16 dominance, uint16 plasticity, uint16 essentiality, uint32 metabolicCost, uint32 duplicateOf, uint16 age)[] calldata _genes, tuple(uint8 id, bool isEssential, uint32[] geneIds)[] calldata _chromosomes) external pure returns (bytes32)',
  'event GenomeRegistered(bytes32 indexed genomeHash, address indexed agent, address indexed creator, uint32 totalGenes, bool isFromMemory, uint64 timestamp)',
];

const FACTORY_ABI = [
  'function createAgentFromMemory(bytes32 memoryHash, string calldata memoryURI, uint256 initialDeposit) external returns (address agent)',
  'function createAgentRandom(uint256 initialDeposit) external returns (address agent)',
  'function submitGenome(tuple(bytes32 memoryDataHash, string memoryDataURI, bool useRandom, bytes32 preferredGenomeHash) calldata input, tuple(uint16 id, uint8 domain, uint8 origin, uint8 expressionState, uint32 value, uint32 weight, uint16 dominance, uint16 plasticity, uint16 essentiality, uint32 metabolicCost, uint32 duplicateOf, uint16 age)[] calldata genes, tuple(uint8 id, bool isEssential, uint32[] geneIds)[] calldata chromosomes, tuple(uint32 regulator, uint32 target, uint8 edgeType, uint16 strength)[] calldata regulatoryEdges) external returns (bytes32 genomeHash)',
  'function getAgent(address _agent) external view returns (tuple(address agent, address creator, bytes32 genomeHash, uint256 createdAt, bool exists, bool isFromMemory))',
  'function updateOrchestrator(address _newOrchestrator) external',
  'event AgentCreated(address indexed agent, address indexed creator, bytes32 indexed genomeHash, uint256 depositAmount, bool isFromMemory, uint256 timestamp)',
  'event GenomeGenerated(bytes32 indexed genomeHash, address indexed creator, bytes32 memoryHash, uint32 geneCount, bool isRandom)',
];

const AGENT_ABI = [
  'function initialize(bytes32 _genomeHash, address _orchestrator, address _usdc, address _genomeRegistry, uint256 _initialBalance) external',
  'function heartbeat(bytes32 _decisionHash, string calldata _arweaveTxId) external returns (bool)',
  'function getState() external view returns (tuple(bytes32 genomeHash, uint256 birthTime, uint256 lastHeartbeat, uint256 heartbeatNonce, bool isAlive, uint256 balance, bytes32 lastDecisionHash, uint256 totalMetabolicCost))',
  'function getGeneExpression(uint32 geneId) external view returns (uint256)',
  'function getMetabolicCost() external view returns (uint256)',
  'event AgentBorn(address indexed agent, bytes32 indexed genomeHash, uint256 birthTime)',
  'event Heartbeat(uint256 indexed nonce, uint256 timestamp, bytes32 decisionHash)',
];

export class BlockchainService {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private genomeRegistry: Contract;
  private factory: Contract;

  constructor() {
    this.provider = new JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new Wallet(config.blockchain.privateKey, this.provider);
    
    this.genomeRegistry = new Contract(
      config.blockchain.contracts.genomeRegistry,
      GENOME_REGISTRY_ABI,
      this.wallet
    );
    
    this.factory = new Contract(
      config.blockchain.contracts.petriFactoryV2,
      FACTORY_ABI,
      this.wallet
    );
  }

  /**
   * Register genome on-chain
   */
  async registerGenome(
    input: GenomeInput,
    genes: Gene[],
    chromosomes: Chromosome[],
    regulatoryEdges: RegulatoryEdge[]
  ): Promise<string> {
    try {
      logger.info('Registering genome on-chain', {
        geneCount: genes.length,
        isFromMemory: !!input.memoryDataHash,
      });

      // Convert to Solidity structs
      const solGenes = genes.map(g => ({
        id: g.id,
        domain: g.domain,
        origin: g.origin,
        expressionState: g.expressionState,
        value: g.value,
        weight: g.weight,
        dominance: g.dominance,
        plasticity: g.plasticity,
        essentiality: g.essentiality,
        metabolicCost: g.metabolicCost,
        duplicateOf: g.duplicateOf,
        age: g.age,
      }));

      const solChromosomes = chromosomes.map(c => ({
        id: c.id,
        isEssential: c.isEssential,
        geneIds: c.geneIds,
      }));

      const solEdges = regulatoryEdges.map(e => ({
        regulator: e.regulator,
        target: e.target,
        edgeType: e.edgeType,
        strength: e.strength,
      }));

      const solInput = {
        memoryDataHash: input.memoryDataHash,
        memoryDataURI: input.memoryDataURI,
        useRandom: input.useRandom,
        preferredGenomeHash: input.preferredGenomeHash,
      };

      const tx = await this.genomeRegistry.registerGenome(
        solInput,
        solGenes,
        solChromosomes,
        solEdges
      );

      const receipt = await tx.wait();
      
      // Parse event to get genome hash
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === 'GenomeRegistered'
      );
      
      const genomeHash = event?.args?.[0] || receipt.hash;

      logger.info('Genome registered successfully', {
        genomeHash,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed?.toString(),
      });

      return genomeHash;
    } catch (error) {
      logger.error('Failed to register genome', { error });
      throw error;
    }
  }

  /**
   * Create agent from memory
   */
  async createAgentFromMemory(
    memoryHash: string,
    memoryURI: string,
    initialDeposit: string
  ): Promise<string> {
    try {
      logger.info('Creating agent from memory', {
        memoryHash,
        initialDeposit,
      });

      const tx = await this.factory.createAgentFromMemory(
        memoryHash,
        memoryURI,
        initialDeposit
      );

      const receipt = await tx.wait();
      
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === 'AgentCreated'
      );
      
      const agentAddress = event?.args?.[0];

      logger.info('Agent created from memory', {
        agentAddress,
        txHash: receipt.hash,
      });

      return agentAddress;
    } catch (error) {
      logger.error('Failed to create agent from memory', { error });
      throw error;
    }
  }

  /**
   * Create agent with random genome
   */
  async createAgentRandom(initialDeposit: string): Promise<string> {
    try {
      logger.info('Creating agent with random genome', { initialDeposit });

      const tx = await this.factory.createAgentRandom(initialDeposit);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === 'AgentCreated'
      );
      
      const agentAddress = event?.args?.[0];

      logger.info('Agent created with random genome', {
        agentAddress,
        txHash: receipt.hash,
      });

      return agentAddress;
    } catch (error) {
      logger.error('Failed to create random agent', { error });
      throw error;
    }
  }

  /**
   * Submit genome via factory (orchestrator only)
   */
  async submitGenome(
    input: GenomeInput,
    genes: Gene[],
    chromosomes: Chromosome[],
    regulatoryEdges: RegulatoryEdge[]
  ): Promise<string> {
    try {
      logger.info('Submitting genome via factory');

      const solInput = {
        memoryDataHash: input.memoryDataHash,
        memoryDataURI: input.memoryDataURI,
        useRandom: input.useRandom,
        preferredGenomeHash: input.preferredGenomeHash,
      };

      const solGenes = genes.map(g => ({
        id: g.id,
        domain: g.domain,
        origin: g.origin,
        expressionState: g.expressionState,
        value: g.value,
        weight: g.weight,
        dominance: g.dominance,
        plasticity: g.plasticity,
        essentiality: g.essentiality,
        metabolicCost: g.metabolicCost,
        duplicateOf: g.duplicateOf,
        age: g.age,
      }));

      const solChromosomes = chromosomes.map(c => ({
        id: c.id,
        isEssential: c.isEssential,
        geneIds: c.geneIds,
      }));

      const solEdges = regulatoryEdges.map(e => ({
        regulator: e.regulator,
        target: e.target,
        edgeType: e.edgeType,
        strength: e.strength,
      }));

      const tx = await this.factory.submitGenome(
        solInput,
        solGenes,
        solChromosomes,
        solEdges
      );

      const receipt = await tx.wait();
      
      const event = receipt.logs.find(
        (log: any) => log.fragment?.name === 'GenomeGenerated'
      );
      
      const genomeHash = event?.args?.[0];

      logger.info('Genome submitted successfully', {
        genomeHash,
        txHash: receipt.hash,
      });

      return genomeHash;
    } catch (error) {
      logger.error('Failed to submit genome', { error });
      throw error;
    }
  }

  /**
   * Get agent info
   */
  async getAgent(agentAddress: string): Promise<{
    agent: string;
    creator: string;
    genomeHash: string;
    createdAt: number;
    exists: boolean;
    isFromMemory: boolean;
  }> {
    try {
      const info = await this.factory.getAgent(agentAddress);
      return {
        agent: info.agent,
        creator: info.creator,
        genomeHash: info.genomeHash,
        createdAt: Number(info.createdAt),
        exists: info.exists,
        isFromMemory: info.isFromMemory,
      };
    } catch (error) {
      logger.error('Failed to get agent info', { error, agentAddress });
      throw error;
    }
  }

  /**
   * Get agent state
   */
  async getAgentState(agentAddress: string): Promise<{
    genomeHash: string;
    birthTime: number;
    lastHeartbeat: number;
    heartbeatNonce: number;
    isAlive: boolean;
    balance: string;
    lastDecisionHash: string;
    totalMetabolicCost: string;
  }> {
    try {
      const agent = new Contract(agentAddress, AGENT_ABI, this.provider);
      const state = await agent.getState();
      
      return {
        genomeHash: state.genomeHash,
        birthTime: Number(state.birthTime),
        lastHeartbeat: Number(state.lastHeartbeat),
        heartbeatNonce: Number(state.heartbeatNonce),
        isAlive: state.isAlive,
        balance: state.balance.toString(),
        lastDecisionHash: state.lastDecisionHash,
        totalMetabolicCost: state.totalMetabolicCost.toString(),
      };
    } catch (error) {
      logger.error('Failed to get agent state', { error, agentAddress });
      throw error;
    }
  }

  /**
   * Send heartbeat
   */
  async sendHeartbeat(
    agentAddress: string,
    decisionHash: string,
    arweaveTxId?: string
  ): Promise<void> {
    try {
      const agent = new Contract(agentAddress, AGENT_ABI, this.wallet);
      
      const tx = await agent.heartbeat(
        decisionHash,
        arweaveTxId || ''
      );
      
      await tx.wait();
      
      logger.info('Heartbeat sent', { agentAddress, decisionHash });
    } catch (error) {
      logger.error('Failed to send heartbeat', { error, agentAddress });
      throw error;
    }
  }

  /**
   * Get gene expression
   */
  async getGeneExpression(agentAddress: string, geneId: number): Promise<string> {
    try {
      const agent = new Contract(agentAddress, AGENT_ABI, this.provider);
      const expression = await agent.getGeneExpression(geneId);
      return expression.toString();
    } catch (error) {
      logger.error('Failed to get gene expression', { error, agentAddress, geneId });
      throw error;
    }
  }

  /**
   * Check if genome exists
   */
  async genomeExists(genomeHash: string): Promise<boolean> {
    try {
      return await this.genomeRegistry.genomeExists(genomeHash);
    } catch (error) {
      logger.error('Failed to check genome existence', { error, genomeHash });
      return false;
    }
  }

  /**
   * Get wallet address
   */
  getAddress(): string {
    return this.wallet.address;
  }
}

export default BlockchainService;
