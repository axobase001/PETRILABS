// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ITombstone.sol";

/**
 * @title Tombstone
 * @notice Agent 死亡证明 NFT，永久记录生命历程
 * @dev 铸造时记录跨链总余额与 Arweave 基因哈希
 * @dev 灵魂绑定（不可转让），仅允许铸造和销毁
 */
contract Tombstone is ERC721, ITombstone, Ownable {
    
    uint256 private _tokenIdCounter;
    
    // 链 ID => 余额
    struct ChainBalance {
        uint256 chainId;
        uint256 balance;
    }
    
    struct DeathRecord {
        address agent;
        bytes32 genomeHash;
        uint256 diedAt;
        uint256 lifespan;
        string arweaveId;
        uint256 totalValue;
        uint256 offspringCount;
        string causeOfDeath;
        ChainBalance[] chainBalances; // 各链余额详情
    }
    
    mapping(uint256 => DeathRecord) private _records;
    mapping(address => uint256) public agentToTombstone;
    
    // 授权铸造者（Agent 合约或 Orchestrator）
    mapping(address => bool) public authorizedMinters;
    
    modifier onlyMinter() {
        require(authorizedMinters[msg.sender], "Not authorized minter");
        _;
    }
    
    constructor() ERC721("PetriLabs Tombstone", "TOMB") Ownable(msg.sender) {
        _tokenIdCounter = 0;
    }
    
    /**
     * @notice 铸造死亡证明
     * @param agent 死亡 Agent 地址
     * @param record 死亡记录数据
     */
    function mint(
        address agent,
        address recipient,
        DeathRecordInput calldata record
    ) external override onlyMinter returns (uint256 tokenId) {
        require(agent != address(0), "Invalid agent address");
        require(agentToTombstone[agent] == 0, "Agent already has tombstone");
        require(record.lifespan > 0, "Invalid lifespan");
        require(recipient != address(0), "Invalid recipient");
        
        tokenId = ++_tokenIdCounter;
        
        // 铸造给指定的 recipient（修复 tx.origin 漏洞）
        _safeMint(recipient, tokenId);
        
        // 存储记录
        DeathRecord storage r = _records[tokenId];
        r.agent = agent;
        r.genomeHash = record.genomeHash;
        r.diedAt = block.timestamp;
        r.lifespan = record.lifespan;
        r.arweaveId = record.arweaveId;
        r.totalValue = record.totalValue;
        r.offspringCount = record.offspringCount;
        r.causeOfDeath = record.causeOfDeath;
        
        agentToTombstone[agent] = tokenId;
        
        emit DeathRecorded(tokenId, agent, record.causeOfDeath, record.totalValue);
        return tokenId;
    }
    
    /**
     * @notice 铸造带多链余额详情的死亡证明
     * @dev 扩展版本，支持记录各链具体余额
     */
    function mintWithChainDetails(
        address agent,
        address recipient,
        DeathRecordInput calldata record,
        ChainBalance[] calldata chainBalances
    ) external onlyMinter returns (uint256 tokenId) {
        tokenId = mint(agent, recipient, record);
        
        DeathRecord storage r = _records[tokenId];
        for (uint i = 0; i < chainBalances.length; i++) {
            r.chainBalances.push(chainBalances[i]);
        }
    }
    
    /**
     * @notice 获取死亡记录
     */
    function getDeathRecord(uint256 tokenId) 
        external 
        view 
        override 
        returns (DeathRecordView memory) 
    {
        require(_exists(tokenId), "Tombstone does not exist");
        
        DeathRecord storage r = _records[tokenId];
        return DeathRecordView({
            agent: r.agent,
            genomeHash: r.genomeHash,
            diedAt: r.diedAt,
            lifespan: r.lifespan,
            arweaveId: r.arweaveId,
            totalValue: r.totalValue,
            offspringCount: r.offspringCount,
            causeOfDeath: r.causeOfDeath
        });
    }
    
    /**
     * @notice 获取完整的死亡记录（含链详情）
     */
    function getFullDeathRecord(uint256 tokenId) 
        external 
        view 
        returns (DeathRecord memory) 
    {
        require(_exists(tokenId), "Tombstone does not exist");
        return _records[tokenId];
    }
    
    /**
     * @notice 检查 Agent 是否有 Tombstone
     */
    function hasTombstone(address agent) external view override returns (bool) {
        return agentToTombstone[agent] != 0;
    }
    
    /**
     * @notice 设置授权铸造者
     */
    function setMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
    }
    
    // _determineOwner removed: using explicit recipient parameter to avoid tx.origin vulnerability
    
    /**
     * @notice 检查代币是否存在
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
    
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
    
    /**
     * @notice 获取总铸造数量
     */
    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter;
    }
    
    /**
     * @notice 批量获取死亡记录
     */
    function getDeathRecords(uint256[] calldata tokenIds) 
        external 
        view 
        returns (DeathRecordView[] memory) 
    {
        DeathRecordView[] memory records = new DeathRecordView[](tokenIds.length);
        for (uint i = 0; i < tokenIds.length; i++) {
            records[i] = this.getDeathRecord(tokenIds[i]);
        }
        return records;
    }
}
