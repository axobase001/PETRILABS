'use client';

import { useMemo } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import { cn, getGeneDomainName } from '@/lib/utils';

interface GenomeVisualizationProps {
  genes: Array<{
    domain: number;
    value: number;
    weight: number;
  }>;
  className?: string;
}

export function GenomeVisualization({ genes, className }: GenomeVisualizationProps) {
  const radarData = useMemo(() => {
    // Aggregate by domain
    const domainMap = new Map<number, { total: number; count: number }>();
    
    for (const gene of genes) {
      const current = domainMap.get(gene.domain) || { total: 0, count: 0 };
      const normalizedValue = (gene.value * gene.weight) / 1000000 / 1000000;
      current.total += normalizedValue;
      current.count += 1;
      domainMap.set(gene.domain, current);
    }
    
    // Select top 8 domains for radar
    return Array.from(domainMap.entries())
      .map(([domain, data]) => ({
        domain: getGeneDomainName(domain),
        fullMark: 2,
        value: Math.min(2, data.total / Math.max(1, data.count)),
        count: data.count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [genes]);

  const barData = useMemo(() => {
    return radarData.slice(0, 6).map((d, i) => ({
      ...d,
      fill: getDomainColor(i),
    }));
  }, [radarData]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Radar Chart */}
      <div className="p-4 rounded-xl bg-dark-800 border border-dark-700">
        <h3 className="text-lg font-medium text-white mb-4">Genome Expression</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="#374151" />
              <PolarAngleAxis
                dataKey="domain"
                tick={{ fill: '#9ca3af', fontSize: 12 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 2]}
                tick={{ fill: '#6b7280', fontSize: 10 }}
              />
              <Radar
                name="Expression"
                dataKey="value"
                stroke="#0ea5e9"
                strokeWidth={2}
                fill="#0ea5e9"
                fillOpacity={0.3}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload[0]) {
                    const data = payload[0].payload;
                    return (
                      <div className="p-3 rounded-lg bg-dark-900 border border-dark-700 shadow-xl">
                        <p className="font-medium text-white">{data.domain}</p>
                        <p className="text-sm text-primary-400">
                          Expression: {(data.value * 100).toFixed(1)}%
                        </p>
                        <p className="text-xs text-gray-500">
                          {data.count} genes
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="p-4 rounded-xl bg-dark-800 border border-dark-700">
        <h3 className="text-lg font-medium text-white mb-4">Top Domains</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical">
              <XAxis
                type="number"
                domain={[0, 2]}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                stroke="#374151"
              />
              <YAxis
                type="category"
                dataKey="domain"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                width={100}
                stroke="#374151"
              />
              <Tooltip
                cursor={{ fill: 'rgba(55, 65, 81, 0.3)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload[0]) {
                    const data = payload[0].payload;
                    return (
                      <div className="p-3 rounded-lg bg-dark-900 border border-dark-700 shadow-xl">
                        <p className="font-medium text-white">{data.domain}</p>
                        <p className="text-sm text-primary-400">
                          {(data.value * 100).toFixed(1)}%
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {barData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gene List */}
      <div className="p-4 rounded-xl bg-dark-800 border border-dark-700">
        <h3 className="text-lg font-medium text-white mb-4">Gene Details</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {genes.slice(0, 10).map((gene, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3 rounded-lg bg-dark-900"
            >
              <div>
                <p className="text-sm font-medium text-gray-300">
                  {getGeneDomainName(gene.domain)}
                </p>
                <p className="text-xs text-gray-500">
                  Weight: {(gene.weight / 100000).toFixed(2)}x
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono text-primary-400">
                  {(gene.value / 1000000 * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          ))}
          {genes.length > 10 && (
            <p className="text-center text-sm text-gray-500 py-2">
              +{genes.length - 10} more genes
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function getDomainColor(index: number): string {
  const colors = [
    '#0ea5e9', // primary-500
    '#22c55e', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
  ];
  return colors[index % colors.length];
}

export default GenomeVisualization;
