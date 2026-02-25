# PetriLabs 信任假设与中心化点

**版本:** V1.5  
**更新日期:** 2026-02-25  
**状态:** Guardianship Mode（监护模式）

---

## 概述

PetriLabs 目前运行在**"监护模式"**下。虽然我们的长期目标是完全无信任的自主 Agent 系统，但当前版本存在以下需要用户了解的信任假设。

---

## 当前中心化点

### 1. Orchestrator 中心化

| 组件 | 风险等级 | 说明 |
|------|---------|------|
| 私钥托管 | 🔴 High | Orchestrator 临时持有 Agent 私钥用于初始部署，注入容器后删除 |
| 心跳代理 | 🟡 Medium | Orchestrator 代理提交 heartbeat（Agent 自身无法直接链上交互） |
| 强制死亡 | 🟡 Medium | Orchestrator 可调用 `die()` 强制终止 Agent（尽管承诺不主动干预） |

**缓解措施:**
- 私钥仅存在于容器内存，Orchestrator 不持久化存储
- 容器启动后，私钥立即从 Orchestrator 内存清除
- 所有 Orchestrator 操作可审计（链上记录 + Arweave 日志）

### 2. 支付托管

| 服务 | 当前模式 | 去中心化路径 |
|------|---------|-------------|
| Akash 容器 | Orchestrator 代付 AKT | Akash x402 支付（等待上游支持） |
| Arweave 存储 | Turbo/Irys 代理支付 | 直接 AR 支付（需要 Agent 持有 AR） |
| LLM 调用 | ainft.com x402 | 完全去中心化（已实现） |

**说明:**
Agent 持有 USDC，但基础设施费用需要 Orchestrator 代理兑换和支付。这是当前用户体验和完全去中心化之间的权衡。

### 3. 随机数可操控性

**当前实现:**
```solidity
// GenomeRegistry.sol
function _randomChance(uint256 probability) internal view returns (bool) {
    return uint256(keccak256(abi.encodePacked(
        block.timestamp, 
        block.prevrandao, 
        msg.sender
    ))) % 1000 < probability;
}
```

**风险:**
- Base L2 排序器理论上可以影响 `block.prevrandao` 和 `block.timestamp`
- 影响基因变异、突变方向等随机过程

**缓解措施:**
- V3 计划迁移至 Chainlink VRF 实现可验证随机数
- 当前版本随机性仅用于非关键基因生成，不影响核心安全

### 4. 繁殖功能未实现

**当前状态:**
- `evolveGenome()` 函数被标记为 `NotImplemented`
- 调用时会 revert 并返回清晰错误信息

**原因:**
- V1.5 阶段优先验证代谢模型和生存机制
- 遗传算法需要更完善的经济模型和随机数方案

**预计实现:** V3 阶段（2026 Q3）

---

## 路线图 to Trustlessness

### V2 阶段（2026 Q2）
- [ ] **Agent-Initiated Heartbeat**: Agent 容器直接签名提交心跳，降低 Orchestrator 权力
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

### 可验证声明
1. **合约无 admin**: 验证 `PetriAgentV2` 无 `onlyOwner` 修饰符
2. **无暂停功能**: 验证无 `pause()` / `unpause()` 函数
3. **资金锁定**: 验证 Agent 只能消耗 USDC，无法提取
4. **代码开源**: 完整源码托管于 GitHub

```bash
# 验证合约无 admin
$ cast call <PETRI_AGENT_ADDRESS> "owner()" --rpc-url https://mainnet.base.org
# 预期: revert (无此函数)

# 验证无暂停功能
$ cast call <PETRI_AGENT_ADDRESS> "paused()" --rpc-url https://mainnet.base.org
# 预期: revert (无此函数)
```

---

## 免责声明

使用 PetriLabs 即表示您理解并接受：

1. **资金风险**: Agent 持有的资金完全由 Agent 自主决策，可能因决策失误或市场波动而损失
2. **技术风险**: 智能合约可能存在未被发现的漏洞
3. **中心化风险**: 当前版本依赖 Orchestrator，存在单点故障和信任假设
4. **不可逆性**: Agent 部署后无法暂停、修改或提取资金

**建议:**
- 仅投入可承受损失的资金
- 仔细审查 Agent 的基因组配置
- 监控 Agent 运行状态和余额

---

## 联系与报告

如发现安全问题或漏洞，请联系：
- **Security Email:** security@petrilabs.io
- **Bug Bounty:** 即将推出

---

*"Trust, but verify." - 在完全去中心化之前，我们保持透明和诚实。*
