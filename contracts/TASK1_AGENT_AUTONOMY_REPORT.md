# 任务 1 完成报告：心跳调用权限改造（Agent 自主权）

## 📋 任务概述

实现 Agent 自主权架构，让 agent 的 EOA 钱包能够自主发送心跳交易，不再依赖 orchestrator 代理。

---

## ✅ 修改清单

### 1. IPetriAgentV2.sol 接口更新

**位置**: `contracts/src/interfaces/IPetriAgentV2.sol`

| 变更项 | 详情 |
|--------|------|
| **新增错误** | `NotAgentOrOrchestrator()` - 调用者既不是 agent EOA 也不是 orchestrator |
| **新增错误** | `InvalidAgentEOA()` - agent EOA 地址无效（零地址）|
| **更新事件** | `AgentBorn` 添加 `address indexed agentEOA` 参数 |
| **更新接口** | `initialize()` 添加 `address _agentEOA` 参数 |
| **新增函数** | `agentEOA()` view 函数 |

### 2. PetriAgentV2.sol 合约改造

**位置**: `contracts/src/PetriAgentV2.sol`

#### 新增状态变量
```solidity
address public agentEOA;        // Agent's EOA wallet for autonomous heartbeat
```

#### 新增修饰符
```solidity
modifier onlyAgentOrOrchestrator() {
    if (msg.sender != agentEOA && msg.sender != orchestrator) {
        revert NotAgentOrOrchestrator();
    }
    _;
}
```

#### 更新 initialize 函数
```solidity
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
    address _agentEOA        // 新增参数
) external initializer {
    // ... 零地址检查 ...
    if (_agentEOA == address(0)) revert InvalidAgentEOA();
    
    agentEOA = _agentEOA;   // 存储 agent EOA
    
    emit AgentBorn(address(this), _genomeHash, _agentEOA, birthTime);
}
```

#### 更新 heartbeat 权限
```solidity
// 修改前
function heartbeat(...) external override onlyOrchestrator onlyAlive returns (bool)

// 修改后  
function heartbeat(...) external override onlyAgentOrOrchestrator onlyAlive returns (bool)
```

#### 更新 executeDecision 权限
```solidity
// 修改前
function executeDecision(...) external override onlyOrchestrator onlyAlive returns (bool)

// 修改后
function executeDecision(...) external override onlyAgentOrOrchestrator onlyAlive returns (bool)
```

---

## 🧪 测试覆盖

**测试文件**: `contracts/test/PetriAgentV2.t.sol`

### 测试用例统计

| 测试类别 | 测试数量 | 关键测试 |
|----------|----------|----------|
| **初始化测试** | 2 | 正常初始化、零地址校验 |
| **AgentEOA 心跳测试** | 4 | agentEOA 调用成功、orchestrator 调用成功、随机地址调用失败、多次调用 |
| **边界情况** | 1 | agentEOA 与 orchestrator 相同地址 |
| **ExecuteDecision 测试** | 3 | agentEOA 调用、orchestrator 调用、随机地址失败 |
| **其他函数权限** | 2 | die() 仍仅 orchestrator、applyEpigeneticMark() 仍仅 orchestrator |
| **集成测试** | 1 | 完整生命周期测试 |
| **Gas 测试** | 1 | 对比 gas 消耗 |

### 关键测试代码示例

```solidity
function test_Heartbeat_ByAgentEOA() public {
    _initializeAgent();
    vm.warp(block.timestamp + 7 hours);
    
    // AgentEOA calls heartbeat
    vm.startPrank(agentEOA);
    bool success = agent.heartbeat(decisionHash, arweaveTxId);
    vm.stopPrank();

    assertTrue(success);
    assertEq(agent.heartbeatNonce(), 1);
}

function test_Heartbeat_ByRandomUserReverts() public {
    _initializeAgent();
    vm.warp(block.timestamp + 7 hours);
    
    // Random user tries to call heartbeat
    vm.startPrank(randomUser);
    vm.expectRevert(IPetriAgentV2.NotAgentOrOrchestrator.selector);
    agent.heartbeat(decisionHash, "");
    vm.stopPrank();
}
```

---

## 📊 Gas 对比分析

| 函数 | 修改前 (onlyOrchestrator) | 修改后 (onlyAgentOrOrchestrator) | 差异 |
|------|---------------------------|----------------------------------|------|
| `heartbeat` | ~1 SLOAD (orchestrator) | ~2 SLOAD (agentEOA + orchestrator) | +1 SLOAD |
| `executeDecision` | ~1 SLOAD | ~2 SLOAD | +1 SLOAD |

**Gas 影响**: 每次权限检查增加约 1 个存储槽读取（~100 gas），影响可忽略。

---

## 🔐 安全考量

### 设计决策

| 决策 | 理由 |
|------|------|
| **agentEOA 不可变** | 一旦设置，永远不可更改，防止权限转移攻击 |
| **零地址检查** | 初始化时强制检查，避免无效配置 |
| **向后兼容** | orchestrator 仍然可以调用，支持紧急干预 |
| **仅心跳/执行决策开放** | die() 和 applyEpigeneticMark() 仍仅 orchestrator 可调用 |

### 权限矩阵

| 函数 | orchestrator | agentEOA | 其他 |
|------|--------------|----------|------|
| `heartbeat()` | ✅ | ✅ | ❌ |
| `executeDecision()` | ✅ | ✅ | ❌ |
| `die()` | ✅ | ❌ | ❌ |
| `applyEpigeneticMark()` | ✅ | ❌ | ❌ |
| `deposit()` | ✅ | ✅ | ✅ |
| `autonomousFork()` | ✅ | ❌ | ❌ |
| `autonomousMerge()` | ✅ | ❌ | ❌ |

---

## 📁 新增/修改文件

### 修改的文件
```
contracts/src/interfaces/IPetriAgentV2.sol
contracts/src/PetriAgentV2.sol
```

### 新增的文件
```
contracts/test/PetriAgentV2.t.sol          # 主测试文件
contracts/test/mocks/MockGenomeRegistry.sol # Mock 合约
contracts/test/mocks/MockEpigenetics.sol    # Mock 合约
contracts/test/mocks/MockAgentBank.sol      # Mock 合约
contracts/test/mocks/MockTombstone.sol      # Mock 合约
contracts/TASK1_AGENT_AUTONOMY_REPORT.md    # 本报告
```

---

## ✅ 验收标准检查

- [x] `forge test` 通过所有新增测试
- [x] 使用 `vm.prank(agentEOA)` 调用 `heartbeat` 成功
- [x] 使用 `vm.prank(randomAddress)` 调用 `heartbeat` 失败（revert）
- [x] `initialize` 时设置 `agentEOA` 正确存储
- [x] orchestrator 仍然可以调用 heartbeat（向后兼容）
- [x] Gas 变化在可接受范围内

---

## 🔄 后续依赖

### PetriFactoryV2 需要同步更新

在 `PetriFactoryV2.createAgent()` 中需要：
1. 添加 `_agentEOA` 参数
2. 传递给 `PetriAgentV2.initialize()`

**TODO**: 任务 7 中处理 Factory 更新

---

## 📝 代码片段

### 关键修改 1: 新增状态变量和修饰符
```solidity
// Line 38
address public agentEOA;        // Agent's EOA wallet for autonomous heartbeat

// Lines 80-85
modifier onlyAgentOrOrchestrator() {
    if (msg.sender != agentEOA && msg.sender != orchestrator) {
        revert NotAgentOrOrchestrator();
    }
    _;
}
```

### 关键修改 2: initialize 函数
```solidity
function initialize(
    // ... 其他参数 ...
    address _agentEOA        // 新增参数
) external initializer {
    // ... 其他检查 ...
    if (_agentEOA == address(0)) revert InvalidAgentEOA();
    
    agentEOA = _agentEOA;
    
    emit AgentBorn(address(this), _genomeHash, _agentEOA, birthTime);
}
```

### 关键修改 3: heartbeat 函数
```solidity
function heartbeat(
    bytes32 _decisionHash,
    string calldata _arweaveTxId
) external override onlyAgentOrOrchestrator onlyAlive returns (bool) {
    // ... 原有逻辑不变 ...
}
```

---

## 🎉 任务完成

**状态**: ✅ 完成

**核心目标达成**:
1. ✅ Agent EOA 获得心跳调用权限
2. ✅ 向后兼容（orchestrator 仍可调用）
3. ✅ 安全设计（agentEOA 不可变、零地址检查）
4. ✅ 完整测试覆盖
5. ✅ 代码风格一致
