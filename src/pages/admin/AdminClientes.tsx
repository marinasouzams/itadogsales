import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, MapPin, Clock, ShoppingCart, ChevronRight, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '@/layouts/AdminLayout'
import { MOCK_CLIENTS, MOCK_USERS } from '@/mock/data'
import { formatCurrency, daysSince, clientTypeLabel, cn } from '@/utils'
import { PriorityBadge } from '@/components/shared/StatusBadge'
import type { Priority } from '@/types'

const VIEWS = ['Lista', 'Estratégico'] as const
type View = typeof VIEWS[number]

export default function AdminClientes() {
  const [search, setSearch] = useState('')
  const [repFilter, setRepFilter] = useState('todos')
  const [cityFilter, setCityFilter] = useState('todas')
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'todos'>('todos')
  const [view, setView] = useState<View>('Lista')
  const navigate = useNavigate()

  const reps = MOCK_USERS.filter(u => u.role === 'rep')
  const allCities = [...new Set(MOCK_CLIENTS.map(c => c.address.city))].sort()

  const filtered = useMemo(() => MOCK_CLIENTS.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.address.city.toLowerCase().includes(search.toLowerCase())
    const matchRep = repFilter === 'todos' || c.repId === repFilter
    const matchCity = cityFilter === 'todas' || c.address.city === cityFilter
    const matchPriority = priorityFilter === 'todos' || c.priority === priorityFilter
    return matchSearch && matchRep && matchCity && matchPriority
  }), [search, repFilter, cityFilter, priorityFilter])

  // Strategic data
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const noVisitThisMonth = MOCK_CLIENTS.filter(c => !c.lastVisit || c.lastVisit < startOfMonth)
  const noOrderThisMonth = MOCK_CLIENTS.filter(c => !c.lastOrder || c.lastOrder < startOfMonth)
  const noVisit30 = MOCK_CLIENTS.filter(c => !c.lastVisit || daysSince(c.lastVisit) > 30)
  const noOrder60 = MOCK_CLIENTS.filter(c => !c.lastOrder || daysSince(c.lastOrder) > 60)
  const criticalClients = MOCK_CLIENTS.filter(c =>
    (!c.lastVisit || daysSince(c.lastVisit) > 30) && (!c.lastOrder || daysSince(c.lastOrder) > 60)
  )

  return (
    <AdminLayout title="Clientes">
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        {/* View toggle */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {VIEWS.map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                view === v ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {v}
            </button>
          ))}
        </div>

        {view === 'Lista' && (
          <>
            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente ou cidade..." className="input pl-10" />
              </div>
              <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="input w-auto min-w-40">
                <option value="todos">Todos representantes</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name.split(' ')[0]}</option>)}
              </select>
              <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="input w-auto min-w-36">
                <option value="todas">Todas cidades</option>
                {allCities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as Priority | 'todos')} className="input w-auto">
                <option value="todos">Todas prioridades</option>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>

            <p className="text-xs text-slate-500">{filtered.length} cliente{filtered.length !== 1 ? 's' : ''}</p>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Cliente</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Tipo</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">Representante</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Prioridade</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Receita</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">S/ Visita</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((client, i) => {
                      const rep = reps.find(r => r.id === client.repId)
                      const daysSinceVisit = client.lastVisit ? daysSince(client.lastVisit) : 999
                      const isOverdue = daysSinceVisit > 30

                      return (
                        <motion.tr
                          key={client.id}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          onClick={() => navigate(`/admin/clientes/${client.id}`)}
                        >
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-slate-900">{client.name}</p>
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" />
                              {client.address.city}, {client.address.state}
                            </p>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-xs text-slate-500">{clientTypeLabel(client.type)}</span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-xs text-slate-600">{rep?.name.split(' ')[0] ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <PriorityBadge priority={client.priority} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-slate-900">{formatCurrency(client.totalRevenue)}</span>
                          </td>
                          <td className="px-4 py-3 text-right hidden lg:table-cell">
                            <span className={cn('text-xs font-medium', isOverdue ? 'text-red-500' : 'text-slate-400')}>
                              {daysSinceVisit < 999 ? `${daysSinceVisit}d` : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                          </td>
                        </motion.tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {view === 'Estratégico' && (
          <div className="space-y-5">
            {/* Alert cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Sem visita este mês', value: noVisitThisMonth.length, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
                { label: 'Sem pedido este mês', value: noOrderThisMonth.length, icon: ShoppingCart, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
                { label: 'Sem visita +30d', value: noVisit30.length, icon: Clock, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
                { label: 'Sem pedido +60d', value: noOrder60.length, icon: ShoppingCart, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
              ].map((card, i) => (
                <motion.div
                  key={card.label}
                  className={cn('card p-4 border', card.border, card.bg)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-2', 'bg-white/80')}>
                    <card.icon className={cn('w-4 h-4', card.color)} />
                  </div>
                  <p className={cn('text-2xl font-bold', card.color)}>{card.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
                </motion.div>
              ))}
            </div>

            {/* Critical clients */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <h3 className="font-semibold text-slate-900">Clientes Críticos</h3>
                <span className="text-xs bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">{criticalClients.length}</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">Sem visita há +30 dias E sem pedido há +60 dias</p>

              {criticalClients.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Nenhum cliente crítico</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left text-xs text-slate-400 pb-2">Cliente</th>
                        <th className="text-left text-xs text-slate-400 pb-2 hidden md:table-cell">Representante</th>
                        <th className="text-right text-xs text-slate-400 pb-2">S/ visita</th>
                        <th className="text-right text-xs text-slate-400 pb-2">S/ pedido</th>
                        <th className="px-2 pb-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {criticalClients.map((c, i) => {
                        const rep = reps.find(r => r.id === c.repId)
                        return (
                          <motion.tr
                            key={c.id}
                            className="hover:bg-slate-50 cursor-pointer"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.03 }}
                            onClick={() => navigate(`/admin/clientes/${c.id}`)}
                          >
                            <td className="py-2.5">
                              <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                              <p className="text-xs text-slate-400">{c.address.city}</p>
                            </td>
                            <td className="py-2.5 hidden md:table-cell">
                              <span className="text-xs text-slate-600">{rep?.name.split(' ')[0] ?? '—'}</span>
                            </td>
                            <td className="py-2.5 text-right">
                              <span className="text-xs font-bold text-red-500">
                                {c.lastVisit ? `${daysSince(c.lastVisit)}d` : 'Nunca'}
                              </span>
                            </td>
                            <td className="py-2.5 text-right">
                              <span className="text-xs font-bold text-red-500">
                                {c.lastOrder ? `${daysSince(c.lastOrder)}d` : 'Nunca'}
                              </span>
                            </td>
                            <td className="py-2.5 px-2">
                              <ChevronRight className="w-4 h-4 text-slate-300" />
                            </td>
                          </motion.tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
