/**
 * Data Bundler Module
 * 负责将日志数据打包为 Arweave 兼容格式
 * 
 * 支持的打包策略:
 * 1. Genesis: 原始 JSON，Gzip 压缩
 * 2. Logs: JSON Lines 格式，批次打包 + Merkle Root
 */

import { gzipSync, gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import { getStorageConfig, getAgentConfig } from './config.js';
import { createLogger } from './logger.js';

const logger = createLogger('bundler');

// ============================================
// 工具函数
// ============================================

/**
 * 计算 Merkle Root
 * @param {Array<string>} leaves - 叶子节点哈希数组
 */
function computeMerkleRoot(leaves) {
  if (leaves.length === 0) {
    return createHash('sha256').update('').digest('hex');
  }

  let level = leaves.map((leaf) => Buffer.from(leaf, 'hex'));

  while (level.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left; // 奇数节点复制最后一个
      const combined = Buffer.concat([left, right]);
      nextLevel.push(createHash('sha256').update(combined).digest());
    }
    level = nextLevel;
  }

  return level[0].toString('hex');
}

/**
 * 生成数据哈希
 * @param {Buffer|string} data - 数据
 */
function hashData(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * 压缩数据
 * @param {Buffer} data - 原始数据
 */
function compress(data) {
  const config = getStorageConfig();
  try {
    const compressed = gzipSync(data, { level: config.compressionLevel });
    logger.debug('Data compressed', {
      original: data.length,
      compressed: compressed.length,
      ratio: ((1 - compressed.length / data.length) * 100).toFixed(1) + '%',
    });
    return compressed;
  } catch (error) {
    logger.error('Compression failed', { error: error.message });
    throw error;
  }
}

/**
 * 解压数据
 * @param {Buffer} data - 压缩数据
 */
function decompress(data) {
  try {
    return gunzipSync(data);
  } catch (error) {
    logger.error('Decompression failed', { error: error.message });
    throw error;
  }
}

// ============================================
// Bundler 类
// ============================================

export class Bundler {
  constructor() {
    this.config = getStorageConfig();
    this.agentConfig = getAgentConfig();
  }

  /**
   * 打包创世数据
   * @param {Object} genomeData - 基因组数据
   */
  bundleGenesis(genomeData) {
    try {
      logger.info('Bundling genesis data...');

      // 构建创世数据包
      const genesis = {
        type: 'Genesis',
        agentId: this.agentConfig.id,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        data: genomeData,
        metadata: {
          sessionId: this.agentConfig.sessionId,
          bundlerVersion: '1.0.0',
        },
      };

      // 序列化并压缩
      const jsonString = JSON.stringify(genesis, null, 2);
      const buffer = Buffer.from(jsonString, 'utf8');
      const compressed = compress(buffer);

      // 生成内容哈希
      const contentHash = hashData(buffer);

      logger.info('Genesis data bundled', {
        originalSize: buffer.length,
        compressedSize: compressed.length,
        contentHash: contentHash.slice(0, 16) + '...',
      });

      return {
        data: compressed,
        originalSize: buffer.length,
        compressedSize: compressed.length,
        contentHash,
        format: 'gzip-json',
        tags: [
          { name: 'App-Name', value: 'PetriLabs' },
          { name: 'Type', value: 'Genesis' },
          { name: 'Agent-ID', value: this.agentConfig.id },
          { name: 'Timestamp', value: genesis.timestamp },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Content-Encoding', value: 'gzip' },
          { name: 'Content-Hash', value: contentHash },
        ],
      };
    } catch (error) {
      logger.error('Failed to bundle genesis data', { error: error.message });
      throw error;
    }
  }

  /**
   * 打包日志批次
   * @param {Array<Object>} logs - 日志条目数组
   * @param {Object} options - 打包选项
   */
  bundleLogs(logs, options = {}) {
    try {
      if (!logs || logs.length === 0) {
        throw new Error('Empty logs array');
      }

      logger.info('Bundling logs batch...', { count: logs.length });

      const { startTime = logs[0]?.timestamp, endTime = logs[logs.length - 1]?.timestamp } = options;

      // 计算每条日志的哈希 (用于 Merkle Tree)
      const logHashes = logs.map((log, index) => {
        const logString = JSON.stringify(log);
        return hashData(logString);
      });

      // 计算 Merkle Root
      const merkleRoot = computeMerkleRoot(logHashes);

      // 构建批次数据
      const batch = {
        type: 'AgentLog',
        agentId: this.agentConfig.id,
        session: this.agentConfig.sessionId,
        startTime,
        endTime,
        count: logs.length,
        merkleRoot,
        logs,
      };

      // 序列化为 JSON Lines (每行一个 JSON 对象)
      const jsonLines = logs.map((log) => JSON.stringify(log)).join('\n');
      const metadata = JSON.stringify(batch, null, 2);
      
      // 组合: 元数据 + 分隔符 + 日志行
      const combined = Buffer.from(
        `# METADATA\n${metadata}\n# LOGS\n${jsonLines}`,
        'utf8'
      );

      // 压缩
      const compressed = compress(combined);
      const contentHash = hashData(combined);

      logger.info('Logs batch bundled', {
        count: logs.length,
        originalSize: combined.length,
        compressedSize: compressed.length,
        merkleRoot: merkleRoot.slice(0, 16) + '...',
      });

      return {
        data: compressed,
        originalSize: combined.length,
        compressedSize: compressed.length,
        contentHash,
        merkleRoot,
        logCount: logs.length,
        format: 'gzip-jsonl',
        tags: [
          { name: 'App-Name', value: 'PetriLabs' },
          { name: 'Type', value: 'AgentLog' },
          { name: 'Agent-ID', value: this.agentConfig.id },
          { name: 'Session', value: this.agentConfig.sessionId },
          { name: 'Log-Count', value: logs.length.toString() },
          { name: 'Merkle-Root', value: merkleRoot },
          { name: 'Start-Time', value: new Date(startTime).toISOString() },
          { name: 'End-Time', value: new Date(endTime).toISOString() },
          { name: 'Content-Type', value: 'application/x-ndjson' },
          { name: 'Content-Encoding', value: 'gzip' },
          { name: 'Content-Hash', value: contentHash },
        ],
      };
    } catch (error) {
      logger.error('Failed to bundle logs', { error: error.message, count: logs?.length });
      throw error;
    }
  }

  /**
   * 打包单个日志条目 (实时小批次)
   * @param {Object} logEntry - 单个日志条目
   */
  bundleSingleLog(logEntry) {
    return this.bundleLogs([logEntry]);
  }

  /**
   * 验证日志批次完整性
   * @param {Buffer} bundledData - 打包后的数据
   * @param {string} expectedMerkleRoot - 预期的 Merkle Root
   */
  verifyBundle(bundledData, expectedMerkleRoot) {
    try {
      // 解压
      const decompressed = decompress(bundledData);
      const content = decompressed.toString('utf8');

      // 解析元数据和日志
      const parts = content.split('\n# LOGS\n');
      const metadataStr = parts[0].replace('# METADATA\n', '');
      const logsStr = parts[1];

      const metadata = JSON.parse(metadataStr);
      const logLines = logsStr.trim().split('\n');

      // 重新计算 Merkle Root
      const logHashes = logLines.map((line) => hashData(line));
      const computedMerkleRoot = computeMerkleRoot(logHashes);

      const isValid = computedMerkleRoot === expectedMerkleRoot;

      logger.info('Bundle verification', {
        valid: isValid,
        expected: expectedMerkleRoot.slice(0, 16) + '...',
        computed: computedMerkleRoot.slice(0, 16) + '...',
      });

      return {
        valid: isValid,
        metadata,
        logCount: logLines.length,
        computedMerkleRoot,
      };
    } catch (error) {
      logger.error('Bundle verification failed', { error: error.message });
      return {
        valid: false,
        error: error.message,
      };
    }
  }
}

// 单例导出
let bundlerInstance = null;

export function getBundler() {
  if (!bundlerInstance) {
    bundlerInstance = new Bundler();
  }
  return bundlerInstance;
}

export function resetBundler() {
  bundlerInstance = null;
}

export default Bundler;
