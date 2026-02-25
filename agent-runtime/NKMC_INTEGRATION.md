# nkmc.ai 网关集成文档

## 概述

本文档描述如何将 **nkmc.ai 网关**作为 **D-染色体（互联网技能）的技术实现层**集成到 PetriLabs 现有架构中。

### 设计原则

- **零基因污染**: 基因对象保持不变，只包含 `capability` 和 `metabolicBudget`
- **透明层**: nkmc 作为技术实现层，对上层基因系统透明
- **复用现有系统**: 
  - C-经济染色体的代谢成本计算
  - Turbo 存储层记录日志
  - G-压力染色体的压力响应机制

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Gene Expression                         │
│                    (ExpressionEngine)                       │
│  D-API-001 {capability: "fetch_market_data", budget: 0.005} │
│                           │                                 │
│                           ▼                                 │
│              ┌─────────────────────────┐                    │
│              │    expressGene()        │                    │
│              │  if domain === D:       │                    │
│              │    → router.route()     │                    │
│              └─────────────────────────┘                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   CapabilityRouter                          │
│  1. 能力名 → nkmc serviceId 映射                            │
│  2. SQLite 本地缓存                                         │
│  3. 成本预检 (vs metabolicBudget)                           │
│  4. 超预算 → 触发压力响应                                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     NkmcGateway                             │
│  1. 封装 nkmc API (auth/discover/inspect/call)              │
│  2. 自动 Token 刷新 (24h)                                   │
│  3. 错误处理和重试                                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     nkmc.ai 网络                            │
│                    (互联网服务网关)                          │
└─────────────────────────────────────────────────────────────┘
```

## 代码修改清单

### 1. 新增文件

| 文件 | 职责 |
|------|------|
| `src/gateways/nkmc.ts` | 封装 nkmc API 客户端 |
| `src/routers/capability.ts` | 能力路由层 (能力名 → nkmc) |
| `src/metabolism/tracker.ts` | 代谢成本追踪 (API 调用成本) |

### 2. 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/clawbot.ts` | 注入 nkmcGateway 和 capabilityRouter |
| `src/genome/expression.ts` | 添加 D-染色体路由逻辑 |
| `src/types/index.ts` | 添加 nkmc 配置类型 |
| `.env.example` | 添加 nkmc 环境变量 |
| `package.json` | 添加 better-sqlite3 依赖 |

## 配置示例

### 环境变量

```bash
# nkmc Gateway Configuration
NKMC_JWT=your_nkmc_jwt_token
NKMC_BASE_URL=https://api.nkmc.ai/v1
NKMC_CACHE_PATH=./data/capability-cache.db
NKMC_REFRESH_INTERVAL=86400000
```

### Agent 配置

```typescript
const config: AgentConfig = {
  agentAddress: '0x...',
  genomeHash: '0x...',
  privateKey: '0x...',
  rpcUrl: 'https://mainnet.base.org',
  chainId: 8453,
  contracts: {
    genomeRegistry: '0x...',
    petriAgent: '0x...',
  },
  llm: {
    apiKey: 'sk-...',
    model: 'anthropic/claude-3-opus',
  },
  intervals: {
    heartbeat: 21600000,  // 6 hours
    decision: 3600000,    // 1 hour
  },
  // nkmc 配置（新增）
  nkmc: {
    jwt: process.env.NKMC_JWT!,
    baseUrl: process.env.NKMC_BASE_URL,
    cachePath: process.env.NKMC_CACHE_PATH,
  },
};
```

## 完整数据流示例

### 场景：D-染色体基因执行 `fetch_weather` 能力

```typescript
// 1. 基因定义（保持不变）
const gene = {
  id: 301,
  domain: GeneDomain.API_UTILIZATION,  // D-染色体
  origin: 0,
  expressionState: 1,
  value: 200,
  weight: 100000,
  dominance: 50,
  plasticity: 30,
  essentiality: 20,
  metabolicCost: 50000,  // $0.005 USDC
  duplicateOf: 0,
  age: 0,
};

// 2. ClawBot 执行基因
const result = await clawbot.executeGene(gene, { city: 'Beijing' });

// 3. 内部流程
/*
  a. ClawBot.executeGene() 识别 D-染色体
  b. 调用 capabilityRouter.route(gene, params)
  c. 从基因名称提取 capability: "fetch_weather"
  d. 查找映射: fetch_weather → serviceId: "weather-api"
  e. 成本预检: nkmc 报价 $0.001 < gene.budget $0.005 ✓
  f. 调用 nkmcGateway.call("weather-api", "getCurrent", {city})
  g. 获取天气数据
  h. 记录 API 调用成本到 MetabolismTracker
  i. 返回结果到 ClawBot
*/

// 4. 结果
console.log(result);
// {
//   success: true,
//   data: { temperature: 22, condition: 'sunny' },
//   cost: 0.001,
//   error?: undefined
// }

// 5. 心跳时记录
/*
  Tombstone 记录包含:
  {
    blockHeight: 12345678,
    timestamp: 1705317000000,
    genomeState: "0xabc...",
    metabolism: {
      usdcBalance: "45.23",
      dailyCost: 2.5,
      apiCalls: {
        totalCalls: 10,
        totalCost: 0.015,
        byService: {
          "weather-api": { count: 1, cost: 0.001 }
        }
      }
    }
  }
  
  通过 Turbo.uploadTombstone() 上传到 Arweave
*/
```

## 压力响应场景

### 场景：API 调用超出代谢预算

```typescript
// gene.metabolicCost = 50000 ($0.005)
// nkmc 实际报价 = $0.01 (超出预算)

const result = await clawbot.executeGene(gene, params);
// result = {
//   success: false,
//   cost: 0,
//   error: 'Cost 0.01 exceeds metabolic budget 0.005'
// }

// ClawBot 自动触发压力响应：
// 1. 查找 G-染色体压力基因 (domain: STRESS_RESPONSE)
// 2. 表达压力基因 (expression *= 1.5)
// 3. 记录压力事件到 Tombstone
// 4. 决策引擎在下轮降低 API 调用频率
```

## 备用机制

当 nkmc 失效时，自动回退到硬编码 HTTP 端点：

```typescript
// capabilityMappings 中定义 fallbackEndpoint
const mapping = {
  capability: 'fetch_weather',
  serviceId: 'weather-api',
  method: 'getCurrent',
  fallbackEndpoint: 'https://api.openweathermap.org/data/2.5/weather',
};

// nkmc 调用失败时
if (nkmcFailed && mapping.fallbackEndpoint) {
  return executeFallback(mapping, params);
  // 记录为压力事件 (G-染色体)
}
```

## 安装与运行

```bash
# 1. 安装依赖
cd agent-runtime
npm install  # 会安装 better-sqlite3

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 NKMC_JWT

# 3. 构建
cd ..
npm run build:runtime

# 4. 运行
npm run agent:start
```

## 测试

```bash
# 运行集成测试
npm test -- --testPathPattern=nkmc

# 手动测试 nkmc 连接
node -e "
const { NkmcGateway } = require('./dist/gateways/nkmc');
const gateway = new NkmcGateway({ jwt: process.env.NKMC_JWT });
gateway.auth().then(token => console.log('Auth success:', token.slice(0, 20) + '...'));
"
```

## 相关文档

- [nkmc.ai 官方文档](https://docs.nkmc.ai)
- [Turbo Storage 架构](../docs/TURBO_STORAGE_ARCHITECTURE.md)
- [基因组表达系统](../contracts/GENOME_ARCHITECTURE.md)
