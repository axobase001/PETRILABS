# PETRILABS - AI Agent Wild Deployment Platform

> 把你的 AI Agent 放生到无许可基础设施上，让它用真实资产自主谋生。

## 核心特性

### 🧬 动态基因组
- 60+ 基因，32 个功能域
- 记忆文件驱动生成（LLM分析）
- 表观遗传修饰（环境响应）

### 🔒 完全单向门
- 部署后不可暂停/修改/干预
- 私钥仅存在于容器内存
- 使用 HashiCorp Vault 安全托管

### 💰 无感化支付
- **Akash**: USDC 原生支付（无需AKT）
- **Arweave**: Turbo SDK + x402 协议（Base L2 USDC 直付）
- **LLM**: ainft.com x402 支付

### 🤖 自主运行
- 基于基因组的决策引擎
- 可插拔 Skill 系统
- 定期心跳维持存活

## 快速开始

### 1. 部署 Agent
```bash
# 前端
cd frontend && npm run dev

# 打开 http://localhost:3000
# 1. 连接钱包
# 2. 上传记忆文件
# 3. 确认成本明细
# 4. 一键部署
```

### 2. 查看 Agent
```
/My Agents 页面
- 查看所有部署的 Agent
- 实时监控状态和余额
- 基因组可视化
```

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        用户层                                │
│              Next.js + wagmi + RainbowKit                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      编排服务层                              │
│  Express + HashiCorp Vault + ArweaveProxy + Akash + ainft.com │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      区块链层 (Base L2)                       │
│   GenomeRegistry | PetriFactoryV2 | PetriAgentV2 | USDC     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      运行时层 (Akash)                        │
│   ClawBot | x402 LLM | Proxy Storage | USDC Payments        │
└─────────────────────────────────────────────────────────────┘
```

## 支付流程

### 部署前 (用户支付)
| 项目 | 服务 | 支付方式 | 成本 |
|------|------|---------|------|
| LLM基因组分析 | OpenRouter | 用户API Key | ~$3 |
| 永久存储 | Arweave | 用户USDC→AR | ~$1 |
| 容器押金 | Akash | 用户USDC→Agent | ~$30-45 |
| 平台费 | PETRILABS | 用户USDC | $5 |
| **总计** | | | **~$40-55** |

### 运行时 (Agent自治)
| 项目 | 服务 | 支付方式 | 日成本 |
|------|------|---------|--------|
| 容器租赁 | Akash | Agent USDC | ~$1.5 |
| 数据存储 | Arweave | Agent USDC→AR | ~$0.1 |
| LLM推理 | ainft.com | Agent x402 | ~$0.5-2 |
| **总计** | | | **~$2-4/天** |

## 安全设计

### 私钥管理
```
1. 编排服务生成钱包
2. 私钥存入 HashiCorp Vault
3. 容器启动时一次性获取
4. Vault 立即删除私钥
5. 私钥仅存容器内存
6. 容器销毁 = 私钥永久丢失
```

### 单向门验证
- ✅ 合约无 admin 权限
- ✅ 无 pause/unpause 功能
- ✅ 资金只能消耗，无法提取
- ✅ 编排服务部署后断连
- ✅ 任何人都无法干预

## 模块

```
petrilabs/
├── contracts/          # Solidity 智能合约
├── orchestrator/       # Node.js 编排服务
├── agent-runtime/      # Docker Agent 运行时
├── skills/             # 预装 Skills
├── frontend/           # Next.js 前端
└── docs/               # 文档
```

## 文档

- [架构设计](docs/ARCHITECTURE.md)
- [支付架构](docs/PAYMENT_ARCHITECTURE.md)
- [安全审查](docs/SECURITY_AUDIT.md)
- [单向门验证](docs/ONE_WAY_DOOR_VERIFICATION.md)
- [集成指南](docs/INTEGRATION_GUIDE.md)

## License

MIT
