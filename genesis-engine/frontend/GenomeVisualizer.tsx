/**
 * GenomeVisualizer 组件
 * 基因组可视化 - 8条染色体横向条形图
 */

import React from 'react';
import type { GenomeMapping } from '../src/MappingLayer';

interface GenomeVisualizerProps {
  genome: GenomeMapping | null;
}

// 染色体颜色配置
const CHROMOSOME_COLORS: Record<string, string> = {
  A_metabolism: 'bg-green-500',
  B_cognition: 'bg-blue-500',
  C_behavior: 'bg-orange-500',
  D_capability: 'bg-purple-500',
  E_social: 'bg-pink-500',
  F_strategy: 'bg-indigo-500',
  G_resilience: 'bg-red-500',
  H_identity: 'bg-teal-500'
};

// 染色体中文名
const CHROMOSOME_NAMES: Record<string, string> = {
  A_metabolism: '代谢',
  B_cognition: '认知',
  C_behavior: '行为',
  D_capability: '能力',
  E_social: '社交',
  F_strategy: '策略',
  G_resilience: '韧性',
  H_identity: '身份'
};

export const GenomeVisualizer: React.FC<GenomeVisualizerProps> = ({ genome }) => {
  if (!genome) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>上传记忆文件并点击"生成基因组"后查看结果</p>
      </div>
    );
  }

  const { chromosomes, quality_metrics } = genome;

  return (
    <div className="space-y-6">
      {/* 质量指标摘要 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold text-gray-700 mb-3">质量指标</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">总基因数</span>
            <p className="font-medium">{quality_metrics?.total_genes || 63}</p>
          </div>
          <div>
            <span className="text-gray-500">高置信度</span>
            <p className="font-medium text-green-600">
              {quality_metrics?.high_confidence_count || 0}
            </p>
          </div>
          <div>
            <span className="text-gray-500">平均置信度</span>
            <p className="font-medium">
              {(quality_metrics?.average_confidence || 0).toFixed(2)}
            </p>
          </div>
          <div>
            <span className="text-gray-500">极端值</span>
            <p className="font-medium text-orange-600">
              {quality_metrics?.extreme_value_count || 0}
            </p>
          </div>
        </div>
        {quality_metrics?.mapping_notes && (
          <p className="text-sm text-gray-600 mt-2">
            {quality_metrics.mapping_notes}
          </p>
        )}
      </div>

      {/* 染色体可视化 */}
      <div className="space-y-6">
        {Object.entries(chromosomes).map(([chromName, genes]) => (
          <ChromosomeSection
            key={chromName}
            name={chromName}
            genes={genes}
          />
        ))}
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-6 text-sm text-gray-600 bg-gray-50 rounded p-3">
        <span className="font-medium">图例:</span>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <span>高置信度 (&gt;=0.6)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-300 rounded border border-dashed border-gray-400"></div>
          <span>低置信度 (&lt;0.6)</span>
        </div>
      </div>
    </div>
  );
};

// 单条染色体组件
interface ChromosomeSectionProps {
  name: string;
  genes: Record<string, { value: number; confidence: number; evidence: string }>;
}

const ChromosomeSection: React.FC<ChromosomeSectionProps> = ({ name, genes }) => {
  const colorClass = CHROMOSOME_COLORS[name] || 'bg-gray-500';
  const displayName = CHROMOSOME_NAMES[name] || name;
  const geneList = Object.entries(genes);

  return (
    <div className="border rounded-lg p-4">
      <h4 className="font-semibold text-gray-700 mb-3 flex items-center">
        <span className={`w-3 h-3 rounded-full ${colorClass} mr-2`}></span>
        {displayName}染色体 ({geneList.length}个基因)
      </h4>
      
      <div className="space-y-2">
        {geneList.map(([geneName, geneData]) => (
          <GeneBar
            key={geneName}
            name={geneName}
            value={geneData.value}
            confidence={geneData.confidence}
            colorClass={colorClass}
          />
        ))}
      </div>
    </div>
  );
};

// 单个基因条形图
interface GeneBarProps {
  name: string;
  value: number;
  confidence: number;
  colorClass: string;
}

const GeneBar: React.FC<GeneBarProps> = ({ name, value, confidence, colorClass }) => {
  const isLowConfidence = confidence < 0.6;
  const displayName = name.split('_')[1] || name; // 去掉前缀
  const percentage = Math.round(value * 100);
  
  return (
    <div className="group">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-600 font-medium truncate" title={name}>
          {displayName}
        </span>
        <span className={`${isLowConfidence ? 'text-gray-400' : 'text-gray-600'}`}>
          {percentage}% (c:{confidence.toFixed(2)})
        </span>
      </div>
      
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`
            h-full transition-all duration-500
            ${isLowConfidence ? 'bg-gray-300 border-t border-b border-dashed border-gray-400' : colorClass}
          `}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      
      {/* Tooltip */}
      <div className="hidden group-hover:block absolute z-10 bg-gray-800 text-white text-xs rounded p-2 max-w-xs">
        <p className="font-medium">{name}</p>
        <p>Value: {value.toFixed(3)}</p>
        <p>Confidence: {confidence.toFixed(3)}</p>
      </div>
    </div>
  );
};

export default GenomeVisualizer;
