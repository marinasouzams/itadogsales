import { motion } from 'framer-motion'
import { DollarSign, TrendingUp, Clock, CheckCircle2, Calendar } from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useCommissions } from '@/hooks/useData'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate, cn } from '@/utils'
import { CommissionStatusBadge } from '@/components/shared/StatusBadge'
import { CommissionDonut } from '@/components/shared/Charts'

export default function RepComissao() {
  const { user } = useAuth()
  const { data: commissions = [], loading } = useCommissions(user?.id)

  const total = commissions.reduce((s, c) => s + c.amount, 0)
  const pago = commissions.filter(c => c.status === 'paga').reduce((s, c) => s + c.amount, 0)
  const aprovado = commissions.filter(c => c.status === 'aprovada').reduce((s, c) => s + c.amount, 0)
  const previsto = commissions.filter(c => c.status === 'prevista').reduce((s, c) => s + c.amount, 0)

  const CARDS = [
    { label: 'Total acumulado', value: total, icon: TrendingUp, color: 'text-primary-600', bg: 'bg-primary-50' },
    { label: 'Já recebido', value: pago, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'A receber', value: previsto + aprovado, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
  ]

  if (loading) return <RepLayout title="Minhas Comissões"><LoadingSpinner /></RepLayout>

  return (
    <RepLayout title="Minhas Comissões">
      <div className="p-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-3">
          {CARDS.map((card, i) => (
            <motion.div
              key={card.label}
              className="card p-4 flex items-center gap-4"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0', card.bg)}>
                <card.icon className={cn('w-5 h-5', card.color)} />
              </div>
              <div>
                <p className="text-xs text-slate-400">{card.label}</p>
                <p className="text-xl font-bold text-slate-900">{formatCurrency(card.value)}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Donut chart */}
        {total > 0 && (
          <motion.div
            className="card p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <p className="section-title mb-4">Distribuição</p>
            <CommissionDonut prevista={previsto} aprovada={aprovado} paga={pago} />
          </motion.div>
        )}

        {/* Commission list */}
        <div>
          <p className="section-title mb-3">Histórico</p>
          <div className="space-y-3">
            {commissions.map((c, i) => (
              <motion.div
                key={c.id}
                className="card p-4"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{c.clientName}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{c.orderNumber}</p>
                  </div>
                  <CommissionStatusBadge status={c.status} />
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-400">
                    <span className="font-medium text-slate-600">{c.rate}%</span> sobre {formatCurrency(c.orderTotal)}
                  </div>
                  <span className="text-base font-bold text-green-700">+{formatCurrency(c.amount)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-400">
                  <Calendar className="w-3 h-3" />
                  Referência: {c.referenceMonth}
                  {c.paidAt && (
                    <span className="text-green-600 ml-2">· Pago em {formatDate(c.paidAt)}</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </RepLayout>
  )
}
