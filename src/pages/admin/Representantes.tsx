import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, TrendingUp, Users, MapPin, ChevronRight, Award } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '@/layouts/AdminLayout'
import { useUsers, useClients, useOrders } from '@/hooks/useData'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { formatCurrency, calcPercentage, getInitials, getAvatarColor, cn } from '@/utils'

export default function AdminRepresentantes() {
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { data: users = [], loading } = useUsers()
  const { data: allClients = [] } = useClients()
  const { data: allOrders = [] } = useOrders()

  const reps = users.filter(u => u.role === 'rep' && u.active)

  const repData = reps.map(rep => {
    const clients = allClients.filter(c => c.repId === rep.id)
    const orders = allOrders.filter(o => o.repId === rep.id)
    const revenue = orders.reduce((s, o) => s + o.total, 0)
    const metaPercent = rep.meta ? Math.min(100, Math.round((revenue / rep.meta) * 100)) : 0
    return { ...rep, clients: clients.length, orders: orders.length, revenue, metaPercent }
  }).sort((a, b) => b.revenue - a.revenue)

  const filtered = repData.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.region ?? '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <AdminLayout title="Representantes"><div className="p-6"><LoadingSpinner /></div></AdminLayout>

  return (
    <AdminLayout title="Representantes">
      <div className="p-6 space-y-5 max-w-5xl mx-auto">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar representante ou região..."
            className="input pl-10"
          />
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Representantes', value: reps.length, icon: Users },
            { label: 'Faturamento total', value: formatCurrency(repData.reduce((s, r) => s + r.revenue, 0)), icon: TrendingUp },
            { label: 'Regiões', value: new Set(reps.map(r => r.region).filter(Boolean)).size, icon: MapPin },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              className="card p-4 text-center"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <p className="text-xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Rep list */}
        <div className="space-y-4">
          {filtered.map((rep, i) => (
            <motion.div
              key={rep.id}
              className="card p-5 cursor-pointer hover:border-primary-200 transition-colors"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              onClick={() => navigate(`/admin/representantes/${rep.id}`)}
            >
              <div className="flex items-start gap-4">
                {/* Rank + Avatar */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                    i === 0 ? 'bg-amber-400 text-white' :
                    i === 1 ? 'bg-slate-400 text-white' :
                    i === 2 ? 'bg-amber-700 text-white' :
                    'bg-slate-100 text-slate-500'
                  )}>
                    {i === 0 ? <Award className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white', getAvatarColor(rep.name))}>
                    {getInitials(rep.name)}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">{rep.name}</h3>
                      {rep.region && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />
                          {rep.region}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-xs font-bold px-2.5 py-1 rounded-full',
                        rep.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                      )}>
                        {rep.active ? 'Ativo' : 'Inativo'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div>
                      <p className="text-base font-bold text-slate-900">{rep.clients}</p>
                      <p className="text-[10px] text-slate-400">Clientes</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-900">{rep.orders}</p>
                      <p className="text-[10px] text-slate-400">Pedidos</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-900">{formatCurrency(rep.revenue)}</p>
                      <p className="text-[10px] text-slate-400">Faturado</p>
                    </div>
                  </div>

                  {/* Meta bar */}
                  {rep.meta && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Meta: {formatCurrency(rep.meta)}</span>
                        <span className="font-semibold text-slate-700">{rep.metaPercent}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          className={cn('h-full rounded-full', rep.metaPercent >= 100 ? 'bg-green-500' : rep.metaPercent >= 70 ? 'bg-primary-600' : 'bg-amber-500')}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(rep.metaPercent, 100)}%` }}
                          transition={{ duration: 0.8, delay: i * 0.1 }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </AdminLayout>
  )
}
