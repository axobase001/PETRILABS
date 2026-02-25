import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string, length = 4): string {
  if (!address) return '';
  return `${address.slice(0, length + 2)}...${address.slice(-length)}`;
}

export function formatUSDC(amount: string | bigint, decimals = 6): string {
  const value = typeof amount === 'string' ? BigInt(amount) : amount;
  const divisor = BigInt(10 ** decimals);
  const integer = value / divisor;
  const fraction = value % divisor;
  
  return `${integer}.${fraction.toString().padStart(decimals, '0').slice(0, 2)}`;
}

export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'alive':
    case 'completed':
    case 'running':
      return 'text-green-400 bg-green-400/10';
    case 'dead':
    case 'failed':
      return 'text-red-400 bg-red-400/10';
    case 'queued':
    case 'deploying':
      return 'text-yellow-400 bg-yellow-400/10';
    default:
      return 'text-gray-400 bg-gray-400/10';
  }
}

export function getGeneDomainName(domain: number): string {
  const domains = [
    'Metabolism',
    'Perception',
    'Cognition',
    'Memory',
    'Resource Mgmt',
    'Risk Assessment',
    'Trading',
    'Income Strategy',
    'OnChain',
    'Web Nav',
    'Content',
    'Data Analysis',
    'API Util',
    'Social Media',
    'Cooperation',
    'Competition',
    'Communication',
    'Trust Model',
    'Mate Selection',
    'Parental Invest',
    'Human Hiring',
    'Human Comm',
    'Human Eval',
    'Stress Response',
    'Adaptation',
    'Dormancy',
    'Migration',
    'Self Model',
    'Strategy Eval',
    'Learning',
    'Planning',
    'Regulatory',
  ];
  return domains[domain] || 'Unknown';
}

export function generateGenomeVisualizationData(genes: { domain: number; value: number }[]): Array<{
  domain: string;
  value: number;
  count: number;
}> {
  const domainMap = new Map<number, { total: number; count: number }>();
  
  for (const gene of genes) {
    const current = domainMap.get(gene.domain) || { total: 0, count: 0 };
    current.total += gene.value;
    current.count += 1;
    domainMap.set(gene.domain, current);
  }
  
  return Array.from(domainMap.entries()).map(([domain, data]) => ({
    domain: getGeneDomainName(domain),
    value: data.total / data.count / 1000000, // Normalize to 0-1
    count: data.count,
  }));
}

export function calculateMatchScoreColor(score: number): string {
  if (score >= 8000) return 'text-green-400';
  if (score >= 6000) return 'text-yellow-400';
  if (score >= 4000) return 'text-orange-400';
  return 'text-red-400';
}
