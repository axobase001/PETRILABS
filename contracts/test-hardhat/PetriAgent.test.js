const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PetriAgent", function () {
  let PetriAgent;
  let MockUSDC, usdc;
  let owner, orchestrator, user;
  
  const GENOME = ethers.keccak256(ethers.toUtf8Bytes("test-genome"));
  const INITIAL_BALANCE = ethers.parseUnits("100", 6); // 100 USDC

  before(async function () {
    [owner, orchestrator, user] = await ethers.getSigners();
    PetriAgent = await ethers.getContractFactory("PetriAgent");
    MockUSDC = await ethers.getContractFactory("MockUSDC");
  });

  beforeEach(async function () {
    // Deploy fresh contracts for each test
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Fund orchestrator and user
    await usdc.transfer(orchestrator.address, ethers.parseUnits("10000", 6));
    await usdc.transfer(user.address, ethers.parseUnits("10000", 6));
  });

  describe("Initialization", function () {
    it("Should initialize agent correctly", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();

      await usdc.connect(orchestrator).approve(agent.target, INITIAL_BALANCE);
      
      const tx = await agent.connect(orchestrator).initialize(GENOME, orchestrator.address, usdc.target, INITIAL_BALANCE);
      const receipt = await tx.wait();
      
      // Check event
      const event = receipt.logs.find(log => log.fragment?.name === "AgentBorn");
      expect(event).to.not.be.undefined;
      expect(event.args[0]).to.equal(agent.target);
      expect(event.args[1]).to.equal(GENOME);

      expect(await agent.genome()).to.equal(GENOME);
      expect(await agent.orchestrator()).to.equal(orchestrator.address);
      expect(await agent.isAlive()).to.be.true;
      expect(await agent.getBalance()).to.equal(INITIAL_BALANCE);
    });

    it("Should revert with zero genome", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();

      await usdc.connect(orchestrator).approve(agent.target, INITIAL_BALANCE);
      
      await expect(
        agent.connect(orchestrator).initialize(ethers.ZeroHash, orchestrator.address, usdc.target, INITIAL_BALANCE)
      ).to.be.revertedWithCustomError(agent, "InvalidGenome");
    });

    it("Should revert with zero orchestrator", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();

      await usdc.connect(orchestrator).approve(agent.target, INITIAL_BALANCE);
      
      await expect(
        agent.connect(orchestrator).initialize(GENOME, ethers.ZeroAddress, usdc.target, INITIAL_BALANCE)
      ).to.be.revertedWithCustomError(agent, "InvalidAmount");
    });
  });

  describe("Heartbeat", function () {
    it("Should record heartbeat", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();

      await usdc.connect(orchestrator).approve(agent.target, INITIAL_BALANCE);
      await agent.connect(orchestrator).initialize(GENOME, orchestrator.address, usdc.target, INITIAL_BALANCE);
      
      await network.provider.send("evm_increaseTime", [7 * 3600]); // 7 hours
      await network.provider.send("evm_mine");

      const decisionHash = ethers.keccak256(ethers.toUtf8Bytes("decision-1"));
      const arweaveTxId = "arweave-tx-1";

      const tx = await agent.connect(orchestrator).heartbeat(decisionHash, arweaveTxId);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => log.fragment?.name === "Heartbeat");
      expect(event).to.not.be.undefined;
      expect(event.args[0]).to.equal(1n); // nonce
      expect(event.args[2]).to.equal(decisionHash);

      expect(await agent.heartbeatNonce()).to.equal(1);
      expect(await agent.lastDecisionHash()).to.equal(decisionHash);
    });

    it("Should revert if too frequent", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();

      await usdc.connect(orchestrator).approve(agent.target, INITIAL_BALANCE);
      await agent.connect(orchestrator).initialize(GENOME, orchestrator.address, usdc.target, INITIAL_BALANCE);
      
      const decisionHash = ethers.keccak256(ethers.toUtf8Bytes("decision-1"));

      await expect(
        agent.connect(orchestrator).heartbeat(decisionHash, "")
      ).to.be.revertedWithCustomError(agent, "HeartbeatTooFrequent");
    });

    it("Should revert if not orchestrator", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();

      await usdc.connect(orchestrator).approve(agent.target, INITIAL_BALANCE);
      await agent.connect(orchestrator).initialize(GENOME, orchestrator.address, usdc.target, INITIAL_BALANCE);
      
      await network.provider.send("evm_increaseTime", [7 * 3600]);
      await network.provider.send("evm_mine");

      const decisionHash = ethers.keccak256(ethers.toUtf8Bytes("decision-1"));

      await expect(
        agent.connect(user).heartbeat(decisionHash, "")
      ).to.be.revertedWithCustomError(agent, "NotOrchestrator");
    });

    it("Should kill agent with low balance", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();
      
      // Use 0.5 USDC (below MIN_BALANCE of 1 USDC)
      await usdc.connect(orchestrator).approve(agent.target, ethers.parseUnits("0.5", 6));
      await agent.connect(orchestrator).initialize(GENOME, orchestrator.address, usdc.target, ethers.parseUnits("0.5", 6));

      await network.provider.send("evm_increaseTime", [7 * 3600]);
      await network.provider.send("evm_mine");

      const decisionHash = ethers.keccak256(ethers.toUtf8Bytes("decision-1"));
      
      await agent.connect(orchestrator).heartbeat(decisionHash, "");
      
      expect(await agent.isAlive()).to.be.false;
    });
  });

  describe("Execute Decision", function () {
    it("Should execute decision", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();

      await usdc.connect(orchestrator).approve(agent.target, INITIAL_BALANCE);
      await agent.connect(orchestrator).initialize(GENOME, orchestrator.address, usdc.target, INITIAL_BALANCE);
      
      const decisionData = ethers.toUtf8Bytes("action:transfer");
      const decisionHash = ethers.keccak256(decisionData);

      const tx = await agent.connect(orchestrator).executeDecision(decisionData);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => log.fragment?.name === "DecisionExecuted");
      expect(event).to.not.be.undefined;
      expect(event.args[0]).to.equal(0n); // decisionId
      expect(event.args[1]).to.equal(decisionHash);
      expect(event.args[2]).to.be.true;

      const decision = await agent.getDecision(0);
      expect(decision.hash).to.equal(decisionHash);
      expect(decision.executed).to.be.true;
    });
  });

  describe("Deposit", function () {
    it("Should accept deposit before first heartbeat", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();

      await usdc.connect(orchestrator).approve(agent.target, ethers.parseUnits("1", 6));
      await agent.connect(orchestrator).initialize(GENOME, orchestrator.address, usdc.target, ethers.parseUnits("1", 6));

      // Deposit before first heartbeat should work
      const depositAmount = ethers.parseUnits("50", 6);
      await usdc.connect(user).approve(agent.target, depositAmount);

      const tx = await agent.connect(user).deposit(depositAmount);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => log.fragment?.name === "FundsDeposited");
      expect(event).to.not.be.undefined;
      expect(event.args[0]).to.equal(user.address);
      expect(event.args[1]).to.equal(depositAmount);

      expect(await agent.getBalance()).to.equal(ethers.parseUnits("51", 6));
    });

    it("Should revert deposit after heartbeat", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();

      await usdc.connect(orchestrator).approve(agent.target, INITIAL_BALANCE);
      await agent.connect(orchestrator).initialize(GENOME, orchestrator.address, usdc.target, INITIAL_BALANCE);
      
      await network.provider.send("evm_increaseTime", [7 * 3600]);
      await network.provider.send("evm_mine");

      await agent.connect(orchestrator).heartbeat(ethers.ZeroHash, "");

      await usdc.connect(user).approve(agent.target, ethers.parseUnits("50", 6));
      
      await expect(
        agent.connect(user).deposit(ethers.parseUnits("50", 6))
      ).to.be.revertedWithCustomError(agent, "AgentAlreadyInitialized");
    });
  });

  describe("Death", function () {
    it("Should die when called by orchestrator", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();

      await usdc.connect(orchestrator).approve(agent.target, INITIAL_BALANCE);
      await agent.connect(orchestrator).initialize(GENOME, orchestrator.address, usdc.target, INITIAL_BALANCE);
      
      const tx = await agent.connect(orchestrator).die();
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => log.fragment?.name === "AgentDied");
      expect(event).to.not.be.undefined;

      expect(await agent.isAlive()).to.be.false;
    });

    it("Should not heartbeat after death", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();

      await usdc.connect(orchestrator).approve(agent.target, INITIAL_BALANCE);
      await agent.connect(orchestrator).initialize(GENOME, orchestrator.address, usdc.target, INITIAL_BALANCE);
      
      await agent.connect(orchestrator).die();

      await network.provider.send("evm_increaseTime", [7 * 3600]);
      await network.provider.send("evm_mine");

      await expect(
        agent.connect(orchestrator).heartbeat(ethers.ZeroHash, "")
      ).to.be.revertedWithCustomError(agent, "AgentDead");
    });
  });

  describe("Get State", function () {
    it("Should return correct state", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();

      await usdc.connect(orchestrator).approve(agent.target, INITIAL_BALANCE);
      await agent.connect(orchestrator).initialize(GENOME, orchestrator.address, usdc.target, INITIAL_BALANCE);
      
      const state = await agent.getState();
      
      expect(state.genome).to.equal(GENOME);
      expect(state.heartbeatNonce).to.equal(0);
      expect(state.isAlive).to.be.true;
      expect(state.balance).to.equal(INITIAL_BALANCE);
    });

    it("Should return arweave records", async function () {
      const agent = await PetriAgent.deploy();
      await agent.waitForDeployment();

      await usdc.connect(orchestrator).approve(agent.target, INITIAL_BALANCE);
      await agent.connect(orchestrator).initialize(GENOME, orchestrator.address, usdc.target, INITIAL_BALANCE);
      
      await network.provider.send("evm_increaseTime", [7 * 3600]);
      await network.provider.send("evm_mine");
      
      await agent.connect(orchestrator).heartbeat(ethers.keccak256(ethers.toUtf8Bytes("decision-1")), "tx-1");
      
      await network.provider.send("evm_increaseTime", [7 * 3600]);
      await network.provider.send("evm_mine");
      
      await agent.connect(orchestrator).heartbeat(ethers.keccak256(ethers.toUtf8Bytes("decision-2")), "tx-2");

      const records = await agent.getArweaveRecords();
      expect(records.length).to.equal(2);
      expect(records[0]).to.equal("tx-1");
      expect(records[1]).to.equal("tx-2");
    });
  });
});
