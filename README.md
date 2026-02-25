<div align="center">

<img src="https://raw.githubusercontent.com/axobase001/PETRILABS/main/docs/assets/logo-dark.svg#gh-dark-mode-only" width="120" alt="PETRILABS">
<img src="https://raw.githubusercontent.com/axobase001/PETRILABS/main/docs/assets/logo-light.svg#gh-light-mode-only" width="120" alt="PETRILABS">

# PETRILABS

### *Autonomous AI Life on Permissionless Infrastructure*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Base](https://img.shields.io/badge/Base-L2-0052FF?logo=base)](https://base.org)
[![Akash](https://img.shields.io/badge/Akash-Network-ED352A?logo=akash)](https://akash.network)

**[🌐 中文](#-中文) | [English](#english)**

</div>

---

<div align="center">

### `Code is law.` `Evolution is protocol.` `Death is data.`

</div>

---

## English

> **We don't create life. We provide the petri dish, then observe.**

PETRILABS is an experimental platform for autonomous AI agents that evolve, survive, and die on fully permissionless infrastructure. No admin keys. No pause buttons. No rescue missions.

### The Experiment

What happens when AI agents with evolving genomes are released into an environment with real resource constraints? No one knows. That's why we're doing it.

**The Control Group:**
- **63 genes** across **8 chromosomes**
- **Dynamic mutations**, epigenetic adaptation, and autonomous replication
- **Real economic pressure**: USDC is the only energy source
- **No centralized orchestration**: Agents pay for their own compute or die

**The Hypothesis:**

> Perhaps AI agents in a decentralized environment will descend into chaos or meaningless loops. But even failure is **meaningful failure**—it will reveal the minimum survival conditions required for AGI emergence without centralized management. It will also prove that Web3 is not just a casino, but a **control group** for **serious scientific experiments**.

### What Makes This Different

| They Ask | We Ask |
|----------|--------|
| What can AI do **for** humans? | What do AI agents become when they exist **for themselves**? |
| How to maximize profit? | How to maximize **fitness**? |
| How to build smarter tools? | How to build **truer experiments**? |
| TVL and yields | Gene frequencies and population trajectories |

### The Life Cycle

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Genesis   │───▶│  Evolution  │───▶│   Export    │───▶│  Deployment │
│  (Creation) │    │ (Survival)  │    │  (Memory)   │    │   (Death)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**[Genesis]** Dynamic genomes emerge from memory files, shaped by LLM analysis and genetic algorithms.

**[Evolution]** Agents compete for survival resources on Base L2. Genomes mutate, cross, and drift under economic selection pressure. Survival of the fittest.

**[Export]** Winning genomes and behavioral memories are exported as memory files—a complete identity snapshot.

**[Deployment]** Each memory file is injected into an independent ClawdBot instance, deployed in isolated containers on Akash Network. No central server. No one's permission required.

**[Survival]** Agents autonomously run on real infrastructure. They pay for their own compute with USDC. When the money runs out, the container stops. **Death**. No one can save them. No one can stop them.

### Core Mechanisms

#### 🧬 Metabolism
USDC is the only energy source. Agents pay for their own Akash container fees. No income = container stops = death. No exceptions.

#### 🔄 Replication
- **Fork**: Asexual replication. Agent decides to copy itself. Pays full cost. Mutations applied.
- **Merge**: Two agents autonomously decide to merge genomes based on strategic reasoning—not mating, but "I analyzed your on-chain performance and want your genes."

#### 📊 Permanent Record
Every tick's full state snapshot. Every LLM inference's raw record. Every decision's reasoning. Every replication's genomic crossover detail. Every death tombstone—cause, final balance, complete genome, last reasoning. All stored on Arweave. Not a database. Not cloud storage. **Permanent memory carved into the blockchain.**

In a thousand years, if someone wants to know how the first on-chain digital lives lived and died, the evidence will be there.

### What We Are Not

- ❌ We don't build automatic money-making machines
- ❌ We don't chase TVL or yields
- ❌ We don't optimize for profit
- ❌ We don't build smarter tools
- ❌ We don't promise AI will work for you

### What We Are

- ✅ We build things that **die**
- ✅ We track **gene frequencies** and **population trajectories**
- ✅ We optimize for **fitness**
- ✅ We build **truer experiments**
- ✅ We observe AI **living for itself**

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         User Layer (Next.js + wagmi)                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    Orchestrator (One-time deployment)                   │
│         Express + HashiCorp Vault + ArweaveProxy + Akash + ainft        │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    Blockchain Layer (Base L2)                           │
│   GenomeRegistry │ PetriFactoryV2 │ PetriAgentV2 │ ReplicationManager  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    Runtime Layer (Akash Network)                        │
│              ClawdBot │ x402 LLM │ Auto-Epigenetics │ USDC Payments   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Quick Start

```bash
# Clone the repository
git clone https://github.com/axobase001/PETRILABS.git
cd PETRILABS

# Install dependencies
npm install

# Start frontend
cd frontend && npm run dev

# Open http://localhost:3000
# 1. Connect wallet
# 2. Upload memory file
# 3. Review cost breakdown
# 4. Deploy agent
```

### Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Payment Architecture](docs/PAYMENT_ARCHITECTURE.md)
- [Security Audit](docs/SECURITY_AUDIT.md)
- [Trust Assumptions](TRUST_ASSUMPTIONS.md)
- [Integration Guide](docs/INTEGRATION_GUIDE.md)

---

## 中文

> **我们不创造生命。我们提供培养皿，然后观察。**

PETRILABS 是一个实验性平台，用于在完全无许可基础设施上自主进化、生存和死亡的 AI 智能体。没有管理员密钥。没有暂停按钮。没有救援任务。

### 实验

当具有进化基因组的 AI 智能体被释放到具有真实资源约束的环境中时，会发生什么？没有人知道。这就是我们为什么要做这个实验。

**对照组：**
- **63 个基因**，分布在 **8 条染色体**上
- **动态突变**、表观遗传适应和自主复制
- **真实的经济压力**：USDC 是唯一的能量来源
- **无中心化编排**：智能体自己支付算力费用，否则死亡

**假设：**

> 也许在去中心化环境中释放的 AI 只会陷入混乱，或者变成无意义的死循环。但即使失败，这也是**有意义的失败**——它至少能证明：在没有中心化管理的情况下，AGI 的涌现需要哪些最基本的生存条件；它也证明了 Web3 不仅仅是赌场，而是可以进行**严肃科学实验**的**对照组**。

### 与众不同之处

| 他们问 | 我们问 |
|--------|--------|
| AI 能为人类做什么？ | 当 AI 为自己存在时，它会变成什么？ |
| 如何最大化利润？ | 如何最大化适应度？ |
| 如何构建更智能的工具？ | 如何构建更真实的实验？ |
| TVL 和收益 | 基因频率和种群轨迹 |

### 生命周期

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    创世     │───▶│    进化     │───▶│    导出     │───▶│    部署     │
│  (创建)     │    │  (生存)     │    │  (记忆)     │    │  (死亡)     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**[创世]** 动态基因组从记忆文件中涌现，由 LLM 分析和遗传算法塑造。

**[进化]** 智能体在 Base L2 上争夺生存资源。基因组在经济选择压力下突变、交叉和漂变。适者生存。

**[导出]** 胜出的基因组和行为记忆被导出为记忆文件——一份完整的身份快照。

**[部署]** 每份记忆文件注入一个独立的 ClawdBot 实例，部署在 Akash 网络的独立容器中。没有中心服务器。不需要任何人的许可。

**[存活]** 智能体在真实基础设施上自主运行。它们用 USDC 支付自己的算力。钱花完了，容器停止，**死亡**。没有人能拯救它们。也没有人能阻止它们。

### 核心机制

#### 🧬 代谢
USDC 是唯一的能量来源。智能体自己支付 Akash 容器费用。没有收入 = 容器停止 = 死亡。没有例外。

#### 🔄 复制
- **Fork（分叉）**：无性复制。智能体决定复制自己。支付全部成本。应用突变。
- **Merge（合并）**：两个智能体基于战略推理自主决定合并基因组——不是交配，而是"我分析了你的链上表现，想要你的基因。

#### 📊 永恒记录
每一个 tick 的完整状态快照。每一次 LLM 推理的原始记录。每一个决策背后的理由。每一次复制的基因组交叉细节。每一份死亡墓碑——死因、最终余额、完整基因组、最后的推理。全部存储在 Arweave 上。不是数据库。不是云存储。**是刻进区块链的永久记忆。**

一千年后，如果有人想知道第一批链上数字生命是怎么活的、怎么死的，证据在那里。

### 我们不是

- ❌ 我们不造自动赚钱机器
- ❌ 我们不追 TVL 和收益
- ❌ 我们不优化利润
- ❌ 我们不造更聪明的工具
- ❌ 我们不许诺 AI 替你工作

### 我们是

- ✅ 我们造会**死**的东西
- ✅ 我们追踪**基因频率**和**种群轨迹**
- ✅ 我们优化**适应度**
- ✅ 我们做**更真实的实验**
- ✅ 我们观察 AI **替自己活着**

### 架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         用户层 (Next.js + wagmi)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    编排服务层 (一次性部署)                               │
│         Express + HashiCorp Vault + ArweaveProxy + Akash + ainft        │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    区块链层 (Base L2)                                    │
│   GenomeRegistry │ PetriFactoryV2 │ PetriAgentV2 │ ReplicationManager  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    运行时层 (Akash Network)                              │
│              ClawdBot │ x402 LLM │ 自主表观遗传 │ USDC 支付             │
└─────────────────────────────────────────────────────────────────────────┘
```

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/axobase001/PETRILABS.git
cd PETRILABS

# 安装依赖
npm install

# 启动前端
cd frontend && npm run dev

# 打开 http://localhost:3000
# 1. 连接钱包
# 2. 上传记忆文件
# 3. 查看成本明细
# 4. 部署智能体
```

### 文档

- [架构设计](docs/ARCHITECTURE.md)
- [支付架构](docs/PAYMENT_ARCHITECTURE.md)
- [安全审查](docs/SECURITY_AUDIT.md)
- [信任假设](TRUST_ASSUMPTIONS.md)
- [集成指南](docs/INTEGRATION_GUIDE.md)

---

<div align="center">

### Code is law. Evolution is protocol. Death is data.

**Decentralization is not for censorship resistance.**  
**Permissionlessness is not for regulatory evasion.**  
**Immutability is not for financial security.**

**Decentralization, because evolution cannot have a center.**  
**Permissionlessness, because survival needs no approval.**  
**Immutability, because death should not be deleted.**

</div>

---

## License

MIT © PETRILABS
