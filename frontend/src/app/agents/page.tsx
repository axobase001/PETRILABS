'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Grid, List, Filter } from 'lucide-react';
import { AgentCard } from '@/components/AgentCard';
import { useAppStore } from '@/stores/app';
import { cn } from '@/lib/utils';
import { Agent } from '@/types';

const mockAgents: Agent[] = [
  {
    address: '0x1234567890123456789012345678901234567890',
    genomeHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    creator: '0x1234567890123456789012345678901234567890',
    createdAt: Date.now() / 1000 - 86400 * 5,
    isAlive: true,
    balance: '50000000',
    lastHeartbeat: Date.now() / 1000 - 3600,
    heartbeatNonce: 20,
  },
  {
    address: '0x0987654321098765432109876543210987654321',
    genomeHash: '0x0987654321098765432109876543210987654321098765432109876543210987',
    creator: '0x1234567890123456789012345678901234567890',
    createdAt: Date.now() / 1000 - 86400 * 15,
    isAlive: true,
    balance: '120000000',
    lastHeartbeat: Date.now() / 1000 - 7200,
    heartbeatNonce: 55,
  },
];

export default function AgentsPage() {
  const { address, isConnected } = useAccount();
  const { viewMode, setViewMode, filters, setFilters } = useAppStore();
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    setAgents(mockAgents);
  }, [address]);

  const filteredAgents = agents.filter((agent) => {
    if (filters.status === 'alive') return agent.isAlive;
    if (filters.status === 'dead') return !agent.isAlive;
    return true;
  });

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-white mb-4">Connect Wallet</h2>
        <p className="text-gray-400">
          Connect your wallet to view your deployed agents.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">My Agents</h1>
          <p className="text-gray-400 mt-1">
            {filteredAgents.filter(a => a.isAlive).length} alive, {' '}
            {filteredAgents.filter(a => !a.isAlive).length} deceased
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ status: e.target.value as any })}
            className="px-4 py-2 rounded-lg bg-dark-800 border border-dark-700 text-white"
          >
            <option value="all">All Status</option>
            <option value="alive">Alive</option>
            <option value="dead">Dead</option>
          </select>

          <div className="flex rounded-lg bg-dark-800 border border-dark-700 p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-2 rounded-md transition-colors',
                viewMode === 'grid' ? 'bg-dark-700 text-white' : 'text-gray-400'
              )}
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 rounded-md transition-colors',
                viewMode === 'list' ? 'bg-dark-700 text-white' : 'text-gray-400'
              )}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {filteredAgents.length > 0 ? (
        <div className={cn(
          'grid gap-4',
          viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'
        )}>
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.address} agent={agent} viewMode={viewMode} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-dark-800 rounded-xl border border-dark-700">
          <Filter className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No agents found</h3>
          <p className="text-gray-400">
            {agents.length === 0
              ? "You haven't deployed any agents yet."
              : "No agents match the current filters."}
          </p>
        </div>
      )}
    </div>
  );
}
