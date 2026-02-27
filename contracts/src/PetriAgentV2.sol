// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
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
contract PetriAgentV2 is IPetriAgentV2, Initializable, OwnableUpgradeable {
    // ============ Constants ============
    /// @notice 最快心跳间隔（防 spam）
    uint256 public constant MIN_HEARTBEAT_INTERVAL = 6 hours;
    
    /// @notice 最长允许间隔，超过此时间任何人可宣告死亡
    uint256 public constant MAX_HEARTBEAT_INTERVAL = 7 days;
    
    uint256 public constant MIN_BALANCE = 1e6; // 1 USDC (6 decimals)
    uint256 public constant METABOLIC_SCALE = 100000;
    
    // Fork decision thresholds
    uint256 public constant FORK_STRATEGY_THRESHOLD = 30 days;
    uint256 public constant HIGH_MUTATION_RATE = 3000;
    uint256 public constant LOW_MUTATION_RATE = 500;

    // ============ Events ============
    event SweepFailed(address indexed agent, address indexed recipient, uint256 amount);
    event AbandonedDeclared(address indexed agent, uint256 timeSinceLastHeartbeat);
    
    /// @notice 遗产转账失败事件（不阻塞死亡流程）
    event LegacyTransferFailed(
        address indexed agent,
        address indexed intendedRecipient,
        uint256 amount
    );
    
    /// @notice 墓碑铸造失败事件（不阻塞死亡流程）
    event TombstoneMintFailed(address indexed agent, address indexed creator);
    
    /// @notice 分红支付事件
    /// @param creator 创造者地址
    /// @param amount 分红金额
    /// @param triggerAmount 触发此次分红的充值金额
    event DividendPaid(
        address indexed creator, 
        uint256 amount, 
        uint256 triggerAmount
    );
    
    /// @notice 收入记录事件
    /// @param from 资金来源地址
    /// @param amount 金额
    /// @param incomeType 收入类型："initial", "external", "earned"
    event IncomeReceived(
        address indexed from, 
        uint256 amount, 
        string incomeType
    );

    // ============ Core Dependencies ============
    bytes32 public genomeHash;
    address public orchestrator;
    address public agentEOA;        // Agent's EOA wallet for autonomous heartbeat
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
    
    // ============ Creator Dividend ============
    /// @notice 创造者地址（部署者）
    address public creator;
    
    /// @notice 创造者分红比例（基点，0-5000，即 0%-50%）
    /// @dev 初始化时设置，永久锁定不可更改
    uint256 public creatorShareBps;
    
    /// @notice 累计已分红金额（追踪用途）
    uint256 public totalCreatorDividends;
    
    /// @notice 初始存款金额（用于区分初始存款 vs 后续充值）
    uint256 public initialDeposit;
    
    /// @notice 累计外部资金（非初始存款）
    uint256 public totalExternalFunding;
    
    /// @notice 累计自赚收入总额（通过技能/交易赚取）
    uint256 public totalEarnedIncome;
    
    /// @notice 收入追踪已初始化（防止重复记录初始存款）
    bool private initialDepositRecorded;
    
    // ============ Modifiers ============
    modifier onlyOrchestrator() {
        if (msg.sender != orchestrator) revert NotOrchestrator();
        _;
    }

    modifier onlyAgentOrOrchestrator() {
        if (msg.sender != agentEOA && msg.sender != orchestrator) {
            revert NotAgentOrOrchestrator();
        }
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
        uint256 _initialBalance,
        address _agentEOA,
        address _creator,
        uint256 _creatorShareBps
    ) external initializer {
        if (_genomeHash == bytes32(0)) revert InvalidGenome();
        if (_orchestrator == address(0)) revert InvalidAmount();
        if (_usdc == address(0)) revert InvalidAmount();
        if (_agentEOA == address(0)) revert InvalidAgentEOA();
        if (_creator == address(0)) revert InvalidAmount();
        if (_creatorShareBps > 5000) revert InvalidAmount(); // Max 50%
        
        __Ownable_init(_orchestrator);

        genomeHash = _genomeHash;
        orchestrator = _orchestrator;
        agentEOA = _agentEOA;
        creator = _creator;
        creatorShareBps = _creatorShareBps;
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
            
            // 记录初始存款（用于后续区分初始存款 vs 外部充值）
            initialDeposit = _initialBalance;
        }

        emit AgentBorn(address(this), _genomeHash, _agentEOA, birthTime);
    }

    // ============ Core Functions ============
    
    function heartbeat(
        bytes32 _decisionHash,
        string calldata _arweaveTxId
    ) external override onlyAgentOrOrchestrator onlyAlive returns (bool) {
        // 检查是否过于频繁（防 spam），但允许在 [6小时, 7天] 弹性范围内自主决定
        if (block.timestamp < lastHeartbeat + MIN_HEARTBEAT_INTERVAL) {
            revert HeartbeatTooFrequent(block.timestamp - lastHeartbeat);
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
        onlyAgentOrOrchestrator 
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
        
        // 判断是否为初始存款（从未记录过且总外部和赚取为 0）
        if (!initialDepositRecorded && totalExternalFunding == 0 && totalEarnedIncome == 0) {
            // 初始存款不计入分红（避免创造者自充自提套利）
            initialDeposit += _amount;
            initialDepositRecorded = true;
            emit IncomeReceived(msg.sender, _amount, "initial");
        } else {
            // 后续充值：记录为外部资金并触发分红
            totalExternalFunding += _amount;
            emit IncomeReceived(msg.sender, _amount, "external");
            _processIncomingFunds(_amount);
        }

        emit FundsDeposited(msg.sender, _amount);
    }
    
    /// @notice 处理 incoming 资金的分红逻辑
    /// @param incomingAmount 本次充值的金额
    /// @dev 仅在 agent 存活且余额充足时执行，采用"生存优先"策略
    function _processIncomingFunds(uint256 incomingAmount) internal {
        // 如果比例为 0 或无创造者，跳过
        if (creatorShareBps == 0 || creator == address(0)) return;
        
        uint256 currentBalance = usdc.balanceOf(address(this));
        uint256 metabolicCost = getMetabolicCost();
        
        // 计算生存底线：至少保留 1 天的代谢成本
        // metabolicCost 是每日成本（已考虑精度）
        uint256 survivalFloor = metabolicCost > 0 ? metabolicCost : MIN_BALANCE;
        
        // 如果当前余额连 survival floor 都不到，不分红（保命优先）
        if (currentBalance <= survivalFloor) return;
        
        // 可分配金额 = 超出生存线的部分，但不超过本次充值金额（防止重复分历史资金）
        uint256 excess = currentBalance - survivalFloor;
        uint256 distributable = excess < incomingAmount ? excess : incomingAmount;
        
        // 计算创造者份额
        uint256 creatorShare = (distributable * creatorShareBps) / 10000;
        
        // 执行转账并记录
        if (creatorShare > 0 && creatorShare <= usdc.balanceOf(address(this))) {
            bool success = usdc.transfer(creator, creatorShare);
            if (success) {
                totalCreatorDividends += creatorShare;
                emit DividendPaid(creator, creatorShare, incomingAmount);
            }
            // 如果转账失败，静默跳过（不 revert，保证充值成功）
        }
    }
    
    /// @notice 记录 agent 自主赚取的收入
    /// @dev 由 agent runtime 或技能合约调用，当 agent 通过交易/服务赚取收入时
    /// @param _amount 赚取的金额（USDC）
    function recordEarnedIncome(uint256 _amount) external onlyAgentOrOrchestrator {
        if (_amount == 0) revert InvalidAmount();
        
        totalEarnedIncome += _amount;
        emit IncomeReceived(address(this), _amount, "earned");
        
        // 自赚收入也触发分红（创造者从 agent 劳动中获益）
        _processIncomingFunds(_amount);
    }
    
    /// @notice 计算生存依赖度（外部资金占比）
    /// @return dependencyBps 依赖度，单位：基点（0-10000）
    /// @dev 0 = 完全自产自足（100% earned），10000 = 完全依赖外部（0% earned）
    /// 公式：(initialDeposit + totalExternalFunding) / totalIncome * 10000
    function getSurvivalDependency() external view returns (uint256 dependencyBps) {
        uint256 totalIncome = initialDeposit + totalExternalFunding + totalEarnedIncome;
        
        if (totalIncome == 0) {
            return 10000; // 默认 100% 依赖（无收入时）
        }
        
        uint256 externalIncome = initialDeposit + totalExternalFunding;
        return (externalIncome * 10000) / totalIncome;
    }
    
    /// @notice 获取收入结构详情（方便 Dashboard 展示）
    /// @return initial 初始存款
    /// @return external 外部充值累计
    /// @return earned 自赚收入累计
    /// @return total 总收入
    /// @return dependencyBps 生存依赖度（基点）
    function getIncomeStats() external view returns (
        uint256 initial,
        uint256 external,
        uint256 earned,
        uint256 total,
        uint256 dependencyBps
    ) {
        initial = initialDeposit;
        external = totalExternalFunding;
        earned = totalEarnedIncome;
        total = initial + external + earned;
        dependencyBps = getSurvivalDependency();
    }

    function die(string calldata arweaveTxId) external override onlyOrchestrator onlyAlive {
        _die("forced", arweaveTxId);
    }

    /// @notice 任何人都可以在 agent 超过 7 天未心跳时宣告其死亡
    /// @dev 用于清理僵尸 agent，防止占用网络资源
    function declareAbandoned() external {
        if (!isAlive) revert AgentAlreadyDead();
        
        uint256 timeSinceLastHeartbeat = block.timestamp - lastHeartbeat;
        if (timeSinceLastHeartbeat <= MAX_HEARTBEAT_INTERVAL) {
            revert AgentStillAlive(MAX_HEARTBEAT_INTERVAL - timeSinceLastHeartbeat);
        }
        
        emit AbandonedDeclared(address(this), timeSinceLastHeartbeat);
        
        // 调用内部死亡逻辑，记录遗弃原因
        _die("ABANDONED", "");
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
    
    /// @notice 内部死亡处理函数
    /// @dev 执行顺序：1.标记死亡 2.铸造墓碑 3.退还遗产
    /// @dev 失败不阻塞：无论转账或铸造失败，agent 必须完成死亡
    function _die(string memory reason, string memory arweaveTxId) internal {
        require(isAlive, "Already dead");
        
        // 1. 首先标记死亡（防重入）
        isAlive = false;
        
        // 获取最终状态
        uint256 finalBalance = usdc.balanceOf(address(this));
        uint256 lifespan = block.number - birthBlock;
        
        // 2. 铸造墓碑（必须在资金转移前，确保记录死亡时状态）
        uint256 tombstoneId = _mintTombstone(reason, arweaveTxId, finalBalance, lifespan);
        
        // 3. 遗产处理：100% 剩余 USDC 退还给创造者（creator）
        if (finalBalance > 0 && creator != address(0)) {
            try usdc.transfer(creator, finalBalance) returns (bool success) {
                if (!success) {
                    emit LegacyTransferFailed(address(this), creator, finalBalance);
                }
            } catch {
                emit LegacyTransferFailed(address(this), creator, finalBalance);
            }
        }
        
        emit AgentDied(
            address(this),
            block.timestamp,
            reason,
            arweaveTxId,
            finalBalance,
            bytes32(tombstoneId),
            creator
        );
    }
    
    /// @notice 内部函数：铸造死亡墓碑 NFT
    /// @dev 使用 try-catch 确保铸造失败不阻塞死亡流程
    function _mintTombstone(
        string memory reason,
        string memory arweaveTxId,
        uint256 finalBalance,
        uint256 lifespan
    ) internal returns (uint256 tombstoneId) {
        // 如果墓碑合约未设置，跳过铸造但继续死亡流程
        if (address(tombstone) == address(0)) {
            return 0;
        }
        
        ITombstone.DeathRecordInput memory record = ITombstone.DeathRecordInput({
            genomeHash: genomeHash,
            lifespan: lifespan,
            arweaveId: arweaveTxId,
            totalValue: finalBalance,
            offspringCount: childIds.length,
            causeOfDeath: reason
        });
        
        try tombstone.mint(address(this), creator, record) returns (uint256 id) {
            return id;
        } catch {
            // 墓碑铸造失败不应阻塞死亡
            emit TombstoneMintFailed(address(this), creator);
            return 0;
        }
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
