/**
 * Pollinations.AI Provider
 * 免费层 LLM 推理服务
 * 
 * 特点：
 * - 零成本、免注册、免 API Key
 * - 支持多种开源模型
 * - 作为默认层和 fallback 层
 */

import { logger } from '../../utils/logger';

export interface PollinationsConfig {
  baseUrl?: string;
  defaultTimeout?: number;
}

export interface ReasoningRequest {
  prompt: string;
  model?: string;
  complexity?: 'standard' | 'deep' | 'critical';
  systemPrompt?: string;
  temperature?: number;
}

export interface ReasoningResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latency: number;
  metabolicCost: number; // 始终为 0（免费）
  provider: 'pollinations';
}

// 模型映射表
const MODEL_MAP: Record<string, string> = {
  'standard': 'openai-large',      // GPT-4o 级别
  'deep': 'deepseek-reasoner',     // DeepSeek R1
  'critical': 'claude-3-opus',     // 最高质量（如果可用）
  'fast': 'mistral-large',         // 快速响应
};

export class PollinationsProvider {
  private baseUrl: string;
  private defaultTimeout: number;

  constructor(config: PollinationsConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://text.pollinations.ai';
    this.defaultTimeout = config.defaultTimeout || 60000;
    
    logger.info('PollinationsProvider initialized (free tier)');
  }

  /**
   * 执行推理（免费层）
   */
  async reason(request: ReasoningRequest): Promise<ReasoningResult> {
    const startTime = Date.now();
    
    try {
      // 根据复杂度选择模型
      const model = request.model || MODEL_MAP[request.complexity || 'standard'];
      
      logger.debug('Pollinations reasoning', { 
        model, 
        complexity: request.complexity,
        promptLength: request.prompt.length 
      });

      // 构造请求
      const response = await fetch(`${this.baseUrl}/openai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
            { role: 'user', content: request.prompt }
          ],
          temperature: request.temperature ?? 0.7,
        }),
        signal: AbortSignal.timeout(this.defaultTimeout),
      });

      if (!response.ok) {
        throw new Error(`Pollinations API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;

      // 估算 token 使用量（实际 API 可能不返回）
      const promptTokens = this.estimateTokens(request.prompt);
      const completionTokens = this.estimateTokens(data.choices[0].message.content);

      logger.info('Pollinations reasoning completed', { 
        model, 
        latency,
        tokens: promptTokens + completionTokens
      });

      return {
        content: data.choices[0].message.content,
        model,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        latency,
        metabolicCost: 0, // 免费层成本为 0
        provider: 'pollinations',
      };

    } catch (error) {
      logger.error('Pollinations reasoning failed', { error });
      throw error;
    }
  }

  /**
   * 快速推理（简化版）
   */
  async quickReason(prompt: string): Promise<string> {
    const result = await this.reason({
      prompt,
      complexity: 'fast',
    });
    return result.content;
  }

  /**
   * 检查服务健康
   */
  async healthCheck(): Promise<{ healthy: boolean; latency: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      
      return {
        healthy: response.ok,
        latency: Date.now() - start,
      };
    } catch {
      return {
        healthy: false,
        latency: Date.now() - start,
      };
    }
  }

  /**
   * 估算 token 数量（简化版）
   */
  private estimateTokens(text: string): number {
    // 粗略估算：英文约 4 字符/token，中文约 1 字符/token
    // 这里使用保守估计
    return Math.ceil(text.length / 3);
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`);
      if (!response.ok) return Object.values(MODEL_MAP);
      
      const data = await response.json();
      return data.models || Object.values(MODEL_MAP);
    } catch {
      return Object.values(MODEL_MAP);
    }
  }
}

export default PollinationsProvider;
