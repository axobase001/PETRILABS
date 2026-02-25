#!/usr/bin/env node
/**
 * PetriLabs Turbo Storage CLI
 * 命令行工具，提供:
 * - genesis: 上传创世数据
 * - stream: 实时日志流处理
 * - flush: 手动强制刷盘
 * - status: 查看存储状态
 */

import { Command } from 'commander';
import { readFileSync, existsSync, createReadStream } from 'fs';
import { createInterface } from 'readline';
import { getPetriStorage, resetPetriStorage } from './src/storage.js';
import { getX402Client } from './src/x402.js';
import { createLogger } from './src/logger.js';

const logger = createLogger('cli');
const program = new Command();

program
  .name('petri-storage')
  .description('PetriLabs Turbo Storage CLI - Upload AI agent data to Arweave via Turbo SDK + x402')
  .version('1.0.0');

// ============================================
// genesis 命令
// ============================================
program
  .command('genesis')
  .description('Upload genesis genome data to Arweave')
  .requiredOption('-f, --file <path>', 'Path to genome JSON file')
  .option('-a, --agent-id <id>', 'Override AGENT_ID from env')
  .option('--dry-run', 'Pack data without uploading')
  .action(async (options) => {
    try {
      // 验证文件
      if (!existsSync(options.file)) {
        console.error(`❌ File not found: ${options.file}`);
        process.exit(1);
      }

      console.log('📖 Reading genesis file...');
      const genomeData = JSON.parse(readFileSync(options.file, 'utf8'));
      console.log(`✅ Loaded genome data: ${JSON.stringify(genomeData).length} bytes`);

      if (options.dryRun) {
        console.log('🧪 Dry run mode - data packed but not uploaded');
        console.log('📦 Genesis data preview:');
        console.log(JSON.stringify(genomeData, null, 2));
        return;
      }

      // 检查余额
      console.log('💰 Checking USDC balance...');
      const x402 = getX402Client();
      const balance = await x402.getBalance();
      console.log(`💳 Balance: ${balance.formatted} USDC`);

      if (parseFloat(balance.formatted) < 1) {
        console.error('❌ Insufficient USDC balance. Minimum 1 USDC required.');
        process.exit(1);
      }

      // 上传
      console.log('🚀 Uploading genesis data...');
      const storage = getPetriStorage();
      if (options.agentId) {
        // 覆盖 agent ID (需要重新初始化)
        process.env.AGENT_ID = options.agentId;
        resetPetriStorage();
      }

      const result = await storage.uploadGenesis(genomeData);

      if (result.success) {
        console.log('\n✅ Genesis uploaded successfully!');
        console.log(`🔗 Arweave URL: ${result.url}`);
        console.log(`🆔 Transaction ID: ${result.txId}`);
        console.log(`📦 Size: ${result.size} bytes`);
        console.log(`🔐 Content Hash: ${result.contentHash}`);
      } else {
        console.error(`❌ Upload failed: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await getPetriStorage().shutdown();
    }
  });

// ============================================
// stream 命令
// ============================================
program
  .command('stream')
  .description('Stream logs from file or stdin to Arweave')
  .option('-s, --source <path>', 'Source file path (default: stdin)')
  .option('-a, --agent-id <id>', 'Override AGENT_ID from env')
  .option('--format <type>', 'Input format: json|jsonl|text', 'jsonl')
  .action(async (options) => {
    try {
      console.log('🔄 Starting log stream...');
      console.log(`📍 Agent ID: ${process.env.AGENT_ID || 'unknown'}`);
      console.log(`📄 Source: ${options.source || 'stdin'}`);
      console.log('Press Ctrl+C to stop\n');

      const storage = getPetriStorage();
      
      // 设置输入流
      const inputStream = options.source 
        ? createReadStream(options.source)
        : process.stdin;

      const rl = createInterface({
        input: inputStream,
        crlfDelay: Infinity,
      });

      let count = 0;

      rl.on('line', (line) => {
        try {
          if (!line.trim()) return;

          let logEntry;
          
          if (options.format === 'jsonl' || options.format === 'json') {
            logEntry = JSON.parse(line);
          } else {
            logEntry = { message: line, type: 'text' };
          }

          storage.appendLog(logEntry);
          count++;

          if (count % 100 === 0) {
            const status = storage.getBufferStatus();
            console.log(`📊 Buffered: ${status.size}/${status.maxSize} logs`);
          }
        } catch (error) {
          console.error(`⚠️  Failed to parse line: ${error.message}`);
        }
      });

      // 处理退出
      process.on('SIGINT', async () => {
        console.log('\n👋 Received SIGINT, flushing...');
        rl.close();
        
        const result = await storage.flush();
        if (result) {
          console.log(`✅ Flushed ${result.count} logs to ${result.url}`);
        }
        
        await storage.shutdown();
        process.exit(0);
      });

      rl.on('close', async () => {
        console.log('\n📁 Input stream closed');
        const result = await storage.flush();
        if (result) {
          console.log(`✅ Final flush: ${result.count} logs → ${result.url}`);
        }
        await storage.shutdown();
      });

    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// ============================================
// flush 命令
// ============================================
program
  .command('flush')
  .description('Manually flush buffered logs to Arweave')
  .action(async () => {
    try {
      console.log('🚽 Manually flushing buffer...');
      
      const storage = getPetriStorage();
      const status = storage.getBufferStatus();
      
      if (status.size === 0) {
        console.log('ℹ️  Buffer is empty, nothing to flush');
        return;
      }

      console.log(`📊 Current buffer: ${status.size} logs`);
      
      const result = await storage.flush();
      
      console.log('\n✅ Flush successful!');
      console.log(`🔗 Arweave URL: ${result.url}`);
      console.log(`🆔 Transaction ID: ${result.txId}`);
      console.log(`📝 Logs uploaded: ${result.count}`);
      console.log(`📦 Size: ${result.size} bytes`);
      console.log(`🔐 Merkle Root: ${result.merkleRoot}`);
    } catch (error) {
      console.error('❌ Flush failed:', error.message);
      process.exit(1);
    } finally {
      await getPetriStorage().shutdown();
    }
  });

// ============================================
// status 命令
// ============================================
program
  .command('status')
  .description('Show storage status and balance')
  .action(async () => {
    try {
      console.log('📊 PetriLabs Storage Status\n');
      
      const storage = getPetriStorage();
      const stats = await storage.getStats();

      console.log('🤖 Agent:');
      console.log(`  ID: ${stats.agentId}`);
      console.log(`  Session: ${stats.sessionId}`);
      
      console.log('\n💰 Balance:');
      console.log(`  Address: ${stats.balance.address}`);
      console.log(`  USDC: ${stats.balance.usdc}`);

      console.log('\n📦 Genesis:');
      console.log(`  Uploaded: ${stats.genesis.uploaded ? '✅ Yes' : '❌ No'}`);
      if (stats.genesis.txId) {
        console.log(`  TX ID: ${stats.genesis.txId}`);
        console.log(`  URL: https://arweave.net/${stats.genesis.txId}`);
      }

      console.log('\n📝 Buffer:');
      console.log(`  Size: ${stats.buffer.size}/${stats.buffer.maxSize}`);
      console.log(`  Full: ${stats.buffer.isFull ? '⚠️  Yes' : '✅ No'}`);

    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    } finally {
      await getPetriStorage().shutdown();
    }
  });

// ============================================
// balance 命令
// ============================================
program
  .command('balance')
  .description('Check USDC balance only')
  .action(async () => {
    try {
      const x402 = getX402Client();
      const balance = await x402.getBalance();
      
      console.log('💰 USDC Balance');
      console.log(`Address: ${x402.getAddress()}`);
      console.log(`Balance: ${balance.formatted} USDC`);
      console.log(`Raw: ${balance.raw}`);
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// 解析命令行参数
program.parse();
