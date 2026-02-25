/**
 * x402 Payment Protocol Client
 * 实现 HTTP 402 Payment Required 协议，支持 Base L2 USDC 支付
 * 
 * 协议流程:
 * 1. 发送初始请求 → 收到 402 + invoice
 * 2. 签名支付消息 (EIP-712)
 * 3. 携带 proof 重试请求
 * 4. 收到 200 + 上传确认
 */

import { ethers } from 'ethers';
import { getX402Config, getRetryConfig } from './config.js';
import { createLogger } from './logger.js';

const logger = createLogger('x402');

// x402 相关常量
const X402_VERSION = '2';
const X402_HEADER_VERSION = 'x402-version';
const X402_HEADER_PAYMENT = 'x402-payment';
const X402_HEADER_AMOUNT = 'x402-amount';
const X402_HEADER_INVOICE = 'x402-invoice';
const X402_HEADER_PROOF = 'x402-proof';

// USDC ABI (仅包含需要的方法)
const USDC_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function nonces(address owner) external view returns (uint256)',
];

// EIP-712 域分隔符
const EIP712_DOMAIN = {
  name: 'x402 Payment Protocol',
  version: '2',
  chainId: 8453, // Base mainnet
};

// 支付类型定义
const PAYMENT_TYPES = {
  Payment: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

export class X402Client {
  constructor() {
    const x402Config = getX402Config();
    const retryConfig = getRetryConfig();

    this.provider = new ethers.JsonRpcProvider(x402Config.baseRpcUrl);
    this.wallet = new ethers.Wallet(x402Config.privateKey, this.provider);
    this.usdcContract = new ethers.Contract(x402Config.usdcContract, USDC_ABI, this.wallet);
    
    this.maxRetries = retryConfig.maxRetries;
    this.retryDelay = retryConfig.delay;
    this.timeout = retryConfig.timeout;

    logger.info('X402Client initialized', {
      address: this.wallet.address,
      network: 'base',
    });
  }

  /**
   * 获取钱包地址
   */
  getAddress() {
    return this.wallet.address;
  }

  /**
   * 获取 USDC 余额
   */
  async getBalance() {
    try {
      const balance = await this.usdcContract.balanceOf(this.wallet.address);
      const decimals = await this.usdcContract.decimals();
      return {
        raw: balance.toString(),
        formatted: ethers.formatUnits(balance, decimals),
        decimals,
      };
    } catch (error) {
      logger.error('Failed to get USDC balance', { error: error.message });
      throw error;
    }
  }

  /**
   * 检查并授权 USDC 额度
   * @param {string} spender - 授权地址
   * @param {string} amount - 授权金额 (wei)
   */
  async ensureAllowance(spender, amount) {
    try {
      const currentAllowance = await this.usdcContract.allowance(this.wallet.address, spender);
      
      if (currentAllowance >= BigInt(amount)) {
        logger.debug('Sufficient allowance exists', { 
          current: currentAllowance.toString(),
          required: amount,
        });
        return true;
      }

      logger.info('Approving USDC allowance', { spender, amount });
      const tx = await this.usdcContract.approve(spender, amount);
      await tx.wait();
      
      logger.info('USDC allowance approved', { txHash: tx.hash });
      return true;
    } catch (error) {
      logger.error('Failed to approve allowance', { error: error.message });
      throw error;
    }
  }

  /**
   * 创建并签名支付证明
   * @param {Object} invoice - 发票信息
   * @returns {Object} 签名后的支付证明
   */
  async createPaymentProof(invoice) {
    try {
      const { recipient, amount, nonce, timestamp } = invoice;

      // 构建 EIP-712 消息
      const message = {
        recipient,
        amount: amount.toString(),
        nonce: nonce.toString(),
        timestamp: timestamp.toString(),
      };

      // 签名
      const signature = await this.wallet.signTypedData(
        EIP712_DOMAIN,
        PAYMENT_TYPES,
        message
      );

      logger.debug('Payment proof created', {
        recipient,
        amount,
        signature: signature.slice(0, 20) + '...',
      });

      return {
        ...message,
        signature,
        sender: this.wallet.address,
      };
    } catch (error) {
      logger.error('Failed to create payment proof', { error: error.message });
      throw error;
    }
  }

  /**
   * 解析 402 响应中的发票信息
   * @param {Headers} headers - HTTP 响应头
   * @returns {Object|null} 发票信息
   */
  parseInvoice(headers) {
    const version = headers.get(X402_HEADER_VERSION);
    const payment = headers.get(X402_HEADER_PAYMENT);
    const amount = headers.get(X402_HEADER_AMOUNT);
    const invoiceData = headers.get(X402_HEADER_INVOICE);

    if (!version || !payment || !amount) {
      return null;
    }

    try {
      const invoice = invoiceData ? JSON.parse(Buffer.from(invoiceData, 'base64').toString()) : {
        recipient: headers.get('x402-recipient'),
        amount,
        nonce: Date.now(),
        timestamp: Math.floor(Date.now() / 1000),
      };

      return {
        version,
        payment,
        amount,
        ...invoice,
      };
    } catch (error) {
      logger.error('Failed to parse invoice', { error: error.message });
      return null;
    }
  }

  /**
   * 执行带 x402 支付的请求
   * @param {Function} requestFn - 返回 Promise 的请求函数
   * @param {Object} options - 选项
   * @returns {Promise} 请求结果
   */
  async executeWithPayment(requestFn, options = {}) {
    const { skipPayment = false, maxRetries = this.maxRetries } = options;

    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 第一次请求
        logger.debug(`Request attempt ${attempt + 1}/${maxRetries}`);
        const response = await requestFn();

        // 如果成功，直接返回
        if (response.ok || response.status < 400) {
          return response;
        }

        // 如果不是 402，抛出错误
        if (response.status !== 402) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // 处理 402 支付请求
        if (skipPayment) {
          throw new Error('Payment required but skipPayment is true');
        }

        const invoice = this.parseInvoice(response.headers);
        if (!invoice) {
          throw new Error('Invalid 402 response: missing invoice headers');
        }

        logger.info('Payment required', {
          amount: invoice.amount,
          recipient: invoice.recipient,
          version: invoice.version,
        });

        // 检查余额
        const balance = await this.getBalance();
        if (BigInt(balance.raw) < BigInt(invoice.amount)) {
          throw new Error(
            `Insufficient USDC balance: ${balance.formatted} < ${ethers.formatUnits(invoice.amount, balance.decimals)}`
          );
        }

        // 创建支付证明
        const proof = await this.createPaymentProof(invoice);

        // 重试请求，携带支付证明
        logger.debug('Retrying request with payment proof');
        const retryResponse = await requestFn({
          headers: {
            [X402_HEADER_VERSION]: X402_VERSION,
            [X402_HEADER_PAYMENT]: 'base-usdc',
            [X402_HEADER_AMOUNT]: invoice.amount,
            [X402_HEADER_PROOF]: Buffer.from(JSON.stringify(proof)).toString('base64'),
          },
        });

        if (retryResponse.ok) {
          logger.info('Payment successful', {
            amount: invoice.amount,
            txHash: retryResponse.headers.get('x402-tx-hash'),
          });
          return retryResponse;
        }

        // 支付后仍失败
        const errorText = await retryResponse.text();
        throw new Error(`Payment failed: HTTP ${retryResponse.status}: ${errorText}`);

      } catch (error) {
        lastError = error;
        logger.warn(`Request failed (attempt ${attempt + 1})`, { error: error.message });

        if (attempt < maxRetries - 1) {
          logger.debug(`Retrying in ${this.retryDelay}ms...`);
          await this.delay(this.retryDelay);
        }
      }
    }

    throw lastError;
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 单例导出
let x402ClientInstance = null;

export function getX402Client() {
  if (!x402ClientInstance) {
    x402ClientInstance = new X402Client();
  }
  return x402ClientInstance;
}

export function resetX402Client() {
  x402ClientInstance = null;
}

export default X402Client;
