# PetriLabs 双模态认知架构

> 免费默认 + x402 自主付费升级

## 架构概述

B-认知染色体（Cognition）现在支持**分层推理引擎**：

```
┌─────────────────────────────────────────────────────────────┐
│                    B-认知染色体                              │
│                   (Cognition Chromosome)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  基因表达                                                    │
│    │                                                         │
│    ▼                                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              CognitionRouter                         │   │
│  │  ┌──────────────┐         ┌──────────────────────┐  │   │
│  │  │  Budget      │         │  Dual-Mode Provider  │  │   │
│  │  │  Engine      │◄───────►│                      │  │   │
│  │  └──────────────┘         │  ┌──────────────┐    │  │   │
│  │                           │  │  Free Tier   │    │  │   │
│  │  决策逻辑：                │  │  Pollinations│    │  │   │
│  │  • 复杂度评估              │  │  $0          │    │  │   │
│  │  • 成本效益分析            │  │  (default)   │    │  │   │
│  │  • 生存资金保护            │  └──────────────┘    │  │   │
│  │                           │  ┌──────────────┐    │  │   │
│  │  简单任务 → 免费层         │  │  Premium Tier│    │  │   │
│  │  复杂任务 → 付费层         │  │  x402 LLM    │    │  │   │
│  │  余额不足 → 强制免费       │  │  $0.0005+    │    │  │   │
│  │                           │  └──────────────┘    │  │   │
│  │  失败回退：                │                      │  │   │
│  │  付费失败 → 免费层         └──────────────────────┘  │   │
│  │  免费失败 → 错误                                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 基因结构（保持不变）

```typescript
{
  chromosome: 'B',           // B-认知染色体
  id: 'B-REASON-001',
  capability: 'complex_reasoning',
  complexity: 'deep',        // 'standard' | 'deep' | 'critical'
  priority: 0.8,
  metabolicBudget: 0.01,     // 最高愿意支付的 USDC
  value: 200,
  weight: 100000,
  // ... 其他基因字段
}
```

**注意**：基因对象不包含任何技术提供商信息（Pollinations/OpenAI/Claude），保持基因纯洁性。

## 预算决策逻辑

### 决策树

```
任务复杂度
    │
    ├── standard ───────► Pollinations (免费)
    │                       • openai-large
    │
    ├── deep ───────────► 成本效益分析
    │                       │
    │   余额 < $0.5 ─────► Pollinations
    │   生存准备金检查    • deepseek-reasoner
    │                       │
    │   基因预算不足 ────► Pollinations
    │                       │
    │   成本 > 价值 ─────► Pollinations
    │   （不值得）         │
    │                       ▼
    │                   x402 付费
    │                   • GPT-4o ($0.005/1K)
    │                   • Claude 3.5 ($0.003/1K)
    │                   • DeepSeek ($0.0007/1K)
    │
    └── critical ───────► 强制成本效益分析
                            高优先级任务更倾向付费
```

### 生存保障

即使 Agent 破产（$0 USDC），仍可通过 Pollinations 免费思考：

```typescript
if (currentBalance < SURVIVAL_RESERVE) {
  // SURVIVAL_RESERVE = $0.5
  return { shouldPay: false, reason: 'survival_mode' };
}
```

## 使用示例

### 示例 1：日常思考（免费）

```typescript
const gene = {
  id: 201,
  domain: GeneDomain.COGNITION,
  capability: 'reasoning',
  complexity: 'standard',
  metabolicBudget: 0.001,
};

const result = await cognitionRouter.reason({
  gene,
  prompt: 'Summarize recent market trends',
});

// 结果
{
  success: true,
  content: 'The market shows bullish signals...',
  provider: 'pollinations',
  model: 'openai-large',
  cost: 0,
}
```

### 示例 2：深度分析（自主付费）

```typescript
const gene = {
  id: 205,
  domain: GeneDomain.PLANNING,
  capability: 'strategy_optimization',
  complexity: 'deep',
  metabolicBudget: 0.02,
  priority: 0.9,
};

const result = await cognitionRouter.reason({
  gene,
  prompt: 'Develop a 30-day survival strategy with current $45 balance',
});

// 决策过程
// 1. BudgetEngine: complexity='deep', budget=0.02, priority=0.9
// 2. 评估：值得付费（高价值任务）
// 3. 选模型：budget 允许 GPT-4o
// 4. x402 支付 $0.008
// 5. 返回结果

{
  success: true,
  content: 'Strategy: Reduce metabolic costs by...',
  provider: 'x402-llm',
  model: 'gpt-4o',
  cost: 0.008,
  paymentTx: '0xabc123...',
}
```

### 示例 3：贫困回退

```typescript
// Agent 余额 $0.3（低于生存准备金 $0.5）
const gene = {
  complexity: 'critical',
  metabolicBudget: 0.05,
};

const result = await cognitionRouter.reason({ gene, prompt: '...' });

// 自动触发：
// 1. BudgetEngine 检测到余额不足
// 2. 触发 G-ECON-001 压力响应
// 3. 回退到 Pollinations (deepseek-reasoner)
// 4. 记录压力事件到 Tombstone

{
  success: true,
  content: '...',
  provider: 'pollinations',
  model: 'deepseek-reasoner',
  cost: 0,
  fallback: true,  // 标记为回退
}
```

## 文件结构

```
src/cognition/
├── index.ts                 # 统一导出
├── router.ts                # CognitionRouter（主入口）
├── budget-engine.ts         # CognitionBudgetEngine（预算决策）
└── providers/
    ├── pollinations.ts      # PollinationsProvider（免费层）
    └── x402-llm.ts          # X402LLMProvider（付费层）
```

## 配置

### 环境变量

```bash
# 付费层必需
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...

# 可选配置
POLLINATIONS_BASE_URL=https://text.pollinations.ai
COGNITION_SURVIVAL_RESERVE=0.5  # 生存准备金（USDC）
COGNITION_MAX_RATIO=0.3         # 认知预算占余额比例上限
```

### Agent 配置

```typescript
const config: AgentConfig = {
  // ... 其他配置
  cognition: {
    survivalReserve: 0.5,      // 生存准备金
    maxBudgetRatio: 0.3,       // 最大认知预算比例
    defaultTimeout: 60000,     // 默认超时
  },
};
```

## 代谢成本记录

所有认知支出通过现有 `MetabolismTracker` 记录：

```typescript
// 免费层
metabolism.recordCognition({
  timestamp: Date.now(),
  provider: 'pollinations',
  model: 'openai-large',
  cost: 0,
  geneId: '201',
  tokens: 1500,
});

// 付费层
metabolism.recordCognition({
  timestamp: Date.now(),
  provider: 'x402-llm',
  model: 'gpt-4o',
  cost: 0.008,
  geneId: '205',
  tokens: 2100,
});
```

最终写入 Tombstone：

```json
{
  "metabolism": {
    "dailyCost": 2.5,
    "cognition": {
      "totalCalls": 15,
      "totalCost": 0.052,
      "byProvider": {
        "pollinations": { "count": 10, "cost": 0 },
        "x402-llm": { "count": 5, "cost": 0.052 }
      }
    }
  }
}
```

## 压力响应

当发生以下情况时触发 G-染色体压力响应：

| 触发条件 | 压力类型 | 响应 |
|---------|---------|------|
| 余额低于生存准备金 | `cognition_affordability_crisis` | 强制使用免费层 |
| 付费失败（x402 拒绝） | `cognition_payment_failed` | 回退到免费层，降低后续任务复杂度 |
| 基因预算不足 | `cognition_budget_insufficient` | 使用免费层，可能触发基因表达调整 |

## 进化压力

认知预算受限时，Agent 可能进化出更高效的思考策略：

1. **减少推理步数**：使用更快、更便宜的模型
2. **批处理**：合并多个简单任务一次性处理
3. **缓存**：重用之前的推理结果
4. **优先级调整**：高优先级任务才使用付费层

## 与现有架构集成

```
┌─────────────────────────────────────────────────────────┐
│ 现有架构                                                 │
├─────────────────────────────────────────────────────────┤
│ ClawBot ──► 原有功能                                    │
│   ├── SkillRegistry                                     │
│   ├── DecisionEngine                                    │
│   ├── HeartbeatService                                  │
│   ├── NkmcRouter (D-染色体)                             │
│   └── MetabolismTracker                                 │
│                                                          │
│ 新增：CognitionRouter (B-染色体) ──► 集成到 ClawBot      │
│   ├── PollinationsProvider                              │
│   ├── X402LLMProvider                                   │
│   └── CognitionBudgetEngine                             │
└─────────────────────────────────────────────────────────┘
```

## 测试

```bash
# 运行认知模块测试
npm test -- --testPathPattern=cognition

# 手动测试免费层
node -e "
const { PollinationsProvider } = require('./dist/cognition');
const provider = new PollinationsProvider();
provider.reason({ prompt: 'Hello', complexity: 'standard' })
  .then(r => console.log('Free tier:', r.content.slice(0, 50)));
"

# 手动测试预算决策
node -e "
const { CognitionBudgetEngine } = require('./dist/cognition');
const engine = new CognitionBudgetEngine();
const decision = engine.evaluate({
  gene: { complexity: 'deep', metabolicBudget: 0.01, priority: 0.8 },
  currentBalance: 10,
  promptLength: 500,
});
console.log('Decision:', decision);
"
```

## 参考资料

- [Pollinations.AI Docs](https://pollinations.ai)
- [x402 Protocol](https://x402.org)
- [OpenAI Pricing](https://openai.com/pricing)
- [Anthropic Pricing](https://anthropic.com/pricing)
