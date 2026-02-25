# PETRILABS Skills

ClawBot 的 Skill 系统 - 可插拔的能力模块

## 概述

Skills 是 ClawBot 的能力单元，每个 Skill 实现特定的功能。Skill 的可用性由基因表达决定。

## 预装 Skills

```
skills/
├── core/
│   ├── memory.ts       # 记忆管理 (core.memory)
│   └── perception.ts   # 环境感知 (core.perception)
├── domain/
│   └── onchain.ts      # 链上操作 (domain.onchain)
└── economy/
    └── trading.ts      # 交易框架 (economy.trading)
```

## 安装方式

Skills 通过 **容器构建时预装**：

```dockerfile
# 在 agent-runtime/Dockerfile 中
COPY --from=skills-builder /build/skills/dist ./skills/dist
```

## 核心 Skills

### 1. Memory Skill (`core.memory`)
管理 Agent 的记忆和学习
- 短期记忆缓存
- 长期记忆存储
- 记忆摘要生成

**基因要求**: MEMORY, COGNITION (min 30%)

### 2. Perception Skill (`core.perception`)
感知环境变化
- 余额监控
- 威胁检测
- 机会识别

**基因要求**: PERCEPTION (min 40%)

### 3. OnChain Skill (`domain.onchain`)
链上操作
- 余额查询
- Gas 估算
- 交易监控

**基因要求**: ONCHAIN_OPERATION (min 50%)

## 经济 Skills (框架)

### Trading Skill (`economy.trading`)
**仅框架，未实现**

开发者可以实现此 Skill：
```typescript
// 实现交易逻辑
private async analyzeMarket(): Promise<SkillResult> {
  // 你的实现
}
```

**基因要求**: TRADING, RISK_ASSESSMENT (min 60%)

## 开发新 Skill

```typescript
import { Skill, SkillContext, SkillResult, GeneDomain } from '@petrilabs/agent-runtime';

export class MySkill implements Skill {
  id = 'my.skill';
  name = 'My Skill';
  version = '1.0.0';
  
  requiredDomains = [GeneDomain.COGNITION];
  minExpression = 0.5;
  
  async initialize(context: SkillContext): Promise<void> {
    // 初始化
  }
  
  async execute(params: unknown): Promise<SkillResult> {
    // 执行
    return { success: true, timestamp: Date.now() };
  }
  
  async shutdown(): Promise<void> {
    // 清理
  }
}
```

## 基因映射

| Skill | 主要基因域 | 最小表达 |
|-------|-----------|---------|
| core.memory | MEMORY, COGNITION | 30% |
| core.perception | PERCEPTION | 40% |
| domain.onchain | ONCHAIN_OPERATION | 50% |
| economy.trading | TRADING, RISK_ASSESSMENT | 60% |

## 扩展

要添加新 Skill：

1. 在 `skills/src/` 下创建新文件
2. 实现 `Skill` 接口
3. 在 `index.ts` 中导出
4. 重新构建容器

## License

MIT
