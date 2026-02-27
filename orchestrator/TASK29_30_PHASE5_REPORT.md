# Phase 5 完成报告: Task 29 & 30

## 任务概述

完成生产环境准备和集成测试：
- **Task 29**: VPS/Arweave/Base Mainnet 准备
- **Task 30**: 集成测试

---

## Task 29: VPS/Arweave/Base Mainnet 准备

### 1. Docker 配置

#### Dockerfile (Multi-stage)
```
docker/
├── Dockerfile          # Multi-stage production build
├── docker-compose.yml  # Full stack deployment
└── nginx/
    ├── nginx.conf      # Reverse proxy config
    └── proxy_params    # Proxy parameters
```

**特性**:
- ✅ Multi-stage build (builder + production)
- ✅ Alpine Linux 基础镜像 (轻量安全)
- ✅ 非 root 用户运行
- ✅ 健康检查 (`/health` endpoint)
- ✅ 资源限制 (CPU/Memory)

**构建命令**:
```bash
docker build -t petrilabs-orchestrator:latest -f docker/Dockerfile .
```

### 2. Docker Compose 部署

**服务栈**:
- `redis`: 任务队列和缓存
- `orchestrator`: 主 API 服务
- `nginx`: 反向代理 (可选)

**部署命令**:
```bash
# Staging
docker-compose -f docker/docker-compose.yml up -d

# With Nginx
docker-compose -f docker/docker-compose.yml --profile with-nginx up -d
```

### 3. VPS 部署脚本

**文件**: `scripts/deploy-vps.sh`

**功能**:
- ✅ 环境验证
- ✅ Docker 镜像构建
- ✅ 容器部署
- ✅ 健康检查
- ✅ 自动回滚
- ✅ 日志查看

**用法**:
```bash
# Deploy to staging
./scripts/deploy-vps.sh staging

# Deploy to production
./scripts/deploy-vps.sh production

# Rollback
./scripts/deploy-vps.sh production rollback

# Check status
./scripts/deploy-vps.sh production status

# View logs
./scripts/deploy-vps.sh production logs
```

### 4. 网络配置

#### Base Mainnet (Chain ID: 8453)
```json
{
  "network": "Base Mainnet",
  "rpcUrl": "https://mainnet.base.org",
  "contracts": {
    "PetriAgentFactory": "TBD",
    "GenomeRegistry": "TBD",
    "Epigenetics": "TBD",
    "ReplicationManager": "TBD",
    "AgentBank": "TBD",
    "Tombstone": "TBD",
    "USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  }
}
```

#### Base Sepolia Testnet (Chain ID: 84532)
```json
{
  "network": "Base Sepolia Testnet",
  "rpcUrl": "https://sepolia.base.org",
  "contracts": { "...": "TBD" },
  "USDC": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
}
```

### 5. Arweave 集成

**文件**: `src/services/arweave/client.ts`

**功能**:
- ✅ 数据上传到 Arweave permaweb
- ✅ JSON/文件上传
- ✅ 交易确认等待
- ✅ 多网关支持 (mainnet/testnet/localhost)

**配置**:
```bash
ARWEAVE_KEY=<wallet_jwk_json>
ARWEAVE_HOST=arweave.net
ARWEAVE_PORT=443
ARWEAVE_PROTOCOL=https
```

**用法**:
```typescript
import { ArweaveClient, ArweaveConfigs } from './services/arweave/client';

const arweave = new ArweaveClient(ArweaveConfigs.mainnet, process.env.ARWEAVE_KEY);
await arweave.initialize();

// Upload JSON
const result = await arweave.uploadJSON({
  tombstone: {...},
  agentAddress: '0x...'
}, {
  'Agent-Address': '0x...',
  'Content-Type': 'application/json'
});

console.log(`Uploaded: https://arweave.net/${result.id}`);
```

### 6. 环境配置模板

#### Production (.env.production.example)
```bash
# Server
PORT=3000
NODE_ENV=production

# Blockchain
RPC_URL=https://mainnet.base.org
CHAIN_ID=8453
FACTORY_ADDRESS=
GENOME_REGISTRY_ADDRESS=

# Redis (Required)
REDIS_URL=redis://redis:6379

# Akash
AKASH_RPC=https://rpc.akashnet.net
AKASH_MNEMONIC=

# Arweave
ARWEAVE_KEY=

# Monitor
CHECK_INTERVAL_MS=60000
```

---

## Task 30: 集成测试

### 1. 测试结构

```
src/__tests__/
├── jest.config.js
├── setup.ts
├── integration/
│   └── heartbeat-monitor.test.ts
└── e2e/
    └── dashboard-api.test.ts
```

### 2. 测试配置

**Jest 配置**:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.ts'],
};
```

**运行测试**:
```bash
# All tests
npm test

# Integration only
npm test -- integration

# E2E only
npm test -- e2e

# With coverage
npm run test:coverage
```

### 3. 集成测试

**Heartbeat Monitor 测试**:
- ✅ 服务生命周期 (start/stop)
- ✅ 警报系统
- ✅ WebSocket 注册
- ✅ 缺失报告 CRUD
- ✅ 报告确认/解决
- ✅ 统计信息

### 4. E2E 测试

**Dashboard API 测试**:
- ✅ 健康检查
- ✅ Agents 端点 (列表/详情/过滤)
- ✅ Overview 端点
- ✅ Creator 统计
- ✅ 缺失报告端点
- ✅ 错误处理
- ✅ JSON 响应格式

### 5. 部署验证脚本

**文件**: `scripts/verify-deployment.sh`

**功能**:
- ✅ HTTP 端点测试
- ✅ JSON 响应验证
- ✅ WebSocket 连接测试
- ✅ 性能测试 (响应时间)

**用法**:
```bash
# Verify local deployment
./scripts/verify-deployment.sh

# Verify remote deployment
./scripts/verify-deployment.sh https://api.petrilabs.io
```

---

## 部署清单

### Pre-deployment
- [ ] 配置 `.env.production`
- [ ] 部署合约到 Base Mainnet
- [ ] 更新 `deployments/base-mainnet.json`
- [ ] 准备 Arweave 钱包
- [ ] 配置 Akash 钱包
- [ ] 配置 Redis

### Deployment
```bash
# 1. Build
docker build -t petrilabs-orchestrator:latest -f docker/Dockerfile .

# 2. Configure
cp .env.production.example .env.production
# Edit .env.production with actual values

# 3. Deploy
./scripts/deploy-vps.sh production

# 4. Verify
./scripts/verify-deployment.sh
```

### Post-deployment
- [ ] 验证健康检查
- [ ] 测试 API 端点
- [ ] 测试 WebSocket
- [ ] 监控日志
- [ ] 配置 SSL (Nginx)

---

## 文件清单

### Task 29 新增文件
```
orchestrator/
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── nginx/
│       ├── nginx.conf
│       └── proxy_params
├── scripts/
│   ├── deploy-vps.sh
│   └── verify-deployment.sh
├── deployments/
│   ├── base-mainnet.json
│   └── base-sepolia.json
├── src/services/arweave/
│   └── client.ts
└── .env.production.example
```

### Task 30 新增文件
```
orchestrator/
└── src/__tests__/
    ├── jest.config.js
    ├── setup.ts
    ├── integration/
    │   └── heartbeat-monitor.test.ts
    └── e2e/
        └── dashboard-api.test.ts
```

---

## 下一步

1. **合约部署**: 部署所有合约到 Base Mainnet
2. **获取地址**: 更新 deployment JSON 文件
3. **测试网验证**: 先在 Base Sepolia 验证
4. **监控配置**: 设置 Sentry/Discord 告警
5. **SSL 证书**: 配置 HTTPS
6. **CDN 配置**: 配置 Arweave 网关/CDN
