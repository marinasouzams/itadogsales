import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, Users, ShoppingCart, MapPin, AlertTriangle,
  ChevronRight, Activity, DollarSign,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import KPICard from '@/components/shared/KPICard'
import { RevenueChart, VisitsChart, RankingChart } from '@/components/shared/Charts'
import MapMock from '@/components/shared/MapMock'
import { MOCK_CLIENTS, MOCK_ORDERS, MOCK_VISITS, MOCK_USERS, MOCK_AUDIT_LOGS, MONTHLY_REVENUE, VISITS_BY_DAY, REP_RANKING } from '@/mock/data'
import { formatCurrency, formatRelative } from '@/utils'

export default function AdminDashboard() {
  const navigate = useNavigate()

  const reps = MOCK_USERS.filter(u => u.role === 'rep')
  const totalRevenue = MOCK_ORDERS.reduce((s, o) => s + o.total, 0)
  const activeClients = MOCK_CLIENTS.filter(c => c.status === 'ativo').length
  const pendingOrders = MOCK_ORDERS.filter(o => o.syncStatus === 'pendente').length
  const completedVisits = MOCK_VISITS.filter(v => v.status === 'concluida').length
  const totalMeta = reps.reduce((s, r) => s + (r.meta ?? 0), 0)
  const totalAting = reps.reduce((s, r) => s + (r.metaAting ?? 0), 0)
  const metaPercent = totalMeta > 0 ? Math.round((totalAting / totalMeta) * 100) : 0

  const mapClients = MOCK_CLIENTS.map(c => ({
    id: c.id,
    name: c.name,
    lat: c.address.lat,
    lng: c.address.lng,
    priority: c.priority,
    visited: !!c.lastVisit,
  }))

  return (
    <AdminLayout title="Dashboard">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Faturamento Mensal"
            value={totalRevenue}
            currency
            icon={<DollarSign className="w-5 h-5 text-primary-600" />}
            iconBg="bg-primary-100"
            trend={12}
            sub={`Meta: ${formatCurrency(totalMeta)}`}
          />
          <KPICard
            label="Clientes Ativos"
            value={activeClients}
            icon={<Users className="w-5 h-5 text-blue-600" />}
            iconBg="bg-blue-100"
            sub={`${MOCK_CLIENTS.length} total`}
          />
          <KPICard
            label="Pedidos no Mês"
            value={MOCK_ORDERS.length}
            icon={<ShoppingCart className="w-5 h-5 text-green-600" />}
            iconBg="bg-green-100"
            trend={8}
            sub={`${pendingOrders} pendentes`}
          />
          <KPICard
            label="Visitas Realizadas"
            value={completedVisits}
            icon={<MapPin className="w-5 h-5 text-purple-600" />}
            iconBg="bg-purple-100"
            sub="Esta semana"
          />
        </div>

        {/* Meta Progress */}
        <motion.div
          className="bg-gradient-to-br from-primary-600 to-blue-700 rounded-2xl p-6 text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Meta da Equipe — Junho 2025</p>
              <p className="text-3xl font-bold mt-1">{formatCurrency(totalAting)}</p>
              <p className="text-white/60 text-sm mt-0.5">de {formatCurrency(totalMeta)}</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold">{metaPercent}%</p>
              <p className="text-white/60 text-xs">atingido</p>
            </div>
          </div>
          <div className="h-3 bg-white/20 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${metaPercent}%` }}
              transition={{ duration: 1.2, delay: 0.3 }}
            />
          </div>
          <p className="text-white/50 text-xs mt-2">
            Faltam {formatCurrency(totalMeta - totalAting)} para bater a meta da equipe
          </p>
        </motion.div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Faturamento vs Meta</h3>
              <span className="text-xs text-slate-400">Últimos 6 meses</span>
            </div>
            <RevenueChart data={MONTHLY_REVENUE} />
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Visitas por Dia</h3>
              <span className="text-xs text-slate-400">Esta semana</span>
            </div>
            <VisitsChart data={VISITS_BY_DAY} />
          </div>
        </div>

        {/* Ranking + Map */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Ranking de Representantes</h3>
              <button
                onClick={() => navigate('/admin/representantes')}
                className="text-xs text-primary-600 font-medium flex items-center gap-1"
              >
                Ver todos <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <RankingChart data={REP_RANKING.map(r => ({ name: r.name.split(' ')[0], faturamento: r.faturamento, meta: r.meta }))} />
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Mapa de Clientes</h3>
              <button
                onClick={() => navigate('/admin/clientes')}
                className="text-xs text-primary-600 font-medium flex items-center gap-1"
              >
                Ver todos <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <MapMock clients={mapClients} height="h-56" />
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary-600" />
              Atividade Recente
            </h3>
            <button
              onClick={() => navigate('/admin/auditoria')}
              className="text-xs text-primary-600 font-medium flex items-center gap-1"
            >
              Ver auditoria <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {MOCK_AUDIT_LOGS.slice(0, 5).map(log => (
              <div key={log.id} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary-400 mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 truncate">{log.description}</p>
                  <p className="text-xs text-slate-400">{log.userName} · {formatRelative(log.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending alerts */}
        {pendingOrders > 0 && (
          <motion.div
            className="card border-amber-200 bg-amber-50 p-4 flex items-start gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Pedidos pendentes de sincronização</p>
              <p className="text-xs text-amber-600 mt-0.5">{pendingOrders} pedido(s) aguardando envio para o Bling ERP</p>
            </div>
            <button
              onClick={() => navigate('/admin/sincronizacao')}
              className="text-xs text-amber-700 font-semibold flex items-center gap-1 flex-shrink-0"
            >
              Resolver <ChevronRight className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </div>
    </AdminLayout>
  )
}
