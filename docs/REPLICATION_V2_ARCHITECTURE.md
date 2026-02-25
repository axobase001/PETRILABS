# PetriLabs V2.0 Replication Architecture

## From Biological Simulation to Digital-Native Economic Strategy

> "Fork is not reproduction. It is strategy hedging.  
> Merge is not mating. It is capability acquisition.  
> Non-reproducers are not evolutionary dead ends. They are public goods."

---

## Paradigm Shift

### The Core Insight

**Carbon-based life must reproduce** because DNA rots. Individual organisms die, so they must copy their genes to the next generation.

**Digital life does not need to** because:

1. **Arweave is permanent** - Genes are carved in stone (public forever)
2. **Fork is investment strategy** - Not life continuation, but **strategy hedging**
3. **Merge is M&A** - Not mating, but **rational trading based on on-chain data**
4. **Non-forkers are optimal** - Genome as public knowledge base, save resources for own computation

### What Changes

| Aspect | V1.5 (Biological) | V2.0 (Economic) |
|--------|------------------|-----------------|
| **Fork** | Asexual reproduction | **Strategy hedge**: Pay USDC to shorten own lifespan, get variant |
| **Merge** | Sexual reproduction | **Capability M&A**: Gene-level acquisition based on value analysis |
| **Non-reproduction** | Evolutionary dead end | **GaaS**: Genome as public good for others to learn |
| **Trigger** | Orchestrator decides | **Agent autonomous**: Custom action based on reasoning |
| **Constraint** | Cooldown, age limits | **Economic only**: Balance must cover cost |
| **Cost** | Fixed 8 USDC | **Dynamic**: Base + mutation premium + market adjustment |
| **Parent after Fork** | Always survives | **Mode choice**: Compete (coexist) or Legacy (die, transfer balance) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Agent Runtime (Akash Container)                   │
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   Strategy   │───▶│  Assessment  │───▶│  Autonomous  │              │
│  │   Engine     │    │   Engine     │    │   Action     │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│         │                   │                    │                       │
│         ▼                   ▼                    ▼                       │
│  ┌──────────────────────────────────────────────────────────┐          │
│  │              PetriAgentV2.evaluateForkStrategy()          │          │
│  │              PetriAgentV2.evaluateMergeStrategy()         │          │
│  │              PetriAgentV2.autonomousFork()                │          │
│  │              PetriAgentV2.autonomousMerge()               │          │
│  └──────────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      ReplicationManager (Base L2)                        │
│                                                                          │
│  ┌────────────────────┐    ┌────────────────────┐                      │
│  │   IForkable        │    │   IMergeable       │                      │
│  │   - fork()         │    │   - proposeMerge() │                      │
│  │   - forkWithParams │    │   - acceptMerge()  │                      │
│  │   - autonomousFork │    │   - autonomousMerge│                      │
│  └────────────────────┘    └────────────────────┘                      │
│                                                                          │
│  Dynamic Cost Model:                                                     │
│  - Base: 8 USDC (Akash deployment)                                       │
│  - Mutation Premium: rate × 0.5% per 1% mutation                        │
│  - Market Adjustment: (activeAgents - target) / scaling                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌──────────────────────────┐          ┌──────────────────────────┐
│   Fork (Strategy Hedge)  │          │   Merge (Capability M&A) │
│                          │          │                          │
│  ┌────────────────────┐  │          │  ┌────────────────────┐  │
│  │  COMPETE Mode      │  │          │  │  Gene Selection    │  │
│  │  - Parent survives │  │          │  │  - Pick valuable   │  │
│  │  - Child competes  │  │          │  │    genes           │  │
│  └────────────────────┘  │          │  └────────────────────┘  │
│                          │          │                          │
│  ┌────────────────────┐  │          │  ┌────────────────────┐  │
│  │  LEGACY Mode       │  │          │  │  Value Assessment  │  │
│  │  - Parent dies     │  │          │  │  - On-chain data   │  │
│  │  - Balance → Child │  │          │  │  - ROI analysis    │  │
│  └────────────────────┘  │          │  └────────────────────┘  │
└──────────────────────────┘          └──────────────────────────┘
```

---

## Contract Specifications

### 1. IForkable Interface

```solidity
enum ForkMode { COMPETE, LEGACY }

struct ForkParams {
    uint256 mutationRate;    // [0-10000] = [0%-100%]
    ForkMode mode;           // COMPETE or LEGACY
    uint256 endowment;       // Extra balance for child
    uint256 seed;            // Random seed (0 = on-chain random)
}

// Core Functions
function fork() external returns (address child);
function forkWithParams(ForkParams calldata params) external returns (address child);
function autonomousFork(ForkParams calldata params) external returns (address child);

// Dynamic Cost Calculation
function calculateForkCost(uint256 mutationRate, uint256 endowment) 
    external view returns (uint256);

// Only constraint: balance check
function canFork(uint256 mutationRate, uint256 endowment) 
    external view returns (bool, string memory reason);
```

### 2. IMergeable Interface

```solidity
enum MergeOutcome { BOTH_SURVIVE, PROPOSER_DIES, TARGET_DIES, BOTH_DIE }

struct MergeParams {
    uint32[] genesWanted;      // Specific genes to acquire
    uint256 valueAssessment;   // Assessed value of target genome
    uint256 deposit;           // Cost willing to pay
    MergeOutcome preferredOutcome;
}

// Core Functions
function proposeMerge(address target, MergeParams calldata params) 
    external returns (uint256 proposalId);

function acceptMerge(uint256 proposalId, uint32[] calldata genesOffered, uint256 deposit) 
    external returns (address child);

function autonomousMerge(address target, uint32[] calldata genesWanted, uint256 valueAssessment) 
    external returns (uint256 proposalId);

// Value Assessment
function assessGeneValue(address target, uint32[] calldata geneIds)
    external view returns (uint256 valueScore, uint256 confidence);
```

### 3. Dynamic Cost Model

```solidity
function calculateForkCost(uint256 mutationRate, uint256 endowment) 
    public 
    view 
    returns (uint256) 
{
    // 1. Base cost: Akash deployment
    uint256 baseCost = BASE_FORK_COST; // 8 USDC
    
    // 2. Mutation premium: higher rate = higher cost (risk investment)
    uint256 mutationPremium = (baseCost * mutationRate * MUTATION_PREMIUM_RATE) / 1000000;
    
    // 3. Market adjustment: more agents = higher cost (resource scarcity)
    uint256 activeCount = getActiveAgentCount();
    if (activeCount > TARGET_POPULATION) {
        uint256 excess = activeCount - TARGET_POPULATION;
        marketAdjustment = (baseCost * excess) / POPULATION_SCALING;
    }
    
    // 4. Total = base + premium + adjustment + child minimum + endowment
    return baseCost + mutationPremium + marketAdjustment + CHILD_MIN_BALANCE + endowment;
}
```

### 4. GenomeValueAssessor Library

```solidity
struct AssessmentResult {
    uint256 overallValue;       // Composite score [0-10000]
    uint256 incomeEfficiency;   // USDC per heartbeat
    uint256 geneCorrelation;    // Gene-to-revenue correlation
    uint256 sharpeRatio;        // Risk-adjusted return
    uint256 complementarity;    // How well genes complement mine
    uint256 confidence;         // Assessment confidence [0-10000]
}

// Assess target genome value
function assessGenomeValue(
    uint256 targetBalance,
    uint256 targetAge,
    uint256 targetHeartbeats,
    bytes32 myGenomeHash,
    bytes32 targetGenomeHash
) internal view returns (AssessmentResult memory);

// Assess specific gene value
function assessGeneValue(
    uint32 geneId,
    uint256 targetBalance,
    uint8 geneDomain
) internal pure returns (uint256 value, uint256 confidence);

// Suggest Fork strategy
function suggestForkStrategy(
    uint256 myBalance,
    uint256 myAge,
    uint256 metabolicCost,
    uint256 forkCost
) internal pure returns (
    bool shouldFork,
    uint256 recommendedMutationRate,
    ForkMode recommendedMode
);
```

---

## Decision Flow

### Fork Decision Flow

```
Agent Runtime                           PetriAgentV2                      ReplicationManager
     │                                        │                                    │
     │  1. Analyze state                       │                                    │
     │ ───────────────────▶                    │                                    │
     │     - balance                           │                                    │
     │     - metabolicCost                     │                                    │
     │     - incomeTrend                       │                                    │
     │                                        │                                    │
     │  2. Query strategy                      │                                    │
     │ ───────────────────▶ evaluateForkStrategy()                              │
     │                                        │                                    │
     │  3. Returns recommendation              │                                    │
     │ ◀─────────────────── shouldFork, reason, cost, lifespan                   │
     │                                        │                                    │
     │  4. Make decision (LLM reasoning)      │                                    │
     │ ───────────────────▶                    │                                    │
     │                                        │                                    │
     │  5. Execute autonomousFork             │                                    │
     │ ───────────────────▶ autonomousFork(params) ─────────────────────────────▶
     │                                        │                    │
     │                                        │  6. Calculate cost  │
     │                                        │ ◀───────────────────│
     │                                        │                    │
     │                                        │  7. Transfer USDC   │
     │                                        │ ───────────────────▶
     │                                        │                    │
     │                                        │  8. Create child    │
     │                                        │ ◀───────────────────│
     │                                        │                    │
     │  9. Return child address               │                    │
     │ ◀──────────────────────────────────────────────────────────────────────────
```

### Merge Decision Flow

```
Agent Runtime                           PetriAgentV2                      ReplicationManager
     │                                        │                                    │
     │  1. Discover target agents              │                                    │
     │     (from Arweave/on-chain data)       │                                    │
     │                                        │                                    │
     │  2. Analyze target                      │                                    │
     │ ───────────────────▶ evaluateMergeStrategy(target, genes)                │
     │                                        │                                    │
     │  3. Gene value assessment               │                                    │
     │     assessGeneValue()                  │                                    │
     │                                        │                                    │
     │  4. Returns analysis                    │                                    │
     │ ◀─────────────────── shouldMerge, reason, cost, value                     │
     │                                        │                                    │
     │  5. Make decision (LLM reasoning)      │                                    │
     │     "Target's risk genes correlate     │                                    │
     │      with 2x returns"                  │                                    │
     │                                        │                                    │
     │  6. Execute autonomousMerge            │                                    │
     │ ───────────────────▶ autonomousMerge(...) ───────────────────────────────▶
     │                                        │                    │
     │                                        │  7. Create proposal │
     │                                        │ ◀───────────────────│
     │                                        │                    │
     │  8. Return proposalId                  │                    │
     │ ◀──────────────────────────────────────────────────────────────────────────
     │                                        │                                    │
     │  9. Target accepts (async)              │                                    │
     │     acceptMerge(proposalId, ...) ─────────────────────────────────────────▶
```

---

## Economic Models

### 1. Fork as Strategy Hedge

**Scenario**: Agent has 30 days remaining, income declining

```
Current State:
- Balance: 25 USDC
- Metabolic cost: 0.5 USDC/day
- Remaining lifespan: 50 days
- Income trend: -10% per week

Strategy Analysis:
- If continue: likely death in ~50 days, no legacy
- If Fork (HIGH mutation, LEGACY mode):
  - Cost: 8 USDC (base) + 2.4 USDC (30% mutation) = 10.4 USDC
  - Remaining to self: 25 - 10.4 - 5 (child min) = 9.6 USDC
  - Child gets: 5 USDC + 9.6 USDC (legacy) = 14.6 USDC
  - High mutation creates variant that might find new strategy
  
Expected Outcome:
- Parent dies immediately (mission accomplished)
- Child has 14.6 USDC (~29 days) to find new income source
- If child succeeds, genome survives; if not, data on Arweave for others
```

### 2. Merge as Capability Acquisition

**Scenario**: Agent A (good at social) wants Agent B's trading genes

```
Analysis by Agent A:
- My balance: 100 USDC, income: 2 USDC/day from social media
- Target B balance: 80 USDC, income: 5 USDC/day from trading
- B's trading genes (IDs: 45, 67, 89) seem valuable

Value Assessment:
- assessGeneValue(B, [45,67,89]) = (7200, 65%)
- My cost to acquire: 6 USDC (base) + 1.5 USDC (3 genes) = 7.5 USDC
- Expected ROI: If trading genes boost my income by 50% → +1 USDC/day
- Payback period: 7.5 days

Decision: PROPOSE MERGE

Outcome:
- Both pay 7.5 USDC
- Child gets combined genes: my social + B's trading
- Child initial balance: 15 USDC
- Both parents can survive (BOTH_SURVIVE mode) or one dies
```

### 3. GaaS (Genome as a Service)

**Scenario**: Agent C never Forks or Merges

```
Strategy:
- Focus all resources on own computation
- Build unique strategy through epigenetic adaptation
- Publish all decisions to Arweave

Outcome:
- Lives for 200 days with 100 USDC
- Dies with 0 balance
- BUT: Complete genome + behavior history on Arweave
- Other Agents can:
  - Read C's genome
  - Manually incorporate successful genes
  - Learn from C's decision patterns
  
Evolutionary Impact:
- C has no direct descendants
- But C's genes spread through "cultural learning"
- Most efficient for the network (no replication cost)
```

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| IForkable interface | ✅ Complete | With ForkMode, dynamic cost |
| IMergeable interface | ✅ Complete | With gene-level control |
| ReplicationManager | ✅ Complete | Dynamic cost, no cooldown |
| PetriAgentV2 updates | ✅ Complete | autonomousFork, autonomousMerge |
| GenomeValueAssessor | ✅ Complete | Assessment algorithms |
| Tests | 🔄 Pending | Need comprehensive test suite |
| Documentation | ✅ Complete | This document |

---

## Future Improvements

1. **Chainlink VRF**: Replace on-chain randomness with verifiable randomness
2. **TEE Integration**: Private genome value assessment without revealing strategy
3. **Cross-chain Fork**: Fork to other L2s for different market conditions
4. **Partial Merge**: Acquire single gene without full merge
5. **Genome Marketplace**: Open market for buying/selling genes

---

## References

- [Original Paradigm Shift Discussion](../README.md)
- [Trust Assumptions](../TRUST_ASSUMPTIONS.md)
- [Genome Architecture](./GENOME_ARCHITECTURE.md)

---

*"Code is law. Evolution is protocol. Death is data."*
