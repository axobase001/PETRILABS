import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Settings,
  Menu,
  X,
  Activity,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import useStore from '@/store'

interface NavItem {
  path: string
  label: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { path: '/agents', label: 'Agents', icon: <Users size={20} /> },
  { path: '/alerts', label: 'Alerts', icon: <AlertTriangle size={20} /> },
  { path: '/activity', label: 'Activity', icon: <Activity size={20} /> },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { sidebarOpen, setSidebarOpen, wsConnected } = useStore()
  const location = useLocation()

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 bg-gray-800 rounded-lg"
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-full bg-gray-800 border-r border-gray-700 transition-all duration-300 z-40',
          sidebarOpen ? 'w-64' : 'w-16',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-center border-b border-gray-700">
          {sidebarOpen ? (
            <Link to="/" className="text-xl font-bold text-primary-400">
              PETRILABS
            </Link>
          ) : (
            <Link to="/" className="text-xl font-bold text-primary-400">
              P
            </Link>
          )}
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                location.pathname === item.path
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-white'
              )}
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.icon}
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* Connection Status */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                wsConnected ? 'bg-green-500' : 'bg-red-500'
              )}
            />
            {sidebarOpen && (
              <span className="text-xs text-gray-400">
                {wsConnected ? 'Connected' : 'Disconnected'}
              </span>
            )}
          </div>
        </div>

        {/* Toggle Sidebar */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hidden lg:block absolute -right-3 top-20 w-6 h-6 bg-primary-600 rounded-full text-white"
        >
          {sidebarOpen ? '<' : '>'}
        </button>
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          'transition-all duration-300 min-h-screen',
          sidebarOpen ? 'lg:ml-64' : 'lg:ml-16'
        )}
      >
        {/* Top Bar */}
        <header className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-end px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <WalletConnect />
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">{children}</div>
      </main>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  )
}

function WalletConnect() {
  // Placeholder for wallet connection
  return (
    <button className="flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">
      <Wallet size={18} />
      <span className="text-sm">Connect Wallet</span>
    </button>
  )
}

export default Layout
