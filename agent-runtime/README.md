# PETRILABS Agent Runtime (ClawBot)

ClawBot 是 PETRILABS 的 Agent 运行时 - 一个基于动态基因组驱动的自主 AI Agent。

## 架构

```
agent-runtime/
├── src/
│   ├── core/
│   │   └── clawbot.ts          # 主运行时
│   ├── genome/
│   │   └── expression.ts       # 基因表达引擎
│   ├── skills/
│   │   └── registry.ts         # Skill 注册表
│   ├── decision/
│   │   └── engine.ts           # 决策引擎
│   ├── chain/
│   │   └── heartbeat.ts        # 心跳服务
│   ├── types/
│   │   └── index.ts            # 类型定义
│   └── utils/
│       └── logger.ts           # 日志工具
├── skills/                     # 预装 Skills (可选)
├── Dockerfile                  # 容器构建
├── docker-compose.yml          # 部署配置
└── README.md
```

## 核心功能

### 1. 基因表达引擎
- 根据环境上下文计算基因表达值
- 支持表观遗传修饰（环境响应）
- 代谢成本计算

### 2. Skill 系统
- 可插拔的 Skill 架构
- 基因表达决定可用 Skills
- 运行时动态加载

### 3. 决策引擎
- 基于 LLM 的决策制定
- 基因表达影响决策倾向
- 考虑生存需求和环境

### 4. 心跳服务
- 定期向区块链发送心跳
- 维持 Agent 存活状态
- 记录决策摘要

## 生命周期

```
启动
  ↓
加载基因组 (从链上)
  ↓
初始化 Skills
  ↓
启动心跳循环
  ↓
启动决策循环
  ↓
自主运行
  ├── 定期决策
  ├── 执行 Skills
  ├── 记录记忆
  └── 发送心跳
```

## 环境变量

```bash
# 必需
AGENT_ADDRESS=0x...           # Agent 合约地址
GENOME_HASH=0x...             # 基因组哈希
PRIVATE_KEY=0x...             # 私钥
LLM_API_KEY=sk-...            # OpenRouter API Key

# 可选
RPC_URL=https://sepolia.base.org
HEARTBEAT_INTERVAL_MS=21600000   # 6小时
DECISION_INTERVAL_MS=3600000     # 1小时
LOG_LEVEL=info
```

## 快速开始

### Docker 运行

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env

# 构建并运行
docker-compose up -d

# 查看日志
docker-compose logs -f clawbot
```

### 本地开发

```bash
# 安装依赖
npm install

# 配置环境
cp .env.example .env

# 开发模式
npm run dev

# 生产构建
npm run build
npm start
```

## Skill 开发

Skills 是可插拔的能力模块：

```typescript
import { Skill, SkillContext, SkillResult } from '@petrilabs/agent-runtime';

export class MySkill implements Skill {
  id = 'my-skill';
  name = 'My Skill';
  version = '1.0.0';
  description = 'Does something useful';
  
  // 需要的基因域和最小表达值
  requiredDomains = [GeneDomain.COGNITION];
  minExpression = 0.3;
  
  async initialize(context: SkillContext): Promise<void> {
    // 初始化
  }
  
  async execute(params: unknown): Promise<SkillResult> {
    // 执行逻辑
    return {
      success: true,
      data: { result: 'success' },
      timestamp: Date.now(),
    };
  }
  
  async shutdown(): Promise<void> {
    // 清理
  }
}
```

## 基因表达

基因表达值决定 Agent 的行为倾向：

| 基因域 | 高表达 | 低表达 |
|--------|--------|--------|
| RISK_ASSESSMENT | 风险偏好 | 保守谨慎 |
| COOPERATION | 倾向合作 | 独立行动 |
| COGNITION | 深度思考 | 快速反应 |
| DORMANCY | 节能休眠 | 持续活跃 |

## 监控

```bash
# 查看 Agent 状态
docker-compose exec clawbot node -e "
const fs = require('fs');
const logs = fs.readFileSync('/app/logs/combined.log', 'utf-8');
console.log(logs.slice(-1000));
"
```

## 部署到 Akash

```bash
# 构建镜像
docker build -t your-registry/clawbot:latest .
docker push your-registry/clawbot:latest

# 部署到 Akash (使用 Akash CLI)
akash tx deployment create deploy.yml --from your-wallet
```

## 架构图

```
┌─────────────────────────────────────┐
│           ClawBot Runtime           │
├─────────────────────────────────────┤
│  Decision Engine (LLM-powered)      │
│  ├── Analyzes context               │
│  ├── Considers gene expression      │
│  └── Makes decisions                │
├─────────────────────────────────────┤
│  Skill Registry                     │
│  ├── Discovers available skills     │
│  ├── Checks gene requirements       │
│  └── Executes skills                │
├─────────────────────────────────────┤
│  Expression Engine                  │
│  ├── Loads genome from chain        │
│  ├── Calculates expressions         │
│  └── Applies environment modifiers  │
├─────────────────────────────────────┤
│  Heartbeat Service                  │
│  ├── Sends periodic heartbeats      │
│  └── Maintains on-chain state       │
└─────────────────────────────────────┘
```

## License

MIT
