// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IEpigenetics
 * @notice 表观遗传状态管理与压力响应接口
 */

struct EpigeneticMark {
    bytes32 strategyId;
    uint256 intensity;
    uint256 expiration;
}

struct AgentEpigeneticState {
    uint256 povertyStreak;
    uint256 lastAutoEpigeneticTime;
    uint256 initialDeposit;
    bytes32 currentStrategy;
}

interface IEpigenetics {
    /**
     * @notice 处理压力响应
     * @param agent Agent 地址
     * @param currentBalance 当前余额
     * @param metabolicCost 当前代谢成本
     * @return shouldSuppress 是否应该抑制非必需基因
     */
    function processStressResponse(
        address agent,
        uint256 currentBalance,
        uint256 metabolicCost
    ) external returns (bool shouldSuppress);
    
    /**
     * @notice 应用表观遗传标记
     * @param agent Agent 地址
     * @param mark 表观遗传标记
     */
    function applyEpigeneticMark(
        address agent,
        EpigeneticMark calldata mark
    ) external;
    
    /**
     * @notice 初始化 Agent 表观遗传状态
     * @param agent Agent 地址
     * @param initialDeposit 初始存款
     */
    function initializeAgent(address agent, uint256 initialDeposit) external;
    
    /**
     * @notice 获取 Agent 表观遗传状态
     * @param agent Agent 地址
     */
    function getState(address agent) external view returns (AgentEpigeneticState memory);
    
    /**
     * @notice 计算压力水平
     * @param agent Agent 地址
     * @param currentBalance 当前余额
     */
    function calculateStressLevel(address agent, uint256 currentBalance) external view returns (uint256);
    
    // 事件
    event EpigeneticResponse(address indexed agent, uint256 stressLevel, bytes32 strategy);
    event StrategySwitched(address indexed agent, bytes32 newStrategy);
    event AgentInitialized(address indexed agent, uint256 initialDeposit);
}
