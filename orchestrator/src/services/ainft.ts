/**
 * ainft.com Integration Service
 * ainft.com is a decentralized LLM marketplace supporting x402 payments
 * 
 * This service provides LLM inference with x402 payment for agent runtime
 */

import axios from 'axios';
import { logger } from '../utils/logger';
import X402Service from './x402';

export interface AINFTMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AINFTCompletionRequest {
  model: string;
  messages: AINFTMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
}

export interface AINFTCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    message: AINFTMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost: string; // Actual cost in USDC
}

export interface AINFTModel {
  id: string;
  name: string;
  description: string;
  pricing: {
    prompt: string;  // per 1K tokens
    completion: string;
  };
  capabilities: string[];
}

export class AINFTService {
  private baseUrl: string;
  private x402Service?: X402Service;
  private apiKey?: string;

  // Fallback to direct API if x402 fails
  private useDirectApi: boolean;

  constructor(
    x402Service?: X402Service,
    apiKey?: string,
    baseUrl: string = 'https://api.ainft.com/v1'
  ) {
    this.x402Service = x402Service;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.useDirectApi = !x402Service;
  }

  /**
   * Get available models
   */
  async getModels(): Promise<AINFTModel[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/models`);
      return response.data.models;
    } catch (error) {
      logger.error('Failed to fetch ainft models', { error });
      // Return default models
      return this.getDefaultModels();
    }
  }

  /**
   * Create completion with x402 payment
   */
  async createCompletion(
    request: AINFTCompletionRequest,
    maxCost: string = '1000000' // 1 USDC default max
  ): Promise<AINFTCompletionResponse> {
    const endpoint = `${this.baseUrl}/chat/completions`;

    try {
      // Try x402 payment first
      if (this.x402Service && !this.useDirectApi) {
        return await this.x402Service.executePaidRequest<AINFTCompletionResponse>(
          endpoint,
          request,
          maxCost
        );
      }

      // Fallback to direct API with API key
      if (this.apiKey) {
        return await this.createWithApiKey(request);
      }

      throw new Error('No payment method available');

    } catch (error) {
      logger.error('AINFT completion failed', { error, model: request.model });
      
      // Fallback to OpenRouter if ainft fails
      return this.fallbackToOpenRouter(request);
    }
  }

  /**
   * Create completion with API key (direct payment)
   */
  private async createWithApiKey(
    request: AINFTCompletionRequest
  ): Promise<AINFTCompletionResponse> {
    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  }

  /**
   * Fallback to OpenRouter
   */
  private async fallbackToOpenRouter(
    request: AINFTCompletionRequest
  ): Promise<AINFTCompletionResponse> {
    logger.warn('Falling back to OpenRouter');
    
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      throw new Error('No fallback API key available');
    }

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      request,
      {
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'HTTP-Referer': 'https://petrilabs.io',
          'X-Title': 'PETRILABS',
        },
      }
    );

    return {
      id: response.data.id,
      model: response.data.model,
      choices: response.data.choices,
      usage: response.data.usage,
      cost: '0', // Unknown with OpenRouter
    };
  }

  /**
   * Estimate cost for a request
   */
  estimateCost(
    model: string,
    promptTokens: number,
    completionTokens: number
  ): string {
    const models = this.getDefaultModels();
    const modelInfo = models.find(m => m.id === model);
    
    if (!modelInfo) {
      return '100000'; // 0.1 USDC default
    }

    const promptCost = (promptTokens / 1000) * parseFloat(modelInfo.pricing.prompt);
    const completionCost = (completionTokens / 1000) * parseFloat(modelInfo.pricing.completion);
    
    // Convert to USDC (6 decimals)
    const totalUsdc = Math.ceil((promptCost + completionCost) * 1e6);
    return totalUsdc.toString();
  }

  /**
   * Default models
   */
  private getDefaultModels(): AINFTModel[] {
    return [
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        description: 'Most capable model for complex tasks',
        pricing: {
          prompt: '0.015',
          completion: '0.075',
        },
        capabilities: ['analysis', 'coding', 'writing', 'reasoning'],
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        description: 'Balanced performance and cost',
        pricing: {
          prompt: '0.003',
          completion: '0.015',
        },
        capabilities: ['analysis', 'coding', 'writing'],
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'OpenAI flagship model',
        pricing: {
          prompt: '0.005',
          completion: '0.015',
        },
        capabilities: ['analysis', 'coding', 'vision'],
      },
    ];
  }

  /**
   * Calculate memory analysis cost
   */
  calculateAnalysisCost(contentLength: number): string {
    // Rough estimate: 1000 chars ~ 250 tokens
    const estimatedTokens = Math.ceil(contentLength / 4);
    
    // Analysis uses ~4000 tokens (prompt) + ~2000 tokens (completion)
    const promptTokens = estimatedTokens + 4000;
    const completionTokens = 2000;
    
    return this.estimateCost('claude-3-opus-20240229', promptTokens, completionTokens);
  }

  /**
   * Calculate decision cost
   */
  calculateDecisionCost(): string {
    // Decision: ~2000 prompt + ~500 completion
    return this.estimateCost('claude-3-sonnet-20240229', 2000, 500);
  }
}

export default AINFTService;
