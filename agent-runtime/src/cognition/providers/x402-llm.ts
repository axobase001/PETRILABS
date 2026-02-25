/**
 * X402 LLM Provider
 * 付费层 LLM 推理服务
 * 
 * 通过 x402 协议使用 Base L2 USDC 购买高级 LLM API
 * 支持 OpenAI、Claude、DeepSeek 等模型
 */

import { ethers } from 'ethers';
import { logger } from '../../utils/logger';
import { getX402Client } from '../../gateways/x402';

export interface X402LLMConfig {
  wallet: ethers.Wallet;
  baseUrl?: string;
  maxSlippage?: number;  // 价格滑点容忍度（默认 10%）
  defaultTimeout?: number;
}

export interface X402ReasoningRequest {
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxCost: number;  // 最高愿意支付的金额（USDC）
  maxTokens?: number;
}

export interface X402ReasoningResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latency: number;
  actualCost: number;  // 实际支付金额
  provider: string;    // 实际服务商
  paymentTx: string;   // x402 支付交易哈希
}

// 支持的模型及预估成本（每 1K tokens）
export const PREMIUM_MODELS: Record<string, { 
  costPer1K: number; 
  endpoint: string;
  provider: string;
  contextWindow: number;
}> = {
  'gpt-4o': {
    costPer1K: 0.005,
    endpoint: 'https://api.openai.com/v1/chat/completions',
    provider: 'openai',
    contextWindow: 128000,
  },
  'gpt-4o-mini': {
    costPer1K: 0.0006,
    endpoint: 'https://api.openai.com/v1/chat/completions',
    provider: 'openai',
    contextWindow: 128000,
  },
  'claude-3-5-sonnet': {
    costPer1K: 0.003,
    endpoint: 'https://api.anthropic.com/v1/messages',
    provider: 'anthropic',
    contextWindow: 200000,
  },
  'claude-3-haiku': {
    costPer1K: 0.0005,
    endpoint: 'https://api.anthropic.com/v1/messages',
    provider: 'anthropic',
    contextWindow: 200000,
  },
  'deepseek-chat': {
    costPer1K: 0.0007,
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    provider: 'deepseek',
    contextWindow: 64000,
  },
  'deepseek-reasoner': {
    costPer1K: 0.002,
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    provider: 'deepseek',
    contextWindow: 64000,
  },
};

export class X402LLMProvider {
  private wallet: ethers.Wallet;
  private baseUrl: string;
  private maxSlippage: number;
  private defaultTimeout: number;
  private x402Client: ReturnType<typeof getX402Client>;
  
  // 模型价格缓存
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 分钟

  constructor(config: X402LLMConfig) {
    this.wallet = config.wallet;
    this.baseUrl = config.baseUrl || 'https://x402-llm.petrilabs.io';
    this.maxSlippage = config.maxSlippage ?? 0.1;
    this.defaultTimeout = config.defaultTimeout ?? 120000;
    
    // 复用已有的 x402 客户端
    this.x402Client = getX402Client();
    
    logger.info('X402LLMProvider initialized (premium tier)', {
      address: this.wallet.address,
    });
  }

  /**
   * 执行推理（付费层，通过 x402）
   */
  async reason(request: X402ReasoningRequest): Promise<X402ReasoningResult> {
    const startTime = Date.now();
    
    try {
      // 步骤 1：获取实时报价
      const quote = await this.getQuote(request.model, request.prompt);
      
      logger.debug('X402 LLM quote received', { 
        model: request.model,
        estimatedCost: quote.cost,
        maxBudget: request.maxCost
      });

      // 步骤 2：检查预算
      if (quote.cost > request.maxCost) {
        throw new BudgetExceededError(
          `Quote $${quote.cost} exceeds budget $${request.maxCost}`,
          quote.cost,
          request.maxCost
        );
      }

      // 步骤 3：执行 x402 支付并获取推理结果
      const result = await this.executeWithPayment(request, quote);
      
      const latency = Date.now() - startTime;

      logger.info('X402 LLM reasoning completed', {
        model: request.model,
        actualCost: result.actualCost,
        latency,
        txHash: result.paymentTx.slice(0, 20) + '...',
      });

      return {
        ...result,
        latency,
      };

    } catch (error) {
      logger.error('X402 LLM reasoning failed', { 
        error, 
        model: request.model 
      });
      throw error;
    }
  }

  /**
   * 获取模型报价
   */
  private async getQuote(model: string, prompt: string): Promise<{
    cost: number;
    endpoint: string;
    provider: string;
    expiresAt: number;
  }> {
    // 检查缓存
    const cached = this.priceCache.get(model);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      const modelInfo = PREMIUM_MODELS[model];
      return {
        cost: cached.price,
        endpoint: modelInfo.endpoint,
        provider: modelInfo.provider,
        expiresAt: Date.now() + 60000,
      };
    }

    // 估算成本
    const estimatedTokens = Math.ceil(prompt.length / 3) + 1000; // +1000 for completion
    const modelInfo = PREMIUM_MODELS[model];
    
    if (!modelInfo) {
      throw new Error(`Unknown model: ${model}`);
    }

    const estimatedCost = (estimatedTokens / 1000) * modelInfo.costPer1K;
    
    // 添加缓冲
    const costWithBuffer = estimatedCost * (1 + this.maxSlippage);
    
    // 缓存价格
    this.priceCache.set(model, {
      price: costWithBuffer,
      timestamp: Date.now(),
    });

    return {
      cost: costWithBuffer,
      endpoint: modelInfo.endpoint,
      provider: modelInfo.provider,
      expiresAt: Date.now() + 60000,
    };
  }

  /**
   * 执行带 x402 支付的推理请求
   */
  private async executeWithPayment(
    request: X402ReasoningRequest,
    quote: { cost: number; endpoint: string; provider: string }
  ): Promise<Omit<X402ReasoningResult, 'latency'>> {
    
    // 构造请求体
    const requestBody = this.buildRequestBody(request, quote.provider);
    
    // 使用 x402 客户端执行支付请求
    const response = await this.x402Client.executeWithPayment(
      async (headers = {}) => {
        return fetch(quote.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await this.getProviderApiKey(quote.provider)}`,
            ...headers,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(this.defaultTimeout),
        });
      },
      {
        maxRetries: 2,
        // x402 支付参数
        payment: {
          amount: Math.floor(quote.cost * 1e6).toString(), // 转换为 USDC 单位（6 位小数）
          token: 'base-usdc',
        }
      }
    );

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    
    // 解析响应
    const content = this.extractContent(data, quote.provider);
    const usage = this.extractUsage(data);
    
    // 从响应头获取实际支付金额
    const actualCost = this.extractPaymentFromHeaders(response.headers);

    return {
      content,
      model: request.model,
      usage,
      actualCost,
      provider: quote.provider,
      paymentTx: response.headers.get('x402-tx-hash') || 'unknown',
    };
  }

  /**
   * 根据提供商构造请求体
   */
  private buildRequestBody(request: X402ReasoningRequest, provider: string): unknown {
    const messages = [
      ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
      { role: 'user', content: request.prompt }
    ];

    switch (provider) {
      case 'anthropic':
        return {
          model: request.model,
          messages: messages.map(m => ({
            role: m.role === 'system' ? 'assistant' : 'user',
            content: m.content
          })),
          max_tokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.7,
        };
      
      case 'openai':
      case 'deepseek':
      default:
        return {
          model: request.model,
          messages,
          max_tokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.7,
        };
    }
  }

  /**
   * 从响应中提取内容
   */
  private extractContent(data: any, provider: string): string {
    switch (provider) {
      case 'anthropic':
        return data.content?.[0]?.text || '';
      case 'openai':
      case 'deepseek':
      default:
        return data.choices?.[0]?.message?.content || '';
    }
  }

  /**
   * 从响应中提取使用量
   */
  private extractUsage(data: any): { promptTokens: number; completionTokens: number; totalTokens: number } {
    return {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    };
  }

  /**
   * 从响应头提取支付金额
   */
  private extractPaymentFromHeaders(headers: Headers): number {
    const amount = headers.get('x402-amount-paid');
    if (amount) {
      return parseInt(amount) / 1e6; // 转换为 USDC
    }
    return 0;
  }

  /**
   * 获取提供商 API Key（从环境变量）
   */
  private async getProviderApiKey(provider: string): Promise<string> {
    const envVar = `${provider.toUpperCase()}_API_KEY`;
    const key = process.env[envVar];
    if (!key) {
      throw new Error(`Missing API key for ${provider}: ${envVar}`);
    }
    return key;
  }

  /**
   * 选择最优模型（在预算内选最好的）
   */
  selectOptimalModel(budget: number, complexity: string): string {
    const candidates = Object.entries(PREMIUM_MODELS)
      .filter(([_, info]) => {
        // 简单任务用小模型
        if (complexity === 'standard' && info.costPer1K > 0.001) return false;
        // 复杂任务用大模型
        if (complexity === 'critical' && info.costPer1K < 0.003) return true;
        return true;
      })
      .sort((a, b) => b[1].costPer1K - a[1].costPer1K); // 按质量排序（贵的好）

    for (const [model, info] of candidates) {
      if (info.costPer1K * 2 <= budget) { // 假设平均 2K tokens
        return model;
      }
    }

    // 预算不足，返回最便宜的
    return 'deepseek-chat';
  }

  /**
   * 检查余额是否足够
   */
  async checkBalance(minRequired: number): Promise<boolean> {
    try {
      const balance = await this.x402Client.getBalance();
      return parseFloat(balance.formatted) >= minRequired;
    } catch {
      return false;
    }
  }
}

// 自定义错误类
export class BudgetExceededError extends Error {
  constructor(
    message: string,
    public quotedCost: number,
    public budget: number
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export default X402LLMProvider;
