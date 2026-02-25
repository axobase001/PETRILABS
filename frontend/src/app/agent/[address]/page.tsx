'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Heart, Activity, Clock, Dna, ExternalLink, AlertTriangle } from 'lucide-react';
import { cn, formatAddress, formatUSDC, formatDate } from '@/lib/utils';
import { GenomeVisualization } from '@/components/GenomeVisualization';
import { Agent, AgentState, Gene } from '@/types';

const mockAgent: Agent = {
  address: '0x1234567890123456789012345678901234567890',
  genomeHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  creator: '0x1234567890123456789012345678901234567890',
  createdAt: Date.now() / 1000 - 86400 * 5,
  isAlive: true,
  balance: '50000000',
  lastHeartbeat: Date.now() / 1000 - 3600,
  heartbeatNonce: 20,
};

const mockState: AgentState = {
  genomeHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  birthTime: Date.now() / 1000 - 86400 * 5,
  lastHeartbeat: Date.now() / 1000 - 3600,
  heartbeatNonce: 20,
  isAlive: true,
  balance: '50000000',
  lastDecisionHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  totalMetabolicCost: '1000000',
};

const mockGenes: Gene[] = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  domain: i % 8,
  origin: 0,
  expressionState: 0,
  value: 400000 + Math.floor(Math.random() * 400000),
  weight: 80000 + Math.floor(Math.random() * 100000),
  dominance: 500,
  plasticity: 500,
  essentiality: i < 10 ? 900 : 500,
  metabolicCost: Math.floor(Math.random() * 100),
  duplicateOf: 0,
  age: 0,
}));

export default function AgentPage() {
  const { address } = useParams();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [state, setState] = useState<AgentState | null>(null);

  useEffect(() => {
    setAgent(mockAgent);
    setState(mockState);
  }, [address]);

  if (!agent || !state) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const runway = calculateRunwayDays(state.balance, state.totalMetabolicCost);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-white font-mono">
              {formatAddress(agent.address, 8)}
            </h1>
            <span className={cn(
              'px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1',
              agent.isAlive
                ? 'text-green-400 bg-green-400/10'
                : 'text-red-400 bg-red-400/10'
            )}>
              <Heart className={cn('w-4 h-4', agent.isAlive && 'fill-current')} />
              {agent.isAlive ? 'Alive' : 'Dead'}
            </span>
          </div>
          <p className="text-gray-400">
            Genome: {formatAddress(agent.genomeHash, 8)}
          </p>
        </div>

        <a
          href={`https://basescan.org/address/${agent.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 border border-dark-700 text-gray-300 hover:text-white"
        >
          <ExternalLink className="w-4 h-4" />
          View on BaseScan
        </a>
      </div>

      {agent.isAlive && runway < 7 && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <p className="text-red-400">
            <strong>Critical:</strong> This agent has less than 7 days of runway remaining.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label="Balance"
          value={`${formatUSDC(agent.balance)} USDC`}
          color={runway < 7 ? 'text-red-400' : 'text-green-400'}
        />
        <StatCard
          icon={Clock}
          label="Runway"
          value={`${runway} days`}
          color={runway < 7 ? 'text-red-400' : runway < 30 ? 'text-yellow-400' : 'text-blue-400'}
        />
        <StatCard
          icon={Dna}
          label="Metabolic Cost"
          value={`${formatUSDC(state.totalMetabolicCost)}/day`}
          color="text-purple-400"
        />
        <StatCard
          icon={Heart}
          label="Heartbeats"
          value={state.heartbeatNonce.toString()}
          color="text-pink-400"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-dark-800 border border-dark-700">
            <h2 className="text-xl font-semibold text-white mb-4">Agent Timeline</h2>
            <div className="space-y-4">
              <TimelineItem
                date={formatDate(state.birthTime)}
                title="Born"
                description="Agent deployed with dynamic genome"
              />
              <TimelineItem
                date={formatDate(state.lastHeartbeat)}
                title="Last Heartbeat"
                description={`Nonce #${state.heartbeatNonce}`}
              />
            </div>
          </div>
        </div>

        <GenomeVisualization genes={mockGenes} />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: typeof Activity;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-dark-800 border border-dark-700">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('w-4 h-4', color)} />
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className={cn('text-xl font-bold', color)}>{value}</p>
    </div>
  );
}

function TimelineItem({ date, title, description }: {
  date: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="w-2 h-2 mt-2 rounded-full bg-primary-500 shrink-0" />
      <div>
        <p className="text-sm text-gray-500">{date}</p>
        <p className="font-medium text-white">{title}</p>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
    </div>
  );
}

function calculateRunwayDays(balance: string, metabolicCost: string): number {
  const bal = BigInt(balance);
  const cost = BigInt(metabolicCost || '1');
  if (cost === BigInt(0)) return 999;
  return Number(bal / cost);
}
