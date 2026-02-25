'use client';

import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CostBreakdownProps {
  costs: {
    breakdown: Array<{
      label: string;
      amount: number;
      description: string;
      isRequired: boolean;
    }>;
    totalUpfront: number;
    dailyTotal: number;
    estimatedRunwayDays: number;
  } | null;
}

export function CostBreakdown({ costs }: CostBreakdownProps) {
  if (!costs) return null;

  return (
    <div className="p-6 rounded-xl bg-dark-800 border border-dark-700">
      <h3 className="text-lg font-semibold text-white mb-4">
        Cost Breakdown
      </h3>
      
      {/* Upfront Costs */}
      <div className="space-y-3 mb-6">
        <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">
          Deployment Costs (One-time)
        </p>
        
        {costs.breakdown.map((item, index) => (
          <div
            key={index}
            className="flex items-start justify-between p-3 rounded-lg bg-dark-900"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{item.label}</span>
                <div className="group relative">
                  <Info className="w-4 h-4 text-gray-500 cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 rounded-lg bg-dark-900 border border-dark-700 text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {item.description}
                  </div>
                </div>
              </div>
            </div>
            <span className="font-mono text-gray-300">
              ${item.amount.toFixed(2)}
            </span>
          </div>
        ))}
        
        <div className="flex items-center justify-between pt-3 border-t border-dark-700">
          <span className="font-semibold text-white">Total Upfront</span>
          <span className="font-mono text-xl font-bold text-primary-400">
            ${costs.totalUpfront.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Daily Costs */}
      <div className="space-y-3 pt-6 border-t border-dark-700">
        <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">
          Runtime Costs (Daily)
        </p>
        
        <div className="grid grid-cols-3 gap-3">
          <DailyCostItem
            label="LLM Calls"
            cost={costs.dailyTotal * 0.5} // Estimate
            description="Decision making & learning"
          />
          <DailyCostItem
            label="Container"
            cost={costs.dailyTotal * 0.4}
            description="Akash compute"
          />
          <DailyCostItem
            label="Storage"
            cost={costs.dailyTotal * 0.1}
            description="Arweave writes"
          />
        </div>
        
        <div className="flex items-center justify-between p-3 rounded-lg bg-dark-900">
          <span className="text-gray-300">Daily Total</span>
          <span className="font-mono text-lg text-yellow-400">
            ~${costs.dailyTotal.toFixed(2)}/day
          </span>
        </div>
      </div>

      {/* Runway */}
      <div className="mt-6 p-4 rounded-lg bg-primary-500/10 border border-primary-500/30">
        <div className="flex items-center justify-between">
          <span className="text-gray-300">Estimated Runway</span>
          <span className={cn(
            'font-mono text-lg font-bold',
            costs.estimatedRunwayDays < 30 ? 'text-yellow-400' : 'text-green-400'
          )}>
            {Math.round(costs.estimatedRunwayDays)} days
          </span>
        </div>
        <p className="mt-2 text-sm text-gray-400">
          Based on initial deposit and estimated daily costs. 
          Actual costs may vary based on agent behavior.
        </p>
      </div>

      {/* Payment Info */}
      <div className="mt-6 space-y-2 text-sm text-gray-500">
        <p className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
          Deployment costs are paid once by you (user)
        </p>
        <p className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
          Runtime costs are paid by the agent from its balance via x402
        </p>
        <p className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          LLM calls use ainft.com with x402 protocol
        </p>
      </div>
    </div>
  );
}

function DailyCostItem({ label, cost, description }: {
  label: string;
  cost: number;
  description: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-dark-900 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="font-mono text-sm text-gray-300">${cost.toFixed(2)}</p>
      <p className="text-xs text-gray-600 mt-1">{description}</p>
    </div>
  );
}

export default CostBreakdown;
