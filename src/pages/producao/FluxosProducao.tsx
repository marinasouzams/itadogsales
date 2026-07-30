import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GitMerge, AlertTriangle, Calendar, X, ChevronDown, ChevronUp, ArrowDown,
} from 'lucide-react'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { useOpenFlows } from '@/hooks/useProducaoData'
import type { FlowSummary } from '@/types'
import { cn } from '@/utils'

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

export default function FluxosProducao() {
  const { data: flows = [], loading } = useOpenFlows()
  const [selected, setSelected] = useState<FlowSummary | null>(null)
  const [view, setView] = useState<'cards' | 'chart'>('cards')

  return (
    <>
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
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
    </>
  )
}
