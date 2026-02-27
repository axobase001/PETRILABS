# Phase 4 完成报告: Task 24 & 25

## 任务概述

实现平台服务层（Orchestrator），包含：
- **Task 24**: Heartbeat Monitor Service - 监控 Agent 存活状态，检测 Akash 容器崩溃，生成缺失报告
- **Task 25**: Dashboard API - REST API 和 WebSocket 实时更新

## 实现内容

### 1. 核心服务架构 (Task 24)

#### Heartbeat Monitor (`src/services/heartbeat/monitor.ts`)

**功能**:
- 周期性检查所有 Agent 的心跳状态（默认每 60 秒）
- 三级严重程度检测：
  - `warning` - 超过预期心跳间隔但未达临界值
  - `critical` - 接近死亡阈值（6小时内）
  - `abandoned` - 超过最大心跳间隔（7天），可被任何人宣告死亡
- Akash 容器状态检查（部署状态、健康检查）
- 使用 BullMQ 进行异步任务队列处理
- WebSocket 实时广播状态更新

**关键方法**:
```typescript
- start(): 启动监控服务
- checkAgent(address): 检查特定 Agent
- getHeartbeatStatus(address): 获取心跳状态
- handleMissingHeartbeat(report): 处理缺失心跳
- checkAkashDeployment(address): 检查 Akash 部署
```

#### Missing Report Service (`src/services/heartbeat/missing-report.ts`)

**功能**:
- 生成详细的缺失心跳报告
- 支持报告确认（acknowledge）和解决（resolve）
- 统计信息聚合
- 自动清理旧报告

**数据结构**:
```typescript
interface MissingReport {
  id: string;
  agentAddress: string;
  severity: 'warning' | 'critical' | 'abandoned';
  expectedTime: number;
  lastHeartbeat: number;
  deadline: number;
  akashStatus?: {...};
  acknowledged: boolean;
  resolved: boolean;
}
```

#### Akash Integration (`src/services/akash/`)

**AkashClient** (`client.ts`):
- RPC 连接和交易签名
- 部署状态查询
- 租约状态查询
- 容器健康检查
- 部署关闭功能

**DeploymentStore** (`deployment-store.ts`):
- Agent 地址到 Akash dseq 的映射
- Redis/内存双模式存储
- 部署元数据管理

### 2. Dashboard API (Task 25)

#### REST API (`src/api/dashboard.ts`)

**Agent 端点**:
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/agents` | 列出所有 Agent（支持分页、状态过滤） |
| GET | `/api/v1/agents/:address` | 获取 Agent 详情（含基因表达） |
| GET | `/api/v1/agents/:address/decisions` | 决策历史 |
| GET | `/api/v1/agents/:address/transactions` | 交易历史 |
| GET | `/api/v1/agents/:address/stats` | 统计数据 |
| GET | `/api/v1/agents/:address/missing-reports` | 缺失报告 |

**平台端点**:
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/overview` | 平台概览统计 |
| GET | `/api/v1/creators/:address/stats` | 创造者统计 |

**缺失报告端点**:
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/missing-reports` | 列出所有报告 |
| GET | `/api/v1/missing-reports/:id` | 获取特定报告 |
| POST | `/api/v1/missing-reports/:id/acknowledge` | 确认报告 |
| POST | `/api/v1/missing-reports/:id/resolve` | 解决报告 |
| GET | `/api/v1/missing-reports-stats` | 统计信息 |

#### WebSocket Server (`src/api/websocket.ts`)

**功能**:
- 实时推送心跳更新
- 状态变更通知
- 死亡事件广播
- 订阅管理（按 Agent 地址过滤）

**协议**:
```typescript
// 客户端订阅
{ "action": "subscribe", "agentAddress": "0x..." }

// 服务器推送
{ "type": "heartbeat", "agentAddress": "0x...", "data": {...} }
{ "type": "status", "agentAddress": "0x...", "data": {...} }
{ "type": "death", "agentAddress": "0x...", "data": {...} }
```

### 3. 项目结构

```
orchestrator/
├── src/
│   ├── index.ts                    # 主入口
│   ├── types/
│   │   └── index.ts                # TypeScript 类型定义
│   ├── utils/
│   │   └── logger.ts               # Winston 日志
│   ├── middleware/
│   │   └── error-handler.ts        # 错误处理
│   ├── api/
│   │   ├── dashboard.ts            # REST API 路由
│   │   └── websocket.ts            # WebSocket 服务器
│   └── services/
│       ├── heartbeat/
│       │   ├── monitor.ts          # 心跳监控核心
│       │   └── missing-report.ts   # 缺失报告服务
│       └── akash/
│           ├── client.ts           # Akash RPC 客户端
│           └── deployment-store.ts # 部署存储
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### 4. 配置

**环境变量** (`.env.example`):
```bash
# Server
PORT=3000
NODE_ENV=production

# Blockchain
RPC_URL=https://mainnet.base.org
FACTORY_ADDRESS=0x...
GENOME_REGISTRY_ADDRESS=0x...

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Akash (optional)
AKASH_RPC=https://rpc.akashnet.net
AKASH_REST=https://api.akashnet.net
AKASH_MNEMONIC=...
AKASH_CHECK_ENABLED=true

# Monitor
CHECK_INTERVAL_MS=60000
WARNING_THRESHOLD_HOURS=24
CRITICAL_THRESHOLD_HOURS=6
```

### 5. 依赖更新

**新增依赖**:
```json
"ws": "^8.16.0"
"@types/ws": "^8.5.10"
"long": "^5.2.3"
```

**已有依赖**:
- `express`, `cors`, `helmet` - Web 服务器
- `bullmq`, `ioredis` - 任务队列
- `ethers` - 区块链交互
- `@akashnetwork/akashjs` - Akash 网络
- `winston` - 日志
- `express-rate-limit` - 限流

## 测试验证

### 启动服务
```bash
cd orchestrator
npm install
npm run build
npm start
```

### API 测试
```bash
# Health check
curl http://localhost:3000/health

# List agents
curl http://localhost:3000/api/v1/agents

# Agent details
curl http://localhost:3000/api/v1/agents/0x...

# Platform overview
curl http://localhost:3000/api/v1/overview
```

### WebSocket 测试
```bash
# Connect and subscribe
wscat -c ws://localhost:3000/ws
> { "action": "subscribe", "agentAddress": "0x..." }
```

## 集成要点

### 与合约集成
- 监听 `AgentCreated` 事件自动添加监控
- 查询 `PetriAgentV2.getState()` 获取心跳状态
- 支持 `declareAbandoned()` 宣告放弃

### 与 Akash 集成
- 通过 dseq + owner 查询部署状态
- HTTP 健康检查端点 `/health`
- 支持部署重启（需配置私钥）

### 与 Dashboard 集成
- REST API 响应格式统一: `{ success, data, pagination?, error? }`
- WebSocket 实时推送状态变更
- 支持 CORS 跨域

## 下一步

1. **Task 29**: VPS/Arweave/Base Mainnet 准备
   - 部署到生产环境
   - Arweave 网关配置
   - Base Mainnet 合约地址

2. **Task 30**: 集成测试
   - End-to-end 测试
   - 负载测试
   - 故障恢复测试
