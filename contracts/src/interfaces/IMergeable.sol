// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IMergeable
 * @notice 基因组合并接口 - Merge（有目的的基因获取）
 * @dev 两个 agent 自主决定合并基因组，通过链上提议-接受协议
 */
interface IMergeable {
    // ============ Errors ============
    error InvalidProposal(uint256 proposalId);
    error ProposalExpired(uint256 proposalId, uint256 expiry);
    error InsufficientDeposit(uint256 required, uint256 actual);
    error SelfMergeNotAllowed();
    error Stillbirth(string reason);
    
    // ============ Events ============
    
    /// @notice Merge 提议事件
    event MergeProposed(
        uint256 indexed proposalId,
        address indexed proposer,
        address target,
        uint256 deposit,
        uint256 expiry
    );
    
    /// @notice Merge 接受事件
    event MergeAccepted(
        uint256 indexed proposalId,
        address indexed acceptor,
        address indexed child,
        bytes32 childGenomeHash
    );
    
    /// @notice Merge 取消事件
    event MergeCancelled(uint256 indexed proposalId, address indexed canceller);
    
    /// @notice Merge 成功事件
    event Merged(
        address indexed parent1, 
        address indexed parent2, 
        address indexed child, 
        bytes32 childGenomeHash,
        uint256 cost
    );
    
    /// @notice 死产事件（Merge 失败）
    event MergeStillbirth(
        address indexed parent1, 
        address indexed parent2, 
        bytes32 attemptedGenomeHash, 
        string reason
    );

    // ============ Structs ============
    
    struct MergeProposal {
        address proposer;           // 发起者
        address target;             // 目标 agent（address(0) = 开放提议）
        bytes32 proposerGenomeHash;
        uint256 proposerDeposit;    // 发起者愿意承担的成本
        uint256 expiry;             // 提议过期区块号
        bool active;
    }
    
    struct MergeAcceptance {
        address acceptor;
        bytes32 acceptorGenomeHash;
        uint256 acceptorDeposit;
    }

    // ============ View Functions ============
    
    /// @notice 获取提议详情
    function getProposal(uint256 proposalId) external view returns (MergeProposal memory);
    
    /// @notice 获取提议数量
    function getProposalCount() external view returns (uint256);
    
    /// @notice 获取当前开放提议列表
    function getOpenProposals() external view returns (uint256[] memory);
    
    /// @notice 检查提议是否有效
    function isProposalValid(uint256 proposalId) external view returns (bool);

    // ============ Core Functions ============
    
    /// @notice 发起 Merge 提议
    /// @param target 目标 agent（address(0) 表示开放给任何人）
    /// @param deposit 愿意承担的成本（会被锁定）
    /// @return proposalId 提议 ID
    function proposeMerge(address target, uint256 deposit) external returns (uint256 proposalId);
    
    /// @notice 接受 Merge 提议
    /// @param proposalId 提议 ID
    /// @param deposit 接受者愿意承担的成本
    /// @return child 子代 agent 地址
    function acceptMerge(uint256 proposalId, uint256 deposit) external returns (address child);
    
    /// @notice 取消或拒绝提议（发起者取消，或目标拒绝）
    /// @param proposalId 提议 ID
    function cancelMerge(uint256 proposalId) external;
}
