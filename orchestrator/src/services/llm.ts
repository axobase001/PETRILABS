/**
 * LLM Service with ainft.com Integration
 * Uses ainft.com for genome analysis with cost tracking
 */

import AINFTService from './ainft';
import { logger } from '../utils/logger';
import {
  Gene,
  GeneDomain,
  GeneOrigin,
  ExpressionState,
  MemoryAnalysis,
  GeneratedGenome,
  GenomeInput,
} from '../types';
import { DEFAULT_GENES, GENE_COUNT } from '../config/genes';

export class LLMService {
  private ainft: AINFTService;
  private model: string;

  constructor() {
    // Use ainft.com with API key for deployment (user pre-pays)
    this.ainft = new AINFTService(
      undefined, // No x402 for deployment
      process.env.LLM_API_KEY
    );
    this.model = process.env.LLM_MODEL || 'claude-3-opus-20240229';
  }

  /**
   * Analyze user memory file to extract personality traits
   * COST: User pre-pays via API key
   */
  async analyzeMemory(content: string): Promise<MemoryAnalysis> {
    const prompt = `Analyze the following memory content to extract personality traits and behavioral patterns for an AI agent.

Content:
"""
${content.slice(0, 10000)}
"""

Provide a JSON analysis with the following structure:
{
  "personalityTraits": [
    {"trait": "risk_tolerance", "confidence": 0.8, "value": 0.7},
    ...
  ],
  "behaviorPatterns": [
    {"pattern": "aggressive_trading", "frequency": 0.6},
    ...
  ],
  "riskProfile": "aggressive" | "moderate" | "conservative",
  "socialTendency": "extroverted" | "ambivert" | "introverted",
  "cognitiveStyle": "analytical" | "intuitive" | "balanced",
  "suggestedDomains": [0, 1, 2...],
  "matchScore": 7500
}

Traits to analyze:
- risk_tolerance: willingness to take risks (0=avoid, 1=seek)
- analytical_depth: preference for deep analysis vs quick action
- social_orientation: preference for working with others vs alone
- innovation_drive: preference for new things vs proven methods
- persistence: tendency to continue despite setbacks
- resource_efficiency: attention to cost optimization
- planning_horizon: short-term vs long-term thinking

Be precise with confidence scores. If the content is insufficient, indicate low confidence.`;

    try {
      const startTime = Date.now();
      
      const response = await this.ainft.createCompletion({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a personality analysis system for AI agent genome generation. Always respond with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      const analysis: MemoryAnalysis = JSON.parse(content);
      
      logger.info('Memory analysis completed', {
        duration: Date.now() - startTime,
        matchScore: analysis.matchScore,
        traitsCount: analysis.personalityTraits.length,
        cost: response.cost,
      });

      return analysis;
    } catch (error) {
      logger.error('Failed to analyze memory', { error });
      throw error;
    }
  }

  /**
   * Generate genome from memory analysis
   * COST: Free (local computation)
   */
  async generateGenome(
    input: GenomeInput,
    analysis: MemoryAnalysis
  ): Promise<GeneratedGenome> {
    const startTime = Date.now();
    
    // Generate genes based on analysis
    const genes: Gene[] = DEFAULT_GENES.map((geneDef, index) => {
      const gene = this.geneFromDefinition(geneDef, index + 1);
      const adjustedGene = this.adjustGeneByAnalysis(gene, analysis);
      return adjustedGene;
    });

    // Create chromosomes
    const chromosomes = this.createChromosomes(genes);

    // Generate regulatory network
    const regulatoryEdges = this.createRegulatoryNetwork(genes);

    logger.info('Genome generated', {
      duration: Date.now() - startTime,
      geneCount: genes.length,
      chromosomeCount: chromosomes.length,
      edgeCount: regulatoryEdges.length,
    });

    return {
      input,
      genes,
      chromosomes,
      regulatoryEdges,
      analysis,
      metadata: {
        generatedAt: Date.now(),
        llmModel: this.model,
        analysisDuration: Date.now() - startTime,
        estimatedCost: this.ainft.calculateAnalysisCost(
          input.memoryDataHash.length
        ),
      },
    };
  }

  /**
   * Generate random genome (fallback)
   * COST: Free
   */
  async generateRandomGenome(input: GenomeInput): Promise<GeneratedGenome> {
    const startTime = Date.now();
    
    const genes: Gene[] = DEFAULT_GENES.map((geneDef, index) => {
      const gene = this.geneFromDefinition(geneDef, index + 1);
      
      // Randomize value around default 0.5
      gene.value = this.clamp(
        500000 + this.gaussianRandom(0, 150000),
        100000,
        900000
      );
      
      // Randomize weight around 1.0
      gene.weight = this.clamp(
        100000 + this.gaussianRandom(0, 30000),
        50000,
        200000
      );
      
      return gene;
    });

    const chromosomes = this.createChromosomes(genes);
    const regulatoryEdges = this.createRegulatoryNetwork(genes);

    logger.info('Random genome generated', {
      duration: Date.now() - startTime,
      geneCount: genes.length,
    });

    return {
      input,
      genes,
      chromosomes,
      regulatoryEdges,
      analysis: {
        personalityTraits: [],
        behaviorPatterns: [],
        riskProfile: 'moderate',
        socialTendency: 'ambivert',
        cognitiveStyle: 'balanced',
        suggestedDomains: Object.values(GeneDomain).filter(v => typeof v === 'number') as GeneDomain[],
        matchScore: 0,
      },
      metadata: {
        generatedAt: Date.now(),
        llmModel: 'random',
        analysisDuration: 0,
        estimatedCost: '0',
      },
    };
  }

  // ... rest of the implementation (same as before) ...
  private geneFromDefinition(geneDef: typeof DEFAULT_GENES[0], id: number): Gene {
    return {
      id,
      domain: geneDef.domain,
      origin: GeneOrigin.PRIMORDIAL,
      expressionState: ExpressionState.ACTIVE,
      value: 500000,
      weight: 100000,
      dominance: 500,
      plasticity: 500,
      essentiality: geneDef.essentiality,
      metabolicCost: geneDef.metabolicCost,
      duplicateOf: 0,
      age: 0,
    };
  }

  private adjustGeneByAnalysis(gene: Gene, analysis: MemoryAnalysis): Gene {
    const traitAdjustments: Record<string, { domains: GeneDomain[]; valueMap: (v: number) => number }> = {
      risk_tolerance: {
        domains: [GeneDomain.RISK_ASSESSMENT, GeneDomain.TRADING],
        valueMap: (v) => 200000 + v * 600000,
      },
      analytical_depth: {
        domains: [GeneDomain.COGNITION, GeneDomain.DATA_ANALYSIS],
        valueMap: (v) => 300000 + v * 500000,
      },
      social_orientation: {
        domains: [GeneDomain.COOPERATION, GeneDomain.COMMUNICATION],
        valueMap: (v) => v * 1000000,
      },
      innovation_drive: {
        domains: [GeneDomain.ADAPTATION, GeneDomain.API_UTILIZATION],
        valueMap: (v) => 100000 + v * 800000,
      },
      persistence: {
        domains: [GeneDomain.STRESS_RESPONSE, GeneDomain.LEARNING],
        valueMap: (v) => 200000 + v * 600000,
      },
      resource_efficiency: {
        domains: [GeneDomain.METABOLISM, GeneDomain.RESOURCE_MANAGEMENT],
        valueMap: (v) => 300000 + v * 500000,
      },
      planning_horizon: {
        domains: [GeneDomain.PLANNING, GeneDomain.RISK_ASSESSMENT],
        valueMap: (v) => v * 1000000,
      },
    };

    for (const trait of analysis.personalityTraits) {
      const adjustment = traitAdjustments[trait.trait];
      if (adjustment && adjustment.domains.includes(gene.domain)) {
        const targetValue = adjustment.valueMap(trait.value);
        gene.value = Math.floor(
          gene.value * (1 - trait.confidence) + targetValue * trait.confidence
        );
      }
    }

    if (analysis.riskProfile === 'conservative') {
      if (gene.domain === GeneDomain.RISK_ASSESSMENT) {
        gene.value = Math.floor(gene.value * 0.7);
      }
      if (gene.domain === GeneDomain.RESOURCE_MANAGEMENT) {
        gene.value = Math.floor(gene.value * 1.3);
        gene.value = Math.min(gene.value, 1000000);
      }
    } else if (analysis.riskProfile === 'aggressive') {
      if (gene.domain === GeneDomain.RISK_ASSESSMENT) {
        gene.value = Math.floor(gene.value * 1.3);
        gene.value = Math.min(gene.value, 1000000);
      }
      if (gene.domain === GeneDomain.ADAPTATION) {
        gene.value = Math.floor(gene.value * 1.2);
        gene.value = Math.min(gene.value, 1000000);
      }
    }

    return gene;
  }

  private createChromosomes(genes: Gene[]): { id: number; isEssential: boolean; geneIds: number[] }[] {
    const groups: Record<string, number[]> = {};
    
    for (const gene of genes) {
      const geneDef = DEFAULT_GENES.find((g, idx) => idx + 1 === gene.id);
      if (!geneDef) continue;
      
      const prefix = geneDef.id[0];
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(gene.id);
    }

    return Object.entries(groups).map(([prefix, geneIds], index) => ({
      id: index,
      isEssential: prefix === 'A' || prefix === 'R',
      geneIds,
    }));
  }

  private createRegulatoryNetwork(genes: Gene[]): { regulator: number; target: number; edgeType: 0 | 1 | 2; strength: number }[] {
    const edges: { regulator: number; target: number; edgeType: 0 | 1 | 2; strength: number }[] = [];
    const regulatoryGenes = genes.filter(g => g.domain === GeneDomain.REGULATORY);
    
    for (const reg of regulatoryGenes) {
      const targetDomains = this.getRegulatorTargets(reg.id);
      
      for (const targetGene of genes) {
        if (targetDomains.includes(targetGene.domain) && targetGene.id !== reg.id) {
          edges.push({
            regulator: reg.id,
            target: targetGene.id,
            edgeType: 0,
            strength: 300 + Math.floor(Math.random() * 400),
          });
        }
      }
    }

    return edges;
  }

  private getRegulatorTargets(regulatorId: number): GeneDomain[] {
    const targetMap: Record<number, GeneDomain[]> = {
      64: Object.values(GeneDomain).filter(v => typeof v === 'number') as GeneDomain[],
      65: [GeneDomain.STRESS_RESPONSE, GeneDomain.DORMANCY, GeneDomain.METABOLISM],
      66: [GeneDomain.PERCEPTION, GeneDomain.COGNITION],
      67: [GeneDomain.COOPERATION, GeneDomain.COMPETITION, GeneDomain.COMMUNICATION],
    };
    
    return targetMap[regulatorId] || [];
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private gaussianRandom(mean: number, std: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * std;
  }

  /**
   * Calculate estimated cost for analysis
   */
  calculateAnalysisCost(contentLength: number): string {
    return this.ainft.calculateAnalysisCost(contentLength);
  }
}

export default LLMService;
