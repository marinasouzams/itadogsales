import { useState, type ReactNode } from 'react'
import { cn } from '@/utils'
import type { Prospect, ProspectStage } from '@/types'

export interface KanbanColumn {
  key: ProspectStage
  label: string
  hint: string
  color: string // classe tailwind pro topo da coluna (ex: 'bg-slate-400')
}

interface Props {
  columns: KanbanColumn[]
  items: Prospect[]
  onMove: (id: string, stage: ProspectStage) => void
  renderCard: (prospect: Prospect, dragProps: { draggable: boolean; onDragStart: (e: React.DragEvent) => void }) => ReactNode
}

/** Kanban horizontal — drag-and-drop nativo (sem lib) no desktop; no mobile
 *  o "Mover para" fica dentro do próprio card (ver ProspectCard). */
export default function KanbanBoard({ columns, items, onMove, renderCard }: Props) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<ProspectStage | null>(null)

  const byStage = (stage: ProspectStage) => items.filter(p => p.stage === stage)

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 items-start">
      {columns.map(col => {
        const colItems = byStage(col.key)
        return (
          <div
            key={col.key}
            className={cn(
              'flex-shrink-0 w-72 bg-slate-100 rounded-2xl transition-colors',
              overCol === col.key && 'bg-primary-100 ring-2 ring-primary-300',
            )}
            onDragOver={e => { e.preventDefault(); setOverCol(col.key) }}
            onDragLeave={() => setOverCol(o => (o === col.key ? null : o))}
            onDrop={e => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/prospect-id') || dragId
              if (id) onMove(id, col.key)
              setOverCol(null); setDragId(null)
            }}
          >
            <div className="sticky top-0 px-3 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', col.color)} />
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide truncate">{col.label}</p>
                <span className="ml-auto text-xs font-semibold text-slate-400 bg-white rounded-full px-2 py-0.5">{colItems.length}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">{col.hint}</p>
            </div>
            <div className="px-2 pb-3 space-y-2 min-h-[60px]">
              {colItems.map(p => renderCard(p, {
                draggable: true,
                onDragStart: e => {
                  e.dataTransfer.setData('text/prospect-id', p.id)
                  setDragId(p.id)
                },
              }))}
              {colItems.length === 0 && (
                <div className="text-center text-[11px] text-slate-300 py-6 border border-dashed border-slate-200 rounded-xl">
                  Vazio
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const CRM_STAGES: KanbanColumn[] = [
  { key: 'novo_prospect',       label: 'Novo Prospect',        hint: 'Identificado, sem contato',      color: 'bg-slate-400' },
  { key: 'primeiro_contato',    label: 'Primeiro Contato',     hint: 'Contato já realizado',            color: 'bg-blue-400' },
  { key: 'visita_agendada',     label: 'Visita Agendada',      hint: 'Existe visita marcada',           color: 'bg-indigo-400' },
  { key: 'visitado',            label: 'Visitado',             hint: 'Visita comercial realizada',      color: 'bg-purple-400' },
  { key: 'follow_up',           label: 'Follow-up',            hint: 'Precisa de novo contato',         color: 'bg-amber-400' },
  { key: 'negociacao',          label: 'Negociação',           hint: 'Interesse + negociação ativa',    color: 'bg-orange-400' },
  { key: 'pedido_realizado',    label: 'Pedido Realizado 🎉',  hint: 'Primeiro pedido realizado',       color: 'bg-green-500' },
  { key: 'retomar_futuramente', label: 'Retomar Futuramente',  hint: 'Não comprou agora',               color: 'bg-cyan-400' },
  { key: 'perdido',             label: 'Perdido',              hint: 'Sem oportunidade no momento',     color: 'bg-red-400' },
]
