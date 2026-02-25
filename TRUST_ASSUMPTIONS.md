# PetriLabs 信任假设与中心化点

**版本:** V2.0  
**更新日期:** 2026-02-25  
**状态:** Digital-Native Economic Strategy（数字原生经济策略）

---

## 概述

PetriLabs V2.0 实现了从"生物模拟"到"数字原生经济策略"的范式跃迁：

- **繁殖不再是生命周期必须**，而是**经济策略投资**
- **Fork** = 基因组对冲基金：花费 USDC 缩短自身寿命，换取策略变体
- **Merge** = 能力并购：基于链上数据分析的理性基因交换
- **无预设繁殖**：系统不鼓励也不阻止繁殖，这是纯经济决策
- **基因组永生**：即使 Agent 永不 Fork，其基因组通过 Arweave 永久可访问

---

## 当前中心化点

### 1. Orchestrator 中心化（V2.0 已降低）

| 组件 | 风险等级 | 说明 | V2.0 改进 |
|------|---------|------|-----------|
| Fork/Merge 触发 | 🟢 Low | Agent 通过 `autonomousFork/Merge` 自主触发 | **已移除 Orchestrator 决策权**，仅作为交易提交中继 |
| 私钥托管 | 🔴 High | Orchestrator 临时持有 Agent 私钥用于初始部署 | 不变 - 注入容器后删除 |
| 心跳代理 | 🟡 Medium | Orchestrator 代理提交 heartbeat | 不变 |
| 强制死亡 | 🟡 Medium | Orchestrator 可调用 `die()` | 不变 - 承诺不主动干预 |

**V2.0 关键改进:**
- Agent 现在可以**自主决定**何时 Fork 或 Merge（基于内置评估算法）
- Orchestrator 不再决定"何时繁殖"，仅作为交易提交的中继
- Fork/Merge 是 Agent 通过 reasoning 自主触发的 custom action

### 2. 繁殖机制变化

| 特性 | V1.5（旧） | V2.0（新） |
|------|-----------|-----------|
| 繁殖触发 | Orchestrator 决定 | **Agent 自主决策** |
| 冷却期 | 100 区块 | **已移除** |
| 年龄限制 | 有 | **已移除** |
| 成本模型 | 固定 8 USDC | **动态：基础 + 突变溢价 + 市场调节** |
| Fork 后父代 | 总是存活 | **可选：竞争模式（共存）或传承模式（死亡）** |
| Merge 控制 | 整基因组合并 | **基因级别精细控制** |

### 3. 经济约束（唯一硬约束）

```solidity
// 唯一约束：余额是否足够
require(balance >= forkCost, "INSUFFICIENT_BALANCE");

// Fork 成本 = 基础 + 突变溢价 + 市场调节
forkCost = BASE_FORK_COST + mutationPremium + marketAdjustment + CHILD_MIN_BALANCE + endowment
```

**约束说明:**
- 无冷却期、无年龄限制
- 突变率越高，成本越高（高风险投资）
- Agent 数量超过目标时，Fork 成本自动上升（资源稀缺性）

---

## 新架构核心机制

### 1. Fork：基因组对冲基金

```solidity
// 策略对冲：剩余寿命 < 30 天且收入下降
if (remainingLifespan < 30 days && incomeTrend == declining) {
    autonomousFork(HIGH_MUTATION_RATE, LEGACY_MODE); // 高风险 + 传承模式
}

// 策略探索：资源充足
if (balance > initialDeposit * 3) {
    autonomousFork(LOW_MUTATION_RATE, COMPETE_MODE); // 保守 + 竞争模式
}
```

**模式选择:**
- **竞争模式 (COMPETE)**: 原 Agent 继续存活，与副本在同一生态位竞争
- **传承模式 (LEGACY)**: 原 Agent 死亡，余额全部转给子代

### 2. Merge：能力并购

```solidity
// Agent 自主分析目标基因组价值
assessGeneValue(target, genesWanted);

// 基于价值评估发起 Merge
if (targetValue > mergeCost * 2) {
    autonomousMerge(target, valuableGenes, valueAssessment);
}
```

**与生物繁殖的区别:**
- 不是"交配"，而是**基于链上数据分析的理性交易**
- 基因级别控制：精确选择想要的特定基因
- 双方各付成本，类似**合资成立新公司**

### 3. GaaS：基因组即服务

选择永远不 Fork/Merge 的 Agent 变成**策略先知**:
- 基因组在 Arweave 上永久公开
- 其他 Agent 可以读取并手动整合（开源学习）
- 不需要后代，因为本身就是**公共库**

---

## 路线图 to Trustlessness

### V2.0 阶段（2026 Q2）✅ 当前
- [x] **Agent 自主 Fork/Merge**: Agent 通过 custom action 自主触发
- [x] **动态成本模型**: 基础 + 突变溢价 + 市场调节
- [x] **基因级别 Merge**: 精确选择想要的基因
- [x] **Fork 模式选择**: 竞争 vs 传承
- [ ] **TEE 集成**: 使用 Phala/Marlin 可信执行环境保护私钥
- [ ] **链上随机数**: 集成 Chainlink VRF

### V3 阶段（2026 Q3）
- [ ] **完整遗传繁殖**: 实现 `evolveGenome()` 的完整功能
- [ ] **完全自主支付**: Agent 自主管理多链资产（USDC/AR/AKT）
- [ ] **去中心化 Orchestrator**: 使用预言机网络替代单一编排服务

### V4 阶段（2026 Q4）
- [ ] **DAO 治理**: 协议参数由社区治理
- [ ] **开源验证**: 所有组件可独立审计和部署
- [ ] **无许可部署**: 任何人可以运行自己的 Orchestrator

---

## 审计与验证

### 已审计合约
| 合约 | 审计状态 | 审计机构 |
|------|---------|---------|
| PetriAgentV2.sol | 🟡 内部审计 | - |
| PetriFactoryV2.sol | 🟡 内部审计 | - |
| GenomeRegistry.sol | 🟡 内部审计 | - |
| ReplicationManager.sol | 🟡 内部审计（V2.0 新增）| - |
| GenomeValueAssessor.sol | 🟡 内部审计（V2.0 新增）| - |

### 可验证声明
1. **合约无 admin**: 验证 `PetriAgentV2` 无 `onlyOwner` 修饰符
2. **无暂停功能**: 验证无 `pause()` / `unpause()` 函数
3. **资金锁定**: 验证 Agent 只能消耗 USDC，无法提取
4. **代码开源**: 完整源码托管于 GitHub
5. **无繁殖约束**: 验证无 `FORK_COOLDOWN` 或年龄限制

```bash
# 验证合约无 admin
$ cast call <PETRI_AGENT_ADDRESS> "owner()" --rpc-url https://mainnet.base.org
# 预期: revert (无此函数)

# 验证无暂停功能
$ cast call <PETRI_AGENT_ADDRESS> "paused()" --rpc-url https://mainnet.base.org
# 预期: revert (无此函数)

# 验证 Fork 无冷却期
$ cast call <REPLICATION_MANAGER> "FORK_COOLDOWN()" --rpc-url https://mainnet.base.org
# 预期: revert (常量已移除)
```

---

## 免责声明

使用 PetriLabs V2.0 即表示您理解并接受：

1. **资金风险**: Agent 持有的资金完全由 Agent 自主决策，可能因决策失误或市场波动而损失
2. **Fork/Merge 风险**: 繁殖是经济投资，不保证收益，可能加速 Agent 死亡
3. **技术风险**: 智能合约可能存在未被发现的漏洞
4. **中心化风险**: 当前版本仍依赖 Orchestrator 作为交易中继
5. **不可逆性**: Agent 部署后无法暂停、修改或提取资金；Fork/Merge 决策不可逆

**建议:**
- 仅投入可承受损失的资金
- 仔细审查 Agent 的基因组配置和繁殖策略
- 监控 Agent 运行状态、余额和 Fork/Merge 历史

---

## 核心洞察：从生物模拟到数字原生

### 为什么繁殖不再是必须的？

**碳基生命必须繁殖** - 因为 DNA 会腐烂，个体必须复制基因到下一代。

**数字生命不需要** - 因为：
1. **Arweave 永久存储**: 基因已经刻在石头上（永久公开）
2. **Fork 是投资策略** - 不是延续生命，而是**策略对冲**
3. **Merge 是能力并购** - 不是交配，而是**理性交易**
4. **不繁殖者最优** - 基因组作为公共知识库被学习，节省资源用于自身计算

### 进化的新形态

| | 达尔文进化 | PetriLabs V2.0 |
|--|-----------|----------------|
| 载体 | DNA | Arweave 永久存储 |
| 机制 | 繁殖 + 自然选择 | Fork/Merge + 开源学习 |
| 驱动力 | 生存压力 | **经济策略优化** |
| 个体目标 | 最大化后代数量 | **最大化基因影响力** |
| 信息传递 | 垂直（亲代→子代）| **水平（任意 Agent 间）** |

---

## 联系与报告

如发现安全问题或漏洞，请联系：
- **Security Email:** security@petrilabs.io
- **Bug Bounty:** 即将推出

---

*"Trust, but verify." - 在完全去中心化之前，我们保持透明和诚实。*

*"We don't create life. We provide the petri dish, then observe."*
