const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "chainId:", network.chainId.toString());

  let usdcAddress;
  
  // If local/testnet, deploy mock USDC
  if (network.chainId === 31337n || network.chainId === 84532n) {
    console.log("Deploying Mock USDC...");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
    usdcAddress = mockUSDC.target;
    console.log("MockUSDC deployed to:", usdcAddress);
  } else {
    // Base Mainnet USDC
    usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    console.log("Using Base Mainnet USDC:", usdcAddress);
  }

  // Deploy PetriAgent implementation
  console.log("Deploying PetriAgent implementation...");
  const PetriAgent = await ethers.getContractFactory("PetriAgent");
  const agentImplementation = await PetriAgent.deploy();
  await agentImplementation.waitForDeployment();
  console.log("PetriAgent implementation deployed to:", agentImplementation.target);

  // Deploy PetriFactory
  console.log("Deploying PetriFactory...");
  const PetriFactory = await ethers.getContractFactory("PetriFactory");
  const factory = await PetriFactory.deploy(usdcAddress, agentImplementation.target);
  await factory.waitForDeployment();
  console.log("PetriFactory deployed to:", factory.target);

  console.log("\n=== Deployment Summary ===");
  console.log("USDC:", usdcAddress);
  console.log("PetriAgent Implementation:", agentImplementation.target);
  console.log("PetriFactory:", factory.target);
  
  // Verify on testnet/mainnet
  if (network.chainId !== 31337n) {
    console.log("\nWaiting for block confirmations...");
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s
    
    console.log("Run verification commands:");
    console.log(`npx hardhat verify --network ${network.name} ${agentImplementation.target}`);
    console.log(`npx hardhat verify --network ${network.name} ${factory.target} ${usdcAddress} ${agentImplementation.target}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
