import { useState, useRef, useEffect, type ReactNode } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Users, UserCheck, ShoppingCart, MapPin,
  Star, BarChart3, Shield, RefreshCw, Settings, LogOut,
  Menu, X, ChevronDown, Wifi, WifiOff, Package, DollarSign, CheckSquare,
  Scissors, LayoutGrid, ClipboardList, Truck, Banknote, Bell, FileBarChart, GitMerge,
} from 'lucide-react'
import NotificationPanel from '@/components/shared/NotificationPanel'
import { useAuth } from '@/contexts/AuthContext'
import { useSync } from '@/contexts/SyncContext'
import { cn, getInitials, getAvatarColor } from '@/utils'
import type { User } from '@/types'

// Unused import kept to avoid breaking any tree-shaking expectations
void Truck

const NAV_GROUPS = [
  {
    label: 'Operacional',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/representantes', label: 'Representantes', icon: UserCheck },
      { to: '/admin/clientes', label: 'Clientes', icon: Users },
      { to: '/admin/pedidos', label: 'Pedidos', icon: ShoppingCart },
      { to: '/admin/visitas', label: 'Visitas', icon: MapPin },
      { to: '/admin/prospects', label: 'Prospects', icon: Star },
      { to: '/admin/produtos', label: 'Produtos', icon: Package },
      { to: '/admin/tarefas', label: 'Tarefas', icon: CheckSquare },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/admin/financeiro', label: 'Contas a Receber', icon: DollarSign },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { to: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
      { to: '/admin/auditoria', label: 'Auditoria', icon: Shield },
      { to: '/admin/sincronizacao', label: 'Sync Bling', icon: RefreshCw },
    ],
  },
  {
    label: 'Produção',
    items: [
      { to: '/admin/producao', label: 'Dashboard', icon: LayoutGrid, end: true },
      { to: '/admin/producao/costureiras', label: 'Costureiras', icon: Scissors },
      { to: '/admin/producao/ordens', label: 'Ordens de Produção', icon: ClipboardList },
      { to: '/admin/producao/fluxos', label: 'Fluxos', icon: GitMerge },
      { to: '/admin/producao/pagamentos', label: 'Pagamentos', icon: Banknote },
      { to: '/admin/producao/solicitacoes', label: 'Solicitações', icon: Bell },
      { to: '/admin/producao/relatorios', label: 'Relatórios', icon: FileBarChart },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/admin/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
]

// ── Sidebar content extracted as a stable module-level component ──────────────
// IMPORTANT: must NOT be defined inside AdminLayout.
// If defined inline, React sees a new component type every render and remounts
// the entire sidebar (including its nav scroll container), resetting scroll position.
type SidebarProps = {
  user: User | null
  setSidebarOpen: (v: boolean) => void
  onLogout: () => void
}

function SidebarContent({ user, setSidebarOpen, onLogout }: SidebarProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800 flex flex-col items-center gap-1.5 safe-top">
        <img
          src="/logo.png"
          alt="ITADOG"
          className="h-8 w-auto object-contain"
          draggable={false}
        />
        <p className="text-slate-400 text-[10px] font-semibold tracking-widest uppercase">Admin Console</p>
      </div>

      {/* Nav — overflow-y-auto so this element owns sidebar scroll */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map(group => (
          <div key={group.label} className="mb-6">
            <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150',
                      isActive
                        ? 'bg-primary-600 text-white font-medium'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800',
                    )
                  }
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0', getAvatarColor(user?.name ?? 'A'))}>
            {getInitials(user?.name ?? 'A')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-medium truncate">{user?.name}</div>
            <div className="text-slate-400 text-xs truncate">{user?.email}</div>
          </div>
          <button
            onClick={onLogout}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main layout ───────────────────────────────────────────────────────────────
export default function AdminLayout({ children, title }: { children: ReactNode; title?: string }) {
  const { user, logout } = useAuth()
  const { status, pendingCount } = useSync()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Scroll the main content area to top on every route change.
  // We do this imperatively so the DOM node is never recreated and the sidebar
  // scroll position is never affected.
  const mainRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-dvh bg-slate-50">
      {/* Desktop Sidebar — persistent, never remounts */}
      <aside className="hidden lg:flex flex-col w-56 bg-slate-900 flex-shrink-0">
        <SidebarContent user={user} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              className="fixed left-0 top-0 bottom-0 z-50 w-64 bg-slate-900 lg:hidden"
              initial={{ x: -264 }}
              animate={{ x: 0 }}
              exit={{ x: -264 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="absolute top-4 right-4">
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <SidebarContent user={user} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-100 px-4 lg:px-6 py-3 flex items-center justify-between flex-shrink-0 z-20 safe-top">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors"
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <div className="hidden lg:flex items-center gap-2 text-sm text-slate-500">
              <span>Admin Console</span>
              {title && <><span className="text-slate-300">/</span><span className="font-medium text-slate-700">{title}</span></>}
            </div>
            {/* Mobile: show current page title */}
            {title && <span className="lg:hidden text-sm font-semibold text-slate-800">{title}</span>}
          </div>

          <div className="flex items-center gap-2">
            {/* Sync indicator */}
            <div
              className={cn(
                'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
                status === 'online' && pendingCount === 0
                  ? 'bg-green-50 text-green-700'
                  : status === 'offline'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-amber-50 text-amber-700',
              )}
            >
              {status === 'offline' ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
              {pendingCount > 0 ? `${pendingCount} pendentes` : 'Conectado'}
            </div>

            <NotificationPanel />

            {/* Avatar */}
            <button className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-slate-100 transition-colors">
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold', getAvatarColor(user?.name ?? 'A'))}>
                {getInitials(user?.name ?? 'A')}
              </div>
              <span className="hidden sm:block text-sm font-medium text-slate-700">
                {user?.name?.split(' ')[0]}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </header>

        {/* Content — ref allows imperative scroll-to-top on navigation.
            No key or AnimatePresence here: the DOM node stays alive across
            route changes so the sidebar and this container never lose scroll. */}
        <main ref={mainRef} className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
