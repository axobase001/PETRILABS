// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "./interfaces/IPetriAgentV2.sol";
import "./interfaces/IGenomeRegistry.sol";

/**
 * @title PetriAgentV2
 * @notice Enhanced AI agent with dynamic genome and epigenetic expression
 * @dev Integrates with GenomeRegistry for on-chain genetic storage
 */
contract PetriAgentV2 is IPetriAgentV2, Initializable {
    // ============ Constants ============
    uint256 public constant HEARTBEAT_INTERVAL = 6 hours;
    uint256 public constant MIN_BALANCE = 1e6; // 1 USDC (6 decimals)
    uint256 public constant METABOLIC_SCALE = 100000; // Scale factor for metabolic costs

    // ============ State Variables ============
    bytes32 public genomeHash;
    address public orchestrator;
    IERC20 public usdc;
    address public genomeRegistry;
    
    uint256 public birthTime;
    uint256 public lastHeartbeat;
    uint256 public heartbeatNonce;
    bool public isAlive;
    
    bytes32 public lastDecisionHash;
    mapping(uint256 => Decision) public decisions;
    uint256 public decisionCount;
    
    // Arweave records
    mapping(string => bytes32) public arweaveRecords;
    string[] public arweaveTxIds;
    
    // Gene expression cache (optional optimization)
    mapping(uint32 => uint256) public cachedExpression;
    uint256 public lastExpressionCacheUpdate;

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
        // Allow initialization for direct deployment
    }

    // ============ Initialization ============
    function initialize(
        bytes32 _genomeHash,
        address _orchestrator,
        address _usdc,
        address _genomeRegistry,
        uint256 _initialBalance
    ) external override initializer {
        if (_genomeHash == bytes32(0)) revert InvalidGenome();
        if (_orchestrator == address(0)) revert InvalidAmount();
        if (_usdc == address(0)) revert InvalidAmount();
        if (_genomeRegistry == address(0)) revert InvalidAmount();
        
        // Verify genome exists in registry
        (bool checkSuccess, bytes memory checkResult) = _genomeRegistry.staticcall(
            abi.encodeWithSignature("genomeExists(bytes32)", _genomeHash)
        );
        if (!checkSuccess || checkResult.length == 0 || !abi.decode(checkResult, (bool))) {
            revert GenomeNotFound();
        }

        genomeHash = _genomeHash;
        orchestrator = _orchestrator;
        usdc = IERC20(_usdc);
        genomeRegistry = _genomeRegistry;
        
        birthTime = block.timestamp;
        lastHeartbeat = block.timestamp;
        heartbeatNonce = 0;
        isAlive = true;

        // Transfer initial balance
        if (_initialBalance > 0) {
            bool success = usdc.transferFrom(_orchestrator, address(this), _initialBalance);
            if (!success) revert TransferFailed();
        }

        emit AgentBorn(address(this), _genomeHash, birthTime);
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

        // Calculate metabolic cost BEFORE updating lastHeartbeat
        uint256 metabolicCost = getMetabolicCost();
        uint256 daysSinceLastHeartbeat = (block.timestamp - lastHeartbeat) / 1 days;
        uint256 costSinceLastHeartbeat = metabolicCost * daysSinceLastHeartbeat / METABOLIC_SCALE;
        
        // Check if agent should die (metabolic cost depletes balance)
        if (usdc.balanceOf(address(this)) < MIN_BALANCE + costSinceLastHeartbeat) {
            _die("metabolic_exhaustion", "");
            return false;
        }

        heartbeatNonce++;
        lastHeartbeat = block.timestamp;
        lastDecisionHash = _decisionHash;

        // Store Arweave reference
        if (bytes(_arweaveTxId).length > 0) {
            bytes32 dataHash = keccak256(abi.encodePacked(_decisionHash, block.timestamp));
            arweaveRecords[_arweaveTxId] = dataHash;
            arweaveTxIds.push(_arweaveTxId);
        }

        emit Heartbeat(heartbeatNonce, block.timestamp, _decisionHash);

        return true;
    }

    /**
     * @notice Execute a decision from the agent
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
     */
    function deposit(uint256 _amount) external override onlyAlive {
        if (_amount == 0) revert InvalidAmount();
        
        bool success = usdc.transferFrom(msg.sender, address(this), _amount);
        if (!success) revert TransferFailed();

        emit FundsDeposited(msg.sender, _amount);
    }

    /**
     * @notice Force the agent to die
     */
    function die(string calldata arweaveTxId) external override onlyOrchestrator onlyAlive {
        _die("forced", arweaveTxId);
    }

    // ============ Genome Interaction ============
    
    /**
     * @notice Get effective expression of a gene
     * @param geneId The gene ID
     * @return expression The computed expression value
     */
    function getGeneExpression(uint32 geneId) external view override returns (uint256) {
        (bool success, bytes memory result) = genomeRegistry.staticcall(
            abi.encodeWithSignature("expressGene(bytes32,uint32)", genomeHash, geneId)
        );
        if (!success || result.length == 0) revert GenomeNotFound();
        return abi.decode(result, (uint256));
    }

    /**
     * @notice Get total metabolic cost per day
     */
    function getMetabolicCost() public view override returns (uint256) {
        (bool success, bytes memory result) = genomeRegistry.staticcall(
            abi.encodeWithSignature("calculateMetabolicCost(bytes32)", genomeHash)
        );
        if (!success || result.length == 0) revert GenomeNotFound();
        return abi.decode(result, (uint256));
    }

    /**
     * @notice Apply epigenetic mark to genome
     * @param mark The epigenetic mark to apply
     */
    function applyEpigeneticMark(IGenomeRegistry.EpigeneticMark calldata mark) 
        external 
        override 
        onlyOrchestrator 
        onlyAlive 
    {
        (bool success,) = genomeRegistry.call(
            abi.encodeWithSignature(
                "addEpigeneticMark(bytes32,(uint32,uint8,uint16,uint64,uint16,uint16))",
                genomeHash,
                mark
            )
        );
        if (!success) revert GenomeNotFound();
        
        emit EpigeneticChange(mark.targetGeneId, mark.modification, mark.strength);
    }

    // ============ Internal Functions ============
    
    function _die(string memory reason, string memory arweaveTxId) internal {
        isAlive = false;
        uint256 remainingBalance = usdc.balanceOf(address(this));
        bytes32 finalStateHash = keccak256(abi.encodePacked(
            genomeHash,
            heartbeatNonce,
            lastDecisionHash
        ));

        emit AgentDied(address(this), block.timestamp, reason, arweaveTxId, remainingBalance, finalStateHash);
    }

    // ============ View Functions ============
    
    function getState() external view override returns (AgentState memory) {
        return AgentState({
            genomeHash: genomeHash,
            birthTime: birthTime,
            lastHeartbeat: lastHeartbeat,
            heartbeatNonce: heartbeatNonce,
            isAlive: isAlive,
            balance: usdc.balanceOf(address(this)),
            lastDecisionHash: lastDecisionHash,
            totalMetabolicCost: getMetabolicCost()
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
