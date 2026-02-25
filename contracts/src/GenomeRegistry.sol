// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IGenomeRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GenomeRegistry
 * @notice On-chain storage for dynamic AI agent genomes
 * @dev Stores complete genomes with 60+ genes, evolutionary history, and epigenetics
 */
contract GenomeRegistry is IGenomeRegistry, Ownable {
    
    // ============ State Variables ============
    
    // Genome data storage
    mapping(bytes32 => Genome) public genomes;
    mapping(bytes32 => mapping(uint32 => Gene)) public genes;
    mapping(bytes32 => mapping(uint8 => Chromosome)) public chromosomes;
    mapping(bytes32 => EpigeneticMark[]) public epigenome;
    mapping(bytes32 => RegulatoryEdge[]) public regulatoryNetwork;
    
    // Genome existence check
    mapping(bytes32 => bool) public genomeExists;
    
    // Gene ID counter for unique IDs
    uint32 public nextGeneId;
    
    // Authorized genome creators (factories/orchestrators)
    mapping(address => bool) public authorizedCreators;
    
    // Default gene templates (for random generation fallback)
    mapping(uint8 => Gene) public defaultGenes;
    uint8 public defaultGeneCount;

    // ============ Modifiers ============
    modifier onlyAuthorized() {
        require(authorizedCreators[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    modifier genomeMustExist(bytes32 genomeHash) {
        require(genomeExists[genomeHash], "Genome not found");
        _;
    }

    // ============ Constructor ============
    constructor() Ownable(msg.sender) {
        nextGeneId = 1; // Start from 1 to distinguish from 0
        authorizedCreators[msg.sender] = true; // Owner is authorized by default
        _initializeDefaultGenes();
    }

    // ============ Admin Functions ============
    function setAuthorizedCreator(address creator, bool authorized) external onlyOwner {
        authorizedCreators[creator] = authorized;
    }

    // ============ Core Functions ============
    
    /**
     * @notice Register a new genome on-chain
     * @param input Genome generation input parameters
     * @param _genes Array of genes defining the agent
     * @param _chromosomes Chromosome structure
     * @param regulatoryEdges Gene regulatory network
     * @return genomeHash The unique hash of the registered genome
     */
    function registerGenome(
        GenomeInput calldata input,
        Gene[] calldata _genes,
        Chromosome[] calldata _chromosomes,
        RegulatoryEdge[] calldata regulatoryEdges
    ) external onlyAuthorized returns (bytes32 genomeHash) {
        
        // Compute genome hash
        genomeHash = computeGenomeHash(_genes, _chromosomes);
        
        require(!genomeExists[genomeHash], "Genome already exists");
        
        // Store genome metadata
        Genome storage genome = genomes[genomeHash];
        genome.genomeHash = genomeHash;
        genome.totalGenes = uint32(_genes.length);
        genome.generation = 1; // First generation
        genome.birthTimestamp = uint64(block.timestamp);
        genome.lineageId = keccak256(abi.encodePacked(genomeHash, block.timestamp));
        genome.parentGenomeHash = bytes32(0); // No parent for new genomes
        genome.memoryDataHash = input.memoryDataHash;
        genome.isRandom = input.useRandom;
        
        // Store genes
        uint256[] memory geneIdList = new uint256[](_genes.length);
        for (uint i = 0; i < _genes.length; i++) {
            Gene calldata g = _genes[i];
            genes[genomeHash][g.id] = g;
            geneIdList[i] = g.id;
        }
        genome.geneIds = geneIdList;
        
        // Store chromosomes
        uint8[] memory chrIdList = new uint8[](_chromosomes.length);
        for (uint i = 0; i < _chromosomes.length; i++) {
            Chromosome calldata chr = _chromosomes[i];
            chromosomes[genomeHash][chr.id] = chr;
            chrIdList[i] = chr.id;
        }
        genome.chromosomeIds = chrIdList;
        
        // Store regulatory network
        for (uint i = 0; i < regulatoryEdges.length; i++) {
            regulatoryNetwork[genomeHash].push(regulatoryEdges[i]);
        }
        
        genomeExists[genomeHash] = true;
        
        emit GenomeRegistered(
            genomeHash,
            msg.sender,
            tx.origin,
            uint32(_genes.length),
            input.memoryDataHash != bytes32(0),
            uint64(block.timestamp)
        );
        
        return genomeHash;
    }

    /**
     * @notice Get complete genome data
     */
    function getGenome(bytes32 genomeHash) 
        external 
        view 
        genomeMustExist(genomeHash) 
        returns (Genome memory) 
    {
        return genomes[genomeHash];
    }

    /**
     * @notice Get a specific gene
     */
    function getGene(bytes32 genomeHash, uint32 geneId)
        external
        view
        genomeMustExist(genomeHash)
        returns (Gene memory)
    {
        return genes[genomeHash][geneId];
    }

    /**
     * @notice Get all genes in a specific domain
     */
    function getGenesByDomain(bytes32 genomeHash, uint8 domain)
        external
        view
        genomeMustExist(genomeHash)
        returns (Gene[] memory)
    {
        Genome storage genome = genomes[genomeHash];
        uint256 count = 0;
        
        // Count matching genes
        for (uint i = 0; i < genome.geneIds.length; i++) {
            if (genes[genomeHash][uint32(genome.geneIds[i])].domain == domain) {
                count++;
            }
        }
        
        // Collect matching genes
        Gene[] memory result = new Gene[](count);
        uint256 idx = 0;
        for (uint i = 0; i < genome.geneIds.length; i++) {
            Gene storage g = genes[genomeHash][uint32(genome.geneIds[i])];
            if (g.domain == domain) {
                result[idx] = g;
                idx++;
            }
        }
        
        return result;
    }

    /**
     * @notice Get chromosome data
     */
    function getChromosome(bytes32 genomeHash, uint8 chromosomeId)
        external
        view
        genomeMustExist(genomeHash)
        returns (Chromosome memory)
    {
        return chromosomes[genomeHash][chromosomeId];
    }

    /**
     * @notice Get all epigenetic marks
     */
    function getEpigeneticMarks(bytes32 genomeHash)
        external
        view
        genomeMustExist(genomeHash)
        returns (EpigeneticMark[] memory)
    {
        return epigenome[genomeHash];
    }

    /**
     * @notice Get regulatory network
     */
    function getRegulatoryNetwork(bytes32 genomeHash)
        external
        view
        genomeMustExist(genomeHash)
        returns (RegulatoryEdge[] memory)
    {
        return regulatoryNetwork[genomeHash];
    }

    /**
     * @notice Add epigenetic mark to a genome
     */
    function addEpigeneticMark(
        bytes32 genomeHash,
        EpigeneticMark calldata mark
    ) external onlyAuthorized genomeMustExist(genomeHash) {
        epigenome[genomeHash].push(mark);
        
        emit EpigeneticMarkAdded(
            genomeHash,
            mark.targetGeneId,
            mark.modification,
            mark.strength
        );
    }

    /**
     * @notice Create evolved child genome from parents
     * @dev DISABLED in V1.5 - Genetic evolution postponed for metabolic model validation
     */
    function evolveGenome(
        bytes32 parentHash,
        bytes32 partnerHash
    ) external onlyAuthorized genomeMustExist(parentHash) returns (bytes32 childHash) {
        revert NotImplemented("Genetic evolution disabled in V1.5. Focus: metabolic model validation. ETA: V3");
    }

    /**
     * @notice Compute hash of a genome
     */
    function computeGenomeHash(
        Gene[] calldata _genes,
        Chromosome[] calldata _chromosomes
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(_genes, _chromosomes));
    }

    /**
     * @notice Calculate total metabolic cost of a genome
     */
    function calculateMetabolicCost(bytes32 genomeHash)
        external
        view
        genomeMustExist(genomeHash)
        returns (uint256)
    {
        Genome storage genome = genomes[genomeHash];
        uint256 totalCost = 0;
        
        // Sum metabolic costs of all genes
        for (uint i = 0; i < genome.geneIds.length; i++) {
            Gene storage g = genes[genomeHash][uint32(genome.geneIds[i])];
            // metabolicCost is scaled by 10000, so divide
            totalCost += g.metabolicCost;
        }
        
        // Add genome size cost
        totalCost += genome.totalGenes * 5; // 0.00005 * 100000 = 5
        
        return totalCost;
    }

    /**
     * @notice Calculate effective expression of a gene
     * @dev Considers weight, epigenetic marks, and regulatory network
     */
    function expressGene(bytes32 genomeHash, uint32 geneId)
        external
        view
        genomeMustExist(genomeHash)
        returns (uint256)
    {
        Gene storage g = genes[genomeHash][geneId];
        
        // Base expression = value * weight / scale
        uint256 expression = (uint256(g.value) * uint256(g.weight)) / 1000000;
        
        // Apply epigenetic modifications
        EpigeneticMark[] storage marks = epigenome[genomeHash];
        for (uint i = 0; i < marks.length; i++) {
            if (marks[i].targetGeneId == geneId) {
                if (marks[i].modification == 0) { // upregulate
                    expression = expression * (1000 + marks[i].strength) / 1000;
                } else if (marks[i].modification == 1) { // downregulate
                    expression = expression * (1000 - marks[i].strength) / 1000;
                } else if (marks[i].modification == 2) { // silence
                    expression = expression * (100 - marks[i].strength * 9 / 10) / 100;
                }
            }
        }
        
        // Cap at 2x max expression
        if (expression > 2000000) expression = 2000000;
        
        return expression;
    }

    // ============ Internal Functions ============
    
    /**
     * @notice Initialize default gene templates
     */
    function _initializeDefaultGenes() internal {
        // These are fallback templates for random genome generation
        // Metabolism genes
        defaultGenes[0] = Gene({
            id: 0,
            domain: uint8(GeneDomain.METABOLISM),
            origin: uint8(GeneOrigin.PRIMORDIAL),
            expressionState: uint8(ExpressionState.ACTIVE),
            value: 500000,      // 0.5
            weight: 100000,     // 1.0
            dominance: 500,     // 0.5
            plasticity: 500,    // 0.5
            essentiality: 900,  // 0.9
            metabolicCost: 0,
            duplicateOf: 0,
            age: 0
        });
        
        defaultGenes[1] = Gene({
            id: 1,
            domain: uint8(GeneDomain.COGNITION),
            origin: uint8(GeneOrigin.PRIMORDIAL),
            expressionState: uint8(ExpressionState.ACTIVE),
            value: 500000,
            weight: 100000,
            dominance: 500,
            plasticity: 500,
            essentiality: 700,
            metabolicCost: 0,
            duplicateOf: 0,
            age: 0
        });
        
        defaultGeneCount = 2;
    }

    /**
     * @notice Check random chance (for internal testing)
     * @param probability Chance out of 1000 (e.g., 30 = 3%)
     */
    function _randomChance(uint256 probability) internal view returns (bool) {
        return uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender))) % 1000 < probability;
    }
}
