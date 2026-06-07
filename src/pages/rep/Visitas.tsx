import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Clock, CheckCircle2, XCircle, Calendar, MapPin, ChevronRight,
  Plus, Navigation, Filter,
} from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useVisits } from '@/hooks/useData'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { formatDate, formatDuration, cn } from '@/utils'
import { VisitStatusBadge, VisitResultBadge } from '@/components/shared/StatusBadge'
import type { VisitStatus } from '@/types'

const STATUS_FILTERS: { label: string; value: VisitStatus | 'todos' }[] = [
  { label: 'Todas', value: 'todos' },
  { label: 'Agendadas', value: 'agendada' },
  { label: 'Em andamento', value: 'em_andamento' },
  { label: 'Concluídas', value: 'concluida' },
  { label: 'Canceladas', value: 'cancelada' },
]

export default function RepVisitas() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: visits = [], loading } = useVisits(user?.id)
  const [filter, setFilter] = useState<VisitStatus | 'todos'>('todos')

  const filtered = filter === 'todos' ? visits : visits.filter(v => v.status === filter)

  const resultIcon = (result?: string) => {
    if (result === 'positivo') return <CheckCircle2 className="w-4 h-4 text-green-500" />
    if (result === 'negativo') return <XCircle className="w-4 h-4 text-red-500" />
    return <Clock className="w-4 h-4 text-amber-400" />
  }

  if (loading) return <RepLayout title="Minhas Visitas"><LoadingSpinner /></RepLayout>

  return (
    <RepLayout title="Minhas Visitas">
      <div className="p-4 space-y-4">
        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                filter === f.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-500">{filtered.length} visita{filtered.length !== 1 ? 's' : ''}</p>

        {/* Visit list */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">Nenhuma visita encontrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((visit, i) => (
              <motion.div
                key={visit.id}
                className="card p-4"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {resultIcon(visit.result)}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 text-sm truncate">{visit.clientName}</h3>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(visit.createdAt)}
                        {visit.duration && (
                          <>
                            <span className="text-slate-200">·</span>
                            <Clock className="w-3 h-3" />
                            {formatDuration(visit.duration)}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <VisitStatusBadge status={visit.status} />
                    <button
                      onClick={() => navigate(`/rep/clientes/${visit.clientId}`)}
                      className="text-slate-300 hover:text-slate-500"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {visit.notes && (
                  <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 mb-3 line-clamp-2">
                    {visit.notes}
                  </p>
                )}

                {visit.result && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-400">Resultado:</span>
                    <VisitResultBadge result={visit.result} />
                  </div>
                )}

                {visit.status === 'agendada' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                    <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold">
                      <Navigation className="w-3.5 h-3.5" />
                      Iniciar visita
                    </button>
                    <button
                      onClick={() => navigate(`/rep/clientes/${visit.clientId}`)}
                      className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-medium"
                    >
                      Ver cliente
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </RepLayout>
  )
}
