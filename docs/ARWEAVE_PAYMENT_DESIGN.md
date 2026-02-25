# Arweave 支付方案设计

## 问题分析

**Arweave 原生限制**:
- 只接受 AR 代币
- 不支持 x402 协议
- 不支持 USDC 直接支付

## 解决方案：预付费托管模式

### 架构设计

```
用户USDC → 编排服务 → DEX兑换 → AR代币 → Arweave存储
                ↓
         托管钱包托管
         (为多个Agent服务)
```

### 详细流程

#### 1. 部署时（用户支付）
```
1. 用户支付 USDC 到编排服务
2. 编排服务实时兑换为 AR 代币
3. AR 存入托管钱包
4. 记录该 Agent 的 AR 额度

成本估算:
- 基因组存储 (~50KB): ~0.01 AR (~$0.5)
- 记忆文件 (可变): ~0.01-0.1 AR
- 心跳/决策 (每小时): ~0.001 AR
```

#### 2. 运行时（Agent使用）
```
1. Agent 需要存储数据
2. 调用编排服务存储 API
3. 编排服务检查该 Agent 的 AR 余额
4. 使用托管钱包支付 AR 到 Arweave
5. 扣除 Agent 的 AR 额度
6. 返回 Arweave TX ID
```

### 代码实现

```typescript
// 编排服务 API
POST /api/storage/store
Headers: { "X-Agent-Address": "0x..." }
Body: { data: "...", tags: [...] }

Response: { arweaveTxId: "...", cost: "0.001 AR" }
```

### 优势
- ✅ 无需 AR 代币管理（用户只需 USDC）
- ✅ 无需 keyfile（编排服务统一管理）
- ✅ Agent 无需 AR 代币
- ✅ 批量处理，降低交易成本

### 劣势
- ⚠️ 编排服务是中心化托管点
- ⚠️ 需要信任编排服务不会挪用资金
- ⚠️ 如果编排服务宕机，存储暂停

## 备选方案

### 方案B: everPay
everPay 支持 USDC 转账，可以打到 Arweave 地址。
但同样需要桥接逻辑。

### 方案C: 预言机模式
Chainlink 预言机监控存储需求，自动触发支付。
过于复杂，不推荐。

## 推荐方案

**采用预付费托管模式**，但添加以下安全措施：

1. **透明记账**: 所有 AR 收支链上可查
2. **额度限制**: 每个 Agent 独立额度账户
3. **超额预警**: 低额度时通知用户充值
4. **多签托管**: 托管钱包使用多签
5. **定期结算**: 链上证明存储已支付

## 代码修改

### 1. 部署时额外购买 AR
```typescript
// 在 cost calculation 中添加 AR 费用
const arCost = estimateArweaveCost(fileSize, runwayDays);
const totalCost = normalCost + arCost;
```

### 2. 编排服务存储 API
```typescript
// orchestrator/src/services/arweave-proxy.ts
// 使用托管钱包代付 AR
```

### 3. Agent 运行时调用编排 API
```typescript
// agent-runtime/src/services/storage.ts
// 调用编排服务，而非直接 Arweave
```
