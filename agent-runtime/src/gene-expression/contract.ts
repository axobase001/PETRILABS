/**
 * Base L2 基因日志合约接口
 * 
 * Base L2 作为廉价索引层，不存原始数据，只存 checkpoint 指针
 * 成本：Base L2 事件 ~$0.0001/次，比 Arweave 便宜 10 倍
 * 用途：任何人可以通过链上事件快速定位某个 agent 的 Arweave 归档
 */

import { ethers } from 'ethers';

/**
 * 基因日志合约 ABI
 * 需要预先部署一个极简事件合约
 */
export const GENE_LOG_ABI = [
  // 事件
  'event GeneCheckpoint(address indexed agent, bytes32 merkleRoot, uint256 metabolicCount, uint256 overrideCount, uint256 timestamp)',
  'event AgentDeath(address indexed agent, bytes32 tombstoneArweaveId, uint256 totalOverrides, string dominantTrait)',
  
  // 函数
  'function emitCheckpoint(bytes32 merkleRoot, uint256 metabolicCount, uint256 overrideCount) external',
  'function emitDeath(bytes32 tombstoneId, uint256 totalOverrides, string calldata dominantTrait) external',
  
  // 查询函数（可选）
  'function getAgentCheckpoints(address agent) external view returns (tuple(bytes32 merkleRoot, uint256 metabolicCount, uint256 overrideCount, uint256 timestamp)[])',
  'function getAgentDeath(address agent) external view returns (bytes32 tombstoneId, uint256 totalOverrides, string dominantTrait, bool hasDied)',
];

/**
 * 创建基因日志合约实例
 */
export function createGeneLogContract(
  address: string,
  signerOrProvider: ethers.Signer | ethers.Provider
): ethers.Contract {
  return new ethers.Contract(address, GENE_LOG_ABI, signerOrProvider);
}

/**
 * 发射基因 Checkpoint 事件
 */
export async function emitGeneCheckpoint(
  contract: ethers.Contract,
  merkleRoot: string,
  metabolicCount: number,
  overrideCount: number
): Promise<ethers.TransactionReceipt> {
  const tx = await contract.emitCheckpoint(
    merkleRoot,
    metabolicCount,
    overrideCount
  );
  return tx.wait();
}

/**
 * 发射 Agent 死亡事件
 */
export async function emitAgentDeath(
  contract: ethers.Contract,
  tombstoneId: string,
  totalOverrides: number,
  dominantTrait: string
): Promise<ethers.TransactionReceipt> {
  const tx = await contract.emitDeath(
    tombstoneId,
    totalOverrides,
    dominantTrait
  );
  return tx.wait();
}

export default {
  GENE_LOG_ABI,
  createGeneLogContract,
  emitGeneCheckpoint,
  emitAgentDeath,
};
