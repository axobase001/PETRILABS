'use client';

import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { ReactNode } from 'react';

// Configure chains and providers
export const config = getDefaultConfig({
  appName: 'PETRILABS',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
  chains: [baseSepolia, base],
  transports: {
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org'),
    [base.id]: http('https://mainnet.base.org'),
  },
  ssr: true,
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60000,
    },
  },
});

// Provider wrapper
export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// Contract addresses
export const CONTRACTS = {
  genomeRegistry: process.env.NEXT_PUBLIC_GENOME_REGISTRY_ADDRESS as `0x${string}`,
  petriFactoryV2: process.env.NEXT_PUBLIC_PETRI_FACTORY_V2_ADDRESS as `0x${string}`,
  usdc: process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`,
};

// USDC ABI (simplified)
export const USDC_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Factory ABI (simplified)
export const FACTORY_ABI = [
  {
    inputs: [
      { name: 'memoryHash', type: 'bytes32' },
      { name: 'memoryURI', type: 'string' },
      { name: 'initialDeposit', type: 'uint256' },
    ],
    name: 'createAgentFromMemory',
    outputs: [{ name: 'agent', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'initialDeposit', type: 'uint256' }],
    name: 'createAgentRandom',
    outputs: [{ name: 'agent', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '_agent', type: 'address' }],
    name: 'getAgent',
    outputs: [{
      components: [
        { name: 'agent', type: 'address' },
        { name: 'creator', type: 'address' },
        { name: 'genomeHash', type: 'bytes32' },
        { name: 'createdAt', type: 'uint256' },
        { name: 'exists', type: 'bool' },
        { name: 'isFromMemory', type: 'bool' },
      ],
      name: '',
      type: 'tuple',
    }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Agent ABI (simplified)
export const AGENT_ABI = [
  {
    inputs: [],
    name: 'getState',
    outputs: [{
      components: [
        { name: 'genomeHash', type: 'bytes32' },
        { name: 'birthTime', type: 'uint256' },
        { name: 'lastHeartbeat', type: 'uint256' },
        { name: 'heartbeatNonce', type: 'uint256' },
        { name: 'isAlive', type: 'bool' },
        { name: 'balance', type: 'uint256' },
        { name: 'lastDecisionHash', type: 'bytes32' },
        { name: 'totalMetabolicCost', type: 'uint256' },
      ],
      name: '',
      type: 'tuple',
    }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'geneId', type: 'uint32' }],
    name: 'getGeneExpression',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
