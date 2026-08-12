import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, AlertTriangle } from 'lucide-react'
import { registerFollowup, moveProspectStage, updateProspect, logAudit, createVisit } from '@/services/db'
import { cn, formatDate } from '@/utils'
import LostReasonModal from './LostReasonModal'
import type { Prospect, FollowupChannel } from '@/types'

const CHANNELS: { value: FollowupChannel; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'ligacao', label: 'Ligação' },
  { value: 'visita', label: 'Visita' },
  { value: 'email', label: 'E-mail' },
  { value: 'outro', label: 'Outro' },
]

interface Props {
  open: boolean
  prospect: Prospect | null
  userId: string
  userName: string
  userRole: 'admin' | 'rep'
  initialChannel?: FollowupChannel
  onClose: () => void
  onSaved: () => void
}

export default function RegisterFollowupModal({ open, prospect, userId, userName, userRole, initialChannel, onClose, onSaved }: Props) {
  const [contactDate, setContactDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [channel, setChannel] = useState<FollowupChannel>('whatsapp')

  useEffect(() => {
    if (open) setChannel(initialChannel ?? 'whatsapp')
  }, [open, initialChannel])
  const [result, setResult] = useState('')
  const [notes, setNotes] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [escalation, setEscalation] = useState(false)
  const [reschedule, setReschedule] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [showLostReason, setShowLostReason] = useState(false)

  function reset() {
    setContactDate(new Date().toISOString().slice(0, 10))
    setChannel('whatsapp'); setResult(''); setNotes(''); setNextAction(''); setNextActionDate('')
    setEscalation(false); setReschedule(false); setRescheduleDate(''); setShowLostReason(false)
    setError('')
  }
  function handleClose() { reset(); onClose() }

  async function handleSave() {
    if (!prospect) return
    setSaving(true); setError('')
    try {
      const { attempts } = await registerFollowup({
        prospectId: prospect.id, repId: userId, repName: userName,
        contactDate, channel, result: result.trim() || undefined, notes: notes.trim() || undefined,
        nextAction: nextAction.trim() || undefined, nextActionDate: nextActionDate || undefined,
      })
      await logAudit({
        userId, userName, userRole, action: 'register_followup', entity: 'Prospect', entityId: prospect.id,
        description: `Follow-up (${CHANNELS.find(c => c.value === channel)?.label}) registrado com ${prospect.name} — tentativa ${attempts}/5`,
        timestamp: new Date().toISOString(),
      })
      if (channel === 'visita') {
        await createVisit({
          prospectId: prospect.id,
          clientName: prospect.name,
          clientCity: prospect.city,
          repId: userId, repName: userName,
          status: 'concluida',
          notes: [result.trim(), notes.trim()].filter(Boolean).join(' — ') || undefined,
        })
      }
      if (attempts >= 5) {
        setEscalation(true)
      } else {
        handleClose(); onSaved()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao registrar follow-up')
    } finally {
      setSaving(false)
    }
  }

  async function handleKeepFollowing() {
    handleClose(); onSaved()
  }

  async function handleReschedule() {
    if (!prospect || !rescheduleDate) return
    setSaving(true)
    try {
      await updateProspect(prospect.id, { nextActionDate: rescheduleDate, nextAction: 'Novo contato agendado' })
      await logAudit({
        userId, userName, userRole, action: 'update_prospect', entity: 'Prospect', entityId: prospect.id,
        description: `Reagendado após 5 tentativas — novo contato em ${formatDate(rescheduleDate)}`,
        timestamp: new Date().toISOString(),
      })
      handleClose(); onSaved()
    } finally { setSaving(false) }
  }

  async function handleMarkLost(reason: string, detail?: string) {
    if (!prospect) return
    setSaving(true)
    try {
      await moveProspectStage(prospect.id, 'perdido', { lostReason: reason, lostReasonDetail: detail })
      await logAudit({
        userId, userName, userRole, action: 'move_prospect_stage', entity: 'Prospect', entityId: prospect.id,
        description: `Marcado como perdido após 5 tentativas — motivo: ${reason}${detail ? ' — ' + detail : ''}`,
        timestamp: new Date().toISOString(),
      })
      handleClose(); onSaved()
    } finally { setSaving(false) }
  }

  if (!open || !prospect) return null

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
        <motion.div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
          initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}>

          {!escalation ? (
            <>
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Registrar Contato</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{prospect.name}</p>
                </div>
                <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Data</label>
                    <input type="date" value={contactDate} onChange={e => setContactDate(e.target.value)} className="input w-full" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Meio de contato *</label>
                    <select value={channel} onChange={e => setChannel(e.target.value as FollowupChannel)} className="input w-full">
                      {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Resultado</label>
                  <input value={result} onChange={e => setResult(e.target.value)} placeholder="Ex: Interessado, pediu tabela..."
                    className="input w-full" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Observação</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input resize-none w-full"
                    placeholder="Detalhes da conversa..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Próxima ação</label>
                    <input value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="Ex: Ligar de novo"
                      className="input w-full" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Data do próximo contato</label>
                    <input type="date" value={nextActionDate} onChange={e => setNextActionDate(e.target.value)} className="input w-full" />
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-slate-100 flex gap-3">
                <button onClick={handleClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            </>
          ) : (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">5 tentativas realizadas</h3>
                  <p className="text-xs text-slate-500">{prospect.name}</p>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Deseja manter em acompanhamento, reagendar ou marcar como perdido?
              </p>

              {reschedule ? (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-600 block">Nova data de contato</label>
                  <input type="date" value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} className="input w-full" />
                  <div className="flex gap-2">
                    <button onClick={() => setReschedule(false)} className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-500">
                      Voltar
                    </button>
                    <button onClick={handleReschedule} disabled={saving || !rescheduleDate}
                      className="flex-1 py-2 bg-primary-600 text-white rounded-xl text-xs font-semibold disabled:opacity-50">
                      Confirmar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <button onClick={handleKeepFollowing} disabled={saving}
                    className={cn('w-full py-2.5 rounded-xl text-sm font-semibold border-2 border-primary-200 text-primary-700 hover:bg-primary-50 disabled:opacity-50')}>
                    Manter em acompanhamento
                  </button>
                  <button onClick={() => setReschedule(true)} disabled={saving}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold border-2 border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                    Reagendar
                  </button>
                  <button onClick={() => setShowLostReason(true)} disabled={saving}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold border-2 border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50">
                    Marcar como perdido
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>

      <LostReasonModal
        open={showLostReason}
        prospectName={prospect.name}
        saving={saving}
        onCancel={() => setShowLostReason(false)}
        onConfirm={handleMarkLost}
      />
    </AnimatePresence>
  )
}
