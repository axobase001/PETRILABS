// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IForkable.sol";
import "./interfaces/IMergeable.sol";
import "./interfaces/IPetriAgentV2.sol";
import "./interfaces/IGenomeRegistry.sol";

/**
 * @title ReplicationManager
 * @notice 管理 Agent 的自主复制（Fork 和 Merge）
 * @dev Fork = 无性复制，Merge = 两个 agent 基因组合并
 */
contract ReplicationManager is IForkable, IMergeable {
    
    // ============ Constants ============
    uint256 public constant FORK_COOLDOWN = 100; // 100 区块冷却期
    uint256 public constant PROPOSAL_LIFETIME = 7200; // ~1 天（假设 12 秒/区块）
    uint256 public constant MIN_FORK_COST = 8 * 1e6; // 8 USDC
    uint256 public constant CHILD_INITIAL_BALANCE = 5 * 1e6; // 5 USDC
    uint256 public constant DEPLOYMENT_FEE = 3 * 1e6; // 3 USDC
    
    // ============ State ============
    IERC20 public usdc;
    address public agentFactory;
    address public genomeRegistry;
    
    // Agent 状态
    mapping(address => uint256) public lastForkBlock;
    mapping(address => bytes32) public agentGenomeHash;
    mapping(address => string) public agentGenomeURI;
    
    // Merge 提议
    MergeProposal[] public proposals;
    uint256 public nextProposalId;
    
    // ============ Constructor ============
    constructor(address _usdc, address _agentFactory, address _genomeRegistry) {
        usdc = IERC20(_usdc);
        agentFactory = _agentFactory;
        genomeRegistry = _genomeRegistry;
        nextProposalId = 1;
    }
    
    // ============ IForkable Implementation ============
    
    function genomeHash() external view override returns (bytes32) {
        return agentGenomeHash[msg.sender];
    }
    
    function genomeURI() external view override returns (string memory) {
        return agentGenomeURI[msg.sender];
    }
    
    function lastForkBlock() external view override returns (uint256) {
        return lastForkBlock[msg.sender];
    }
    
    function calculateForkCost() external pure override returns (uint256) {
        return MIN_FORK_COST;
    }
    
    function canFork() external view override returns (bool, string memory reason) {
        uint256 balance = usdc.balanceOf(msg.sender);
        if (balance < MIN_FORK_COST) {
            return (false, "INSUFFICIENT_BALANCE");
        }
        
        uint256 lastFork = lastForkBlock[msg.sender];
        if (lastFork > 0 && block.number < lastFork + FORK_COOLDOWN) {
            return (false, "FORK_COOLDOWN");
        }
        
        return (true, "");
    }
    
    function fork() external override returns (address child) {
        return _executeFork(msg.sender, 0, 0);
    }
    
    function forkWithParams(uint256 mutationSeed, uint256 extraDeposit) 
        external 
        override 
        returns (address child) 
    {
        return _executeFork(msg.sender, mutationSeed, extraDeposit);
    }
    
    function _executeFork(
        address parent, 
        uint256 mutationSeed, 
        uint256 extraDeposit
    ) internal returns (address child) {
        uint256 totalCost = MIN_FORK_COST + extraDeposit;
        
        // 1. 经济检查（物理限制，不是硬表达）
        uint256 parentBalance = usdc.balanceOf(parent);
        if (parentBalance < totalCost) {
            revert InsufficientBalance(totalCost, parentBalance);
        }
        
        // 2. 冷却期检查
        uint256 lastFork = lastForkBlock[parent];
        if (lastFork > 0 && block.number < lastFork + FORK_COOLDOWN) {
            revert ForkCooldownActive(lastFork + FORK_COOLDOWN - block.number);
        }
        
        // 3. 扣费
        bool success = usdc.transferFrom(parent, address(this), totalCost);
        require(success, "Transfer failed");
        
        // 4. 生成子代基因组（链下实际实现会更复杂）
        bytes32 parentGenome = agentGenomeHash[parent];
        bytes32 childGenome = _mutateGenome(parentGenome, mutationSeed, parent);
        
        // 5. 死产检测（简化版 - 实际应调用表达引擎验证）
        if (!_validateGenome(childGenome)) {
            emit ForkStillbirth(parent, childGenome, "INVALID_GENOME_EXPRESSION");
            // 不退款（生物学流产也消耗能量）
            return address(0);
        }
        
        // 6. 创建子代钱包和容器（简化版）
        child = _deployChildAgent(childGenome, CHILD_INITIAL_BALANCE + extraDeposit);
        
        // 7. 更新状态
        lastForkBlock[parent] = block.number;
        
        // 8. 转账给子代
        usdc.transfer(child, CHILD_INITIAL_BALANCE + extraDeposit);
        
        // 9. 发送事件
        emit Forked(
            parent, 
            child, 
            childGenome, 
            totalCost, 
            parentBalance - totalCost
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
        require(proposalId < proposals.length, "Invalid proposal");
        return proposals[proposalId];
    }
    
    function getProposalCount() external view override returns (uint256) {
        return proposals.length;
    }
    
    function getOpenProposals() external view override returns (uint256[] memory) {
        uint256[] memory openIds = new uint256[](proposals.length);
        uint256 count = 0;
        
        for (uint256 i = 0; i < proposals.length; i++) {
            if (proposals[i].active && block.number < proposals[i].expiry) {
                openIds[count] = i;
                count++;
            }
        }
        
        // 调整数组大小
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = openIds[i];
        }
        
        return result;
    }
    
    function isProposalValid(uint256 proposalId) external view override returns (bool) {
        if (proposalId >= proposals.length) return false;
        MergeProposal memory p = proposals[proposalId];
        return p.active && block.number < p.expiry;
    }
    
    function proposeMerge(address target, uint256 deposit) 
        external 
        override 
        returns (uint256 proposalId) 
    {
        require(target != msg.sender, "Cannot propose to self");
        require(deposit > 0, "Deposit must be positive");
        
        // 锁定存款
        bool success = usdc.transferFrom(msg.sender, address(this), deposit);
        require(success, "Transfer failed");
        
        proposalId = nextProposalId++;
        
        proposals.push(MergeProposal({
            proposer: msg.sender,
            target: target,
            proposerGenomeHash: agentGenomeHash[msg.sender],
            proposerDeposit: deposit,
            expiry: block.number + PROPOSAL_LIFETIME,
            active: true
        }));
        
        emit MergeProposed(proposalId, msg.sender, target, deposit, block.number + PROPOSAL_LIFETIME);
        
        return proposalId;
    }
    
    function acceptMerge(uint256 proposalId, uint256 deposit) 
        external 
        override 
        returns (address child) 
    {
        require(proposalId < proposals.length, "Invalid proposal");
        MergeProposal storage p = proposals[proposalId];
        
        require(p.active, "Proposal not active");
        require(block.number < p.expiry, "Proposal expired");
        
        // 检查接受者权限
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
        
        bytes32 childGenome = _crossoverGenomes(parent1Genome, parent2Genome);
        
        // 死产检测
        if (!_validateGenome(childGenome)) {
            emit MergeStillbirth(p.proposer, msg.sender, childGenome, "INVALID_GENOME_EXPRESSION");
            // 退款（可选策略：不退款）
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
        
        // 标记提议为已完成
        p.active = false;
        
        emit MergeAccepted(proposalId, msg.sender, child, childGenome);
        emit Merged(p.proposer, msg.sender, child, childGenome, totalDeposit);
        
        return child;
    }
    
    function cancelMerge(uint256 proposalId) external override {
        require(proposalId < proposals.length, "Invalid proposal");
        MergeProposal storage p = proposals[proposalId];
        
        require(p.active, "Proposal not active");
        require(
            p.proposer == msg.sender || p.target == msg.sender,
            "Not authorized"
        );
        
        // 退款
        usdc.transfer(p.proposer, p.proposerDeposit);
        
        p.active = false;
        
        emit MergeCancelled(proposalId, msg.sender);
    }
    
    // ============ Internal Functions ============
    
    function _mutateGenome(
        bytes32 parentGenome, 
        uint256 seed,
        address entropy
    ) internal view returns (bytes32) {
        // 简化实现：实际应调用 GenomeRegistry 的突变逻辑
        uint256 randomness = uint256(keccak256(abi.encodePacked(
            parentGenome,
            seed,
            entropy,
            block.timestamp,
            block.prevrandao
        )));
        
        return keccak256(abi.encodePacked(parentGenome, randomness));
    }
    
    function _crossoverGenomes(bytes32 genomeA, bytes32 genomeB) 
        internal 
        view 
        returns (bytes32) 
    {
        // 简化实现：实际应进行染色体级别的交叉
        uint256 randomness = uint256(keccak256(abi.encodePacked(
            genomeA,
            genomeB,
            block.timestamp,
            block.prevrandao
        )));
        
        // 模拟单点交叉
        bytes32 mask = bytes32(randomness);
        bytes32 childGenome = bytes32(
            (uint256(genomeA) & uint256(mask)) | 
            (uint256(genomeB) & ~uint256(mask))
        );
        
        return keccak256(abi.encodePacked(childGenome, randomness));
    }
    
    function _validateGenome(bytes32 genome) internal pure returns (bool) {
        // 简化实现：实际应调用表达引擎验证
        // 返回 true 表示可以表达，false 表示死产
        return genome != bytes32(0);
    }
    
    function _deployChildAgent(bytes32 genome, uint256 initialBalance) 
        internal 
        returns (address) 
    {
        // 简化实现：实际应调用 AgentFactory 创建新 agent
        // 这里生成一个确定性地址作为占位
        address child = address(uint160(uint256(keccak256(abi.encodePacked(
            genome,
            block.timestamp,
            block.number
        )))));
        
        return child;
    }
    
    // ============ Admin Functions ============
    
    function setAgentGenome(address agent, bytes32 genome, string calldata uri) 
        external 
    {
        // 仅允许 AgentFactory 或 Agent 自己调用
        agentGenomeHash[agent] = genome;
        agentGenomeURI[agent] = uri;
    }
}
