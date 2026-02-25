/**
 * LLM Service with x402 Payment
 * Uses ainft.com via x402 for autonomous agent payments
 */

import { logger } from '../utils/logger';

interface X402Receipt {
  token: string;
  amount: string;
  sender: string;
  receiver: string;
  timestamp: number;
  nonce: string;
  signature: string;
  chainId: number;
}

interface AINFTResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost: string;
}

export class LLMService {
  private privateKey: string;
  private walletAddress: string;
  private chainId: number;
  private ainftUrl: string;
  private maxCostPerRequest: string;

  constructor(config: {
    privateKey: string;
    walletAddress: string;
    chainId: number;
    maxCostPerRequest?: string;
  }) {
    this.privateKey = config.privateKey;
    this.walletAddress = config.walletAddress;
    this.chainId = config.chainId;
    this.ainftUrl = 'https://api.ainft.com/v1/chat/completions';
    this.maxCostPerRequest = config.maxCostPerRequest || '1000000';
  }

  async complete(params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    response_format?: { type: string };
  }): Promise<string> {
    try {
      return await this.requestWithX402(params);
    } catch (error) {
      logger.error('x402 failed, trying fallback', { error });
      return this.fallbackToOpenRouter(params);
    }
  }

  private async requestWithX402(params: any): Promise<string> {
    const initialResponse = await fetch(this.ainftUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (initialResponse.ok) {
      const data: AINFTResponse = await initialResponse.json();
      return data.choices[0].message.content;
    }

    if (initialResponse.status !== 402) {
      throw new Error(`Request failed: ${initialResponse.statusText}`);
    }

    const paymentReq = await initialResponse.json();
    
    if (BigInt(paymentReq.maxAmountRequired) > BigInt(this.maxCostPerRequest)) {
      throw new Error('Payment exceeds maximum');
    }

    const receipt = await this.createPaymentReceipt(paymentReq);

    const paidResponse = await fetch(this.ainftUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment': JSON.stringify(receipt),
      },
      body: JSON.stringify(params),
    });

    if (!paidResponse.ok) {
      throw new Error(`Paid request failed`);
    }

    const data: AINFTResponse = await paidResponse.json();
    return data.choices[0].message.content;
  }

  private async createPaymentReceipt(requirements: any): Promise<X402Receipt> {
    const { ethers } = await import('ethers');
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = ethers.hexlify(ethers.randomBytes(32));

    const wallet = new ethers.Wallet(this.privateKey);
    const payload = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32'],
        [
          this.walletAddress,
          requirements.payToAddress,
          requirements.maxAmountRequired,
          timestamp,
          this.chainId,
          nonce,
        ]
      )
    );

    const signature = await wallet.signMessage(ethers.getBytes(payload));

    return {
      token: 'USDC',
      amount: requirements.maxAmountRequired,
      sender: this.walletAddress,
      receiver: requirements.payToAddress,
      timestamp,
      nonce,
      signature,
      chainId: this.chainId,
    };
  }

  private async fallbackToOpenRouter(params: any): Promise<string> {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) throw new Error('No fallback API key');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://petrilabs.io',
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async analyze(decisionContext: any): Promise<any> {
    const prompt = `Analyze and recommend action:\n${JSON.stringify(decisionContext)}`;
    
    const response = await this.complete({
      model: 'claude-3-sonnet-20240229',
      messages: [
        { role: 'system', content: 'Respond with JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    try {
      return JSON.parse(response);
    } catch {
      return { decision: 'rest' };
    }
  }
}

export default LLMService;
