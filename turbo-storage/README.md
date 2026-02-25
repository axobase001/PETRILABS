# PetriLabs Turbo Storage

> 基于 Turbo SDK + x402 协议的 AI Agent 统一存储层

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 18+](https://img.shields.io/badge/node-18%2B-brightgreen)](https://nodejs.org/)

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                     PetriLabs Agent Runtime                      │
│                    (Node.js 18+ on Akash)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Genesis    │    │   Log Buffer │    │    Flush     │       │
│  │   Upload     │◄──►│   (Memory)   │◄──►│   Trigger    │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                    │               │
│         ▼                   ▼                    ▼               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              PetriStorage (Singleton)                     │   │
│  │  • Bundle: Gzip + JSON/JSONL                             │   │
│  │  • Payment: x402 + Base USDC                             │   │
│  │  • Upload: Turbo SDK                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │ x402-over-HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Turbo Upload Service                       │
│                    (x402 Payment Gateway)                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Return 402 + Invoice                                         │
│  2. Receive signed payment proof                                 │
│  3. Upload to Arweave                                            │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Arweave Network                          │
│                    (Permanent Data Storage)                      │
└─────────────────────────────────────────────────────────────────┘
```

## 特性

- ✅ **单一代币**: 全程使用 Base L2 USDC，无需 AR 代币
- ✅ **x402 协议**: 标准 HTTP 402 Payment Required 流程
- ✅ **追加写入**: 日志使用 Append-only 模式，支持 Merkle 验证
- ✅ **自动缓冲**: 内存缓冲 + 定时/阈值刷盘
- ✅ **数据压缩**: Gzip 压缩，节省存储成本
- ✅ **乐观确认**: Turbo 即时确认，无需等待 Arweave 区块

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入你的配置
```

### 3. 运行 CLI

```bash
# 查看余额
node cli.js balance

# 上传 Genesis 数据
node cli.js genesis --file ./genome.json --agent-id alpha-0

# 流式上传日志
node cli.js stream --source ./logs/app.log

# 手动刷盘
node cli.js flush

# 查看状态
node cli.js status
```

## 环境变量配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TURBO_UPLOAD_URL` | Turbo 上传端点 | `https://turbo.ardrive.io` |
| `WALLET_PRIVATE_KEY` | Base L2 钱包私钥 | - |
| `BASE_RPC_URL` | Base 网络 RPC | `https://mainnet.base.org` |
| `USDC_CONTRACT` | USDC 合约地址 | Base 主网地址 |
| `BUFFER_SIZE` | 日志缓冲阈值 | `1000` |
| `FLUSH_INTERVAL` | 强制刷盘间隔 (ms) | `21600000` (6小时) |
| `AGENT_ID` | Agent 唯一标识 | - |

## API 使用

### 程序化 API

```javascript
import { getPetriStorage } from '@petrilabs/turbo-storage';

// 获取存储实例
const storage = getPetriStorage();

// 上传 Genesis
const genesis = await storage.uploadGenesis({
  genes: [...],
  traits: {...},
  metadata: {...}
});
console.log('Genesis TX:', genesis.txId);

// 追加日志
storage.appendLog({
  type: 'decision',
  prompt: 'What should I do?',
  output: 'I will...',
  behavior: 'action',
  metadata: { temperature: 0.7 }
});

// 手动刷盘
await storage.flush();

// 查看状态
const stats = await storage.getStats();
console.log('Balance:', stats.balance.usdc);

// 优雅关闭
await storage.shutdown();
```

### x402 客户端

```javascript
import { getX402Client } from '@petrilabs/turbo-storage';

const x402 = getX402Client();

// 检查余额
const balance = await x402.getBalance();
console.log(`Balance: ${balance.formatted} USDC`);

// 执行带支付的请求
const response = await x402.executeWithPayment(
  async (headers = {}) => {
    return fetch('https://turbo.ardrive.io/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...headers,
      },
      body: data,
    });
  }
);
```

## 数据格式

### Genesis 数据包

```json
{
  "type": "Genesis",
  "agentId": "alpha-0",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "data": { /* 基因组数据 */ },
  "metadata": {
    "sessionId": "session-1705317000000",
    "bundlerVersion": "1.0.0"
  }
}
```

### 日志数据包 (JSON Lines)

```
# METADATA
{
  "type": "AgentLog",
  "agentId": "alpha-0",
  "session": "session-001",
  "startTime": 1705317000000,
  "endTime": 1705320600000,
  "count": 1000,
  "merkleRoot": "0xabc123..."
}
# LOGS
{"timestamp":1705317000000,"type":"decision","prompt":"...","output":"..."}
{"timestamp":1705317001000,"type":"action","behavior":"...","result":"..."}
...
```

### Arweave 标签

| 标签 | 说明 |
|------|------|
| `App-Name` | `PetriLabs` |
| `Type` | `Genesis` / `AgentLog` |
| `Agent-ID` | Agent 唯一标识 |
| `Session` | 会话 ID |
| `Content-Type` | `application/json` / `application/x-ndjson` |
| `Content-Encoding` | `gzip` |
| `Content-Hash` | SHA256 内容哈希 |
| `Merkle-Root` | 日志 Merkle Root |

## 测试网配置

### Base Sepolia (测试网)

```bash
# .env
BASE_RPC_URL=https://sepolia.base.org
USDC_CONTRACT=0x036CbD53842c5426634e7929541eC2318f3dCF7e
TEST_MODE=true
```

### 获取测试币

1. **Base Sepolia ETH**: [Base Faucet](https://www.base.org/faucets)
2. **USDC**: 使用 [Circle Testnet Faucet](https://faucet.circle.com/) 或从 Base 桥接

### Turbo 测试网

```bash
TURBO_UPLOAD_URL=https://upload.ardrive.dev
```

## x402 协议流程

```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│  Agent  │ ────── 1. POST ───►│  Turbo  │                    │         │
│         │                    │ Gateway │                    │         │
│         │ ◄──── 2. 402 ──────│         │                    │         │
│         │     + Invoice      │         │                    │         │
│         │                    │         │                    │         │
│         │ ── 3. Sign Proof ─►│         │                    │         │
│         │   (EIP-712)        │         │                    │         │
│         │                    │         │                    │         │
│         │ ── 4. POST + Proof►│         │ ─── 5. Verify ────►│  Base   │
│         │                    │         │                    │  L2     │
│         │                    │         │ ◄── 6. Confirm ────│         │
│         │                    │         │                    │         │
│         │ ◄──── 7. 200 ──────│         │ ─── 8. Upload ────►│ Arweave │
│         │    + TX ID         │         │                    │         │
└─────────┘                    └─────────┘                    └─────────┘
```

## 部署到 Akash

### 1. 构建容器镜像

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
ENV NODE_ENV=production

CMD ["node", "cli.js", "stream"]
```

### 2. SDL 配置

```yaml
version: "2.0"
services:
  petri-storage:
    image: petrilabs/turbo-storage:latest
    env:
      - WALLET_PRIVATE_KEY=<encrypted_secret>
      - AGENT_ID=alpha-0
      - TURBO_UPLOAD_URL=https://turbo.ardrive.io
    expose:
      - port: 3000
        as: 80
        to:
          - global: true
```

## 成本估算

| 操作 | 预估成本 | 说明 |
|------|---------|------|
| Genesis 上传 | ~$0.5-2 | 取决于基因组大小 |
| 每 1000 条日志 | ~$0.01-0.05 | Gzip 压缩后 |
| 每日运行 (6h flush) | ~$0.1-0.5 | 频繁决策的 Agent |

## 故障排除

### 余额不足

```
❌ Insufficient USDC balance: 0.05 < 1
```

解决方案：
1. 从 Base 桥接 USDC 到钱包地址
2. 或使用测试网模式

### 402 支付失败

```
⚠️  Payment failed: Invalid signature
```

检查：
1. `WALLET_PRIVATE_KEY` 是否正确
2. `BASE_RPC_URL` 是否可达
3. 钱包是否有足够 ETH 支付 gas

### 上传超时

```
⚠️  Request timeout
```

增加超时配置：
```bash
REQUEST_TIMEOUT=120000  # 2分钟
```

## 安全建议

1. **私钥管理**: 生产环境使用 HashiCorp Vault / AWS Secrets Manager
2. **速率限制**: 启用 `MAX_RETRIES` 和 `BUFFER_SIZE` 防止滥用
3. **监控**: 设置余额告警 (低于 5 USDC 时通知)
4. **加密**: 敏感日志使用 `ENCRYPTION_KEY` 加密后再上传

## 许可证

MIT © PetriLabs

## 相关链接

- [Turbo SDK Docs](https://docs.ardrive.io/docs/turbo/what-is-turbo.html)
- [x402 Protocol](https://x402.org)
- [Arweave](https://arweave.org)
- [Base](https://base.org)
