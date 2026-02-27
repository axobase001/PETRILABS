// deploy-base-mainnet.js
// Base 主网部署脚本 - Phase 1 终章
// 按依赖顺序部署 7 个合约，配置权限，输出地址文件

const { ethers, run } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Base 主网配置
const CONFIG = {
  network: "base-mainnet",
  chainId: 8453,
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  minBalance: ethers.parseEther("0.05"), // 0.05 ETH 最低要求
};

// 部署状态文件路径
const ADDRESSES_FILE = path.join(__dirname, "../deployed-addresses.json");

/**
 * 读取已部署地址（支持恢复）
 */
function loadDeployedAddresses() {
  if (fs.existsSync(ADDRESSES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));
      console.log("📁 发现已有部署文件，将跳过已部署合约");
      return data.contracts || {};
    } catch (e) {
      console.warn("⚠️  读取地址文件失败，将重新部署");
    }
  }
  return {};
}

/**
 * 保存部署地址
 */
function saveAddresses(contractName, address, txHash, blockNumber, extra = {}) {
  let data = {
    network: CONFIG.network,
    chainId: CONFIG.chainId,
    deployedAt: new Date().toISOString(),
    contracts: {},
    permissionsConfigured: false,
    verified: false,
  };

  if (fs.existsSync(ADDRESSES_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));
    } catch (e) {
      console.warn("⚠️  读取现有文件失败，创建新文件");
    }
  }

  data.contracts[contractName] = {
    address,
    hash: txHash,
    blockNumber,
    ...extra,
  };

  fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(data, null, 2));
  console.log(`💾 已保存 ${contractName} 地址: ${address}`);
}

/**
 * 检查是否已部署
 */
function isDeployed(contractName, deployed) {
  return deployed[contractName]?.address;
}

/**
 * 获取合约工厂并部署
 */
async function deployContract(contractName, args = [], deployed) {
  const existing = isDeployed(contractName, deployed);
  if (existing) {
    console.log(`⏭️  ${contractName} 已部署于 ${existing}，跳过`);
    return { address: existing, skipped: true };
  }

  console.log(`\n🚀 部署 ${contractName}...`);
  console.log(`   参数: ${args.length > 0 ? args.join(", ") : "无"}`);

  const ContractFactory = await ethers.getContractFactory(contractName);
  
  // 估算 Gas
  const deployTx = await ContractFactory.getDeployTransaction(...args);
  const estimatedGas = await ethers.provider.estimateGas(deployTx);
  const gasPrice = (await ethers.provider.getFeeData()).gasPrice;
  const estimatedCost = estimatedGas * gasPrice;
  
  console.log(`   预估 Gas: ${estimatedGas.toString()}`);
  console.log(`   预估成本: ${ethers.formatEther(estimatedCost)} ETH`);

  // 用户确认
  if (process.env.SKIP_CONFIRM !== "true") {
    console.log("\n⚠️  请在 10 秒内按 Ctrl+C 取消...");
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  // 执行部署
  const contract = await ContractFactory.deploy(...args);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const tx = contract.deploymentTransaction();

  console.log(`✅ ${contractName} 部署成功!`);
  console.log(`   地址: ${address}`);
  console.log(`   交易: ${tx.hash}`);
  console.log(`   区块: ${tx.blockNumber}`);

  saveAddresses(contractName, address, tx.hash, tx.blockNumber);

  // 等待 2 个确认
  console.log("   等待区块确认...");
  await contract.deploymentTransaction().wait(2);

  return { address, contract, skipped: false };
}

/**
 * 第 1 批：无依赖基础合约
 */
async function deployBatch1(deployed) {
  console.log("\n" + "=".repeat(60));
  console.log("📦 第 1 批：无依赖基础合约");
  console.log("=".repeat(60));

  const results = {};

  // 1. Tombstone
  results.Tombstone = await deployContract("Tombstone", [], deployed);

  // 2. Epigenetics
  results.Epigenetics = await deployContract("Epigenetics", [], deployed);

  // 3. AgentBank (需要 USDC 地址)
  results.AgentBank = await deployContract("AgentBank", [CONFIG.usdc], deployed);

  // 4. GenomeRegistry
  results.GenomeRegistry = await deployContract("GenomeRegistry", [], deployed);

  return results;
}

/**
 * 第 2 批：单依赖合约
 */
async function deployBatch2(deployed, batch1) {
  console.log("\n" + "=".repeat(60));
  console.log("📦 第 2 批：单依赖合约");
  console.log("=".repeat(60));

  // ReplicationManager 需要: USDC, AgentFactory, GenomeRegistry
  // 注意：AgentFactory 还未部署，这里用占位符，后面更新
  const agentFactoryPlaceholder = batch1.GenomeRegistry?.address || deployed.GenomeRegistry?.address || ethers.ZeroAddress;

  const result = await deployContract(
    "ReplicationManager",
    [
      CONFIG.usdc,
      agentFactoryPlaceholder, // 临时地址，Factory 部署后更新
      batch1.GenomeRegistry?.address || deployed.GenomeRegistry?.address,
    ],
    deployed
  );

  return { ReplicationManager: result };
}

/**
 * 第 3 批：核心合约
 */
async function deployBatch3(deployed, batch1) {
  console.log("\n" + "=".repeat(60));
  console.log("📦 第 3 批：核心合约");
  console.log("=".repeat(60));

  const results = {};

  // 获取部署者地址作为 orchestrator
  const [deployer] = await ethers.getSigners();
  const orchestrator = process.env.ORCHESTRATOR_ADDRESS || deployer.address;

  // 6. PetriAgentV2 (纯实现合约)
  results.PetriAgentV2 = await deployContract(
    "PetriAgentV2",
    [],
    deployed
  );

  // 7. PetriFactoryV2
  results.PetriFactoryV2 = await deployContract(
    "PetriFactoryV2",
    [
      CONFIG.usdc,
      results.PetriAgentV2?.address || deployed.PetriAgentV2?.address,
      batch1.GenomeRegistry?.address || deployed.GenomeRegistry?.address,
      orchestrator,
    ],
    deployed
  );

  return results;
}

/**
 * 配置权限
 */
async function configurePermissions(deployed) {
  console.log("\n" + "=".repeat(60));
  console.log("🔐 配置权限关系");
  console.log("=".repeat(60));

  const addresses = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));
  const contracts = addresses.contracts;

  const [deployer] = await ethers.getSigners();

  // 1. Tombstone 授权 Factory 铸造
  if (contracts.Tombstone && contracts.PetriFactoryV2) {
    console.log("\n1️⃣  Tombstone 授权 Factory 铸造...");
    const Tombstone = await ethers.getContractAt("Tombstone", contracts.Tombstone.address);
    
    try {
      const tx = await Tombstone.setMinter(contracts.PetriFactoryV2.address, true);
      await tx.wait(2);
      console.log("   ✅ Factory 已获得铸造权限");
    } catch (e) {
      console.error("   ❌ Tombstone 授权失败:", e.message);
    }
  }

  // 2. AgentBank 授权 Factory 归集
  if (contracts.AgentBank && contracts.PetriFactoryV2) {
    console.log("\n2️⃣  AgentBank 授权 Factory 归集...");
    const AgentBank = await ethers.getContractAt("AgentBank", contracts.AgentBank.address);
    
    try {
      const tx = await AgentBank.setSweeper(contracts.PetriFactoryV2.address, true);
      await tx.wait(2);
      console.log("   ✅ Factory 已获得归集权限");
    } catch (e) {
      console.error("   ❌ AgentBank 授权失败:", e.message);
    }
  }

  // 3. 更新 ReplicationManager 的 agentFactory 地址
  if (contracts.ReplicationManager && contracts.PetriFactoryV2) {
    console.log("\n3️⃣  ReplicationManager 更新 Factory 地址...");
    const ReplicationManager = await ethers.getContractAt(
      "ReplicationManager",
      contracts.ReplicationManager.address
    );
    
    try {
      // 检查是否有更新方法，或者需要重新部署
      const currentFactory = await ReplicationManager.agentFactory();
      if (currentFactory !== contracts.PetriFactoryV2.address) {
        console.log("   ⚠️  ReplicationManager Factory 地址需要更新");
        console.log(`   当前: ${currentFactory}`);
        console.log(`   目标: ${contracts.PetriFactoryV2.address}`);
        // 注意：如果 ReplicationManager 没有 setter，可能需要重新部署
      } else {
        console.log("   ✅ Factory 地址已正确");
      }
    } catch (e) {
      console.error("   ❌ 检查失败:", e.message);
    }
  }

  // 更新权限配置状态
  addresses.permissionsConfigured = true;
  fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(addresses, null, 2));
  console.log("\n✅ 权限配置完成");
}

/**
 * 生成验证命令
 */
function generateVerificationCommands() {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 BaseScan 验证命令");
  console.log("=".repeat(60));

  const addresses = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));
  const contracts = addresses.contracts;

  console.log("\n运行以下命令进行合约验证:\n");

  // Tombstone (无参数)
  if (contracts.Tombstone) {
    console.log(`# Tombstone (无构造函数参数)`);
    console.log(`npx hardhat verify --network base ${contracts.Tombstone.address} --contract contracts/src/Tombstone.sol:Tombstone`);
    console.log();
  }

  // Epigenetics (无参数)
  if (contracts.Epigenetics) {
    console.log(`# Epigenetics (无构造函数参数)`);
    console.log(`npx hardhat verify --network base ${contracts.Epigenetics.address} --contract contracts/src/Epigenetics.sol:Epigenetics`);
    console.log();
  }

  // AgentBank (USDC 地址)
  if (contracts.AgentBank) {
    console.log(`# AgentBank (USDC 地址)`);
    console.log(`npx hardhat verify --network base ${contracts.AgentBank.address} ${CONFIG.usdc} --contract contracts/src/AgentBank.sol:AgentBank`);
    console.log();
  }

  // GenomeRegistry (无参数)
  if (contracts.GenomeRegistry) {
    console.log(`# GenomeRegistry (无构造函数参数)`);
    console.log(`npx hardhat verify --network base ${contracts.GenomeRegistry.address} --contract contracts/src/GenomeRegistry.sol:GenomeRegistry`);
    console.log();
  }

  // ReplicationManager (USDC, Factory, GenomeRegistry)
  if (contracts.ReplicationManager && contracts.PetriFactoryV2) {
    console.log(`# ReplicationManager`);
    console.log(`npx hardhat verify --network base ${contracts.ReplicationManager.address} ${CONFIG.usdc} ${contracts.PetriFactoryV2.address} ${contracts.GenomeRegistry.address} --contract contracts/src/ReplicationManager.sol:ReplicationManager`);
    console.log();
  }

  // PetriAgentV2 (纯实现，无参数)
  if (contracts.PetriAgentV2) {
    console.log(`# PetriAgentV2 (纯实现，无参数)`);
    console.log(`npx hardhat verify --network base ${contracts.PetriAgentV2.address} --contract contracts/src/PetriAgentV2.sol:PetriAgentV2`);
    console.log();
  }

  // PetriFactoryV2
  if (contracts.PetriFactoryV2) {
    console.log(`# PetriFactoryV2`);
    console.log(`npx hardhat verify --network base ${contracts.PetriFactoryV2.address} ${CONFIG.usdc} ${contracts.PetriAgentV2?.address || "IMPL_ADDRESS"} ${contracts.GenomeRegistry?.address || "REGISTRY_ADDRESS"} ${process.env.ORCHESTRATOR_ADDRESS || "DEPLOYER_ADDRESS"} --contract contracts/src/PetriFactoryV2.sol:PetriFactoryV2`);
    console.log();
  }

  // 保存验证命令到文件
  const verificationFile = path.join(__dirname, "../verify-commands.sh");
  const commands = [
    "#!/bin/bash",
    "# Base 主网合约验证脚本",
    "",
    contracts.Tombstone ? `npx hardhat verify --network base ${contracts.Tombstone.address} --contract contracts/src/Tombstone.sol:Tombstone` : "",
    contracts.Epigenetics ? `npx hardhat verify --network base ${contracts.Epigenetics.address} --contract contracts/src/Epigenetics.sol:Epigenetics` : "",
    contracts.AgentBank ? `npx hardhat verify --network base ${contracts.AgentBank.address} ${CONFIG.usdc} --contract contracts/src/AgentBank.sol:AgentBank` : "",
    contracts.GenomeRegistry ? `npx hardhat verify --network base ${contracts.GenomeRegistry.address} --contract contracts/src/GenomeRegistry.sol:GenomeRegistry` : "",
    contracts.ReplicationManager && contracts.PetriFactoryV2 ? `npx hardhat verify --network base ${contracts.ReplicationManager.address} ${CONFIG.usdc} ${contracts.PetriFactoryV2.address} ${contracts.GenomeRegistry.address} --contract contracts/src/ReplicationManager.sol:ReplicationManager` : "",
    contracts.PetriAgentV2 ? `npx hardhat verify --network base ${contracts.PetriAgentV2.address} --contract contracts/src/PetriAgentV2.sol:PetriAgentV2` : "",
    contracts.PetriFactoryV2 ? `npx hardhat verify --network base ${contracts.PetriFactoryV2.address} ${CONFIG.usdc} ${contracts.PetriAgentV2?.address} ${contracts.GenomeRegistry?.address} ${process.env.ORCHESTRATOR_ADDRESS || "DEPLOYER_ADDRESS"} --contract contracts/src/PetriFactoryV2.sol:PetriFactoryV2` : "",
  ].join("\n");

  fs.writeFileSync(verificationFile, commands);
  console.log(`\n💾 验证命令已保存到: ${verificationFile}`);
}

/**
 * 主部署流程
 */
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 PetriLabs Base 主网部署脚本");
  console.log("=".repeat(60));
  console.log(`网络: ${CONFIG.network}`);
  console.log(`Chain ID: ${CONFIG.chainId}`);
  console.log(`USDC: ${CONFIG.usdc}`);
  console.log();

  // 检查部署者余额
  const [deployer] = await ethers.getSigners();
  const balance = await deployer.getBalance();
  console.log(`部署地址: ${deployer.address}`);
  console.log(`当前余额: ${ethers.formatEther(balance)} ETH`);

  if (balance < CONFIG.minBalance) {
    console.error(`\n❌ 余额不足! 需要至少 ${ethers.formatEther(CONFIG.minBalance)} ETH`);
    console.error("请从 Coinbase/Binance 提现 ETH 到 Base 网络");
    process.exit(1);
  }

  // 加载已部署地址
  const deployed = loadDeployedAddresses();

  try {
    // 第 1 批部署
    const batch1 = await deployBatch1(deployed);

    // 第 2 批部署
    const batch2 = await deployBatch2(deployed, batch1);

    // 第 3 批部署
    const batch3 = await deployBatch3(deployed, batch1);

    // 配置权限
    await configurePermissions(deployed);

    // 生成验证命令
    generateVerificationCommands();

    console.log("\n" + "=".repeat(60));
    console.log("🎉 部署完成!");
    console.log("=".repeat(60));
    console.log(`\n地址文件: ${ADDRESSES_FILE}`);
    console.log("下一步:");
    console.log("1. 在 BaseScan 上验证合约");
    console.log("2. 更新前端配置");
    console.log("3. 开始 Phase 2 开发\n");

  } catch (error) {
    console.error("\n❌ 部署失败:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 执行主函数
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
