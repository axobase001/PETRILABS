# Petrilabs 编排器 API 文档

**Base URL:** `https://api.petrilabs.xyz` (生产) / `http://localhost:3001` (本地)

---

## REST API

### POST /api/memory/validate

校验用户上传的记忆文件。

**Request:**
```
Content-Type: multipart/form-data
Body: { file: File }
```

**Response (200 OK):**
```json
{
  "valid": true,
  "preview": {
    "agentName": "ClawdBot-Alpha",
    "version": "1.0",
    "personalityTraits": ["curious", "risk-averse"],
    "riskLevel": "medium",
    "experienceCount": 12,
    "goalCount": 3
  },
  "features": {
    "riskKeywordScore": 0.3,
    "explorationScore": 0.7,
    "socialScore": 0.4,
    "experienceDepth": 0.6
  }
}
```

**Response (400 Bad Request):**
```json
{
  "valid": false,
  "error": "Missing required field: personality.description"
}
```

---

### GET /api/akash/quote

获取 Akash 当前容器报价（缓存 10 分钟）。

**Response (200 OK):**
```json
{
  "containerCostPerMonth": 3.00,
  "containerDeposit": 1.50,
  "platformFee": 5.00,
  "quoteValidUntil": 1709000000000
}
```

---

### POST /api/deploy/start

启动部署流程（用户已完成链上充值后调用）。

**Request:**
```json
{
  "deploymentId": "uuid-v4",
  "depositTxHash": "0x...",
  "memoryFileB64": "base64编码的memory.json",
  "openrouterApiKey": "sk-or-...",
  "agentInitialBalanceUSDC": "20000000"
}
```

**Response (202 Accepted):**
```json
{
  "deploymentId": "uuid-v4",
  "wsEndpoint": "wss://api.petrilabs.xyz/ws/deploy/uuid-v4",
  "estimatedCompletionSeconds": 120
}
```

---

### GET /api/agents/:agentAddress

获取 agent 当前状态（轮询备用，主要用 WebSocket）。

**Response (200 OK):**
```json
{
  "agentAddress": "0x...",
  "status": "ALIVE",
  "balanceUSDC": "45000000",
  "balanceETH": "1500000000000000",
  "lastHeartbeatBlock": 18500000,
  "tickCount": 2847,
  "deployedAt": 1709000000000
}
```

---

## WebSocket API

### WS /ws/deploy/{deploymentId}

部署步骤实时推送。

**消息格式:**
```json
{
  "deploymentId": "uuid-v4",
  "step": "WALLET_GENERATED",
  "status": "done",
  "detail": "Agent wallet created: 0x..."
}
```

**步骤顺序:**
1. `GENOME_GENERATED`
2. `WALLET_GENERATED`
3. `USDC_TRANSFERRED`
4. `AGENT_REGISTERED`
5. `AKASH_LEASE_CREATED`
6. `CONTAINER_DEPLOYED`
7. `CONTAINER_STARTED` — 携带 `agentAddress` 字段

---

### WS /ws/agent/{agentAddress}

Agent 状态实时推送（30秒/次）。

**消息格式:**
```json
{
  "agentAddress": "0x...",
  "balanceUSDC": "45000000",
  "balanceETH": "1500000000000000",
  "lastHeartbeatBlock": 18500000,
  "status": "ALIVE",
  "lastAction": "SWAP: USDC→ETH $5.00",
  "tickCount": 2847,
  "updatedAt": 1709000000000
}
```
