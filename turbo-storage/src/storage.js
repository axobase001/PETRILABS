/**
 * PetriStorage - Core Storage Class
 * 统一存储层，使用 Turbo SDK + x402 协议
 * 
 * 功能:
 * - 单例模式
 * - 内存缓冲 + 定时刷盘
 * - Genesis 一次性上传
 * - 日志追加式写入
 */

import { getStorageConfig, getAgentConfig, getDevConfig } from './config.js';
import { getTurboClient } from './turbo-client.js';
import { getBundler } from './bundler.js';
import { getX402Client } from './x402.js';
import { createLogger } from './logger.js';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

const logger = createLogger('storage');

export class PetriStorage {
  constructor() {
    this.config = getStorageConfig();
    this.agentConfig = getAgentConfig();
    this.devConfig = getDevConfig();

    this.turboClient = null;
    this.bundler = getBundler();
    this.x402Client = getX402Client();

    // 内存缓冲区
    this.buffer = [];
    this.bufferSize = 0;
    this.genesisUploaded = false;
    this.genesisTxId = null;

    // 刷盘定时器
    this.flushTimer = null;

    // 本地缓存 (用于开发/恢复)
    this.cacheDir = this.devConfig.cacheDir;
    this.ensureCacheDir();

    // 加载状态
    this.loadState();

    // 启动定时刷盘
    this.startFlushTimer();

    logger.info('PetriStorage initialized', {
      agentId: this.agentConfig.id,
      sessionId: this.agentConfig.sessionId,
      bufferSize: this.config.bufferSize,
      flushInterval: this.config.flushInterval,
    });
  }

  /**
   * 确保缓存目录存在
   */
  ensureCacheDir() {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
      logger.debug('Cache directory created', { path: this.cacheDir });
    }
  }

  /**
   * 加载本地状态
   */
  loadState() {
    try {
      const statePath = join(this.cacheDir, 'storage-state.json');
      if (existsSync(statePath)) {
        const state = JSON.parse(readFileSync(statePath, 'utf8'));
        this.genesisTxId = state.genesisTxId || null;
        this.genesisUploaded = !!this.genesisTxId;
        logger.info('Loaded storage state', { genesisTxId: this.genesisTxId });
      }
    } catch (error) {
      logger.warn('Failed to load storage state', { error: error.message });
    }
  }

  /**
   * 保存本地状态
   */
  saveState() {
    try {
      const statePath = join(this.cacheDir, 'storage-state.json');
      const state = {
        agentId: this.agentConfig.id,
        sessionId: this.agentConfig.sessionId,
        genesisTxId: this.genesisTxId,
        lastUpdated: new Date().toISOString(),
      };
      writeFileSync(statePath, JSON.stringify(state, null, 2));
    } catch (error) {
      logger.warn('Failed to save storage state', { error: error.message });
    }
  }

  /**
   * 初始化 Turbo 客户端
   */
  async initialize() {
    if (this.turboClient) {
      return;
    }
    this.turboClient = await getTurboClient();
    logger.info('Turbo client ready');
  }

  /**
   * 检查 USDC 余额
   */
  async checkBalance() {
    try {
      const balance = await this.x402Client.getBalance();
      logger.info('USDC Balance', {
        address: this.x402Client.getAddress(),
        balance: balance.formatted,
      });
      return balance;
    } catch (error) {
      logger.error('Failed to check balance', { error: error.message });
      throw error;
    }
  }

  /**
   * 上传 Genesis 数据 (一次性)
   * @param {Object} genomeData - 基因组数据
   */
  async uploadGenesis(genomeData) {
    try {
      if (this.genesisUploaded) {
        logger.warn('Genesis already uploaded', { txId: this.genesisTxId });
        return {
          success: false,
          error: 'Genesis already uploaded',
          txId: this.genesisTxId,
        };
      }

      await this.initialize();

      // 检查余额
      const balance = await this.checkBalance();
      if (parseFloat(balance.formatted) < 1) {
        throw new Error('Insufficient USDC balance for genesis upload');
      }

      logger.info('Uploading genesis data...');

      // 打包数据
      const bundle = this.bundler.bundleGenesis(genomeData);

      // 上传
      const result = await this.turboClient.uploadBuffer(bundle.data, bundle.tags);

      // 保存状态
      this.genesisTxId = result.id;
      this.genesisUploaded = true;
      this.saveState();

      logger.info('Genesis uploaded successfully', {
        txId: result.id,
        url: result.url,
      });

      return {
        success: true,
        txId: result.id,
        url: result.url,
        size: bundle.compressedSize,
        contentHash: bundle.contentHash,
      };
    } catch (error) {
      logger.error('Failed to upload genesis', { error: error.message });
      throw error;
    }
  }

  /**
   * 追加日志条目
   * @param {Object} logEntry - 日志条目
   */
  appendLog(logEntry) {
    // 标准化日志条目
    const entry = {
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      agentId: this.agentConfig.id,
      sessionId: this.agentConfig.sessionId,
      ...logEntry,
    };

    this.buffer.push(entry);
    this.bufferSize++;

    logger.debug('Log appended to buffer', {
      bufferSize: this.bufferSize,
      type: logEntry.type || 'unknown',
    });

    // 检查是否需要刷盘
    if (this.bufferSize >= this.config.bufferSize) {
      logger.info('Buffer size threshold reached, triggering flush');
      this.flush().catch((err) => {
        logger.error('Auto-flush failed', { error: err.message });
      });
    }

    return entry;
  }

  /**
   * 刷盘：将缓冲区数据上传到 Arweave
   */
  async flush() {
    try {
      if (this.buffer.length === 0) {
        logger.debug('Flush skipped: empty buffer');
        return null;
      }

      await this.initialize();

      const logsToFlush = [...this.buffer];
      logger.info('Flushing logs...', { count: logsToFlush.length });

      // 打包数据
      const bundle = this.bundler.bundleLogs(logsToFlush);

      // 检查余额
      const balance = await this.checkBalance();
      if (parseFloat(balance.formatted) < 0.1) {
        throw new Error('Insufficient USDC balance for log upload');
      }

      // 上传
      const result = await this.turboClient.uploadBuffer(bundle.data, bundle.tags);

      // 清空缓冲区
      this.buffer = [];
      this.bufferSize = 0;

      // 保存本地缓存 (开发模式)
      if (this.devConfig.testMode) {
        const cachePath = join(this.cacheDir, `flush-${Date.now()}.json`);
        writeFileSync(cachePath, JSON.stringify({
          txId: result.id,
          logs: logsToFlush,
          merkleRoot: bundle.merkleRoot,
        }, null, 2));
      }

      logger.info('Logs flushed successfully', {
        txId: result.id,
        count: bundle.logCount,
        url: result.url,
      });

      return {
        success: true,
        txId: result.id,
        url: result.url,
        count: bundle.logCount,
        merkleRoot: bundle.merkleRoot,
        size: bundle.compressedSize,
      };
    } catch (error) {
      logger.error('Flush failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 启动定时刷盘器
   */
  startFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        logger.info('Scheduled flush triggered');
        this.flush().catch((err) => {
          logger.error('Scheduled flush failed', { error: err.message });
        });
      }
    }, this.config.flushInterval);

    logger.debug('Flush timer started', { interval: this.config.flushInterval });
  }

  /**
   * 停止定时刷盘器
   */
  stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
      logger.debug('Flush timer stopped');
    }
  }

  /**
   * 获取缓冲区状态
   */
  getBufferStatus() {
    return {
      size: this.bufferSize,
      maxSize: this.config.bufferSize,
      isFull: this.bufferSize >= this.config.bufferSize,
      genesisUploaded: this.genesisUploaded,
      genesisTxId: this.genesisTxId,
    };
  }

  /**
   * 获取存储统计
   */
  async getStats() {
    const balance = await this.x402Client.getBalance();
    return {
      agentId: this.agentConfig.id,
      sessionId: this.agentConfig.sessionId,
      genesis: {
        uploaded: this.genesisUploaded,
        txId: this.genesisTxId,
      },
      buffer: this.getBufferStatus(),
      balance: {
        address: this.x402Client.getAddress(),
        usdc: balance.formatted,
      },
    };
  }

  /**
   * 优雅关闭
   */
  async shutdown() {
    logger.info('Shutting down PetriStorage...');
    this.stopFlushTimer();

    // 最后一次刷盘
    if (this.buffer.length > 0) {
      try {
        await this.flush();
      } catch (error) {
        logger.error('Final flush failed', { error: error.message });
      }
    }

    this.saveState();
    logger.info('PetriStorage shutdown complete');
  }
}

// 单例导出
let storageInstance = null;

export function getPetriStorage() {
  if (!storageInstance) {
    storageInstance = new PetriStorage();
  }
  return storageInstance;
}

export function resetPetriStorage() {
  if (storageInstance) {
    storageInstance.shutdown();
  }
  storageInstance = null;
}

export default PetriStorage;
