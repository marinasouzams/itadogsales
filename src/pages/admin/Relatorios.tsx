import { useState } from 'react'
import { motion } from 'framer-motion'
import { Download, TrendingUp, BarChart2, PieChart, Users } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { RevenueChart, RankingChart, FunnelChart } from '@/components/shared/Charts'
import { MOCK_USERS, MOCK_CLIENTS, MOCK_ORDERS, MOCK_VISITS, MONTHLY_REVENUE, REP_RANKING } from '@/mock/data'
import { formatCurrency } from '@/utils'

const FUNNEL_DATA = [
  { stage: 'Prospecções', value: 87 },
  { stage: 'Visitas', value: 54 },
  { stage: 'Propostas', value: 31 },
  { stage: 'Pedidos', value: 18 },
  { stage: 'Faturados', value: 12 },
]

export default function AdminRelatorios() {
  const [period, setPeriod] = useState('junho')

  const rankingData = REP_RANKING.map(r => ({ name: r.name.split(' ')[0], faturamento: r.faturamento, meta: r.meta }))

  const totalRevenue = MOCK_ORDERS.reduce((s, o) => s + o.total, 0)
  const avgTicket = MOCK_ORDERS.length > 0 ? totalRevenue / MOCK_ORDERS.length : 0
  const conversionRate = MOCK_ORDERS.length > 0 ? Math.round((MOCK_ORDERS.filter(o => o.status === 'faturado' || o.status === 'aprovado').length / MOCK_ORDERS.length) * 100) : 0
  const visitConversion = MOCK_VISITS.length > 0 ? Math.round((MOCK_VISITS.filter(v => v.result === 'positivo').length / MOCK_VISITS.length) * 100) : 0

  // Top products
  const productMap = new Map<string, { name: string; qty: number; revenue: number; orderCount: number }>()
  MOCK_ORDERS.forEach(o => o.items.forEach(item => {
    const e = productMap.get(item.productId) ?? { name: item.productName, qty: 0, revenue: 0, orderCount: 0 }
    productMap.set(item.productId, { name: item.productName, qty: e.qty + item.quantity, revenue: e.revenue + item.total, orderCount: e.orderCount + 1 })
  }))
  const topProducts = [...productMap.values()].sort((a, b) => b.revenue - a.revenue)

  // Products not ordered in 30 days (mock: products not in any order)
  const now = new Date()
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().slice(0, 10)
  const recentProductIds = new Set(
    MOCK_ORDERS.filter(o => o.createdAt >= cutoff).flatMap(o => o.items.map(i => i.productId))
  )
  const allProductIds = [...new Set(MOCK_ORDERS.flatMap(o => o.items.map(i => i.productId)))]
  const inactiveProducts = allProductIds.filter(id => !recentProductIds.has(id)).map(id => {
    const p = productMap.get(id)
    return p ? { id, name: p.name } : null
  }).filter(Boolean)

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
            <RevenueChart data={MONTHLY_REVENUE} />
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
            { label: 'Clientes Ativos', value: MOCK_CLIENTS.filter(c => c.status === 'ativo').length, total: MOCK_CLIENTS.length, color: 'bg-green-500' },
            { label: 'Sem visita +30 dias', value: MOCK_CLIENTS.filter(c => !c.lastVisit).length, total: MOCK_CLIENTS.length, color: 'bg-red-500' },
            { label: 'Alta prioridade', value: MOCK_CLIENTS.filter(c => c.priority === 'alta').length, total: MOCK_CLIENTS.length, color: 'bg-amber-500' },
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
      </div>
    </AdminLayout>
  )
}
