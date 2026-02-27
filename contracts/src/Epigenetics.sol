// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IEpigenetics.sol";
import "./interfaces/IPetriAgentV2.sol";

/**
 * @title Epigenetics
 * @notice 表观遗传状态管理与压力响应策略
 * @dev 可升级的策略模式，允许未来更换响应算法
 */
contract Epigenetics is IEpigenetics, Ownable {
    
    // 常量
    uint256 public constant STRESS_THRESHOLD_HIGH = 7000;    // 70% 压力阈值
    uint256 public constant POVERTY_DAYS_TRIGGER = 3;        // 3天贫困触发
    uint256 public constant SCALE = 10000;                   // 精度缩放
    uint256 public constant EXPLORATION_STRESS_THRESHOLD = 3000;  // 30% 探索模式阈值
    
    // agent => state
    mapping(address => AgentEpigeneticState) public states;
    
    // 策略标识符 => 策略描述
    mapping(bytes32 => string) public strategyDescriptions;
    
    // 已初始化的 agent
    mapping(address => bool) public initialized;
    
    // 权限修饰符：只有 Agent 自己可以修改自己
    modifier onlyAgentItself(address agent) {
        require(
            msg.sender == agent, 
            "Epigenetics: Only agent can modify itself"
        );
        _;
    }
    
    // 权限修饰符：只有 Agent 自己或 Orchestrator 可以操作
    modifier onlyAgentOrOrchestrator(address agent) {
        require(
            msg.sender == agent || 
            msg.sender == IPetriAgentV2(agent).orchestrator(),
            "Epigenetics: Only agent or orchestrator"
        );
        _;
    }
    
    modifier onlyInitialized(address agent) {
        require(initialized[agent], "Agent not initialized");
        _;
    }
    
    constructor() Ownable(msg.sender) {
        // 注册默认策略
        strategyDescriptions["default"] = "Standard stress response";
        strategyDescriptions["hibernation"] = "Extreme energy conservation";
        strategyDescriptions["exploration"] = "Resource abundance expansion";
    }
    
    /**
     * @notice 初始化 Agent 表观遗传状态
     */
    function initializeAgent(address agent, uint256 initialDeposit) 
        external 
        override 
        onlyAgentOrOrchestrator(agent)
    {
        require(!initialized[agent], "Agent already initialized");
        require(initialDeposit > 0, "Initial deposit must be positive");
        
        states[agent] = AgentEpigeneticState({
            povertyStreak: 0,
            lastAutoEpigeneticTime: block.timestamp,
            initialDeposit: initialDeposit,
            currentStrategy: "default"
        });
        
        initialized[agent] = true;
        
        emit AgentInitialized(agent, initialDeposit);
    }
    
    /**
     * @notice 处理压力响应（替代 PetriAgentV2._autoEpigeneticResponse）
     * @param agent Agent 地址
     * @param currentBalance 当前余额
     * @param metabolicCost 当前代谢成本
     * @return shouldSuppress 是否应该抑制非必需基因
     */
    function processStressResponse(
        address agent,
        uint256 currentBalance,
        uint256 metabolicCost
    ) external override onlyInitialized(agent) onlyAgentItself(agent) returns (bool shouldSuppress) {
        AgentEpigeneticState storage state = states[agent];
        
        // 更新最后处理时间
        state.lastAutoEpigeneticTime = block.timestamp;
        
        // 计算压力水平
        uint256 stressLevel = _calculateStressLevelInternal(currentBalance, state);
        
        // 策略 1: 极端压力 -> 进入休眠模式
        if (stressLevel > STRESS_THRESHOLD_HIGH) {
            state.povertyStreak++;
            
            if (state.povertyStreak >= POVERTY_DAYS_TRIGGER) {
                state.currentStrategy = "hibernation";
                emit StrategySwitched(agent, "hibernation");
                emit EpigeneticResponse(agent, stressLevel, "hibernation");
                return true; // 应该抑制非必需基因
            }
        } else {
            // 压力缓解，重置计数
            if (state.povertyStreak > 0) {
                state.povertyStreak = 0;
                
                // 如果之前在休眠，切换到默认策略
                if (keccak256(abi.encodePacked(state.currentStrategy)) == keccak256(abi.encodePacked("hibernation"))) {
                    state.currentStrategy = "default";
                    emit StrategySwitched(agent, "default");
                }
            }
            
            // 策略 2: 资源充足 -> 探索模式
            if (currentBalance >= state.initialDeposit * 2 && stressLevel < EXPLORATION_STRESS_THRESHOLD) {
                if (keccak256(abi.encodePacked(state.currentStrategy)) != keccak256(abi.encodePacked("exploration"))) {
                    state.currentStrategy = "exploration";
                    emit StrategySwitched(agent, "exploration");
                }
            }
        }
        
        emit EpigeneticResponse(agent, stressLevel, state.currentStrategy);
        return false; // 正常模式，不抑制
    }
    
    /**
     * @notice 应用表观遗传标记（迁移自 _applyEpigeneticMarkInternal）
     */
    function applyEpigeneticMark(
        address agent,
        EpigeneticMark calldata mark
    ) external override onlyInitialized(agent) onlyAgentItself(agent) {
        AgentEpigeneticState storage state = states[agent];
        
        // 检查标记是否过期
        require(mark.expiration > block.timestamp, "Mark expired");
        
        // 切换策略
        state.currentStrategy = mark.strategyId;
        
        // 根据强度调整参数（未来可扩展）
        // intensity 可用于调整压力阈值等
        
        emit StrategySwitched(agent, mark.strategyId);
    }
    
    /**
     * @notice 获取 Agent 表观遗传状态
     */
    function getState(address agent) external view override returns (AgentEpigeneticState memory) {
        return states[agent];
    }
    
    /**
     * @notice 计算压力水平（外部查询）
     */
    function calculateStressLevel(address agent, uint256 currentBalance) 
        external 
        view 
        override 
        onlyInitialized(agent) 
        returns (uint256) 
    {
        return _calculateStressLevelInternal(currentBalance, states[agent]);
    }
    
    /**
     * @notice 内部压力计算
     * @dev 公式: max(0, 10000 - (balance / initialDeposit) * 10000)
     */
    function _calculateStressLevelInternal(
        uint256 balance,
        AgentEpigeneticState storage state
    ) internal view returns (uint256) {
        if (balance >= state.initialDeposit) {
            return 0; // 无压力
        }
        
        // 余额比例越小，压力越大
        uint256 ratio = (balance * SCALE) / state.initialDeposit;
        return SCALE - ratio;
    }
    
    /**
     * @notice 注册新策略（管理员）
     * @param strategyId 策略标识符
     * @param description 策略描述
     */
    function registerStrategy(bytes32 strategyId, string calldata description) external onlyOwner {
        strategyDescriptions[strategyId] = description;
    }
    
    /**
     * @notice 获取策略描述
     */
    function getStrategyDescription(bytes32 strategyId) external view returns (string memory) {
        return strategyDescriptions[strategyId];
    }
}
