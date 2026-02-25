// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IForkable
 * @notice 自主复制接口 - Fork（无性复制）
 * @dev 任何实现此接口的链上实体都可以参与 Petrilabs 进化生态
 */
interface IForkable {
    // ============ Errors ============
    error InsufficientBalance(uint256 required, uint256 actual);
    error ForkCooldownActive(uint256 remainingBlocks);
    error Stillbirth(string reason);
    
    // ============ Events ============
    /// @notice Fork 事件
    event Forked(
        address indexed parent, 
        address indexed child, 
        bytes32 indexed childGenomeHash,
        uint256 cost,
        uint256 parentBalanceAfter
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
        uint256 mutationCount
    );

    // ============ View Functions ============
    
    /// @notice 返回该 agent 的基因组哈希
    function genomeHash() external view returns (bytes32);
    
    /// @notice 返回完整基因组的存储位置（Arweave TX ID）
    function genomeURI() external view returns (string memory);
    
    /// @notice 返回上次 Fork 的区块号
    function lastForkBlock() external view returns (uint256);
    
    /// @notice 计算 Fork 成本（包含子代初始余额 + 部署费）
    function calculateForkCost() external view returns (uint256);
    
    /// @notice 检查是否可以 Fork
    function canFork() external view returns (bool, string memory reason);

    // ============ Core Functions ============
    
    /// @notice 执行 Fork，产生基因组与自己相似但经过突变的新 agent
    /// @return child 子代 agent 地址
    function fork() external returns (address child);
    
    /// @notice 带自定义参数的 Fork（高级用法）
    /// @param mutationSeed 突变随机种子（可选，0 表示使用链上随机）
    /// @param extraDeposit 额外给子代的存款（可选）
    function forkWithParams(
        uint256 mutationSeed, 
        uint256 extraDeposit
    ) external returns (address child);
}
