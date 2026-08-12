import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import { LOST_REASONS } from '@/types'
import { cn } from '@/utils'

interface Props {
  open: boolean
  prospectName: string
  saving?: boolean
  onCancel: () => void
  onConfirm: (reason: string, detail?: string) => void
}

/** Motivo de perda (item 27) — usado tanto ao mover manualmente pra
 *  "Perdido" quanto na escalada da 5ª tentativa de follow-up. */
export default function LostReasonModal({ open, prospectName, saving, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')

  if (!open) return null
  const needsDetail = reason === 'Outro'

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
        <motion.div className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl"
          initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}>
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Marcar como perdido</h2>
              <p className="text-xs text-slate-500 mt-0.5">{prospectName}</p>
            </div>
            <button onClick={onCancel} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <label className="text-xs font-semibold text-slate-600 block">Motivo *</label>
            <div className="grid grid-cols-2 gap-2">
              {LOST_REASONS.map(r => (
                <button key={r} onClick={() => setReason(r)}
                  className={cn('px-3 py-2 rounded-xl text-xs font-semibold border-2 text-left transition-all',
                    reason === r ? 'bg-red-600 text-white border-red-600' : 'border-slate-200 text-slate-600')}>
                  {r}
                </button>
              ))}
            </div>
            {needsDetail && (
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Descreva o motivo *</label>
                <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={2}
                  className="input resize-none w-full" placeholder="Explique o motivo..." />
              </div>
            )}
          </div>
          <div className="p-5 border-t border-slate-100 flex gap-3">
            <button onClick={onCancel} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(reason, detail.trim() || undefined)}
              disabled={saving || !reason || (needsDetail && !detail.trim())}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              Confirmar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
