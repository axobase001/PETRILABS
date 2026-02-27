/**
 * Secure Key Manager Tests
 * 
 * 测试覆盖：
 * 1. 从环境变量加载
 * 2. 从 .env 文件加载
 * 3. 格式验证
 * 4. 安全删除
 * 5. 错误处理
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Wallet } from 'ethers';
import { 
  SecureKeyManager, 
  SecurityError,
  KeyLoadResult 
} from '../secure-key-manager';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('SecureKeyManager', () => {
  const TEST_PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const TEST_ADDRESS = new Wallet(TEST_PRIVATE_KEY).address;
  const ENV_PATH = path.join(process.cwd(), '.env');

  // 保存原始环境变量
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.PRIVATE_KEY;
    
    // 清理 .env 文件
    if (fs.existsSync(ENV_PATH)) {
      fs.unlinkSync(ENV_PATH);
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    
    // 清理 .env 文件
    if (fs.existsSync(ENV_PATH)) {
      fs.unlinkSync(ENV_PATH);
    }
  });

  describe('isValidPrivateKey', () => {
    it('should accept valid private key format', () => {
      expect(SecureKeyManager.isValidPrivateKey(TEST_PRIVATE_KEY)).toBe(true);
    });

    it('should reject keys without 0x prefix', () => {
      const keyWithoutPrefix = TEST_PRIVATE_KEY.slice(2);
      expect(SecureKeyManager.isValidPrivateKey(keyWithoutPrefix)).toBe(false);
    });

    it('should reject keys with wrong length', () => {
      const shortKey = '0x1234';
      expect(SecureKeyManager.isValidPrivateKey(shortKey)).toBe(false);
    });

    it('should reject keys with non-hex characters', () => {
      const invalidKey = '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG';
      expect(SecureKeyManager.isValidPrivateKey(invalidKey)).toBe(false);
    });

    it('should reject empty or null keys', () => {
      expect(SecureKeyManager.isValidPrivateKey('')).toBe(false);
      expect(SecureKeyManager.isValidPrivateKey(null as any)).toBe(false);
      expect(SecureKeyManager.isValidPrivateKey(undefined as any)).toBe(false);
    });
  });

  describe('loadFromEnv', () => {
    it('should load private key from environment variable', () => {
      process.env.PRIVATE_KEY = TEST_PRIVATE_KEY;

      const result = SecureKeyManager.loadPrivateKey();

      expect(result.privateKey).toBe(TEST_PRIVATE_KEY);
      expect(result.address).toBe(TEST_ADDRESS);
      expect(result.source).toBe('env');
    });

    it('should clear PRIVATE_KEY from environment after loading', () => {
      process.env.PRIVATE_KEY = TEST_PRIVATE_KEY;

      SecureKeyManager.loadPrivateKey();

      expect(process.env.PRIVATE_KEY).toBeUndefined();
    });

    it('should throw SecurityError for invalid key format in env', () => {
      process.env.PRIVATE_KEY = 'invalid-key';

      expect(() => SecureKeyManager.loadPrivateKey()).toThrow(SecurityError);
    });

    it('should verify address if expected address provided', () => {
      process.env.PRIVATE_KEY = TEST_PRIVATE_KEY;

      const result = SecureKeyManager.loadPrivateKey(TEST_ADDRESS);

      expect(result.address).toBe(TEST_ADDRESS);
    });

    it('should throw SecurityError if address mismatch', () => {
      process.env.PRIVATE_KEY = TEST_PRIVATE_KEY;
      const wrongAddress = '0x0000000000000000000000000000000000000000';

      expect(() => SecureKeyManager.loadPrivateKey(wrongAddress)).toThrow(SecurityError);
    });
  });

  describe('loadFromFile', () => {
    it('should load private key from .env file', () => {
      fs.writeFileSync(ENV_PATH, `PRIVATE_KEY=${TEST_PRIVATE_KEY}`);

      const result = SecureKeyManager.loadPrivateKey();

      expect(result.privateKey).toBe(TEST_PRIVATE_KEY);
      expect(result.address).toBe(TEST_ADDRESS);
      expect(result.source).toBe('file');
    });

    it('should securely delete .env file after loading', () => {
      fs.writeFileSync(ENV_PATH, `PRIVATE_KEY=${TEST_PRIVATE_KEY}`);

      SecureKeyManager.loadPrivateKey();

      expect(fs.existsSync(ENV_PATH)).toBe(false);
    });

    it('should throw SecurityError if PRIVATE_KEY not found in file', () => {
      fs.writeFileSync(ENV_PATH, 'OTHER_VAR=value');

      expect(() => SecureKeyManager.loadPrivateKey()).toThrow(SecurityError);
    });

    it('should throw SecurityError for invalid key format in file', () => {
      fs.writeFileSync(ENV_PATH, 'PRIVATE_KEY=invalid-key');

      expect(() => SecureKeyManager.loadPrivateKey()).toThrow(SecurityError);
    });

    it('should delete file even if validation fails', () => {
      fs.writeFileSync(ENV_PATH, 'PRIVATE_KEY=invalid-key');

      try {
        SecureKeyManager.loadPrivateKey();
      } catch (e) {
        // Expected
      }

      expect(fs.existsSync(ENV_PATH)).toBe(false);
    });
  });

  describe('priority order', () => {
    it('should prefer environment variable over .env file', () => {
      const envKey = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const fileKey = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      
      process.env.PRIVATE_KEY = envKey;
      fs.writeFileSync(ENV_PATH, `PRIVATE_KEY=${fileKey}`);

      const result = SecureKeyManager.loadPrivateKey();

      expect(result.privateKey).toBe(envKey);
      // .env file should still exist because env took priority
      expect(fs.existsSync(ENV_PATH)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw SecurityError when no key source available', () => {
      expect(() => SecureKeyManager.loadPrivateKey()).toThrow(SecurityError);
      expect(() => SecureKeyManager.loadPrivateKey()).toThrow(/PRIVATE_KEY not found/);
    });

    it('should sanitize sensitive data from error messages', () => {
      process.env.PRIVATE_KEY = TEST_PRIVATE_KEY;
      const wrongAddress = '0x1111111111111111111111111111111111111111';

      try {
        SecureKeyManager.loadPrivateKey(wrongAddress);
      } catch (error: any) {
        // Error message should not contain the actual private key
        expect(error.message).not.toContain(TEST_PRIVATE_KEY.slice(2));
        // But should contain the address
        expect(error.message).toContain(wrongAddress);
      }
    });
  });

  describe('SecurityError', () => {
    it('should redact private keys in error messages', () => {
      const error = new SecurityError(`Invalid key: ${TEST_PRIVATE_KEY}`);
      expect(error.message).not.toContain(TEST_PRIVATE_KEY);
      expect(error.message).toContain('[REDACTED_KEY]');
    });

    it('should redact addresses in error messages', () => {
      const error = new SecurityError(`Address ${TEST_ADDRESS} not found`);
      expect(error.message).not.toContain(TEST_ADDRESS);
      expect(error.message).toContain('[REDACTED_ADDRESS]');
    });
  });

  describe('edge cases', () => {
    it('should handle .env file with multiple lines', () => {
      const envContent = `
OTHER_VAR=value
PRIVATE_KEY=${TEST_PRIVATE_KEY}
ANOTHER_VAR=value2
      `.trim();
      fs.writeFileSync(ENV_PATH, envContent);

      const result = SecureKeyManager.loadPrivateKey();

      expect(result.privateKey).toBe(TEST_PRIVATE_KEY);
      expect(fs.existsSync(ENV_PATH)).toBe(false);
    });

    it('should handle .env file with Windows line endings', () => {
      fs.writeFileSync(ENV_PATH, `OTHER=value\r\nPRIVATE_KEY=${TEST_PRIVATE_KEY}\r\nANOTHER=value`);

      const result = SecureKeyManager.loadPrivateKey();

      expect(result.privateKey).toBe(TEST_PRIVATE_KEY);
    });

    it('should handle empty .env file', () => {
      fs.writeFileSync(ENV_PATH, '');

      expect(() => SecureKeyManager.loadPrivateKey()).toThrow(SecurityError);
    });

    it('should handle non-existent .env file gracefully', () => {
      expect(fs.existsSync(ENV_PATH)).toBe(false);
      
      expect(() => SecureKeyManager.loadPrivateKey()).toThrow(SecurityError);
    });
  });
});

// Integration test for complete startup flow
describe('Integration: Complete Startup Flow', () => {
  const TEST_PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const TEST_ADDRESS = new Wallet(TEST_PRIVATE_KEY).address;
  const ENV_PATH = path.join(process.cwd(), '.env');

  beforeEach(() => {
    delete process.env.PRIVATE_KEY;
    if (fs.existsSync(ENV_PATH)) {
      fs.unlinkSync(ENV_PATH);
    }
  });

  afterEach(() => {
    if (fs.existsSync(ENV_PATH)) {
      fs.unlinkSync(ENV_PATH);
    }
  });

  it('should complete full startup flow with env variable', () => {
    // Simulate deployment environment
    process.env.PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.AGENT_ADDRESS = TEST_ADDRESS;

    // Load key
    const result = SecureKeyManager.loadPrivateKey(TEST_ADDRESS);

    // Verify
    expect(result.privateKey).toBe(TEST_PRIVATE_KEY);
    expect(result.address).toBe(TEST_ADDRESS);
    expect(result.source).toBe('env');

    // Verify environment is cleared
    expect(process.env.PRIVATE_KEY).toBeUndefined();

    // Verify can create Wallet
    const wallet = new Wallet(result.privateKey);
    expect(wallet.address).toBe(TEST_ADDRESS);
  });

  it('should complete full startup flow with .env file', () => {
    // Simulate local development
    fs.writeFileSync(ENV_PATH, `PRIVATE_KEY=${TEST_PRIVATE_KEY}`);
    process.env.AGENT_ADDRESS = TEST_ADDRESS;

    // Load key
    const result = SecureKeyManager.loadPrivateKey(TEST_ADDRESS);

    // Verify
    expect(result.privateKey).toBe(TEST_PRIVATE_KEY);
    expect(result.address).toBe(TEST_ADDRESS);
    expect(result.source).toBe('file');

    // Verify file is deleted
    expect(fs.existsSync(ENV_PATH)).toBe(false);

    // Verify can create Wallet
    const wallet = new Wallet(result.privateKey);
    expect(wallet.address).toBe(TEST_ADDRESS);
  });
});
