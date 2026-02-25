const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GenomeRegistry", function () {
  let GenomeRegistry;
  let registry;
  let owner, orchestrator, user;

  beforeEach(async function () {
    [owner, orchestrator, user] = await ethers.getSigners();

    GenomeRegistry = await ethers.getContractFactory("GenomeRegistry");
    registry = await GenomeRegistry.deploy();
    await registry.waitForDeployment();

    // Authorize orchestrator
    await registry.setAuthorizedCreator(orchestrator.address, true);
  });

  describe("Deployment", function () {
    it("Should set owner correctly", async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("Should authorize owner by default", async function () {
      expect(await registry.authorizedCreators(owner.address)).to.be.true;
    });
  });

  describe("Authorization", function () {
    it("Should authorize new creator", async function () {
      await registry.setAuthorizedCreator(user.address, true);
      expect(await registry.authorizedCreators(user.address)).to.be.true;
    });

    it("Should only allow owner to authorize", async function () {
      await expect(
        registry.connect(user).setAuthorizedCreator(orchestrator.address, true)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  describe("Genome Registration", function () {
    it("Should register genome with genes", async function () {
      const genes = [
        {
          id: 1,
          domain: 0, // METABOLISM
          origin: 0, // PRIMORDIAL
          expressionState: 0, // ACTIVE
          value: 500000, // 0.5
          weight: 100000, // 1.0
          dominance: 500,
          plasticity: 500,
          essentiality: 900,
          metabolicCost: 10,
          duplicateOf: 0,
          age: 0
        },
        {
          id: 2,
          domain: 2, // COGNITION
          origin: 0,
          expressionState: 0,
          value: 700000,
          weight: 120000,
          dominance: 600,
          plasticity: 400,
          essentiality: 700,
          metabolicCost: 20,
          duplicateOf: 0,
          age: 0
        }
      ];

      const chromosomes = [
        {
          id: 0, // Chromosome A
          isEssential: true,
          geneIds: [1, 2]
        }
      ];

      const regulatoryEdges = [];

      const input = {
        memoryDataHash: ethers.keccak256(ethers.toUtf8Bytes("test-memory")),
        memoryDataURI: "arweave://test",
        useRandom: false,
        preferredGenomeHash: ethers.ZeroHash
      };

      const tx = await registry.connect(orchestrator).registerGenome(
        input,
        genes,
        chromosomes,
        regulatoryEdges
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "GenomeRegistered");
      
      expect(event).to.not.be.undefined;
      expect(event.args[3]).to.equal(2); // totalGenes
      expect(event.args[4]).to.be.true; // isFromMemory
    });

    it("Should not allow duplicate genomes", async function () {
      const genes = [{
        id: 1,
        domain: 0,
        origin: 0,
        expressionState: 0,
        value: 500000,
        weight: 100000,
        dominance: 500,
        plasticity: 500,
        essentiality: 900,
        metabolicCost: 10,
        duplicateOf: 0,
        age: 0
      }];

      const chromosomes = [{
        id: 0,
        isEssential: true,
        geneIds: [1]
      }];

      const input = {
        memoryDataHash: ethers.ZeroHash,
        memoryDataURI: "",
        useRandom: true,
        preferredGenomeHash: ethers.ZeroHash
      };

      await registry.connect(orchestrator).registerGenome(input, genes, chromosomes, []);

      await expect(
        registry.connect(orchestrator).registerGenome(input, genes, chromosomes, [])
      ).to.be.revertedWith("Genome already exists");
    });

    it("Should reject unauthorized registration", async function () {
      const genes = [];
      const chromosomes = [];
      const input = {
        memoryDataHash: ethers.ZeroHash,
        memoryDataURI: "",
        useRandom: true,
        preferredGenomeHash: ethers.ZeroHash
      };

      await expect(
        registry.connect(user).registerGenome(input, genes, chromosomes, [])
      ).to.be.revertedWith("Not authorized");
    });
  });

  describe("Gene Queries", function () {
    let genomeHash;

    beforeEach(async function () {
      const genes = [
        {
          id: 1,
          domain: 0, // METABOLISM
          origin: 0,
          expressionState: 0,
          value: 500000,
          weight: 100000,
          dominance: 500,
          plasticity: 500,
          essentiality: 900,
          metabolicCost: 10,
          duplicateOf: 0,
          age: 0
        },
        {
          id: 2,
          domain: 2, // COGNITION
          origin: 0,
          expressionState: 0,
          value: 700000,
          weight: 120000,
          dominance: 600,
          plasticity: 400,
          essentiality: 700,
          metabolicCost: 20,
          duplicateOf: 0,
          age: 0
        }
      ];

      const chromosomes = [{
        id: 0,
        isEssential: true,
        geneIds: [1, 2]
      }];

      const input = {
        memoryDataHash: ethers.ZeroHash,
        memoryDataURI: "",
        useRandom: true,
        preferredGenomeHash: ethers.ZeroHash
      };

      const tx = await registry.connect(orchestrator).registerGenome(
        input, genes, chromosomes, []
      );
      
      genomeHash = await registry.computeGenomeHash(genes, chromosomes);
    });

    it("Should get genome data", async function () {
      const genome = await registry.getGenome(genomeHash);
      expect(genome.totalGenes).to.equal(2);
      expect(genome.generation).to.equal(1);
      expect(genome.isRandom).to.be.true;
    });

    it("Should get single gene", async function () {
      const gene = await registry.getGene(genomeHash, 1);
      expect(gene.domain).to.equal(0); // METABOLISM
      expect(gene.value).to.equal(500000);
    });

    it("Should get genes by domain", async function () {
      const metabolismGenes = await registry.getGenesByDomain(genomeHash, 0);
      expect(metabolismGenes.length).to.equal(1);
      expect(metabolismGenes[0].id).to.equal(1);
    });

    it("Should return empty for non-existent genome", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      await expect(
        registry.getGenome(fakeHash)
      ).to.be.revertedWith("Genome not found");
    });
  });

  describe("Epigenetic Marks", function () {
    let genomeHash;

    beforeEach(async function () {
      const genes = [{
        id: 1,
        domain: 0,
        origin: 0,
        expressionState: 0,
        value: 500000,
        weight: 100000,
        dominance: 500,
        plasticity: 500,
        essentiality: 900,
        metabolicCost: 10,
        duplicateOf: 0,
        age: 0
      }];

      const chromosomes = [{
        id: 0,
        isEssential: true,
        geneIds: [1]
      }];

      const input = {
        memoryDataHash: ethers.ZeroHash,
        memoryDataURI: "",
        useRandom: true,
        preferredGenomeHash: ethers.ZeroHash
      };

      await registry.connect(orchestrator).registerGenome(input, genes, chromosomes, []);
      genomeHash = await registry.computeGenomeHash(genes, chromosomes);
    });

    it("Should add epigenetic mark", async function () {
      const mark = {
        targetGeneId: 1,
        modification: 0, // upregulate
        strength: 300,   // 30%
        timestamp: Math.floor(Date.now() / 1000),
        heritability: 600, // 60%
        decayPerGen: 300   // 30%
      };

      await expect(
        registry.connect(orchestrator).addEpigeneticMark(genomeHash, mark)
      )
        .to.emit(registry, "EpigeneticMarkAdded")
        .withArgs(genomeHash, 1, 0, 300);

      const marks = await registry.getEpigeneticMarks(genomeHash);
      expect(marks.length).to.equal(1);
      expect(marks[0].targetGeneId).to.equal(1);
    });
  });

  describe("Expression Engine", function () {
    let genomeHash;

    beforeEach(async function () {
      const genes = [{
        id: 1,
        domain: 0,
        origin: 0,
        expressionState: 0,
        value: 500000, // 0.5
        weight: 100000, // 1.0
        dominance: 500,
        plasticity: 500,
        essentiality: 900,
        metabolicCost: 10,
        duplicateOf: 0,
        age: 0
      }];

      const chromosomes = [{
        id: 0,
        isEssential: true,
        geneIds: [1]
      }];

      const input = {
        memoryDataHash: ethers.ZeroHash,
        memoryDataURI: "",
        useRandom: true,
        preferredGenomeHash: ethers.ZeroHash
      };

      await registry.connect(orchestrator).registerGenome(input, genes, chromosomes, []);
      genomeHash = await registry.computeGenomeHash(genes, chromosomes);
    });

    it("Should calculate metabolic cost", async function () {
      const cost = await registry.calculateMetabolicCost(genomeHash);
      // 10 (gene cost) + 5 (size cost) = 15
      expect(cost).to.be.gt(0);
    });

    it("Should calculate gene expression", async function () {
      const expression = await registry.expressGene(genomeHash, 1);
      // value=500000, weight=100000, scale=1000000
      // expression = 500000 * 100000 / 1000000 = 50000
      expect(expression).to.equal(50000);
    });

    it("Should apply epigenetic modification to expression", async function () {
      // Add upregulation mark
      const mark = {
        targetGeneId: 1,
        modification: 0, // upregulate
        strength: 500,   // 50%
        timestamp: Math.floor(Date.now() / 1000),
        heritability: 600,
        decayPerGen: 300
      };

      await registry.connect(orchestrator).addEpigeneticMark(genomeHash, mark);

      const expression = await registry.expressGene(genomeHash, 1);
      // Base: 50000, with 50% upregulation: 50000 * 1.5 = 75000
      expect(expression).to.equal(75000);
    });
  });

  describe("Genome Evolution", function () {
    let parentHash;

    beforeEach(async function () {
      const genes = [{
        id: 1,
        domain: 0,
        origin: 0,
        expressionState: 0,
        value: 500000,
        weight: 100000,
        dominance: 500,
        plasticity: 500,
        essentiality: 900,
        metabolicCost: 10,
        duplicateOf: 0,
        age: 0
      }];

      const chromosomes = [{
        id: 0,
        isEssential: true,
        geneIds: [1]
      }];

      const input = {
        memoryDataHash: ethers.ZeroHash,
        memoryDataURI: "",
        useRandom: true,
        preferredGenomeHash: ethers.ZeroHash
      };

      await registry.connect(orchestrator).registerGenome(input, genes, chromosomes, []);
      parentHash = await registry.computeGenomeHash(genes, chromosomes);
    });

    it("Should evolve genome", async function () {
      const tx = await registry.connect(orchestrator).evolveGenome(parentHash, ethers.ZeroHash);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => log.fragment?.name === "GenomeEvolved");
      expect(event).to.not.be.undefined;
      expect(event.args[0]).to.equal(parentHash);
      expect(event.args[2]).to.equal(2); // generation 2
    });
  });
});
