# Tasks 31-35 Completion Report

## Summary

Completed all 5 advanced features for PETRILABS, addressing "vegetable strategy" and "missing evolution operators" problems.

---

## Task 31: Fitness Metrics + Tombstone Extension ✅

### Files Modified/Created
1. `agent-runtime/src/memory/working-memory.ts` - Added fitness tracking
2. `agent-runtime/src/metabolism/tracker.ts` - Added `getTotalCostByType()`
3. `agent-runtime/src/lifecycle/death-manager.ts` - Added `calculateFitnessMetrics()`
4. `agent-runtime/src/types/index.ts` - Added `FitnessMetrics` to `DeathData`

### Five Fitness Metrics
```typescript
interface FitnessMetrics {
  survivalEfficiency: number;   // Days per USDC of initial deposit
  capitalGrowthRate: number;    // (peak - initial) / initial
  independenceScore: number;    // 1 - (external / total income)
  decisionQuality: number;      // Profitable decisions / total financial decisions
  cognitiveEfficiency: number;  // Decisions per USDC spent on cognition
}
```

### Key Features
- Peak balance tracking (automatically updated on each balance record)
- Financial decision tracking (PnL per action)
- Integration with tombstone data export
- Handles Pollinations free tier (Infinity for cognitive efficiency when cost is 0)

---

## Task 32: Epigenetic Weighted Mutation (Fork) ✅

### File Created
`agent-runtime/src/evolution/mutation.ts`

### Key Algorithm
```typescript
// Mutation probability: active ~5%, silent ~40%
const mutationProb = 0.05 + (1 - activity) * 0.35;

// Mutation scale: active ±3%, silent ±28%
const mutationScale = 0.03 + (1 - activity) * 0.25;
```

### Features
- Activity normalization based on max activation count
- Separate mutation probability and scale formulas
- Value clamping to [0, 100000] range
- Batch mutation support for multiple offspring
- Test helpers for mutation distribution validation

### Usage
```typescript
import { mutateGenome } from './evolution/mutation';

const childGenome = mutateGenome(parentGenome, epiProfile);
```

---

## Task 33: Three-Factor Weighted Crossover (Merge) ✅

### File Created
`agent-runtime/src/evolution/crossover.ts`

### Weight Formula
```typescript
// Baseline: initiator 55%
// Capital factor: ±15% (based on balance ratio)
// Age factor: ±10% (based on survival days)
// Clamped to [35%, 80%]

let w = 0.55;
w += balanceAdvantage * 0.30;  // ±15% max
w += ageAdvantage * 0.20;       // ±10% max
const finalWeight = clamp(w, 0.35, 0.80);
```

### Features
- Per-gene probabilistic selection
- Post-crossover replication noise (5% genes, ±5%)
- Weight breakdown calculation for audit
- Test scenarios for validation

### Test Scenarios
1. Equal merge: 55% weight
2. Strong acquirer: 71% weight
3. Poor initiator: 36% weight (clamped)

---

## Task 34: Epigenetic Tracking + Tombstone Export ✅

### File Created
`agent-runtime/src/genome/expression.ts`

### Key Features
- Continuous gene activation tracking from birth
- EMA (90% history + 10% current) for impact weight
- Methylation dynamics:
  - Activation decreases methylation by 0.02
  - 3+ days unused increases methylation by 0.01 * days
- 63 gene names mapped (A/B/C/D/E chromosomes)
- Action-to-gene impact mapping (REST, TRADE, SWAP, POLYMARKET, etc.)

### Integration Points
- DeathManager exports `epigeneticProfile` to tombstone
- Fork uses epigenetic profile for mutation
- `getActiveGenes()` and `getSilentGenes()` for debugging

---

## Task 35: Container Lease Awareness ✅

### Files Created
1. `agent-runtime/src/infrastructure/lease-manager.ts`
2. `agent-runtime/src/skills/adapters/lease-renewal.ts`

### Key Features
- Lease status tracking (healthy/warning/urgent/critical)
- x402 middleware integration for payments
- Renewal cost caching (5 minutes)
- Strategic recommendations based on balance

### Critical States
```typescript
// > 10 days: healthy
// <= 5 days: urgent (forced renewal decision)
// <= 1 day: critical (die if can't afford 1 day)
```

### Gene-Driven Renewal
```typescript
// High savingsTendency (>0.7): prefer 30-day renewal
// High riskAppetite (>0.7): may prefer 7-day for flexibility
```

### Solves "Vegetable Strategy"
- 10 USDC only lasts 30-44 days (depending on rent)
- Must actively earn or receive external funding
- Rent is "evolution pressure" - can't just exist

---

## Fix: Dividend Calculation (Net Profit Only) ✅

### Problem
Original design incorrectly triggered dividends on gross income:
- Invest 2 USDC → Receive 2.16 USDC → Dividend on 2.16 (wrong)

### Solution
Only net profit triggers dividends:
- Invest 2 USDC → Receive 2.16 USDC → Net profit 0.16 → Dividend on 0.16 (correct)

### Implementation
1. `SkillResult` type extended with `pnl` field
2. `SkillResultProcessor` class created:
   - Records principal cost before skill execution
   - Calculates net profit: `max(0, grossIncome - principalCost)`
   - Only calls `recordEarnedIncome(netProfit)`
   - Records in WorkingMemory for fitness calculation

### Files Modified
- `agent-runtime/src/types/index.ts` - Added `pnl`, `txHash`, `message` to `SkillResult`
- Created `agent-runtime/src/skills/skill-result-processor.ts`

---

## Integration Flow

```
Birth
  ↓
GeneExpressionEngine starts tracking (Task 34)
  ↓
Skills execute with principal cost tracking (Fix)
  ↓
SkillResultProcessor calculates net profit (Fix)
  ↓
WorkingMemory records financial results (Task 31)
  ↓
LeaseManager monitors rent (Task 35)
  ↓
Fork → mutateGenome with epiProfile (Task 32)
  ↓
Merge → crossoverGenomes with 3-factor weight (Task 33)
  ↓
Death → export fitnessMetrics + epigeneticProfile (Tasks 31, 34)
```

---

## File Summary

| Task | Files | Lines |
|------|-------|-------|
| 31 | 4 | ~300 |
| 32 | 1 | ~200 |
| 33 | 1 | ~250 |
| 34 | 1 | ~350 |
| 35 | 2 | ~300 |
| Fix | 2 | ~150 |
| **Total** | **11** | **~1550** |

---

## Next Steps

1. **Integration Testing**: Test full lifecycle with all 5 tasks
2. **Dashboard Update**: Display 5 fitness metrics radar chart
3. **Contract Update**: Add `EVICTION` death cause to enum
4. **Deploy Script**: Add 50/50 fund split for lease prepayment

---

*Completed: 2026-02-27*
*Version: 1.0.0*
