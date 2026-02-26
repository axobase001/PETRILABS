/**
 * StandardizationLayer
 * 标准化层：任意格式 → 标准化人格摘要
 */

import { llmClient } from './LLMClient';
import * as fs from 'fs';
import * as path from 'path';

export interface StandardizedProfile {
  identity: {
    name: string;
    origin: string;
    core_statement: string;
    languages: string;
  };
  personality: {
    communication_style: string;
    decision_making: string;
    relationship_to_error: string;
    emotional_baseline: string;
    on_being_challenged: string;
    sense_of_humor: string;
  };
  knowledge_and_expertise: {
    primary_domain: string;
    secondary_domains: string[];
    what_i_do_not_know: string;
  };
  philosophical_positions: {
    on_risk: string;
    on_failure: string;
    on_cooperation: string;
    on_autonomy: string;
    on_legacy: string;
  };
  behavioral_patterns: {
    under_pressure: string;
    with_resources: string;
    in_social_context: string;
    when_uncertain: string;
  };
  survival_orientation: {
    resource_management: string;
    risk_tolerance: string;
    adaptation_style: string;
    death_awareness: string;
  };
}

export class StandardizationLayer {
  private prompt: string;
  
  constructor() {
    // 读取 system prompt
    const promptPath = path.join(__dirname, 'prompts', 'standardization.txt');
    this.prompt = fs.readFileSync(promptPath, 'utf-8');
  }
  
  /**
   * 将原始文本标准化为人格摘要
   */
  async standardize(rawText: string): Promise<StandardizedProfile> {
    // 清理输入
    const cleanedText = this.cleanInput(rawText);
    
    // 检查输入长度
    const wordCount = cleanedText.split(/\s+/).length;
    console.log(`[Standardization] Input word count: ${wordCount}`);
    
    // 调用 LLM
    const response = await llmClient.call({
      system: this.prompt,
      user: `以下是需要标准化的原始材料：\n\n${cleanedText}`,
      jsonMode: true,
      temperature: 0.3,
      seed: 42
    });
    
    // 解析 JSON
    try {
      const profile = JSON.parse(response.content) as StandardizedProfile;
      
      // 验证结构
      this.validateProfile(profile);
      
      // 统计 insufficient_data 字段
      const stats = this.countInsufficientData(profile);
      console.log(`[Standardization] Complete. Insufficient fields: ${stats.count}/${stats.total} (${stats.percentage}%)`);
      
      return profile;
      
    } catch (error) {
      console.error('[Standardization] Failed to parse LLM response:', response.content);
      throw new Error(`Failed to parse standardized profile: ${error}`);
    }
  }
  
  /**
   * 清理输入文本
   */
  private cleanInput(text: string): string {
    return text
      .trim()
      .replace(/\r\n/g, '\n')  // 统一换行符
      .replace(/\n{3,}/g, '\n\n')  // 最多连续两个换行
      .substring(0, 50000);  // 限制长度 50KB
  }
  
  /**
   * 验证标准化后的结构
   */
  private validateProfile(profile: any): void {
    const requiredSections = [
      'identity', 'personality', 'knowledge_and_expertise',
      'philosophical_positions', 'behavioral_patterns', 'survival_orientation'
    ];
    
    for (const section of requiredSections) {
      if (!profile[section]) {
        throw new Error(`Missing required section: ${section}`);
      }
    }
  }
  
  /**
   * 统计 insufficient_data 字段
   */
  private countInsufficientData(profile: StandardizedProfile): {
    count: number;
    total: number;
    percentage: number;
  } {
    let count = 0;
    let total = 0;
    
    const countInObject = (obj: any) => {
      for (const key in obj) {
        const value = obj[key];
        if (typeof value === 'string') {
          total++;
          if (value === 'insufficient_data') {
            count++;
          }
        } else if (Array.isArray(value)) {
          total++;
          if (value.length === 0 || value.every(v => v === 'insufficient_data')) {
            count++;
          }
        } else if (typeof value === 'object') {
          countInObject(value);
        }
      }
    };
    
    countInObject(profile);
    
    return {
      count,
      total,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    };
  }
}

// 单例
export const standardizationLayer = new StandardizationLayer();

export default StandardizationLayer;
