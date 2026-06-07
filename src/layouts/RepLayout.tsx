import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Home, MapPin, Users, ClipboardList, Star, User,
  Wifi, WifiOff, RefreshCw, ChevronDown,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSync } from '@/contexts/SyncContext'
import { cn, getInitials, getAvatarColor } from '@/utils'

const NAV_ITEMS = [
  { to: '/rep', label: 'Início', icon: Home, end: true },
  { to: '/rep/rota', label: 'Rota', icon: MapPin },
  { to: '/rep/clientes', label: 'Clientes', icon: Users },
  { to: '/rep/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/rep/prospects', label: 'Leads', icon: Star },
  { to: '/rep/perfil', label: 'Perfil', icon: User },
]

interface RepLayoutProps {
  children: ReactNode
  title?: string
  showBack?: boolean
  /** Oculta a bottom nav — usar em telas full-screen como NovoPedido */
  hideNav?: boolean
}

export default function RepLayout({ children, title, showBack, hideNav }: RepLayoutProps) {
  const { user, logout } = useAuth()
  const { status, pendingCount, syncNow } = useSync()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col min-h-dvh bg-slate-50">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors"
            >
              <ChevronDown className="w-5 h-5 rotate-90 text-slate-600" />
            </button>
          )}
          {!showBack && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">ITA</span>
              </div>
              <span className="font-bold text-slate-900 text-sm">Sales</span>
            </div>
          )}
          {title && <h1 className="font-semibold text-slate-900">{title}</h1>}
        </div>

        <div className="flex items-center gap-2">
          {/* Sync Status */}
          <button
            onClick={syncNow}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              status === 'online' && pendingCount === 0
                ? 'bg-green-50 text-green-700'
                : status === 'syncing'
                ? 'bg-blue-50 text-blue-700'
                : status === 'offline'
                ? 'bg-red-50 text-red-700'
                : 'bg-amber-50 text-amber-700',
            )}
          >
            {status === 'offline' ? (
              <WifiOff className="w-3.5 h-3.5" />
            ) : status === 'syncing' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wifi className="w-3.5 h-3.5" />
            )}
            {pendingCount > 0 ? `${pendingCount} pendente${pendingCount > 1 ? 's' : ''}` : status === 'syncing' ? 'Sincronizando' : 'Online'}
          </button>

          {/* Avatar */}
          <button
            onClick={logout}
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold',
              getAvatarColor(user?.name ?? 'U'),
            )}
          >
            {getInitials(user?.name ?? 'U')}
          </button>
        </div>
      </header>

      {/* Page Content */}
      <main className={hideNav ? 'flex-1 overflow-y-auto safe-bottom' : 'flex-1 overflow-y-auto pb-nav'}>
        <AnimatePresence mode="wait">
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      {!hideNav && <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-100 bottom-nav-safe">
        <div className="flex items-center justify-around px-2 py-2">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 min-w-0',
                  isActive
                    ? 'text-primary-600'
                    : 'text-slate-400 hover:text-slate-600',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn('p-1.5 rounded-xl transition-colors', isActive && 'bg-primary-50')}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-medium leading-none">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>}
    </div>
  )
}
