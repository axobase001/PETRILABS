// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ITombstone
 * @notice Agent 死亡证明 NFT 接口
 */

struct DeathRecordInput {
    bytes32 genomeHash;
    uint256 lifespan;           // 存活区块数或天数
    string arweaveId;           // 刻在石头上的记忆
    uint256 totalValue;         // 跨链总余额（死亡时的净资产）
    uint256 offspringCount;     // 后代数量
    string causeOfDeath;        // metabolic_exhaustion, killed, suicide 等
}

struct DeathRecordView {
    address agent;
    bytes32 genomeHash;
    uint256 diedAt;
    uint256 lifespan;
    string arweaveId;
    uint256 totalValue;
    uint256 offspringCount;
    string causeOfDeath;
}

interface ITombstone {
    /**
     * @notice 铸造死亡证明
     * @param agent 死亡 Agent 地址
     * @param record 死亡记录数据
     * @return tokenId NFT 代币 ID
     */
    function mint(
        address agent, 
        address recipient,
        DeathRecordInput calldata record
    ) external returns (uint256 tokenId);
    
    /**
     * @notice 获取死亡记录
     * @param tokenId NFT 代币 ID
     */
    function getDeathRecord(uint256 tokenId) 
        external 
        view 
        returns (DeathRecordView memory);
    
    /**
     * @notice 通过 Agent 地址查询 Tombstone
     * @param agent Agent 地址
     * @return tokenId NFT 代币 ID（0 表示无 Tombstone）
     */
    function agentToTombstone(address agent) external view returns (uint256);
    
    /**
     * @notice 检查 Agent 是否有 Tombstone
     * @param agent Agent 地址
     */
    function hasTombstone(address agent) external view returns (bool);
    
    // 事件
    event DeathRecorded(
        uint256 indexed tokenId, 
        address indexed agent, 
        string cause,
        uint256 totalValue
    );
}
