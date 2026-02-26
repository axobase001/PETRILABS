/**
 * LLMClient
 * 统一的 LLM 调用接口
 * 
 * 当前使用 Pollinations 免费 API
 * 预留切换到 x402 或其他模型的能力
 */

export interface LLMCallOptions {
  system: string;
  user: string;
  jsonMode?: boolean;
  model?: string;
  temperature?: number;
  seed?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latency: number;
}

export class LLMClient {
  private defaultModel = 'openai';
  private fallbackModel = 'mistral';
  
  /**
   * 主调用方法
   */
  async call(options: LLMCallOptions): Promise<LLMResponse> {
    const {
      system,
      user,
      jsonMode = true,
      model = this.defaultModel,
      temperature = 0.3,  // 低温度 = 更一致的映射结果
      seed = 42           // 固定 seed = 可复现
    } = options;
    
    const startTime = Date.now();
    
    try {
      // 主路径：Pollinations
      const response = await this.callPollinations({
        system,
        user,
        jsonMode,
        model,
        temperature,
        seed
      });
      
      return {
        content: response,
        model,
        latency: Date.now() - startTime
      };
      
    } catch (error) {
      console.warn('Primary LLM call failed, trying fallback:', error);
      
      // Fallback：尝试备用模型
      try {
        const fallbackResponse = await this.callPollinations({
          system,
          user,
          jsonMode,
          model: this.fallbackModel,
          temperature,
          seed
        });
        
        return {
          content: fallbackResponse,
          model: this.fallbackModel,
          latency: Date.now() - startTime
        };
        
      } catch (fallbackError) {
        throw new Error(
          `LLM 调用失败: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`
        );
      }
    }
  }
  
  /**
   * 调用 Pollinations API
   */
  private async callPollinations(options: Required<LLMCallOptions>): Promise<string> {
    const { system, user, jsonMode, model, temperature, seed } = options;
    
    const response = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        model,
        jsonMode,
        temperature,
        seed
      })
    });
    
    if (!response.ok) {
      throw new Error(`Pollinations API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.text();
  }
  
  /**
   * 流式调用（预留接口）
   */
  async *stream(options: LLMCallOptions): AsyncGenerator<string> {
    // 预留流式调用实现
    // 当前先返回完整结果
    const result = await this.call(options);
    yield result.content;
  }
}

// 单例实例
export const llmClient = new LLMClient();

export default LLMClient;
