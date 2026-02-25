const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PetriFactory", function () {
  let PetriFactory, factory;
  let PetriAgent, agentImplementation;
  let MockUSDC, usdc;
  let owner, user1, user2;
  
  const GENOME_1 = ethers.keccak256(ethers.toUtf8Bytes("genome-1"));
  const GENOME_2 = ethers.keccak256(ethers.toUtf8Bytes("genome-2"));
  
  const MIN_DEPOSIT = ethers.parseUnits("20", 6); // 20 USDC
  const PLATFORM_FEE = ethers.parseUnits("5", 6); // 5 USDC

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy Mock USDC
    MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Deploy agent implementation
    PetriAgent = await ethers.getContractFactory("PetriAgent");
    agentImplementation = await PetriAgent.deploy();
    await agentImplementation.waitForDeployment();

    // Deploy factory
    PetriFactory = await ethers.getContractFactory("PetriFactory");
    factory = await PetriFactory.deploy(usdc.target, agentImplementation.target);
    await factory.waitForDeployment();

    // Fund users
    await usdc.transfer(user1.address, ethers.parseUnits("10000", 6));
    await usdc.transfer(user2.address, ethers.parseUnits("10000", 6));
  });

  describe("Deployment", function () {
    it("Should set correct USDC and implementation", async function () {
      expect(await factory.usdc()).to.equal(usdc.target);
      expect(await factory.agentImplementation()).to.equal(agentImplementation.target);
    });
  });

  describe("Create Agent", function () {
    it("Should create agent with correct parameters", async function () {
      const initialDeposit = ethers.parseUnits("100", 6);
      const totalRequired = initialDeposit + PLATFORM_FEE;

      await usdc.connect(user1).approve(factory.target, totalRequired);

      const tx = await factory.connect(user1).createAgent(GENOME_1, initialDeposit);
      const receipt = await tx.wait();
      
      // Get agent address from event
      const event = receipt.logs.find(
        log => log.fragment?.name === "AgentCreated"
      );
      const agentAddress = event.args[0];

      const info = await factory.getAgent(agentAddress);
      expect(info.creator).to.equal(user1.address);
      expect(info.genome).to.equal(GENOME_1);
      expect(info.exists).to.be.true;

      expect(await factory.getAgentByGenome(GENOME_1)).to.equal(agentAddress);
      expect(await factory.getAgentCount()).to.equal(1);

      // Check agent balance
      const agent = await ethers.getContractAt("PetriAgent", agentAddress);
      expect(await agent.getBalance()).to.equal(initialDeposit);
    });

    it("Should revert with insufficient deposit", async function () {
      const lowDeposit = ethers.parseUnits("10", 6);

      await usdc.connect(user1).approve(factory.target, lowDeposit + PLATFORM_FEE);

      await expect(
        factory.connect(user1).createAgent(GENOME_1, lowDeposit)
      ).to.be.revertedWithCustomError(factory, "InsufficientPayment");
    });

    it("Should revert with zero genome", async function () {
      await usdc.connect(user1).approve(factory.target, MIN_DEPOSIT + PLATFORM_FEE);

      await expect(
        factory.connect(user1).createAgent(ethers.ZeroHash, MIN_DEPOSIT)
      ).to.be.revertedWithCustomError(factory, "InvalidGenome");
    });

    it("Should revert with duplicate genome", async function () {
      const initialDeposit = ethers.parseUnits("100", 6);

      // Create first agent
      await usdc.connect(user1).approve(factory.target, initialDeposit + PLATFORM_FEE);
      await factory.connect(user1).createAgent(GENOME_1, initialDeposit);

      // Try to create second agent with same genome
      await usdc.connect(user2).approve(factory.target, initialDeposit + PLATFORM_FEE);
      await expect(
        factory.connect(user2).createAgent(GENOME_1, initialDeposit)
      ).to.be.revertedWithCustomError(factory, "InvalidGenome");
    });

    it("Should create multiple agents with different genomes", async function () {
      const deposit1 = ethers.parseUnits("100", 6);
      const deposit2 = ethers.parseUnits("200", 6);

      await usdc.connect(user1).approve(factory.target, deposit1 + PLATFORM_FEE);
      const tx1 = await factory.connect(user1).createAgent(GENOME_1, deposit1);
      const receipt1 = await tx1.wait();
      const agent1 = receipt1.logs.find(log => log.fragment?.name === "AgentCreated")?.args[0];

      await usdc.connect(user2).approve(factory.target, deposit2 + PLATFORM_FEE);
      const tx2 = await factory.connect(user2).createAgent(GENOME_2, deposit2);
      const receipt2 = await tx2.wait();
      const agent2 = receipt2.logs.find(log => log.fragment?.name === "AgentCreated")?.args[0];

      expect(await factory.getAgentCount()).to.equal(2);

      const allAgents = await factory.getAllAgents();
      expect(allAgents).to.include(agent1);
      expect(allAgents).to.include(agent2);
    });
  });

  describe("Get Agents by Creator", function () {
    it("Should return correct agents for each creator", async function () {
      const deposit = ethers.parseUnits("100", 6);

      // User1 creates 2 agents
      await usdc.connect(user1).approve(factory.target, 2n * (deposit + PLATFORM_FEE));
      
      const tx1 = await factory.connect(user1).createAgent(GENOME_1, deposit);
      const receipt1 = await tx1.wait();
      const agent1 = receipt1.logs.find(log => log.fragment?.name === "AgentCreated")?.args[0];

      const genome3 = ethers.keccak256(ethers.toUtf8Bytes("genome-3"));
      const tx2 = await factory.connect(user1).createAgent(genome3, deposit);
      const receipt2 = await tx2.wait();
      const agent2 = receipt2.logs.find(log => log.fragment?.name === "AgentCreated")?.args[0];

      // User2 creates 1 agent
      await usdc.connect(user2).approve(factory.target, deposit + PLATFORM_FEE);
      const tx3 = await factory.connect(user2).createAgent(GENOME_2, deposit);
      const receipt3 = await tx3.wait();
      const agent3 = receipt3.logs.find(log => log.fragment?.name === "AgentCreated")?.args[0];

      const user1Agents = await factory.getAgentsByCreator(user1.address);
      expect(user1Agents).to.have.lengthOf(2);
      expect(user1Agents).to.include(agent1);
      expect(user1Agents).to.include(agent2);

      const user2Agents = await factory.getAgentsByCreator(user2.address);
      expect(user2Agents).to.have.lengthOf(1);
      expect(user2Agents).to.include(agent3);
    });
  });

  describe("Admin Functions", function () {
    it("Should update implementation", async function () {
      const newImplementation = await PetriAgent.deploy();
      await newImplementation.waitForDeployment();

      await factory.connect(owner).updateImplementation(newImplementation.target);
      expect(await factory.agentImplementation()).to.equal(newImplementation.target);
    });

    it("Should revert update implementation to zero address", async function () {
      await expect(
        factory.connect(owner).updateImplementation(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "InvalidAgentImplementation");
    });

    it("Should revert update implementation by non-owner", async function () {
      const newImplementation = await PetriAgent.deploy();
      await newImplementation.waitForDeployment();

      await expect(
        factory.connect(user1).updateImplementation(newImplementation.target)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should withdraw platform fees", async function () {
      const deposit = ethers.parseUnits("100", 6);

      // Create agent to accumulate fees
      await usdc.connect(user1).approve(factory.target, deposit + PLATFORM_FEE);
      await factory.connect(user1).createAgent(GENOME_1, deposit);

      const ownerBalanceBefore = await usdc.balanceOf(owner.address);

      await factory.connect(owner).withdrawFunds();

      const ownerBalanceAfter = await usdc.balanceOf(owner.address);
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(PLATFORM_FEE);
    });

    it("Should revert withdraw with no fees", async function () {
      await expect(
        factory.connect(owner).withdrawFunds()
      ).to.be.revertedWithCustomError(factory, "InsufficientPayment");
    });

    it("Should accumulate platform fees", async function () {
      const deposit = ethers.parseUnits("100", 6);

      // Create 3 agents
      for (let i = 0; i < 3; i++) {
        const genome = ethers.keccak256(ethers.toUtf8Bytes(`genome-${i}`));
        await usdc.connect(user1).approve(factory.target, deposit + PLATFORM_FEE);
        await factory.connect(user1).createAgent(genome, deposit);
      }

      expect(await factory.totalPlatformFees()).to.equal(3n * PLATFORM_FEE);
    });
  });
});
