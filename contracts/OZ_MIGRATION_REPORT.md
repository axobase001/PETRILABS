# OpenZeppelin v5 兼容性修复报告

**检测日期**: 2026-02-26  
**OZ 版本**: 5.0.0 (package.json)  
**状态**: 需要修复

---

## 检测到的问题

### 问题 1: Ownable 初始化方式不匹配

**影响文件**: 
- `src/PetriAgentV2.sol`
- `src/AgentBank.sol`
- `src/GenomeRegistry.sol`
- `src/Epigenetics.sol`
- `src/PetriFactoryV2.sol`
- `src/Tombstone.sol`
- `src/ReplicationManager.sol`

**问题描述**:
- 导入的是 `@openzeppelin/contracts/access/Ownable.sol` (非 Upgradeable)
- 部分合约使用了 `__Ownable_init()` (这是 Upgradeable 的初始化函数)
- OZ v5 中，非 Upgradeable 的 Ownable 使用构造函数传参

**修复方案**:
对于代理模式部署的合约（如 PetriAgentV2），应改为使用 `OwnableUpgradeable`:
```solidity
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
contract PetriAgentV2 is Initializable, OwnableUpgradeable { ... }
```

### 问题 2: _beforeTokenTransfer 已废弃

**影响文件**: `src/Tombstone.sol`

**问题描述**:
- 使用 `_beforeTokenTransfer` 钩子
- OZ v5 中 ERC721 的 `_beforeTokenTransfer` 已被 `_update` 取代

**修复方案**:
```solidity
// 旧代码 (v4)
function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize) 
    internal override { ... }

// 新代码 (v5)
function _update(address to, uint256 tokenId, address auth) 
    internal override returns (address) {
    address from = super._update(to, tokenId, auth);
    // 原逻辑...
    return from;
}
```

---

## 修复步骤

### 步骤 1: 检查 node_modules 中的实际 OZ 版本
```bash
cd contracts
cat node_modules/@openzeppelin/contracts/package.json | grep version
```

### 步骤 2: 安装 OZ Upgradeable (如果需要)
```bash
npm install @openzeppelin/contracts-upgradeable@^5.0.0
```

### 步骤 3: 修复 PetriAgentV2.sol
- 修改 import: `Ownable.sol` → `OwnableUpgradeable.sol`
- 修改继承: `Ownable` → `OwnableUpgradeable`
- 确认 `__Ownable_init(_orchestrator)` 调用正确

### 步骤 4: 修复 Tombstone.sol
- 将 `_beforeTokenTransfer` 迁移到 `_update`

### 步骤 5: 编译验证
```bash
npm run build
```

---

## 关键代码变更

### PetriAgentV2.sol (第 6 行, 第 21 行, 第 113 行)
```solidity
// 修复前
import "@openzeppelin/contracts/access/Ownable.sol";
contract PetriAgentV2 is IPetriAgentV2, Initializable, Ownable {
    __Ownable_init(_orchestrator);

// 修复后
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
contract PetriAgentV2 is IPetriAgentV2, Initializable, OwnableUpgradeable {
    __Ownable_init(_orchestrator); // 保持不变
```

### Tombstone.sol (第 169-185 行)
```solidity
// 修复前 (v4)
function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId,
    uint256 batchSize
) internal override {
    super._beforeTokenTransfer(from, to, tokenId, batchSize);
    if (from == address(0)) return;
    if (to == address(0)) return;
    revert("Tombstone is soulbound and cannot be transferred");
}

// 修复后 (v5)
function _update(
    address to,
    uint256 tokenId,
    address auth
) internal override returns (address) {
    address from = super._update(to, tokenId, auth);
    if (from == address(0)) return from; // 铸造
    if (to == address(0)) return from;   // 销毁
    revert("Tombstone is soulbound and cannot be transferred");
}
```

---

## 验收检查清单

- [ ] 检查 node_modules 中 OZ 实际版本
- [ ] 安装 @openzeppelin/contracts-upgradeable
- [ ] 修复 PetriAgentV2.sol Ownable 继承
- [ ] 修复 Tombstone.sol _update 钩子
- [ ] 检查其他合约的 Ownable 使用
- [ ] `npm run build` 0 错误
- [ ] 运行测试用例

---

**注意**: 在进行任何修改前，请确保已提交当前代码到 git。
