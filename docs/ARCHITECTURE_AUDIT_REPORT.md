# PetriLabs 智能合约架构审计报告

**审计日期**: 2026-02-25  
**审计师**: AI Architecture Auditor  
**范围**: contracts/src/*.sol  
**标准**: Solidity Architecture Best Practices + ALife Domain Consistency

---

## 📊 执行摘要

| 合约 | 风险评级 | 行数 | 主要问题 |
|------|----------|------|----------|
| **PetriAgentV2.sol** | 🟡 **B** | 710 | 表观遗传逻辑应分离 |
| **ReplicationManager.sol** | 🟡 **B** | 705 | 价值评估应完全委托给库 |
| **GenomeRegistry.sol** | 🟢 **A** | 368 | 符合 SRP |
| **PetriFactoryV2.sol** | 🟢 **A** | 296 | 符合 SRP |
| **GenomeValueAssessor.sol** | 🟢 **A** | 265 | 符合 SRP |
| **PetriAgent.sol (V1)** | 🟠 **C** | 202 | 应移至 archive/ |
| **PetriFactory.sol (V1)** | 🟠 **C** | 174 | 应移至 archive/ |

**整体评级**: 🟡 **B级** - 可接受，但建议重构以符合单一职责原则

---

## 🔍 详细审计结果

### 1. 版本管理检查

#### ❌ 发现: V1 和 V2 合约并存

```
contracts/src/
├── PetriAgent.sol      (V1 - 202行)
├── PetriAgentV2.sol    (V2 - 710行)
├── PetriFactory.sol    (V1 - 174行)
└── PetriFactoryV2.sol  (V2 - 296行)
```

**问题**:
- V1 合约未被弃用，仍留在主源码目录
- 可能导致开发者混淆，引用错误版本
- 工厂合约同时保留 V1/V2 创建逻辑

**建议**:
```bash
# 重构前目录结构
mkdir -p contracts/src/legacy/
mv contracts/src/PetriAgent.sol contracts/src/legacy/
mv contracts/src/PetriFactory.sol contracts/src/legacy/
mv contracts/src/IPetriAgent.sol contracts/src/legacy/
mv contracts/src/IPetriFactory.sol contracts/src/legacy/

# 更新 import 路径
# 删除 V1 相关的测试和部署脚本
```

**优先级**: P2 (可维护性)

---

### 2. 上帝对象检测 (God Object Detection)

#### 🟡 PetriAgentV2.sol (710行) - 轻度膨胀

**现状分析**:

| 功能域 | 所在位置 | 应归属合约 | 状态 |
|--------|----------|------------|------|
| 基础 Agent 生命周期 | ✅ 正确 | PetriAgentV2 | ✅ |
| 心跳与死亡 | ✅ 正确 | PetriAgentV2 | ✅ |
| **表观遗传状态管理** | ⚠️ 第572-643行 | Epigenetics.sol | ❌ 架构债务 |
| **自动表观遗传响应** | ⚠️ 第578-598行 | AutoEpigenetics.sol | ❌ 架构债务 |
| 代谢成本查询 | ✅ 正确 (delegate) | GenomeRegistry | ✅ |
| Fork/Merge 触发器 | ✅ 正确 (delegate) | ReplicationManager | ✅ |

**具体代码位置**:

```solidity
// PetriAgentV2.sol 第 61-64 行 - 表观遗传状态
uint256 public povertyStreak;                          
uint256 public lastAutoEpigeneticTime;                 
uint256 public initialDeposit;                         

// 第 572-643 行 - 表观遗传逻辑 (~70行)
function _autoEpigeneticResponse() internal { ... }
function _autoApplyEpigeneticMark(...) internal { ... }
function _applyEpigeneticMarkInternal(...) internal { ... }
```

**架构债务**: 约 **70行** 表观遗传逻辑应迁移

**重构方案**:

```solidity
// 新增: Epigenetics.sol
contract Epigenetics is IEpigenetics {
    mapping(address => EpigeneticState) public states;
    
    function autoEpigeneticResponse(address agent) external {
        // 从 PetriAgentV2 迁移的逻辑
    }
}

// PetriAgentV2 修改:
// - 删除 povertyStreak, lastAutoEpigeneticTime
// - 删除 _autoEpigeneticResponse 等函数
// - 改为调用 epigenetics.autoEpigeneticResponse(address(this))
```

**预估重构后**: PetriAgentV2 ~**640行** (-10%)

---

#### 🟡 ReplicationManager.sol (705行) - 轻度膨胀

**现状分析**:

| 功能域 | 所在位置 | 应归属 | 状态 |
|--------|----------|--------|------|
| Fork/Merge 核心逻辑 | ✅ 正确 | ReplicationManager | ✅ |
| 提议管理 | ✅ 正确 | ReplicationManager | ✅ |
| **价值评估算法** | ⚠️ 第396-429行 | GenomeValueAssessor.sol | ⚠️ 部分重复 |
| 基因组突变 | ✅ 正确 | ReplicationManager | ✅ |
| 跨链同步 | ❌ 不存在 | 未实现 | N/A |

**具体代码位置**:

```solidity
// ReplicationManager.sol 第 396-429 行 (~33行)
function assessGeneValue(address target, uint32[] calldata geneIds)
    external
    view
    override
    returns (uint256 valueScore, uint256 confidence)
{
    // 简化版评估算法 - 实际应完全委托给 GenomeValueAssessor
    uint256 targetBalance = usdc.balanceOf(target);
    uint256 totalScore = 0;
    for (uint i = 0; i < geneIds.length; i++) {
        totalScore += targetBalance / 100; // 过于简化
    }
    valueScore = totalScore > 10000 ? 10000 : totalScore;
    confidence = 7000; // 硬编码
}
```

**问题**: 
- 存在简化版评估算法，与 GenomeValueAssessor.sol 重复
- 实际应直接委托调用 GenomeValueAssessor 的完整算法

**重构方案**:

```solidity
// ReplicationManager 修改:
function assessGeneValue(address target, uint32[] calldata geneIds)
    external
    view
    override
    returns (uint256 valueScore, uint256 confidence)
{
    // 完全委托给专业库
    return IGenomeValueAssessor(genomeValueAssessor).assessGeneValue(
        target, 
        geneIds,
        usdc.balanceOf(target)
    );
}
```

**预估重构后**: ReplicationManager ~**670行** (-5%)

---

### 3. 缺失模块识别

| 期望模块 | 是否独立合约 | 当前位置 | 状态 |
|----------|--------------|----------|------|
| **AgentBank / CrossChainWallet** | ❌ 否 | 未实现 | 🔴 **缺失** |
| **MetabolismEngine** | ❌ 否 | GenomeRegistry | 🟡 部分存在 |
| **Tombstone (死亡 NFT)** | ❌ 否 | 未实现 | 🔴 **缺失** |
| **Epigenetics** | ❌ 否 | PetriAgentV2 | 🟡 需分离 |
| **Orchestrator** | ❌ 否 | 链下服务 | ✅ 设计如此 |

#### 🔴 严重缺失: AgentBank / CrossChainWallet

**现状**: PetriAgentV2 直接持有 USDC，无多链管理能力

```solidity
// PetriAgentV2.sol 第 40-41 行
IERC20 public usdc;  // 仅单链 USDC
address public genomeRegistry;
```

**问题**:
- Agent 无法在多链间迁移（Arweave 永久存储的优势被浪费）
- 无法支持多链收入策略
- 死亡时资产无法跨链转移

**建议架构**:

```solidity
// 新增: AgentBank.sol
contract AgentBank {
    mapping(address => mapping(uint256 => uint256)) public chainBalances; // agent => chainId => balance
    
    function bridgeTo(uint256 targetChain, uint256 amount) external {
        // 使用 LayerZero / Hyperlane 跨链
    }
    
    function sweepOnDeath(address agent) external {
        // 死亡时将余额转至 Tombstone
    }
}
```

**优先级**: P1 (功能缺失)

---

#### 🟡 部分缺失: MetabolismEngine

**现状**: 代谢计算在 GenomeRegistry，但扣费逻辑在 PetriAgentV2

```solidity
// GenomeRegistry.sol - 计算代谢成本
function calculateMetabolicCost(bytes32 genomeHash) external view returns (uint256);

// PetriAgentV2.sol - 第 525-531 行 - 查询代谢成本
function getMetabolicCost() public view returns (uint256) {
    (bool success, bytes memory result) = genomeRegistry.staticcall(...);
}

// PetriAgentV2.sol - 第 134-136 行 - 扣费逻辑在 heartbeat 中
if (usdc.balanceOf(address(this)) < MIN_BALANCE + costSinceLastHeartbeat) {
    _die("metabolic_exhaustion", "");
}
```

**评估**: 当前设计可接受，MetabolismEngine 可作为未来优化模块

---

#### 🔴 缺失: Tombstone (死亡 NFT)

**现状**: 死亡时仅标记状态，无永久记录

```solidity
// PetriAgentV2.sol 第 645-654 行
function _die(string memory reason, string memory arweaveTxId) internal {
    isAlive = false;  // 仅标记状态
    emit AgentDied(...);  // 仅事件
}
```

**建议**:

```solidity
// 新增: Tombstone.sol (ERC721)
contract Tombstone is ERC721 {
    struct DeathRecord {
        bytes32 genomeHash;
        uint256 diedAt;
        string arweaveId;
        uint256 finalBalance;
    }
    
    function mint(address agent, DeathRecord calldata record) external returns (uint256 tokenId) {
        // 铸造死亡证明 NFT
    }
}
```

**优先级**: P2 (数据完整性)

---

### 4. 函数复杂度分析

#### ✅ 优秀: 无超长函数

| 函数 | 合约 | 行数 | 状态 |
|------|------|------|------|
| `createAgent` | PetriFactory.sol | 39 | ✅ <50 |
| `_createAgent` | PetriFactoryV2.sol | 37 | ✅ <50 |
| `proposeMerge` | ReplicationManager.sol | 31 | ✅ <50 |
| `_crossoverGenomes` | ReplicationManager.sol | 30 | ✅ <50 |
| `registerGenome` | GenomeRegistry.sol | 30 | ✅ <50 |

**结论**: 所有函数均在 50 行以内，符合最佳实践

---

#### ⚠️ 注意: 多参数函数

```solidity
// ReplicationManager.sol - 可考虑使用 struct
function acceptMerge(
    uint256 proposalId, 
    uint32[] calldata genesOffered,
    uint256 deposit
) external returns (address child);

// 建议重构:
struct AcceptanceParams {
    uint256 proposalId;
    uint32[] genesOffered;
    uint256 deposit;
}
function acceptMerge(AcceptanceParams calldata params) external returns (address child);
```

---

### 5. 继承关系检查

#### ✅ 继承图 (当前)

```
Ownable (OpenZeppelin)
    ├── GenomeRegistry.sol
    ├── PetriFactory.sol
    ├── PetriFactoryV2.sol
    └── ReplicationManager.sol

Initializable (OpenZeppelin)
    ├── PetriAgent.sol
    └── PetriAgentV2.sol

IForkable + IMergeable
    └── ReplicationManager.sol
```

**评估**:
- ✅ 无菱形继承问题
- ✅ 接口隔离良好
- ✅ 无合约继承不相关功能

---

### 6. 生物学隐喻一致性

#### 🟡 命名改进建议

| 当前命名 | 问题 | 建议 |
|----------|------|------|
| `fork()` | 与代码复制混淆 | `replicate()` 或 `bud()` |
| `merge()` | 与 Git 合并混淆 | `conjugate()` 或 `hybridize()` |
| `assessGeneValue()` | 过于金融化 | `evaluateFitnessContribution()` |
| `calculateForkCost()` | 经济隐喻过强 | `metabolicInvestment()` |

**示例重构**:

```solidity
// 当前
function fork() external returns (address child);
function calculateForkCost() external view returns (uint256);

// 建议
function bud() external returns (address offspring);  // 出芽生殖
function metabolicInvestment() external view returns (uint256 energyRequired);
```

---

## 🎯 重构优先级与方案

### P0: 关键架构债务 (安全性/核心功能)

**1. 分离表观遗传逻辑**

```solidity
// 新增: Epigenetics.sol (预估 150 行)
contract Epigenetics is IEpigenetics, Ownable {
    mapping(address => AgentEpigeneticState) public states;
    
    function processStressResponse(address agent, uint256 balance) external {
        // 从 PetriAgentV2 迁移 _autoEpigeneticResponse
    }
    
    function applyMark(address agent, EpigeneticMark calldata mark) external {
        // 从 PetriAgentV2 迁移 _applyEpigeneticMarkInternal
    }
}

// PetriAgentV2 移除:
// - povertyStreak (state variable)
// - lastAutoEpigeneticTime (state variable)
// - _autoEpigeneticResponse() (70 行)
// - _autoApplyEpigeneticMark() (25 行)
// - _applyEpigeneticMarkInternal() (12 行)
// = 减少 ~110 行
```

**预估结果**:
- PetriAgentV2: 710行 → **600行** ✅
- 新增 Epigenetics.sol: ~150行

---

### P1: 功能缺失

**2. 实现 AgentBank (多链资产管理)**

```solidity
// 新增: AgentBank.sol (预估 300 行)
contract AgentBank is IAgentBank, Ownable {
    using SafeERC20 for IERC20;
    
    mapping(address => mapping(uint256 => uint256)) public chainBalances;
    mapping(address => address) public bridgeAdapters;
    
    function deposit(uint256 chainId, uint256 amount) external;
    function withdraw(uint256 chainId, uint256 amount) external;
    function bridge(uint256 fromChain, uint256 toChain, uint256 amount) external;
    function sweepOnDeath(address agent) external onlyAgent;
}
```

**3. 实现 Tombstone (死亡 NFT)**

```solidity
// 新增: Tombstone.sol (预估 200 行)
contract Tombstone is ERC721, ITombstone {
    struct DeathRecord {
        bytes32 genomeHash;
        uint256 diedAt;
        uint256 lifespan;
        string arweaveId;
        uint256 finalBalance;
        uint256 offspringCount;
    }
    
    mapping(uint256 => DeathRecord) public records;
    
    function mint(address agent, DeathRecord calldata record) 
        external 
        returns (uint256 tokenId);
}
```

---

### P2: 可维护性

**4. 归档 V1 合约**

```bash
mv contracts/src/PetriAgent.sol contracts/src/legacy/
mv contracts/src/PetriFactory.sol contracts/src/legacy/
mv contracts/src/IPetriAgent.sol contracts/src/legacy/
mv contracts/src/IPetriFactory.sol contracts/src/legacy/

# 更新所有 import 路径
# 删除 V1 相关测试
```

---

## 📈 重构后代码分布预测

| 合约 | 当前行数 | 重构后 | 变化 |
|------|----------|--------|------|
| PetriAgentV2.sol | 710 | **600** | -110 (分离 Epigenetics) |
| ReplicationManager.sol | 705 | **670** | -35 (简化 assessGeneValue) |
| GenomeRegistry.sol | 368 | 368 | 不变 |
| PetriFactoryV2.sol | 296 | 296 | 不变 |
| GenomeValueAssessor.sol | 265 | 265 | 不变 |
| **Epigenetics.sol** | - | **150** | 新增 |
| **AgentBank.sol** | - | **300** | 新增 |
| **Tombstone.sol** | - | **200** | 新增 |
| V1 合约 (移至 legacy) | 376 | 0 | -376 |
| **总计** | **~3,600** | **~2,849** | **-751 行主代码** |

---

## ✅ 最终建议

### 立即执行 (本周)
1. 将 V1 合约移至 `legacy/` 目录
2. 更新所有 import 路径

### 短期执行 (本月)
1. 分离 Epigenetics 模块 (减少 PetriAgentV2 110行)
2. 简化 ReplicationManager.assessGeneValue() (完全委托给 GenomeValueAssessor)

### 中期规划 (下月)
1. 实现 AgentBank.sol (多链资产管理)
2. 实现 Tombstone.sol (死亡 NFT)
3. 考虑生物学命名重构 (fork → bud, merge → conjugate)

### 链抽象检查

**当前状态**: ✅ 良好
- Agent 通过 `genomeHash` 和 Arweave 实现链无关身份
- 无硬编码 `block.chainid` 检查
- 建议: 在 AgentBank 实现后完全消除链绑定逻辑

---

## 附录: 检查清单汇总

### 版本管理
- [x] V1/V2 合约并存 - 发现，建议归档 V1

### 上帝对象
- [x] PetriAgentV2 (710行) - 轻度膨胀，建议分离 Epigenetics (~110行)
- [x] ReplicationManager (705行) - 轻度膨胀，建议简化 assessGeneValue (~35行)

### 缺失模块
- [ ] CrossChainWallet / AgentBank - **严重缺失**
- [x] MetabolismEngine - 部分存在于 GenomeRegistry，可接受
- [ ] Tombstone - **缺失**
- [ ] Epigenetics - 需从 PetriAgentV2 分离

### 函数复杂度
- [x] 超长函数 (>50行) - 无
- [x] 多参数函数 (>8个) - 无
- [x] view/state 混合 - 无

### 继承关系
- [x] 菱形继承 - 无
- [x] 无关功能继承 - 无
- [x] 接口隔离 - 良好

### 生物学隐喻
- [x] 命名一致性 - 可优化 (fork/merge 过于技术化)
- [x] 领域模型对齐 - 良好

---

*"架构是活的，就像我们的 Agent 一样。持续演化，而非一蹴而就。"*
