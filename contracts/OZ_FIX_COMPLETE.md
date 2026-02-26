# OpenZeppelin v5 兼容性修复完成报告

**修复日期**: 2026-02-26  
**OZ 版本**: 5.0.0  
**状态**: ✅ 已修复

---

## 修复摘要

| 问题 | 文件 | 状态 | 变更 |
|------|------|------|------|
| Ownable 初始化 | PetriAgentV2.sol | ✅ | Ownable → OwnableUpgradeable |
| _beforeTokenTransfer | Tombstone.sol | ✅ | 迁移到 _update |
| 依赖安装 | package.json | ✅ | 安装 contracts-upgradeable |

---

## 详细修复

### 1. PetriAgentV2.sol - Ownable 初始化修复

**问题**: 合约使用代理模式部署，但导入的是普通 `Ownable` 而非 `OwnableUpgradeable`

**修复前**:
```solidity
import "@openzeppelin/contracts/access/Ownable.sol";

contract PetriAgentV2 is IPetriAgentV2, Initializable, Ownable {
    // ...
    __Ownable_init(_orchestrator);  // 这是 Upgradeable 的函数
```

**修复后**:
```solidity
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract PetriAgentV2 is IPetriAgentV2, Initializable, OwnableUpgradeable {
    // ...
    __Ownable_init(_orchestrator);  // 保持不变，现在正确了
```

**修改行号**:
- 第 6 行: import 语句
- 第 21 行: 继承声明

---

### 2. Tombstone.sol - _beforeTokenTransfer 迁移

**问题**: OZ v5 中 `_beforeTokenTransfer` 钩子已被 `_update` 取代

**修复前** (OZ v4 模式):
```solidity
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
```

**修复后** (OZ v5 模式):
```solidity
function _update(
    address to,
    uint256 tokenId,
    address auth
) internal override returns (address) {
    address from = super._update(to, tokenId, auth);
    
    if (from == address(0)) return from;  // 铸造
    if (to == address(0)) return from;    // 销毁
    revert("Tombstone is soulbound and cannot be transferred");
}
```

**修改行号**:
- 第 165-185 行: 完整替换 transfer 钩子函数

---

### 3. 依赖安装

**安装命令**:
```bash
npm install @openzeppelin/contracts-upgradeable@^5.0.0 --save-dev
```

**结果**: ✅ 成功安装

---

## 其他合约状态检查

### 已正确配置的合约

| 合约 | 模式 | Ownable 初始化 | 状态 |
|------|------|----------------|------|
| AgentBank.sol | 普通 | `Ownable(msg.sender)` | ✅ 正确 |
| GenomeRegistry.sol | 普通 | `Ownable(msg.sender)` | ✅ 正确 |
| Epigenetics.sol | 普通 | `Ownable(msg.sender)` | ✅ 正确 |
| PetriFactoryV2.sol | 普通 | `Ownable(msg.sender)` | ✅ 正确 |
| Tombstone.sol | 普通 | `Ownable(msg.sender)` | ✅ 正确 |
| ReplicationManager.sol | 普通 | `Ownable(msg.sender)` | ✅ 正确 |

### 需要代理模式的合约

| 合约 | 模式 | 修复后 | 状态 |
|------|------|--------|------|
| PetriAgentV2.sol | 代理 | `OwnableUpgradeable` + `__Ownable_init()` | ✅ 已修复 |

---

## OZ v5 关键变更说明

### Ownable 变化

**OZ v4 (旧)**:
```solidity
// 非 Upgradeable
constructor() {
    _transferOwnership(_msgSender());
}

// Upgradeable
function __Ownable_init() internal initializer {
    _transferOwnership(_msgSender());
}
```

**OZ v5 (新)**:
```solidity
// 非 Upgradeable - 必须显式传参
constructor(address initialOwner) {
    _transferOwnership(initialOwner);
}

// Upgradeable - 保持不变
function __Ownable_init() internal initializer {
    _transferOwnership(_msgSender());
}
```

### ERC721 钩子变化

**OZ v4**:
- `_beforeTokenTransfer(from, to, tokenId, batchSize)`

**OZ v5**:
- `_update(to, tokenId, auth)` - 返回 `address from`
- 逻辑在 `super._update()` 之后执行

---

## 版本确认

**package.json**:
```json
{
  "devDependencies": {
    "@openzeppelin/contracts": "^5.0.0",
    "@openzeppelin/contracts-upgradeable": "^5.0.0"
  }
}
```

**当前 OZ 版本**: 5.0.0 ✅

---

## 验收检查清单

- [x] 检查 node_modules 中 OZ 实际版本 (5.0.0)
- [x] 安装 @openzeppelin/contracts-upgradeable
- [x] 修复 PetriAgentV2.sol Ownable 继承 (Ownable → OwnableUpgradeable)
- [x] 修复 Tombstone.sol _update 钩子
- [ ] forge build 0 错误 (需要安装 Foundry)
- [ ] 运行测试用例 (需要环境配置)

---

## 下一步建议

1. **安装 Foundry** (如果尚未安装):
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. **编译验证**:
   ```bash
   forge build
   ```

3. **运行测试**:
   ```bash
   forge test
   ```

4. **修复遗留文件导入问题** (与 OZ 无关):
   ```
   Error: File ./interfaces/IPetriAgent.sol not found
   ```
   需要创建缺失的接口文件或更新导入路径。

---

## 修改的文件清单

```
contracts/
├── src/
│   ├── PetriAgentV2.sol          (修改: import + 继承)
│   └── Tombstone.sol             (修改: _beforeTokenTransfer → _update)
├── package.json                  (修改: 添加 upgradeable 依赖)
└── OZ_FIX_COMPLETE.md            (新增: 本报告)
```

**总计**: 3 个文件修改, 1 个文件新增

---

**修复完成 - 2026-02-26**
