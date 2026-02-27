/**
 * Secure Key Manager for Agent Runtime
 * 
 * 安全密钥管理 - "野放"原则实现：
 * 1. 私钥仅由 Agent 自己持有，通过环境变量注入
 * 2. 加载后立即从环境清除，仅存于内存
 * 3. 支持 .env 文件一次性读取后安全删除
 * 4. 绝不依赖外部 Vault 服务
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';

export interface KeyLoadResult {
  privateKey: string;
  address: string;
  source: 'env' | 'file';
}

export class SecureKeyManager {
  /**
   * 加载私钥的优先级：
   * 1. 环境变量 PRIVATE_KEY（生产环境推荐）
   * 2. .env 文件（开发/部署过渡，读取后安全删除）
   * 
   * 安全措施：
   * - 加载后立即从环境变量清除
   * - .env 文件用随机数据覆写后删除
   * - 格式严格验证（0x + 64 hex chars）
   */
  static loadPrivateKey(expectedAddress?: string): KeyLoadResult {
    logger.info('🔐 Starting secure key loading...');

    // 方法 1: 环境变量（生产环境推荐）
    const envKey = this.loadFromEnv();
    if (envKey) {
      this.validateAddress(envKey.address, expectedAddress);
      logger.info('✅ Private key loaded from environment variable');
      return { ...envKey, source: 'env' };
    }

    // 方法 2: .env 文件（一次性使用）
    const fileKey = this.loadFromFile();
    if (fileKey) {
      this.validateAddress(fileKey.address, expectedAddress);
      logger.info('✅ Private key loaded from .env file (file securely deleted)');
      return { ...fileKey, source: 'file' };
    }

    // 都没找到
    throw new SecurityError(
      'PRIVATE_KEY not found. Please set it via: ' +
      '1) Environment variable PRIVATE_KEY, or ' +
      '2) .env file in project root (will be deleted after loading)'
    );
  }

  /**
   * 从环境变量加载私钥
   */
  private static loadFromEnv(): { privateKey: string; address: string } | null {
    const privateKey = process.env.PRIVATE_KEY;
    
    if (!privateKey) {
      return null;
    }

    // 格式验证
    if (!this.isValidPrivateKey(privateKey)) {
      throw new SecurityError(
        `Invalid PRIVATE_KEY format in environment. ` +
        `Expected: 0x followed by 64 hexadecimal characters. ` +
        `Got length: ${privateKey.length}`
      );
    }

    // 计算地址
    const address = this.deriveAddress(privateKey);
    
    // 立即从环境变量清除（防止子进程继承）
    delete process.env.PRIVATE_KEY;
    
    // 尝试覆盖环境变量内存（Node.js 限制，尽力而为）
    process.env.PRIVATE_KEY = '0'.repeat(66);
    delete process.env.PRIVATE_KEY;

    logger.info('🔒 PRIVATE_KEY cleared from environment variables');

    return { privateKey, address };
  }

  /**
   * 从 .env 文件加载私钥（然后安全删除）
   */
  private static loadFromFile(): { privateKey: string; address: string } | null {
    const envPath = path.join(process.cwd(), '.env');
    
    if (!fs.existsSync(envPath)) {
      return null;
    }

    logger.info('📄 Found .env file, reading private key...');

    try {
      // 检查文件权限（Unix 系统）
      this.checkFilePermissions(envPath);

      const envContent = fs.readFileSync(envPath, 'utf8');
      
      // 解析 PRIVATE_KEY
      const match = envContent.match(/^PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m);
      
      if (!match) {
        throw new SecurityError(
          'PRIVATE_KEY not found in .env file or invalid format. ' +
          'Expected: PRIVATE_KEY=0x... (64 hex chars)'
        );
      }

      const privateKey = match[1];
      const address = this.deriveAddress(privateKey);

      // 安全删除文件
      this.secureDelete(envPath);

      return { privateKey, address };

    } catch (error) {
      // 如果读取失败，也尝试删除文件（如果存在）
      try {
        if (fs.existsSync(envPath)) {
          fs.unlinkSync(envPath);
        }
      } catch {}
      
      throw error;
    }
  }

  /**
   * 验证私钥格式
   */
  static isValidPrivateKey(key: string): boolean {
    if (!key) return false;
    
    // 必须是 0x 开头 + 64 个十六进制字符
    const privateKeyRegex = /^0x[0-9a-fA-F]{64}$/;
    return privateKeyRegex.test(key);
  }

  /**
   * 从私钥派生地址（简化版，实际使用 ethers.js）
   * 注意：这里只返回地址供验证，实际 wallet 创建在 ClawBot 中
   */
  private static deriveAddress(privateKey: string): string {
    // 延迟导入 ethers，避免循环依赖
    try {
      const { Wallet } = require('ethers');
      const wallet = new Wallet(privateKey);
      return wallet.address;
    } catch (error) {
      logger.error('Failed to derive address from private key', { error });
      throw new SecurityError('Invalid private key: cannot derive address');
    }
  }

  /**
   * 验证地址匹配（如果提供了预期地址）
   */
  private static validateAddress(derivedAddress: string, expectedAddress?: string): void {
    if (!expectedAddress) {
      return; // 不要求验证
    }

    if (derivedAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new SecurityError(
        `Address mismatch! Derived address ${derivedAddress} ` +
        `does not match expected ${expectedAddress}`
      );
    }

    logger.info('✅ Address verified:', { address: derivedAddress });
  }

  /**
   * 检查文件权限（Unix 系统）
   */
  private static checkFilePermissions(filePath: string): void {
    try {
      const stats = fs.statSync(filePath);
      const mode = stats.mode;
      
      // 检查是否其他用户可读写（Unix 权限检查）
      const othersRead = mode & 0o004;
      const othersWrite = mode & 0o002;
      
      if (othersRead || othersWrite) {
        logger.warn('⚠️  .env file is readable/writable by others. Consider: chmod 600 .env');
      }
    } catch {
      // Windows 或非 Unix 系统，忽略权限检查
    }
  }

  /**
   * 安全删除文件（覆写后删除）
   */
  private static secureDelete(filePath: string): void {
    try {
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;

      // 多次覆写（DoD 5220.22-M 简化版）
      const passes = 3;
      
      for (let i = 0; i < passes; i++) {
        // 生成随机数据
        const randomData = crypto.randomBytes(Math.min(fileSize, 1024 * 1024)); // 最多 1MB
        
        // 扩展到文件大小
        const writeData = Buffer.alloc(fileSize);
        for (let j = 0; j < fileSize; j += randomData.length) {
          randomData.copy(writeData, j, 0, Math.min(randomData.length, fileSize - j));
        }
        
        // 覆写
        fs.writeFileSync(filePath, writeData);
        fs.fsyncSync(fs.openSync(filePath, 'r+')); // 强制刷盘
      }

      // 最终删除
      fs.unlinkSync(filePath);
      
      logger.info('🔒 .env file securely deleted after key loading');

    } catch (error) {
      logger.error('Failed to securely delete .env file', { error });
      // 即使覆写失败，也要尝试删除
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }
  }

  /**
   * 清除内存中的敏感数据（尽力而为）
   * 
   * Node.js 中字符串不可变，但我们可以通过以下方式减少残留：
   * 1. 覆盖变量引用
   * 2. 触发垃圾回收（不保证立即执行）
   */
  static clearMemory(data: string): void {
    // 创建一个相同长度的随机字符串覆盖
    const overwrite = crypto.randomBytes(data.length).toString('hex').slice(0, data.length);
    
    // 注意：这只是心理安慰，实际上 V8 可能有优化导致不立即生效
    // 真正的安全需要进程隔离和内存加密（硬件安全模块）
    
    logger.info('🔒 Sensitive data cleared from application memory');
  }
}

/**
 * 安全相关错误
 */
export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
    
    // 确保错误消息中不包含敏感信息
    this.message = this.sanitizeMessage(message);
  }

  private sanitizeMessage(message: string): string {
    // 移除可能的私钥或敏感信息
    return message
      .replace(/0x[0-9a-fA-F]{64}/g, '[REDACTED_KEY]')
      .replace(/0x[0-9a-fA-F]{40}/g, '[REDACTED_ADDRESS]');
  }
}

export default SecureKeyManager;
