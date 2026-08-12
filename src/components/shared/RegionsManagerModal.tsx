import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Pencil, Trash2, Check } from 'lucide-react'
import { useRegions } from '@/hooks/useData'
import { createRegion, updateRegion, deleteRegion } from '@/services/db'

interface Props {
  open: boolean
  onClose: () => void
}

export default function RegionsManagerModal({ open, onClose }: Props) {
  const { data: regions = [], refetch } = useRegions()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleCreate() {
    if (!newName.trim()) return
    setSaving(true); setError('')
    try {
      await createRegion(newName.trim())
      setNewName('')
      refetch()
    } catch {
      setError('Erro ao criar região — talvez já exista uma com esse nome')
    } finally { setSaving(false) }
  }

  async function handleUpdate(id: string) {
    if (!editingName.trim()) return
    setSaving(true); setError('')
    try {
      await updateRegion(id, editingName.trim())
      setEditingId(null)
      refetch()
    } catch {
      setError('Erro ao atualizar região')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    setSaving(true); setError('')
    try {
      await deleteRegion(id)
      refetch()
    } catch {
      setError('Não é possível excluir — existem prospects cadastrados nessa região')
    } finally { setSaving(false) }
  }

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <motion.div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto"
          initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}>
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">Gerenciar Regiões</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

            <div className="flex gap-2">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nova região — ex: Vale do Itajaí"
                className="input flex-1" onKeyDown={e => e.key === 'Enter' && handleCreate()} />
              <button onClick={handleCreate} disabled={saving || !newName.trim()}
                className="px-3 rounded-xl bg-primary-600 text-white disabled:opacity-50">
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {regions.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">Nenhuma região cadastrada ainda</p>
              )}
              {regions.map(r => (
                <div key={r.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-100">
                  {editingId === r.id ? (
                    <>
                      <input value={editingName} onChange={e => setEditingName(e.target.value)} className="input flex-1 py-1.5"
                        onKeyDown={e => e.key === 'Enter' && handleUpdate(r.id)} autoFocus />
                      <button onClick={() => handleUpdate(r.id)} disabled={saving} className="w-8 h-8 rounded-lg flex items-center justify-center text-green-600 bg-green-50">
                        <Check className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-slate-700">{r.name}</span>
                      <button onClick={() => { setEditingId(r.id); setEditingName(r.name) }} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(r.id)} disabled={saving} className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
