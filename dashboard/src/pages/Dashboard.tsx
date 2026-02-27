import { useEffect } from 'react'
import { Activity, Users, Wallet, AlertTriangle, TrendingUp } from 'lucide-react'
import { useOverview, useAgents } from '@/hooks/useAgents'
import { useWebSocket } from '@/hooks/useWebSocket'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { formatBalance } from '@/lib/utils'

export function Dashboard() {
  const { data: overview } = useOverview()
  const { data: agentsData } = useAgents({ limit: 5 })
  useWebSocket()

  const stats = overview?.data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400">
          Welcome to PETRILABS Agent Ecosystem
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Agents"
          value={stats?.agents.total || 0}
          subtitle={`${stats?.agents.alive || 0} alive`}
          icon={<Users className="text-primary-400" size={24} />}
        />
        <StatCard
          title="Total Value Locked"
          value={`$${formatBalance(stats?.economics.totalValueLocked || '0')}`}
          subtitle="USDC"
          icon={<Wallet className="text-green-400" size={24} />}
        />
        <StatCard
          title="24h Decisions"
          value={stats?.activity.decisions24h || 0}
          subtitle={`${Math.round((stats?.activity.successRate24h || 0) * 100)}% success rate`}
          icon={<Activity className="text-blue-400" size={24} />}
        />
        <StatCard
          title="Skill Executions"
          value={stats?.skills.totalExecutions || 0}
          subtitle={`Revenue: $${stats?.skills.totalRevenue || '0'}`}
          icon={<TrendingUp className="text-purple-400" size={24} />}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Agents */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {agentsData?.data?.map((agent: any) => (
                <AgentRow key={agent.address} agent={agent} />
              ))}
              {(!agentsData?.data || agentsData.data.length === 0) && (
                <p className="text-gray-400 text-center py-4">No agents found</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Top Actions (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats?.activity.topActions.map((action: any, index: number) => (
                <div
                  key={action.action}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-sm">
                      {index + 1}
                    </span>
                    <span className="text-white">{action.action}</span>
                  </div>
                  <span className="text-gray-400">{action.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-yellow-400" />
            <CardTitle>System Status</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatusItem
              label="Agent Health"
              value={`${stats?.agents.alive || 0}/${stats?.agents.total || 0}`}
              status="healthy"
            />
            <StatusItem
              label="Avg Balance"
              value={`$${formatBalance(stats?.economics.avgAgentBalance || '0')}`}
              status="normal"
            />
            <StatusItem
              label="Avg Lifespan"
              value={stats?.economics.avgLifespan || 'N/A'}
              status="normal"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string
  value: string | number
  subtitle: string
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-gray-400 text-sm">{title}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
            <p className="text-gray-500 text-xs mt-1">{subtitle}</p>
          </div>
          <div className="p-2 bg-gray-700 rounded-lg">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function AgentRow({ agent }: { agent: any }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors">
      <div className="flex items-center gap-3">
        <img
          src={agent.avatarUrl}
          alt={agent.name}
          className="w-10 h-10 rounded-full"
        />
        <div>
          <p className="text-white font-medium">{agent.name}</p>
          <p className="text-gray-400 text-sm">
            {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-white">${formatBalance(agent.balance)}</p>
          <p className="text-gray-400 text-xs">{agent.heartbeatNonce} beats</p>
        </div>
        <Badge variant="status" value={agent.status} />
      </div>
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
  status: 'healthy' | 'warning' | 'critical' | 'normal'
}) {
  const statusColors = {
    healthy: 'text-green-400',
    warning: 'text-yellow-400',
    critical: 'text-red-400',
    normal: 'text-blue-400',
  }

  return (
    <div className="p-4 bg-gray-700/50 rounded-lg">
      <p className="text-gray-400 text-sm">{label}</p>
      <p className={`text-xl font-semibold ${statusColors[status]}`}>{value}</p>
    </div>
  )
}

export default Dashboard
