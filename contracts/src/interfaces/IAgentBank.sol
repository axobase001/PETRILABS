// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IAgentBank
 * @notice Agent 的多链资产管理与跨链桥接接口
 */

interface IAgentBank {
    /**
     * @notice 查询单链余额
     * @param agent Agent 地址
     * @param chainId 链 ID
     */
    function getBalanceOnChain(address agent, uint256 chainId) external view returns (uint256);
    
    /**
     * @notice 查询跨链总净资产
     * @param agent Agent 地址（EVM 地址在所有 EVM 链相同）
     * @return total 跨链总余额
     */
    function getTotalCrossChainBalance(address agent) external view returns (uint256 total);
    
    /**
     * @notice 执行跨链转账
     * @param fromChain 源链 ID
     * @param toChain 目标链 ID
     * @param amount USDC 数量（6位小数）
     * @return bridgeTxId 跨链交易 ID
     */
    function bridge(
        uint256 fromChain,
        uint256 toChain,
        uint256 amount
    ) external returns (bytes32 bridgeTxId);
    
    /**
     * @notice 死亡时清扫余额
     * @param agent Agent 地址
     * @param recipient 接收地址
     */
    function sweepOnDeath(address agent, address recipient) external;
    
    /**
     * @notice 添加支持的链
     * @param chainId 链 ID
     * @param usdc USDC 合约地址
     * @param bridge 跨链桥适配器地址
     */
    function addChain(uint256 chainId, address usdc, address bridge) external;
    
    /**
     * @notice 获取支持的链列表
     */
    function getSupportedChains() external view returns (uint256[] memory);
    
    /**
     * @notice 检查链是否支持
     * @param chainId 链 ID
     */
    function isChainSupported(uint256 chainId) external view returns (bool);
    
    // 事件
    event BridgeInitiated(
        address indexed agent, 
        uint256 indexed fromChain, 
        uint256 indexed toChain, 
        uint256 amount,
        bytes32 bridgeTxId
    );
    event ChainAdded(uint256 indexed chainId, address usdc, address bridge);
    event SweepOnDeath(address indexed agent, address recipient, uint256 amount);
}
