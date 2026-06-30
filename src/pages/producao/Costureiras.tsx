import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Phone, MapPin, X, Check, Edit2, Trash2, ChevronRight } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { useSeamstresses } from '@/hooks/useProducaoData'
import { createSeamstress, updateSeamstress, deleteSeamstress } from '@/services/producaoDB'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/utils'
import type { Seamstress } from '@/types'

const EMPTY: Omit<Seamstress, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '', phone: '', whatsapp: '', city: '', address: '',
  startDate: '', status: 'ativa', notes: '', photoUrl: '',
}

export default function Costureiras() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: list = [], loading, refetch } = useSeamstresses()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todas' | 'ativa' | 'inativa'>('todas')
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Seamstress | null>(null)
  const [form, setForm] = useState<typeof EMPTY>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Seamstress | null>(null)

  const filtered = list.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.city ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'todas' || s.status === statusFilter
    return matchSearch && matchStatus
  })

  function openCreate() {
    setForm(EMPTY)
    setEditing(null)
    setError('')
    setModal('create')
  }

  function openEdit(s: Seamstress) {
    setForm({
      name: s.name, phone: s.phone ?? '', whatsapp: s.whatsapp ?? '',
      city: s.city ?? '', address: s.address ?? '', startDate: s.startDate ?? '',
      status: s.status, notes: s.notes ?? '', photoUrl: s.photoUrl ?? '',
    })
    setEditing(s)
    setError('')
    setModal('edit')
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true)
    setError('')
    try {
      if (modal === 'create') {
        await createSeamstress(form, user?.id, user?.name)
      } else if (editing) {
        await updateSeamstress(editing.id, form, user?.id, user?.name)
      }
      setModal(null)
      refetch()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    try {
      await deleteSeamstress(confirmDelete.id, confirmDelete.name, user?.id, user?.name)
      setConfirmDelete(null)
      refetch()
    } catch (e: unknown) {
      alert((e as Error).message)
    }
  }

  const f = (field: keyof typeof EMPTY, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  return (
    <AdminLayout title="Costureiras">
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Costureiras</h1>
            <p className="text-sm text-slate-500">{list.filter(s => s.status === 'ativa').length} ativas</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Nova Costureira
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou cidade..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="border border-slate-200 rounded-xl text-sm px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
          >
            <option value="todas">Todas</option>
            <option value="ativa">Ativas</option>
            <option value="inativa">Inativas</option>
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-10"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-lg font-medium">Nenhuma costureira encontrada</p>
            <p className="text-sm mt-1">Cadastre a primeira costureira</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(s => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="card hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/admin/producao/costureiras/${s.id}`)}
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className={cn(
                    'w-12 h-12 rounded-2xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0',
                    s.status === 'ativa' ? 'bg-purple-500' : 'bg-slate-400'
                  )}>
                    {s.photoUrl ? (
                      <img src={s.photoUrl} alt={s.name} className="w-full h-full object-cover rounded-2xl" />
                    ) : (
                      s.name.charAt(0).toUpperCase()
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{s.name}</p>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        s.status === 'ativa' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      )}>
                        {s.status === 'ativa' ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                      {s.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" /> {s.city}
                        </span>
                      )}
                      {s.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" /> {s.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(s) }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDelete(s) }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-300 ml-1" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Criar/Editar */}
      <AnimatePresence>
        {modal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setModal(null)} />
            <motion.div
              className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto"
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">
                  {modal === 'create' ? 'Nova Costureira' : 'Editar Costureira'}
                </h2>
                <button onClick={() => setModal(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome *</label>
                  <input value={form.name} onChange={e => f('name', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="Nome completo" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Telefone</label>
                    <input value={form.phone} onChange={e => f('phone', e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                      placeholder="(47) 99999-9999" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">WhatsApp</label>
                    <input value={form.whatsapp} onChange={e => f('whatsapp', e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                      placeholder="(47) 99999-9999" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Cidade</label>
                    <input value={form.city} onChange={e => f('city', e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                      placeholder="Itajaí" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data de Início</label>
                    <input type="date" value={form.startDate} onChange={e => f('startDate', e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Endereço</label>
                  <input value={form.address} onChange={e => f('address', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="Rua, número, bairro" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
                  <select value={form.status} onChange={e => f('status', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                    <option value="ativa">Ativa</option>
                    <option value="inativa">Inativa</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observações</label>
                  <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={3}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
                    placeholder="Observações gerais..." />
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 flex gap-3">
                <button onClick={() => setModal(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                  {modal === 'create' ? 'Cadastrar' : 'Salvar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Delete */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
            <motion.div
              className="relative bg-white rounded-2xl p-6 max-w-sm mx-4 w-full"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            >
              <h3 className="text-lg font-bold text-slate-900 mb-2">Remover Costureira</h3>
              <p className="text-sm text-slate-600 mb-5">
                Deseja remover <strong>{confirmDelete.name}</strong>? Esta ação removerá também todos os produtos cadastrados para ela.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleDelete}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
                  Remover
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
