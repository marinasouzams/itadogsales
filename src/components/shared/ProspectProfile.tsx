import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, Phone, MessageCircle, PenLine, CalendarClock, PartyPopper,
  Check, X, MapPin, User as UserIcon,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProspect, useProspectFollowups, useAuditLogsForEntity } from '@/hooks/useData'
import { moveProspectStage, convertProspectToClient, logAudit } from '@/services/db'
import { LoadingSpinner, ErrorState } from '@/components/shared/LoadingState'
import { CRM_STAGES } from './KanbanBoard'
import RegisterFollowupModal from './RegisterFollowupModal'
import ScheduleFollowupModal from './ScheduleFollowupModal'
import LostReasonModal from './LostReasonModal'
import { formatDate, formatDateTime, cn } from '@/utils'

const CHANNEL_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', ligacao: 'Ligação', visita: 'Visita', email: 'E-mail', outro: 'Outro' }

interface Props {
  prospectId: string
  backTo: string
  clientDetailPath: (clientId: string) => string
}

export default function ProspectProfile({ prospectId, backTo, clientDetailPath }: Props) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: prospect, loading, error, refetch } = useProspect(prospectId)
  const { data: followups = [], refetch: refetchFollowups } = useProspectFollowups(prospectId)
  const { data: auditEvents = [] } = useAuditLogsForEntity('Prospect', prospectId)

  const [showFollowup, setShowFollowup] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showLost, setShowLost] = useState(false)
  const [showConvert, setShowConvert] = useState(false)
  const [converting, setConverting] = useState(false)
  const [savingLost, setSavingLost] = useState(false)

  function refetchAll() { refetch(); refetchFollowups() }

  if (loading) return <div className="p-6"><LoadingSpinner /></div>
  if (error || !prospect) return (
    <div className="p-6">
      <button onClick={() => navigate(backTo)} className="flex items-center gap-1 text-slate-500 text-sm mb-4">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>
      <ErrorState message="Prospect não encontrado" />
    </div>
  )

  const stageInfo = CRM_STAGES.find(s => s.key === prospect.stage)
  const role = user?.role ?? 'rep'

  async function handleConvert() {
    if (!prospect || !user) return
    setConverting(true)
    try {
      const client = await convertProspectToClient(prospect, user.id)
      if (client) {
        await logAudit({
          userId: user.id, userName: user.name, userRole: user.role, action: 'convert_prospect',
          entity: 'Prospect', entityId: prospect.id,
          description: `${prospect.name} convertido em cliente (${client.id})`,
          timestamp: new Date().toISOString(),
        })
        setShowConvert(false)
        navigate(clientDetailPath(client.id))
      }
    } finally { setConverting(false) }
  }

  async function handleConfirmLost(reason: string, detail?: string) {
    if (!prospect || !user) return
    setSavingLost(true)
    try {
      await moveProspectStage(prospect.id, 'perdido', { lostReason: reason, lostReasonDetail: detail })
      await logAudit({
        userId: user.id, userName: user.name, userRole: user.role, action: 'move_prospect_stage',
        entity: 'Prospect', entityId: prospect.id,
        description: `${prospect.name} marcado como perdido — motivo: ${reason}${detail ? ' — ' + detail : ''}`,
        timestamp: new Date().toISOString(),
      })
      setShowLost(false)
      refetchAll()
    } finally { setSavingLost(false) }
  }

  // Timeline: criação + eventos de auditoria + follow-ups, tudo por data desc
  type TEvent = { date: string; kind: string; title: string; detail?: string }
  const timeline: TEvent[] = [
    { date: prospect.createdAt, kind: 'criado', title: 'Prospect criado' },
    ...followups.map(f => ({
      date: f.createdAt, kind: 'followup',
      title: `${CHANNEL_LABEL[f.channel] ?? f.channel}${f.result ? ' — ' + f.result : ''}`,
      detail: f.notes,
    })),
    ...auditEvents
      .filter(a => a.action === 'move_prospect_stage' || a.action === 'convert_prospect')
      .map(a => ({ date: a.timestamp, kind: a.action, title: a.description })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-4">
      <button onClick={() => navigate(backTo)} className="flex items-center gap-1 text-slate-500 text-sm">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">{prospect.name}</h1>
            {prospect.tradeName && <p className="text-sm text-slate-500">{prospect.tradeName}</p>}
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3" /> {prospect.city}{prospect.state ? ` • ${prospect.state}` : ''}{prospect.region ? ` • ${prospect.region}` : ''}
            </p>
            {prospect.contact && (
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <UserIcon className="w-3 h-3" /> {prospect.contact}
              </p>
            )}
            {prospect.repName && <p className="text-xs text-slate-400 mt-0.5">Representante: {prospect.repName}</p>}
          </div>
          {stageInfo && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap flex-shrink-0">
              {stageInfo.label}
            </span>
          )}
        </div>

        {prospect.nextActionDate && (
          <div className="mt-3 bg-primary-50 border border-primary-100 rounded-xl px-3 py-2">
            <p className="text-xs text-primary-700 font-semibold">Próxima ação: {prospect.nextAction || '—'}</p>
            <p className="text-xs text-primary-600">Data: {formatDate(prospect.nextActionDate)}</p>
          </div>
        )}

        {prospect.stage === 'perdido' && prospect.lostReason && (
          <div className="mt-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            <p className="text-xs text-red-700 font-semibold">Motivo da perda: {prospect.lostReason}</p>
            {prospect.lostReasonDetail && <p className="text-xs text-red-600 mt-0.5">{prospect.lostReasonDetail}</p>}
          </div>
        )}

        {prospect.notes && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-1">Observações</p>
            <p className="text-sm text-slate-700">{prospect.notes}</p>
          </div>
        )}

        {/* Ações rápidas */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <button onClick={() => window.open(`tel:${prospect.phone}`)}
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-green-50 text-green-700 text-[11px] font-semibold">
            <Phone className="w-4 h-4" /> Ligar
          </button>
          <button onClick={() => window.open(`https://wa.me/55${(prospect.whatsapp || prospect.phone).replace(/\D/g, '')}`, '_blank')}
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-green-50 text-green-700 text-[11px] font-semibold">
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </button>
          <button onClick={() => setShowFollowup(true)}
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-primary-50 text-primary-700 text-[11px] font-semibold">
            <PenLine className="w-4 h-4" /> Registrar
          </button>
          <button onClick={() => setShowSchedule(true)}
            className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-[11px] font-semibold">
            <CalendarClock className="w-4 h-4" /> Agendar
          </button>
        </div>

        {!prospect.convertedClientId ? (
          <button onClick={() => setShowConvert(true)}
            className="w-full mt-3 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-green-700">
            <PartyPopper className="w-4 h-4" /> Converter em Cliente
          </button>
        ) : (
          <button onClick={() => navigate(clientDetailPath(prospect.convertedClientId!))}
            className="w-full mt-3 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm flex items-center justify-center gap-2">
            <Check className="w-4 h-4 text-green-600" /> Já convertido — ver cliente
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="card p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Linha do Tempo</h2>
        <div className="space-y-0">
          {timeline.map((ev, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <span className={cn('w-2.5 h-2.5 rounded-full mt-1',
                  ev.kind === 'convert_prospect' ? 'bg-green-500' : ev.kind === 'followup' ? 'bg-blue-400' : 'bg-slate-300')} />
                {i < timeline.length - 1 && <span className="w-px flex-1 bg-slate-200 my-1" />}
              </div>
              <div className="pb-4 min-w-0">
                <p className="text-xs text-slate-400">{formatDateTime(ev.date)}</p>
                <p className="text-sm font-medium text-slate-800">{ev.title}</p>
                {ev.detail && <p className="text-xs text-slate-500 mt-0.5">{ev.detail}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <RegisterFollowupModal
        open={showFollowup} prospect={prospect}
        userId={user?.id ?? ''} userName={user?.name ?? ''} userRole={role}
        onClose={() => setShowFollowup(false)} onSaved={refetchAll}
      />
      <ScheduleFollowupModal
        open={showSchedule} prospect={prospect}
        userId={user?.id ?? ''} userName={user?.name ?? ''} userRole={role}
        onClose={() => setShowSchedule(false)} onSaved={refetchAll}
      />
      <LostReasonModal
        open={showLost} prospectName={prospect.name} saving={savingLost}
        onCancel={() => setShowLost(false)} onConfirm={handleConfirmLost}
      />

      <AnimatePresence>
        {showConvert && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => !converting && setShowConvert(false)} />
            <motion.div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4 w-full"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-slate-900">Converter em Cliente</h3>
                <button onClick={() => setShowConvert(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <p className="text-sm text-slate-600 mb-5">
                O cadastro de <strong>{prospect.name}</strong> vai virar um cliente aproveitando os dados já preenchidos (não precisa digitar de novo). O cliente entra como <strong>aguardando aprovação</strong>, igual qualquer cadastro novo.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowConvert(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleConvert} disabled={converting}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {converting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <PartyPopper className="w-4 h-4" />}
                  Converter
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

