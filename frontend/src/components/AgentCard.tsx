'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Activity, Clock, Dna, ExternalLink } from 'lucide-react';
import { cn, formatAddress, formatUSDC, formatDuration, getStatusColor } from '@/lib/utils';
import { Agent } from '@/types';

interface AgentCardProps {
  agent: Agent;
  viewMode?: 'grid' | 'list';
}

export function AgentCard({ agent, viewMode = 'grid' }: AgentCardProps) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);

  const isList = viewMode === 'list';
  const status = agent.isAlive ? 'alive' : 'dead';
  const runway = calculateRunway(agent.balance, agent.totalMetabolicCost);

  return (
    <div
      onClick={() => router.push(`/agent/${agent.address}`)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'group relative rounded-xl border transition-all cursor-pointer',
        'bg-dark-800 border-dark-700 hover:border-primary-500/50',
        isHovered && 'shadow-lg shadow-primary-500/10',
        isList && 'flex items-center gap-6 p-4',
        !isList && 'p-6'
      )}
    >
      {/* Status Indicator */}
      <div className={cn(
        'absolute top-4 right-4 flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium',
        getStatusColor(status)
      )}>
        <Heart className={cn(
          'w-3 h-3',
          agent.isAlive && 'fill-current'
        )} />
        {agent.isAlive ? 'Alive' : 'Dead'}
      </div>

      {/* Avatar / Genome Visualization */}
      <div className={cn(
        'relative rounded-lg overflow-hidden bg-dark-900',
        isList ? 'w-16 h-16 shrink-0' : 'w-full aspect-square mb-4'
      )}>
        <GenomeAvatar genomeHash={agent.genomeHash} isAlive={agent.isAlive} />
      </div>

      {/* Content */}
      <div className={cn('flex-1 min-w-0', !isList && 'space-y-3')}>
        {/* Address */}
        <div>
          <h3 className="font-mono text-lg text-white truncate">
            {formatAddress(agent.address)}
          </h3>
          <p className="text-sm text-gray-400">
            {formatAddress(agent.genomeHash, 6)}
          </p>
        </div>

        {/* Stats */}
        <div className={cn(
          'grid gap-4',
          isList ? 'grid-cols-3' : 'grid-cols-2'
        )}>
          <Stat
            icon={Activity}
            label="Balance"
            value={`${formatUSDC(agent.balance)} USDC`}
            color={parseFloat(agent.balance) < 1e6 ? 'text-red-400' : 'text-green-400'}
          />
          <Stat
            icon={Clock}
            label="Runway"
            value={runway}
            color={runway.includes('d') && parseInt(runway) < 7 ? 'text-red-400' : 'text-blue-400'}
          />
          <Stat
            icon={Dna}
            label="Heartbeats"
            value={agent.heartbeatNonce.toString()}
            color="text-purple-400"
          />
        </div>
      </div>

      {/* External Link */}
      <div className={cn(
        'transition-opacity',
        isList ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      )}>
        <ExternalLink className="w-5 h-5 text-gray-400" />
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: {
  icon: typeof Activity;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn('w-4 h-4', color)} />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={cn('text-sm font-medium', color)}>{value}</p>
      </div>
    </div>
  );
}

function GenomeAvatar({ genomeHash, isAlive }: { genomeHash: string; isAlive: boolean }) {
  // Generate deterministic visual from genome hash
  const seed = parseInt(genomeHash.slice(2, 10), 16);
  const hue1 = (seed % 360);
  const hue2 = ((seed >> 8) % 360);
  
  return (
    <div
      className={cn(
        'w-full h-full transition-all duration-500',
        !isAlive && 'grayscale opacity-50'
      )}
      style={{
        background: `conic-gradient(
          from ${seed % 360}deg,
          hsl(${hue1}, 70%, 50%),
          hsl(${hue2}, 70%, 50%),
          hsl(${(hue1 + 180) % 360}, 70%, 50%),
          hsl(${hue1}, 70%, 50%)
        )`,
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/30" />
    </div>
  );
}

function calculateRunway(balance: string, metabolicCost: string): string {
  const bal = BigInt(balance);
  const cost = BigInt(metabolicCost || '1');
  
  if (cost === BigInt(0)) return '∞';
  
  const days = Number(bal / cost);
  if (days > 365) return '1y+';
  if (days > 30) return `${Math.floor(days / 30)}m`;
  return `${days}d`;
}

export default AgentCard;
