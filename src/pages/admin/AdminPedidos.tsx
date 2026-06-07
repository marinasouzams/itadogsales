import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Search, Package, RefreshCw, TrendingUp, TrendingDown, BarChart2 } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { MOCK_ORDERS, MOCK_USERS, MOCK_CLIENTS } from '@/mock/data'
import { formatCurrency, formatDate, cn } from '@/utils'
import { OrderStatusBadge, SyncStatusBadge } from '@/components/shared/StatusBadge'
import type { OrderStatus, SyncStatus } from '@/types'

const STATUS_OPTS: (OrderStatus | 'todos')[] = ['todos', 'rascunho', 'enviado', 'aprovado', 'faturado', 'pronto_entrega', 'cancelado']
const VIEWS = ['Lista', 'Inteligência'] as const
type View = typeof VIEWS[number]

export default function AdminPedidos() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'todos'>('todos')
  const [syncFilter, setSyncFilter] = useState<SyncStatus | 'todos'>('todos')
  const [repFilter, setRepFilter] = useState('todos')
  const [cityFilter, setCityFilter] = useState('todas')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showPeriod, setShowPeriod] = useState(false)
  const [view, setView] = useState<View>('Lista')

  const reps = MOCK_USERS.filter(u => u.role === 'rep')
  const allCities = [...new Set(MOCK_CLIENTS.map(c => c.address.city))].sort()
  const pendingSync = MOCK_ORDERS.filter(o => o.syncStatus === 'pendente').length

  const filtered = useMemo(() => MOCK_ORDERS.filter(o => {
    const matchSearch = o.clientName.toLowerCase().includes(search.toLowerCase()) ||
      o.number.toLowerCase().includes(search.toLowerCase()) ||
      o.repName.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'todos' || o.status === statusFilter
    const matchSync = syncFilter === 'todos' || o.syncStatus === syncFilter
    const matchRep = repFilter === 'todos' || o.repId === repFilter
    const matchFrom = !dateFrom || o.createdAt.slice(0, 10) >= dateFrom
    const matchTo = !dateTo || o.createdAt.slice(0, 10) <= dateTo
    const client = MOCK_CLIENTS.find(c => c.id === o.clientId)
    const matchCity = cityFilter === 'todas' || (client?.address.city === cityFilter)
    return matchSearch && matchStatus && matchSync && matchRep && matchFrom && matchTo && matchCity
  }), [search, statusFilter, syncFilter, repFilter, cityFilter, dateFrom, dateTo])

  const totalValue = filtered.reduce((s, o) => s + o.total, 0)
  const avgTicket = filtered.length > 0 ? totalValue / filtered.length : 0
  const maxOrder = filtered.reduce((max, o) => o.total > max ? o.total : max, 0)
  const minOrder = filtered.length > 0 ? filtered.reduce((min, o) => o.total < min ? o.total : min, Infinity) : 0

  // Monthly revenue for chart (last 6 months)
  const now = new Date()
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const label = d.toLocaleDateString('pt-BR', { month: 'short' })
    const monthStr = d.toISOString().slice(0, 7)
    const revenue = MOCK_ORDERS.filter(o => o.createdAt.startsWith(monthStr)).reduce((s, o) => s + o.total, 0)
    return { label, revenue }
  })
  const maxMonthRevenue = Math.max(...monthlyData.map(m => m.revenue), 1)

  // Rep ranking
  const repRanking = reps.map(r => {
    const repOrders = MOCK_ORDERS.filter(o => o.repId === r.id)
    return { name: r.name.split(' ')[0], count: repOrders.length, revenue: repOrders.reduce((s, o) => s + o.total, 0) }
  }).sort((a, b) => b.revenue - a.revenue)

  return (
    <AdminLayout title="Pedidos">
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        {/* Sync banner */}
        {pendingSync > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Package className="w-4 h-4 text-amber-600" />
            <p className="text-sm text-amber-800 flex-1">
              <span className="font-bold">{pendingSync} pedido{pendingSync > 1 ? 's' : ''}</span> aguardando envio para o Bling
            </p>
            <button className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg bg-white hover:bg-amber-50">
              <RefreshCw className="w-3 h-3" />
              Sincronizar
            </button>
          </div>
        )}

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
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente, número ou rep..." className="input pl-10" />
              </div>
              <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="input w-auto min-w-36">
                <option value="todos">Todos reps</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name.split(' ')[0]}</option>)}
              </select>
              <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="input w-auto min-w-36">
                <option value="todas">Todas cidades</option>
                {allCities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as OrderStatus | 'todos')} className="input w-auto">
                {STATUS_OPTS.map(s => (
                  <option key={s} value={s}>{s === 'todos' ? 'Todos status' : s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>
                ))}
              </select>
              <select value={syncFilter} onChange={e => setSyncFilter(e.target.value as SyncStatus | 'todos')} className="input w-auto">
                <option value="todos">Qualquer sync</option>
                <option value="pendente">Pendente</option>
                <option value="sincronizado">Sincronizado</option>
                <option value="erro">Erro</option>
              </select>
            </div>

            <div>
              <button onClick={() => setShowPeriod(v => !v)} className="text-xs text-primary-600 font-medium">
                {showPeriod ? '↑ Ocultar período' : '↓ Filtrar por período'}
              </button>
              {showPeriod && (
                <div className="flex gap-2 mt-2">
                  <div className="flex-1">
                    <label className="text-xs text-slate-400 block mb-1">De</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input text-sm" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-400 block mb-1">Até</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input text-sm" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">{filtered.length} pedido{filtered.length !== 1 ? 's' : ''}</p>
              <p className="text-sm font-bold text-slate-900">Total: {formatCurrency(totalValue)}</p>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Pedido</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Cliente</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">Representante</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Bling</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((order, i) => (
                      <motion.tr
                        key={order.id}
                        className="hover:bg-slate-50 transition-colors"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-mono font-semibold text-slate-900">{order.number}</p>
                          <p className="text-xs text-slate-400">{formatDate(order.createdAt)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-800 truncate max-w-40">{order.clientName}</p>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <p className="text-sm text-slate-500">{order.repName.split(' ')[0]}</p>
                        </td>
                        <td className="px-4 py-3">
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <SyncStatusBadge status={order.syncStatus} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-bold text-slate-900">{formatCurrency(order.total)}</span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {view === 'Inteligência' && (
          <div className="space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total faturado', value: formatCurrency(MOCK_ORDERS.reduce((s, o) => s + o.total, 0)), icon: TrendingUp, color: 'text-primary-600', bg: 'bg-primary-50' },
                { label: 'Ticket médio', value: formatCurrency(avgTicket), icon: BarChart2, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Maior pedido', value: formatCurrency(maxOrder), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Menor pedido', value: formatCurrency(minOrder === Infinity ? 0 : minOrder), icon: TrendingDown, color: 'text-amber-600', bg: 'bg-amber-50' },
              ].map((kpi, i) => (
                <motion.div key={kpi.label} className="card p-4" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-2', kpi.bg)}>
                    <kpi.icon className={cn('w-4 h-4', kpi.color)} />
                  </div>
                  <p className="text-base font-bold text-slate-900">{kpi.value}</p>
                  <p className="text-xs text-slate-400">{kpi.label}</p>
                </motion.div>
              ))}
            </div>

            {/* Monthly chart */}
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Faturamento Mensal</h3>
              <div className="flex items-end gap-2 h-32">
                {monthlyData.map((m, i) => (
                  <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-slate-400 font-medium">{formatCurrency(m.revenue).replace('R$ ', '')}</span>
                    <motion.div
                      className="w-full bg-primary-600 rounded-t-lg min-h-1"
                      style={{ height: `${Math.max((m.revenue / maxMonthRevenue) * 80, 4)}px` }}
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max((m.revenue / maxMonthRevenue) * 80, 4)}px` }}
                      transition={{ delay: i * 0.1, duration: 0.5 }}
                    />
                    <span className="text-xs text-slate-400">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rep ranking */}
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Ranking por Representante</h3>
              <div className="space-y-3">
                {repRanking.map((r, i) => (
                  <div key={r.name} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-slate-800">{r.name}</span>
                        <span className="font-bold text-slate-900">{formatCurrency(r.revenue)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-primary-600 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${repRanking[0].revenue > 0 ? (r.revenue / repRanking[0].revenue) * 100 : 0}%` }}
                          transition={{ delay: i * 0.1 }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">{r.count}p</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
