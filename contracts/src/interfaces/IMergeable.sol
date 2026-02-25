// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IMergeable
 * @notice 基因组合并接口 - Merge（有目的的基因获取/能力并购）
 * @dev 从"有性繁殖"转向"数字原生经济策略"：
 *      - Merge = 能力并购：基于链上数据分析的理性基因交换
 *      - 不是"交配"，而是"我分析了你的链上表现，想要你的特定基因"
 *      - 双方各付成本，基因级别的精细控制
 */
interface IMergeable {
    // ============ Enums ============
    
    /// @notice Merge 结果模式
    enum MergeOutcome {
        BOTH_SURVIVE,   // 0: 双方都存活，产生共同子代
        PROPOSER_DIES,  // 1: 发起者死亡，目标存活
        TARGET_DIES,    // 2: 目标死亡，发起者存活
        BOTH_DIE        // 3: 双方都死亡，子代继承全部
    }

    // ============ Errors ============
    error InvalidProposal(uint256 proposalId);
    error ProposalExpired(uint256 proposalId, uint256 expiry);
    error InsufficientDeposit(uint256 required, uint256 actual);
    error SelfMergeNotAllowed();
    error Stillbirth(string reason);
    error InvalidGeneSelection();
    error UnauthorizedAcceptance();
    error MergeNotAllowed(string reason);
    
    // ============ Events ============
    
    /// @notice Merge 提议事件（包含基因级别细节）
    event MergeProposed(
        uint256 indexed proposalId,
        address indexed proposer,
        address indexed target,
        bytes32 proposerGenomeHash,
        uint256 proposerDeposit,
        uint256 expiry,
        uint32[] genesWanted,      // 发起者想要获取的目标基因
        uint256 offerValue         // 发起者评估的对方基因组价值
    );
    
    /// @notice Merge 接受事件
    event MergeAccepted(
        uint256 indexed proposalId,
        address indexed acceptor,
        bytes32 acceptorGenomeHash,
        uint256 acceptorDeposit,
        uint32[] genesOffered      // 接受者愿意提供的基因
    );
    
    /// @notice Merge 完成事件
    event Merged(
        address indexed parent1, 
        address indexed parent2, 
        address indexed child, 
        bytes32 childGenomeHash,
        uint256 totalCost,
        MergeOutcome outcome,
        uint32[] inheritedGenes   // 实际继承的基因列表
    );
    
    /// @notice Merge 取消事件
    event MergeCancelled(uint256 indexed proposalId, address indexed canceller, string reason);
    
    /// @notice 死产事件（Merge 失败）
    event MergeStillbirth(
        address indexed parent1, 
        address indexed parent2, 
        bytes32 attemptedGenomeHash, 
        string reason
    );
    
    /// @notice 基因组价值评估事件
    event GenomeValueAssessed(
        address indexed assessor,
        address indexed target,
        uint256 assessedValue,
        uint32[] valuableGenes
    );

    // ============ Structs ============
    
    /// @notice Merge 提议结构
    struct MergeProposal {
        address proposer;              // 发起者
        address target;                // 目标 agent
        bytes32 proposerGenomeHash;
        uint256 proposerDeposit;       // 发起者承担的成本
        uint256 expiry;                // 过期区块号
        bool active;
        
        // 新增：基因级别控制
        uint32[] genesWanted;          // 发起者想要从目标获取的基因ID
        uint256 offerValue;            // 发起者对目标基因组的价值评估
        string assessmentRationale;    // 评估理由（Arweave 哈希）
    }
    
    /// @notice Merge 接受结构
    struct MergeAcceptance {
        address acceptor;
        bytes32 acceptorGenomeHash;
        uint256 acceptorDeposit;
        uint32[] genesOffered;         // 接受者愿意提供的基因ID
        MergeOutcome preferredOutcome; // 接受者偏好的结果模式
    }
    
    /// @notice Merge 参数
    struct MergeParams {
        uint32[] genesWanted;          // 想要的基因
        uint256 valueAssessment;       // 价值评估
        uint256 deposit;               // 愿意支付的押金
        MergeOutcome preferredOutcome; // 偏好的结果模式
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
    
    /// @notice 获取 Agent 提出的所有提议
    function getProposalsByProposer(address proposer) external view returns (uint256[] memory);
    
    /// @notice 获取 Agent 收到的所有提议
    function getProposalsByTarget(address target) external view returns (uint256[] memory);
    
    /// @notice 评估基因价值（链上算法）
    /// @param target 目标 Agent
    /// @param geneIds 要评估的基因列表
    /// @return valueScore 价值评分 [0-10000]
    /// @return confidence 置信度 [0-10000]
    function assessGeneValue(address target, uint32[] calldata geneIds)
        external
        view
        returns (uint256 valueScore, uint256 confidence);
    
    /// @notice 计算 Merge 成本（双方各承担）
    function calculateMergeCost(uint32[] calldata genesToMerge)
        external
        view
        returns (uint256 costPerParty);

    // ============ Core Functions ============
    
    /// @notice 发起 Merge 提议（基于基因组价值评估）
    /// @param target 目标 agent
    /// @param params Merge 参数（基因选择、价值评估等）
    /// @return proposalId 提议 ID
    function proposeMerge(address target, MergeParams calldata params) 
        external 
        returns (uint256 proposalId);
    
    /// @notice 接受 Merge 提议
    /// @param proposalId 提议 ID
    /// @param genesOffered 愿意提供的基因
    /// @param deposit 接受者支付的押金
    /// @return child 子代 agent 地址
    function acceptMerge(
        uint256 proposalId, 
        uint32[] calldata genesOffered,
        uint256 deposit
    ) external returns (address child);
    
    /// @notice Agent 自主评估后发起 Merge（由 Agent 运行时调用）
    /// @dev Agent 通过分析链上数据自主决定发起 Merge
    function autonomousMerge(
        address target,
        uint32[] calldata genesWanted,
        uint256 valueAssessment
    ) external returns (uint256 proposalId);
    
    /// @notice 取消或拒绝提议
    /// @param proposalId 提议 ID
    /// @param reason 取消原因
    function cancelMerge(uint256 proposalId, string calldata reason) external;
}
