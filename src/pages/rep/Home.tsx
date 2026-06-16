import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Users, ShoppingCart, Star, AlertTriangle,
  ChevronRight, Clock, Package, Truck, CheckCircle2,
  TrendingUp, Filter,
} from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useClients, useOrders, useProspects, useCompanySettings } from '@/hooks/useData'
import { formatCurrency, daysSince, calcPercentage } from '@/utils'
import type { Order } from '@/types'
import { REVENUE_STATUSES } from '@/types'

type Period = 'mes_atual' | 'mes_anterior' | '3_meses' | '6_meses' | 'ano' | 'personalizado'

const PERIOD_LABELS: Record<Period, string> = {
  mes_atual: 'Mês Atual',
  mes_anterior: 'Mês Anterior',
  '3_meses': '3 Meses',
  '6_meses': '6 Meses',
  ano: 'Ano',
  personalizado: 'Personalizado',
}

function getPeriodRange(period: Period, customFrom: string, customTo: string): [Date, Date] {
  const now = new Date()
  switch (period) {
    case 'mes_atual':
      return [new Date(now.getFullYear(), now.getMonth(), 1), now]
    case 'mes_anterior': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return [start, end]
    }
    case '3_meses':
      return [new Date(now.getFullYear(), now.getMonth() - 3, 1), now]
    case '6_meses':
      return [new Date(now.getFullYear(), now.getMonth() - 6, 1), now]
    case 'ano':
      return [new Date(now.getFullYear(), 0, 1), now]
    case 'personalizado':
      return [
        customFrom ? new Date(customFrom) : new Date(now.getFullYear(), now.getMonth(), 1),
        customTo ? new Date(customTo + 'T23:59:59') : now,
      ]
  }
}

function filterByPeriod(orders: Order[], period: Period, customFrom: string, customTo: string): Order[] {
  const [from, to] = getPeriodRange(period, customFrom, customTo)
  return orders.filter(o => {
    const d = new Date(o.createdAt)
    return d >= from && d <= to
  })
}

export default function RepHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const repId = user?.id

  const { data: clients = [] } = useClients(repId)
  const { data: orders = [] } = useOrders(repId)
  const { data: prospects = [] } = useProspects()
  const { data: settings } = useCompanySettings()

  const [period, setPeriod] = useState<Period>('mes_atual')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const firstName = user?.name?.split(' ')[0] ?? 'Representante'

  const myProspects = prospects.filter(p => p.repId === repId && p.status === 'assumido')
  const clientsWithoutVisit = clients.filter(c => !c.lastVisit || daysSince(c.lastVisit) > 30)
  const clientsWithoutOrder = clients.filter(c => !c.lastOrder || daysSince(c.lastOrder) > 60)
  const readyToDeliver = orders.filter(o => o.status === 'invoiced_ready_to_ship')

  // Meta
  const metaValue = user?.meta ?? settings?.defaultMonthlyGoal ?? 180000
  // Conta para a meta a partir do envio para separação (venda realizada)
  const totalFaturado = orders
    .filter(o => REVENUE_STATUSES.includes(o.status))
    .reduce((s, o) => s + o.total, 0)
  const metaPercent = user?.metaAting
    ? calcPercentage(user.metaAting, metaValue)
    : Math.min(100, Math.round(totalFaturado / metaValue * 100))

  // Filtered orders for KPIs
  const filteredOrders = useMemo(
    () => filterByPeriod(orders, period, customFrom, customTo),
    [orders, period, customFrom, customTo]
  )

  const kpiPedidos = filteredOrders.length
  const kpiEmSeparacao = filteredOrders.filter(o => o.status === 'pending_separation' || o.status === 'separation').length
  const kpiProntosEnvio = filteredOrders.filter(o => o.status === 'invoiced_ready_to_ship').length
  const kpiEntregues = filteredOrders.filter(o => o.status === 'delivered').length
  const kpiClientesAtendidos = new Set(filteredOrders.map(o => o.clientId)).size
  const kpiTotalPeriodo = filteredOrders.reduce((s, o) => s + o.total, 0)
  const kpiTicketMedio = kpiPedidos > 0 ? kpiTotalPeriodo / kpiPedidos : 0

  const recentOrders = orders.filter(o => o.status !== 'invoiced_ready_to_ship').slice(0, 3)

  const kpis = [
    { label: 'Clientes', value: clients.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', note: 'total' },
    { label: 'Pedidos', value: kpiPedidos, icon: ShoppingCart, color: 'text-green-600', bg: 'bg-green-50', note: 'no período' },
    { label: 'Em Separação', value: kpiEmSeparacao, icon: Package, color: 'text-amber-600', bg: 'bg-amber-50', note: 'aguardando' },
    { label: 'Prontos p/ Envio', value: kpiProntosEnvio, icon: Truck, color: 'text-orange-600', bg: 'bg-orange-50', note: 'faturados' },
    { label: 'Entregues', value: kpiEntregues, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', note: 'no período' },
    { label: 'Clts Atendidos', value: kpiClientesAtendidos, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50', note: 'com pedido' },
    { label: 'Ticket Médio', value: formatCurrency(kpiTicketMedio), icon: Filter, color: 'text-slate-600', bg: 'bg-slate-100', note: 'por pedido', isText: true },
  ]

  return (
    <RepLayout>
      <div className="p-4 space-y-5">
        {/* Greeting */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="pt-2">
          <p className="text-slate-500 text-sm">{greeting},</p>
          <h1 className="text-2xl font-bold text-slate-900">{firstName} 👋</h1>
        </motion.div>

        {/* Meta Card */}
        <motion.div
          className="bg-gradient-to-br from-primary-600 to-blue-700 rounded-2xl p-5 text-white"
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Meta do Mês</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(totalFaturado)}</p>
              <p className="text-white/60 text-xs mt-0.5">de {formatCurrency(metaValue)}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{metaPercent}%</p>
              <p className="text-white/60 text-xs">atingido</p>
            </div>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-white"
              initial={{ width: 0 }} animate={{ width: `${metaPercent}%` }}
              transition={{ duration: 1, delay: 0.4 }}
            />
          </div>
          <p className="text-white/60 text-xs mt-2">
            Faltam {formatCurrency(Math.max(0, metaValue - totalFaturado))} para a meta
          </p>
        </motion.div>

        {/* Period Filter */}
        <div>
          <p className="section-title mb-2">Período</p>
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  period === p
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          {period === 'personalizado' && (
            <div className="flex gap-2 mt-2">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="input flex-1 text-sm"
                placeholder="De"
              />
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="input flex-1 text-sm"
                placeholder="Até"
              />
            </div>
          )}
        </div>

        {/* KPIs */}
        <div>
          <p className="section-title mb-2">Resumo do Período</p>
          <div className="grid grid-cols-4 gap-2">
            {kpis.map((kpi, i) => (
              <motion.div
                key={kpi.label}
                className="card p-2.5 flex flex-col items-center text-center gap-1"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.03 }}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${kpi.bg}`}>
                  <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
                </div>
                <p className={`font-bold text-slate-900 leading-none ${kpi.isText ? 'text-[11px]' : 'text-base'}`}>{kpi.value}</p>
                <p className="text-[9px] text-slate-500 leading-tight">{kpi.label}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <p className="section-title">Ações Rápidas</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Clientes', sub: 'Ver todos', icon: Users, bg: 'bg-slate-700', path: '/rep/clientes', border: 'hover:border-blue-200 hover:bg-blue-50' },
              { label: 'Pedidos', sub: `${orders.filter(o => o.syncStatus === 'pendente').length} pendentes`, icon: Package, bg: 'bg-green-600', path: '/rep/pedidos', border: 'hover:border-green-200 hover:bg-green-50' },
              { label: 'Leads', sub: 'Ver disponíveis', icon: Star, bg: 'bg-purple-600', path: '/rep/prospects', border: 'hover:border-purple-200 hover:bg-purple-50' },
              { label: 'Rota', sub: `${clients.length} clientes`, icon: TrendingUp, bg: 'bg-primary-600', path: '/rep/rota', border: 'hover:border-primary-200 hover:bg-primary-50' },
            ].map((a, i) => (
              <motion.button key={a.label} onClick={() => navigate(a.path)}
                className={`card p-4 flex items-center gap-3 text-left ${a.border} transition-all border-2 border-transparent active:scale-95`}
                initial={{ opacity: 0, x: i % 2 === 0 ? -10 : 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.05 }}>
                <div className={`w-11 h-11 rounded-2xl ${a.bg} flex items-center justify-center flex-shrink-0`}>
                  <a.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-slate-900">{a.label}</p>
                  <p className="text-xs text-slate-500">{a.sub}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Pronto para entrega */}
        {readyToDeliver.length > 0 && (
          <motion.div className="card border-amber-300 bg-amber-50 p-4" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-bold text-amber-800">Pronto para Entrega</p>
              </div>
              <span className="text-xs bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full">{readyToDeliver.length}</span>
            </div>
            <div className="space-y-2">
              {readyToDeliver.map(order => (
                <button key={order.id} onClick={() => navigate(`/rep/pedidos/${order.id}`)}
                  className="w-full flex items-center justify-between text-sm py-2 border-t border-amber-200 first:border-0 first:pt-0">
                  <div className="text-left">
                    <p className="font-semibold text-slate-800 text-xs">{order.clientName}</p>
                    <p className="text-xs text-slate-500">{order.number}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-amber-700">{formatCurrency(order.total)}</span>
                    <ChevronRight className="w-4 h-4 text-amber-500" />
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Alerts */}
        {(clientsWithoutVisit.length > 0 || clientsWithoutOrder.length > 0) && (
          <motion.div className="card border-amber-200 bg-amber-50 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">Atenção Necessária</p>
            </div>
            <div className="space-y-2">
              {clientsWithoutVisit.length > 0 && (
                <button onClick={() => navigate('/rep/clientes')}
                  className="w-full flex items-center justify-between text-sm text-amber-700">
                  <span className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    {clientsWithoutVisit.length} clientes sem visita há +30 dias
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              {clientsWithoutOrder.length > 0 && (
                <button onClick={() => navigate('/rep/clientes')}
                  className="w-full flex items-center justify-between text-sm text-amber-700">
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="w-3.5 h-3.5" />
                    {clientsWithoutOrder.length} clientes sem pedido há +60 dias
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Recent Orders */}
        {recentOrders.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="section-title">Pedidos Recentes</p>
              <button onClick={() => navigate('/rep/pedidos')} className="text-xs text-primary-600 font-medium flex items-center gap-1">
                Ver todos <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {recentOrders.map((order, i) => (
                <motion.button key={order.id} onClick={() => navigate(`/rep/pedidos/${order.id}`)}
                  className="w-full card p-4 flex items-center justify-between"
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.05 }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                      <ShoppingCart className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 text-left">{order.clientName.split(' ').slice(0, 2).join(' ')}</p>
                      <p className="text-xs text-slate-500">{order.number}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">{formatCurrency(order.total)}</p>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${order.syncStatus === 'sincronizado' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {order.syncStatus === 'sincronizado' ? 'Sincronizado' : 'Pendente'}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        <div className="h-2" />
      </div>
    </RepLayout>
  )
}
