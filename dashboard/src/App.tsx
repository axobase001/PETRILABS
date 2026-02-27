import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import Layout from '@/components/layout/Layout'
import Dashboard from '@/pages/Dashboard'
import Agents from '@/pages/Agents'
import AgentDetail from '@/pages/AgentDetail'
import Alerts from '@/pages/Alerts'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/agents/:address" element={<AgentDetail />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route
              path="*"
              element={
                <div className="text-center py-12">
                  <h1 className="text-4xl font-bold text-white mb-4">404</h1>
                  <p className="text-gray-400">Page not found</p>
                </div>
              }
            />
          </Routes>
        </Layout>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1f2937',
            color: '#f3f4f6',
            border: '1px solid #374151',
          },
        }}
      />
    </QueryClientProvider>
  )
}

export default App
