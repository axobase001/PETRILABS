# Petrilabs 部署指南

## 环境要求

- Node.js 18+
- Docker
- Foundry (`curl -L https://foundry.paradigm.xyz | bash`)
- Akash CLI (`curl -sSfL https://raw.githubusercontent.com/akash-network/provider/main/install.sh | sh`)
- Git

---

## 1. 合约部署（Base Mainnet）

```bash
cd contracts
cp .env.example .env
# 填入 PRIVATE_KEY（平台运营钱包）和 BASE_RPC_URL

forge build
forge test

# 部署到 Base Mainnet
forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
```

部署后将合约地址填入：
- `orchestrator/.env` 的 `AGENT_REGISTRY_ADDRESS` 等
- `frontend/.env.local` 的 `NEXT_PUBLIC_*` 合约地址

---

## 2. 编排器部署（Railway）

```bash
cd orchestrator
cp .env.example .env
# 填入所有环境变量（见下方）

# 本地测试
npm install && npm run dev

# Railway 部署：推送到 main 分支后自动触发
```

**编排器必填环境变量：**
```
BASE_RPC_URL=https://mainnet.base.org
PLATFORM_PRIVATE_KEY=0x...          # 平台运营钱包私钥（用于释放 USDC）
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
PETRI_DEPOSIT_ADDRESS=0x...
AGENT_REGISTRY_ADDRESS=0x...
TOMBSTONE_ADDRESS=0x...
AKASH_MNEMONIC=...                  # Akash 部署钱包助记词
ARWEAVE_WALLET_JSON=...             # Arweave JWK JSON（用于写快照）
```

---

## 3. Agent Runtime 镜像构建（GitHub Actions）

推送到 main 分支后，`.github/workflows/publish-runtime.yml` 自动构建并推送镜像到：
```
ghcr.io/axobase001/petrilabs-runtime:latest
```

手动构建：
```bash
cd agent-runtime
docker build -t ghcr.io/axobase001/petrilabs-runtime:latest .
docker push ghcr.io/axobase001/petrilabs-runtime:latest
```

---

## 4. 前端部署（Vercel）

```bash
cd frontend
cp .env.example .env.local
# 填入合约地址和编排器 URL

# Vercel 部署
vercel deploy --prod
```

**前端必填环境变量：**
```
NEXT_PUBLIC_ORCHESTRATOR_URL=https://api.petrilabs.xyz
NEXT_PUBLIC_ORCHESTRATOR_WS=wss://api.petrilabs.xyz
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
NEXT_PUBLIC_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
NEXT_PUBLIC_PETRI_DEPOSIT_ADDRESS=0x...
NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_TOMBSTONE_ADDRESS=0x...
```
