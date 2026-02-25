# PETRILABS Orchestrator Service

编排服务 - 负责基因组生成、合约交互和部署编排

## 架构

```
orchestrator/
├── src/
│   ├── config/
│   │   ├── index.ts          # 服务配置
│   │   └── genes.ts          # 60+ 基因目录
│   ├── services/
│   │   ├── llm.ts            # LLM 基因组生成
│   │   ├── blockchain.ts     # 区块链交互
│   │   ├── arweave.ts        # Arweave 存储
│   │   └── deployment.ts     # 部署流程编排
│   ├── routes/
│   │   ├── agents.ts         # Agent API 路由
│   │   └── health.ts         # 健康检查
│   ├── types/
│   │   ├── genome.ts         # 基因组类型
│   │   ├── agent.ts          # Agent 类型
│   │   └── api.ts            # API 类型
│   ├── utils/
│   │   └── logger.ts         # 日志工具
│   └── index.ts              # 主入口
├── package.json
├── tsconfig.json
└── README.md
```

## 功能

### 1. 基因组生成

**基于记忆文件：**
```http
POST /api/agents
Content-Type: application/json

{
  "memoryFile": "base64-encoded-content",
  "initialDeposit": "100000000",
  "creatorAddress": "0x..."
}
```

**随机生成：**
```http
POST /api/agents
Content-Type: application/json

{
  "initialDeposit": "100000000",
  "creatorAddress": "0x...",
  "useRandom": true
}
```

### 2. 部署流程

```
1. 接收请求 → 创建 Job
2. 上传记忆文件到 Arweave
3. LLM 分析记忆文件提取性格特征
4. 根据特征生成 60+ 基因
5. 提交基因组到链上
6. 创建 Agent 合约
7. 上传完整基因组到 Arweave
```

### 3. 基因目录

| 染色体 | 功能域 | 基因数量 |
|--------|--------|---------|
| A | 代谢与生存 | 7 |
| B | 感知与认知 | 12 |
| C | 经济策略 | 8 |
| D | 互联网能力 | 10 |
| E | 社交与繁殖 | 12 |
| F | 人类接口 | 5 |
| G | 压力响应与适应 | 5 |
| R | 调控基因 | 4 |

### 4. API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/agents | 创建 Agent |
| GET | /api/agents/:jobId/status | 查询部署状态 |
| GET | /api/agents/:address | 获取 Agent 信息 |
| GET | /api/agents/:address/genes/:geneId | 查询基因表达 |
| GET | /health | 健康检查 |

## 环境变量

```bash
# 必需
PRIVATE_KEY=                 # 编排服务私钥
LLM_API_KEY=                 # OpenRouter/OpenAI API Key
AKASH_MNEMONIC=              # Akash 钱包助记词

# 合约地址
GENOME_REGISTRY_ADDRESS=0x...
PETRI_FACTORY_V2_ADDRESS=0x...
USDC_ADDRESS=0x...

# 可选
PORT=3000
REDIS_URL=redis://localhost:6379
RPC_URL=https://sepolia.base.org
```

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env

# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

## 测试

```bash
npm test
```

## 部署

```bash
# Railway (推荐)
railway login
railway up

# Docker
docker build -t petrilabs-orchestrator .
docker run -p 3000:3000 --env-file .env petrilabs-orchestrator
```

## 基因组生成示例

基于记忆文件的分析结果：

```json
{
  "personalityTraits": [
    { "trait": "risk_tolerance", "confidence": 0.8, "value": 0.7 },
    { "trait": "analytical_depth", "confidence": 0.9, "value": 0.8 }
  ],
  "riskProfile": "aggressive",
  "socialTendency": "extroverted",
  "matchScore": 8500
}
```

生成对应的基因值：
- `risk_appetite`: 0.75 (高)
- `defi_comprehension`: 0.8 (高)
- `agent_cooperation`: 0.7 (中高)

如果 `matchScore < 6000`，自动回退到随机生成。
