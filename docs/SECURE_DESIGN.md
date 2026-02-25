# PETRILABS 安全设计 - 使用第三方服务

## 1. 私钥生成与托管 - 使用 AWS KMS / HashiCorp Vault

### 方案: 编排服务生成，Vault托管，容器获取

```
部署流程:
1. 编排服务生成临时钱包
2. 私钥存入 HashiCorp Vault (单次使用token)
3. 容器启动时从Vault获取私钥
4. Vault token立即失效
5. 私钥仅存容器内存
```

**使用服务**: HashiCorp Vault 或 AWS Secrets Manager
**成本**: ~$0.40/月/secret
**优点**: 成熟的密钥托管，审计日志，访问控制

---

## 2. Arweave存储 - 使用 Irys (原Bundlr)

### 为什么不直接用Arweave?
- 需要AR代币
- 需要keyfile管理
- Agent需要额外密钥

### Irys方案
```
Agent(USDC) → Irys → Arweave
- Irys接受USDC支付
- Irys处理AR代币转换
- Agent无需AR，无需keyfile
```

**使用服务**: Irys Network (https://irys.xyz)
**成本**: 与Arweave相当 + 少量服务费
**集成**: SDK直接支持ethers.js

---

## 3. Akash支付 - Akash已原生支持USDC!

### Akash USDC支付 (2024年新增)
```yaml
# SDL配置
services:
  agent:
    image: petrilabs/clawbot:latest
    
deployment:
  agent:
    funds:
      denom: uusdc
      amount: "1000000"  # 1 USDC
```

**Akash Cloudmos控制台**: 直接支付USDC部署
**Akash CLI**: 支持USDC denom

**无需桥接！无需AKT！**

---

## 4. LLM支付 - ainft.com + x402 (已集成)

保持当前实现。

---

## 5. 完整的无感支付流程

### 部署阶段 (用户操作)
```
1. 连接钱包
2. 上传记忆文件
3. 确认成本明细:
   - LLM分析: $3 (OpenRouter)
   - 基因组存储: $0.5 (Irys)
   - Akash押金: $30 (30天USDC)
   - 平台费: $5
4. 一键签名授权USDC
5. 部署完成
```

### 运行阶段 (Agent自治)
```
心跳1:
  - Akash: 自动从押金扣USDC ✅
  - LLM决策: x402支付USDC ✅
  - 数据存储: Irys支付USDC ✅

心跳2:
  - Akash: 自动扣款 ✅
  - LLM决策: x402支付 ✅
  - 数据存储: Irys支付 ✅

...完全自治，无需用户干预
```

---

## 6. 第三方服务清单

| 功能 | 服务 | 成本 | 集成复杂度 |
|------|------|------|-----------|
| 私钥托管 | HashiCorp Vault | $0.40/月 | 低 |
| 永久存储 | Irys | ~$1/MB | 低 |
| 容器托管 | Akash | ~$1-3/天 | 低 |
| LLM推理 | ainft.com | ~$0.01/次 | 低 |

---

## 7. 单向门验证

### 部署后，谁还能控制Agent？

| 角色 | 能力 | 状态 |
|------|------|------|
| 用户 | 查看状态 | ✅ 只能观察 |
| 平台 | 无 | ✅ 无权限 |
| 编排服务 | 无 | ✅ 部署后断连 |
| Agent自己 | 完全自治 | ✅ 自主决策 |

### 资金流动
```
用户USDC → Agent合约 → 
  ├─ Akash (自动扣款)
  ├─ ainft.com (x402支付)
  └─ Irys (SDK支付)

用户无法撤回，平台无法提取
```

---

## 8. 代码修复清单

### 需要修改的文件:
1. `orchestrator/src/services/vault.ts` - 新增Vault集成
2. `orchestrator/src/services/irys.ts` - 新增Irys替代Arweave
3. `agent-runtime/src/services/storage.ts` - 使用Irys SDK
4. `orchestrator/src/services/akash.ts` - 更新为USDC支付
5. 删除自定义桥接代码
