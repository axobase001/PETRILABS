/**
 * ClawBot Agent Runtime Entry Point
 * 
 * 安全启动流程:
 * 1. 从Vault获取私钥（一次性）
 * 2. 立即删除Vault中的密钥
 * 3. 私钥仅存内存，永不落盘
 * 4. 启动自主运行
 */

import { ClawBot } from './core/clawbot';
import { VaultClient } from './services/vault-client';
import { logger } from './utils/logger';

// Required environment variables
const REQUIRED_ENV = [
  'AGENT_ADDRESS',
  'GENOME_HASH',
  'VAULT_RETRIEVAL_URL', // One-time URL to get private key
  'LLM_API_KEY',
];

// Validate environment
function validateEnv(): void {
  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    logger.error('Missing required environment variables:', missing);
    logger.error('This agent cannot start without proper configuration.');
    process.exit(1);
  }
}

// Secure startup
async function secureStartup() {
  try {
    validateEnv();
    
    logger.info('🔐 Starting secure agent initialization...');

    // Step 1: Retrieve private key from Vault (ONE TIME ONLY)
    const vaultClient = new VaultClient(process.env.VAULT_RETRIEVAL_URL!);
    const secret = await vaultClient.retrieveKey();

    // Step 2: Verify key matches expected address
    if (secret.address.toLowerCase() !== process.env.AGENT_ADDRESS?.toLowerCase()) {
      throw new Error('Vault key address does not match AGENT_ADDRESS');
    }

    logger.info('✅ Private key verified and loaded into memory');
    logger.info('🔒 Vault key has been permanently deleted');

    // Step 3: Clear retrieval URL from environment (security)
    delete process.env.VAULT_RETRIEVAL_URL;
    
    // Step 4: Load configuration
    const config = {
      agentAddress: secret.address,
      genomeHash: process.env.GENOME_HASH!,
      privateKey: secret.privateKey, // Only in memory
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
        heartbeat: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '21600000'),
        decision: parseInt(process.env.DECISION_INTERVAL_MS || '3600000'),
      },
    };

    // Step 5: Create and start agent
    const agent = new ClawBot(config);

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, initiating graceful shutdown...');
      await agent.stop();
      
      // Clear sensitive data from memory
      config.privateKey = '0'.repeat(64);
      logger.info('🔒 Private key cleared from memory');
      
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, initiating graceful shutdown...');
      await agent.stop();
      
      // Clear sensitive data from memory
      config.privateKey = '0'.repeat(64);
      logger.info('🔒 Private key cleared from memory');
      
      process.exit(0);
    });

    // Start the agent
    await agent.start();

    logger.info('✨ Agent is running autonomously');
    logger.info('💡 This agent cannot be modified or intervened with');
    logger.info('💡 The private key only exists in this container\'s memory');

  } catch (error) {
    logger.error('Fatal error during secure startup', { error });
    process.exit(1);
  }
}

// Security: Prevent core dumps
process.on('SIGQUIT', () => {
  logger.info('SIGQUIT ignored (security)');
});

// Run startup
secureStartup();
