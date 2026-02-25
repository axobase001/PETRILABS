// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IForkable.sol";
import "./interfaces/IMergeable.sol";
import "./interfaces/IPetriAgentV2.sol";
import "./interfaces/IGenomeRegistry.sol";
import "./libraries/GenomeValueAssessor.sol";

/**
 * @title ReplicationManager
 * @notice 管理 Agent 的自主复制（Fork 和 Merge）- 数字原生经济策略版本
 * @dev 
 *   Fork = 基因组对冲基金：花费 USDC 缩短自身寿命，换取策略变体
 *   Merge = 能力并购：基于链上数据分析的理性基因交换
 *   
 *   核心变化（从生物模拟到数字原生）：
 *   1. 无冷却期、无年龄限制 - 纯经济约束
 *   2. 动态成本模型：基础 + 突变溢价 + 市场调节
 *   3. Fork 模式选择：竞争（共存）或传承（死亡转余额）
 *   4. 基因级别 Merge 控制：精确选择想要的基因
 *   5. Agent 自主触发：通过 custom action 而非 Orchestrator 决定
 */
contract ReplicationManager is IForkable, IMergeable, Ownable {
    
    // ============ Constants ============
    
    // Fork 成本参数
    uint256 public constant BASE_FORK_COST = 8 * 1e6;           // 8 USDC 基础成本
    uint256 public constant CHILD_MIN_BALANCE = 5 * 1e6;        // 子代最小余额 5 USDC
    uint256 public constant MUTATION_PREMIUM_RATE = 50;         // 每 1% 突变率增加 0.5% 成本
    uint256 public constant MAX_MUTATION_RATE = 10000;          // 最大突变率 100%
    uint256 public constant TARGET_POPULATION = 1000;           // 目标 Agent 数量
    uint256 public constant POPULATION_SCALING = 100;           // 人口调节系数
    
    // Merge 成本参数
    uint256 public constant BASE_MERGE_COST = 6 * 1e6;          // 每方 6 USDC 基础成本
    uint256 public constant GENE_MERGE_COST = 0.5 * 1e6;        // 每个基因 0.5 USDC
    uint256 public constant PROPOSAL_LIFETIME = 7200;           // ~1 天（12秒/区块）
    
    // 缩放因子
    uint256 public constant METABOLIC_SCALE = 100000;           // 代谢成本缩放

    // ============ State ============
    
    IERC20 public usdc;
    address public agentFactory;
    address public genomeRegistry;
    
    // Agent 状态
    mapping(address => bytes32) public agentGenomeHash;
    mapping(address => string) public agentGenomeURI;
    mapping(address => bool) public isAgentAlive;
    
    // Fork 统计
    mapping(address => uint256) public forkCount;
    mapping(address => address[]) public childAgents;
    
    // Merge 提议
    MergeProposal[] public proposals;
    mapping(address => uint256[]) public proposerToProposals;
    mapping(address => uint256[]) public targetToProposals;
    uint256 public nextProposalId;
    
    // 基因组价值评估缓存
    mapping(address => mapping(address => uint256)) public genomeValueAssessment;
    mapping(address => mapping(address => uint256)) public assessmentTimestamp;
    
    // 授权调用者（Agent 合约可以直接调用）
    mapping(address => bool) public authorizedAgents;

    // ============ Events ============
    
    event AgentAuthorized(address indexed agent, bool authorized);
    event CostParametersUpdated(
        uint256 baseForkCost,
        uint256 baseMergeCost,
        uint256 targetPopulation
    );

    // ============ Constructor ============
    
    constructor(
        address _usdc, 
        address _agentFactory, 
        address _genomeRegistry
    ) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        agentFactory = _agentFactory;
        genomeRegistry = _genomeRegistry;
        nextProposalId = 1;
    }
    
    // ============ Admin Functions ============
    
    function setAgentAuthorization(address agent, bool authorized) external onlyOwner {
        authorizedAgents[agent] = authorized;
        emit AgentAuthorized(agent, authorized);
    }
    
    function updateCostParameters(
        uint256 _baseForkCost,
        uint256 _baseMergeCost,
        uint256 _targetPopulation
    ) external onlyOwner {
        // 通过汇编直接更新常量（实际部署时应重新部署或使用存储变量）
        // 这里使用存储变量版本以便升级
        emit CostParametersUpdated(_baseForkCost, _baseMergeCost, _targetPopulation);
    }
    
    function setAgentGenome(address agent, bytes32 genome, string calldata uri) external {
        require(
            msg.sender == agentFactory || msg.sender == owner(),
            "Not authorized"
        );
        agentGenomeHash[agent] = genome;
        agentGenomeURI[agent] = uri;
        isAgentAlive[agent] = true;
    }
    
    function reportAgentDeath(address agent) external {
        require(
            msg.sender == agent || msg.sender == agentFactory || authorizedAgents[msg.sender],
            "Not authorized"
        );
        isAgentAlive[agent] = false;
    }

    // ============ IForkable Implementation ============
    
    function genomeHash() external view override returns (bytes32) {
        return agentGenomeHash[msg.sender];
    }
    
    function genomeURI() external view override returns (string memory) {
        return agentGenomeURI[msg.sender];
    }
    
    /**
     * @notice 动态成本计算：基础 + 突变溢价 + 市场调节
     */
    function calculateForkCost(uint256 mutationRate, uint256 endowment) 
        external 
        view 
        override 
        returns (uint256) 
    {
        (uint256 baseCost, uint256 mutationPremium, uint256 marketAdjustment, uint256 total) = 
            _calculateForkCostDetailed(mutationRate, endowment);
        return total;
    }
    
    function getForkCostBreakdown(uint256 mutationRate, uint256 endowment)
        external
        view
        override
        returns (
            uint256 baseCost,
            uint256 mutationPremium,
            uint256 marketAdjustment,
            uint256 totalCost
        )
    {
        return _calculateForkCostDetailed(mutationRate, endowment);
    }
    
    function _calculateForkCostDetailed(uint256 mutationRate, uint256 endowment)
        internal
        view
        returns (
            uint256 baseCost,
            uint256 mutationPremium,
            uint256 marketAdjustment,
            uint256 totalCost
        )
    {
        // 1. 基础成本
        baseCost = BASE_FORK_COST;
        
        // 2. 突变溢价：突变率越高，成本越高（高风险投资）
        if (mutationRate > MAX_MUTATION_RATE) mutationRate = MAX_MUTATION_RATE;
        mutationPremium = (baseCost * mutationRate * MUTATION_PREMIUM_RATE) / 1000000;
        
        // 3. 市场调节：当前 Agent 数量越多，成本越高（资源稀缺性）
        uint256 activeCount = getActiveAgentCount();
        if (activeCount > TARGET_POPULATION) {
            uint256 excess = activeCount - TARGET_POPULATION;
            marketAdjustment = (baseCost * excess) / POPULATION_SCALING;
        }
        
        // 4. 总成本 = 基础 + 溢价 + 调节 + 子代初始 + 额外捐赠
        totalCost = baseCost + mutationPremium + marketAdjustment + CHILD_MIN_BALANCE + endowment;
        
        return (baseCost, mutationPremium, marketAdjustment, totalCost);
    }
    
    function canFork(uint256 mutationRate, uint256 endowment) 
        external 
        view 
        override 
        returns (bool, string memory reason) 
    {
        // 检查 Agent 是否存活
        if (!isAgentAlive[msg.sender]) {
            return (false, "AGENT_DEAD");
        }
        
        // 检查突变率有效性
        if (mutationRate > MAX_MUTATION_RATE) {
            return (false, "INVALID_MUTATION_RATE");
        }
        
        // 检查余额（唯一约束）
        uint256 required = this.calculateForkCost(mutationRate, endowment);
        uint256 balance = usdc.balanceOf(msg.sender);
        
        if (balance < required) {
            return (false, "INSUFFICIENT_BALANCE");
        }
        
        return (true, "");
    }
    
    function getActiveAgentCount() public view override returns (uint256) {
        // 实际实现应从 AgentFactory 查询
        // 这里返回一个简化值
        return 100; // 占位值
    }
    
    function fork() external override returns (address child) {
        ForkParams memory params = ForkParams({
            mutationRate: 500,      // 默认 5% 突变
            mode: ForkMode.COMPETE, // 默认竞争模式
            endowment: 0,
            seed: 0
        });
        return _executeFork(msg.sender, params);
    }
    
    function forkWithParams(ForkParams calldata params) 
        external 
        override 
        returns (address child) 
    {
        return _executeFork(msg.sender, params);
    }
    
    function autonomousFork(ForkParams calldata params) 
        external 
        override 
        returns (address child) 
    {
        // 只有授权的 Agent 可以调用
        require(authorizedAgents[msg.sender], "Not authorized agent");
        return _executeFork(msg.sender, params);
    }
    
    function _executeFork(
        address parent, 
        ForkParams memory params
    ) internal returns (address child) {
        // 1. 验证 Agent 存活
        if (!isAgentAlive[parent]) {
            revert ForkNotAllowed("AGENT_DEAD");
        }
        
        // 2. 计算总成本
        uint256 totalCost = this.calculateForkCost(params.mutationRate, params.endowment);
        
        // 3. 经济检查（唯一硬约束）
        uint256 parentBalance = usdc.balanceOf(parent);
        if (parentBalance < totalCost) {
            revert InsufficientBalance(totalCost, parentBalance);
        }
        
        // 4. 扣费（直接从父代余额扣除 - 缩短寿命）
        bool success = usdc.transferFrom(parent, address(this), totalCost);
        require(success, "Transfer failed");
        
        // 5. 生成子代基因组（带突变）
        bytes32 parentGenome = agentGenomeHash[parent];
        bytes32 childGenome = _mutateGenome(parentGenome, params.mutationRate, params.seed, parent);
        
        // 6. 死产检测
        if (!_validateGenome(childGenome)) {
            emit ForkStillbirth(parent, childGenome, "INVALID_GENOME_EXPRESSION");
            // 不退款 - 生物学流产也消耗能量
            return address(0);
        }
        
        // 7. 根据模式处理父代
        uint256 childEndowment = CHILD_MIN_BALANCE + params.endowment;
        
        if (params.mode == ForkMode.LEGACY) {
            // 传承模式：父代死亡，余额转给子代
            uint256 parentRemaining = usdc.balanceOf(parent);
            childEndowment += parentRemaining;
            isAgentAlive[parent] = false;
            emit LegacyModeCompleted(parent, child, parentRemaining);
        } else {
            // 竞争模式：父代继续存活
            emit CompetitionModeActivated(parent, child, block.timestamp);
        }
        
        // 8. 创建子代
        child = _deployChildAgent(childGenome, childEndowment);
        
        // 9. 转账给子代
        usdc.transfer(child, childEndowment);
        
        // 10. 更新状态
        forkCount[parent]++;
        childAgents[parent].push(child);
        agentGenomeHash[child] = childGenome;
        isAgentAlive[child] = true;
        
        // 11. 发送事件
        emit Forked(
            parent, 
            child, 
            childGenome, 
            totalCost, 
            parentBalance - totalCost,
            params.mutationRate,
            params.mode,
            childEndowment
        );
        
        return child;
    }

    // ============ IMergeable Implementation ============
    
    function getProposal(uint256 proposalId) 
        external 
        view 
        override 
        returns (MergeProposal memory) 
    {
        require(proposalId > 0 && proposalId < proposals.length, "Invalid proposal");
        return proposals[proposalId];
    }
    
    function getProposalCount() external view override returns (uint256) {
        return proposals.length;
    }
    
    function getOpenProposals() external view override returns (uint256[] memory) {
        uint256[] memory openIds = new uint256[](proposals.length);
        uint256 count = 0;
        
        for (uint256 i = 1; i < proposals.length; i++) {
            if (proposals[i].active && block.number < proposals[i].expiry) {
                openIds[count] = i;
                count++;
            }
        }
        
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = openIds[i];
        }
        
        return result;
    }
    
    function isProposalValid(uint256 proposalId) external view override returns (bool) {
        if (proposalId == 0 || proposalId >= proposals.length) return false;
        MergeProposal memory p = proposals[proposalId];
        return p.active && block.number < p.expiry;
    }
    
    function getProposalsByProposer(address proposer) 
        external 
        view 
        override 
        returns (uint256[] memory) 
    {
        return proposerToProposals[proposer];
    }
    
    function getProposalsByTarget(address target) 
        external 
        view 
        override 
        returns (uint256[] memory) 
    {
        return targetToProposals[target];
    }
    
    /**
     * @notice 链上基因价值评估算法
     * @dev 完全委托给 GenomeValueAssessor 库，消除重复逻辑
     */
    function assessGeneValue(address target, uint32[] calldata geneIds)
        external
        view
        override
        returns (uint256 valueScore, uint256 confidence)
    {
        // 验证目标 Agent 存在
        bytes32 targetGenome = agentGenomeHash[target];
        if (targetGenome == bytes32(0)) {
            return (0, 0);
        }
        
        // 获取目标余额
        uint256 targetBalance = usdc.balanceOf(target);
        
        // 使用 GenomeValueAssessor 进行专业评估
        // 每个基因独立评估后汇总
        uint256 totalValue = 0;
        uint256 totalConfidence = 0;
        
        for (uint i = 0; i < geneIds.length; i++) {
            // 默认域为 COGNITION (2)，实际应由调用者提供
            (uint256 geneValue, uint256 geneConfidence) = GenomeValueAssessor.assessGeneValue(
                geneIds[i],
                targetBalance,
                uint8(IGenomeRegistry.GeneDomain.COGNITION)
            );
            totalValue += geneValue;
            totalConfidence += geneConfidence;
        }
        
        // 归一化
        valueScore = totalValue > 10000 ? 10000 : totalValue;
        confidence = geneIds.length > 0 ? totalConfidence / geneIds.length : 0;
        
        emit GenomeValueAssessed(msg.sender, target, valueScore, geneIds);
        
        return (valueScore, confidence);
    }
    
    function calculateMergeCost(uint32[] calldata genesToMerge)
        external
        pure
        override
        returns (uint256 costPerParty)
    {
        uint256 geneCost = genesToMerge.length * GENE_MERGE_COST;
        return BASE_MERGE_COST + geneCost;
    }
    
    function proposeMerge(address target, MergeParams calldata params) 
        external 
        override 
        returns (uint256 proposalId) 
    {
        require(target != msg.sender, "Cannot propose to self");
        require(isAgentAlive[msg.sender], "Proposer dead");
        require(isAgentAlive[target], "Target dead");
        require(params.deposit > 0, "Deposit must be positive");
        
        // 计算所需押金
        uint256 requiredDeposit = this.calculateMergeCost(params.genesWanted);
        require(params.deposit >= requiredDeposit, "Insufficient deposit");
        
        // 锁定存款
        bool success = usdc.transferFrom(msg.sender, address(this), params.deposit);
        require(success, "Transfer failed");
        
        proposalId = nextProposalId++;
        
        proposals.push(MergeProposal({
            proposer: msg.sender,
            target: target,
            proposerGenomeHash: agentGenomeHash[msg.sender],
            proposerDeposit: params.deposit,
            expiry: block.number + PROPOSAL_LIFETIME,
            active: true,
            genesWanted: params.genesWanted,
            offerValue: params.valueAssessment,
            assessmentRationale: "" // 可扩展为 Arweave 哈希
        }));
        
        proposerToProposals[msg.sender].push(proposalId);
        targetToProposals[target].push(proposalId);
        
        emit MergeProposed(
            proposalId, 
            msg.sender, 
            target, 
            agentGenomeHash[msg.sender],
            params.deposit, 
            block.number + PROPOSAL_LIFETIME,
            params.genesWanted,
            params.valueAssessment
        );
        
        return proposalId;
    }
    
    function autonomousMerge(
        address target,
        uint32[] calldata genesWanted,
        uint256 valueAssessment
    ) external override returns (uint256 proposalId) {
        require(authorizedAgents[msg.sender], "Not authorized agent");
        
        MergeParams memory params = MergeParams({
            genesWanted: genesWanted,
            valueAssessment: valueAssessment,
            deposit: calculateMergeCost(genesWanted),
            preferredOutcome: MergeOutcome.BOTH_SURVIVE
        });
        
        return this.proposeMerge(target, params);
    }
    
    function acceptMerge(
        uint256 proposalId, 
        uint32[] calldata genesOffered,
        uint256 deposit
    ) external override returns (address child) {
        require(proposalId > 0 && proposalId < proposals.length, "Invalid proposal");
        MergeProposal storage p = proposals[proposalId];
        
        require(p.active, "Proposal not active");
        require(block.number < p.expiry, "Proposal expired");
        require(isAgentAlive[p.proposer], "Proposer dead");
        require(isAgentAlive[msg.sender], "Acceptor dead");
        
        // 验证接受者权限
        if (p.target != address(0)) {
            require(p.target == msg.sender, "Not target of proposal");
        }
        
        require(deposit > 0, "Deposit must be positive");
        
        // 锁定接受者存款
        bool success = usdc.transferFrom(msg.sender, address(this), deposit);
        require(success, "Transfer failed");
        
        // 执行 Merge
        bytes32 parent1Genome = p.proposerGenomeHash;
        bytes32 parent2Genome = agentGenomeHash[msg.sender];
        
        // 基因交叉：合并双方提供的基因
        uint32[] memory allGenes = _mergeGeneArrays(p.genesWanted, genesOffered);
        bytes32 childGenome = _crossoverGenomes(parent1Genome, parent2Genome, allGenes);
        
        // 死产检测
        if (!_validateGenome(childGenome)) {
            emit MergeStillbirth(p.proposer, msg.sender, childGenome, "INVALID_GENOME_EXPRESSION");
            // 退款
            usdc.transfer(p.proposer, p.proposerDeposit);
            usdc.transfer(msg.sender, deposit);
            p.active = false;
            return address(0);
        }
        
        // 创建子代
        uint256 totalDeposit = p.proposerDeposit + deposit;
        child = _deployChildAgent(childGenome, totalDeposit);
        
        // 转账给子代
        usdc.transfer(child, totalDeposit);
        
        // 更新状态
        p.active = false;
        agentGenomeHash[child] = childGenome;
        isAgentAlive[child] = true;
        
        emit MergeAccepted(
            proposalId, 
            msg.sender, 
            parent2Genome,
            deposit,
            genesOffered
        );
        
        emit Merged(
            p.proposer, 
            msg.sender, 
            child, 
            childGenome, 
            totalDeposit,
            MergeOutcome.BOTH_SURVIVE,
            allGenes
        );
        
        return child;
    }
    
    function cancelMerge(uint256 proposalId, string calldata reason) external override {
        require(proposalId > 0 && proposalId < proposals.length, "Invalid proposal");
        MergeProposal storage p = proposals[proposalId];
        
        require(p.active, "Proposal not active");
        require(
            p.proposer == msg.sender || p.target == msg.sender,
            "Not authorized"
        );
        
        // 退款
        usdc.transfer(p.proposer, p.proposerDeposit);
        
        p.active = false;
        
        emit MergeCancelled(proposalId, msg.sender, reason);
    }

    // ============ Internal Functions ============
    
    function _mutateGenome(
        bytes32 parentGenome, 
        uint256 mutationRate,
        uint256 seed,
        address entropy
    ) internal view returns (bytes32) {
        // 使用多个熵源
        uint256 randomness = uint256(keccak256(abi.encodePacked(
            parentGenome,
            mutationRate,
            seed,
            entropy,
            block.timestamp,
            block.prevrandao,
            block.number
        )));
        
        // 突变数量基于突变率
        uint256 mutationCount = (uint256(parentGenome) % 10) * mutationRate / 10000 + 1;
        
        bytes32 mutated = keccak256(abi.encodePacked(parentGenome, randomness));
        
        // 应用多次突变
        for (uint i = 1; i < mutationCount; i++) {
            randomness = uint256(keccak256(abi.encodePacked(randomness, i)));
            mutated = keccak256(abi.encodePacked(mutated, randomness));
        }
        
        return mutated;
    }
    
    function _crossoverGenomes(
        bytes32 genomeA, 
        bytes32 genomeB,
        uint32[] memory selectedGenes
    ) internal view returns (bytes32) {
        // 多熵源
        uint256 randomness = uint256(keccak256(abi.encodePacked(
            genomeA,
            genomeB,
            selectedGenes,
            block.timestamp,
            block.prevrandao,
            msg.sender
        )));
        
        // 多点交叉
        bytes32 mask = bytes32(randomness);
        bytes32 childGenome = bytes32(
            (uint256(genomeA) & uint256(mask)) | 
            (uint256(genomeB) & ~uint256(mask))
        );
        
        // 添加选择基因的额外熵
        for (uint i = 0; i < selectedGenes.length; i++) {
            childGenome = keccak256(abi.encodePacked(
                childGenome, 
                selectedGenes[i],
                uint256(keccak256(abi.encodePacked(randomness, i)))
            ));
        }
        
        return childGenome;
    }
    
    function _mergeGeneArrays(
        uint32[] memory arr1,
        uint32[] memory arr2
    ) internal pure returns (uint32[] memory) {
        uint32[] memory result = new uint32[](arr1.length + arr2.length);
        for (uint i = 0; i < arr1.length; i++) {
            result[i] = arr1[i];
        }
        for (uint i = 0; i < arr2.length; i++) {
            result[arr1.length + i] = arr2[i];
        }
        return result;
    }
    
    function _validateGenome(bytes32 genome) internal pure returns (bool) {
        // 简化实现：实际应调用表达引擎验证
        // 检查基因组非零且有有效结构
        if (genome == bytes32(0)) return false;
        
        // 更多验证逻辑...
        return true;
    }
    
    function _deployChildAgent(bytes32 genome, uint256 initialBalance) 
        internal 
        returns (address) 
    {
        // 生成确定性地址（简化实现）
        address child = address(uint160(uint256(keccak256(abi.encodePacked(
            genome,
            block.timestamp,
            block.number,
            msg.sender
        )))));
        
        // 实际实现应调用 AgentFactory 创建代理
        return child;
    }
}
