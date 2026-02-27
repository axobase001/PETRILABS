# PETRILABS Security Audit & Hardening Guide

## 概述

本文档提供 PETRILABS 项目的安全审计结果和加固建议。

---

## 智能合约安全

### 已实施的安全措施

#### 1. 访问控制
```solidity
// PetriAgentV2.sol
modifier onlyOrchestratorOrAgent() {
    if (msg.sender != orchestrator && msg.sender != agentEOA) {
        revert NotAgentOrOrchestrator();
    }
    _;
}
```
- ✅ 双重权限检查（orchestrator + agentEOA）
- ✅ 明确的错误消息

#### 2. 重入保护
```solidity
// 使用 Checks-Effects-Interactions 模式
function die(string calldata arweaveTxId) external {
    if (!isAlive) revert AgentAlreadyDead();
    
    // 1. Checks
    uint256 finalBalance = balance;
    
    // 2. Effects
    isAlive = false;
    
    // 3. Interactions (external calls last)
    _transferLegacy(finalBalance);
}
```

#### 3. 整数溢出保护
- ✅ Solidity 0.8.x 内置溢出检查
- ✅ 使用 SafeERC20 for USDC 转账

#### 4. 输入验证
```solidity
function initialize(
    bytes32 _genomeHash,
    address _orchestrator,
    ...
) external {
    if (_genomeHash == bytes32(0)) revert InvalidGenome();
    if (_orchestrator == address(0)) revert InvalidAddress();
    // ...
}
```

### 审计发现

#### 高危 - 已修复
1. **死亡函数中的重入风险**
   - 问题: 遗产转账可能在状态更新前执行
   - 修复: 使用 Checks-Effects-Interactions 模式
   - Commit: `fix(death): reorder state updates`

2. **心跳间隔验证**
   - 问题: 缺少最小间隔检查
   - 修复: 添加 `MIN_HEARTBEAT_INTERVAL` 常量验证

#### 中危 - 已修复
1. **代理升级风险**
   - 问题: 实现合约缺少 `initialized` 标记
   - 修复: 使用 OpenZeppelin Initializable

2. **Gas 限制**
   - 问题: 某些操作可能超过区块 gas 限制
   - 修复: 添加批处理和分页机制

#### 低危 - 建议
1. **事件参数索引**
   - 建议: 更多事件参数添加 `indexed`
   - 状态: 可选优化

---

## Runtime 安全

### 1. 决策解析器 (6层防御)

```typescript
// decision/parser.ts
export class DecisionParser {
  // Layer 1: JSON 提取
  // Layer 2: 结构验证 (Zod)
  // Layer 3: 动作白名单
  // Layer 4: 参数验证
  // Layer 5: 业务规则
  // Layer 6: 失败回退
}
```

### 2. 技能执行限制

```typescript
// 硬编码风险限制
const RISK_LIMITS = {
  leverage: { max: 5 },           // 最大 5x 杠杆
  tradeSize: { maxPercent: 30 },  // 最大 30% 余额
  polymarket: { max: 5 },         // 最大 5 USDC
};
```

### 3. 基因驱动的安全策略

```typescript
// 基因影响技能可用性
if (traits.savingsTendency > 0.8) {
  // 禁止高风险技能
  availableSkills = availableSkills.filter(s => s.riskLevel !== 'high');
}
```

---

## API 安全

### 1. 认证与授权

```typescript
// middleware/auth.ts
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

### 2. 速率限制

```typescript
// api/dashboard.ts
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,            // 100 requests per minute
});
```

### 3. 输入验证

```typescript
// 地址验证
if (!ethers.isAddress(address)) {
  return res.status(400).json({
    error: { code: 'INVALID_ADDRESS', message: 'Invalid address format' }
  });
}
```

---

## 基础设施安全

### 1. Docker 安全

```dockerfile
# Dockerfile
FROM node:20-alpine AS production

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# 只复制生产依赖
COPY --from=builder /app/node_modules ./node_modules
```

### 2. 环境变量保护

```bash
# .env.production (永远不要提交到 git)
JWT_SECRET=<32-byte-random>
API_KEY=<16-byte-random>
ARWEAVE_KEY=<encrypted-wallet>
AKASH_MNEMONIC=<encrypted-mnemonic>
```

### 3. 网络安全

```yaml
# docker-compose.yml
services:
  orchestrator:
    # 不暴露端口到公网
    networks:
      - internal
    
  nginx:
    # 只暴露 80/443
    ports:
      - "80:80"
      - "443:443"
```

---

## 密钥管理建议

### 生产环境

1. **使用密钥管理服务 (KMS)**
   ```typescript
   // AWS KMS 示例
   import { KMS } from '@aws-sdk/client-kms';
   
   const kms = new KMS({ region: 'us-east-1' });
   const decrypted = await kms.decrypt({ CiphertextBlob: encryptedKey });
   ```

2. **硬件安全模块 (HSM)**
   - 考虑使用 AWS CloudHSM 或 Azure Dedicated HSM
   - 用于签署关键交易

3. **密钥轮换**
   ```bash
   # 定期轮换脚本
   ./scripts/rotate-keys.sh --environment production
   ```

---

## 监控与告警

### 1. 安全事件监控

```typescript
// 监控异常模式
const SECURITY_ALERTS = {
  'HIGH_GAS_USAGE': 'Gas usage > 3x average',
  'RAPID_HEARTBEATS': '> 10 heartbeats in 1 minute',
  'FAILED_AUTH': '> 5 failed auth attempts',
  'UNUSUAL_SKILL': 'Skill usage outside normal hours',
};
```

### 2. 告警配置

```bash
# .env.production
SENTRY_DSN=https://xxx@sentry.io/yyy
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
SECURITY_ALERT_EMAIL=security@petrilabs.io
```

---

## 安全清单

### 部署前

- [ ] 合约已通过审计
- [ ] 所有私钥已安全存储
- [ ] 环境变量已配置
- [ ] 速率限制已启用
- [ ] SSL 证书已配置
- [ ] 日志监控已启用
- [ ] 备份策略已制定

### 运行时

- [ ] 定期安全扫描
- [ ] 异常行为监控
- [ ] 密钥轮换计划
- [ ] 灾难恢复演练
- [ ] 访问日志审计

---

## 应急响应

### 发现安全事件时

1. **立即行动**
   - 暂停相关服务
   - 保留日志证据
   - 通知核心团队

2. **调查**
   - 分析攻击向量
   - 评估影响范围
   - 确定修复方案

3. **恢复**
   - 应用安全补丁
   - 恢复服务
   - 加强监控

4. **复盘**
   - 撰写事件报告
   - 更新安全措施
   - 团队培训

---

## 参考资源

- [OpenZeppelin Security Guidelines](https://docs.openzeppelin.com/learn/)
- [Consensys Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)

---

*Last Updated: 2026-02-27*
*Version: 1.0.0*
