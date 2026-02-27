// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../src/interfaces/ITombstone.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title MockTombstone
 * @notice Mock tombstone NFT contract for testing
 */
contract MockTombstone is ITombstone, ERC721 {
    uint256 private _tokenIdCounter;
    mapping(address => uint256) public agentTombstones;
    mapping(uint256 => DeathRecord) public records;
    
    constructor() ERC721("Tombstone", "TOMB") {}
    
    function mint(address agent, address recipient, DeathRecordInput calldata record) external override returns (uint256) {
        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;
        
        _mint(recipient, tokenId);
        agentTombstones[agent] = tokenId;
        
        records[tokenId] = DeathRecord({
            agent: agent,
            genomeHash: record.genomeHash,
            birthTime: block.timestamp - record.lifespan * 12, // Approximate
            deathTime: block.timestamp,
            lifespan: record.lifespan,
            arweaveId: record.arweaveId,
            totalValue: record.totalValue,
            offspringCount: record.offspringCount,
            causeOfDeath: record.causeOfDeath,
            exists: true
        });
        
        return tokenId;
    }
    
    function hasTombstone(address agent) external view override returns (bool) {
        return agentTombstones[agent] != 0;
    }
    
    function getDeathRecord(uint256 tokenId) external view override returns (DeathRecord memory) {
        return records[tokenId];
    }
    
    function getTombstoneId(address agent) external view override returns (uint256) {
        return agentTombstones[agent];
    }
    
    function _update(address from, address to, uint256 tokenId) internal override {
        // Soulbound: only allow mint (from=0) and burn (to=0)
        if (from != address(0) && to != address(0)) {
            revert("Tombstone is soulbound");
        }
        super._update(from, to, tokenId);
    }
}
