# PetriLabs Turbo Storage 架构文档

> Arweave 统一存储层 - 基于 Turbo SDK + x402 协议

## 目录

1. [架构概述](#架构概述)
2. [核心组件](#核心组件)
3. [数据流](#数据流)
4. [支付协议](#支付协议)
5. [部署指南](#部署指南)
6. [与旧架构对比](#与旧架构对比)

---

## 架构概述

### 为什么需要 Turbo Storage？

**旧架构的问题：**
- Irys 服务被社区抵制（中心化风险）
- 需要用户购买 AR 代币（门槛高）
- 代理存储模式复杂（需要汇率转换）

**新架构的优势：**
- ✅ **Turbo SDK**: Arweave 官方 SDK，直接锚定到 Arweave 区块
- ✅ **x402 协议**: 标准支付协议，Base L2 USDC 支付
- ✅ **无需 AR 代币**: 全程 USDC，用户体验一致
- ✅ **无代理风险**: Agent 直接支付，编排服务不托管资金

### 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User (Wallet)                                   │
│                         持有: Base L2 USDC                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼ Deploy
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Agent Runtime                                     │
│                    (Akash Container / Node.js)                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        PetriStorage (Singleton)                       │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ Log Buffer   │  │   Bundler    │  │   x402 Pay   │               │   │
│  │  │ (Memory)     │─►│ (Gzip+JSONL) │─►│ (USDC Sign)  │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                       │                                      │
│                                       ▼ x402-over-HTTPS                      │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Turbo SDK (@ardrive/turbo-sdk)                   │   │
│  │              402 Handshake → Payment → Arweave Upload                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Arweave Network (Layer 1)                            │
│                        Permanent Data Storage                                │
│  • Genesis: /{txId} → Genome Data                                           │
│  • Logs: /{txId} → JSON Lines (Merkle Verified)                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 核心组件

### 1. PetriStorage (核心存储类)

**位置**: `turbo-storage/src/storage.js`

**职责**:
- 单例模式管理存储生命周期
- 内存缓冲区管理 (默认 1000 条)
- 定时刷盘 (默认 6 小时)
- Genesis 一次性上传

**关键方法**:
```typescript
class PetriStorage {
  async uploadGenesis(genomeData: object): Promise<UploadResult>
  appendLog(logEntry: LogEntry): LogEntry
  async flush(): Promise<UploadResult>
  async shutdown(): Promise<void>
}
```

### 2. X402Client (支付客户端)

**位置**: `turbo-storage/src/x402.js`

**职责**:
- 管理 Base L2 钱包
- EIP-712 签名支付证明
- 自动重试机制

**支付流程**:
```
1. 发送请求 → 收到 402 + Invoice
2. 解析发票 (recipient, amount, nonce, timestamp)
3. EIP-712 签名
4. 携带 proof 重试
5. 收到 200 + Arweave TX ID
```

### 3. TurboClient (上传客户端)

**位置**: `turbo-storage/src/turbo-client.js`

**职责**:
- Turbo SDK 封装
- 文件上传
- 成本估算

### 4. Bundler (数据打包)

**位置**: `turbo-storage/src/bundler.js`

**职责**:
- Genesis: Gzip JSON
- Logs: Gzip JSON Lines + Merkle Root
- 内容哈希验证

**Merkle Tree 结构**:
```
         Root (Hash)
        /           \
    Hash(0-1)     Hash(2-3)
    /      \       /      \
 H(0)    H(1)   H(2)    H(3)   <- 每条日志的 SHA256
```

---

## 数据流

### Genesis 上传流程

```
Agent 部署
    │
    ▼
┌─────────────────┐
│ 读取 genome.json │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Bundle (Gzip)   │
│ • Add metadata  │
│ • Content hash  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ x402 Payment    │
│ • Check balance │
│ • Sign proof    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Turbo Upload    │
└────────┬────────┘
         │
         ▼
    Arweave TX ID (保存到本地)
```

### 日志上传流程

```
Agent 运行
    │
    ├──► appendLog() ──► 内存缓冲区
    │                        │
    │                        ▼
    │              ┌─────────────────┐
    │              │ Buffer full?    │──No──► 等待
    │              │ OR timer fired? │
    │              └────────┬────────┘
    │                       Yes
    ▼                        │
心跳上链 ◄── flush() ◄───────┘
    │
    ▼
Arweave TX ID 写入链上
```

---

## 支付协议

### x402 协议详解

**什么是 x402?**
x402 是一种基于 HTTP 402 Payment Required 状态的支付协议，允许服务要求客户端在上传数据前进行加密货币支付。

**为什么适合 PetriLabs?**
- 无需预充值，按需支付
- 标准 HTTP 协议，易于实现
- 支持 Base L2，gas 费低

**协议流程**:

```http
# 1. 初始请求
POST /upload HTTP/1.1
Content-Type: application/octet-stream

<binary data>

# 2. 402 响应
HTTP/1.1 402 Payment Required
x402-version: 2
x402-payment: base-usdc
x402-amount: 1000000  # 1 USDC (6 decimals)
x402-invoice: <base64({recipient, amount, nonce, timestamp})>

# 3. 签名支付
POST /upload HTTP/1.1
Content-Type: application/octet-stream
x402-version: 2
x402-payment: base-usdc
x402-amount: 1000000
x402-proof: <base64({recipient, amount, nonce, timestamp, signature, sender})>

<binary data>

# 4. 成功响应
HTTP/1.1 200 OK
x402-tx-hash: 0xabc...

{"id": "arweave-tx-id", "url": "https://arweave.net/..."}
```

### EIP-712 签名结构

```javascript
const domain = {
  name: 'x402 Payment Protocol',
  version: '2',
  chainId: 8453, // Base
};

const types = {
  Payment: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

const message = {
  recipient: '0x...',
  amount: '1000000',
  nonce: '1705317000000',
  timestamp: '1705317000',
};
```

---

## 部署指南

### 1. 本地开发

```bash
cd petrilabs/turbo-storage
npm install

# 配置环境
cp .env.example .env
# 编辑 .env 设置 WALLET_PRIVATE_KEY 等

# 测试 Genesis 上传
node cli.js genesis --file ./test-genome.json --agent-id test-0

# 测试日志流
echo '{"type":"test","message":"hello"}' | node cli.js stream
```

### 2. 集成到 Agent Runtime

```typescript
// agent-runtime/src/core/storage.ts
import { getPetriStorage } from '@petrilabs/turbo-storage';

export class AgentStorage {
  private storage = getPetriStorage();

  async uploadGenesis(genome: GenomeData) {
    return this.storage.uploadGenesis(genome);
  }

  logDecision(decision: Decision) {
    this.storage.appendLog({
      type: 'decision',
      timestamp: Date.now(),
      decision,
    });
  }

  async flush() {
    return this.storage.flush();
  }
}
```

### 3. Akash 部署

```yaml
# deploy.yaml
version: "2.0"
services:
  petri-agent:
    image: petrilabs/agent:latest
    env:
      - AGENT_ID=${AGENT_ID}
      - WALLET_PRIVATE_KEY=${WALLET_PRIVATE_KEY}
      - TURBO_UPLOAD_URL=https://turbo.ardrive.io
      - BUFFER_SIZE=1000
      - FLUSH_INTERVAL=21600000
    expose:
      - port: 8080
        as: 80
        to:
          - global: true
    resources:
      cpu:
        units: 1
      memory:
        size: 2Gi
      storage:
        size: 10Gi
```

### 4. 监控

```bash
# 查看 Agent 存储状态
node cli.js status

# 输出示例:
# 📊 PetriLabs Storage Status
# 
# 🤖 Agent:
#   ID: alpha-0
#   Session: session-1705317000000
# 
# 💰 Balance:
#   Address: 0x...
#   USDC: 45.23
# 
# 📦 Genesis:
#   Uploaded: ✅ Yes
#   TX ID: abc123...
# 
# 📝 Buffer:
#   Size: 234/1000
#   Full: ✅ No
```

---

## 与旧架构对比

### 旧架构 (Irys + 代理模式)

```
用户 USDC ──► Irys (中心化) ──► Arweave (?)
                │
                └── 被社区抵制，不是真正的 Arweave

Agent USDC ──► 编排服务 ──► 兑换 AR ──► Arweave
                │
                └── 汇率风险，托管风险
```

### 新架构 (Turbo + x402)

```
用户 USDC ──► 无需操作 (Agent 自治)

Agent USDC ──► x402 Pay ──► Turbo (官方) ──► Arweave ✓
                │                │
                └── 标准协议      └── 官方 SDK，真正锚定
```

### 对比表

| 特性 | 旧架构 (Irys) | 新架构 (Turbo+x402) |
|------|--------------|---------------------|
| 代币需求 | USDC + AR | 仅 USDC |
| 支付协议 | 自定义 | 标准 x402 |
| Arweave 锚定 | 不确定 | 官方保证 |
| 中心化风险 | 高 (Irys) | 低 (Turbo=官方) |
| 代码复杂度 | 高 (代理+汇率) | 低 (直接支付) |
| Agent 自主性 | 依赖编排 | 完全自治 |

---

## 迁移指南

### 从旧架构迁移

1. **停止旧存储服务**
   ```bash
   # 停止 Irys 代理
   pm2 stop arweave-proxy
   ```

2. **更新 Agent Runtime**
   ```bash
   npm uninstall @irys/sdk
   npm install @ardrive/turbo-sdk
   ```

3. **更新配置**
   ```bash
   # 旧
   IRYS_NODE=https://node1.irys.xyz
   IRYS_TOKEN=ethereum
   
   # 新
   TURBO_UPLOAD_URL=https://turbo.ardrive.io
   WALLET_PRIVATE_KEY=0x...
   ```

4. **代码迁移**
   ```typescript
   // 旧
   import Irys from '@irys/sdk';
   const irys = new Irys({...});
   await irys.upload(data);
   
   // 新
   import { getPetriStorage } from '@petrilabs/turbo-storage';
   const storage = getPetriStorage();
   await storage.uploadGenesis(data);
   ```

---

## 附录

### 环境变量完整列表

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `WALLET_PRIVATE_KEY` | ✅ | - | Base L2 私钥 |
| `AGENT_ID` | ✅ | - | Agent 标识 |
| `TURBO_UPLOAD_URL` | ❌ | turbo.ardrive.io | Turbo 端点 |
| `BASE_RPC_URL` | ❌ | mainnet.base.org | RPC 节点 |
| `USDC_CONTRACT` | ❌ | 0x8335... | USDC 合约 |
| `BUFFER_SIZE` | ❌ | 1000 | 缓冲条数 |
| `FLUSH_INTERVAL` | ❌ | 21600000 | 刷盘间隔(ms) |
| `MAX_RETRIES` | ❌ | 3 | 重试次数 |
| `LOG_LEVEL` | ❌ | info | 日志级别 |

### 测试网配置

```bash
# .env
BASE_RPC_URL=https://sepolia.base.org
USDC_CONTRACT=0x036CbD53842c5426634e7929541eC2318f3dCF7e
TURBO_UPLOAD_URL=https://upload.ardrive.dev
TEST_MODE=true
```

### 获取测试币

1. **Base Sepolia ETH**: [Base Faucet](https://www.base.org/faucets)
2. **USDC**: [Circle Faucet](https://faucet.circle.com/)

---

## 相关文档

- [Turbo SDK Docs](https://docs.ardrive.io/docs/turbo/what-is-turbo.html)
- [x402 Protocol Spec](https://x402.org)
- [Arweave HTTP API](https://docs.arweave.org/developers/server/http-api)
- [Base Network Docs](https://docs.base.org)

---

**版本**: 1.0.0  
**最后更新**: 2024-01-15  
**作者**: PetriLabs Core Team
