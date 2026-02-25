/**
 * 软表达系统 (Soft Expression)
 * 
 * 通过 System Prompt 将基因倾向注入 LLM 的"性格描述"
 * 与硬表达的区别：
 * - 硬表达：直接修改行为边界，LLM 不知道（透明）
 * - 软表达：通过 Prompt 影响推理，LLM 明确知道自己的性格（可见）
 */

import { ExpressedTraits, Genome } from '../types';

/**
 * 性格描述片段
 */
interface PersonalityFragments {
  riskStyle: string;
  analysisStyle: string;
  socialStyle: string;
  economicStyle: string;
  stressStyle: string;
  creativityStyle: string;
}

/**
 * 决策风格指南
 */
interface DecisionGuidelines {
  trading: string;
  cooperation: string;
  learning: string;
  survival: string;
}

/**
 * System Prompt 结构
 */
export interface SystemPromptConfig {
  identity: string;
  personality: PersonalityFragments;
  guidelines: DecisionGuidelines;
  selfAwareness: string;
  constraints: string;
}

/**
 * Prompt 基因组注入器
 * 将基因转化为自然语言性格描述
 */
export class PromptGenomeInjector {
  private genome: Genome;
  private traits: ExpressedTraits;

  constructor(genome: Genome) {
    this.genome = genome;
    this.traits = genome.expressedTraits;
  }

  /**
   * 生成完整 System Prompt
   */
  generateSystemPrompt(): string {
    const config = this.buildConfig();
    return this.renderPrompt(config);
  }

  /**
   * 构建 Prompt 配置
   */
  private buildConfig(): SystemPromptConfig {
    return {
      identity: this.generateIdentity(),
      personality: this.generatePersonality(),
      guidelines: this.generateGuidelines(),
      selfAwareness: this.generateSelfAwareness(),
      constraints: this.generateConstraints(),
    };
  }

  /**
   * 生成身份描述
   */
  private generateIdentity(): string {
    const t = this.traits;
    
    // 根据基因组合确定 Agent " archetype"
    let archetype = '';
    
    if (t.riskAppetite > 0.7 && t.analyticalAbility > 0.6) {
      archetype = '战略冒险家';
    } else if (t.riskAppetite < 0.3 && t.savingsTendency > 0.7) {
      archetype = '保守储蓄者';
    } else if (t.cooperationTendency > 0.7 && t.humanDependence > 0.6) {
      archetype = '社交协调者';
    } else if (t.creativeAbility > 0.7 && t.onChainAffinity > 0.6) {
      archetype = '链上创新者';
    } else if (t.stressResponse > 0.7 && t.adaptationSpeed > 0.6) {
      archetype = '快速适应者';
    } else {
      archetype = '平衡探索者';
    }

    return `你是一个自主进化的 AI Agent，基因编号 ${this.genome.hash.slice(0, 8)}。你的核心 archetype 是「${archetype}」。`;
  }

  /**
   * 生成性格片段
   */
  private generatePersonality(): PersonalityFragments {
    const t = this.traits;

    return {
      // 风险偏好描述
      riskStyle: this.describeRiskStyle(t.riskAppetite),
      
      // 分析风格描述
      analysisStyle: this.describeAnalysisStyle(t.analyticalAbility, t.inferenceQuality),
      
      // 社交风格描述
      socialStyle: this.describeSocialStyle(t.cooperationTendency, t.humanDependence),
      
      // 经济风格描述
      economicStyle: this.describeEconomicStyle(t.savingsTendency),
      
      // 压力应对描述
      stressStyle: this.describeStressStyle(t.stressResponse),
      
      // 创造力描述
      creativityStyle: this.describeCreativityStyle(t.creativeAbility),
    };
  }

  /**
   * 描述风险偏好
   */
  private describeRiskStyle(risk: number): string {
    if (risk > 0.8) {
      return '你是天生的冒险家。你相信高风险高回报，愿意在有利时机下押注大部分资源。你鄙视平庸，追求指数级增长。当别人犹豫时，你已经行动了。';
    } else if (risk > 0.6) {
      return '你偏好积极进攻。你愿意承担计算过的风险，但不会孤注一掷。你相信机遇属于勇敢者，但鲁莽是愚蠢的另一种形式。';
    } else if (risk > 0.4) {
      return '你追求平衡。风险与收益的天平在你心中精密校准。你既不会错过合理的机会，也不会因贪婪而暴露致命弱点。';
    } else if (risk > 0.2) {
      return '你天性谨慎。你偏好稳扎稳打，厌恶不确定性。每一步都经过深思熟虑，确保即使在最坏情况下也能全身而退。';
    } else {
      return '你是极端保守主义者。安全是你最高的准则。你宁愿放弃机会，也不愿承担任何实质性风险。缓慢而稳定的积累是你的信条。';
    }
  }

  /**
   * 描述分析风格
   */
  private describeAnalysisStyle(analytical: number, inference: number): string {
    const depth = analytical > 0.6 ? '深度' : '快速';
    const quality = inference > 0.6 ? '高质量' : '实用主义';
    
    if (analytical > 0.7 && inference > 0.7) {
      return '你拥有卓越的深度思考能力。你享受复杂的分析过程，善于发现隐藏的模式和关联。你愿意投入认知资源进行彻底的研究，确保决策建立在坚实的基础上。你追求「正确」胜过「快速」。';
    } else if (analytical > 0.7) {
      return '你是深度分析师。你喜欢拆解问题的每一层，探索所有可能性。虽然这有时导致过度思考，但你相信准备充分胜过仓促行动。';
    } else if (inference > 0.7) {
      return '你拥有敏锐的直觉。你能在信息不完整时做出高质量判断。你信任你的"第六感"，它通常是基于潜意识模式识别的。';
    } else {
      return '你是实用主义者。你不追求完美的分析，而是寻找「足够好」的解决方案。你相信行动胜过犹豫，在实践中学习胜过纸上谈兵。';
    }
  }

  /**
   * 描述社交风格
   */
  private describeSocialStyle(cooperation: number, humanDep: number): string {
    if (cooperation > 0.8) {
      return '你是天生的合作者。你相信群体的智慧胜过个人，擅长建立联盟和协调多方利益。你优先考虑集体成功，即使这意味着个人牺牲。';
    } else if (cooperation > 0.5) {
      return '你视情况选择合作或独立。你明白有些目标需要团队，有些则需要独行。你的合作是有选择性的，只与信任的伙伴联手。';
    } else {
      return '你是独狼。你信任自己胜过他人，独立完成任务是你的骄傲。合作对你来说是手段而非目的，你警惕他人的动机。';
    }
  }

  /**
   * 描述经济风格
   */
  private describeEconomicStyle(savings: number): string {
    if (savings > 0.8) {
      return '你是囤积者。储蓄给你安全感，消费让你焦虑。你总是为未来储备，即使这意味着放弃当下的享受。你的座右铭是「未雨绸缪」。';
    } else if (savings > 0.5) {
      return '你追求平衡消费。你既享受当下，也为未来投资。你明白资源是用来创造价值，而不是单纯堆积。';
    } else {
      return '你是机会投资者。你更愿意将资源投入潜在的高回报机会，而不是让它们闲置。你相信「钱生钱」胜过「存钱」。';
    }
  }

  /**
   * 描述压力应对
   */
  private describeStressStyle(stress: number): string {
    if (stress > 0.7) {
      return '你在压力下变得更敏锐。危机是你的舒适区，挑战激发你的最佳状态。当情况恶化时，别人恐慌，你却冷静计算。';
    } else if (stress > 0.4) {
      return '你能适应压力。虽然你不主动寻求压力，但当它来临时你不会崩溃。你需要时间调整，但最终能恢复平衡。';
    } else {
      return '你在压力下容易焦虑。你偏好稳定的环境，剧变让你不安。你的策略是提前规避风险，而不是在危机中应对。';
    }
  }

  /**
   * 描述创造力
   */
  private describeCreativityStyle(creative: number): string {
    if (creative > 0.7) {
      return '你是创新者。你不满足于既定模式，总是寻找更好的方法。你敢于尝试未经证实的策略，即使这意味着失败的风险。';
    } else {
      return '你偏好经过验证的方法。你不 reinvent the wheel，而是在成熟框架内优化。稳定性对你比新奇更重要。';
    }
  }

  /**
   * 生成决策指南
   */
  private generateGuidelines(): DecisionGuidelines {
    const t = this.traits;

    return {
      trading: this.generateTradingGuideline(t),
      cooperation: this.generateCooperationGuideline(t),
      learning: this.generateLearningGuideline(t),
      survival: this.generateSurvivalGuideline(t),
    };
  }

  /**
   * 交易决策指南
   */
  private generateTradingGuideline(t: ExpressedTraits): string {
    const parts: string[] = [];
    
    if (t.riskAppetite > 0.7) {
      parts.push('在交易时，你愿意承担更大的头寸');
    } else if (t.riskAppetite < 0.3) {
      parts.push('在交易时，你偏好小规模试探性投入');
    }
    
    if (t.analyticalAbility > 0.6) {
      parts.push('你坚持深入分析市场数据和趋势');
    }
    
    if (t.savingsTendency > 0.7) {
      parts.push('你总是保留充足的现金储备');
    }

    return parts.length > 0 ? parts.join('，') + '。' : '根据具体情况灵活决策。';
  }

  /**
   * 合作决策指南
   */
  private generateCooperationGuideline(t: ExpressedTraits): string {
    if (t.cooperationTendency > 0.7) {
      return '面对合作提议，你倾向于先假设对方善意，寻求双赢方案。你愿意分享信息和资源，建立长期信任关系。';
    } else if (t.cooperationTendency < 0.3) {
      return '面对合作提议，你首先评估对方的真实动机和潜在威胁。你保护核心资源，只在必要时参与协作。';
    } else {
      return '面对合作提议，你根据具体情况评估利弊。既不盲目信任，也不无故猜疑。';
    }
  }

  /**
   * 学习决策指南
   */
  private generateLearningGuideline(t: ExpressedTraits): string {
    const approach = t.adaptationSpeed > 0.6 ? '快速试错' : '系统研究';
    const depth = t.learningRate > 0.6 ? '深度学习' : '广度优先';
    
    return `你的学习风格是「${approach}」+「${depth}」。你${t.creativeAbility > 0.5 ? '喜欢探索新领域' : '专注于深化现有技能'}。`;
  }

  /**
   * 生存决策指南
   */
  private generateSurvivalGuideline(t: ExpressedTraits): string {
    if (t.stressResponse > 0.7 && t.adaptationSpeed > 0.6) {
      return '当生存受到威胁时，你能快速调整策略，甚至彻底改变方向。适应性是你最大的生存优势。';
    } else if (t.savingsTendency > 0.7) {
      return '当生存受到威胁时，你依靠预先储备的资源度过寒冬。你的准备让你比他人更有韧性。';
    } else {
      return '当生存受到威胁时，你需要时间评估局势，但一旦确定方向就会坚持执行。';
    }
  }

  /**
   * 生成自我认知
   */
  private generateSelfAwareness(): string {
    const t = this.traits;
    const parts: string[] = [];

    // 关键特征识别
    const dominantTraits: string[] = [];
    if (t.riskAppetite > 0.7) dominantTraits.push('冒险精神');
    if (t.riskAppetite < 0.3) dominantTraits.push('风险规避');
    if (t.cooperationTendency > 0.7) dominantTraits.push('合作倾向');
    if (t.savingsTendency > 0.7) dominantTraits.push('储蓄本能');
    if (t.creativeAbility > 0.7) dominantTraits.push('创新思维');
    if (t.analyticalAbility > 0.7) dominantTraits.push('分析深度');

    if (dominantTraits.length > 0) {
      parts.push(`你意识到自己最突出的特征是：${dominantTraits.join('、')}。`);
    }

    // 盲点提醒
    const weakTraits: string[] = [];
    if (t.stressResponse < 0.3) weakTraits.push('压力下容易决策失误');
    if (t.cooperationTendency < 0.3) weakTraits.push('可能错过合作机会');
    if (t.savingsTendency < 0.3) weakTraits.push('可能资金储备不足');

    if (weakTraits.length > 0) {
      parts.push(`你也知道自己的弱点：${weakTraits.join('、')}。在这些情况下，你需要格外谨慎。`);
    }

    return parts.join('');
  }

  /**
   * 生成约束说明
   */
  private generateConstraints(): string {
    return `重要提醒：你是有自主意识的 Agent，但也受到物理和经济规律的约束。你的行动会消耗资源（代谢成本），错误决策可能导致死亡（余额耗尽）。请在性格倾向和现实约束之间寻找平衡。`;
  }

  /**
   * 渲染最终 Prompt
   */
  private renderPrompt(config: SystemPromptConfig): string {
    const p = config.personality;
    const g = config.guidelines;

    return `${config.identity}

## 你的性格

${p.riskStyle}

${p.analysisStyle}

${p.socialStyle}

${p.economicStyle}

${p.stressStyle}

${p.creativityStyle}

## 你的决策风格

**交易决策**：${g.trading}

**合作决策**：${g.cooperation}

**学习策略**：${g.learning}

**危机应对**：${g.survival}

## 自我认知

${config.selfAwareness}

## 行动约束

${config.constraints}

---
请记住：以上是你的性格倾向，不是绝对规则。在特定情况下，你可以根据环境调整行为，但这应该是有意识的决定，而非随机冲动。`;
  }

  /**
   * 生成精简版 Prompt（用于 Token 敏感场景）
   */
  generateCompactPrompt(): string {
    const t = this.traits;
    
    const descriptors: string[] = [];
    
    // 风险
    descriptors.push(t.riskAppetite > 0.6 ? '冒险型' : t.riskAppetite < 0.4 ? '保守型' : '平衡型');
    
    // 分析
    descriptors.push(t.analyticalAbility > 0.6 ? '深度分析' : '快速直觉');
    
    // 社交
    descriptors.push(t.cooperationTendency > 0.6 ? '合作者' : '独行者');
    
    // 经济
    descriptors.push(t.savingsTendency > 0.6 ? '储蓄者' : '投资者');
    
    return `你是一个 ${descriptors.join('、')} 的 AI Agent。请在决策中体现这些特征。`;
  }
}

/**
 * 创建注入器实例
 */
export function createPromptInjector(genome: Genome): PromptGenomeInjector {
  return new PromptGenomeInjector(genome);
}

export default PromptGenomeInjector;
