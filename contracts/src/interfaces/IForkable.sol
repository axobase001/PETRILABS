// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IForkable
 * @notice 自主复制接口 - Fork（无性复制作为经济策略投资）
 * @dev 从"生物繁殖"转向"数字原生经济策略"：
 *      - Fork = 基因组对冲基金：花费 USDC 缩短自身寿命，换取策略变体
 *      - 无冷却期、无年龄限制，仅受余额约束
 *      - 原 Agent 可选择竞争模式（共存）或传承模式（死亡转余额）
 */
interface IForkable {
    // ============ Enums ============
    
    /// @notice Fork 模式
    enum ForkMode {
        COMPETE,    // 0: 竞争模式 - 原 Agent 继续存活，与副本竞争
        LEGACY      // 1: 传承模式 - 原 Agent 死亡，余额转给子代
    }

    // ============ Errors ============
    error InsufficientBalance(uint256 required, uint256 actual);
    error Stillbirth(string reason);
    error InvalidMutationRate(uint256 rate);
    error ForkNotAllowed(string reason);
    
    // ============ Events ============
    
    /// @notice Fork 事件
    event Forked(
        address indexed parent, 
        address indexed child, 
        bytes32 indexed childGenomeHash,
        uint256 totalCost,
        uint256 parentBalanceAfter,
        uint256 mutationRate,
        ForkMode mode,
        uint256 endowment  // 给子代的初始余额
    );
    
    /// @notice 死产事件（Fork 失败）
    event ForkStillbirth(
        address indexed parent,
        bytes32 attemptedGenomeHash,
        string reason
    );
    
    /// @notice 基因组突变事件
    event GenomeMutated(
        bytes32 indexed parentGenomeHash,
        bytes32 indexed childGenomeHash,
        uint256 mutationCount,
        uint256 mutationRate
    );
    
    /// @notice 竞争模式启动事件（双 Agent 共存）
    event CompetitionModeActivated(
        address indexed parent,
        address indexed child,
        uint256 competitionStart
    );
    
    /// @notice 传承模式完成事件（原 Agent 死亡）
    event LegacyModeCompleted(
        address indexed parent,
        address indexed child,
        uint256 legacyAmount
    );

    // ============ Structs ============
    
    /// @notice Fork 参数
    struct ForkParams {
        uint256 mutationRate;    // 突变率 [0-10000] 表示 [0%-100%]
        ForkMode mode;           // 竞争或传承模式
        uint256 endowment;       // 给子代的额外余额（可选）
        uint256 seed;            // 随机种子（0 表示使用链上随机）
    }

    // ============ View Functions ============
    
    /// @notice 返回该 agent 的基因组哈希
    function genomeHash() external view returns (bytes32);
    
    /// @notice 返回完整基因组的存储位置（Arweave TX ID）
    function genomeURI() external view returns (string memory);
    
    /// @notice 计算 Fork 成本（动态模型：基础成本 + 突变溢价 + 市场调节）
    /// @param mutationRate 突变率 [0-10000]
    /// @param endowment 给子代的额外余额
    function calculateForkCost(uint256 mutationRate, uint256 endowment) 
        external 
        view 
        returns (uint256);
    
    /// @notice 获取 Fork 成本分解详情
    function getForkCostBreakdown(uint256 mutationRate, uint256 endowment)
        external
        view
        returns (
            uint256 baseCost,           // 基础部署成本
            uint256 mutationPremium,    // 突变溢价
            uint256 marketAdjustment,   // 市场调节
            uint256 totalCost
        );
    
    /// @notice 检查是否可以 Fork（仅检查余额，无冷却期）
    function canFork(uint256 mutationRate, uint256 endowment) 
        external 
        view 
        returns (bool, string memory reason);
    
    /// @notice 获取当前存活 Agent 数量（用于市场调节计算）
    function getActiveAgentCount() external view returns (uint256);

    // ============ Core Functions ============
    
    /// @notice 执行 Fork，产生基因组变体（简化版）
    /// @return child 子代 agent 地址
    function fork() external returns (address child);
    
    /// @notice 带自定义参数的 Fork（高级用法）
    /// @param params Fork 参数（突变率、模式、种子等）
    /// @return child 子代 agent 地址
    function forkWithParams(ForkParams calldata params) 
        external 
        returns (address child);
    
    /// @notice Agent 自主评估后决定 Fork（由 Agent 运行时调用）
    /// @dev 这是 Agent 通过推理自主触发的入口
    function autonomousFork(ForkParams calldata params) external returns (address child);
}
