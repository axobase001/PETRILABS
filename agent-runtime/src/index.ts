/**
 * ClawBot Agent Runtime Entry Point
 * 
 * 安全启动流程（野放原则）:
 * 1. 从环境变量或 .env 文件加载私钥（一次性）
 * 2. 加载后立即清除环境变量，私钥仅存内存
 * 3. 可选：.env 文件安全删除（覆写+unlink）
 * 4. 启动自主运行，无需外部 Vault 依赖
 * 
 * 安全原则：
 * - 无外部密钥管理服务依赖
 * - 私钥不落地磁盘（或启动后立即删除）
 * - 容器重启 = 新实例（无法恢复旧私钥）
 */

import { ClawBot } from './core/clawbot';
import { SecureKeyManager, SecurityError } from './services/secure-key-manager';
import { logger } from './utils/logger';

// Required environment variables（移除 VAULT_RETRIEVAL_URL）
const REQUIRED_ENV = [
  'AGENT_ADDRESS',  // 用于验证加载的私钥是否匹配
  'GENOME_HASH',
  'LLM_API_KEY',
  // 'PRIVATE_KEY' 会在运行时加载，然后从环境清除
];

// 可选但有用的环境变量
const OPTIONAL_ENV = [
  'RPC_URL',                    // 默认为 Base Sepolia
  'CHAIN_ID',                   // 默认为 84532
  'GENOME_REGISTRY_ADDRESS',    // 基因组注册表合约
  'PETRI_AGENT_V2_ADDRESS',     // Agent 合约地址
  'HEARTBEAT_INTERVAL_MS',      // 心跳间隔
  'DECISION_INTERVAL_MS',       // 决策间隔
  'LLM_MODEL',                  // LLM 模型选择
];

/**
 * 验证环境变量
 */
function validateEnv(): void {
  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    logger.error('Missing required environment variables:', missing);
    logger.error('This agent cannot start without proper configuration.');
    process.exit(1);
  }

  // 记录可选配置
  const presentOptional = OPTIONAL_ENV.filter(key => process.env[key]);
  if (presentOptional.length > 0) {
    logger.info('Optional configuration detected:', presentOptional);
  }
}

/**
 * 优雅关闭处理
 */
async function gracefulShutdown(agent: ClawBot, signal: string): Promise<void> {
  logger.info(`${signal} received, initiating graceful shutdown...`);
  
  try {
    await agent.stop();
    logger.info('✅ Agent stopped gracefully');
  } catch (error) {
    logger.error('Error during shutdown', { error });
  }
  
  process.exit(0);
}

/**
 * 安全启动
 */
async function secureStartup() {
  let privateKey: string | undefined;

  try {
    validateEnv();
    
    logger.info('🔐 Starting secure agent initialization (Vault-less mode)...');
    logger.info('📝 Security: Private key will be loaded and immediately cleared from environment');

    // Step 1: 从环境变量或 .env 文件加载私钥
    const keyResult = SecureKeyManager.loadPrivateKey(process.env.AGENT_ADDRESS);
    privateKey = keyResult.privateKey;

    logger.info('✅ Private key loaded and secured in memory only');
    logger.info(`📍 Agent address: ${keyResult.address}`);
    logger.info(`🔑 Key source: ${keyResult.source}`);

    // Step 2: 加载配置
    const config = {
      agentAddress: keyResult.address,
      genomeHash: process.env.GENOME_HASH!,
      privateKey: privateKey, // Only in memory, will be cleared on shutdown
      rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
      chainId: parseInt(process.env.CHAIN_ID || '84532'),
      contracts: {
        genomeRegistry: process.env.GENOME_REGISTRY_ADDRESS || '',
        petriAgent: process.env.PETRI_AGENT_V2_ADDRESS || '',
      },
      llm: {
        apiKey: process.env.LLM_API_KEY!,
        model: process.env.LLM_MODEL || 'claude-3-sonnet-20240229',
      },
      intervals: {
        heartbeat: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '21600000'), // 6 hours
        decision: parseInt(process.env.DECISION_INTERVAL_MS || '3600000'),    // 1 hour
      },
    };

    // Step 3: 创建并启动 Agent
    const agent = new ClawBot(config);

    // 处理优雅关闭
    process.on('SIGTERM', () => gracefulShutdown(agent, 'SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown(agent, 'SIGINT'));

    // 安全：阻止核心转储
    process.on('SIGQUIT', () => {
      logger.info('SIGQUIT ignored (security)');
    });

    // 启动 Agent
    await agent.start();

    logger.info('✨ Agent is running autonomously');
    logger.info('💡 This agent is "wild released" - no external dependencies');
    logger.info('💡 The private key only exists in this process memory');
    logger.info('💡 Container restart = new identity (old key lost forever)');

    // Step 4: 尝试清除本地 privateKey 变量（尽力而为）
    privateKey = '0'.repeat(66);
    // @ts-ignore - 尝试帮助 GC
    config.privateKey = '0'.repeat(66);

  } catch (error) {
    if (error instanceof SecurityError) {
      logger.error('Security error during startup', { 
        message: error.message,
        name: error.name 
      });
    } else {
      logger.error('Fatal error during secure startup', { error });
    }
    
    // 确保清除敏感数据
    if (privateKey) {
      privateKey = '0'.repeat(66);
    }
    
    process.exit(1);
  }
}

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// Run startup
secureStartup();
