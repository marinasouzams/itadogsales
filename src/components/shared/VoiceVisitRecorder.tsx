import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Mic, Square, AlertTriangle } from 'lucide-react'
import { registerFollowup, createVisit, logAudit } from '@/services/db'
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

function getSpeechRecognition(): (new () => any) | null {
  const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Grava a visita por voz (Web Speech API), transcreve e sempre passa por uma
 *  revisão manual antes de salvar — nunca grava direto da transcrição. */
export default function VoiceVisitRecorder({ open, prospect, userId, userName, userRole, onClose, onSaved }: Props) {
  const [recording, setRecording] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [result, setResult] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [saving, setSaving] = useState(false)
  const recognitionRef = useRef<any>(null)
  const SpeechRecognitionCtor = getSpeechRecognition()

  function reset() {
    setRecording(false); setReviewing(false); setTranscript('')
    setResult(''); setNextAction(''); setNextActionDate('')
  }
  function handleClose() {
    recognitionRef.current?.stop()
    reset()
    onClose()
  }

  useEffect(() => {
    if (!open) reset()
  }, [open])

  useEffect(() => {
    return () => { recognitionRef.current?.stop() }
  }, [])

  function startRecording() {
    if (!SpeechRecognitionCtor) return
    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'pt-BR'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: any) => {
      let finalText = ''
      for (let i = 0; i < event.results.length; i++) {
        finalText += event.results[i][0].transcript
      }
      setTranscript(finalText)
    }
    recognition.onerror = () => setRecording(false)
    recognition.onend = () => setRecording(false)
    recognitionRef.current = recognition
    recognition.start()
    setRecording(true)
  }

  function stopRecording() {
    recognitionRef.current?.stop()
    setRecording(false)
    setReviewing(true)
  }

  async function handleSave() {
    if (!prospect) return
    setSaving(true)
    try {
      const { attempts } = await registerFollowup({
        prospectId: prospect.id, repId: userId, repName: userName,
        contactDate: new Date().toISOString().slice(0, 10), channel: 'visita',
        result: result.trim() || undefined,
        notes: transcript.trim() || undefined,
        nextAction: nextAction.trim() || undefined,
        nextActionDate: nextActionDate || undefined,
      })
      await createVisit({
        prospectId: prospect.id,
        clientName: prospect.name,
        clientCity: prospect.city,
        repId: userId, repName: userName,
        status: 'concluida',
        notes: [result.trim(), transcript.trim()].filter(Boolean).join(' — ') || undefined,
      })
      await logAudit({
        userId, userName, userRole, action: 'register_followup', entity: 'Prospect', entityId: prospect.id,
        description: `Visita registrada por voz com ${prospect.name} — tentativa ${attempts}/5`,
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

          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Visita por Voz</h2>
              <p className="text-xs text-slate-500 mt-0.5">{prospect.name}</p>
            </div>
            <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          {!SpeechRecognitionCtor ? (
            <div className="p-6 text-center space-y-3">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
              <p className="text-sm text-slate-600">
                Seu navegador não suporta reconhecimento de voz. Use "Registrar contato" para digitar manualmente.
              </p>
              <button onClick={handleClose} className="btn-primary">Entendi</button>
            </div>
          ) : !reviewing ? (
            <div className="p-6 flex flex-col items-center gap-4">
              <button
                onClick={recording ? stopRecording : startRecording}
                className={
                  recording
                    ? 'w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center animate-pulse'
                    : 'w-20 h-20 rounded-full bg-primary-600 text-white flex items-center justify-center'
                }
              >
                {recording ? <Square className="w-7 h-7" /> : <Mic className="w-8 h-8" />}
              </button>
              <p className="text-sm text-slate-500">
                {recording ? 'Gravando... toque para parar' : 'Toque para gravar a visita'}
              </p>
              {transcript && (
                <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3 w-full">{transcript}</p>
              )}
              {!recording && transcript && (
                <button onClick={() => setReviewing(true)} className="btn-primary w-full">
                  Revisar e salvar
                </button>
              )}
            </div>
          ) : (
            <div className="p-5 space-y-3">
              <p className="text-xs font-semibold text-slate-500">Confira antes de salvar — nada é gravado sem sua confirmação</p>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Transcrição da visita</label>
                <textarea value={transcript} onChange={e => setTranscript(e.target.value)} rows={4} className="input resize-none w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Resultado</label>
                <input value={result} onChange={e => setResult(e.target.value)} placeholder="Ex: Interessado, pediu tabela..."
                  className="input w-full" />
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
              <div className="flex gap-3 pt-2">
                <button onClick={() => setReviewing(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Voltar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
