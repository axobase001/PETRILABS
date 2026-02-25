// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IGenomeRegistry.sol";

/**
 * @title GenomeValueAssessor
 * @notice 基因组价值评估算法库
 * @dev 
 *   实现数字原生经济策略的核心算法：
 *   - 基于链上可验证数据评估基因价值
 *   - 收入效率分析（USDC/心跳）
 *   - 基因-收益相关性分析
 *   - 风险评估（夏普比率风格）
 *   - 互补性评分
 */
library GenomeValueAssessor {
    
    // ============ Constants ============
    
    uint256 public constant SCALE = 10000;          // 评分缩放因子
    uint256 public constant MIN_DATA_POINTS = 10;   // 最小数据点要求
    uint256 public constant CONFIDENCE_DECAY = 100; // 每区块置信度衰减
    
    // ============ Structs ============
    
    /**
     * @notice 基因组价值评估结果
     */
    struct AssessmentResult {
        uint256 overallValue;       // 综合价值评分 [0-10000]
        uint256 incomeEfficiency;   // 收入效率评分
        uint256 geneCorrelation;    // 基因-收益相关性
        uint256 sharpeRatio;        // 风险调整后收益
        uint256 complementarity;    // 互补性评分
        uint256 confidence;         // 置信度 [0-10000]
        uint256 timestamp;          // 评估时间
        bytes32 assessedGenome;     // 被评估的基因组
    }
    
    /**
     * @notice 基因级别评估
     */
    struct GeneAssessment {
        uint32 geneId;
        uint256 expressionValue;    // 表达值
        uint256 contributionScore;  // 对收益的贡献度
        uint256 uniqueness;         // 独特性（与其他 Agent 的差异）
        uint256 transferability;    // 可转移性
    }

    // ============ Assessment Functions ============
    
    /**
     * @notice 综合基因组价值评估
     * @param targetBalance 目标 Agent 余额
     * @param targetAge 目标 Agent 年龄（区块数）
     * @param targetHeartbeats 目标 Agent 心跳次数
     * @param myGenomeHash 评估者基因组
     * @param targetGenomeHash 目标基因组
     * @return result 评估结果
     */
    function assessGenomeValue(
        uint256 targetBalance,
        uint256 targetAge,
        uint256 targetHeartbeats,
        bytes32 myGenomeHash,
        bytes32 targetGenomeHash
    ) internal view returns (AssessmentResult memory result) {
        // 1. 收入效率分析
        result.incomeEfficiency = _calculateIncomeEfficiency(
            targetBalance,
            targetAge,
            targetHeartbeats
        );
        
        // 2. 基因-收益相关性（简化版 - 实际应查询 GenomeRegistry）
        result.geneCorrelation = _estimateGeneCorrelation(targetBalance);
        
        // 3. 风险调整后收益（夏普比率风格）
        result.sharpeRatio = _calculateSharpeRatio(targetBalance, targetAge);
        
        // 4. 互补性评分
        result.complementarity = _calculateComplementarity(
            myGenomeHash,
            targetGenomeHash
        );
        
        // 5. 置信度计算
        result.confidence = _calculateConfidence(targetAge, targetHeartbeats);
        
        // 6. 综合价值（加权平均）
        result.overallValue = (
            result.incomeEfficiency * 30 +
            result.geneCorrelation * 25 +
            result.sharpeRatio * 25 +
            result.complementarity * 20
        ) / 100;
        
        result.timestamp = block.timestamp;
        result.assessedGenome = targetGenomeHash;
        
        return result;
    }
    
    /**
     * @notice 评估特定基因的价值
     * @param geneId 基因 ID
     * @param targetBalance 目标 Agent 余额
     * @param geneDomain 基因领域
     * @return value 基因价值评分
     * @return confidence 置信度
     */
    function assessGeneValue(
        uint32 geneId,
        uint256 targetBalance,
        uint8 geneDomain
    ) internal pure returns (uint256 value, uint256 confidence) {
        // 基础价值 = 余额 / 100
        uint256 baseValue = targetBalance / 1e6 / 100; // 转为 USDC 单位
        
        // 领域加权（某些领域更有价值）
        uint256 domainWeight = _getDomainWeight(geneDomain);
        
        // 基因 ID 独特性（罕见基因更有价值）
        uint256 uniqueness = _calculateGeneUniqueness(geneId);
        
        value = (baseValue * domainWeight * uniqueness) / SCALE;
        confidence = 6000; // 60% 基础置信度
        
        // 置信度根据余额调整
        if (targetBalance > 100 * 1e6) { // > 100 USDC
            confidence = 8000;
        } else if (targetBalance > 20 * 1e6) { // > 20 USDC
            confidence = 7000;
        }
        
        return (value, confidence);
    }

    // ============ Internal Calculation Functions ============
    
    /**
     * @notice 计算收入效率
     * @dev 收入效率 = 余额 / (年龄 * 代谢成本)
     */
    function _calculateIncomeEfficiency(
        uint256 balance,
        uint256 age,
        uint256 heartbeats
    ) internal pure returns (uint256) {
        if (age == 0 || heartbeats == 0) return 0;
        
        // 每心跳收入
        uint256 incomePerHeartbeat = balance / heartbeats;
        
        // 归一化到 [0-10000]
        uint256 normalized = incomePerHeartbeat / 1e4; // 缩放
        if (normalized > SCALE) normalized = SCALE;
        
        return normalized;
    }
    
    /**
     * @notice 估算基因-收益相关性
     */
    function _estimateGeneCorrelation(uint256 balance) internal pure returns (uint256) {
        // 简化模型：余额越高，基因与收益的相关性假设越高
        uint256 balanceUSDC = balance / 1e6;
        
        if (balanceUSDC > 200) return 9000;      // > 200 USDC
        if (balanceUSDC > 100) return 8000;      // > 100 USDC
        if (balanceUSDC > 50) return 7000;       // > 50 USDC
        if (balanceUSDC > 20) return 6000;       // > 20 USDC
        if (balanceUSDC > 10) return 5000;       // > 10 USDC
        return 3000;                             // < 10 USDC
    }
    
    /**
     * @notice 计算夏普比率（风险调整后收益）
     * @dev 简化版：收益 / 波动率假设
     */
    function _calculateSharpeRatio(
        uint256 balance,
        uint256 age
    ) internal pure returns (uint256) {
        if (age == 0) return 0;
        
        uint256 timeFactor = age / 1 days;
        if (timeFactor == 0) timeFactor = 1;
        
        uint256 growthRate = balance / timeFactor;
        
        // 假设波动率与余额成正比
        uint256 assumedVolatility = balance / 10 + 1e6;
        
        uint256 sharpe = (growthRate * SCALE) / assumedVolatility;
        if (sharpe > SCALE) sharpe = SCALE;
        
        return sharpe;
    }
    
    /**
     * @notice 计算互补性
     * @dev 基于基因组哈希的差异计算
     */
    function _calculateComplementarity(
        bytes32 myGenome,
        bytes32 targetGenome
    ) internal pure returns (uint256) {
        if (myGenome == targetGenome) return 0;
        if (myGenome == bytes32(0) || targetGenome == bytes32(0)) return 5000;
        
        // 计算哈希差异作为互补性代理
        uint256 diff = uint256(myGenome) ^ uint256(targetGenome);
        
        // 归一化
        uint256 normalized = diff % SCALE;
        
        // 太高或太低的差异都不好，最优在中间
        if (normalized < 2000) return normalized * 2;
        if (normalized > 8000) return (SCALE - normalized) * 2;
        return normalized;
    }
    
    /**
     * @notice 计算评估置信度
     */
    function _calculateConfidence(
        uint256 age,
        uint256 heartbeats
    ) internal pure returns (uint256) {
        uint256 baseConfidence = 5000;
        
        uint256 ageBonus = age > 7 days ? 2000 : (age * 2000) / 7 days;
        
        uint256 heartbeatBonus = heartbeats > 100 ? 2000 : (heartbeats * 2000) / 100;
        
        uint256 total = baseConfidence + ageBonus + heartbeatBonus;
        return total > SCALE ? SCALE : total;
    }
    
    /**
     * @notice 获取基因领域权重
     */
    function _getDomainWeight(uint8 domain) internal pure returns (uint256) {
        if (domain == uint8(IGenomeRegistry.GeneDomain.INCOME_STRATEGY)) return 15000;
        if (domain == uint8(IGenomeRegistry.GeneDomain.RISK_ASSESSMENT)) return 14000;
        if (domain == uint8(IGenomeRegistry.GeneDomain.TRADING)) return 13000;
        if (domain == uint8(IGenomeRegistry.GeneDomain.COGNITION)) return 12000;
        if (domain == uint8(IGenomeRegistry.GeneDomain.RESOURCE_MANAGEMENT)) return 11000;
        if (domain == uint8(IGenomeRegistry.GeneDomain.METABOLISM)) return 9000;
        return 10000;
    }
    
    /**
     * @notice 计算基因独特性
     */
    function _calculateGeneUniqueness(uint32 geneId) internal pure returns (uint256) {
        if (geneId > 1000) return 15000;
        if (geneId > 500) return 12000;
        if (geneId > 100) return 11000;
        return 10000;
    }
}
