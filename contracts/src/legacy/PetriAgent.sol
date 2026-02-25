// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "./interfaces/IPetriAgent.sol";

/**
 * @title PetriAgent
 * @notice An autonomous AI agent living on-chain with irreversible lifecycle
 * @dev Each agent has a unique genome, makes decisions, and dies when funds run out
 */
contract PetriAgent is IPetriAgent, Initializable {
    // ============ Constants ============
    uint256 public constant HEARTBEAT_INTERVAL = 6 hours;
    uint256 public constant MIN_BALANCE = 1e6; // 1 USDC (6 decimals)

    // ============ State Variables ============
    bytes32 public genome;
    address public orchestrator;
    IERC20 public usdc;
    
    uint256 public birthTime;
    uint256 public lastHeartbeat;
    uint256 public heartbeatNonce;
    bool public isAlive;
    
    bytes32 public lastDecisionHash;
    mapping(uint256 => Decision) public decisions;
    uint256 public decisionCount;
    
    // Arweave records mapping
    mapping(string => bytes32) public arweaveRecords;
    string[] public arweaveTxIds;

    // ============ Modifiers ============
    modifier onlyOrchestrator() {
        if (msg.sender != orchestrator) revert NotOrchestrator();
        _;
    }

    modifier onlyAlive() {
        if (!isAlive) revert AgentDead();
        _;
    }

    // ============ Constructor ============
    constructor() {
        // Note: _disableInitializers() is called when deploying implementation
        // for proxy pattern. For direct deployment, we allow initialization.
    }

    // ============ Initialization ============
    function initialize(
        bytes32 _genome,
        address _orchestrator,
        address _usdc,
        uint256 _initialBalance
    ) external override initializer {
        if (_genome == bytes32(0)) revert InvalidGenome();
        if (_orchestrator == address(0)) revert InvalidAmount();
        if (_usdc == address(0)) revert InvalidAmount();

        genome = _genome;
        orchestrator = _orchestrator;
        usdc = IERC20(_usdc);
        
        birthTime = block.timestamp;
        lastHeartbeat = block.timestamp;
        heartbeatNonce = 0;
        isAlive = true;

        // Transfer initial balance from orchestrator
        if (_initialBalance > 0) {
            bool success = usdc.transferFrom(_orchestrator, address(this), _initialBalance);
            if (!success) revert TransferFailed();
        }

        emit AgentBorn(address(this), _genome, birthTime);
    }

    // ============ Core Functions ============
    
    /**
     * @notice Record a heartbeat from the agent
     * @param _decisionHash Hash of the agent's decision
     * @param _arweaveTxId Arweave transaction ID storing the full decision data
     */
    function heartbeat(
        bytes32 _decisionHash,
        string calldata _arweaveTxId
    ) external override onlyOrchestrator onlyAlive returns (bool) {
        if (block.timestamp < lastHeartbeat + HEARTBEAT_INTERVAL) {
            revert HeartbeatTooFrequent();
        }

        heartbeatNonce++;
        lastHeartbeat = block.timestamp;
        lastDecisionHash = _decisionHash;

        // Store Arweave reference
        if (bytes(_arweaveTxId).length > 0) {
            bytes32 dataHash = keccak256(abi.encodePacked(_decisionHash, block.timestamp));
            arweaveRecords[_arweaveTxId] = dataHash;
            arweaveTxIds.push(_arweaveTxId);
            emit ArweaveRecordStored(_arweaveTxId, dataHash);
        }

        emit Heartbeat(heartbeatNonce, block.timestamp, _decisionHash);

        // Check if agent should die
        if (usdc.balanceOf(address(this)) < MIN_BALANCE) {
            _die();
        }

        return true;
    }

    /**
     * @notice Execute a decision from the agent
     * @param _decisionData Encoded decision data
     */
    function executeDecision(
        bytes calldata _decisionData
    ) external override onlyOrchestrator onlyAlive returns (bool) {
        uint256 decisionId = decisionCount++;
        bytes32 decisionHash = keccak256(_decisionData);
        
        decisions[decisionId] = Decision({
            id: decisionId,
            hash: decisionHash,
            timestamp: block.timestamp,
            executed: true,
            data: _decisionData
        });

        emit DecisionExecuted(decisionId, decisionHash, true);
        return true;
    }

    /**
     * @notice Deposit USDC into the agent
     * @param _amount Amount to deposit
     * @dev Can only be called before first heartbeat (initialization phase)
     */
    function deposit(uint256 _amount) external override {
        if (_amount == 0) revert InvalidAmount();
        if (heartbeatNonce > 0) revert AgentAlreadyInitialized();
        
        bool success = usdc.transferFrom(msg.sender, address(this), _amount);
        if (!success) revert TransferFailed();

        emit FundsDeposited(msg.sender, _amount);
    }

    /**
     * @notice Force the agent to die (when balance is too low)
     */
    function die() external override onlyOrchestrator onlyAlive {
        _die();
    }

    // ============ Internal Functions ============
    
    function _die() internal {
        isAlive = false;
        uint256 remainingBalance = usdc.balanceOf(address(this));
        bytes32 finalStateHash = keccak256(abi.encodePacked(
            genome,
            heartbeatNonce,
            lastDecisionHash
        ));

        emit AgentDied(block.timestamp, remainingBalance, finalStateHash);
    }

    // ============ View Functions ============
    
    function getState() external view override returns (AgentState memory) {
        return AgentState({
            genome: genome,
            birthTime: birthTime,
            lastHeartbeat: lastHeartbeat,
            heartbeatNonce: heartbeatNonce,
            isAlive: isAlive,
            balance: usdc.balanceOf(address(this)),
            lastDecisionHash: lastDecisionHash
        });
    }

    function getBalance() external view override returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function getArweaveRecords() external view returns (string[] memory) {
        return arweaveTxIds;
    }

    function getDecision(uint256 _decisionId) external view returns (Decision memory) {
        return decisions[_decisionId];
    }
}
