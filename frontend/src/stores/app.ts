import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Agent, DeploymentResponse, Toast, FilterState } from '@/types';

interface AppState {
  // UI State
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  
  filters: FilterState;
  setFilters: (filters: Partial<FilterState>) => void;
  
  // Data
  agents: Agent[];
  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (address: string, updates: Partial<Agent>) => void;
  
  // Deployment
  activeDeployments: Map<string, DeploymentResponse>;
  addDeployment: (deployment: DeploymentResponse) => void;
  updateDeployment: (jobId: string, updates: Partial<DeploymentResponse>) => void;
  removeDeployment: (jobId: string) => void;
  
  // Notifications
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  
  // Selected Agent
  selectedAgent: string | null;
  setSelectedAgent: (address: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // UI State
      viewMode: 'grid',
      setViewMode: (mode) => set({ viewMode: mode }),
      
      filters: {
        status: 'all',
        sortBy: 'created',
        sortOrder: 'desc',
      },
      setFilters: (filters) => set((state) => ({
        filters: { ...state.filters, ...filters },
      })),
      
      // Data
      agents: [],
      setAgents: (agents) => set({ agents }),
      addAgent: (agent) => set((state) => ({
        agents: [...state.agents, agent],
      })),
      updateAgent: (address, updates) => set((state) => ({
        agents: state.agents.map((a) =>
          a.address === address ? { ...a, ...updates } : a
        ),
      })),
      
      // Deployment
      activeDeployments: new Map(),
      addDeployment: (deployment) => set((state) => {
        const newMap = new Map(state.activeDeployments);
        newMap.set(deployment.jobId, deployment);
        return { activeDeployments: newMap };
      }),
      updateDeployment: (jobId, updates) => set((state) => {
        const newMap = new Map(state.activeDeployments);
        const current = newMap.get(jobId);
        if (current) {
          newMap.set(jobId, { ...current, ...updates });
        }
        return { activeDeployments: newMap };
      }),
      removeDeployment: (jobId) => set((state) => {
        const newMap = new Map(state.activeDeployments);
        newMap.delete(jobId);
        return { activeDeployments: newMap };
      }),
      
      // Notifications
      toasts: [],
      addToast: (toast) => set((state) => ({
        toasts: [...state.toasts, { ...toast, id: Math.random().toString(36).slice(2) }],
      })),
      removeToast: (id) => set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      })),
      
      // Selected Agent
      selectedAgent: null,
      setSelectedAgent: (address) => set({ selectedAgent: address }),
    }),
    {
      name: 'petrilabs-storage',
      partialize: (state) => ({
        viewMode: state.viewMode,
        filters: state.filters,
      }),
    }
  )
);

export default useAppStore;
