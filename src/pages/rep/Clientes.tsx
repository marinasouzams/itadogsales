import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, SlidersHorizontal, MapPin, Clock, ShoppingCart, ChevronRight, X } from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useClients } from '@/hooks/useData'
import { LoadingSpinner, EmptyState } from '@/components/shared/LoadingState'
import { formatCurrency, daysSince, cn, clientTypeLabel } from '@/utils'
import type { Priority } from '@/types'

type QuickFilter = 'todos' | 'semVisita30' | 'semPedido60' | 'semVisitaESemPedido' | 'visitadosMes' | 'pedidosMes'

const PRIORITY_DOT: Record<Priority, string> = { alta: 'bg-red-500', media: 'bg-amber-500', baixa: 'bg-slate-400' }

export default function RepClientes() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: allClients = [], loading } = useClients(user?.id)

  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('todos')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [cityFilter, setCityFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'todos'>('todos')

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const cities = useMemo(() => [...new Set(allClients.map(c => c.address.city))].sort(), [allClients])

  const filtered = useMemo(() => allClients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.address.city.toLowerCase().includes(search.toLowerCase())
    const matchCity = !cityFilter || c.address.city === cityFilter
    const matchPriority = priorityFilter === 'todos' || c.priority === priorityFilter
    const dv = c.lastVisit ? daysSince(c.lastVisit) : 999
    const dp = c.lastOrder ? daysSince(c.lastOrder) : 999
    let matchQuick = true
    switch (quickFilter) {
      case 'semVisita30': matchQuick = dv > 30; break
      case 'semPedido60': matchQuick = dp > 60; break
      case 'semVisitaESemPedido': matchQuick = dv > 30 && dp > 60; break
      case 'visitadosMes': matchQuick = !!(c.lastVisit && c.lastVisit >= startOfMonth); break
      case 'pedidosMes': matchQuick = !!(c.lastOrder && c.lastOrder >= startOfMonth); break
    }
    return matchSearch && matchCity && matchPriority && matchQuick
  }), [allClients, search, cityFilter, priorityFilter, quickFilter, startOfMonth])

  return (
    <RepLayout title="Meus Clientes">
      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou cidade..." className="input pl-10" />
          </div>
          <button onClick={() => setShowAdvanced(v => !v)}
            className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
              showAdvanced ? 'bg-primary-600 text-white border-primary-600' : 'bg-white border-slate-200 text-slate-600')}>
            <SlidersHorizontal className="w-4 h-4" /> Filtros
          </button>
        </div>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="card p-4 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Cidade</label>
                  <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="input">
                    <option value="">Todas</option>
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Prioridade</label>
                  <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as Priority | 'todos')} className="input">
                    <option value="todos">Todas</option>
                    <option value="alta">Alta</option>
                    <option value="media">Média</option>
                    <option value="baixa">Baixa</option>
                  </select>
                </div>
                <button onClick={() => { setCityFilter(''); setPriorityFilter('todos'); setQuickFilter('todos') }}
                  className="text-xs text-red-500 font-medium flex items-center gap-1">
                  <X className="w-3 h-3" /> Limpar filtros
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {([
            { value: 'todos', label: `Todos (${allClients.length})` },
            { value: 'semVisita30', label: 'Sem visita +30d' },
            { value: 'semPedido60', label: 'Sem pedido +60d' },
            { value: 'semVisitaESemPedido', label: 'Sem visita e sem pedido' },
            { value: 'visitadosMes', label: 'Visitados este mês' },
            { value: 'pedidosMes', label: 'Pedido este mês' },
          ] as const).map(f => (
            <button key={f.value} onClick={() => setQuickFilter(f.value as QuickFilter)}
              className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                quickFilter === f.value ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600')}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState label="Nenhum cliente encontrado" />
        ) : (
          <>
            <p className="text-xs text-slate-500">{filtered.length} cliente{filtered.length !== 1 ? 's' : ''}</p>
            <div className="space-y-2">
              {filtered.map((client, i) => {
                const dv = client.lastVisit ? daysSince(client.lastVisit) : 999
                const dp = client.lastOrder ? daysSince(client.lastOrder) : 999
                return (
                  <motion.button key={client.id} onClick={() => navigate(`/rep/clientes/${client.id}`)}
                    className="w-full card p-4 text-left active:scale-[0.98] transition-transform"
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <div className="flex items-start gap-3">
                      <div className="pt-1 flex-shrink-0">
                        <div className={cn('w-2.5 h-2.5 rounded-full', PRIORITY_DOT[client.priority])} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-slate-900 text-sm truncate">{client.name}</h3>
                            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              {client.address.city}, {client.address.state}
                              <span className="text-slate-300">·</span>
                              {clientTypeLabel(client.type)}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
                        </div>
                        <div className="flex items-center gap-4 mt-2.5 text-xs">
                          <span className={cn('flex items-center gap-1', dv > 30 ? 'text-red-500 font-medium' : 'text-slate-400')}>
                            <Clock className="w-3 h-3" />
                            {dv < 999 ? `${dv}d s/ visita` : 'Sem visita'}
                          </span>
                          <span className={cn('flex items-center gap-1', dp > 60 ? 'text-amber-500 font-medium' : 'text-slate-400')}>
                            <ShoppingCart className="w-3 h-3" />
                            {dp < 999 ? `${dp}d s/ pedido` : 'Sem pedido'}
                          </span>
                          <span className="ml-auto font-semibold text-slate-600">{formatCurrency(client.totalRevenue)}</span>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </RepLayout>
  )
}
