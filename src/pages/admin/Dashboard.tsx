import { useState, useEffect } from 'react'
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
import { useDashboardKPIs, useMonthlyRevenue, useRepRanking, useVisitsByDay, useAuditLogs, useClients } from '@/hooks/useData'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { formatCurrency, formatRelative, cn } from '@/utils'
import { periodRange, type PeriodKey, PERIOD_LABELS } from '@/services/reportExport'

export default function AdminDashboard() {
  const navigate = useNavigate()

  // Competência — padrão: mês atual
  const [periodKey, setPeriodKey] = useState<PeriodKey>('current')
  const [dateFrom, setDateFrom] = useState(() => periodRange('current').from)
  const [dateTo,   setDateTo]   = useState(() => periodRange('current').to)

  useEffect(() => {
    if (periodKey !== 'custom') {
      const r = periodRange(periodKey)
      setDateFrom(r.from)
      setDateTo(r.to)
    }
  }, [periodKey])

  const { data: kpis, loading: loadingKPIs } = useDashboardKPIs(dateFrom, dateTo)
  const { data: monthlyRevenue = [] } = useMonthlyRevenue()
  const { data: ranking = [] } = useRepRanking(dateFrom, dateTo)
  const { data: visitsByDay = [] } = useVisitsByDay()
  const { data: auditLogs = [] } = useAuditLogs()
  const { data: allClients = [] } = useClients()

  const mapClients = allClients.map(c => ({
    id: c.id, name: c.name,
    lat: c.address.lat, lng: c.address.lng,
    priority: c.priority, visited: !!c.lastVisit,
  }))

  if (loadingKPIs) return <AdminLayout title="Dashboard"><div className="p-6"><LoadingSpinner /></div></AdminLayout>

  const totalFaturamento = kpis?.faturamento ?? 0
  const totalMeta = ranking.reduce((s, r) => s + r.meta, 0)
  const totalAting = ranking.reduce((s, r) => s + r.faturamento, 0)
  const metaPercent = totalMeta > 0 ? Math.min(100, Math.round((totalAting / totalMeta) * 100)) : 0

  return (
    <AdminLayout title="Dashboard">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        {/* Seletor de competência */}
        <div className="flex flex-wrap items-center gap-2">
          {(['current','prev','3months','year','all','custom'] as PeriodKey[]).map(k => (
            <button key={k} onClick={() => setPeriodKey(k)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border',
                periodKey === k
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50')}>
              {PERIOD_LABELS[k]}
            </button>
          ))}
          {periodKey === 'custom' && (
            <>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="input text-xs py-1.5 w-36" />
              <span className="text-slate-400 text-xs">até</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="input text-xs py-1.5 w-36" />
            </>
          )}
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            label="Faturamento" value={totalFaturamento} currency
            icon={<DollarSign className="w-5 h-5 text-primary-600" />} iconBg="bg-primary-100"
            sub={`Meta equipe: ${formatCurrency(totalMeta)}`}
          />
          <KPICard
            label="Clientes Ativos" value={kpis?.clientesAtivos ?? 0}
            icon={<Users className="w-5 h-5 text-blue-600" />} iconBg="bg-blue-100"
            sub={`${allClients.length} total`}
          />
          <KPICard
            label="Pedidos" value={kpis?.pedidos ?? 0}
            icon={<ShoppingCart className="w-5 h-5 text-green-600" />} iconBg="bg-green-100"
            sub={`${Math.round(kpis?.conversao ?? 0)}% conversão`}
          />
          <KPICard
            label="Visitas Realizadas" value={kpis?.visitas ?? 0}
            icon={<MapPin className="w-5 h-5 text-purple-600" />} iconBg="bg-purple-100"
            sub={`Ticket médio: ${formatCurrency(kpis?.ticketMedio ?? 0)}`}
          />
          <KPICard
            label="Trocas do Mês" value={kpis?.trocasMes ?? 0}
            icon={<span className="text-lg">🔄</span>} iconBg="bg-orange-100"
            sub="Sem impacto financeiro"
          />
        </div>

        {/* Meta Progress */}
        <motion.div className="bg-gradient-to-br from-primary-600 to-blue-700 rounded-2xl p-6 text-white"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Meta da Equipe</p>
              <p className="text-3xl font-bold mt-1">{formatCurrency(totalAting)}</p>
              <p className="text-white/60 text-sm mt-0.5">de {formatCurrency(totalMeta)}</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold">{metaPercent}%</p>
              <p className="text-white/60 text-xs">atingido</p>
            </div>
          </div>
          <div className="h-3 bg-white/20 rounded-full overflow-hidden">
            <motion.div className="h-full rounded-full bg-white" initial={{ width: 0 }}
              animate={{ width: `${metaPercent}%` }} transition={{ duration: 1.2, delay: 0.3 }} />
          </div>
          <p className="text-white/50 text-xs mt-2">Faltam {formatCurrency(Math.max(0, totalMeta - totalAting))} para bater a meta</p>
        </motion.div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Faturamento vs Meta</h3>
              <span className="text-xs text-slate-400">Este ano</span>
            </div>
            <RevenueChart data={monthlyRevenue} />
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Visitas por Dia</h3>
              <span className="text-xs text-slate-400">Últimos 30 dias</span>
            </div>
            <VisitsChart data={visitsByDay} />
          </div>
        </div>

        {/* Ranking + Map */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Ranking de Representantes</h3>
              <button onClick={() => navigate('/admin/representantes')} className="text-xs text-primary-600 font-medium flex items-center gap-1">
                Ver todos <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {ranking.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">Nenhum representante com dados</p> :
              <RankingChart data={ranking.map(r => ({ name: r.name, faturamento: r.faturamento, meta: r.meta }))} />}
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Mapa de Clientes</h3>
              <button onClick={() => navigate('/admin/clientes')} className="text-xs text-primary-600 font-medium flex items-center gap-1">
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
              <Activity className="w-4 h-4 text-primary-600" /> Atividade Recente
            </h3>
            <button onClick={() => navigate('/admin/auditoria')} className="text-xs text-primary-600 font-medium flex items-center gap-1">
              Ver auditoria <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {auditLogs.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">Nenhuma atividade registrada</p> :
            <div className="space-y-3">
              {auditLogs.slice(0, 5).map(log => (
                <div key={log.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary-400 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">{log.description}</p>
                    <p className="text-xs text-slate-400">{log.userName} · {formatRelative(log.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>}
        </div>

        {/* Comissões pendentes */}
        {(kpis?.comissoesPendentes ?? 0) > 0 && (
          <motion.div className="card border-amber-200 bg-amber-50 p-4 flex items-start gap-3"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Comissões pendentes de aprovação</p>
              <p className="text-xs text-amber-600 mt-0.5">{formatCurrency(kpis?.comissoesPendentes ?? 0)} aguardando aprovação</p>
            </div>
          </motion.div>
        )}

      </div>
    </AdminLayout>
  )
}
