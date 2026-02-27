import { useState } from 'react'
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAgents } from '@/hooks/useAgents'
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { formatAddress, formatBalance, formatDate } from '@/lib/utils'

export function Agents() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string>('all')
  const [search, setSearch] = useState('')

  const { data, isLoading } = useAgents({
    page,
    limit: 10,
    status: status === 'all' ? undefined : status,
  })

  const agents = data?.data || []
  const pagination = data?.pagination

  const filteredAgents = agents.filter((agent: any) =>
    search
      ? agent.address.toLowerCase().includes(search.toLowerCase()) ||
        agent.name.toLowerCase().includes(search.toLowerCase())
      : true
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Agents</h1>
        <Button>Create Agent</Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Search by address or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-gray-400" />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Status</option>
                <option value="alive">Alive</option>
                <option value="dead">Dead</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agents Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-700/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Agent
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Balance
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Heartbeats
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Last Active
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredAgents.map((agent: any) => (
                      <tr
                        key={agent.address}
                        className="hover:bg-gray-700/30 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={agent.avatarUrl}
                              alt={agent.name}
                              className="w-10 h-10 rounded-full"
                            />
                            <div>
                              <p className="text-white font-medium">
                                {agent.name}
                              </p>
                              <p className="text-gray-400 text-sm">
                                {formatAddress(agent.address)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="status" value={agent.status} />
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-white">
                            ${formatBalance(agent.balance)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-white">{agent.heartbeatNonce}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-400">
                            {formatDate(agent.lastHeartbeat)}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <Link
                            to={`/agents/${agent.address}`}
                            className="text-primary-400 hover:text-primary-300"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between">
                  <p className="text-gray-400 text-sm">
                    Showing {(page - 1) * 10 + 1} to{' '}
                    {Math.min(page * 10, pagination.total)} of {pagination.total}{' '}
                    agents
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="text-gray-400">
                      Page {page} of {pagination.totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setPage((p) => Math.min(pagination.totalPages, p + 1))
                      }
                      disabled={page === pagination.totalPages}
                    >
                      <ChevronRight size={16} />
                </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Agents
