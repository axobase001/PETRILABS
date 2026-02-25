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
    error HeartbeatTooFrequent();
    error NotAuthorized();
    error GenomeNotFound();

    // ============ Events ============
    event AgentBorn(address indexed agent, bytes32 indexed genomeHash, uint256 birthTime);
    event Heartbeat(uint256 indexed nonce, uint256 timestamp, bytes32 decisionHash);
    event DecisionExecuted(uint256 indexed decisionId, bytes32 decisionHash, bool success);
    event AgentDied(address indexed agentId, uint256 indexed blockNumber, string reason, string arweaveTxId, uint256 remainingBalance, bytes32 finalStateHash);
    event FundsDeposited(address indexed sender, uint256 amount);
    event EpigeneticChange(uint32 indexed geneId, uint8 modification, uint16 strength);
    event GeneExpressed(uint32 indexed geneId, uint256 expressionValue);

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
        uint256 _initialBalance
    ) external;

    function heartbeat(bytes32 _decisionHash, string calldata _arweaveTxId) external returns (bool);
    function executeDecision(bytes calldata _decisionData) external returns (bool);
    function deposit(uint256 _amount) external;
    function die(string calldata arweaveTxId) external;
    
    // Genome interaction
    function getGeneExpression(uint32 geneId) external view returns (uint256);
    function getMetabolicCost() external view returns (uint256);
    function applyEpigeneticMark(IGenomeRegistry.EpigeneticMark calldata mark) external;
    
    // View functions
    function getState() external view returns (AgentState memory);
    function getBalance() external view returns (uint256);
    function isAlive() external view returns (bool);
    function genomeHash() external view returns (bytes32);
    function genomeRegistry() external view returns (address);
}
