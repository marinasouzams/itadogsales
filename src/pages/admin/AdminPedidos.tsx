import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, TrendingUp, TrendingDown, BarChart2, FileSpreadsheet, ChevronRight } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useOrders, useUsers, useClients, useMonthlyRevenue, useRepRanking } from '@/hooks/useData'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate, cn } from '@/utils'
import { OrderStatusBadge } from '@/components/shared/StatusBadge'
import type { OrderStatus } from '@/types'
import * as XLSX from 'xlsx'

const STATUS_OPTS: { label: string; value: OrderStatus | 'todos' }[] = [
  { label: 'Todos status', value: 'todos' },
  { label: 'Rascunho', value: 'draft' },
  { label: 'Gerado', value: 'generated' },
  { label: 'Pendente Separação', value: 'pending_separation' },
  { label: 'Em Separação', value: 'separation' },
  { label: 'Faturado / Envio', value: 'invoiced_ready_to_ship' },
  { label: 'Entregue', value: 'delivered' },
]

const VIEWS = ['Lista', 'Inteligência'] as const
type View = typeof VIEWS[number]

export default function AdminPedidos() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'todos'>('todos')
  const [repFilter, setRepFilter] = useState('todos')
  const [cityFilter, setCityFilter] = useState('todas')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showPeriod, setShowPeriod] = useState(false)
  const [view, setView] = useState<View>('Lista')

  const { data: allOrders = [], loading } = useOrders()
  const { data: users = [] } = useUsers()
  const { data: allClients = [] } = useClients()
  const { data: monthlyRevenue = [] } = useMonthlyRevenue()
  const { data: repRankingData = [] } = useRepRanking()

  const reps = users.filter(u => u.role === 'rep')
  const allCities = useMemo(() => [...new Set(allClients.map(c => c.address.city))].sort(), [allClients])

  const filtered = useMemo(() => allOrders.filter(o => {
    const matchSearch = o.clientName.toLowerCase().includes(search.toLowerCase()) ||
      o.number.toLowerCase().includes(search.toLowerCase()) ||
      o.repName.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'todos' || o.status === statusFilter
    const matchRep = repFilter === 'todos' || o.repId === repFilter
    const matchFrom = !dateFrom || o.createdAt.slice(0, 10) >= dateFrom
    const matchTo = !dateTo || o.createdAt.slice(0, 10) <= dateTo
    const matchCity = cityFilter === 'todas' || o.clientCity === cityFilter
    return matchSearch && matchStatus && matchRep && matchFrom && matchTo && matchCity
  }), [allOrders, search, statusFilter, repFilter, cityFilter, dateFrom, dateTo])

  const invoicedOrders = useMemo(() => allOrders.filter(o => o.status === 'invoiced_ready_to_ship'), [allOrders])
  const totalValue = filtered.reduce((s, o) => s + o.total, 0)
  const avgTicket = filtered.length > 0 ? totalValue / filtered.length : 0
  const maxOrder = filtered.reduce((max, o) => o.total > max ? o.total : max, 0)
  const minOrder = filtered.length > 0 ? filtered.reduce((min, o) => o.total < min ? o.total : min, Infinity) : 0

  const monthlyData = monthlyRevenue.map(m => ({ label: m.month, revenue: m.faturamento }))
  const maxMonthRevenue = Math.max(...monthlyData.map(m => m.revenue), 1)
  const repRanking = repRankingData.map(r => ({ name: r.name, count: 0, revenue: r.faturamento }))

  const pendingCount = allOrders.filter(o => o.status === 'generated').length

  const handleExportXLSX = () => {
    const rows = filtered.map(o => ({
      'Número': o.number,
      'Data': formatDate(o.createdAt),
      'Cliente': o.clientName,
      'Cidade': o.clientCity ?? '',
      'Representante': o.repName,
      'Status': o.status,
      'Itens': o.items.map(i => `${i.productName} (${i.quantity}x)`).join('; '),
      'Subtotal (R$)': o.subtotal,
      'Desconto (R$)': o.discount,
      'Total (R$)': o.total,
      'Observações': o.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')
    XLSX.writeFile(wb, `ITADOG-SALES-pedidos-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  if (loading) return <AdminLayout title="Pedidos"><div className="p-6"><LoadingSpinner /></div></AdminLayout>

  return (
    <AdminLayout title="Pedidos">
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        {/* Alerta pedidos gerados aguardando separação */}
        {pendingCount > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <ChevronRight className="w-4 h-4 text-amber-600" />
            <p className="text-sm text-amber-800 flex-1">
              <span className="font-bold">{pendingCount} pedido{pendingCount > 1 ? 's' : ''}</span> gerado{pendingCount > 1 ? 's' : ''} aguardando envio para separação
            </p>
            <button onClick={() => setStatusFilter('generated')}
              className="text-xs font-semibold text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg bg-white hover:bg-amber-50">
              Ver pedidos
            </button>
          </div>
        )}

        {/* View toggle */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
            {VIEWS.map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn('px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                  view === v ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={handleExportXLSX}
            className="flex items-center gap-2 text-sm font-semibold text-primary-700 border border-primary-200 px-4 py-2 rounded-xl bg-primary-50 hover:bg-primary-100 transition-colors">
            <FileSpreadsheet className="w-4 h-4" /> Gerar Planilha
          </button>
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
                {STATUS_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
              <div className="flex gap-4 text-sm">
                <span className="text-slate-500">Filtro: <strong>{formatCurrency(totalValue)}</strong></span>
                <span className="text-slate-500">Faturado total: <strong className="text-green-700">{formatCurrency(invoicedOrders.reduce((s,o) => s+o.total, 0))}</strong></span>
              </div>
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
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Valor</th>
                      <th className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((order, i) => (
                      <motion.tr
                        key={order.id}
                        onClick={() => navigate(`/admin/pedidos/${order.id}`)}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
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
                          {order.clientCity && <p className="text-xs text-slate-400">{order.clientCity}</p>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <p className="text-sm text-slate-500">{order.repName.split(' ')[0]}</p>
                        </td>
                        <td className="px-4 py-3">
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-bold text-slate-900">{formatCurrency(order.total)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight className="w-4 h-4 text-slate-300" />
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total faturado', value: formatCurrency(invoicedOrders.reduce((s,o) => s+o.total,0)), icon: TrendingUp, color: 'text-primary-600', bg: 'bg-primary-50' },
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

            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Faturamento Mensal (pedidos faturados)</h3>
              <div className="flex items-end gap-2 h-32">
                {monthlyData.map((m, i) => (
                  <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-slate-400 font-medium">{formatCurrency(m.revenue).replace('R$ ', '')}</span>
                    <motion.div className="w-full bg-primary-600 rounded-t-lg min-h-1"
                      style={{ height: `${Math.max((m.revenue / maxMonthRevenue) * 80, 4)}px` }}
                      initial={{ height: 0 }} animate={{ height: `${Math.max((m.revenue / maxMonthRevenue) * 80, 4)}px` }}
                      transition={{ delay: i * 0.1, duration: 0.5 }} />
                    <span className="text-xs text-slate-400">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

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
                        <motion.div className="h-full bg-primary-600 rounded-full" initial={{ width: 0 }}
                          animate={{ width: `${repRanking[0].revenue > 0 ? (r.revenue / repRanking[0].revenue) * 100 : 0}%` }}
                          transition={{ delay: i * 0.1 }} />
                      </div>
                    </div>
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
