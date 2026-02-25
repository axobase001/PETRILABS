// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IGenomeRegistry.sol";
import "./IPetriAgentV2.sol";

/**
 * @title IPetriFactoryV2
 * @notice Factory with memory-based genome generation
 */
interface IPetriFactoryV2 {
    // ============ Errors ============
    error InvalidGenome();
    error InsufficientPayment();
    error InvalidAgentImplementation();
    error AgentCreationFailed();
    error NotAuthorized();
    error GenomeRegistrationFailed();
    error MemoryDataRequired();
    error TransferFailed();

    // ============ Events ============
    event AgentCreated(
        address indexed agent,
        address indexed creator,
        bytes32 indexed genomeHash,
        uint256 depositAmount,
        bool isFromMemory,
        uint256 timestamp
    );
    
    event GenomeGenerated(
        bytes32 indexed genomeHash,
        address indexed creator,
        bytes32 memoryHash,
        uint32 geneCount,
        bool isRandom
    );
    
    event AgentImplementationUpdated(address indexed newImplementation);
    event PlatformFeeUpdated(uint256 newFee);
    event FundsWithdrawn(address indexed recipient, uint256 amount);
    event OrchestratorUpdated(address indexed newOrchestrator);

    // ============ Structs ============
    struct AgentInfo {
        address agent;
        address creator;
        bytes32 genomeHash;
        uint256 createdAt;
        bool exists;
        bool isFromMemory;
    }

    struct MemoryData {
        bytes32 contentHash;          // 记忆文件内容的哈希
        string contentURI;            // Arweave/IPFS 链接
        uint256 timestamp;            // 上传时间
        uint256 matchScore;           // 与基因组的匹配度 [0, 10000]
    }

    // ============ Functions ============
    
    /**
     * @notice Create agent with genome from memory analysis
     * @param memoryHash Hash of the uploaded memory file
     * @param memoryURI URI to retrieve the memory file
     * @param initialDeposit Initial USDC deposit
     * @return agent Address of the created agent
     */
    function createAgentFromMemory(
        bytes32 memoryHash,
        string calldata memoryURI,
        uint256 initialDeposit
    ) external returns (address agent);

    /**
     * @notice Create agent with random genome (no memory provided)
     * @param initialDeposit Initial USDC deposit
     * @return agent Address of the created agent
     */
    function createAgentRandom(
        uint256 initialDeposit
    ) external returns (address agent);

    /**
     * @notice Orchestrator submits analyzed genome for user
     * @param input Genome generation parameters
     * @param genes Array of genes
     * @param chromosomes Chromosome structure
     * @param regulatoryEdges Regulatory network
     * @return genomeHash The registered genome hash
     */
    function submitGenome(
        IGenomeRegistry.GenomeInput calldata input,
        IGenomeRegistry.Gene[] calldata genes,
        IGenomeRegistry.Chromosome[] calldata chromosomes,
        IGenomeRegistry.RegulatoryEdge[] calldata regulatoryEdges
    ) external returns (bytes32 genomeHash);

    // View functions
    function getAgent(address _agent) external view returns (AgentInfo memory);
    function getAgentByGenome(bytes32 _genomeHash) external view returns (address);
    function getAgentsByCreator(address _creator) external view returns (address[] memory);
    function getAllAgents() external view returns (address[] memory);
    function getMemoryData(bytes32 _memoryHash) external view returns (MemoryData memory);
    
    // Admin functions
    function updateImplementation(address _newImplementation) external;
    function updatePlatformFee(uint256 _newFee) external;
    function updateOrchestrator(address _newOrchestrator) external;
    function updateGenomeRegistry(address _newRegistry) external;
    function withdrawFunds() external;
}
