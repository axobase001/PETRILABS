/**
 * Arweave Proxy Service
 * 托管模式：编排服务代为支付 AR 代币
 * 
 * 流程：
 * 1. 用户部署时支付 USDC
 * 2. 编排服务兑换为 AR 代币
 * 3. AR 存入托管钱包
 * 4. Agent 调用 API，编排服务代付 AR
 * 
 * 优点：
 * - 用户无需管理 AR 代币
 * - Agent 无需 AR keyfile
 * - 批量支付降低交易成本
 * 
 * 注意：
 * - 这是中心化托管点（但可审计）
 * - 需要信任编排服务
 */

import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import axios from 'axios';
import { logger } from '../utils/logger';

export interface ArweaveProxyConfig {
  // Arweave 配置
  arweaveKey: JWKInterface;
  
  // DEX 配置（用于 USDC <> AR 兑换）
  dexApiUrl: string;  // 如 CoinGecko, 1inch
  
  // 托管配置
  minArBalance: string; // 最小 AR 余额警告阈值
}

export interface StorageRequest {
  agentAddress: string;
  data: Buffer | string;
  tags: { name: string; value: string }[];
}

export interface StorageReceipt {
  id: string;
  url: string;
  size: number;
  arCost: string;      // 实际消耗的 AR
  agentBalance: string; // 该 Agent 剩余额度
}

export interface AgentStorageAccount {
  agentAddress: string;
  arBalance: string;    // AR 代币余额（托管）
  totalUsed: string;    // 累计使用
  lastUsed: number;     // 最后使用时间
}

export class ArweaveProxyService {
  private arweave: Arweave;
  private wallet: JWKInterface;
  private walletAddress: string;
  private dexApiUrl: string;
  
  // Agent 存储账户映射
  private agentAccounts: Map<string, AgentStorageAccount> = new Map();
  
  // AR/USDC 汇率缓存
  private exchangeRate: number = 0;
  private lastRateUpdate: number = 0;

  constructor(config: ArweaveProxyConfig) {
    this.arweave = Arweave.init({
      host: 'arweave.net',
      port: 443,
      protocol: 'https',
    });
    
    this.wallet = config.arweaveKey;
    this.dexApiUrl = config.dexApiUrl;
    
    // 初始化钱包地址
    this.walletAddress = '';
    this.initializeWallet();
  }

  private async initializeWallet(): Promise<void> {
    this.walletAddress = await this.arweave.wallets.jwkToAddress(this.wallet);
    logger.info('Arweave proxy wallet initialized', {
      address: this.walletAddress,
    });
  }

  /**
   * 充值 Agent 存储账户（部署时调用）
   * 
   * @param agentAddress Agent 地址
   * @param usdcAmount USDC 金额（微单位）
   * @returns 兑换后的 AR 金额
   */
  async depositUSDC(agentAddress: string, usdcAmount: string): Promise<string> {
    try {
      // 1. 获取当前 AR/USDC 汇率
      const rate = await this.getExchangeRate();
      
      // 2. 计算可兑换的 AR
      const usdcValue = Number(usdcAmount) / 1e6;
      const arAmount = usdcValue / rate;
      const arWinston = Math.floor(arAmount * 1e12).toString();
      
      // 3. 在实际场景中，这里需要：
      //    - 接收用户 USDC
      //    - 通过 DEX 兑换为 AR
      //    - AR 转入托管钱包
      //    这里简化处理，假设已兑换完成
      
      // 4. 更新 Agent 账户
      const existing = this.agentAccounts.get(agentAddress);
      const currentBalance = existing ? BigInt(existing.arBalance) : BigInt(0);
      const newBalance = currentBalance + BigInt(arWinston);
      
      this.agentAccounts.set(agentAddress, {
        agentAddress,
        arBalance: newBalance.toString(),
        totalUsed: existing?.totalUsed || '0',
        lastUsed: Date.now(),
      });
      
      logger.info('Agent storage account funded', {
        agentAddress,
        usdcDeposited: usdcAmount,
        arReceived: arWinston,
        newBalance: newBalance.toString(),
      });
      
      return arWinston;
      
    } catch (error) {
      logger.error('Failed to deposit USDC for storage', { error, agentAddress });
      throw error;
    }
  }

  /**
   * 存储数据（代付 AR）
   * 
   * @param request 存储请求
   * @returns 存储凭证
   */
  async store(request: StorageRequest): Promise<StorageReceipt> {
    const { agentAddress, data, tags } = request;
    
    try {
      // 1. 检查 Agent 账户余额
      const account = this.agentAccounts.get(agentAddress);
      if (!account) {
        throw new Error(`No storage account found for agent ${agentAddress}`);
      }
      
      // 2. 估算 AR 成本
      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const price = await this.arweave.transactions.getPrice(dataBuffer.length);
      
      // 添加 20% 缓冲
      const estimatedCost = BigInt(price) * BigInt(120) / BigInt(100);
      
      // 3. 检查余额是否充足
      const currentBalance = BigInt(account.arBalance);
      if (currentBalance < estimatedCost) {
        throw new Error(
          `Insufficient AR balance. Required: ${estimatedCost}, Available: ${currentBalance}`
        );
      }
      
      // 4. 创建并签名交易（使用托管钱包）
      const transaction = await this.arweave.createTransaction({
        data: dataBuffer,
      }, this.wallet);
      
      // 添加标签
      tags.forEach(tag => {
        transaction.addTag(tag.name, tag.value);
      });
      
      // 添加代理标签
      transaction.addTag('Agent-Address', agentAddress);
      transaction.addTag('Proxy-Service', 'PETRILABS');
      
      // 签名
      await this.arweave.transactions.sign(transaction, this.wallet);
      
      // 5. 提交交易
      const response = await this.arweave.transactions.post(transaction);
      
      if (response.status !== 200 && response.status !== 202) {
        throw new Error(`Arweave submission failed: ${response.status}`);
      }
      
      // 6. 扣除 Agent 余额
      const actualCost = transaction.reward;
      const newBalance = currentBalance - BigInt(actualCost);
      const totalUsed = BigInt(account.totalUsed) + BigInt(actualCost);
      
      this.agentAccounts.set(agentAddress, {
        ...account,
        arBalance: newBalance.toString(),
        totalUsed: totalUsed.toString(),
        lastUsed: Date.now(),
      });
      
      // 7. 返回凭证
      const receipt: StorageReceipt = {
        id: transaction.id,
        url: `https://arweave.net/${transaction.id}`,
        size: dataBuffer.length,
        arCost: actualCost,
        agentBalance: newBalance.toString(),
      };
      
      logger.info('Data stored to Arweave via proxy', {
        agentAddress,
        txId: transaction.id,
        cost: actualCost,
        remainingBalance: newBalance.toString(),
      });
      
      return receipt;
      
    } catch (error) {
      logger.error('Arweave proxy storage failed', { error, agentAddress });
      throw error;
    }
  }

  /**
   * 存储 JSON 数据
   */
  async storeJSON(
    agentAddress: string,
    data: unknown,
    tags: { name: string; value: string }[] = []
  ): Promise<StorageReceipt> {
    const jsonString = JSON.stringify(data);
    return this.store({
      agentAddress,
      data: Buffer.from(jsonString),
      tags: [
        { name: 'Content-Type', value: 'application/json' },
        ...tags,
      ],
    });
  }

  /**
   * 获取 Agent 存储账户信息
   */
  getAccount(agentAddress: string): AgentStorageAccount | null {
    return this.agentAccounts.get(agentAddress) || null;
  }

  /**
   * 获取所有账户（用于审计）
   */
  getAllAccounts(): AgentStorageAccount[] {
    return Array.from(this.agentAccounts.values());
  }

  /**
   * 获取 AR/USDC 汇率
   */
  private async getExchangeRate(): Promise<number> {
    // 缓存 5 分钟
    if (Date.now() - this.lastRateUpdate < 5 * 60 * 1000 && this.exchangeRate > 0) {
      return this.exchangeRate;
    }
    
    try {
      // 使用 CoinGecko API 获取 AR/USDC 价格
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd'
      );
      
      const arPriceUSD = response.data.arweave.usd;
      this.exchangeRate = arPriceUSD; // 1 AR = X USD
      this.lastRateUpdate = Date.now();
      
      return this.exchangeRate;
      
    } catch (error) {
      logger.error('Failed to get exchange rate', { error });
      // 使用默认汇率
      return 10; // 1 AR = $10 (保守估计)
    }
  }

  /**
   * 获取托管钱包余额
   */
  async getWalletBalance(): Promise<string> {
    const winston = await this.arweave.wallets.getBalance(this.walletAddress);
    return winston;
  }

  /**
   * 估算存储成本（USDC）
   */
  async estimateCostUSDC(bytes: number): Promise<string> {
    const price = await this.arweave.transactions.getPrice(bytes);
    const rate = await this.getExchangeRate();
    
    // AR to USDC
    const arAmount = Number(price) / 1e12;
    const usdcAmount = arAmount * rate;
    
    // 添加 20% 缓冲
    const withBuffer = usdcAmount * 1.2;
    
    // 转换为微 USDC
    return Math.ceil(withBuffer * 1e6).toString();
  }
}

export default ArweaveProxyService;
