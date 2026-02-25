/**
 * x402 Payment Protocol Service
 * Implements x402 client for agent runtime payments
 * 
 * x402 Flow:
 * 1. Client makes request
 * 2. Server returns 402 with payment requirements
 * 3. Client creates and signs payment
 * 4. Server validates and processes request
 */

import { ethers } from 'ethers';
import { logger } from '../utils/logger';

export interface X402Payment {
  scheme: 'exact' | 'estimate';
  network: string;           // e.g., 'base-sepolia'
  maxAmountRequired: string; // in base units
  resource: string;          // resource identifier
  description: string;
  mimeType: string;
  outputSchema?: object;
  payToAddress: string;      // recipient address
  requiredDeadlineSeconds: number;
  usdcAddress: string;
  endpoint: string;          // payment verification endpoint
}

export interface X402PaymentReceipt {
  token: string;             // 'USDC'
  amount: string;
  sender: string;
  receiver: string;
  timestamp: number;
  nonce: string;
  signature: string;
  chainId: number;
}

export interface X402Config {
  privateKey: string;
  chainId: number;
  rpcUrl: string;
  usdcAddress: string;
}

export class X402Service {
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private usdcAddress: string;
  private chainId: number;

  constructor(config: X402Config) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    this.usdcAddress = config.usdcAddress;
    this.chainId = config.chainId;
  }

  /**
   * Execute a paid request using x402
   * This handles the full x402 flow
   */
  async executePaidRequest<T>(
    endpoint: string,
    payload: unknown,
    maxAmount: string
  ): Promise<T> {
    try {
      // Step 1: Make initial request (expecting 402)
      const initialResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // If not 402, return the response
      if (initialResponse.status !== 402) {
        if (initialResponse.ok) {
          return await initialResponse.json();
        }
        throw new Error(`Request failed: ${initialResponse.statusText}`);
      }

      // Step 2: Parse payment requirements
      const paymentRequirements: X402Payment = await initialResponse.json();
      
      // Validate payment requirements
      if (BigInt(paymentRequirements.maxAmountRequired) > BigInt(maxAmount)) {
        throw new Error(
          `Payment required (${paymentRequirements.maxAmountRequired}) exceeds maximum (${maxAmount})`
        );
      }

      // Step 3: Create payment receipt
      const receipt = await this.createPaymentReceipt(paymentRequirements);

      // Step 4: Retry request with payment
      const paidResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payment': JSON.stringify(receipt),
        },
        body: JSON.stringify(payload),
      });

      if (!paidResponse.ok) {
        throw new Error(`Paid request failed: ${paidResponse.statusText}`);
      }

      return await paidResponse.json();

    } catch (error) {
      logger.error('x402 payment failed', { error, endpoint });
      throw error;
    }
  }

  /**
   * Create x402 payment receipt
   */
  private async createPaymentReceipt(
    requirements: X402Payment
  ): Promise<X402PaymentReceipt> {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    // Create payment payload to sign
    const payload = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32'],
        [
          this.wallet.address,
          requirements.payToAddress,
          requirements.maxAmountRequired,
          timestamp,
          this.chainId,
          nonce,
        ]
      )
    );

    // Sign the payload
    const signature = await this.wallet.signMessage(ethers.getBytes(payload));

    return {
      token: 'USDC',
      amount: requirements.maxAmountRequired,
      sender: this.wallet.address,
      receiver: requirements.payToAddress,
      timestamp,
      nonce,
      signature,
      chainId: this.chainId,
    };
  }

  /**
   * Check USDC balance
   */
  async getBalance(): Promise<string> {
    const usdcAbi = ['function balanceOf(address) view returns (uint256)'];
    const usdc = new ethers.Contract(this.usdcAddress, usdcAbi, this.provider);
    const balance = await usdc.balanceOf(this.wallet.address);
    return balance.toString();
  }

  /**
   * Get wallet address
   */
  getAddress(): string {
    return this.wallet.address;
  }
}

export default X402Service;
