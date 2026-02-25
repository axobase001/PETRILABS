# PETRILABS Smart Contracts

AI Agent 野化部署平台 - 链上智能合约

## 合约架构

```
contracts/
├── src/
│   ├── interfaces/
│   │   ├── IPetriAgent.sol    # Agent 接口
│   │   └── IPetriFactory.sol  # 工厂接口
│   ├── PetriAgent.sol         # Agent 实现
│   └── PetriFactory.sol       # 工厂实现
├── test/
│   ├── mocks/
│   │   └── MockUSDC.sol       # USDC Mock
│   ├── PetriAgent.t.sol       # Agent 测试
│   └── PetriFactory.t.sol     # 工厂测试
└── script/
    └── Deploy.s.sol           # 部署脚本
```

## 核心概念

### PetriAgent
- 每个 Agent 有唯一的 genome (基因标识)
- 通过 heartbeat 维持生命，6小时间隔
- 余额低于 1 USDC 时死亡
- 死后无法复活，剩余资产永久锁定

### PetriFactory
- 使用 Clones 模式低成本部署 Agent
- 最小存款: 20 USDC
- 平台费用: 5 USDC

## 快速开始

### 安装依赖
```bash
forge install
```

### 编译
```bash
forge build
```

### 测试
```bash
forge test -v
```

### 部署 (测试网)
```bash
source .env
forge script script/Deploy.s.sol:DeployTestnet --broadcast --rpc-url base_sepolia
```

## 测试覆盖

- ✅ Agent 初始化
- ✅ Heartbeat 机制
- ✅ 决策执行
- ✅ 存款限制
- ✅ 死亡机制
- ✅ 工厂创建 Agent
- ✅ 基因唯一性
- ✅ 费用管理
