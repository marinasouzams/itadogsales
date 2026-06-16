import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Download, TrendingUp, BarChart2, PieChart, Users, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { RevenueChart, RankingChart, FunnelChart } from '@/components/shared/Charts'
import { useOrders, useVisits, useClients, useMonthlyRevenue, useRepRanking, useProspects } from '@/hooks/useData'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate } from '@/utils'
import { OrderStatusBadge } from '@/components/shared/StatusBadge'


export default function AdminRelatorios() {
  const [period, setPeriod] = useState('ano')
  const { data: allOrders = [], loading } = useOrders()
  const { data: allVisits = [] } = useVisits()
  const { data: allClients = [] } = useClients()
  const { data: monthlyRevenue = [] } = useMonthlyRevenue()
  const { data: ranking = [] } = useRepRanking()
  const { data: allProspects = [] } = useProspects()

  const rankingData = ranking.map(r => ({ name: r.name, faturamento: r.faturamento, meta: r.meta }))

  const invoicedOrders = allOrders.filter(o => o.status === 'invoiced_ready_to_ship')
  // Faturamento/conversão contam a venda a partir do envio para separação
  const revenueOrders = allOrders.filter(o => REVENUE_STATUSES.includes(o.status))
  const totalRevenue = revenueOrders.reduce((s, o) => s + o.total, 0)
  const avgTicket = revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0
  const conversionRate = allOrders.length > 0
    ? Math.round(revenueOrders.length / allOrders.length * 100)
    : 0
  const visitConversion = allVisits.length > 0
    ? Math.round(allVisits.filter(v => v.result === 'positivo').length / allVisits.length * 100)
    : 0

  // Funil dinâmico
  const FUNNEL_DATA = [
    { stage: 'Prospecções', value: allProspects.length || 0 },
    { stage: 'Visitas', value: allVisits.length || 0 },
    { stage: 'Gerados', value: allOrders.filter(o => o.status === 'generated').length || 0 },
    { stage: 'Em Separação', value: allOrders.filter(o => ['pending_separation','separation'].includes(o.status)).length || 0 },
    { stage: 'Faturados', value: invoicedOrders.length || 0 },
  ]

  // Top products
  const productMap = new Map<string, { name: string; qty: number; revenue: number; orderCount: number }>()
  allOrders.forEach(o => o.items.forEach(item => {
    const e = productMap.get(item.productId) ?? { name: item.productName, qty: 0, revenue: 0, orderCount: 0 }
    productMap.set(item.productId, { name: item.productName, qty: e.qty + item.quantity, revenue: e.revenue + item.total, orderCount: e.orderCount + 1 })
  }))
  const topProducts = [...productMap.values()].sort((a, b) => b.revenue - a.revenue)

  const now = new Date()
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().slice(0, 10)
  const recentProductIds = new Set(
    allOrders.filter(o => o.createdAt >= cutoff).flatMap(o => o.items.map(i => i.productId))
  )
  const allProductIds = [...new Set(allOrders.flatMap(o => o.items.map(i => i.productId)))]
  const inactiveProducts = allProductIds.filter(pid => !recentProductIds.has(pid)).map(pid => {
    const p = productMap.get(pid)
    return p ? { id: pid, name: p.name } : null
  }).filter(Boolean)

  const prazoMetrics = useMemo(() => {
    const withSep = allOrders.filter(o => o.generatedAt && o.status !== 'draft')
    const sepTimes = withSep
      .filter(o => o.generatedAt)
      .map(o => Math.floor((new Date(o.generatedAt!).getTime() - new Date(o.createdAt).getTime()) / 86400000))
      .filter(d => d >= 0 && d < 365)

    const invTimes = allOrders
      .filter(o => o.invoicedAt)
      .map(o => Math.floor((new Date(o.invoicedAt!).getTime() - new Date(o.createdAt).getTime()) / 86400000))
      .filter(d => d >= 0 && d < 365)

    const delTimes = allOrders
      .filter(o => o.deliveredAt)
      .map(o => Math.floor((new Date(o.deliveredAt!).getTime() - new Date(o.createdAt).getTime()) / 86400000))
      .filter(d => d >= 0 && d < 365)

    const avg = (arr: number[]) => arr.length > 0 ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1) : 'N/A'
    const min = (arr: number[]) => arr.length > 0 ? Math.min(...arr) : null
    const max = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : null

    return {
      avgToSep: avg(sepTimes), minToSep: min(sepTimes), maxToSep: max(sepTimes),
      avgToInv: avg(invTimes), minToInv: min(invTimes), maxToInv: max(invTimes),
      avgToDel: avg(delTimes), minToDel: min(delTimes), maxToDel: max(delTimes),
    }
  }, [allOrders])

  if (loading) return <AdminLayout title="Relatórios"><div className="p-6"><LoadingSpinner /></div></AdminLayout>

  return (
    <AdminLayout title="Relatórios">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header + Export */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Relatório de Performance</h2>
            <p className="text-sm text-slate-500">Análise completa da equipe de vendas</p>
          </div>
          <div className="flex gap-3">
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="input w-auto text-sm"
            >
              <option value="junho">Junho 2025</option>
              <option value="maio">Maio 2025</option>
              <option value="trimestre">Último trimestre</option>
            </select>
            <button className="btn-primary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Exportar PDF
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Faturamento', value: formatCurrency(totalRevenue), sub: '+12% vs mês anterior', positive: true },
            { label: 'Ticket Médio', value: formatCurrency(avgTicket), sub: 'Por pedido', positive: true },
            { label: 'Taxa de Conversão', value: `${conversionRate}%`, sub: 'Pedidos fechados', positive: conversionRate > 50 },
            { label: 'Efic. de Visitas', value: `${visitConversion}%`, sub: 'Resultado positivo', positive: visitConversion > 60 },
          ].map((kpi, i) => (
            <motion.div
              key={kpi.label}
              className="card p-5"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{kpi.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{kpi.value}</p>
              <p className={`text-xs mt-1 ${kpi.positive ? 'text-green-600' : 'text-red-500'}`}>{kpi.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary-600" />
              Faturamento Mensal
            </h3>
            <RevenueChart data={monthlyRevenue} />
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary-600" />
              Ranking de Representantes
            </h3>
            <RankingChart data={rankingData} />
          </div>
        </div>

        {/* Funnel */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary-600" />
            Funil de Vendas
          </h3>
          <FunnelChart data={FUNNEL_DATA} />
        </div>

        {/* Top Products */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary-600" />
              Top Produtos Vendidos
            </h3>
            <div className="space-y-3">
              {topProducts.slice(0, 6).map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-slate-800 truncate max-w-40">{p.name}</span>
                      <span className="font-bold text-slate-900 flex-shrink-0">{formatCurrency(p.revenue)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-600 rounded-full"
                        style={{ width: `${topProducts[0].revenue > 0 ? (p.revenue / topProducts[0].revenue) * 100 : 0}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{p.qty} un · {p.orderCount} pedido(s)</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-amber-500" />
              Produtos sem Pedido (30d)
            </h3>
            <p className="text-xs text-slate-400 mb-4">Produtos não incluídos em nenhum pedido no último mês</p>
            {inactiveProducts.length === 0 ? (
              <p className="text-sm text-green-600 font-medium">Todos os produtos foram pedidos recentemente!</p>
            ) : (
              <div className="space-y-2">
                {inactiveProducts.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
                    <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                    <span className="text-sm text-slate-700">{p.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Client analysis */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[
            { label: 'Clientes Ativos', value: allClients.filter(c => c.status === 'ativo').length, total: allClients.length, color: 'bg-green-500' },
            { label: 'Sem visita +30 dias', value: allClients.filter(c => !c.lastVisit).length, total: allClients.length, color: 'bg-red-500' },
            { label: 'Alta prioridade', value: allClients.filter(c => c.priority === 'alta').length, total: allClients.length, color: 'bg-amber-500' },
          ].map((stat, i) => (
            <div key={stat.label} className="card p-4">
              <p className="text-xs text-slate-400 font-medium mb-2">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900 mb-3">{stat.value}</p>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${stat.color} rounded-full`}
                  style={{ width: `${(stat.value / stat.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">{Math.round((stat.value / stat.total) * 100)}% do total</p>
            </div>
          ))}
        </div>

        {/* Métricas de Prazo */}
        <div className="card p-5">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary-600" />
            Métricas de Prazo (dias)
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Criação → Separação', avg: prazoMetrics.avgToSep, min: prazoMetrics.minToSep, max: prazoMetrics.maxToSep },
              { label: 'Criação → Faturamento', avg: prazoMetrics.avgToInv, min: prazoMetrics.minToInv, max: prazoMetrics.maxToInv },
              { label: 'Criação → Entrega', avg: prazoMetrics.avgToDel, min: prazoMetrics.minToDel, max: prazoMetrics.maxToDel },
            ].map(m => (
              <div key={m.label} className="bg-slate-50 rounded-xl p-4 text-center">
                <p className="text-xs font-semibold text-slate-500 mb-2">{m.label}</p>
                <p className="text-2xl font-bold text-slate-900">{m.avg}d</p>
                <div className="flex justify-center gap-3 mt-1">
                  {m.min !== null && <span className="text-xs text-green-600">mín {m.min}d</span>}
                  {m.max !== null && <span className="text-xs text-red-500">máx {m.max}d</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <ExtraReportSections allClients={allClients} allVisits={allVisits} allOrders={allOrders} />
      </div>
    </AdminLayout>
  )
}

// ─── Extra report sections ────────────────────────────────────────────────────

import type { Client } from '@/types'
import type { Visit } from '@/types'
import type { Order } from '@/types'
import { REVENUE_STATUSES } from '@/types'

function daysSince(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function SectionToggle({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}

function ExtraReportSections({
  allClients,
  allVisits,
  allOrders,
}: {
  allClients: Client[]
  allVisits: Visit[]
  allOrders: Order[]
}) {
  // ── A) Top 10 visitados ────────────────────────────────────────────────────
  const visitCountByClient = new Map<string, { name: string; city: string; count: number; lastVisit: string }>()
  allVisits.filter(v => v.status === 'concluida').forEach(v => {
    const existing = visitCountByClient.get(v.clientId) ?? { name: v.clientName, city: v.clientCity ?? '', count: 0, lastVisit: '' }
    const last = v.createdAt > existing.lastVisit ? v.createdAt : existing.lastVisit
    visitCountByClient.set(v.clientId, { ...existing, count: existing.count + 1, lastVisit: last })
  })
  const topVisited = [...visitCountByClient.entries()]
    .map(([, val]) => val)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // ── B) Clientes não visitados ──────────────────────────────────────────────
  const PRIORITY_ORDER: Record<string, number> = { alta: 0, media: 1, baixa: 2 }
  const unvisited = allClients
    .filter(c => !c.lastVisit || daysSince(c.lastVisit) > 30)
    .map(c => ({ ...c, days: c.lastVisit ? daysSince(c.lastVisit) : null }))
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 3
      const pb = PRIORITY_ORDER[b.priority] ?? 3
      if (pa !== pb) return pa - pb
      return (b.days ?? 9999) - (a.days ?? 9999)
    })

  // ── C) Maiores pedidos ─────────────────────────────────────────────────────
  const topOrders = [...allOrders].sort((a, b) => b.total - a.total).slice(0, 10)

  // ── D) Agilidade de entrega ────────────────────────────────────────────────
  const deliveredTimes = allOrders
    .filter(o => o.status === 'delivered' && o.deliveredAt)
    .map(o => daysSince(o.createdAt) - daysSince(o.deliveredAt!))
    .filter(d => d >= 0)

  const avgDelivery = deliveredTimes.length > 0
    ? Math.round(deliveredTimes.reduce((s, d) => s + d, 0) / deliveredTimes.length)
    : null
  const minDelivery = deliveredTimes.length > 0 ? Math.min(...deliveredTimes) : null
  const maxDelivery = deliveredTimes.length > 0 ? Math.max(...deliveredTimes) : null

  const PRIORITY_LABEL: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }
  const PRIORITY_CLASS: Record<string, string> = {
    alta: 'bg-red-100 text-red-700',
    media: 'bg-amber-100 text-amber-700',
    baixa: 'bg-slate-100 text-slate-600',
  }

  return (
    <div className="space-y-6">
      {/* A) Top Visitados */}
      <SectionToggle title="Clientes mais visitados (Top 10)">
        {topVisited.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma visita concluída encontrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 w-8">#</th>
                  <th className="pb-2">Nome</th>
                  <th className="pb-2">Cidade</th>
                  <th className="pb-2 text-right">Visitas</th>
                  <th className="pb-2 text-right">Última visita</th>
                </tr>
              </thead>
              <tbody>
                {topVisited.map((c, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 text-xs font-bold text-slate-400">{i + 1}</td>
                    <td className="py-2 font-medium text-slate-800">{c.name}</td>
                    <td className="py-2 text-slate-500">{c.city || '—'}</td>
                    <td className="py-2 text-right font-bold text-primary-700">{c.count}</td>
                    <td className="py-2 text-right text-slate-400">{c.lastVisit ? formatDate(c.lastVisit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionToggle>

      {/* B) Não visitados */}
      <SectionToggle title="Clientes não visitados (>30 dias ou nunca)">
        {unvisited.length === 0 ? (
          <p className="text-sm text-green-600 font-medium">Todos os clientes foram visitados recentemente!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2">Nome</th>
                  <th className="pb-2">Cidade</th>
                  <th className="pb-2">Prioridade</th>
                  <th className="pb-2 text-right">Dias sem visita</th>
                </tr>
              </thead>
              <tbody>
                {unvisited.map(c => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 font-medium text-slate-800">{c.name}</td>
                    <td className="py-2 text-slate-500">{c.address?.city || '—'}</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${PRIORITY_CLASS[c.priority] ?? 'bg-slate-100 text-slate-600'}`}>
                        {PRIORITY_LABEL[c.priority] ?? c.priority}
                      </span>
                    </td>
                    <td className="py-2 text-right text-slate-500">{c.days !== null ? `${c.days}d` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionToggle>

      {/* C) Maiores pedidos */}
      <SectionToggle title="Maiores Pedidos (Top 10)">
        {topOrders.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum pedido encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Nº Pedido</th>
                  <th className="pb-2">Cliente</th>
                  <th className="pb-2">Representante</th>
                  <th className="pb-2 text-right">Valor</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {topOrders.map((o, i) => (
                  <tr key={o.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 text-xs font-bold text-slate-400">{i + 1}</td>
                    <td className="py-2 font-mono text-xs text-slate-600">{o.number}</td>
                    <td className="py-2 font-medium text-slate-800">{o.clientName}</td>
                    <td className="py-2 text-slate-500">{o.repName}</td>
                    <td className="py-2 text-right font-bold text-slate-900">{formatCurrency(o.total)}</td>
                    <td className="py-2 text-right"><OrderStatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionToggle>

      {/* D) Agilidade de entrega */}
      <SectionToggle title="Agilidade de Entrega">
        {deliveredTimes.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum pedido entregue com data registrada.</p>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-slate-900">{avgDelivery !== null ? `${avgDelivery}d` : '—'}</p>
              <p className="text-xs text-slate-400 mt-1">Tempo médio</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-green-700">{minDelivery !== null ? `${minDelivery}d` : '—'}</p>
              <p className="text-xs text-slate-400 mt-1">Menor tempo</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4">
              <p className="text-2xl font-bold text-red-700">{maxDelivery !== null ? `${maxDelivery}d` : '—'}</p>
              <p className="text-xs text-slate-400 mt-1">Maior tempo</p>
            </div>
          </div>
        )}
      </SectionToggle>
    </div>
  )
}
