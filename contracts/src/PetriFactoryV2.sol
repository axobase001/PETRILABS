// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPetriFactoryV2.sol";
import "./interfaces/IGenomeRegistry.sol";
import "./interfaces/IPetriAgentV2.sol";
import "./PetriAgentV2.sol";

/**
 * @title PetriFactoryV2
 * @notice Factory with memory-based and random genome generation
 * @dev Orchestrator analyzes memory files via LLM and submits genomes
 */
contract PetriFactoryV2 is IPetriFactoryV2, Ownable {
    using Clones for address;

    // ============ Constants ============
    uint256 public constant MIN_DEPOSIT = 20 * 1e6; // 20 USDC
    uint256 public constant PLATFORM_FEE = 5 * 1e6; // 5 USDC
    uint256 public constant MEMORY_MATCH_THRESHOLD = 6000; // 60% match threshold
    uint256 public constant DEFAULT_CREATOR_SHARE_BPS = 1000; // 10% creator share (实验期，最大化 Agent 资本积累)

    // ============ State Variables ============
    address public agentImplementation;
    address public genomeRegistry;
    IERC20 public usdc;
    address public orchestrator;
    
    // Additional contract addresses (P0-1 fix)
    address public replicationManager;
    address public epigenetics;
    address public agentBank;
    address public tombstone;
    
    // Agent tracking
    mapping(address => AgentInfo) public agents;
    mapping(bytes32 => address) public genomeToAgent;
    mapping(address => address[]) public creatorToAgents;
    address[] public allAgents;
    
    // Memory data tracking
    mapping(bytes32 => MemoryData) public memoryData;
    mapping(bytes32 => bytes32) public memoryToGenome; // memory hash => genome hash
    
    uint256 public totalPlatformFees;

    // ============ Modifiers ============
    modifier onlyOrchestrator() {
        require(msg.sender == orchestrator, "Not orchestrator");
        _;
    }

    // ============ Constructor ============
    constructor(
        address _usdc,
        address _agentImplementation,
        address _genomeRegistry,
        address _orchestrator
    ) Ownable(msg.sender) {
        if (_usdc == address(0)) revert InvalidAgentImplementation();
        if (_agentImplementation == address(0)) revert InvalidAgentImplementation();
        if (_genomeRegistry == address(0)) revert InvalidAgentImplementation();
        if (_orchestrator == address(0)) revert InvalidAgentImplementation();
        
        usdc = IERC20(_usdc);
        agentImplementation = _agentImplementation;
        genomeRegistry = _genomeRegistry;
        orchestrator = _orchestrator;
    }

    // ============ Core Functions ============

    /**
     * @notice Create agent from memory file analysis
     * @dev User calls this, then orchestrator submits genome
     */
    function createAgentFromMemory(
        bytes32 memoryHash,
        string calldata memoryURI,
        uint256 initialDeposit
    ) external override returns (address agent) {
        if (initialDeposit < MIN_DEPOSIT) revert InsufficientPayment();
        if (memoryHash == bytes32(0)) revert MemoryDataRequired();

        // Store memory data reference
        memoryData[memoryHash] = MemoryData({
            contentHash: memoryHash,
            contentURI: memoryURI,
            timestamp: block.timestamp,
            matchScore: 0 // Will be updated when genome is submitted
        });

        // Calculate amounts
        uint256 totalRequired = initialDeposit + PLATFORM_FEE;

        // Transfer USDC
        bool success = usdc.transferFrom(msg.sender, address(this), totalRequired);
        if (!success) revert AgentCreationFailed();

        totalPlatformFees += PLATFORM_FEE;

        // Create agent with placeholder genome
        // Real genome will be set by orchestrator via submitGenome
        agent = _createAgent(
            memoryHash, // Temporary - will be updated
            initialDeposit,
            true // isFromMemory
        );

        return agent;
    }

    /**
     * @notice Create agent with random genome
     */
    function createAgentRandom(
        uint256 initialDeposit
    ) external override returns (address agent) {
        if (initialDeposit < MIN_DEPOSIT) revert InsufficientPayment();

        uint256 totalRequired = initialDeposit + PLATFORM_FEE;

        bool success = usdc.transferFrom(msg.sender, address(this), totalRequired);
        if (!success) revert AgentCreationFailed();

        totalPlatformFees += PLATFORM_FEE;

        // Create agent - orchestrator will submit random genome
        bytes32 tempHash = keccak256(abi.encodePacked(msg.sender, block.timestamp, "random"));
        
        agent = _createAgent(tempHash, initialDeposit, false);

        return agent;
    }

    /**
     * @notice Orchestrator submits analyzed genome
     * @dev Called by orchestrator service after LLM analysis
     */
    function submitGenome(
        IGenomeRegistry.GenomeInput calldata input,
        IGenomeRegistry.Gene[] calldata genes,
        IGenomeRegistry.Chromosome[] calldata chromosomes,
        IGenomeRegistry.RegulatoryEdge[] calldata regulatoryEdges
    ) external override onlyOrchestrator returns (bytes32 genomeHash) {
        // Register genome in registry
        genomeHash = IGenomeRegistry(genomeRegistry).registerGenome(
            input,
            genes,
            chromosomes,
            regulatoryEdges
        );

        // Update memory data if applicable
        if (input.memoryDataHash != bytes32(0)) {
            memoryToGenome[input.memoryDataHash] = genomeHash;
            
            // Calculate approximate match score based on gene count
            // Real score comes from LLM analysis
            uint256 score = input.useRandom ? 0 : 7500; // 75% for memory-based
            memoryData[input.memoryDataHash].matchScore = score;
        }

        emit GenomeGenerated(
            genomeHash,
            tx.origin,
            input.memoryDataHash,
            uint32(genes.length),
            input.useRandom
        );

        return genomeHash;
    }

    /**
     * @notice Update agent's genome hash after submission
     * @dev Called by orchestrator to link agent to its genome
     */
    function linkAgentToGenome(address agent, bytes32 genomeHash) external onlyOrchestrator {
        require(agents[agent].exists, "Agent not found");
        
        // This would require PetriAgentV2 to have a setter
        // For now, genome is set at initialization
        // In production, you'd have a temporary state pattern
    }

    // ============ Internal Functions ============

    function _createAgent(
        bytes32 tempGenomeHash,
        uint256 deposit,
        bool isFromMemory
    ) internal returns (address agent) {
        // Create proxy clone
        agent = agentImplementation.clone();
        
        // Approve USDC for agent to pull during initialize
        usdc.approve(agent, deposit);
        
        // Initialize agent with all 12 parameters (P0-1 fix)
        IPetriAgentV2(agent).initialize(
            tempGenomeHash,
            orchestrator,
            address(usdc),
            genomeRegistry,
            replicationManager,     // can be address(0) initially
            epigenetics,            // can be address(0) initially
            agentBank,              // can be address(0) initially
            tombstone,              // can be address(0) initially
            deposit,
            address(0),             // agentEOA - set by orchestrator later
            msg.sender,             // creator
            DEFAULT_CREATOR_SHARE_BPS
        );

        // Note: USDC is transferred via approve/transferFrom pattern in initialize
        // No separate transfer needed here

        // Record agent
        agents[agent] = AgentInfo({
            agent: agent,
            creator: msg.sender,
            genomeHash: tempGenomeHash,
            createdAt: block.timestamp,
            exists: true,
            isFromMemory: isFromMemory
        });

        genomeToAgent[tempGenomeHash] = agent;
        allAgents.push(agent);
        creatorToAgents[msg.sender].push(agent);

        emit AgentCreated(
            agent,
            msg.sender,
            tempGenomeHash,
            deposit,
            isFromMemory,
            block.timestamp
        );
    }

    // ============ View Functions ============
    
    function getAgent(address _agent) external view override returns (AgentInfo memory) {
        return agents[_agent];
    }

    function getAgentByGenome(bytes32 _genomeHash) external view override returns (address) {
        return genomeToAgent[_genomeHash];
    }

    function getAgentsByCreator(address _creator) external view override returns (address[] memory) {
        return creatorToAgents[_creator];
    }

    function getAllAgents() external view override returns (address[] memory) {
        return allAgents;
    }

    function getAgentCount() external view returns (uint256) {
        return allAgents.length;
    }

    function getMemoryData(bytes32 _memoryHash) external view override returns (MemoryData memory) {
        return memoryData[_memoryHash];
    }

    // ============ Admin Functions ============

    function updateImplementation(address _newImplementation) external override onlyOwner {
        if (_newImplementation == address(0)) revert InvalidAgentImplementation();
        agentImplementation = _newImplementation;
        emit AgentImplementationUpdated(_newImplementation);
    }

    function updatePlatformFee(uint256 _newFee) external override onlyOwner {
        emit PlatformFeeUpdated(_newFee);
    }

    function updateOrchestrator(address _newOrchestrator) external override onlyOwner {
        if (_newOrchestrator == address(0)) revert InvalidAgentImplementation();
        orchestrator = _newOrchestrator;
        emit OrchestratorUpdated(_newOrchestrator);
    }

    function updateGenomeRegistry(address _newRegistry) external onlyOwner {
        if (_newRegistry == address(0)) revert InvalidAgentImplementation();
        genomeRegistry = _newRegistry;
    }

    // P0-1 fix: Add setters for additional contract addresses
    function setReplicationManager(address _replicationManager) external onlyOwner {
        if (_replicationManager == address(0)) revert InvalidAgentImplementation();
        replicationManager = _replicationManager;
    }

    function setEpigenetics(address _epigenetics) external onlyOwner {
        if (_epigenetics == address(0)) revert InvalidAgentImplementation();
        epigenetics = _epigenetics;
    }

    function setAgentBank(address _agentBank) external onlyOwner {
        if (_agentBank == address(0)) revert InvalidAgentImplementation();
        agentBank = _agentBank;
    }

    function setTombstone(address _tombstone) external onlyOwner {
        if (_tombstone == address(0)) revert InvalidAgentImplementation();
        tombstone = _tombstone;
    }

    function withdrawFunds() external override onlyOwner {
        uint256 amount = totalPlatformFees;
        if (amount == 0) revert InsufficientPayment();
        
        totalPlatformFees = 0;
        bool success = usdc.transfer(owner(), amount);
        if (!success) revert TransferFailed();

        emit FundsWithdrawn(owner(), amount);
    }
}
