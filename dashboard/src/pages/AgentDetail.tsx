import { useParams } from 'react-router-dom'
import { useAgent, useAgentStats, useAgentDecisions } from '@/hooks/useAgents'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import {
  formatAddress,
  formatBalance,
  formatDate,
  formatDuration,
} from '@/lib/utils'
import {
  Activity,
  Wallet,
  Clock,
  Zap,
  Dna,
  AlertTriangle,
} from 'lucide-react'

export function AgentDetail() {
  const { address } = useParams<{ address: string }>()
  const { data: agentData, isLoading: agentLoading } = useAgent(address || '')
  const { data: statsData, isLoading: statsLoading } = useAgentStats(
    address || ''
  )
  const { data: decisionsData } = useAgentDecisions(address || '', {
    limit: 10,
  })

  const agent = agentData?.data
  const stats = statsData?.data
  const decisions = decisionsData?.data || []

  if (agentLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-400" />
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Agent not found</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src={agent.avatarUrl}
            alt={agent.name}
            className="w-16 h-16 rounded-full"
          />
          <div>
            <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
            <p className="text-gray-400 font-mono">{formatAddress(agent.address, 8, 6)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="status" value={agent.status} />
          <Button variant="secondary" size="sm">
            <Activity size={16} className="mr-2" />
            Monitor
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Wallet size={20} />}
          label="Balance"
          value={`$${formatBalance(agent.balance)}`}
          color="text-green-400"
        />
        <StatCard
          icon={<Zap size={20} />}
          label="Heartbeats"
          value={agent.heartbeatNonce}
          color="text-yellow-400"
        />
        <StatCard
          icon={<Clock size={20} />}
          label="Age"
          value={stats?.lifetime.age || 'N/A'}
          color="text-blue-400"
        />
        <StatCard
          icon={<Activity size={20} />}
          label="Success Rate"
          value={`${Math.round((stats?.activity.successRate || 0) * 100)}%`}
          color="text-purple-400"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Genome Expression */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Dna size={20} className="text-primary-400" />
                <CardTitle>Genome Expression</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {agent.genome?.expression &&
                  Object.entries(agent.genome.expression)
                    .slice(0, 8)
                    .map(([key, value]) => (
                      <GeneTrait key={key} name={key} value={value as number} />
                    ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Decisions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Decisions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {decisions.map((decision: any) => (
                  <DecisionRow key={decision.id} decision={decision} />
                ))}
                {decisions.length === 0 && (
                  <p className="text-gray-400 text-center py-4">
                    No decisions found
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Heartbeat Status */}
          <Card>
            <CardHeader>
              <CardTitle>Heartbeat Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <StatusItem
                label="Health"
                value={agent.heartbeatStatus?.isHealthy ? 'Healthy' : 'At Risk'}
                status={agent.heartbeatStatus?.isHealthy ? 'healthy' : 'warning'}
              />
              <StatusItem
                label="Next Expected"
                value={
                  agent.heartbeatStatus?.nextExpected
                    ? formatDate(agent.heartbeatStatus.nextExpected)
                    : 'N/A'
                }
              />
              <StatusItem
                label="Deadline"
                value={
                  agent.heartbeatStatus?.deadline
                    ? formatDate(agent.heartbeatStatus.deadline)
                    : 'N/A'
                }
              />
              <StatusItem
                label="Time Until Deadline"
                value={
                  agent.heartbeatStatus?.timeUntilDeadline
                    ? formatDuration(agent.heartbeatStatus.timeUntilDeadline)
                    : 'N/A'
                }
              />
            </CardContent>
          </Card>

          {/* Financial Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Financial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FinancialRow
                label="Initial Deposit"
                value={`$${formatBalance(stats?.financial.initialDeposit || '0')}`}
              />
              <FinancialRow
                label="Current Balance"
                value={`$${formatBalance(stats?.financial.currentBalance || '0')}`}
              />
              <FinancialRow
                label="Total Profit"
                value={`$${formatBalance(stats?.financial.totalProfit || '0')}`}
                positive={parseFloat(stats?.financial.totalProfit || '0') >= 0}
              />
              <FinancialRow label="ROI" value={stats?.financial.roi || '0%'} />
            </CardContent>
          </Card>

          {/* Skills */}
          <Card>
            <CardHeader>
              <CardTitle>Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {agent.skills?.active?.map((skill: string) => (
                  <span
                    key={skill}
                    className="px-3 py-1 bg-gray-700 rounded-full text-sm text-gray-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-gray-400 text-sm">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
          <div className={`p-2 bg-gray-700 rounded-lg ${color}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function GeneTrait({ name, value }: { name: string; value: number }) {
  return (
    <div className="p-3 bg-gray-700/50 rounded-lg">
      <p className="text-gray-400 text-xs capitalize">{name.replace(/([A-Z])/g, ' $1').trim()}</p>
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full"
            style={{ width: `${value * 100}%` }}
          />
        </div>
        <span className="text-white text-sm">{Math.round(value * 100)}%</span>
      </div>
    </div>
  )
}

function DecisionRow({ decision }: { decision: any }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-white font-medium">{decision.action}</span>
          {decision.result?.success ? (
            <span className="text-green-400 text-xs">Success</span>
          ) : (
            <span className="text-red-400 text-xs">Failed</span>
          )}
        </div>
        <p className="text-gray-400 text-sm">{formatDate(decision.timestamp)}</p>
      </div>
      {decision.result?.txHash && (
        <a
          href={`https://basescan.org/tx/${decision.result.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-400 text-sm hover:underline"
        >
          View
        </a>
      )}
    </div>
  )
}

function StatusItem({
  label,
  value,
  status,
}: {
  label: string
  value: string
  status?: 'healthy' | 'warning' | 'critical'
}) {
  const statusColors = {
    healthy: 'text-green-400',
    warning: 'text-yellow-400',
    critical: 'text-red-400',
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className={status ? statusColors[status] : 'text-white'}>{value}</span>
    </div>
  )
}

function FinancialRow({
  label,
  value,
  positive,
}: {
  label: string
  value: string
  positive?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span
        className={
          positive !== undefined
            ? positive
              ? 'text-green-400'
              : 'text-red-400'
            : 'text-white'
        }
      >
        {value}
      </span>
    </div>
  )
}

export default AgentDetail
