import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAddress(address: string, start = 6, end = 4): string {
  if (!address) return ''
  if (address.length <= start + end) return address
  return `${address.slice(0, start)}...${address.slice(-end)}`
}

export function formatBalance(balance: string, decimals = 2): string {
  const num = parseFloat(balance)
  if (isNaN(num)) return '0.00'
  return num.toFixed(decimals)
}

export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'alive':
    case 'healthy':
      return 'text-status-alive bg-status-alive/10'
    case 'dead':
      return 'text-status-dead bg-status-dead/10'
    case 'warning':
      return 'text-status-warning bg-status-warning/10'
    case 'critical':
    case 'abandoned':
      return 'text-status-critical bg-status-critical/10'
    default:
      return 'text-gray-500 bg-gray-500/10'
  }
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'warning':
      return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
    case 'critical':
      return 'text-orange-500 bg-orange-500/10 border-orange-500/20'
    case 'abandoned':
      return 'text-red-500 bg-red-500/10 border-red-500/20'
    default:
      return 'text-gray-500 bg-gray-500/10 border-gray-500/20'
  }
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}
