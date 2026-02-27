// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../src/interfaces/IGenomeRegistry.sol";

/**
 * @title MockGenomeRegistry
 * @notice Mock genome registry for testing
 */
contract MockGenomeRegistry is IGenomeRegistry {
    mapping(bytes32 => bool) public registeredGenomes;
    mapping(bytes32 => mapping(uint32 => uint256)) public geneExpressions;
    
    function registerGenome(bytes32 genomeHash, bytes calldata genomeData) external override {
        registeredGenomes[genomeHash] = true;
    }
    
    function isValidGenome(bytes32 genomeHash) external view override returns (bool) {
        return registeredGenomes[genomeHash];
    }
    
    function expressGene(bytes32 genomeHash, uint32 geneId) external view override returns (uint256) {
        return geneExpressions[genomeHash][geneId];
    }
    
    function calculateMetabolicCost(bytes32 genomeHash) external pure override returns (uint256) {
        return 1000; // Mock metabolic cost
    }
    
    function setGeneExpression(bytes32 genomeHash, uint32 geneId, uint256 value) external {
        geneExpressions[genomeHash][geneId] = value;
    }
    
    function validateGenome(bytes32 genomeHash) external view override returns (bool isValid, uint256 geneCount) {
        return (registeredGenomes[genomeHash], 10);
    }
}
