// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPetriAgentV2.sol";
import "./interfaces/IGenomeRegistry.sol";
import "./interfaces/IForkable.sol";
import "./interfaces/IMergeable.sol";
import "./interfaces/IEpigenetics.sol";
import "./interfaces/IAgentBank.sol";
import "./interfaces/ITombstone.sol";

/**
 * @title PetriAgentV2
 * @notice Enhanced AI agent with dynamic genome and autonomous replication
 * @dev Refactored: Epigenetics logic separated to Epigenetics.sol
 * @dev Integrated: AgentBank for cross-chain, Tombstone for death recording
 */
contract PetriAgentV2 is IPetriAgentV2, Initializable, Ownable {
    // ============ Constants ============
    uint256 public constant HEARTBEAT_INTERVAL = 6 hours;
    uint256 public constant MIN_BALANCE = 1e6; // 1 USDC (6 decimals)
    uint256 public constant METABOLIC_SCALE = 100000;
    
    // Fork decision thresholds
    uint256 public constant FORK_STRATEGY_THRESHOLD = 30 days;
    uint256 public constant HIGH_MUTATION_RATE = 3000;
    uint256 public constant LOW_MUTATION_RATE = 500;

    // ============ Core Dependencies ============
    bytes32 public genomeHash;
    address public orchestrator;
    IERC20 public usdc;
    IGenomeRegistry public genomeRegistry;
    address public replicationManager;
    IEpigenetics public epigenetics;
    IAgentBank public agentBank;
    ITombstone public tombstone;
    
    // ============ State Variables ============
    uint256 public birthTime;
    uint256 public lastHeartbeat;
    uint256 public heartbeatNonce;
    bool public isAlive;
    uint256 public birthBlock;
    
    bytes32 public lastDecisionHash;
    mapping(uint256 => Decision) public decisions;
    uint256 public decisionCount;
    
    // Arweave records
    mapping(string => bytes32) public arweaveRecords;
    string[] public arweaveTxIds;
    
    // Gene expression cache
    mapping(uint32 => uint256) public cachedExpression;
    uint256 public lastExpressionCacheUpdate;
    
    // Replication state
    uint256 public forkCount;
    mapping(uint256 => address) public children;
    uint256[] public childIds;
    
    // External agent assessment cache
    mapping(address => uint256) public assessedAgentValue;
    mapping(address => uint256) public assessmentTime;
    
    // ============ Modifiers ============
    modifier onlyOrchestrator() {
        if (msg.sender != orchestrator) revert NotOrchestrator();
        _;
    }

    modifier onlyAlive() {
        if (!isAlive) revert AgentDead();
        _;
    }
    
    modifier onlyAuthorized() {
        require(
            msg.sender == orchestrator || msg.sender == address(this),
            "Not authorized"
        );
        _;
    }

    // ============ Constructor ============
    constructor() {
        _disableInitializers();
    }

    // ============ Initialization ============
    function initialize(
        bytes32 _genomeHash,
        address _orchestrator,
        address _usdc,
        address _genomeRegistry,
        address _replicationManager,
        address _epigenetics,
        address _agentBank,
        address _tombstone,
        uint256 _initialBalance
    ) external initializer {
        if (_genomeHash == bytes32(0)) revert InvalidGenome();
        if (_orchestrator == address(0)) revert InvalidAmount();
        if (_usdc == address(0)) revert InvalidAmount();
        
        __Ownable_init(_orchestrator);

        genomeHash = _genomeHash;
        orchestrator = _orchestrator;
        usdc = IERC20(_usdc);
        genomeRegistry = IGenomeRegistry(_genomeRegistry);
        replicationManager = _replicationManager;
        epigenetics = IEpigenetics(_epigenetics);
        agentBank = IAgentBank(_agentBank);
        tombstone = ITombstone(_tombstone);
        
        birthTime = block.timestamp;
        birthBlock = block.number;
        lastHeartbeat = block.timestamp;
        heartbeatNonce = 0;
        isAlive = true;
        forkCount = 0;

        // Initialize epigenetics state
        epigenetics.initializeAgent(address(this), _initialBalance);

        // Transfer initial balance
        if (_initialBalance > 0) {
            bool success = usdc.transferFrom(_orchestrator, address(this), _initialBalance);
            if (!success) revert TransferFailed();
        }

        emit AgentBorn(address(this), _genomeHash, birthTime);
    }

    // ============ Core Functions ============
    
    function heartbeat(
        bytes32 _decisionHash,
        string calldata _arweaveTxId
    ) external override onlyOrchestrator onlyAlive returns (bool) {
        if (block.timestamp < lastHeartbeat + HEARTBEAT_INTERVAL) {
            revert HeartbeatTooFrequent();
        }

        // Calculate metabolic cost
        uint256 metabolicCost = getMetabolicCost();
        
        // Process epigenetic stress response (delegated to Epigenetics.sol)
        bool shouldSuppress = epigenetics.processStressResponse(
            address(this),
            usdc.balanceOf(address(this)),
            metabolicCost
        );
        
        if (shouldSuppress) {
            _suppressNonEssentialGenes();
        }
        
        uint256 daysSinceLastHeartbeat = (block.timestamp - lastHeartbeat) / 1 days;
        uint256 costSinceLastHeartbeat = metabolicCost * daysSinceLastHeartbeat / METABOLIC_SCALE;
        
        // Check death condition using cross-chain balance
        uint256 totalBalance = agentBank.getTotalCrossChainBalance(address(this));
        if (totalBalance < MIN_BALANCE + costSinceLastHeartbeat) {
            _die("metabolic_exhaustion", "");
            return false;
        }

        heartbeatNonce++;
        lastHeartbeat = block.timestamp;
        lastDecisionHash = _decisionHash;

        if (bytes(_arweaveTxId).length > 0) {
            bytes32 dataHash = keccak256(abi.encodePacked(_decisionHash, block.timestamp));
            arweaveRecords[_arweaveTxId] = dataHash;
            arweaveTxIds.push(_arweaveTxId);
        }

        emit Heartbeat(heartbeatNonce, block.timestamp, _decisionHash);
        return true;
    }

    function executeDecision(bytes calldata _decisionData) 
        external 
        override 
        onlyOrchestrator 
        onlyAlive 
        returns (bool) 
    {
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

    function deposit(uint256 _amount) external override onlyAlive {
        if (_amount == 0) revert InvalidAmount();
        
        bool success = usdc.transferFrom(msg.sender, address(this), _amount);
        if (!success) revert TransferFailed();

        emit FundsDeposited(msg.sender, _amount);
    }

    function die(string calldata arweaveTxId) external override onlyOrchestrator onlyAlive {
        _die("forced", arweaveTxId);
    }

    // ============ Autonomous Replication ============
    
    function autonomousFork(uint256 mutationRate, IForkable.ForkMode mode) 
        external 
        onlyAlive 
        returns (address child) 
    {
        require(replicationManager != address(0), "ReplicationManager not set");
        require(msg.sender == orchestrator, "Only orchestrator can trigger");
        
        (bool shouldFork, string memory reason) = _evaluateForkStrategy(mutationRate);
        if (!shouldFork) {
            revert(string(abi.encodePacked("Fork strategy rejected: ", reason)));
        }
        
        IForkable.ForkParams memory params = IForkable.ForkParams({
            mutationRate: mutationRate,
            mode: mode,
            endowment: 0,
            seed: uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender)))
        });
        
        uint256 forkCost = _getForkCost(mutationRate, 0);
        usdc.approve(replicationManager, forkCost);
        
        child = IForkable(replicationManager).autonomousFork(params);
        
        if (child != address(0)) {
            forkCount++;
            children[forkCount] = child;
            childIds.push(forkCount);
        }
        
        return child;
    }
    
    function autonomousMerge(
        address target,
        uint32[] calldata genesWanted,
        uint256 valueAssessment
    ) external onlyAlive returns (uint256 proposalId) {
        require(replicationManager != address(0), "ReplicationManager not set");
        require(msg.sender == orchestrator, "Only orchestrator can trigger");
        require(target != address(this), "Cannot merge with self");
        
        (bool shouldMerge, string memory reason) = _evaluateMergeStrategy(target, genesWanted, valueAssessment);
        if (!shouldMerge) {
            revert(string(abi.encodePacked("Merge strategy rejected: ", reason)));
        }
        
        uint256 mergeCost = _getMergeCost(genesWanted);
        usdc.approve(replicationManager, mergeCost);
        
        proposalId = IMergeable(replicationManager).autonomousMerge(
            target,
            genesWanted,
            valueAssessment
        );
        
        assessedAgentValue[target] = valueAssessment;
        assessmentTime[target] = block.timestamp;
        
        return proposalId;
    }
    
    // ============ Internal Strategy Functions ============
    
    function _evaluateForkStrategy(uint256 mutationRate) 
        internal 
        view 
        returns (bool shouldFork, string memory reason) 
    {
        uint256 balance = usdc.balanceOf(address(this));
        uint256 metabolicCost = getMetabolicCost();
        
        if (metabolicCost == 0) {
            return (false, "Zero metabolic cost");
        }
        
        uint256 remainingLifespan = (balance * METABOLIC_SCALE) / metabolicCost;
        uint256 forkCost = _getForkCost(mutationRate, 0);
        
        if (remainingLifespan < FORK_STRATEGY_THRESHOLD / 1 days) {
            if (balance > forkCost * 2) {
                return (true, "HEDGE: Low remaining lifespan");
            }
            return (false, "Cannot afford hedge");
        }
        
        if (balance > forkCost * 3) {
            return (true, "EXPLORE: Abundant resources");
        }
        
        return (false, "Not strategic to fork now");
    }
    
    function _evaluateMergeStrategy(
        address target,
        uint32[] calldata genesWanted,
        uint256 valueAssessment
    ) internal view returns (bool shouldMerge, string memory reason) {
        if (genesWanted.length == 0) {
            return (false, "No genes selected");
        }
        
        uint256 targetBalance = usdc.balanceOf(target);
        if (targetBalance == 0) {
            return (false, "Target has no balance");
        }
        
        uint256 mergeCost = _getMergeCost(genesWanted);
        uint256 myBalance = usdc.balanceOf(address(this));
        
        if (mergeCost > myBalance / 3) {
            return (false, "Merge too expensive");
        }
        
        uint256 perGeneValue = targetBalance / genesWanted.length;
        if (valueAssessment < perGeneValue / 2) {
            return (false, "Undervalued assessment");
        }
        
        if (block.timestamp - assessmentTime[target] < 7 days) {
            if (assessedAgentValue[target] < valueAssessment) {
                return (true, "Updated higher value assessment");
            }
        }
        
        return (true, "Strategic merge opportunity");
    }
    
    function _getForkCost(uint256 mutationRate, uint256 endowment) 
        internal 
        view 
        returns (uint256) 
    {
        if (replicationManager == address(0)) return 0;
        
        (bool success, bytes memory result) = replicationManager.staticcall(
            abi.encodeWithSignature(
                "calculateForkCost(uint256,uint256)",
                mutationRate,
                endowment
            )
        );
        
        if (success && result.length >= 32) {
            return abi.decode(result, (uint256));
        }
        return 0;
    }
    
    function _getMergeCost(uint32[] calldata genes) 
        internal 
        view 
        returns (uint256) 
    {
        if (replicationManager == address(0)) return 0;
        
        (bool success, bytes memory result) = replicationManager.staticcall(
            abi.encodeWithSignature("calculateMergeCost(uint32[])", genes)
        );
        
        if (success && result.length >= 32) {
            return abi.decode(result, (uint256));
        }
        return 0;
    }
    
    function _suppressNonEssentialGenes() internal {
        // 抑制非必需基因的逻辑
        // 由 Epigenetics 合约触发的极端压力响应
    }

    // ============ Death & Tombstone ============
    
    function _die(string memory reason, string memory arweaveTxId) internal {
        require(isAlive, "Already dead");
        isAlive = false;
        
        // Query cross-chain total balance
        uint256 finalBalance = agentBank.getTotalCrossChainBalance(address(this));
        
        // Mint Tombstone NFT
        ITombstone.DeathRecordInput memory record = ITombstone.DeathRecordInput({
            genomeHash: genomeHash,
            lifespan: block.number - birthBlock,
            arweaveId: arweaveTxId,
            totalValue: finalBalance,
            offspringCount: childIds.length,
            causeOfDeath: reason
        });
        
        uint256 tombstoneId = tombstone.mint(address(this), record);
        
        // Sweep balance
        agentBank.sweepOnDeath(address(this), owner());
        
        emit AgentDied(address(this), block.timestamp, reason, arweaveTxId, finalBalance, bytes32(tombstoneId));
    }

    // ============ Genome Interaction ============
    
    function getGeneExpression(uint32 geneId) external view override returns (uint256) {
        (bool success, bytes memory result) = address(genomeRegistry).staticcall(
            abi.encodeWithSignature("expressGene(bytes32,uint32)", genomeHash, geneId)
        );
        if (!success || result.length == 0) revert GenomeNotFound();
        return abi.decode(result, (uint256));
    }

    function getMetabolicCost() public view override returns (uint256) {
        (bool success, bytes memory result) = address(genomeRegistry).staticcall(
            abi.encodeWithSignature("calculateMetabolicCost(bytes32)", genomeHash)
        );
        if (!success || result.length == 0) revert GenomeNotFound();
        return abi.decode(result, (uint256));
    }
    
    // Epigenetic marks are now applied through Epigenetics contract
    function applyEpigeneticMark(IEpigenetics.EpigeneticMark calldata mark) 
        external 
        onlyOrchestrator 
        onlyAlive 
    {
        epigenetics.applyEpigeneticMark(address(this), mark);
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
    
    function getCrossChainBalance() external view returns (uint256) {
        return agentBank.getTotalCrossChainBalance(address(this));
    }

    function getArweaveRecords() external view returns (string[] memory) {
        return arweaveTxIds;
    }

    function getDecision(uint256 _decisionId) external view returns (Decision memory) {
        return decisions[_decisionId];
    }
    
    function getChildren() external view returns (address[] memory) {
        address[] memory result = new address[](childIds.length);
        for (uint i = 0; i < childIds.length; i++) {
            result[i] = children[childIds[i]];
        }
        return result;
    }
    
    function getForkStats() external view returns (
        uint256 totalForks,
        uint256 activeChildren,
        uint256 remainingLifespan
    ) {
        totalForks = forkCount;
        activeChildren = childIds.length;
        
        uint256 balance = usdc.balanceOf(address(this));
        uint256 metabolicCost = getMetabolicCost();
        remainingLifespan = metabolicCost > 0 ? (balance * METABOLIC_SCALE) / metabolicCost : 0;
    }
    
    function getEpigeneticState() external view returns (IEpigenetics.AgentEpigeneticState memory) {
        return epigenetics.getState(address(this));
    }
    
    function hasTombstone() external view returns (bool) {
        return tombstone.hasTombstone(address(this));
    }
}
