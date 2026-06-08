import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ChevronLeft, MapPin, Phone, Mail, Users, ShoppingCart,
  TrendingUp, Star, Calendar, DollarSign, Award,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import {
} from 'lucide-react' // (kept for TS, icons already imported above)
import { useUser, useClients, useOrders, useVisits, useInteractions, useCommissions } from '@/hooks/useData'
import { LoadingSpinner, ErrorState } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate, cn } from '@/utils'
import { OrderStatusBadge } from '@/components/shared/StatusBadge'

const TABS = ['Visão Geral', 'Pedidos', 'Visitas', 'Comissões', 'Interações'] as const
type Tab = typeof TABS[number]

const INTERACTION_ICONS: Record<string, string> = {
  checkin: '📍', checkout: '✅', pedido: '🛒', rota: '🗺️',
  ligacao: '📞', whatsapp: '💬', visita: '🏠',
}

export default function AdminRepDetalhes() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Visão Geral')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: rep, loading: loadingRep, error } = useUser(id)
  const { data: clients = [] } = useClients(id)
  const { data: allOrders = [] } = useOrders(id)
  const { data: allVisits = [] } = useVisits(id)
  const { data: interactions = [] } = useInteractions(undefined, id)
  const { data: commissions = [] } = useCommissions(id)

  const filteredOrders = useMemo(() => allOrders.filter(o => {
    const matchFrom = !dateFrom || o.createdAt.slice(0, 10) >= dateFrom
    const matchTo = !dateTo || o.createdAt.slice(0, 10) <= dateTo
    return matchFrom && matchTo
  }), [allOrders, dateFrom, dateTo])

  const filteredVisits = useMemo(() => allVisits.filter(v => {
    const matchFrom = !dateFrom || v.createdAt >= dateFrom
    const matchTo = !dateTo || v.createdAt <= dateTo
    return matchFrom && matchTo
  }), [allVisits, dateFrom, dateTo])

  if (loadingRep) return <AdminLayout title="Representante"><div className="p-6"><LoadingSpinner /></div></AdminLayout>
  if (error || !rep) return (
    <AdminLayout title="Representante">
      <div className="p-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm mb-4"><ChevronLeft className="w-4 h-4" /> Voltar</button>
        <ErrorState message="Representante não encontrado" />
      </div>
    </AdminLayout>
  )

  const revenue = filteredOrders.reduce((s, o) => s + o.total, 0)
  const metaPercent = rep.meta ? Math.min(100, Math.round((revenue / rep.meta) * 100)) : 0
  const totalCommission = commissions.reduce((s, c) => s + c.amount, 0)
  const paidCommission = commissions.filter(c => c.status === 'paga').reduce((s, c) => s + c.amount, 0)
  const pendingCommission = commissions.filter(c => c.status === 'prevista' || c.status === 'aprovada').reduce((s, c) => s + c.amount, 0)
  const avgCommissionPct = revenue > 0 ? (totalCommission / revenue) * 100 : 0
  const completedVisits = filteredVisits.filter(v => v.status === 'concluida').length
  const positiveVisits = filteredVisits.filter(v => v.result === 'positivo').length

  const clientRanking = clients.map(c => {
    const clientOrders = allOrders.filter(o => o.clientId === c.id)
    const total = clientOrders.reduce((s, o) => s + o.total, 0)
    return { ...c, total, orderCount: clientOrders.length }
  }).sort((a, b) => b.total - a.total)

  const productMap = new Map<string, { name: string; qty: number; revenue: number }>()
  allOrders.forEach(o => o.items.forEach(item => {
    const existing = productMap.get(item.productId) ?? { name: item.productName, qty: 0, revenue: 0 }
    productMap.set(item.productId, {
      name: item.productName,
      qty: existing.qty + item.quantity,
      revenue: existing.revenue + item.total,
    })
  }))
  const topProducts = [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  const showDateFilter = tab === 'Pedidos' || tab === 'Visitas'

  return (
    <AdminLayout title={rep.name}>
      <div className="p-6 space-y-5 max-w-5xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>

        {/* Header */}
        <div className="card p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center text-xl font-bold text-primary-700 flex-shrink-0">
                {rep.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">{rep.name}</h1>
                <p className="text-sm text-slate-500">{rep.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', rep.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                    {rep.active ? 'Ativo' : 'Inativo'}
                  </span>
                  {rep.region && (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {rep.region}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {rep.phone && (
                <a href={`tel:${rep.phone}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-medium">
                  <Phone className="w-3.5 h-3.5" />
                </a>
              )}
              <a href={`mailto:${rep.email}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-medium">
                <Mail className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Meta progress */}
          {rep.meta && (
            <div className="pt-4 border-t border-slate-100">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Meta do mês</span>
                <span className="font-bold text-slate-800">{metaPercent}% atingido</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', metaPercent >= 100 ? 'bg-green-500' : metaPercent >= 70 ? 'bg-primary-600' : 'bg-amber-500')}
                  style={{ width: `${Math.min(metaPercent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>{formatCurrency(rep.metaAting ?? 0)}</span>
                <span>{formatCurrency(rep.meta)}</span>
              </div>
            </div>
          )}

          {rep.territory && rep.territory.length > 0 && (
            <div className="pt-3 border-t border-slate-100 mt-3">
              <p className="text-xs text-slate-400 mb-1.5">Território</p>
              <div className="flex flex-wrap gap-1.5">
                {rep.territory.map(city => (
                  <span key={city} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{city}</span>
                ))}
              </div>
            </div>
          )}

          {/* Commission summary */}
          <div className="pt-3 border-t border-slate-100 mt-3">
            <p className="text-xs text-slate-400 mb-2">Comissões</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-slate-900">{formatCurrency(totalCommission)}</p>
                <p className="text-xs text-slate-400 mt-0.5">Gerada</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-green-700">{formatCurrency(paidCommission)}</p>
                <p className="text-xs text-slate-400 mt-0.5">Paga</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-amber-700">{formatCurrency(pendingCommission)}</p>
                <p className="text-xs text-slate-400 mt-0.5">Pendente</p>
              </div>
              <div className="bg-primary-50 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-primary-700">{revenue > 0 ? `${avgCommissionPct.toFixed(1)}%` : '—'}</p>
                <p className="text-xs text-slate-400 mt-0.5">% Médio</p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Clientes', value: clients.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Pedidos', value: allOrders.length, icon: ShoppingCart, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Faturamento', value: formatCurrency(revenue), icon: TrendingUp, color: 'text-primary-600', bg: 'bg-primary-50' },
            { label: 'Comissão paga', value: formatCurrency(paidCommission), icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map((kpi, i) => (
            <motion.div
              key={kpi.label}
              className="card p-4"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-2', kpi.bg)}>
                <kpi.icon className={cn('w-4 h-4', kpi.color)} />
              </div>
              <p className="text-base font-bold text-slate-900">{kpi.value}</p>
              <p className="text-xs text-slate-400">{kpi.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-shrink-0 flex-1 min-w-0 py-2 px-3 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {showDateFilter && (
          <div className="flex gap-2">
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

        {tab === 'Visão Geral' && (
          <div className="space-y-5">
            {/* Top clients */}
            <div className="card p-4">
              <p className="font-semibold text-slate-900 text-sm mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                Top Clientes
              </p>
              <div className="space-y-3">
                {clientRanking.slice(0, 5).map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.orderCount} pedido(s)</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-primary-700">{formatCurrency(c.total)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top products */}
            {topProducts.length > 0 && (
              <div className="card p-4">
                <p className="font-semibold text-slate-900 text-sm mb-3">Top Produtos</p>
                <div className="space-y-3">
                  {topProducts.map((p, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.qty} un</p>
                      </div>
                      <span className="text-sm font-bold text-slate-900">{formatCurrency(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="card p-4">
              <p className="font-semibold text-slate-900 text-sm mb-3">Visitas</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xl font-bold text-slate-900">{allVisits.length}</p>
                  <p className="text-xs text-slate-400">Total</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-green-600">{completedVisits}</p>
                  <p className="text-xs text-slate-400">Concluídas</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-primary-600">{positiveVisits}</p>
                  <p className="text-xs text-slate-400">Positivas</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'Pedidos' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{filteredOrders.length} pedido(s) · {formatCurrency(filteredOrders.reduce((s, o) => s + o.total, 0))}</p>
            {filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Nenhum pedido no período</div>
            ) : filteredOrders.map((order, i) => (
              <motion.div key={order.id} className="card p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{order.clientName}</p>
                    <p className="text-xs text-slate-400 font-mono">{order.number} · {formatDate(order.createdAt)}</p>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-400">{order.items.length} produto(s)</span>
                  <span className="text-base font-bold text-slate-900">{formatCurrency(order.total)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {tab === 'Visitas' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{filteredVisits.length} visita(s) · {filteredVisits.filter(v => v.status === 'concluida').length} concluídas</p>
            {filteredVisits.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Nenhuma visita no período</div>
            ) : filteredVisits.map((visit, i) => (
              <motion.div key={visit.id} className="card p-4 flex items-start gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', visit.status === 'concluida' ? 'bg-green-500' : visit.status === 'em_andamento' ? 'bg-amber-500' : 'bg-slate-300')} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">{visit.clientName}</p>
                  <p className="text-xs text-slate-400">{formatDate(visit.createdAt)} · {visit.status.replace('_', ' ')}</p>
                  {visit.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{visit.notes}</p>}
                </div>
                {visit.result && (
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', visit.result === 'positivo' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600')}>
                    {visit.result}
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {tab === 'Comissões' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="card p-4 text-center">
                <p className="text-lg font-bold text-green-600">{formatCurrency(paidCommission)}</p>
                <p className="text-xs text-slate-400">Já pago</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-lg font-bold text-amber-600">{formatCurrency(totalCommission - paidCommission)}</p>
                <p className="text-xs text-slate-400">A receber</p>
              </div>
            </div>
            <div className="space-y-3">
              {commissions.map((c, i) => (
                <motion.div key={c.id} className="card p-4 flex items-center justify-between" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{c.orderNumber}</p>
                    <p className="text-xs text-slate-400">{formatDate(c.referenceMonth)} · {c.rate}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-slate-900">{formatCurrency(c.amount)}</p>
                    <span className={cn('text-xs font-medium', c.status === 'paga' ? 'text-green-600' : c.status === 'aprovada' ? 'text-blue-600' : 'text-amber-600')}>
                      {c.status}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {tab === 'Interações' && (
          <div className="space-y-3">
            {interactions.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Nenhuma interação registrada</div>
            ) : interactions.slice(0, 30).map((int, i) => (
              <motion.div key={int.id} className="card p-4 flex gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                <span className="text-xl flex-shrink-0">{INTERACTION_ICONS[int.type] ?? '📋'}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">{int.title}</p>
                  <p className="text-xs text-slate-400">{int.clientName}</p>
                  {int.description && <p className="text-xs text-slate-500 mt-0.5">{int.description}</p>}
                  {int.rating && (
                    <div className="flex items-center gap-0.5 mt-1">
                      {Array.from({ length: int.rating }).map((_, j) => (
                        <Star key={j} className="w-3 h-3 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {formatDate(int.timestamp)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
