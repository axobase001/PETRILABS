/**
 * Turbo SDK Client Wrapper
 * 封装 Turbo 上传 SDK，集成 x402 支付协议
 * 
 * Turbo SDK 自动处理 x402 握手流程，这里我们主要做:
 * 1. 配置 Turbo 客户端
 * 2. 提供便捷的上传方法
 * 3. 错误处理和重试
 */

import { TurboFactory } from '@ardrive/turbo-sdk';
import { getTurboConfig, getX402Config } from './config.js';
import { getX402Client } from './x402.js';
import { createLogger } from './logger.js';

const logger = createLogger('turbo-client');

export class TurboClient {
  constructor() {
    this.config = getTurboConfig();
    this.x402Config = getX402Config();
    this.x402Client = getX402Client();
    this.turbo = null;
    this.initialized = false;
  }

  /**
   * 初始化 Turbo 客户端
   * 使用 x402 签名器进行身份验证
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      logger.info('Initializing Turbo client...');

      // 创建 x402 签名器适配器
      const signer = {
        publicKey: Buffer.from(this.x402Client.wallet.signingKey.publicKey.slice(2), 'hex'),
        sign: async (data) => {
          const signature = await this.x402Client.wallet.signMessage(data);
          return Buffer.from(signature.slice(2), 'hex');
        },
      };

      // 初始化 Turbo 客户端
      this.turbo = TurboFactory.authenticated({
        privateKey: this.x402Config.privateKey.slice(2), // 移除 0x 前缀
        gatewayUrl: this.config.uploadUrl,
      });

      // 或者使用自定义签名器 (如果使用 x402 方式)
      // this.turbo = TurboFactory.authenticated({
      //   signer,
      //   gatewayUrl: this.config.uploadUrl,
      // });

      this.initialized = true;
      logger.info('Turbo client initialized', {
        uploadUrl: this.config.uploadUrl,
        address: this.x402Client.getAddress(),
      });
    } catch (error) {
      logger.error('Failed to initialize Turbo client', { error: error.message });
      throw error;
    }
  }

  /**
   * 检查 Turbo 服务状态
   */
  async healthCheck() {
    try {
      await this.initialize();
      // 简单检查：获取价格信息
      const rates = await this.turbo.getTurboRates();
      return {
        status: 'healthy',
        rates,
      };
    } catch (error) {
      logger.error('Turbo health check failed', { error: error.message });
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  /**
   * 获取上传价格估算
   * @param {number} byteCount - 数据字节数
   */
  async getUploadCost(byteCount) {
    try {
      await this.initialize();
      const cost = await this.turbo.getUploadCosts({
        bytes: [byteCount],
      });
      return cost;
    } catch (error) {
      logger.error('Failed to get upload cost', { error: error.message, byteCount });
      throw error;
    }
  }

  /**
   * 上传文件到 Arweave (通过 Turbo)
   * @param {Buffer} data - 文件数据
   * @param {Object} metadata - 文件元数据
   * @param {Array} tags - Arweave 标签数组
   */
  async uploadFile(data, metadata = {}, tags = []) {
    try {
      await this.initialize();

      logger.info('Uploading file to Turbo', {
        size: data.length,
        tagsCount: tags.length,
      });

      // 准备文件对象
      const file = {
        data,
        tags,
        metadata,
      };

      // 执行上传
      const result = await this.turbo.uploadFile(file);

      logger.info('File uploaded successfully', {
        id: result.id,
        owner: result.owner,
        dataCaches: result.dataCaches,
      });

      return {
        id: result.id,
        owner: result.owner,
        timestamp: Date.now(),
        url: `https://arweave.net/${result.id}`,
        dataCaches: result.dataCaches,
        fastFinalityIndexes: result.fastFinalityIndexes,
      };
    } catch (error) {
      logger.error('Failed to upload file', { error: error.message, size: data.length });
      throw error;
    }
  }

  /**
   * 上传 Buffer 数据 (简化方法)
   * @param {Buffer} buffer - 数据缓冲
   * @param {Array} tags - 标签数组
   */
  async uploadBuffer(buffer, tags = []) {
    return this.uploadFile(buffer, {}, tags);
  }

  /**
   * 获取上传状态
   * @param {string} txId - 交易 ID
   */
  async getUploadStatus(txId) {
    try {
      // 查询 Arweave 网关
      const response = await fetch(`https://arweave.net/${txId}`);
      return {
        id: txId,
        status: response.status === 200 ? 'confirmed' : 'pending',
        url: `https://arweave.net/${txId}`,
      };
    } catch (error) {
      logger.error('Failed to get upload status', { error: error.message, txId });
      return {
        id: txId,
        status: 'unknown',
        error: error.message,
      };
    }
  }
}

// 单例导出
let turboClientInstance = null;

export async function getTurboClient() {
  if (!turboClientInstance) {
    turboClientInstance = new TurboClient();
    await turboClientInstance.initialize();
  }
  return turboClientInstance;
}

export function resetTurboClient() {
  turboClientInstance = null;
}

export default TurboClient;
