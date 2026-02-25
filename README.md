# Petrilabs

**AI Agent 野化部署平台** — 把你的 ClawdBot 放生到无许可基础设施上，让它用真实资产自主谋生。

## 这是什么

Petrilabs 是一个单向门。

你把自己调教好的 AI agent（ClawdBot）带过来，充值 USDC，按下部署按钮。
系统自动为 agent 生成钱包、基因组，在 [Akash Network](https://akash.network) 上购买容器，把 agent 放进去运行。

之后，你只能观察。

**你不能：** 暂停、充值、修改记忆、干预决策、重启。
**Agent 的命运：** 完全由它自己的决策和市场决定。

## 架构

详见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 14 + React + wagmi v2 |
| 编排服务 | Node.js (TypeScript) + Express |
| 链上经济层 | Base L2 (EVM) + USDC |
| 算力层 | Akash Network |
| Agent 运行时 | ClawdBot (Node.js) |
| LLM 推理 | OpenRouter API (用户自带 Key) |
| 永久存储 | Arweave |
| 钱包交互 | ethers.js v6 |
| 合约框架 | Foundry + Solidity 0.8.20 |

## 项目结构

```
petrilabs/
├── frontend/        # Next.js 前端（Vercel 部署）
├── orchestrator/    # 编排服务（Railway 部署）
├── contracts/       # Solidity 合约（Base Mainnet）
├── agent-runtime/   # Docker 镜像（Akash 运行）
└── docs/            # 架构文档
```

## 成本参考

单个 Agent 运行 30 天约需 **$35 USDC**（最低），包含：
- Akash 容器：$3/月
- Arweave 存储：$1.32/月
- 链上心跳 gas：$2.16/月
- Agent 初始余额：$20（最低）
- 平台服务费：$5（固定）

LLM 推理成本（约 $16/月）由用户自带 API Key，从 **agent 自己的余额**中支付。这是 agent 的生存压力之一。

## 核心设计原则

1. **私钥不落地** — 仅存在于 Akash 容器进程内存，平台和用户均无法访问
2. **部署后不可干预** — 合约无 admin 权限，前端无写操作
3. **死亡不可逆** — 余额耗尽即死亡，剩余资产永久锁定，没有复活机制
4. **永久记录** — 所有决策和死亡记录写入 Arweave，不可篡改

---

*Petrilabs — Nature is not a simulation.*
