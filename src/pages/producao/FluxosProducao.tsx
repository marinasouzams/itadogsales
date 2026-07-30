import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GitMerge, AlertTriangle, Calendar, X, ChevronDown, ChevronUp, ArrowDown,
  Plus, Trash2, TrendingUp, Package, Clock, DollarSign, Target,
} from 'lucide-react'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { FlowGroupLineChart } from '@/components/shared/Charts'
import {
  useOpenFlows, useFlowGroups, useFlowGroupAnalysis, useOrdersForFlowGroup,
} from '@/hooks/useProducaoData'
import { createFlowGroup, deleteFlowGroup } from '@/services/producaoDB'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, cn } from '@/utils'
import type { FlowSummary, FlowGroup } from '@/types'

function fmt(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const COLOR_CLASSES = {
  green: {
    bar: 'bg-green-500',
    badge: 'bg-green-100 text-green-700 border-green-200',
    card: 'border-green-200',
    dot: 'bg-green-500',
  },
  yellow: {
    bar: 'bg-amber-400',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    card: 'border-amber-300',
    dot: 'bg-amber-400',
  },
  red: {
    bar: 'bg-red-500',
    badge: 'bg-red-100 text-red-700 border-red-200',
    card: 'border-red-300',
    dot: 'bg-red-500',
  },
}

function FlowCard({ flow, onClick }: { flow: FlowSummary; onClick: () => void }) {
  const c = COLOR_CLASSES[flow.colorStatus]
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('card cursor-pointer hover:shadow-md transition-shadow border-l-4', c.card)}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 text-base truncate">{flow.flowName}</h3>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', c.badge)}>
              Etapa {flow.currentStep}{flow.totalSteps > 0 ? `/${flow.totalSteps}` : ''}
            </span>
            {flow.isLate && (
              <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Atrasado
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-black text-slate-900">{flow.percentComplete}%</p>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
        <motion.div
          className={cn('h-full rounded-full', c.bar)}
          initial={{ width: 0 }}
          animate={{ width: `${flow.percentComplete}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-slate-500">Inicial</p>
          <p className="text-sm font-bold text-slate-800">{flow.initialQuantity}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Atual</p>
          <p className="text-sm font-bold text-slate-800">{flow.currentQuantity}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Perda</p>
          <p className={cn('text-sm font-bold', flow.totalLoss > 0 ? 'text-red-600' : 'text-slate-800')}>
            {flow.totalLoss}
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <GitMerge className="w-3.5 h-3.5" />
          <span className="font-medium text-slate-700">{flow.currentSeamstressName}</span>
        </span>
        {flow.deadline && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {fmt(flow.deadline)}
          </span>
        )}
      </div>
    </motion.div>
  )
}

function HorizontalChart({ flows }: { flows: FlowSummary[] }) {
  const maxQty = Math.max(...flows.map(f => f.initialQuantity), 1)

  return (
    <div className="space-y-4">
      {flows.map(flow => {
        const c = COLOR_CLASSES[flow.colorStatus]
        const barW = Math.max(4, (flow.currentQuantity / maxQty) * 100)
        return (
          <div key={flow.flowId}>
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="font-semibold text-slate-800 truncate max-w-[60%]">{flow.flowName}</span>
              <span className="text-slate-500">{flow.currentSeamstressName} · {flow.percentComplete}%</span>
            </div>
            <div className="h-8 bg-slate-100 rounded-xl overflow-hidden relative">
              <motion.div
                className={cn('h-full rounded-xl flex items-center px-3', c.bar)}
                initial={{ width: 0 }}
                animate={{ width: `${barW}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                style={{ minWidth: '4%' }}
              >
                <span className="text-white text-xs font-bold truncate whitespace-nowrap">
                  {flow.currentQuantity} peças
                </span>
              </motion.div>
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5 px-1">
              <span>Inicial: {flow.initialQuantity}</span>
              <span>Perda: {flow.totalLoss > 0 ? `-${flow.totalLoss}` : '0'}</span>
              {flow.deadline && <span>Entrega: {fmt(flow.deadline)}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FlowTimeline({ flow, onClose }: { flow: FlowSummary; onClose: () => void }) {
  const [showLosses, setShowLosses] = useState(false)

  const sortedSteps = [...flow.flowSteps].sort((a, b) => a.stepIndex - b.stepIndex)

  const steps = sortedSteps.map(s => {
    const received = s.quantityReceived
    const delivered = s.quantityDelivered ?? 0
    const isDone = s.status === 'completed'
    const loss = isDone ? received - delivered : 0
    return { step: s, received, delivered, isDone, loss }
  })

  const totalLossAll = steps.reduce((s, st) => s + st.loss, 0)

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto"
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{flow.flowName}</h2>
            <p className="text-xs text-slate-500">Linha do tempo do fluxo</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-2 text-center mb-5">
            <div className="bg-slate-50 rounded-xl p-2">
              <p className="text-xs text-slate-500">Inicial</p>
              <p className="text-lg font-black text-slate-900">{flow.initialQuantity}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-2">
              <p className="text-xs text-slate-500">Atual</p>
              <p className="text-lg font-black text-slate-900">{flow.currentQuantity}</p>
            </div>
            <div className={cn('rounded-xl p-2', totalLossAll > 0 ? 'bg-red-50' : 'bg-green-50')}>
              <p className="text-xs text-slate-500">Perda Total</p>
              <p className={cn('text-lg font-black', totalLossAll > 0 ? 'text-red-600' : 'text-green-600')}>
                {totalLossAll}
              </p>
            </div>
          </div>

          {/* Timeline vertical */}
          <div className="relative">
            <div className="absolute left-5 top-4 bottom-4 w-0.5 bg-slate-200" />

            <div className="space-y-0">
              {steps.map(({ step, received, delivered, isDone, loss }, i) => {
                const isLast = i === steps.length - 1
                const isActive = step.status === 'in_progress'
                const isPending = step.status === 'pending'
                const c = COLOR_CLASSES[flow.colorStatus]

                return (
                  <div key={step.id} className="relative pl-14 pb-6">
                    <div className={cn(
                      'absolute left-3 top-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center shadow',
                      isDone ? c.dot : isActive ? 'bg-violet-500' : 'bg-slate-300'
                    )}>
                      <span className="text-[9px] font-bold text-white">{i + 1}</span>
                    </div>

                    <div className={cn(
                      'rounded-xl border p-3',
                      isActive ? 'border-violet-200 bg-violet-50' :
                      isPending ? 'border-slate-200 bg-slate-50' :
                      'border-slate-200 bg-white'
                    )}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold text-slate-900">{step.seamstressName}</p>
                        {isActive && <span className="text-xs text-violet-600 font-semibold">Etapa atual</span>}
                        {isPending && <span className="text-xs text-slate-400">Aguardando</span>}
                      </div>

                      {!isPending && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-semibold text-slate-700">{received}</span>
                          <span className="text-slate-400 text-xs">recebeu</span>
                          {isDone && (
                            <>
                              <ArrowDown className="w-3 h-3 text-slate-400" />
                              <span className="font-semibold text-slate-700">{delivered}</span>
                              <span className="text-slate-400 text-xs">entregou</span>
                            </>
                          )}
                        </div>
                      )}
                      {isPending && (
                        <p className="text-xs text-slate-400 italic">Aguardando etapa anterior...</p>
                      )}

                      {isDone && loss > 0 && (
                        <div className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
                          <span className="font-semibold">Perda: {loss} peças</span>
                          <span className="text-red-400">
                            ({Math.round((loss / received) * 100)}%)
                          </span>
                        </div>
                      )}
                      {isDone && loss === 0 && (
                        <p className="mt-1 text-xs text-green-600 font-medium">Sem perdas</p>
                      )}
                      {step.notes && (
                        <p className="mt-1 text-xs text-slate-500 italic">{step.notes}</p>
                      )}
                    </div>

                    {!isLast && (
                      <div className="flex justify-center mt-1 mb-1">
                        <ArrowDown className="w-4 h-4 text-slate-300" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tabela de perdas */}
          {totalLossAll > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowLosses(s => !s)}
                className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-800 w-full"
              >
                {showLosses ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Detalhamento de Perdas
              </button>
              <AnimatePresence>
                {showLosses && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mt-2 space-y-1">
                      {steps.filter(s => s.isDone && s.loss > 0).map((s, i) => (
                        <div key={i} className="flex items-center justify-between bg-red-50 rounded-xl px-3 py-2">
                          <span className="text-sm text-slate-700">{s.step.seamstressName}</span>
                          <span className="text-sm font-bold text-red-600">−{s.loss}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between bg-red-100 rounded-xl px-3 py-2 mt-1">
                        <span className="text-sm font-bold text-slate-800">Total</span>
                        <span className="text-sm font-black text-red-700">−{totalLossAll}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Fluxos de Análise (agrupam várias Ordens) ──────────────────────────────

function FlowGroupCard({ group, onClick }: { group: FlowGroup; onClick: () => void }) {
  const { data: analysis, loading } = useFlowGroupAnalysis(group.id)

  if (loading || !analysis) {
    return (
      <div className="card animate-pulse space-y-3">
        <div className="h-4 bg-slate-100 rounded w-2/3" />
        <div className="h-2.5 bg-slate-100 rounded-full" />
        <div className="h-14 bg-slate-50 rounded" />
      </div>
    )
  }

  const daysLeft = analysis.deadline
    ? Math.ceil((new Date(analysis.deadline + 'T00:00:00').getTime() - Date.now()) / 86400000)
    : null
  const colorStatus: 'green' | 'yellow' | 'red' =
    analysis.isLate || (analysis.initialQuantity > 0 && analysis.totalLoss > analysis.initialQuantity * 0.1) ? 'red'
    : daysLeft !== null && daysLeft <= 3 ? 'yellow'
    : 'green'
  const c = COLOR_CLASSES[colorStatus]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={cn('card cursor-pointer hover:shadow-md transition-shadow border-l-4', c.card)}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 text-base truncate">{group.name}</h3>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {group.product && (
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', c.badge)}>{group.product}</span>
            )}
            {analysis.isLate && (
              <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Atrasado
              </span>
            )}
          </div>
        </div>
        <p className="text-2xl font-black text-slate-900 flex-shrink-0">{analysis.percentComplete}%</p>
      </div>

      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
        <motion.div className={cn('h-full rounded-full', c.bar)} initial={{ width: 0 }}
          animate={{ width: `${analysis.percentComplete}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
      </div>

      <p className="text-xs text-slate-500 mb-2">
        Etapa Atual: <span className="font-semibold text-slate-700">{analysis.currentSeamstressName}</span>
      </p>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-slate-500">Inicial</p>
          <p className="text-sm font-bold text-slate-800">{analysis.initialQuantity}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Atual</p>
          <p className="text-sm font-bold text-slate-800">{analysis.currentQuantity}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Perda</p>
          <p className={cn('text-sm font-bold', analysis.totalLoss > 0 ? 'text-red-600' : 'text-slate-800')}>{analysis.totalLoss}</p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> {analysis.avgDays != null ? `${analysis.avgDays} dias` : '—'}
        </span>
        {analysis.deadline && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> {fmt(analysis.deadline)}
          </span>
        )}
      </div>
      <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-green-700">
        <DollarSign className="w-3.5 h-3.5" /> {formatCurrency(analysis.valueProduced)} produzido
      </p>
    </motion.div>
  )
}

function FlowGroupDetail({ group, onClose, onDeleted }: { group: FlowGroup; onClose: () => void; onDeleted: () => void }) {
  const { user } = useAuth()
  const { data: analysis, loading } = useFlowGroupAnalysis(group.id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteFlowGroup(group.id, group.name, user?.id, user?.name)
      onDeleted()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto"
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{group.name}</h2>
            {group.product && <p className="text-xs text-slate-500">{group.product}</p>}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setConfirmDelete(true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading || !analysis ? (
          <div className="p-10"><LoadingSpinner /></div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1"><Package className="w-3.5 h-3.5" /> Perdas</p>
                <p className={cn('text-lg font-black', analysis.totalLoss > 0 ? 'text-red-600' : 'text-slate-900')}>{analysis.totalLoss} peças</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Tempo Médio</p>
                <p className="text-lg font-black text-slate-900">{analysis.avgDays != null ? `${analysis.avgDays} dias` : '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> Valor Produzido</p>
                <p className="text-lg font-black text-green-600">{formatCurrency(analysis.valueProduced)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1"><Target className="w-3.5 h-3.5" /> Eficiência</p>
                <p className="text-lg font-black text-slate-900">{analysis.efficiency}%</p>
              </div>
            </div>

            {analysis.valueLost > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center justify-between">
                <span className="text-sm text-red-700">Valor Perdido</span>
                <span className="text-sm font-bold text-red-700">{formatCurrency(analysis.valueLost)}</span>
              </div>
            )}

            {analysis.chartPoints.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Quantidade por Etapa</p>
                <FlowGroupLineChart data={analysis.chartPoints} />
              </div>
            )}

            {analysis.stages.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Etapas por Participante</p>
                <div className="space-y-2">
                  {analysis.stages.map((s, i) => (
                    <div key={i} className="border border-slate-100 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="font-semibold text-slate-800 text-sm">{s.seamstressName}</p>
                        <span className="text-xs font-bold text-green-700">{formatCurrency(s.valueProduced)}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        <div><p className="text-slate-400">Recebeu</p><p className="font-semibold text-slate-700">{s.received}</p></div>
                        <div><p className="text-slate-400">Entregou</p><p className="font-semibold text-slate-700">{s.delivered}</p></div>
                        <div><p className="text-slate-400">Perda</p><p className={cn('font-semibold', s.loss > 0 ? 'text-red-600' : 'text-slate-700')}>{s.loss}</p></div>
                        <div><p className="text-slate-400">Tempo</p><p className="font-semibold text-slate-700">{s.avgDays != null ? `${s.avgDays}d` : '—'}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {group.notes && <p className="text-xs text-slate-400 italic">{group.notes}</p>}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {confirmDelete && (
          <motion.div className="fixed inset-0 z-[60] flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => !deleting && setConfirmDelete(false)} />
            <motion.div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4 w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Excluir Fluxo</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{group.name}</p>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Esta análise será removida. As Ordens de Produção não são afetadas. Deseja continuar?
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                  {deleting ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function NewFlowGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth()
  const { data: orders = [], loading } = useOrdersForFlowGroup()
  const [form, setForm] = useState({ name: '', periodStart: '', periodEnd: '', product: '', notes: '' })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleCreate() {
    if (!form.name.trim()) { setError('Informe um nome para o fluxo'); return }
    if (selectedIds.size === 0) { setError('Selecione ao menos uma ordem'); return }
    setSaving(true); setError('')
    try {
      await createFlowGroup({
        name: form.name.trim(),
        periodStart: form.periodStart || undefined,
        periodEnd: form.periodEnd || undefined,
        product: form.product.trim() || undefined,
        notes: form.notes.trim() || undefined,
        orderIds: Array.from(selectedIds),
      }, user?.id, user?.name)
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar fluxo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Novo Fluxo</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Suéter Inverno 2026"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Período (de)</label>
              <input type="date" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Período (até)</label>
              <input type="date" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Produto</label>
            <input value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))}
              placeholder="Ex: Suéter"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Ordens Participantes *</label>
            {loading ? (
              <div className="py-4"><LoadingSpinner /></div>
            ) : orders.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-3">Nenhuma ordem disponível</p>
            ) : (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {orders.map(order => {
                  const checked = selectedIds.has(order.id)
                  return (
                    <label key={order.id}
                      className={cn('flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors', checked ? 'bg-primary-50' : 'hover:bg-slate-50')}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(order.id)}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 truncate">
                          {(order.items ?? []).map(it => it.productName).join(', ') || 'Sem itens'} · {order.seamstressName}
                        </p>
                        <p className="text-xs text-slate-400">Solicitada em {fmt(order.requestDate)}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observação</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none" />
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleCreate} disabled={saving}
            className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-60">
            {saving ? 'Criando...' : 'Criar Fluxo'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function FluxosProducao() {
  const { data: flows = [], loading } = useOpenFlows()
  const [selected, setSelected] = useState<FlowSummary | null>(null)
  const [view, setView] = useState<'cards' | 'chart'>('cards')

  const { data: groups = [], loading: loadingGroups, refetch: refetchGroups } = useFlowGroups()
  const [newGroupModal, setNewGroupModal] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<FlowGroup | null>(null)

  return (
    <>
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        {/* Fluxos de Análise (agrupados) */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Fluxos de Análise</h1>
            <p className="text-sm text-slate-500">
              {groups.length} {groups.length === 1 ? 'fluxo criado' : 'fluxos criados'}
            </p>
          </div>
          <button onClick={() => setNewGroupModal(true)}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors">
            <Plus className="w-4 h-4" /> Novo Fluxo
          </button>
        </div>

        {loadingGroups ? (
          <div className="py-10"><LoadingSpinner /></div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16 text-slate-400 mb-8">
            <TrendingUp className="w-14 h-14 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-semibold">Nenhum fluxo de análise criado</p>
            <p className="text-sm mt-1">Agrupe Ordens de Produção para acompanhar perdas, tempo e eficiência do lote</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {groups.map(group => (
              <FlowGroupCard key={group.id} group={group} onClick={() => setSelectedGroup(group)} />
            ))}
          </div>
        )}

        <div className="border-t border-slate-200 my-8" />
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Fluxos em Aberto</h1>
            <p className="text-sm text-slate-500">
              {flows.length} {flows.length === 1 ? 'fluxo ativo' : 'fluxos ativos'}
            </p>
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setView('cards')}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                view === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              Cards
            </button>
            <button onClick={() => setView('chart')}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                view === 'chart' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              Gráfico
            </button>
          </div>
        </div>

        {/* Legenda cores */}
        <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />Normal</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" />Prazo próximo</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />Atrasado / Alta perda</span>
        </div>

        {loading ? (
          <div className="py-10"><LoadingSpinner /></div>
        ) : flows.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <GitMerge className="w-14 h-14 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-semibold">Nenhum fluxo em aberto</p>
            <p className="text-sm mt-1">
              Crie uma ordem marcando "Esta ordem possui fluxo" para começar a acompanhar o progresso
            </p>
          </div>
        ) : view === 'cards' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {flows.map(flow => (
              <FlowCard key={flow.flowId} flow={flow} onClick={() => setSelected(flow)} />
            ))}
          </div>
        ) : (
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-700 mb-5">Progresso por Fluxo</h2>
            <HorizontalChart flows={flows} />
            <p className="text-xs text-slate-400 mt-4 text-center">
              Clique no card para ver a linha do tempo detalhada
            </p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <FlowTimeline flow={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {newGroupModal && (
          <NewFlowGroupModal
            onClose={() => setNewGroupModal(false)}
            onCreated={() => { setNewGroupModal(false); refetchGroups() }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedGroup && (
          <FlowGroupDetail
            group={selectedGroup}
            onClose={() => setSelectedGroup(null)}
            onDeleted={() => { setSelectedGroup(null); refetchGroups() }}
          />
        )}
      </AnimatePresence>
    </>
  )
}
