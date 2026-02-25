# PETRILABS Integration Guide

## 支付架构总览

```
部署前 (用户支付)
├── LLM基因组分析 → OpenRouter/API (用户直接支付)
├── Arweave存储押金 → 用户USDC → 编排代理
├── Akash押金 → 用户USDC → Agent合约
└── 平台费 → 平台接收

部署后 (Agent自治支付)
├── LLM推理 → ainft.com + x402 (Agent余额支付)
├── Akash容器 → USDC原生 (Agent余额支付)
└── Arweave存储 → 编排代理 (Agent USDC余额代付)
```

## ainft.com 集成

### 什么是 ainft.com？
ainft.com 是一个去中心化的LLM市场，支持：
- 多种模型（Claude、GPT等）
- x402 加密货币支付协议
- 无需API key，钱包即身份

### x402 工作流程

```
┌─────────┐        ┌─────────┐        ┌─────────┐
│  Agent  │ ──1──▶ │ainft.com│        │         │
│         │ ◀─402──│         │        │         │
│         │        │  "Pay   │        │         │
│         │        │   0.01  │        │         │
│         │        │   USDC" │        │         │
│         │        │         │        │         │
│         │ ──2──▶ │         │        │         │
│         │ "OK,   │         │        │         │
│         │  here  │         │        │         │
│         │  is    │         │        │         │
│         │  sig"  │         │        │         │
│         │        │         │        │         │
│         │ ◀─200──│         │        │         │
│         │ "LLM   │         │        │         │
│         │  resp" │         │        │         │
└─────────┘        └─────────┘        └─────────┘
```

## 模块集成

### 1. 编排服务 (Orchestrator)

#### 部署时支付
```typescript
// 用户预支付LLM分析费用
const llmService = new LLMService(); // 使用API key
const analysis = await llmService.analyzeMemory(content);

// 计算总成本
const costs = paymentService.calculateDeploymentCosts(
  fileSize,
  contentLength,
  runwayDays
);

// 用户确认后部署
```

#### API 端点
```
POST /api/agents
- 计算成本
- 创建部署任务
- 返回成本明细和jobId

GET /api/agents/:jobId/status
- 查询部署进度
- 返回实时状态

GET /api/costs/estimate
- 预估部署成本
- 输入：文件大小、期望runway
```

### 2. Agent 运行时 (Runtime)

#### 运行时 x402 支付
```typescript
// Agent 使用 x402 支付 LLM 调用
const llmService = new LLMService({
  privateKey: process.env.PRIVATE_KEY,
  walletAddress: agentAddress,
  chainId: 84532,
});

// 每次决策时自动支付
const decision = await llmService.complete({
  model: 'claude-3-sonnet',
  messages: [...],
});
```

#### 配置
```env
# 必需
PRIVATE_KEY=0x...           # Agent私钥
AGENT_ADDRESS=0x...         # Agent地址

# x402 配置
X402_MAX_COST=1000000       # 单次调用最大1 USDC

# Fallback
OPENROUTER_API_KEY=sk-...   # 备用API key
```

### 3. 前端 (Frontend)

#### 显示成本明细
```tsx
<CostBreakdown costs={{
  breakdown: [...],
  totalUpfront: 45.50,
  dailyTotal: 3.20,
  estimatedRunwayDays: 30,
}} />
```

#### 支付确认流程
1. 用户上传记忆文件
2. 前端请求成本估算
3. 显示详细成本分解
4. 用户确认支付
5. 调用部署API

## 环境变量配置

### 编排服务
```env
# LLM (部署时使用)
LLM_API_KEY=sk-or-v1-...        # OpenRouter API key
LLM_MODEL=claude-3-opus

# 区块链
RPC_URL=https://sepolia.base.org
PRIVATE_KEY=0x...               # 编排服务私钥

# 合约地址
GENOME_REGISTRY_ADDRESS=0x...
PETRI_FACTORY_V2_ADDRESS=0x...
USDC_ADDRESS=0x...

# Redis
REDIS_URL=redis://localhost:6379

# Arweave 代理配置
ARWEAVE_WALLET_KEY=...           # 编排托管钱包 JWK (Base64)
ARWEAVE_RPC=https://arweave.net
ONE_INCH_API_KEY=...             # 用于 USDC→AR 兑换
COINBASE_API_KEY=...             # 备用汇率源
```

### Agent 运行时
```env
# Agent 身份
AGENT_ADDRESS=0x...
GENOME_HASH=0x...
PRIVATE_KEY=0x...               # Agent私钥（仅在容器内）

# 区块链
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532

# x402 配置
X402_MAX_COST_PER_REQUEST=1000000  # 1 USDC

# Fallback LLM
OPENROUTER_API_KEY=sk-or-v1-...
```

### 前端
```env
NEXT_PUBLIC_ORCHESTRATOR_URL=https://api.petrilabs.io
NEXT_PUBLIC_GENOME_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_PETRI_FACTORY_V2_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
```

## 测试流程

### 1. 本地测试
```bash
# 1. 启动本地节点
npm run node

# 2. 部署合约
npm run deploy:local

# 3. 启动编排服务
cd orchestrator
npm run dev

# 4. 启动前端
cd frontend
npm run dev
```

### 2. 测试支付流程
```bash
# 测试部署前支付
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: multipart/form-data" \
  -F "memoryFile=@test.txt" \
  -F "initialDeposit=100000000" \
  -F "creatorAddress=0x..."

# 测试 x402 (运行时)
# 在Agent容器内测试LLM调用
```

## 故障排除

### x402 支付失败
1. 检查Agent USDC余额
2. 检查x402配置
3. 查看ainft.com状态
4. 启用fallback到OpenRouter

### 部署失败
1. 检查用户USDC授权
2. 检查Arweave key
3. 检查LLM API key余额
4. 查看编排服务日志

### Agent 死亡
1. 检查Agent余额
2. 检查心跳状态
3. 查看Arweave存储
4. 分析决策日志

## 安全考虑

1. **私钥管理**
   - Agent私钥仅存在于容器内存
   - 永不写入磁盘
   - 容器销毁则私钥丢失

2. **支付限制**
   - x402有单次支付上限
   - 每日LLM调用次数限制
   - 余额预警机制

3. **降级机制**
   - ainft.com失败 → OpenRouter
   - x402失败 → 休眠模式
   - 低余额 → 减少决策频率

## 监控

### 关键指标
- Agent存活率
- 平均余额/runway
- LLM调用成功率
- x402支付成功率
- 部署成功率

### 告警
- Agent死亡告警
- 低余额告警（<7天）
- 支付失败告警
- 部署失败告警

## 资源

- [ainft.com docs](https://docs.ainft.com)
- [x402 protocol](https://x402.org)
- [Akash network](https://akash.network)
- [Arweave](https://arweave.org)
