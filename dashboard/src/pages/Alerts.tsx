import { useState } from 'react'
import { AlertTriangle, CheckCircle, Clock, Filter } from 'lucide-react'
import { useMissingReports } from '@/hooks/useAgents'
import { api } from '@/api/client'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { formatAddress, formatDate, getSeverityColor } from '@/lib/utils'
import toast from 'react-hot-toast'

export function Alerts() {
  const [filter, setFilter] = useState<{
    severity?: string
    resolved?: boolean
  }>({
    resolved: false,
  })

  const { data, isLoading, refetch } = useMissingReports(filter)
  const reports = data?.data || []

  const handleAcknowledge = async (id: string) => {
    try {
      await api.acknowledgeReport(id, 'dashboard-user')
      toast.success('Report acknowledged')
      refetch()
    } catch (error) {
      toast.error('Failed to acknowledge report')
    }
  }

  const handleResolve = async (id: string) => {
    try {
      await api.resolveReport(id, 'Resolved via dashboard')
      toast.success('Report resolved')
      refetch()
    } catch (error) {
      toast.error('Failed to resolve report')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertTriangle size={28} className="text-yellow-400" />
          <h1 className="text-2xl font-bold text-white">Missing Heartbeat Alerts</h1>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-gray-400" />
          <select
            value={filter.severity || 'all'}
            onChange={(e) =>
              setFilter({
                ...filter,
                severity: e.target.value === 'all' ? undefined : e.target.value,
              })
            }
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Severities</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
            <option value="abandoned">Abandoned</option>
          </select>
          <select
            value={filter.resolved?.toString() || 'false'}
            onChange={(e) =>
              setFilter({
                ...filter,
                resolved: e.target.value === 'all' ? undefined : e.target.value === 'true',
              })
            }
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="false">Unresolved</option>
            <option value="true">Resolved</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {/* Alerts List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : reports.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle size={48} className="text-green-400 mx-auto mb-4" />
              <p className="text-xl text-white font-medium">All Clear!</p>
              <p className="text-gray-400 mt-2">No missing heartbeat alerts</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {reports.map((report: any) => (
                <AlertRow
                  key={report.id}
                  report={report}
                  onAcknowledge={() => handleAcknowledge(report.id)}
                  onResolve={() => handleResolve(report.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AlertRow({
  report,
  onAcknowledge,
  onResolve,
}: {
  report: any
  onAcknowledge: () => void
  onResolve: () => void
}) {
  return (
    <div className="p-6 hover:bg-gray-700/30 transition-colors">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="severity" value={report.severity} />
            <span className="text-gray-400 text-sm">
              {formatDate(report.createdAt / 1000)}
            </span>
            {report.acknowledged && (
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                Acknowledged
              </span>
            )}
            {report.resolved && (
              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                Resolved
              </span>
            )}
          </div>
          <h3 className="text-white font-medium mb-2">
            Missing Heartbeat: {formatAddress(report.agentAddress)}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-400">Expected</p>
              <p className="text-white">{formatDate(report.expectedTime)}</p>
            </div>
            <div>
              <p className="text-gray-400">Last Heartbeat</p>
              <p className="text-white">{formatDate(report.lastHeartbeat)}</p>
            </div>
            <div>
              <p className="text-gray-400">Deadline</p>
              <p className="text-red-400">{formatDate(report.deadline)}</p>
            </div>
            {report.akashStatus && (
              <div>
                <p className="text-gray-400">Akash Status</p>
                <p className="text-white">{report.akashStatus.state}</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!report.acknowledged && !report.resolved && (
            <Button variant="secondary" size="sm" onClick={onAcknowledge}>
              Acknowledge
            </Button>
          )}
          {!report.resolved && (
            <Button variant="primary" size="sm" onClick={onResolve}>
              Resolve
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default Alerts
