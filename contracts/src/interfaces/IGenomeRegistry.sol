// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IGenomeRegistry
 * @notice On-chain dynamic genome storage and management
 * @dev Stores complete 60+ gene genomes with full evolutionary history
 */
interface IGenomeRegistry {
    // ============ Enums ============
    enum GeneDomain {
        METABOLISM,          // 0: 代谢相关
        PERCEPTION,          // 1: 感知相关
        COGNITION,           // 2: 认知相关
        MEMORY,              // 3: 记忆相关
        RESOURCE_MANAGEMENT, // 4: 资源管理
        RISK_ASSESSMENT,     // 5: 风险评估
        TRADING,             // 6: 交易行为
        INCOME_STRATEGY,     // 7: 收入策略
        ONCHAIN_OPERATION,   // 8: 链上操作能力
        WEB_NAVIGATION,      // 9: 网页浏览/交互
        CONTENT_CREATION,    // 10: 内容创作
        DATA_ANALYSIS,       // 11: 数据分析
        API_UTILIZATION,     // 12: API 使用能力
        SOCIAL_MEDIA,        // 13: 社交媒体运营
        COOPERATION,         // 14: 合作行为
        COMPETITION,         // 15: 竞争行为
        COMMUNICATION,       // 16: 通信能力
        TRUST_MODEL,         // 17: 信任模型
        MATE_SELECTION,      // 18: 择偶策略
        PARENTAL_INVESTMENT, // 19: 亲代投入
        HUMAN_HIRING,        // 20: 雇佣人类的能力
        HUMAN_COMMUNICATION, // 21: 与人类沟通的能力
        HUMAN_EVALUATION,    // 22: 评估人类服务的能力
        STRESS_RESPONSE,     // 23: 压力响应
        ADAPTATION,          // 24: 适应机制
        DORMANCY,            // 25: 休眠能力
        MIGRATION,           // 26: 迁移（跨平台/跨链）
        SELF_MODEL,          // 27: 自我建模
        STRATEGY_EVALUATION, // 28: 策略评估
        LEARNING,            // 29: 学习机制
        PLANNING,            // 30: 规划能力
        REGULATORY           // 31: 调控其他基因的基因
    }

    enum GeneOrigin {
        PRIMORDIAL,          // 0: 初代基因（用户定义）
        INHERITED,           // 1: 从父代继承
        DUPLICATED,          // 2: 基因复制产生
        MUTATED,             // 3: 突变产生的新基因
        HORIZONTAL_TRANSFER, // 4: 从其他 agent 获取
        DE_NOVO              // 5: 全新出现（极稀有）
    }

    enum ExpressionState {
        ACTIVE,      // 0: 活跃表达
        SILENCED,    // 1: 沉默
        CONDITIONAL  // 2: 条件表达
    }

    // ============ Structs ============
    struct Gene {
        uint16 id;                    // 基因ID (0-65535)
        uint8 domain;                 // GeneDomain enum
        uint8 origin;                 // GeneOrigin enum
        uint8 expressionState;        // ExpressionState enum
        uint32 value;                 // 基础值 [0, 1000000] 表示 [0, 1]
        uint32 weight;                // 权重 [0, 300000] 表示 [0.1, 3.0]
        uint16 dominance;             // 显性程度 [0, 1000] 表示 [0, 1]
        uint16 plasticity;            // 可塑性 [0, 1000]
        uint16 essentiality;          // 必要性 [0, 1000]
        uint32 metabolicCost;         // 代谢成本 [0, 10000] 表示 [0, 0.01] USDC/day
        uint32 duplicateOf;           // 如果是复制来的，原始基因ID
        uint16 age;                   // 存在了多少代
    }

    struct Chromosome {
        uint8 id;                     // 染色体ID (A=0, B=1, ...)
        bool isEssential;             // 是否必需染色体
        uint32[] geneIds;             // 该染色体上的基因ID列表
    }

    struct EpigeneticMark {
        uint32 targetGeneId;          // 被修饰的基因ID
        uint8 modification;           // 0=upregulate, 1=downregulate, 2=silence, 3=activate
        uint16 strength;              // 修饰强度 [0, 1000]
        uint64 timestamp;             // 产生时间
        uint16 heritability;          // 遗传概率 [0, 1000]
        uint16 decayPerGen;           // 每代衰减 [0, 1000]
    }

    struct RegulatoryEdge {
        uint32 regulator;             // 调控基因ID
        uint32 target;                // 被调控基因ID
        uint8 edgeType;               // 0=activate, 1=repress, 2=modulate
        uint16 strength;              // 调控强度 [0, 1000]
    }

    struct Genome {
        bytes32 genomeHash;           // 整个基因组的 Merkle root
        uint32 totalGenes;            // 当前基因总数
        uint16 generation;            // 第几代
        uint64 birthTimestamp;        // 诞生时间
        bytes32 lineageId;            // 血脉标识
        bytes32 parentGenomeHash;     // 父代基因组哈希（0如果是初代）
        bytes32 memoryDataHash;         // 用户记忆文件哈希（如果是基于记忆生成）
        bool isRandom;                // 是否随机生成
        uint256[] geneIds;            // 所有基因ID列表
        uint8[] chromosomeIds;        // 所有染色体ID列表
    }

    struct GenomeInput {
        bytes32 memoryDataHash;       // 用户记忆文件哈希
        string memoryDataURI;         // 记忆文件存储位置（Arweave/IPFS）
        bool useRandom;               // 是否强制使用随机基因组
        bytes32 preferredGenomeHash;  // 用户偏好的基因组模板（可选）
    }

    // ============ Events ============
    event GenomeRegistered(
        bytes32 indexed genomeHash,
        address indexed agent,
        address indexed creator,
        uint32 totalGenes,
        bool isFromMemory,
        uint64 timestamp
    );
    
    event GeneAdded(bytes32 indexed genomeHash, uint32 indexed geneId, uint8 domain);
    event GeneUpdated(bytes32 indexed genomeHash, uint32 indexed geneId, string field);
    event GeneDuplicated(bytes32 indexed genomeHash, uint32 indexed originalId, uint32 indexed newId);
    event GeneDeleted(bytes32 indexed genomeHash, uint32 indexed geneId);
    
    event EpigeneticMarkAdded(
        bytes32 indexed genomeHash,
        uint32 indexed targetGeneId,
        uint8 modification,
        uint16 strength
    );
    
    event RegulatoryEdgeAdded(
        bytes32 indexed genomeHash,
        uint32 indexed regulator,
        uint32 indexed target,
        uint8 edgeType
    );
    
    event GenomeEvolved(
        bytes32 indexed parentHash,
        bytes32 indexed childHash,
        uint16 generation,
        uint256 mutationCount
    );

    // ============ Errors ============
    error NotImplemented(string feature);

    // ============ Functions ============
    function registerGenome(
        GenomeInput calldata input,
        Gene[] calldata genes,
        Chromosome[] calldata chromosomes,
        RegulatoryEdge[] calldata regulatoryEdges
    ) external returns (bytes32 genomeHash);

    function getGenome(bytes32 genomeHash) external view returns (Genome memory);
    function getGene(bytes32 genomeHash, uint32 geneId) external view returns (Gene memory);
    function getGenesByDomain(bytes32 genomeHash, uint8 domain) external view returns (Gene[] memory);
    function getChromosome(bytes32 genomeHash, uint8 chromosomeId) external view returns (Chromosome memory);
    function getEpigeneticMarks(bytes32 genomeHash) external view returns (EpigeneticMark[] memory);
    function getRegulatoryNetwork(bytes32 genomeHash) external view returns (RegulatoryEdge[] memory);

    function addEpigeneticMark(
        bytes32 genomeHash,
        EpigeneticMark calldata mark
    ) external;

    function evolveGenome(
        bytes32 parentHash,
        bytes32 partnerHash  // 可以是0（无性繁殖）
    ) external returns (bytes32 childHash);

    function computeGenomeHash(
        Gene[] calldata genes,
        Chromosome[] calldata chromosomes
    ) external pure returns (bytes32);

    function calculateMetabolicCost(bytes32 genomeHash) external view returns (uint256);
    function expressGene(bytes32 genomeHash, uint32 geneId) external view returns (uint256);
    
    // Admin functions
    function setAuthorizedCreator(address creator, bool authorized) external;
    function genomeExists(bytes32 genomeHash) external view returns (bool);
}
