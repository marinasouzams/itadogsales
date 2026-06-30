import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Check, X, Bell, Calendar, User } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { useProductionRequests, useSeamstresses } from '@/hooks/useProducaoData'
import { createProductionRequest, updateProductionRequest } from '@/services/producaoDB'
import { createTask } from '@/services/db'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/utils'
import type {
  ProductionRequest, ProductionRequestType,
  ProductionRequestPriority, ProductionRequestStatus,
} from '@/types'

const PRIORITY_COLOR: Record<ProductionRequestPriority, string> = {
  baixa: 'bg-slate-100 text-slate-600',
  media: 'bg-blue-100 text-blue-700',
  alta: 'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
}
const PRIORITY_LABEL: Record<ProductionRequestPriority, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
}
const STATUS_COLOR: Record<ProductionRequestStatus, string> = {
  pendente: 'bg-yellow-100 text-yellow-700',
  em_andamento: 'bg-blue-100 text-blue-700',
  aguardando: 'bg-purple-100 text-purple-700',
  concluida: 'bg-green-100 text-green-700',
  cancelada: 'bg-slate-100 text-slate-500',
}
const STATUS_LABEL: Record<ProductionRequestStatus, string> = {
  pendente: 'Pendente', em_andamento: 'Em Andamento', aguardando: 'Aguardando',
  concluida: 'Concluída', cancelada: 'Cancelada',
}
const REQUEST_TYPES: { value: ProductionRequestType; label: string }[] = [
  { value: 'material', label: 'Material' },
  { value: 'retirada', label: 'Retirada' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'equipamento', label: 'Equipamento' },
  { value: 'ferramenta', label: 'Ferramenta' },
  { value: 'compra', label: 'Compra' },
  { value: 'producao', label: 'Produção' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'outros', label: 'Outros' },
]

function fmt(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

type ViewMode = 'lista' | 'kanban'

const EMPTY_FORM = {
  seamstressId: '',
  title: '',
  description: '',
  type: 'outros' as ProductionRequestType,
  priority: 'media' as ProductionRequestPriority,
  dueDate: '',
  responsible: 'marina',
  status: 'pendente' as ProductionRequestStatus,
  notes: '',
  createAsTask: false,
}

export default function SolicitacoesProducao() {
  const { user } = useAuth()
  const { data: requests = [], loading, refetch } = useProductionRequests()
  const { data: seamstresses = [] } = useSeamstresses()

  const [view, setView] = useState<ViewMode>('lista')
  const [search, setSearch] = useState('')
  const [seamstressFilter, setSeamstressFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProductionRequestStatus | 'todas'>('todas')
  const [priorityFilter, setPriorityFilter] = useState<ProductionRequestPriority | 'todas'>('todas')
  const [typeFilter, setTypeFilter] = useState<ProductionRequestType | 'todas'>('todas')

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [detailRequest, setDetailRequest] = useState<ProductionRequest | null>(null)
  const [newStatus, setNewStatus] = useState<ProductionRequestStatus | ''>('')

  const today = new Date().toISOString().slice(0, 10)

  const filtered = requests.filter(r => {
    const matchSearch = !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.seamstressName.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? '').toLowerCase().includes(search.toLowerCase())
    const matchS = !seamstressFilter || r.seamstressId === seamstressFilter
    const matchStatus = statusFilter === 'todas' || r.status === statusFilter
    const matchPriority = priorityFilter === 'todas' || r.priority === priorityFilter
    const matchType = typeFilter === 'todas' || r.type === typeFilter
    return matchSearch && matchS && matchStatus && matchPriority && matchType
  })

  function openModal() {
    setForm(EMPTY_FORM)
    setError('')
    setModal(true)
  }

  async function handleSave() {
    if (!form.seamstressId) { setError('Selecione a costureira'); return }
    if (!form.title.trim()) { setError('Informe o título'); return }
    setSaving(true)
    setError('')
    try {
      const s = seamstresses.find(s => s.id === form.seamstressId)
      const req = await createProductionRequest({
        ...form,
        seamstressName: s?.name ?? '',
        createAsTask: form.createAsTask,
      }, user?.id, user?.name)

      if (form.createAsTask) {
        await createTask({
          title: `[Produção] ${form.title}`,
          description: form.description,
          priority: form.priority,
          status: 'todo',
          dueDate: form.dueDate || undefined,
          createdBy: user?.id ?? '',
          createdByName: user?.name ?? '',
          assignedTo: undefined,
          assignedToName: undefined,
          tags: ['Produção'],
          notes: `Solicitação de ${s?.name ?? ''} — ${form.notes ?? ''}`,
          recurrence: 'none',
        })
      }

      setModal(false)
      refetch()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Erro')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateStatus() {
    if (!detailRequest || !newStatus) return
    await updateProductionRequest(detailRequest.id, { status: newStatus as ProductionRequestStatus }, user?.id, user?.name)
    setDetailRequest(null)
    setNewStatus('')
    refetch()
  }

  const KANBAN_COLUMNS: { status: ProductionRequestStatus; label: string; color: string }[] = [
    { status: 'pendente', label: 'Pendente', color: 'border-yellow-400' },
    { status: 'em_andamento', label: 'Em Andamento', color: 'border-blue-400' },
    { status: 'aguardando', label: 'Aguardando', color: 'border-purple-400' },
    { status: 'concluida', label: 'Concluída', color: 'border-green-400' },
  ]

  return (
    <AdminLayout title="Solicitações">
      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Solicitações</h1>
            <p className="text-sm text-slate-500">
              {requests.filter(r => ['pendente','em_andamento','aguardando'].includes(r.status)).length} em aberto
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {(['lista', 'kanban'] as ViewMode[]).map(v => (
                <button key={v}
                  onClick={() => setView(v)}
                  className={cn('px-3 py-1.5 text-xs font-semibold rounded-md transition-all capitalize',
                    view === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={openModal}
              className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors">
              <Plus className="w-4 h-4" /> Nova
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex-1 min-w-40 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
          </div>
          <select value={seamstressFilter} onChange={e => setSeamstressFilter(e.target.value)}
            className="border border-slate-200 rounded-xl text-sm px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none">
            <option value="">Toda costureira</option>
            {seamstresses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="border border-slate-200 rounded-xl text-sm px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none">
            <option value="todas">Todo status</option>
            {(Object.keys(STATUS_LABEL) as ProductionRequestStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as typeof priorityFilter)}
            className="border border-slate-200 rounded-xl text-sm px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none">
            <option value="todas">Toda prioridade</option>
            {(Object.keys(PRIORITY_LABEL) as ProductionRequestPriority[]).map(p => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
            className="border border-slate-200 rounded-xl text-sm px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none">
            <option value="todas">Todo tipo</option>
            {REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-10"><LoadingSpinner /></div>
        ) : view === 'lista' ? (
          // Lista view
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium">Nenhuma solicitação</p>
              </div>
            ) : filtered.map(r => {
              const isOverdue = r.dueDate && r.dueDate < today && !['concluida','cancelada'].includes(r.status)
              return (
                <motion.div key={r.id}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className={cn('card hover:shadow-md transition-shadow cursor-pointer', isOverdue && 'border-l-4 border-red-400')}
                  onClick={() => { setDetailRequest(r); setNewStatus(r.status) }}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900">{r.title}</p>
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', PRIORITY_COLOR[r.priority])}>
                          {PRIORITY_LABEL[r.priority]}
                        </span>
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_COLOR[r.status])}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mt-0.5">{r.seamstressName}</p>
                      {r.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{r.description}</p>}
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span>{REQUEST_TYPES.find(t => t.value === r.type)?.label}</span>
                        {r.dueDate && (
                          <span className={cn('flex items-center gap-1', isOverdue && 'text-red-500 font-semibold')}>
                            <Calendar className="w-3 h-3" /> {fmt(r.dueDate)}
                          </span>
                        )}
                        {r.responsible && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" /> {r.responsible}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        ) : (
          // Kanban view
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {KANBAN_COLUMNS.map(col => {
              const colItems = filtered.filter(r => r.status === col.status)
              return (
                <div key={col.status} className={cn('bg-slate-50 rounded-2xl p-3 border-t-4', col.color)}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-700">{col.label}</h3>
                    <span className="text-xs bg-white rounded-full px-2 py-0.5 font-bold text-slate-500 shadow-sm">
                      {colItems.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {colItems.map(r => (
                      <motion.div key={r.id}
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-xl p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => { setDetailRequest(r); setNewStatus(r.status) }}>
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <p className="text-xs font-semibold text-slate-800 line-clamp-2">{r.title}</p>
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0', PRIORITY_COLOR[r.priority])}>
                            {r.priority === 'urgente' ? 'URG' : r.priority.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">{r.seamstressName}</p>
                        {r.dueDate && (
                          <p className={cn('text-[11px] mt-1', r.dueDate < today && !['concluida','cancelada'].includes(r.status) ? 'text-red-500 font-semibold' : 'text-slate-400')}>
                            {fmt(r.dueDate)}
                          </p>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {modal && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setModal(false)} />
            <motion.div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}>
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">Nova Solicitação</h2>
                <button onClick={() => setModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-3">
                {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Costureira *</label>
                  <select value={form.seamstressId} onChange={e => setForm(f => ({ ...f, seamstressId: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                    <option value="">Selecionar...</option>
                    {seamstresses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Título *</label>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="Descreva a solicitação" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Descrição</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tipo</label>
                    <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as ProductionRequestType }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                      {REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Prioridade</label>
                    <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as ProductionRequestPriority }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                      {(Object.keys(PRIORITY_LABEL) as ProductionRequestPriority[]).map(p => (
                        <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data Prevista</label>
                    <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Responsável</label>
                    <select value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                      <option value="marina">Marina</option>
                      <option value="pai">Pai</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observações</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none" />
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.createAsTask}
                    onChange={e => setForm(f => ({ ...f, createAsTask: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm text-slate-700">Criar também como tarefa no módulo de Tarefas</span>
                </label>
              </div>
              <div className="p-5 border-t border-slate-100 flex gap-3">
                <button onClick={() => setModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail/Update Modal */}
      <AnimatePresence>
        {detailRequest && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setDetailRequest(null)} />
            <motion.div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto"
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}>
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900 truncate pr-2">{detailRequest.title}</h2>
                <button onClick={() => setDetailRequest(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 flex-shrink-0"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className={cn('text-xs font-semibold px-2 py-1 rounded-full', PRIORITY_COLOR[detailRequest.priority])}>
                    {PRIORITY_LABEL[detailRequest.priority]}
                  </span>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-semibold">
                    {REQUEST_TYPES.find(t => t.value === detailRequest.type)?.label}
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-slate-600"><strong>Costureira:</strong> {detailRequest.seamstressName}</p>
                  {detailRequest.description && <p className="text-sm text-slate-700">{detailRequest.description}</p>}
                  {detailRequest.dueDate && <p className="text-sm text-slate-600"><strong>Prazo:</strong> {fmt(detailRequest.dueDate)}</p>}
                  {detailRequest.responsible && <p className="text-sm text-slate-600"><strong>Responsável:</strong> {detailRequest.responsible}</p>}
                  {detailRequest.notes && <p className="text-sm text-slate-500 italic">{detailRequest.notes}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Atualizar Status</label>
                  <select value={newStatus} onChange={e => setNewStatus(e.target.value as ProductionRequestStatus)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                    {(Object.keys(STATUS_LABEL) as ProductionRequestStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="p-5 border-t border-slate-100 flex gap-3">
                <button onClick={() => setDetailRequest(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Fechar
                </button>
                {newStatus !== detailRequest.status && (
                  <button onClick={handleUpdateStatus}
                    className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> Salvar Status
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
