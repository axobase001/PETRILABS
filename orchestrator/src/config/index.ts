import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  blockchain: {
    rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
    privateKey: process.env.PRIVATE_KEY || '',
    contracts: {
      genomeRegistry: process.env.GENOME_REGISTRY_ADDRESS || '',
      petriFactoryV2: process.env.PETRI_FACTORY_V2_ADDRESS || '',
      usdc: process.env.USDC_ADDRESS || '',
    },
  },
  
  llm: {
    provider: process.env.LLM_PROVIDER || 'openrouter',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'anthropic/claude-3-opus-20240229',
  },
  
  arweave: {
    keyFile: process.env.ARWEAVE_KEY_FILE || 'arweave-key.json',
    gateway: process.env.ARWEAVE_GATEWAY || 'https://arweave.net',
  },
  
  akash: {
    mnemonic: process.env.AKASH_MNEMONIC || '',
    rpc: process.env.AKASH_RPC || 'https://rpc.akashnet.net:443',
  },
  
  agent: {
    maxMemoryFileSize: parseInt(process.env.MAX_MEMORY_FILE_SIZE || '10485760'), // 10MB
    defaultDepositUsdc: parseInt(process.env.DEFAULT_AGENT_DEPOSIT_USDC || '100'),
    platformFeeUsdc: parseInt(process.env.PLATFORM_FEE_USDC || '5'),
    heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '21600000'), // 6 hours
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

export function validateConfig(): void {
  const required = [
    'BLOCKCHAIN_PRIVATE_KEY',
    'LLM_API_KEY',
    'AKASH_MNEMONIC',
  ];
  
  const missing = required.filter(key => {
    const value = process.env[key];
    return !value || value === 'your_..._here';
  });
  
  if (missing.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
    console.warn('Some features may not work correctly.');
  }
}
