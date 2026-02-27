# PETRILABS Orchestrator - 完整文档

## 项目概述

PETRILABS Orchestrator 是 AI Agent 生态系统的平台服务层，负责：
- 心跳监控与缺失检测
- Akash 容器状态管理
- Dashboard API 与实时推送
- Arweave 永久存储集成

## 快速开始

### 1. 安装依赖
```bash
cd orchestrator
npm install
```

### 2. 配置环境
```bash
cp .env.example .env
# 编辑 .env 文件
```

### 3. 开发模式
```bash
npm run dev
```

### 4. 生产构建
```bash
npm run build
npm start
```

## 项目结构

```
orchestrator/
├── src/
│   ├── index.ts                    # 主入口
│   ├── types/
│   │   └── index.ts                # 类型定义
│   ├── utils/
│   │   └── logger.ts               # 日志工具
│   ├── middleware/
│   │   └── error-handler.ts        # 错误处理
│   ├── api/
│   │   ├── dashboard.ts            # REST API
│   │   └── websocket.ts            # WebSocket 服务器
│   ├── services/
│   │   ├── heartbeat/
│   │   │   ├── monitor.ts          # 心跳监控
│   │   │   └── missing-report.ts   # 缺失报告
│   │   ├── akash/
│   │   │   ├── client.ts           # Akash 客户端
│   │   │   └── deployment-store.ts # 部署存储
│   │   └── arweave/
│   │       └── client.ts           # Arweave 客户端
│   └── __tests__/
│       ├── jest.config.js
│       ├── setup.ts
│       ├── integration/
│       │   └── heartbeat-monitor.test.ts
│       └── e2e/
│           └── dashboard-api.test.ts
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
├── package.json
├── tsconfig.json
├── .env.example
├── .env.production.example
└── README.md
```

## API 文档

### REST Endpoints

#### Agents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agents` | 列出所有 Agent |
| GET | `/api/v1/agents/:address` | Agent 详情 |
| GET | `/api/v1/agents/:address/decisions` | 决策历史 |
| GET | `/api/v1/agents/:address/transactions` | 交易历史 |
| GET | `/api/v1/agents/:address/stats` | 统计数据 |
| GET | `/api/v1/agents/:address/missing-reports` | 缺失报告 |

#### Platform
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/overview` | 平台概览 |
| GET | `/api/v1/creators/:address/stats` | 创造者统计 |

#### Missing Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/missing-reports` | 列出报告 |
| GET | `/api/v1/missing-reports/:id` | 报告详情 |
| POST | `/api/v1/missing-reports/:id/acknowledge` | 确认报告 |
| POST | `/api/v1/missing-reports/:id/resolve` | 解决报告 |
| GET | `/api/v1/missing-reports-stats` | 统计信息 |

### WebSocket

连接: `ws://localhost:3000/ws`

**订阅**:
```json
{ "action": "subscribe", "agentAddress": "0x..." }
```

**消息类型**:
- `heartbeat` - 心跳更新
- `decision` - 决策执行
- `status` - 状态变更
- `death` - Agent 死亡

## 部署

### Docker 部署

```bash
# 构建镜像
npm run docker:build

# 启动服务
npm run docker:up

# 停止服务
npm run docker:down
```

### VPS 部署

```bash
# Staging
npm run deploy:staging

# Production
npm run deploy:production

# 验证部署
npm run verify
```

## 测试

```bash
# 所有测试
npm test

# 集成测试
npm run test:integration

# E2E 测试
npm run test:e2e

# 覆盖率
npm run test:coverage
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | 3000 |
| `RPC_URL` | Base RPC | https://mainnet.base.org |
| `FACTORY_ADDRESS` | Agent Factory 合约 | - |
| `REDIS_URL` | Redis 连接 | - |
| `AKASH_MNEMONIC` | Akash 钱包 | - |
| `ARWEAVE_KEY` | Arweave 密钥 | - |
| `CHECK_INTERVAL_MS` | 检查间隔 | 60000 |

## 技术栈

- **Runtime**: Node.js 20, TypeScript
- **API**: Express.js, WebSocket
- **Queue**: BullMQ, Redis
- **Blockchain**: ethers.js (Base L2)
- **Cloud**: Akash Network
- **Storage**: Arweave
- **Test**: Jest, Supertest
- **Deploy**: Docker, Docker Compose

## License

MIT
