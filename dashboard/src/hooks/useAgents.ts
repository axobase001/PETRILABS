import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import useStore from '@/store'

export function useAgents(params?: {
  status?: string
  creator?: string
  page?: number
  limit?: number
}) {
  const { setAgents, setLoading } = useStore()
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ['agents', params],
    queryFn: async () => {
      setLoading('agents', true)
      try {
        const response = await api.getAgents(params)
        if (response.success && response.data) {
          setAgents(response.data)
          return response
        }
        throw new Error(response.error?.message || 'Failed to fetch agents')
      } finally {
        setLoading('agents', false)
      }
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  })
}

export function useAgent(address: string) {
  const { setLoading } = useStore()

  return useQuery({
    queryKey: ['agent', address],
    queryFn: async () => {
      setLoading(`agent-${address}`, true)
      try {
        const response = await api.getAgent(address)
        if (response.success) {
          return response
        }
        throw new Error(response.error?.message || 'Failed to fetch agent')
      } finally {
        setLoading(`agent-${address}`, false)
      }
    },
    enabled: !!address,
  })
}

export function useAgentStats(address: string) {
  return useQuery({
    queryKey: ['agent-stats', address],
    queryFn: async () => {
      const response = await api.getAgentStats(address)
      if (response.success) {
        return response
      }
      throw new Error(response.error?.message || 'Failed to fetch stats')
    },
    enabled: !!address,
  })
}

export function useAgentDecisions(
  address: string,
  params?: { page?: number; limit?: number }
) {
  return useQuery({
    queryKey: ['agent-decisions', address, params],
    queryFn: async () => {
      const response = await api.getAgentDecisions(address, params)
      if (response.success) {
        return response
      }
      throw new Error(response.error?.message || 'Failed to fetch decisions')
    },
    enabled: !!address,
  })
}

export function useOverview() {
  const { setOverview, setLoading } = useStore()

  return useQuery({
    queryKey: ['overview'],
    queryFn: async () => {
      setLoading('overview', true)
      try {
        const response = await api.getOverview()
        if (response.success && response.data) {
          setOverview(response.data)
          return response
        }
        throw new Error(response.error?.message || 'Failed to fetch overview')
      } finally {
        setLoading('overview', false)
      }
    },
    refetchInterval: 60000, // Refetch every minute
  })
}

export function useMissingReports(params?: {
  severity?: string
  resolved?: boolean
  page?: number
  limit?: number
}) {
  const { setMissingReports, setLoading } = useStore()

  return useQuery({
    queryKey: ['missing-reports', params],
    queryFn: async () => {
      setLoading('missing-reports', true)
      try {
        const response = await api.getMissingReports(params)
        if (response.success && response.data) {
          setMissingReports(response.data)
          return response
        }
        throw new Error(response.error?.message || 'Failed to fetch reports')
      } finally {
        setLoading('missing-reports', false)
      }
    },
    refetchInterval: 15000, // Refetch every 15 seconds
  })
}

export function useCreatorStats(address: string) {
  return useQuery({
    queryKey: ['creator-stats', address],
    queryFn: async () => {
      const response = await api.getCreatorStats(address)
      if (response.success) {
        return response
      }
      throw new Error(response.error?.message || 'Failed to fetch creator stats')
    },
    enabled: !!address,
  })
}
