// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPetriAgent
 * @notice Interface for PetriAgent - an autonomous AI agent living on-chain
 */
interface IPetriAgent {
    // ============ Errors ============
    error InvalidAmount();
    error InsufficientBalance();
    error NotOrchestrator();
    error AgentDead();
    error AgentAlreadyInitialized();
    error InvalidGenome();
    error TransferFailed();
    error HeartbeatTooFrequent();
    error NotAgent();

    // ============ Events ============
    event AgentBorn(address indexed agent, bytes32 indexed genome, uint256 birthTime);
    event Heartbeat(uint256 indexed nonce, uint256 timestamp, bytes32 decisionHash);
    event DecisionExecuted(uint256 indexed decisionId, bytes32 decisionHash, bool success);
    event AgentDied(uint256 indexed deathTime, uint256 remainingBalance, bytes32 finalStateHash);
    event FundsDeposited(address indexed sender, uint256 amount);
    event FundsWithdrawn(address indexed recipient, uint256 amount);
    event ArweaveRecordStored(string arweaveTxId, bytes32 dataHash);

    // ============ Structs ============
    struct AgentState {
        bytes32 genome;
        uint256 birthTime;
        uint256 lastHeartbeat;
        uint256 heartbeatNonce;
        bool isAlive;
        uint256 balance;
        bytes32 lastDecisionHash;
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
        bytes32 _genome,
        address _orchestrator,
        address _usdc,
        uint256 _initialBalance
    ) external;

    function heartbeat(bytes32 _decisionHash, string calldata _arweaveTxId) external returns (bool);

    function executeDecision(bytes calldata _decisionData) external returns (bool);

    function deposit(uint256 _amount) external;

    function die() external;

    function getState() external view returns (AgentState memory);

    function getBalance() external view returns (uint256);

    function isAlive() external view returns (bool);

    function genome() external view returns (bytes32);
}
