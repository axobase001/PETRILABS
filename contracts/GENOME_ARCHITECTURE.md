# PETRILABS 动态基因组架构

## 概述

PETRILABS 采用**完全上链**的动态基因组系统，每个 AI Agent 拥有 60+ 基因，支持：

- **用户记忆驱动**: 通过 LLM 分析用户上传的记忆文件生成个性化基因组
- **随机生成回退**: 无记忆/不匹配时随机生成
- **表观遗传修饰**: 环境压力改变基因表达
- **进化机制**: 基因复制/缺失/水平转移

---

## 合约架构

```
contracts/
├── interfaces/
│   ├── IGenomeRegistry.sol     # 基因组注册表接口
│   ├── IPetriAgentV2.sol       # Agent V2 接口
│   └── IPetriFactoryV2.sol     # 工厂 V2 接口
├── GenomeRegistry.sol           # 完整基因组存储
├── PetriAgentV2.sol            # 支持基因组的 Agent
└── PetriFactoryV2.sol          # 记忆文件驱动的工厂
```

---

## 核心数据结构

### Gene (基因)
```solidity
struct Gene {
    uint16 id;                    // 基因ID
    uint8 domain;                 // 功能域 (METABOLISM, COGNITION, etc.)
    uint8 origin;                 // 来源 (PRIMORDIAL, INHERITED, etc.)
    uint8 expressionState;        // 表达状态 (ACTIVE, SILENCED, CONDITIONAL)
    uint32 value;                 // 基础值 [0, 1000000] = [0, 1]
    uint32 weight;                // 权重 [0, 300000] = [0.1, 3.0]
    uint16 dominance;             // 显性程度 [0, 1000] = [0, 1]
    uint16 plasticity;            // 可塑性 [0, 1000]
    uint16 essentiality;          // 必要性 [0, 1000]
    uint32 metabolicCost;         // 代谢成本 (USDC/day)
    uint32 duplicateOf;           // 复制来源基因ID
    uint16 age;                   // 代数
}
```

### Genome (基因组)
```solidity
struct Genome {
    bytes32 genomeHash;           // Merkle Root
    uint32 totalGenes;            // 基因总数
    uint16 generation;            // 世代
    uint64 birthTimestamp;        // 诞生时间
    bytes32 lineageId;            // 血脉标识
    bytes32 parentGenomeHash;     // 父代哈希
    bytes32 memoryDataHash;       // 用户记忆文件哈希
    bool isRandom;                // 是否随机生成
    uint256[] geneIds;            // 基因ID列表
    uint8[] chromosomeIds;        // 染色体ID列表
}
```

---

## 基因功能域 (32个)

| 域 | 描述 | 示例基因 |
|----|------|---------|
| METABOLISM | 代谢相关 | basal_metabolic_rate, inference_efficiency |
| PERCEPTION | 感知相关 | environment_sensitivity, market_perception |
| COGNITION | 认知相关 | working_memory_capacity, pattern_recognition |
| MEMORY | 记忆相关 | long_term_memory_depth, memory_inscription_frequency |
| RESOURCE_MANAGEMENT | 资源管理 | energy_reserve_ratio |
| RISK_ASSESSMENT | 风险评估 | risk_appetite, time_preference |
| TRADING | 交易行为 | negotiation_intensity |
| INCOME_STRATEGY | 收入策略 | income_diversification, opportunism |
| ONCHAIN_OPERATION | 链上操作 | onchain_affinity, defi_comprehension |
| WEB_NAVIGATION | 网页交互 | web_scraping_skill |
| CONTENT_CREATION | 内容创作 | content_creation_skill |
| DATA_ANALYSIS | 数据分析 | data_analysis_skill |
| API_UTILIZATION | API使用 | api_discovery, x402_utilization |
| SOCIAL_MEDIA | 社交媒体 | social_media_skill |
| COOPERATION | 合作行为 | agent_cooperation, kin_recognition |
| COMPETITION | 竞争行为 | agent_competition |
| COMMUNICATION | 通信能力 | signal_honesty |
| TRUST_MODEL | 信任模型 | trust_default, deception_detection |
| MATE_SELECTION | 择偶策略 | mate_selectivity |
| PARENTAL_INVESTMENT | 亲代投入 | offspring_investment, r_k_strategy |
| HUMAN_HIRING | 雇佣人类 | human_hiring_tendency |
| HUMAN_COMMUNICATION | 人类沟通 | human_communication_precision |
| HUMAN_EVALUATION | 人类评估 | human_service_evaluation |
| STRESS_RESPONSE | 压力响应 | acute_stress_response, resilience |
| ADAPTATION | 适应机制 | novelty_seeking, tool_adaptation_speed |
| DORMANCY | 休眠能力 | dormancy_capability |
| MIGRATION | 迁移能力 | platform_migration |
| SELF_MODEL | 自我建模 | metacognition |
| STRATEGY_EVALUATION | 策略评估 | planning_horizon |
| LEARNING | 学习机制 | learning_rate |
| PLANNING | 规划能力 | strategy_switch_threshold |
| REGULATORY | 调控基因 | global_expression_level, stress_response_regulator |

---

## 表观遗传系统

环境压力可以"标记"基因，改变表达但不改变序列：

```solidity
struct EpigeneticMark {
    uint32 targetGeneId;          // 目标基因
    uint8 modification;           // 0=上调, 1=下调, 2=沉默, 3=激活
    uint16 strength;              // 强度 [0, 1000]
    uint64 timestamp;             // 产生时间
    uint16 heritability;          // 遗传概率
    uint16 decayPerGen;           // 每代衰减
}
```

### 表观遗传规则示例

| 环境条件 | 效果 | 遗传概率 |
|----------|------|----------|
| 余额 < 48h消耗 持续72h | 上调忍饥基因，下调推理消耗 | 60% |
| 余额 > 1月余粮 持续1周 | 上调探索、风险承受 | 40% |
| 遭遇欺骗 | 上调欺骗检测，下调默认信任 | 50% |
| 高频成功合作 | 上调合作、社交感知 | 30% |

---

## 使用流程

### 1. 基于记忆文件创建 Agent

```javascript
// 用户上传记忆文件
const memoryHash = keccak256(memoryFileContent);

// 调用工厂
await factory.createAgentFromMemory(
    memoryHash,
    "arweave://tx-id",
    ethers.parseUnits("100", 6)  // 100 USDC
);
```

### 2. 编排服务分析并提交基因组

```javascript
// Orchestrator 调用 LLM 分析记忆文件
const analysis = await llm.analyze(memoryFile);

// 生成基因
const genes = generateGenesFromAnalysis(analysis);

// 提交到链上
await registry.submitGenome(
    {
        memoryDataHash: memoryHash,
        memoryDataURI: "arweave://tx-id",
        useRandom: false,
        preferredGenomeHash: ethers.ZeroHash
    },
    genes,
    chromosomes,
    regulatoryEdges
);
```

### 3. 随机生成（回退）

```javascript
await factory.createAgentRandom(ethers.parseUnits("100", 6));
```

---

## 测试覆盖

```
GenomeRegistry
├── Deployment
│   └── Should authorize owner by default ✅
├── Authorization
│   ├── Should authorize new creator ✅
│   └── Should only allow owner to authorize ✅
├── Genome Registration
│   ├── Should register genome with genes ✅
│   ├── Should not allow duplicate genomes ✅
│   └── Should reject unauthorized registration ✅
├── Gene Queries
│   ├── Should get genome data ✅
│   ├── Should get single gene ✅
│   ├── Should get genes by domain ✅
│   └── Should return empty for non-existent genome ✅
├── Epigenetic Marks
│   └── Should add epigenetic mark ✅
├── Expression Engine
│   ├── Should calculate metabolic cost ✅
│   ├── Should calculate gene expression ✅
│   └── Should apply epigenetic modification ✅
└── Genome Evolution
    └── Should evolve genome ✅

总计: 16 passing ✅
```

---

## Gas 估算

| 操作 | Gas (估算) |
|------|-----------|
| Register Genome (60 genes) | ~500,000 |
| Add Epigenetic Mark | ~50,000 |
| Express Gene | ~20,000 (view) |
| Calculate Metabolic Cost | ~30,000 (view) |
| Evolve Genome | ~100,000 |

---

## 部署地址 (测试网)

待部署...
