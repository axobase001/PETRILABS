import { create } from 'zustand'
import type { Agent, DashboardOverview, MissingReport, WebSocketMessage } from '@/types'

interface AppState {
  // Agents
  agents: Agent[]
  selectedAgent: string | null
  setAgents: (agents: Agent[]) => void
  setSelectedAgent: (address: string | null) => void
  updateAgent: (agent: Agent) => void

  // Overview
  overview: DashboardOverview | null
  setOverview: (overview: DashboardOverview) => void

  // Missing Reports
  missingReports: MissingReport[]
  setMissingReports: (reports: MissingReport[]) => void
  addMissingReport: (report: MissingReport) => void
  updateMissingReport: (report: MissingReport) => void

  // WebSocket
  wsConnected: boolean
  wsMessages: WebSocketMessage[]
  setWsConnected: (connected: boolean) => void
  addWsMessage: (message: WebSocketMessage) => void
  clearWsMessages: () => void

  // UI State
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void

  // Loading States
  loading: Record<string, boolean>
  setLoading: (key: string, loading: boolean) => void
}

export const useStore = create<AppState>((set) => ({
  // Agents
  agents: [],
  selectedAgent: null,
  setAgents: (agents) => set({ agents }),
  setSelectedAgent: (address) => set({ selectedAgent: address }),
  updateAgent: (agent) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.address === agent.address ? agent : a
      ),
    })),

  // Overview
  overview: null,
  setOverview: (overview) => set({ overview }),

  // Missing Reports
  missingReports: [],
  setMissingReports: (reports) => set({ missingReports: reports }),
  addMissingReport: (report) =>
    set((state) => ({
      missingReports: [report, ...state.missingReports],
    })),
  updateMissingReport: (report) =>
    set((state) => ({
      missingReports: state.missingReports.map((r) =>
        r.id === report.id ? report : r
      ),
    })),

  // WebSocket
  wsConnected: false,
  wsMessages: [],
  setWsConnected: (connected) => set({ wsConnected: connected }),
  addWsMessage: (message) =>
    set((state) => ({
      wsMessages: [...state.wsMessages.slice(-100), message],
    })),
  clearWsMessages: () => set({ wsMessages: [] }),

  // UI State
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  theme: 'dark',
  setTheme: (theme) => set({ theme }),

  // Loading States
  loading: {},
  setLoading: (key, loading) =>
    set((state) => ({
      loading: { ...state.loading, [key]: loading },
    })),
}))

export default useStore
