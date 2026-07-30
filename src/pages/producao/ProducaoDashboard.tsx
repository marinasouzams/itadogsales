import { motion } from 'framer-motion'
import {
  Scissors, Package, TrendingUp, DollarSign, Clock,
  AlertTriangle, Users, Bell, BarChart3,
} from 'lucide-react'
import KPICard from '@/components/shared/KPICard'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { useProductionDashboard, useProductionMonthlyData, useProductionBySeamstress, useProductionRequests } from '@/hooks/useProducaoData'
import { formatCurrency } from '@/utils'
import { cn } from '@/utils'

const PRIORITY_COLOR: Record<string, string> = {
  baixa: 'bg-slate-100 text-slate-600',
  media: 'bg-blue-100 text-blue-700',
  alta: 'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
}
const PRIORITY_LABEL: Record<string, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
}

function fmt(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function fmtMonth(m: string) {
  const [y, mo] = m.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(mo, 10) - 1]}/${y.slice(2)}`
}

export default function ProducaoDashboard() {
  const { data: kpis, loading } = useProductionDashboard()
  const { data: monthly = [] } = useProductionMonthlyData()
  const { data: bySeamstress = [] } = useProductionBySeamstress()
  const { data: requests = [] } = useProductionRequests()

  const today = new Date().toISOString().slice(0, 10)
  const todayRequests = requests.filter(r =>
    r.dueDate === today && !['concluida', 'cancelada'].includes(r.status)
  )
  const overdueRequests = requests.filter(r =>
    r.dueDate && r.dueDate < today && !['concluida', 'cancelada'].includes(r.status)
  )

  const maxMonthly = Math.max(...monthly.map(m => m.amount), 1)
  const maxSeamstress = Math.max(...bySeamstress.map(s => s.amount), 1)

  if (loading) return (
    <div className="p-6"><LoadingSpinner /></div>
  )

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            label="Ordens em Produção" value={kpis?.ordensEmProducao ?? 0}
            icon={<Scissors className="w-5 h-5 text-blue-600" />} iconBg="bg-blue-100"
            delay={0}
          />
          <KPICard
            label="Produção do Mês" value={kpis?.producaoDoMes ?? 0} currency
            icon={<TrendingUp className="w-5 h-5 text-green-600" />} iconBg="bg-green-100"
            delay={0.05}
          />
          <KPICard
            label="Peças Produzidas" value={kpis?.pecasProduzidas ?? 0}
            icon={<Package className="w-5 h-5 text-purple-600" />} iconBg="bg-purple-100"
            delay={0.1}
          />
          <KPICard
            label="Valor a Pagar" value={kpis?.valorAPagar ?? 0} currency color="orange"
            icon={<DollarSign className="w-5 h-5 text-orange-600" />} iconBg="bg-orange-100"
            delay={0.15}
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            label="Valor Pago" value={kpis?.valorPago ?? 0} currency color="green"
            icon={<DollarSign className="w-5 h-5 text-green-600" />} iconBg="bg-green-100"
            delay={0.2}
          />
          <KPICard
            label="Ordens Atrasadas" value={kpis?.ordensAtrasadas ?? 0} color="red"
            icon={<AlertTriangle className="w-5 h-5 text-red-600" />} iconBg="bg-red-100"
            delay={0.25}
          />
          <KPICard
            label="Costureiras Ativas" value={kpis?.costureirasAtivas ?? 0}
            icon={<Users className="w-5 h-5 text-blue-600" />} iconBg="bg-blue-100"
            delay={0.3}
          />
          <KPICard
            label="Solicitações Pendentes" value={kpis?.solicitacoesPendentes ?? 0} color="orange"
            icon={<Bell className="w-5 h-5 text-orange-600" />} iconBg="bg-orange-100"
            delay={0.35}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Solicitações de Hoje */}
          <motion.div className="card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5 text-orange-500" />
              <h3 className="font-semibold text-slate-800">Solicitações de Hoje</h3>
              {todayRequests.length > 0 && (
                <span className="ml-auto bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {todayRequests.length}
                </span>
              )}
            </div>
            {todayRequests.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">Nenhuma solicitação para hoje</p>
            ) : (
              <div className="space-y-2">
                {todayRequests.map(r => (
                  <div key={r.id} className="flex items-start gap-3 p-3 bg-orange-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{r.seamstressName}</p>
                      <p className="text-xs text-slate-600 truncate">{r.title}</p>
                    </div>
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', PRIORITY_COLOR[r.priority])}>
                      {PRIORITY_LABEL[r.priority]}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {overdueRequests.length > 0 && (
              <>
                <div className="flex items-center gap-2 mt-4 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <h4 className="text-sm font-semibold text-red-700">Solicitações Vencidas</h4>
                </div>
                <div className="space-y-2">
                  {overdueRequests.slice(0, 5).map(r => (
                    <div key={r.id} className="flex items-start gap-3 p-3 bg-red-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{r.seamstressName}</p>
                        <p className="text-xs text-slate-600 truncate">{r.title}</p>
                        <p className="text-xs text-red-500 mt-0.5">Venceu em {fmt(r.dueDate!)}</p>
                      </div>
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', PRIORITY_COLOR[r.priority])}>
                        {PRIORITY_LABEL[r.priority]}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>

          {/* Produção por Costureira */}
          <motion.div className="card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-purple-500" />
              <h3 className="font-semibold text-slate-800">Produção por Costureira</h3>
            </div>
            {bySeamstress.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">Sem dados de produção</p>
            ) : (
              <div className="space-y-3">
                {bySeamstress.slice(0, 8).map(s => (
                  <div key={s.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-700 font-medium truncate">{s.name}</span>
                      <span className="text-slate-600 font-semibold flex-shrink-0 ml-2">{formatCurrency(s.amount)}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-purple-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${(s.amount / maxSeamstress) * 100}%` }}
                        transition={{ duration: 0.8 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Produção por Mês */}
        {monthly.length > 0 && (
          <motion.div className="card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold text-slate-800">Valor Pago por Mês</h3>
            </div>
            <div className="flex items-end gap-2 h-32">
              {monthly.slice(-12).map(m => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-slate-500">{formatCurrency(m.amount)}</span>
                  <div className="w-full bg-slate-100 rounded-t relative" style={{ height: '80px' }}>
                    <motion.div
                      className="absolute bottom-0 w-full bg-blue-500 rounded-t"
                      initial={{ height: 0 }}
                      animate={{ height: `${(m.amount / maxMonthly) * 100}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">{fmtMonth(m.month)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
  )
}
