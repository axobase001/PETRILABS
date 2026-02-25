// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "./interfaces/IPetriAgentV2.sol";
import "./interfaces/IGenomeRegistry.sol";
import "./interfaces/IForkable.sol";
import "./interfaces/IMergeable.sol";

/**
 * @title PetriAgentV2
 * @notice Enhanced AI agent with dynamic genome and autonomous replication
 * @dev 
 *   从"生物模拟"到"数字原生经济策略"：
 *   - Agent 可以自主决定 Fork（策略对冲）或 Merge（能力并购）
 *   - 通过 custom action 触发，而非 Orchestrator 决定
 *   - 自主评估其他 Agent 的基因组价值
 */
contract PetriAgentV2 is IPetriAgentV2, Initializable {
    // ============ Constants ============
    uint256 public constant HEARTBEAT_INTERVAL = 6 hours;
    uint256 public constant MIN_BALANCE = 1e6; // 1 USDC (6 decimals)
    uint256 public constant METABOLIC_SCALE = 100000; // Scale factor for metabolic costs
    
    // Auto-epigenetic constants
    uint256 public constant POVERTY_THRESHOLD = 5 * 1e6; // 5 USDC
    uint256 public constant POVERTY_DAYS_TRIGGER = 3;      // 3 days of poverty triggers adaptation
    uint256 public constant ABUNDANCE_MULTIPLIER = 2;      // 2x initial deposit = abundance
    uint256 public constant EPIGENETIC_COOLDOWN = 1 days;  // Min time between auto marks
    
    // Fork 决策阈值
    uint256 public constant FORK_STRATEGY_THRESHOLD = 30 days; // 剩余寿命低于此值考虑 Fork
    uint256 public constant HIGH_MUTATION_RATE = 3000;         // 30% 用于高风险 Fork
    uint256 public constant LOW_MUTATION_RATE = 500;           // 5% 用于保守 Fork

    // ============ State Variables ============
    bytes32 public genomeHash;
    address public orchestrator;
    IERC20 public usdc;
    address public genomeRegistry;
    address public replicationManager; // 新增的复制管理合约
    
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
    
    // Auto-epigenetic state
    uint256 public povertyStreak;                          // Consecutive days in poverty
    uint256 public lastAutoEpigeneticTime;                 // Last auto mark timestamp
    uint256 public initialDeposit;                         // Initial USDC deposit for abundance calc
    
    // Replication state
    uint256 public forkCount;
    mapping(uint256 => address) public children;
    uint256[] public childIds;
    
    // 其他 Agent 评估缓存
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
        povertyStreak = 0;
        lastAutoEpigeneticTime = 0;
        initialDeposit = _initialBalance;
        forkCount = 0;

        // Transfer initial balance
        if (_initialBalance > 0) {
            bool success = usdc.transferFrom(_orchestrator, address(this), _initialBalance);
            if (!success) revert TransferFailed();
        }

        emit AgentBorn(address(this), _genomeHash, birthTime);
    }
    
    /**
     * @notice 设置 ReplicationManager 地址
     * @dev 由 Orchestrator 在部署后调用
     */
    function setReplicationManager(address _replicationManager) external onlyOrchestrator {
        replicationManager = _replicationManager;
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
        
        // Auto-epigenetic: Agent adapts to its own survival pressure
        _autoEpigeneticResponse();

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

    // ============ Autonomous Replication (New) ============
    
    /**
     * @notice Agent 自主评估并执行 Fork（策略对冲）
     * @dev 
     *   触发条件：Agent 通过分析自身状态决定：
     *   - 如果剩余寿命 < FORK_STRATEGY_THRESHOLD 且收入趋势下降 -> 高风险 Fork
     *   - 如果收入稳定但想探索新策略 -> 保守 Fork
     *   - 这是 Agent 通过 reasoning 自主触发的 custom action
     */
    function autonomousFork(uint256 mutationRate, IForkable.ForkMode mode) 
        external 
        onlyAlive 
        returns (address child) 
    {
        require(replicationManager != address(0), "ReplicationManager not set");
        require(msg.sender == orchestrator, "Only orchestrator can trigger");
        
        // 评估 Fork 策略
        (bool shouldFork, string memory reason) = _evaluateForkStrategy(mutationRate);
        if (!shouldFork) {
            revert(string(abi.encodePacked("Fork strategy rejected: ", reason)));
        }
        
        // 准备参数
        IForkable.ForkParams memory params = IForkable.ForkParams({
            mutationRate: mutationRate,
            mode: mode,
            endowment: 0,
            seed: uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender)))
        });
        
        // 授权 ReplicationManager 使用本合约的 USDC
        uint256 forkCost = _getForkCost(mutationRate, 0);
        usdc.approve(replicationManager, forkCost);
        
        // 调用 ReplicationManager 的自主 Fork
        child = IForkable(replicationManager).autonomousFork(params);
        
        if (child != address(0)) {
            forkCount++;
            children[forkCount] = child;
            childIds.push(forkCount);
        }
        
        return child;
    }
    
    /**
     * @notice Agent 自主评估其他 Agent 并执行 Merge（能力并购）
     * @dev
     *   触发条件：Agent 通过链上数据分析发现：
     *   - 目标 Agent 的特定基因与高收益相关
     *   - 目标基因与我当前基因组互补
     *   - 并购成本 < 预期收益
     */
    function autonomousMerge(
        address target,
        uint32[] calldata genesWanted,
        uint256 valueAssessment
    ) external onlyAlive returns (uint256 proposalId) {
        require(replicationManager != address(0), "ReplicationManager not set");
        require(msg.sender == orchestrator, "Only orchestrator can trigger");
        require(target != address(this), "Cannot merge with self");
        
        // 评估 Merge 策略
        (bool shouldMerge, string memory reason) = _evaluateMergeStrategy(target, genesWanted, valueAssessment);
        if (!shouldMerge) {
            revert(string(abi.encodePacked("Merge strategy rejected: ", reason)));
        }
        
        // 计算并批准押金
        uint256 mergeCost = _getMergeCost(genesWanted);
        usdc.approve(replicationManager, mergeCost);
        
        // 发起 Merge 提议
        proposalId = IMergeable(replicationManager).autonomousMerge(
            target,
            genesWanted,
            valueAssessment
        );
        
        // 缓存评估
        assessedAgentValue[target] = valueAssessment;
        assessmentTime[target] = block.timestamp;
        
        return proposalId;
    }
    
    /**
     * @notice 评估 Fork 策略（内部决策算法）
     * @return shouldFork 是否应该 Fork
     * @return reason 决策理由
     */
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
        
        // 计算剩余寿命（天）
        uint256 remainingLifespan = (balance * METABOLIC_SCALE) / metabolicCost;
        
        // 获取 Fork 成本
        uint256 forkCost = _getForkCost(mutationRate, 0);
        
        // 策略 1: 剩余寿命不足，进行风险对冲
        if (remainingLifespan < FORK_STRATEGY_THRESHOLD / 1 days) {
            // 检查 Fork 后是否还能存活一段时间
            if (balance > forkCost * 2) {
                return (true, "HEDGE: Low remaining lifespan");
            }
            return (false, "Cannot afford hedge");
        }
        
        // 策略 2: 资源充足，探索新策略
        if (balance > initialDeposit * 3 && remainingLifespan > 60) {
            return (true, "EXPLORE: Abundant resources");
        }
        
        // 策略 3: 保守策略 - 不 Fork
        return (false, "Not strategic to fork now");
    }
    
    /**
     * @notice 评估 Merge 策略（内部决策算法）
     */
    function _evaluateMergeStrategy(
        address target,
        uint32[] calldata genesWanted,
        uint256 valueAssessment
    ) internal view returns (bool shouldMerge, string memory reason) {
        // 基础检查
        if (genesWanted.length == 0) {
            return (false, "No genes selected");
        }
        
        // 获取目标余额作为收入效率代理
        uint256 targetBalance = usdc.balanceOf(target);
        if (targetBalance == 0) {
            return (false, "Target has no balance");
        }
        
        // 计算 Merge 成本
        uint256 mergeCost = _getMergeCost(genesWanted);
        uint256 myBalance = usdc.balanceOf(address(this));
        
        // 成本效益分析
        if (mergeCost > myBalance / 3) {
            return (false, "Merge too expensive");
        }
        
        // 价值评估验证
        // 简单模型：目标余额 / 基因数 = 每基因价值
        uint256 perGeneValue = targetBalance / genesWanted.length;
        if (valueAssessment < perGeneValue / 2) {
            return (false, "Undervalued assessment");
        }
        
        // 检查是否最近评估过
        if (block.timestamp - assessmentTime[target] < 7 days) {
            // 已经有近期评估，使用缓存值对比
            if (assessedAgentValue[target] < valueAssessment) {
                return (true, "Updated higher value assessment");
            }
        }
        
        return (true, "Strategic merge opportunity");
    }
    
    /**
     * @notice 获取 Fork 成本（内部调用）
     */
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
    
    /**
     * @notice 获取 Merge 成本（内部调用）
     */
    function _getMergeCost(uint32[] calldata genes) 
        internal 
        view 
        returns (uint256) 
    {
        if (replicationManager == address(0)) return 0;
        
        (bool success, bytes memory result) = replicationManager.staticcall(
            abi.encodeWithSignature(
                "calculateMergeCost(uint32[])",
                genes
            )
        );
        
        if (success && result.length >= 32) {
            return abi.decode(result, (uint256));
        }
        return 0;
    }
    
    /**
     * @notice 外部查询：Agent 评估 Fork 策略（供运行时调用）
     */
    function evaluateForkStrategy(uint256 mutationRate)
        external
        view
        returns (
            bool shouldFork,
            string memory reason,
            uint256 estimatedCost,
            uint256 remainingLifespan
        )
    {
        (shouldFork, reason) = _evaluateForkStrategy(mutationRate);
        estimatedCost = _getForkCost(mutationRate, 0);
        
        uint256 balance = usdc.balanceOf(address(this));
        uint256 metabolicCost = getMetabolicCost();
        remainingLifespan = metabolicCost > 0 ? (balance * METABOLIC_SCALE) / metabolicCost : 0;
        
        return (shouldFork, reason, estimatedCost, remainingLifespan);
    }
    
    /**
     * @notice 外部查询：Agent 评估 Merge 策略（供运行时调用）
     */
    function evaluateMergeStrategy(
        address target,
        uint32[] calldata genesWanted
    )
        external
        view
        returns (
            bool shouldMerge,
            string memory reason,
            uint256 estimatedCost,
            uint256 targetValue
        )
    {
        // 基于目标余额进行简单价值评估
        targetValue = usdc.balanceOf(target);
        
        (shouldMerge, reason) = _evaluateMergeStrategy(target, genesWanted, targetValue);
        estimatedCost = _getMergeCost(genesWanted);
        
        return (shouldMerge, reason, estimatedCost, targetValue);
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
     * @notice Apply epigenetic mark to genome (Orchestrator only)
     * @param mark The epigenetic mark to apply
     */
    function applyEpigeneticMark(IGenomeRegistry.EpigeneticMark calldata mark) 
        external 
        override 
        onlyOrchestrator 
        onlyAlive 
    {
        _applyEpigeneticMarkInternal(mark);
    }
    
    /**
     * @notice Auto-apply epigenetic mark (internal, triggered by Agent's own survival state)
     * @param geneId Target gene ID (e.g., 0x0101 for A01)
     * @param modification 0=upregulate, 1=downregulate, 2=silence
     */
    function autoEpigeneticMark(uint32 geneId, uint8 modification) external onlyOrchestrator onlyAlive {
        // Cooldown check to prevent gas spam
        if (block.timestamp < lastAutoEpigeneticTime + EPIGENETIC_COOLDOWN) {
            revert HeartbeatTooFrequent(); // Reuse error
        }
        
        IGenomeRegistry.EpigeneticMark memory mark = IGenomeRegistry.EpigeneticMark({
            targetGeneId: geneId,
            modification: modification, // 0=upregulate, 1=downregulate, 2=silence
            strength: 500,              // 50% strength
            timestamp: uint64(block.timestamp),
            heritability: 300,          // 30% chance to inherit
            decayPerGen: 100            // 10% decay per generation
        });
        
        _applyEpigeneticMarkInternal(mark);
        lastAutoEpigeneticTime = block.timestamp;
    }

    // ============ Internal Functions ============
    
    /**
     * @notice Auto-epigenetic response based on survival pressure
     * @dev Called during heartbeat. Agent adapts its own gene expression based on:
     *      - Metabolic stress (poverty) -> upregulate efficiency genes
     *      - Resource abundance -> upregulate exploration genes
     */
    function _autoEpigeneticResponse() internal {
        uint256 balance = usdc.balanceOf(address(this));
        
        // Pressure Mode 1: Metabolic poverty (连续贫困)
        if (balance < POVERTY_THRESHOLD) {
            povertyStreak++;
            if (povertyStreak >= POVERTY_DAYS_TRIGGER) {
                // Auto upregulate metabolism efficiency gene (A01 = 0x0101)
                _autoApplyEpigeneticMark(0x0101, 0, "metabolic_stress", povertyStreak);
                povertyStreak = 0; // Reset after adaptation
            }
        } else {
            povertyStreak = 0; // Reset when out of poverty
        }
        
        // Pressure Mode 2: Resource abundance (正向强化)
        if (initialDeposit > 0 && balance > initialDeposit * ABUNDANCE_MULTIPLIER) {
            // Auto upregulate exploration gene (B01 = 0x0201)
            _autoApplyEpigeneticMark(0x0201, 0, "resource_abundance", 0);
        }
    }
    
    /**
     * @notice Internal function to apply auto-epigenetic mark
     */
    function _autoApplyEpigeneticMark(
        uint32 geneId, 
        uint8 modification, 
        string memory trigger, 
        uint256 duration
    ) internal {
        // Skip if cooldown not met
        if (block.timestamp < lastAutoEpigeneticTime + EPIGENETIC_COOLDOWN) {
            return;
        }
        
        IGenomeRegistry.EpigeneticMark memory mark = IGenomeRegistry.EpigeneticMark({
            targetGeneId: geneId,
            modification: modification,
            strength: 500,              // 50% strength
            timestamp: uint64(block.timestamp),
            heritability: 300,          // 30% chance to inherit
            decayPerGen: 100            // 10% decay per generation
        });
        
        _applyEpigeneticMarkInternal(mark);
        lastAutoEpigeneticTime = block.timestamp;
        
        emit AutoEpigeneticTriggered(geneId, modification, trigger, duration);
    }
    
    /**
     * @notice Internal epigenetic mark application
     */
    function _applyEpigeneticMarkInternal(IGenomeRegistry.EpigeneticMark memory mark) internal {
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
    
    /**
     * @notice 获取所有子代
     */
    function getChildren() external view returns (address[] memory) {
        address[] memory result = new address[](childIds.length);
        for (uint i = 0; i < childIds.length; i++) {
            result[i] = children[childIds[i]];
        }
        return result;
    }
    
    /**
     * @notice 获取 Fork 统计
     */
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
}
