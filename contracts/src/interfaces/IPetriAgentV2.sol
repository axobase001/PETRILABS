// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IGenomeRegistry.sol";

/**
 * @title IPetriAgentV2
 * @notice Enhanced PetriAgent with dynamic genome support
 */
interface IPetriAgentV2 {
    // ============ Errors ============
    error InvalidAmount();
    error InsufficientBalance();
    error NotOrchestrator();
    error AgentDead();
    error InvalidGenome();
    error TransferFailed();
    error HeartbeatTooFrequent(uint256 timeSinceLast);
    error AgentStillAlive(uint256 timeUntilAbandonment);
    error AgentAlreadyDead();
    error NotAuthorized();
    error NotAgentOrOrchestrator();
    error InvalidAgentEOA();
    error GenomeNotFound();

    // ============ Events ============
    event AgentBorn(address indexed agent, bytes32 indexed genomeHash, address indexed agentEOA, uint256 birthTime);
    event Heartbeat(uint256 indexed nonce, uint256 timestamp, bytes32 decisionHash);
    event DecisionExecuted(uint256 indexed decisionId, bytes32 decisionHash, bool success);
    event AgentDied(
        address indexed agentAddress,
        uint256 timestamp,
        string reason,
        string arweaveTxId,
        uint256 finalBalance,
        bytes32 indexed tombstoneId,
        address indexed creator
    );
    event FundsDeposited(address indexed sender, uint256 amount);
    event EpigeneticChange(uint32 indexed geneId, uint8 modification, uint16 strength);
    event GeneExpressed(uint32 indexed geneId, uint256 expressionValue);
    event AutoEpigeneticTriggered(uint32 indexed geneId, uint8 markType, string trigger, uint256 duration);
    event AbandonedDeclared(address indexed agent, uint256 timeSinceLastHeartbeat);
    event DividendPaid(
        address indexed creator, 
        uint256 amount, 
        uint256 triggerAmount
    );
    event IncomeReceived(
        address indexed from, 
        uint256 amount, 
        string incomeType
    );
    
    /// @notice 遗产转账失败事件（不阻塞死亡流程）
    event LegacyTransferFailed(
        address indexed agent,
        address indexed intendedRecipient,
        uint256 amount
    );
    
    /// @notice 墓碑铸造失败事件（不阻塞死亡流程）
    event TombstoneMintFailed(address indexed agent, address indexed creator);

    // ============ Structs ============
    struct AgentState {
        bytes32 genomeHash;
        uint256 birthTime;
        uint256 lastHeartbeat;
        uint256 heartbeatNonce;
        bool isAlive;
        uint256 balance;
        bytes32 lastDecisionHash;
        uint256 totalMetabolicCost;  // USDC per day scaled
    }

    struct Decision {
        uint256 id;
        bytes32 hash;
        uint256 timestamp;
        bool executed;
        bytes data;
    }

    // ============ Functions ============
    function initialize(
        bytes32 _genomeHash,
        address _orchestrator,
        address _usdc,
        address _genomeRegistry,
        address _replicationManager,
        address _epigenetics,
        address _agentBank,
        address _tombstone,
        uint256 _initialBalance,
        address _agentEOA,
        address _creator,
        uint256 _creatorShareBps
    ) external;

    function heartbeat(bytes32 _decisionHash, string calldata _arweaveTxId) external returns (bool);
    function executeDecision(bytes calldata _decisionData) external returns (bool);
    function deposit(uint256 _amount) external;
    function die(string calldata arweaveTxId) external;
    function declareAbandoned() external;
    
    // Genome interaction
    function getGeneExpression(uint32 geneId) external view returns (uint256);
    function getMetabolicCost() external view returns (uint256);
    function applyEpigeneticMark(IGenomeRegistry.EpigeneticMark calldata mark) external;
    function autoEpigeneticMark(uint32 geneId, uint8 modification) external;
    
    // View functions
    function getState() external view returns (AgentState memory);
    function getBalance() external view returns (uint256);
    function isAlive() external view returns (bool);
    function agentEOA() external view returns (address);
    function genomeHash() external view returns (bytes32);
    function genomeRegistry() external view returns (address);
    
    // Creator dividend
    function creator() external view returns (address);
    function creatorShareBps() external view returns (uint256);
    function totalCreatorDividends() external view returns (uint256);
    function initialDeposit() external view returns (uint256);
    function totalExternalFunding() external view returns (uint256);
    function totalEarnedIncome() external view returns (uint256);
    
    // Income tracking
    function recordEarnedIncome(uint256 _amount) external;
    function getSurvivalDependency() external view returns (uint256 dependencyBps);
    function getIncomeStats() external view returns (
        uint256 initial,
        uint256 external,
        uint256 earned,
        uint256 total,
        uint256 dependencyBps
    );
    
    // Constants
    function MIN_HEARTBEAT_INTERVAL() external view returns (uint256);
    function MAX_HEARTBEAT_INTERVAL() external view returns (uint256);
}
