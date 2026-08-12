import { Phone, MessageCircle, PenLine, CalendarClock, MapPin, Footprints } from 'lucide-react'
import { cn } from '@/utils'
import { CRM_STAGES } from './KanbanBoard'
import type { Prospect, ProspectStage } from '@/types'

function fmt(d?: string) {
  if (!d) return null
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}`
}

interface Props {
  prospect: Prospect
  showRep?: boolean
  onOpen: () => void
  onMoveStage: (stage: ProspectStage) => void
  onCall: () => void
  onWhatsapp: () => void
  onRegisterContact: () => void
  onScheduleFollowup: () => void
  onVisit: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
}

export default function ProspectCard({
  prospect: p, showRep, onOpen, onMoveStage, onCall, onWhatsapp, onRegisterContact, onScheduleFollowup, onVisit,
  draggable, onDragStart,
}: Props) {
  const attempts = Math.min(p.attempts ?? 0, 5)
  const lastContact = fmt(p.lastContactDate)
  const nextContact = fmt(p.nextActionDate)

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
    >
      <button onClick={onOpen} className="w-full text-left">
        <p className="text-sm font-bold text-slate-900 leading-tight truncate">{p.name}</p>
        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          {p.city}{p.state ? ` • ${p.state}` : ''}{p.region ? ` • ${p.region}` : ''}
        </p>
        {showRep && p.repName && (
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">{p.repName}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
          {lastContact && <span>Último: {lastContact}</span>}
          {nextContact && <span className="text-primary-600 font-medium">Próximo: {nextContact}</span>}
        </div>
      </button>

      <div className="flex items-center gap-1 mt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={cn('w-1.5 h-1.5 rounded-full', i < attempts ? 'bg-primary-600' : 'bg-slate-200')} />
        ))}
        <span className="text-[10px] text-slate-400 ml-1">{attempts} de 5 tentativas</span>
      </div>

      <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-slate-100">
        <button onClick={onCall} title="Ligar" className="w-7 h-7 rounded-lg flex items-center justify-center text-green-600 bg-green-50 hover:bg-green-100">
          <Phone className="w-3.5 h-3.5" />
        </button>
        <button onClick={onWhatsapp} title="WhatsApp" className="w-7 h-7 rounded-lg flex items-center justify-center text-green-600 bg-green-50 hover:bg-green-100">
          <MessageCircle className="w-3.5 h-3.5" />
        </button>
        <button onClick={onRegisterContact} title="Registrar contato" className="w-7 h-7 rounded-lg flex items-center justify-center text-primary-600 bg-primary-50 hover:bg-primary-100">
          <PenLine className="w-3.5 h-3.5" />
        </button>
        <button onClick={onVisit} title="Visitar" className="w-7 h-7 rounded-lg flex items-center justify-center text-blue-600 bg-blue-50 hover:bg-blue-100">
          <Footprints className="w-3.5 h-3.5" />
        </button>
        <button onClick={onScheduleFollowup} title="Agendar retorno" className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-600 bg-amber-50 hover:bg-amber-100">
          <CalendarClock className="w-3.5 h-3.5" />
        </button>
        <select
          value={p.stage}
          onChange={e => onMoveStage(e.target.value as ProspectStage)}
          onClick={e => e.stopPropagation()}
          className="ml-auto text-[10px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white text-slate-500 max-w-[92px]"
          title="Mover para"
        >
          {CRM_STAGES.map(s => <option key={s.key} value={s.key}>{s.label.replace(' 🎉', '')}</option>)}
        </select>
      </div>
    </div>
  )
}
