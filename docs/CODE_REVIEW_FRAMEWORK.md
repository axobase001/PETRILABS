# PetriLabs 代码审查框架

**用途**: 供 Kimi CLI 本地执行，全面审查重构后的代码库  
**重点**: Epigenetics, AgentBank, Tombstone 三个新模块与原有系统的集成质量  
**执行方式**: `kimi review-prompt.md --repo ./petrilabs-contracts --report-format markdown`

---

## 一、架构审查（宏观）

### 1. 模块化验证

检查文件结构是否符合预期：
```
contracts/src/
├── Epigenetics.sol              [新建] 应 ~150 行，独立表观遗传逻辑
├── AgentBank.sol                [新建] 应 ~300 行，多链资产管理
├── Tombstone.sol                [新建] 应 ~200 行，ERC721 死亡证明
├── interfaces/
│   ├── IEpigenetics.sol         [新建]
│   ├── IAgentBank.sol           [新建]
│   └── ITombstone.sol           [新建]
├── PetriAgentV2.sol             [修改] 应从 710 行降至 ~600 行
├── ReplicationManager.sol       [修改] 应从 705 行降至 ~670 行
└── legacy/                      [归档]
    ├── PetriAgent.sol
    └── PetriFactory.sol
```

**检查项**：
- [ ] PetriAgentV2 是否已删除 `povertyStreak`, `lastAutoEpigeneticTime`, `_autoEpigeneticResponse`？
- [ ] PetriAgentV2 是否通过 `IEpigenetics` 接口调用表观遗传功能，而非直接实现？
- [ ] AgentBank 是否无状态（或极少状态），仅作为资产管理工具？
- [ ] Tombstone 是否为 Soulbound（不可转让）？

### 2. 接口隔离检查

验证以下接口是否正确定义且无冗余：

**IEpigenetics**：
- `processStressResponse` 返回 `bool shouldSuppress` 是否正确？
- 是否包含 `initializeAgent` 用于初始化？
- 是否预留了策略切换的扩展性？

**IAgentBank**：
- `getTotalCrossChainBalance` 是否实现为 view 函数？
- `bridge` 函数是否返回 `bytes32 bridgeTxId` 用于追踪？
- 是否包含 `sweepOnDeath` 用于死亡清算？

**ITombstone**：
- `DeathRecordInput` 结构体是否包含 `totalValue`（跨链总余额）？
- `mint` 函数是否有 `onlyAgent` 或类似权限控制？

---

## 二、安全审查（关键）

### 1. 权限与访问控制

逐行检查以下风险点：

**Epigenetics.sol**：
- [ ] `initializeAgent` 是否只能被 PetriAgentV2 调用？（防止恶意初始化）
- [ ] `applyEpigeneticMark` 是否有权限控制？（防止外部随意修改 Agent 状态）

**AgentBank.sol**：
- [ ] `sweepOnDeath` 是否只能被授权的 Agent 或 Orchestrator 调用？
- [ ] `bridge` 函数是否有 `msg.sender` 验证，确保只能由 Agent 自身调用？
- [ ] 跨链金额计算是否有溢出保护？（使用 SafeMath 或 Solidity 0.8+ 内置检查）

**Tombstone.sol**：
- [ ] `mint` 是否防止重复铸造？（一个 Agent 只能有一个 Tombstone）
- [ ] 是否实现了 `_beforeTokenTransfer` 阻止转让？（Soulbound 特性）

**PetriAgentV2.sol（修改后）**：
- [ ] 新的 `initialize` 函数参数顺序是否正确？（新增 `_epigenetics`, `_agentBank`, `_tombstone`）
- [ ] `_die` 函数在调用 `tombstone.mint` 之前还是之后进行余额清算？（防止重入）
- [ ] `heartbeat` 中调用 `epigenetics.processStressResponse` 是否为外部调用？是否有重入风险？

### 2. 跨链安全（AgentBank 重点）

- [ ] `getTotalCrossChainBalance` 是否为 view 函数且无副作用？
- [ ] 如果使用了实际的外部查询（而非缓存），是否标记为 `view`？
- [ ] `bridge` 函数是否处理了跨链失败的回退逻辑？（资金是否会锁死在合约中？）

### 3. 表观遗传状态一致性

- [ ] PetriAgentV2 删除状态变量后，是否从 Epigenetics 合约读取这些状态？
- [ ] `processStressResponse` 的调用是否为 `external` 而非 `public`，以避免不必要的 Gas 消耗？
- [ ] 如果 Epigenetics 合约被升级（未来），PetriAgentV2 是否支持更换 Epigenetics 地址？（可选，但建议检查）

---

## 三、集成质量检查（微观）

### 1. PetriAgentV2 集成测试

检查以下调用链是否完整：

**初始化流程**：
```
PetriFactoryV2.createAgent()
    -> PetriAgentV2.initialize()
        -> epigenetics.initializeAgent() [新增调用]
        -> [其他初始化]
```

**心跳流程**：
```
PetriAgentV2.heartbeat()
    -> [原有逻辑]
    -> epigenetics.processStressResponse() [新增调用]
        -> [返回 shouldSuppress]
    -> if (shouldSuppress) _suppressNonEssentialGenes()
    -> [原有逻辑]
```

**死亡流程**：
```
PetriAgentV2._die()
    -> agentBank.getTotalCrossChainBalance() [新增：查跨链余额]
    -> tombstone.mint() [新增：铸死亡NFT]
    -> agentBank.sweepOnDeath() [新增：清算]
    -> [原有事件发射]
```

### 2. 向后兼容性

- [ ] 原有函数 `fork()`, `merge()`, `getMetabolicCost()` 的签名是否完全不变？
- [ ] 事件 `AgentDied` 是否新增了 `tombstoneId` 参数？（如果是，前端是否需要更新？）
- [ ] 存储槽位是否有冲突？（OpenZeppelin Upgradable 的存储布局检查）

---

## 四、Gas 优化审查

### 1. 存储布局（SSTORE 优化）

- [ ] Epigenetics 中的 `AgentEpigeneticState` 结构体是否紧凑？（uint256 对齐）
- [ ] AgentBank 的 `supportedChains` 数组是否为 constant/immutable，避免存储？
- [ ] Tombstone 的 `DeathRecord` 是否使用了 `mapping` 导致存储膨胀？（建议检查 `chainSpecificBalances` 是否真的需要存储，还是仅事件记录）

### 2. 函数优化

- [ ] `getTotalCrossChainBalance` 是否为 view 且不修改状态？
- [ ] `processStressResponse` 是否使用了 `storage` 指针而非 memory 拷贝？（优化 Gas）

---

## 五、生物学一致性（领域模型）

### 1. 命名检查

- [ ] `Epigenetics` 中的函数是否避免使用技术术语（如 `updateState`），而应使用生物术语（如 `processStressResponse`）？
- [ ] `AgentBank` 是否过于金融化？是否应该叫 `MetabolicReserve` 或 `EnergyStore`？（可选建议）
- [ ] `Tombstone` 中的 `causeOfDeath` 是否包含生物学合理的死因（如 `metabolic_exhaustion`, `predation`, `senescence`）？

### 2. 行为一致性

- [ ] 表观遗传的 `shouldSuppress` 机制是否模拟了真实的"基因沉默"（Gene Silencing）？
- [ ] 跨链资产转移是否被描述为"能量迁移"或"代谢物转运"而非"银行转账"？（文档层面）

---

## 六、测试覆盖检查

请确认以下测试用例是否存在：

**功能测试**：
- [ ] `testEpigeneticStressResponse`：模拟余额下降，验证 shouldSuppress 返回 true
- [ ] `testCrossChainBalanceAggregation`：模拟多链余额，验证总和正确
- [ ] `testTombstoneMinting`：触发死亡，验证 NFT 铸造且 metadata 正确
- [ ] `testSoulboundTombstone`：尝试转让 Tombstone，验证 revert

**安全测试**：
- [ ] `testUnauthorizedEpigeneticMark`：非 Agent 调用 applyEpigeneticMark，验证 revert
- [ ] `testDoubleTombstone`：同一 Agent 死亡两次，验证第二次 revert
- [ ] `testReentrancyDie`：在 _die 函数中尝试重入攻击（如果有外部调用）

**集成测试**：
- [ ] `testAgentLifecycle`：创建 -> 心跳（多次）-> 压力响应 -> 死亡 -> Tombstone 完整流程

---

## 七、输出格式

请生成以下报告：

### 1. 问题清单（按严重级排序）

```
[CRITICAL] [文件:行号] [问题描述] [修复建议]
[HIGH]     [文件:行号] [问题描述] [修复建议]
[MEDIUM]   [文件:行号] [问题描述] [修复建议]
[INFO]     [文件]      [优化建议]
```

### 2. 架构对比表

| 指标 | 重构前 | 重构后 | 评价 |
|------|--------|--------|------|
| 最大合约行数 | 710 | [实际] | 应 < 600 |
| 合约数量 | 8 | [实际] | 应 >= 11（含3个新模块）|
| View 函数占比 | 27% | [实际] | 应保持 > 25% |
| 跨链支持 | ❌ | [实际] | 应 ✅ |

### 3. 关键代码片段审查

针对以下函数，给出逐行注释：
- `Epigenetics.processStressResponse`（检查算法正确性）
- `AgentBank.getTotalCrossChainBalance`（检查跨链逻辑）
- `PetriAgentV2._die`（检查调用顺序和安全性）

### 4. 通过/失败判定

- **架构重构**：是否成功分离了 Epigenetics？（是/否）
- **安全基线**：是否存在高危漏洞？（是/否）
- **功能完整**：跨链余额查询是否可用？（是/否）

---

## 八、执行检查清单

运行以下命令验证代码存在：

```bash
# 1. 检查文件结构
ls -la contracts/src/*.sol
ls -la contracts/src/interfaces/*.sol
ls -la contracts/src/legacy/*.sol

# 2. 统计行数
wc -l contracts/src/PetriAgentV2.sol
wc -l contracts/src/Epigenetics.sol
wc -l contracts/src/AgentBank.sol
wc -l contracts/src/Tombstone.sol

# 3. 检查关键函数
grep -n "processStressResponse\|getTotalCrossChainBalance\|sweepOnDeath\|mint.*DeathRecord" contracts/src/*.sol

# 4. 检查权限修饰符
grep -n "onlyAgent\|onlyMinter\|onlySweeper\|onlyOrchestrator" contracts/src/*.sol

# 5. 检查 Soulbound 实现
grep -n "_beforeTokenTransfer\|soulbound" contracts/src/Tombstone.sol
```

---

## 九、重点关注点

### 1. _die 函数调用顺序（防重入）

**必须验证的顺序**：
```solidity
function _die(string memory reason, string memory arweaveTxId) internal {
    require(isAlive, "Already dead");
    isAlive = false;  // 1. 先标记死亡状态
    
    uint256 finalBalance = agentBank.getTotalCrossChainBalance(address(this));  // 2. 查询余额（view）
    
    // 3. 铸 Tombstone（外部调用，但 NFT 不会重入 USDC）
    uint256 tombstoneId = tombstone.mint(address(this), record);
    
    // 4. 清算余额（外部调用，需在最后）
    agentBank.sweepOnDeath(address(this), owner());
    
    emit AgentDied(...);  // 5. 事件
}
```

**检查点**：`isAlive = false` 是否在**任何**外部调用之前？

### 2. 跨链余额计算（MVP 简化）

**当前实现**：使用缓存（cache）而非实时查询
```solidity
function getTotalCrossChainBalance(address agent) external view returns (uint256) {
    for (uint i = 0; i < supportedChains.length; i++) {
        if (chainId == CURRENT_CHAIN) {
            return usdc.balanceOf(agent);  // 当前链实时
        }
        // 其他链使用缓存
        total += cachedCrossChainBalances[agent][chainId];
    }
}
```

**风险**：缓存过期可能导致余额计算不准确。  
**可接受性**：MVP 阶段可接受，但需文档说明。

---

**执行指令**：请在本地代码库运行以上检查，无需用户粘贴代码。重点审查 PetriAgentV2.sol 的修改 diff 和新合约的构造函数权限控制。
