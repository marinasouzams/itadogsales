import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import { updateProspect, logAudit } from '@/services/db'
import { formatDate } from '@/utils'
import type { Prospect } from '@/types'

interface Props {
  open: boolean
  prospect: Prospect | null
  userId: string
  userName: string
  userRole: 'admin' | 'rep'
  onClose: () => void
  onSaved: () => void
}

/** Só agenda a próxima ação/data — não registra um follow-up completo
 *  (nada aconteceu ainda, é uma marcação de agenda). */
export default function ScheduleFollowupModal({ open, prospect, userId, userName, userRole, onClose, onSaved }: Props) {
  const [nextAction, setNextAction] = useState('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && prospect) {
      setNextAction(prospect.nextAction ?? '')
      setNextActionDate(prospect.nextActionDate ?? new Date().toISOString().slice(0, 10))
    }
  }, [open, prospect])

  if (!open || !prospect) return null

  async function handleSave() {
    if (!prospect || !nextActionDate) return
    setSaving(true)
    try {
      await updateProspect(prospect.id, { nextAction: nextAction.trim() || undefined, nextActionDate })
      await logAudit({
        userId, userName, userRole, action: 'update_prospect', entity: 'Prospect', entityId: prospect.id,
        description: `Retorno agendado para ${formatDate(nextActionDate)}${nextAction ? ' — ' + nextAction : ''}`,
        timestamp: new Date().toISOString(),
      })
      onClose(); onSaved()
    } finally { setSaving(false) }
  }

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <motion.div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4 w-full"
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">Agendar Retorno</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4">{prospect.name}</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Data do próximo contato *</label>
              <input type="date" value={nextActionDate} onChange={e => setNextActionDate(e.target.value)} className="input w-full" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Próxima ação</label>
              <input value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="Ex: Ligar novamente"
                className="input w-full" />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || !nextActionDate}
              className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              Agendar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
