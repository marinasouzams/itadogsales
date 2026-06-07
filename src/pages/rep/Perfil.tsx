import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  User, Phone, Mail, MapPin, LogOut, RefreshCw, Wifi, WifiOff,
  ChevronRight, Shield, Bell,
} from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useSync } from '@/contexts/SyncContext'
import { formatCurrency, calcPercentage, formatRelative, getInitials } from '@/utils'
import SyncStatusBadgeComponent from '@/components/shared/SyncStatus'

export default function RepPerfil() {
  const { user, logout } = useAuth()
  const { status, lastSync, pendingCount, syncNow } = useSync()
  const navigate = useNavigate()

  const metaPercent = user?.meta && user?.metaAting
    ? calcPercentage(user.metaAting, user.meta)
    : 0

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <RepLayout title="Meu Perfil">
      <div className="p-4 space-y-4 pb-8">
        {/* Profile Card */}
        <motion.div
          className="card p-5"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary-600 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl font-bold text-white">{getInitials(user?.name ?? '')}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-slate-900 text-lg leading-tight">{user?.name}</h2>
              <p className="text-sm text-slate-500 mt-0.5">Representante de Vendas</p>
              {user?.region && (
                <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-400">
                  <MapPin className="w-3 h-3" />
                  {user.region}
                </div>
              )}
            </div>
          </div>

          {/* Contact row */}
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            {user?.phone && (
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <Phone className="w-4 h-4 text-slate-300" />
                {user.phone}
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <Mail className="w-4 h-4 text-slate-300" />
              {user?.email}
            </div>
          </div>
        </motion.div>

        {/* Meta progress */}
        {user?.meta && (
          <motion.div
            className="card p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Meta do Mês</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{formatCurrency(user.metaAting ?? 0)}</p>
                <p className="text-xs text-slate-400">de {formatCurrency(user.meta)}</p>
              </div>
              <span className="text-2xl font-bold text-primary-600">{metaPercent}%</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary-600 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${metaPercent}%` }}
                transition={{ duration: 1, delay: 0.3 }}
              />
            </div>
          </motion.div>
        )}

        {/* Sync Status */}
        <motion.div
          className="card p-4 space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          <p className="section-title">Sincronização</p>
          <SyncStatusBadgeComponent
            status={status === 'online' ? 'sincronizado' : status === 'offline' ? 'pendente' : 'sincronizando'}
            label={status === 'online' ? 'Online · Dados sincronizados' : status === 'offline' ? 'Offline · Modo local' : 'Sincronizando...'}
            lastSync={lastSync ?? undefined}
            count={pendingCount}
            onRetry={syncNow}
          />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {status === 'offline' ? (
              <><WifiOff className="w-3.5 h-3.5 text-red-400" /> Sem conexão com a internet</>
            ) : (
              <><Wifi className="w-3.5 h-3.5 text-green-500" /> Conectado</>
            )}
          </div>
        </motion.div>

        {/* Settings rows */}
        <motion.div
          className="card divide-y divide-slate-100"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {[
            { icon: Bell, label: 'Notificações', action: () => {} },
            { icon: Shield, label: 'Privacidade e segurança', action: () => {} },
            { icon: RefreshCw, label: 'Sincronizar dados agora', action: syncNow },
          ].map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors text-left"
            >
              <Icon className="w-4 h-4 text-slate-400" />
              <span className="flex-1 text-sm text-slate-700">{label}</span>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>
          ))}
        </motion.div>

        {/* Territory */}
        {user?.territory && user.territory.length > 0 && (
          <div className="card p-4">
            <p className="section-title mb-3">Meu Território</p>
            <div className="flex flex-wrap gap-2">
              {user.territory.map(city => (
                <span key={city} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                  {city}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-red-100 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors active:scale-98"
        >
          <LogOut className="w-4 h-4" />
          Sair da conta
        </button>
      </div>
    </RepLayout>
  )
}
