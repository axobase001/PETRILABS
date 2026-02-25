# GitHub 推送指南 - PetriLabs Turbo Storage

## 快速开始

### 1. 初始化 Git 仓库

```bash
cd /path/to/petrilabs
git init
git add .
git commit -m "feat: initial PetriLabs Turbo Storage implementation

- Add Turbo SDK + x402 unified storage layer
- Implement PetriStorage singleton with buffer management
- Add x402 payment client for Base L2 USDC
- Include bundler with Merkle root verification
- Add CLI tool for genesis/stream/flush operations
- Add comprehensive documentation"
```

### 2. 创建 GitHub 仓库

**方式 A: GitHub CLI**
```bash
# 安装 gh CLI: https://cli.github.com/
gh auth login
gh repo create petrilabs --public --description "AI Agent Wild Deployment Platform"
```

**方式 B: GitHub Web**
1. 访问 https://github.com/new
2. 填写 Repository name: `petrilabs`
3. 选择 Public 或 Private
4. 点击 Create repository

### 3. 推送代码

```bash
# 添加远程仓库
git remote add origin https://github.com/YOUR_USERNAME/petrilabs.git

# 推送主分支
git branch -M main
git push -u origin main
```

### 4. 推送特定目录（可选）

如果只想推送 `turbo-storage` 模块作为独立包：

```bash
cd petrilabs/turbo-storage

# 独立初始化
git init
git add .
git commit -m "Initial commit: Turbo Storage v1.0.0"

# 创建子树仓库
gh repo create petrilabs-turbo-storage --public
git remote add origin https://github.com/YOUR_USERNAME/petrilabs-turbo-storage.git
git push -u origin main
```

## 目录结构

推送后的仓库结构：

```
petrilabs/
├── README.md                          # 项目主 README
├── GITHUB_PUSH_GUIDE.md               # 本文件
├── turbo-storage/                     # ⭐ 新的存储模块
│   ├── README.md                      # 模块文档
│   ├── package.json                   # 包配置
│   ├── cli.js                         # CLI 入口
│   ├── src/
│   │   ├── index.js                   # 主入口
│   │   ├── storage.js                 # PetriStorage 类
│   │   ├── x402.js                    # x402 支付客户端
│   │   ├── turbo-client.js            # Turbo SDK 封装
│   │   ├── bundler.js                 # 数据打包
│   │   ├── config.js                  # 配置管理
│   │   └── logger.js                  # 日志工具
│   ├── .env.example                   # 环境变量模板
│   └── .gitignore                     # Git 忽略规则
├── contracts/                         # Solidity 合约
├── orchestrator/                      # 编排服务
├── agent-runtime/                     # Agent 运行时
├── frontend/                          # Next.js 前端
├── skills/                            # Skill 模块
└── docs/                              # 文档
    ├── ARCHITECTURE.md
    ├── PAYMENT_ARCHITECTURE.md
    ├── TURBO_STORAGE_ARCHITECTURE.md  # ⭐ 新架构文档
    └── ...
```

## 版本标签

推送后建议打标签：

```bash
# Turbo Storage v1.0.0
git tag -a turbo-storage-v1.0.0 -m "Turbo Storage v1.0.0 - Initial release with x402 support"
git push origin turbo-storage-v1.0.0
```

## 发布到 npm（可选）

```bash
cd petrilabs/turbo-storage

# 登录 npm
npm login

# 发布
npm publish --access public
```

## CI/CD 配置

创建 `.github/workflows/ci.yml`:

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: |
          cd turbo-storage
          npm ci
          
      - name: Lint
        run: |
          cd turbo-storage
          npm run lint
          
      - name: Test
        run: |
          cd turbo-storage
          npm test
```

## 文档网站（可选）

使用 VitePress 或 Docusaurus 创建文档网站：

```bash
# 在 turbo-storage 目录
cd petrilabs/turbo-storage
npm install -D vitepress

# 创建 docs/
mkdir docs
```

---

## 验证推送

推送后验证：

```bash
# 检查远程
git remote -v

# 检查分支
git branch -a

# 检查标签
git tag

# 查看提交历史
git log --oneline --graph -10
```

## 故障排除

### 认证失败

```bash
# 使用 HTTPS 令牌
git remote set-url origin https://TOKEN@github.com/YOUR_USERNAME/petrilabs.git

# 或使用 SSH
git remote set-url origin git@github.com:YOUR_USERNAME/petrilabs.git
```

### 大文件问题

如果之前提交了 `node_modules`:

```bash
# 移除缓存
git rm -r --cached turbo-storage/node_modules
git commit -m "Remove node_modules from git"

# 确保 .gitignore 包含 node_modules
echo "node_modules/" >> turbo-storage/.gitignore
```

---

## 下一步

1. ✅ 推送代码到 GitHub
2. 📖 完善文档（README、API 文档）
3. 🧪 添加单元测试
4. 🚀 发布到 npm
5. 🐳 创建 Docker 镜像
6. ☁️ 部署示例到 Akash

---

**推送日期**: 2024-01-15  
**版本**: v1.0.0  
**状态**: 准备推送
