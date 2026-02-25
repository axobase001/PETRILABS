# PETRILABS Frontend

Next.js + React + wagmi 前端应用

## 功能

### 1. 部署面板
- 上传记忆文件生成个性化基因组
- 随机基因组选项
- 实时部署进度跟踪

### 2. Agent 管理
- Grid/List 视图切换
- 状态筛选（全部/存活/死亡）
- Agent 详情页面

### 3. 基因组可视化
- 雷达图展示基因表达
- 柱状图显示 Top Domains
- 基因详情列表

### 4. 钱包集成
- RainbowKit + wagmi
- Base L2 支持
- USDC 授权和交易

## 技术栈

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Web3**: wagmi + viem + RainbowKit
- **State**: Zustand
- **Charts**: Recharts
- **UI**: Headless UI + Lucide Icons

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local

# 开发模式
npm run dev

# 生产构建
npm run build
npm start
```

## 环境变量

```bash
NEXT_PUBLIC_ORCHESTRATOR_URL=http://localhost:3000
NEXT_PUBLIC_GENOME_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_PETRI_FACTORY_V2_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
```

## 页面结构

```
/
├── page.tsx           # 部署主页
├── layout.tsx         # 根布局
├── globals.css        # 全局样式
├── agents/
│   └── page.tsx       # Agent 列表
└── agent/
    └── [address]/
        └── page.tsx   # Agent 详情
```

## 组件

```
components/
├── ConnectButton.tsx       # 钱包连接
├── DeployPanel.tsx         # 部署面板
├── FileUpload.tsx          # 记忆文件上传
├── DeploymentProgress.tsx  # 部署进度
├── AgentCard.tsx           # Agent 卡片
├── GenomeVisualization.tsx # 基因组可视化
└── Header.tsx              # 导航栏
```

## License

MIT
