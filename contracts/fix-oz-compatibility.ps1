#requires -Version 5.1
# OpenZeppelin v5 兼容性修复脚本

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenZeppelin v5 兼容性修复" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查当前目录
if (-not (Test-Path "package.json")) {
    Write-Host "错误: 请在 contracts/ 目录下运行此脚本" -ForegroundColor Red
    exit 1
}

# 1. 检查当前 OZ 版本
Write-Host "[1/5] 检查 OpenZeppelin 版本..." -ForegroundColor Yellow
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$ozVersion = $packageJson.devDependencies.'@openzeppelin/contracts'
Write-Host "  当前版本: $ozVersion"

# 2. 检查是否已安装 upgradeable
Write-Host "`n[2/5] 检查 @openzeppelin/contracts-upgradeable..." -ForegroundColor Yellow
$hasUpgradeable = Test-Path "node_modules/@openzeppelin/contracts-upgradeable"
if (-not $hasUpgradeable) {
    Write-Host "  未安装, 正在安装..." -ForegroundColor Yellow
    npm install @openzeppelin/contracts-upgradeable@$ozVersion --save-dev
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  安装失败" -ForegroundColor Red
        exit 1
    }
    Write-Host "  安装完成" -ForegroundColor Green
} else {
    Write-Host "  已安装" -ForegroundColor Green
}

# 3. 修复 PetriAgentV2.sol
Write-Host "`n[3/5] 修复 PetriAgentV2.sol..." -ForegroundColor Yellow
$petriAgentPath = "src/PetriAgentV2.sol"
$petriAgentContent = Get-Content $petriAgentPath -Raw

# 修复 import
$petriAgentContent = $petriAgentContent -replace 
    'import "@openzeppelin/contracts/access/Ownable.sol";',
    'import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";'

# 修复继承
$petriAgentContent = $petriAgentContent -replace 
    'contract PetriAgentV2 is IPetriAgentV2, Initializable, Ownable \{',
    'contract PetriAgentV2 is IPetriAgentV2, Initializable, OwnableUpgradeable {'

Set-Content -Path $petriAgentPath -Value $petriAgentContent -NoNewline
Write-Host "  修复完成: import 和继承关系" -ForegroundColor Green

# 4. 修复 Tombstone.sol (_beforeTokenTransfer -> _update)
Write-Host "`n[4/5] 修复 Tombstone.sol..." -ForegroundColor Yellow
$tombstonePath = "src/Tombstone.sol"
$tombstoneContent = Get-Content $tombstonePath -Raw

# 替换 _beforeTokenTransfer 为 _update
$oldHook = @'
    /**
     * @notice 重载 transfer - 确保 Tombstone 灵魂绑定（不可转让）
     * @dev 允许铸造（from=0）和销毁（to=0），但禁止转账
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
        
        // 允许铸造（from=0）
        if (from == address(0)) return;
        
        // 允许销毁（to=0）
        if (to == address(0)) return;
        
        // 禁止所有转账
        revert("Tombstone is soulbound and cannot be transferred");
    }
'@

$newHook = @'
    /**
     * @notice 重载 _update - 确保 Tombstone 灵魂绑定（不可转让）
     * @dev OZ v5: _beforeTokenTransfer 已被 _update 取代
     * @dev 允许铸造和销毁，但禁止转账
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = super._update(to, tokenId, auth);
        
        // 允许铸造（from=0）
        if (from == address(0)) return from;
        
        // 允许销毁（to=0）
        if (to == address(0)) return from;
        
        // 禁止所有转账
        revert("Tombstone is soulbound and cannot be transferred");
    }
'@

$tombstoneContent = $tombstoneContent -replace [regex]::Escape($oldHook), $newHook
Set-Content -Path $tombstonePath -Value $tombstoneContent -NoNewline
Write-Host "  修复完成: _beforeTokenTransfer -> _update" -ForegroundColor Green

# 5. 编译验证
Write-Host "`n[5/5] 编译验证..." -ForegroundColor Yellow
npm run build 2>&1 | Tee-Object -FilePath "build.log"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "  修复成功!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "修改的文件:" -ForegroundColor Cyan
    Write-Host "  - src/PetriAgentV2.sol (Ownable -> OwnableUpgradeable)"
    Write-Host "  - src/Tombstone.sol (_beforeTokenTransfer -> _update)"
    Write-Host "`n注意: 其他合约可能也需要类似修复" -ForegroundColor Yellow
} else {
    Write-Host "`n========================================" -ForegroundColor Red
    Write-Host "  编译失败,请查看 build.log" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}

Write-Host ""
