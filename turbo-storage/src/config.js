/**
 * PetriLabs Storage Configuration Module
 * 集中管理所有环境变量配置，提供类型安全的配置访问
 */

import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载 .env 文件
dotenvConfig({ path: join(__dirname, '..', '.env') });

// ============================================
// 配置 Schema 定义 (使用 Zod 进行验证)
// ============================================
const configSchema = z.object({
  // Turbo SDK
  turbo: z.object({
    uploadUrl: z.string().url().default('https://turbo.ardrive.io'),
  }),

  // x402 Payment
  x402: z.object({
    version: z.string().default('2'),
    token: z.string().default('base-usdc'),
    baseRpcUrl: z.string().url().default('https://mainnet.base.org'),
    privateKey: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid private key format'),
    usdcContract: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid USDC contract address'),
  }),

  // Storage
  storage: z.object({
    bufferSize: z.coerce.number().int().min(1).max(10000).default(1000),
    flushInterval: z.coerce.number().int().min(60000).default(21600000), // 6 hours
    compressionLevel: z.coerce.number().int().min(1).max(9).default(6),
    encryptionKey: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  }),

  // Agent Identity
  agent: z.object({
    id: z.string().min(1).default('unknown-agent'),
    sessionId: z.string().min(1).default(() => `session-${Date.now()}`),
  }),

  // Retry & Timeout
  retry: z.object({
    maxRetries: z.coerce.number().int().min(1).max(10).default(3),
    delay: z.coerce.number().int().min(1000).default(5000),
    timeout: z.coerce.number().int().min(10000).default(60000),
  }),

  // Logging
  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'pretty']).default('pretty'),
  }),

  // Development
  dev: z.object({
    testMode: z.coerce.boolean().default(false),
    cacheDir: z.string().default('./.cache'),
  }),
});

// ============================================
// 配置加载与验证
// ============================================
function loadConfig() {
  const rawConfig = {
    turbo: {
      uploadUrl: process.env.TURBO_UPLOAD_URL,
    },
    x402: {
      version: process.env.X402_VERSION,
      token: process.env.PAYMENT_TOKEN,
      baseRpcUrl: process.env.BASE_RPC_URL,
      privateKey: process.env.WALLET_PRIVATE_KEY,
      usdcContract: process.env.USDC_CONTRACT,
    },
    storage: {
      bufferSize: process.env.BUFFER_SIZE,
      flushInterval: process.env.FLUSH_INTERVAL,
      compressionLevel: process.env.COMPRESSION_LEVEL,
      encryptionKey: process.env.ENCRYPTION_KEY,
    },
    agent: {
      id: process.env.AGENT_ID,
      sessionId: process.env.SESSION_ID,
    },
    retry: {
      maxRetries: process.env.MAX_RETRIES,
      delay: process.env.RETRY_DELAY,
      timeout: process.env.REQUEST_TIMEOUT,
    },
    logging: {
      level: process.env.LOG_LEVEL,
      format: process.env.LOG_FORMAT,
    },
    dev: {
      testMode: process.env.TEST_MODE,
      cacheDir: process.env.CACHE_DIR,
    },
  };

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    console.error('❌ Configuration validation failed:');
    result.error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }

  return result.data;
}

// ============================================
// 导出配置单例
// ============================================
export const config = loadConfig();

// 便捷访问函数
export const getTurboConfig = () => config.turbo;
export const getX402Config = () => config.x402;
export const getStorageConfig = () => config.storage;
export const getAgentConfig = () => config.agent;
export const getRetryConfig = () => config.retry;
export const getLoggingConfig = () => config.logging;
export const getDevConfig = () => config.dev;

// 完整配置导出（用于调试）
export const getFullConfig = () => ({
  ...config,
  x402: {
    ...config.x402,
    privateKey: '[REDACTED]', // 隐藏敏感信息
  },
});

export default config;
