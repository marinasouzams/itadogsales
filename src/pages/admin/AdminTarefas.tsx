import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, MoreHorizontal, Check, Edit2, Copy, Trash2, X,
  Building2, User, Clock, ChevronLeft, ChevronRight,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useTasks } from '@/hooks/useData'
import { useUsers } from '@/hooks/useData'
import { useAuth } from '@/contexts/AuthContext'
import { createTask, updateTask, deleteTask, duplicateTask } from '@/services/db'
import type { Task, TaskStatus, TaskPriority, TaskRecurrence } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  baixa: 'bg-slate-100 text-slate-600',
  media: 'bg-blue-100 text-blue-700',
  alta: 'bg-orange-100 text-orange-700',
  urgente: 'bg-red-100 text-red-700',
}
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
}
const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'A Fazer', in_progress: 'Em Andamento', waiting: 'Aguardando',
  done: 'Concluído', cancelled: 'Cancelado',
}

function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === 'done' || task.status === 'cancelled') return false
  return new Date(task.dueDate) < new Date(new Date().toDateString())
}

function formatDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const COLUMNS: { status: TaskStatus; label: string; headerClass: string }[] = [
  { status: 'todo', label: 'A Fazer', headerClass: 'bg-slate-100 text-slate-700' },
  { status: 'in_progress', label: 'Em Andamento', headerClass: 'bg-blue-100 text-blue-700' },
  { status: 'waiting', label: 'Aguardando', headerClass: 'bg-amber-100 text-amber-700' },
  { status: 'done', label: 'Concluído', headerClass: 'bg-green-100 text-green-700' },
  { status: 'cancelled', label: 'Cancelado', headerClass: 'bg-red-100 text-red-700' },
]

const TAG_OPTIONS = ['Cobrança', 'Entrega', 'Financeiro', 'Visita', 'Pós-venda', 'Urgente']

const EMPTY_FORM = {
  title: '',
  description: '',
  clientId: '',
  clientName: '',
  orderId: '',
  orderNumber: '',
  assignedTo: '',
  assignedToName: '',
  priority: 'media' as TaskPriority,
  status: 'todo' as TaskStatus,
  dueDate: '',
  dueTime: '',
  tags: [] as string[],
  notes: '',
  recurrence: 'none' as TaskRecurrence,
}

function getCalendarDays(month: Date): (Date | null)[] {
  const year = month.getFullYear()
  const m = month.getMonth()
  const firstDay = new Date(year, m, 1).getDay()
  const daysInMonth = new Date(year, m + 1, 0).getDate()
  const days: (Date | null)[] = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, m, d))
  return days
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminTarefas() {
  const { user } = useAuth()
  const { data: rawTasks, loading } = useTasks()
  const { data: users } = useUsers()

  const [tasks, setTasks] = useState<Task[]>([])
  const [view, setView] = useState<'kanban' | 'checklist' | 'calendar'>('kanban')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<TaskStatus | ''>('')
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('')
  const [filterAssigned, setFilterAssigned] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())

  useEffect(() => {
    if (rawTasks) setTasks(rawTasks)
  }, [rawTasks])

  const filtered = tasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.clientName?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterStatus && t.status !== filterStatus) return false
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterAssigned && t.assignedTo !== filterAssigned) return false
    return true
  })

  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    overdue: tasks.filter(t => isOverdue(t)).length,
    urgent: tasks.filter(t => t.priority === 'urgente' && t.status !== 'done').length,
  }

  // ── Actions ──

  const handleMoveTask = async (taskId: string, newStatus: TaskStatus) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    await updateTask(taskId, { status: newStatus })
  }

  const toggleDone = async (task: Task) => {
    const newStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done'
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
    await updateTask(task.id, { status: newStatus })
  }

  const handleDuplicate = async (id: string) => {
    const copy = await duplicateTask(id)
    if (copy) setTasks(prev => [copy, ...prev])
  }

  const confirmDelete = async (id: string) => {
    if (!confirm('Excluir tarefa?')) return
    setTasks(prev => prev.filter(t => t.id !== id))
    await deleteTask(id)
  }

  const openNew = (prefillDate?: string) => {
    setEditingTask(null)
    setForm({ ...EMPTY_FORM, dueDate: prefillDate || '' })
    setShowModal(true)
  }

  const openEdit = (task: Task) => {
    setEditingTask(task)
    setForm({
      title: task.title,
      description: task.description || '',
      clientId: task.clientId || '',
      clientName: task.clientName || '',
      orderId: task.orderId || '',
      orderNumber: task.orderNumber || '',
      assignedTo: task.assignedTo || '',
      assignedToName: task.assignedToName || '',
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate || '',
      dueTime: task.dueTime || '',
      tags: [...task.tags],
      notes: task.notes || '',
      recurrence: task.recurrence,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      if (editingTask) {
        await updateTask(editingTask.id, {
          title: form.title,
          description: form.description || undefined,
          clientId: form.clientId || undefined,
          clientName: form.clientName || undefined,
          orderId: form.orderId || undefined,
          orderNumber: form.orderNumber || undefined,
          assignedTo: form.assignedTo || undefined,
          assignedToName: form.assignedToName || undefined,
          priority: form.priority,
          status: form.status,
          dueDate: form.dueDate || undefined,
          dueTime: form.dueTime || undefined,
          tags: form.tags,
          notes: form.notes || undefined,
          recurrence: form.recurrence,
        })
        setTasks(prev => prev.map(t => t.id === editingTask.id ? { ...t, ...form } : t))
      } else {
        const created = await createTask({
          title: form.title,
          description: form.description || undefined,
          clientId: form.clientId || undefined,
          clientName: form.clientName || undefined,
          orderId: form.orderId || undefined,
          orderNumber: form.orderNumber || undefined,
          assignedTo: form.assignedTo || undefined,
          assignedToName: form.assignedToName || undefined,
          priority: form.priority,
          status: form.status,
          dueDate: form.dueDate || undefined,
          dueTime: form.dueTime || undefined,
          tags: form.tags,
          notes: form.notes || undefined,
          recurrence: form.recurrence,
          createdBy: user?.id || '',
          createdByName: user?.name || '',
        })
        if (created) setTasks(prev => [created, ...prev])
      }
      setShowModal(false)
    } finally {
      setSaving(false)
    }
  }

  const toggleTag = (tag: string) => {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
    }))
  }

  // ── Render helpers ──

  const KanbanCard = ({ task }: { task: Task }) => (
    <div
      className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm space-y-2 cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={() => setDragging(task.id)}
      onDragEnd={() => setDragging(null)}
    >
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>
          {PRIORITY_LABELS[task.priority]}
        </span>
        <button onClick={() => openEdit(task)} className="text-slate-300 hover:text-slate-500">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm font-semibold text-slate-900 line-clamp-2">{task.title}</p>
      {task.clientName && (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Building2 className="w-3 h-3" />{task.clientName}
        </p>
      )}
      {task.assignedToName && (
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <User className="w-3 h-3" />{task.assignedToName}
        </p>
      )}
      {task.dueDate && (
        <p className={`text-xs flex items-center gap-1 ${isOverdue(task) ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
          <Clock className="w-3 h-3" />{formatDate(task.dueDate)}
        </p>
      )}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{tag}</span>
          ))}
        </div>
      )}
    </div>
  )

  // ── Calendar ──
  const calDays = getCalendarDays(currentMonth)
  const monthName = currentMonth.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
  const tasksByDate: Record<string, Task[]> = {}
  filtered.forEach(t => {
    if (t.dueDate) {
      if (!tasksByDate[t.dueDate]) tasksByDate[t.dueDate] = []
      tasksByDate[t.dueDate].push(t)
    }
  })

  return (
    <AdminLayout title="Tarefas">
      <div className="p-4 space-y-4 max-w-full">

        {/* KPIs */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { label: 'Total', value: stats.total, color: 'text-slate-700' },
            { label: 'A Fazer', value: stats.todo, color: 'text-slate-600' },
            { label: 'Em Andamento', value: stats.inProgress, color: 'text-blue-600' },
            { label: 'Concluídos', value: stats.done, color: 'text-green-600' },
            { label: 'Atrasadas', value: stats.overdue, color: 'text-red-500' },
            { label: 'Urgentes', value: stats.urgent, color: 'text-orange-500' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
              <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-100 p-3 flex flex-wrap gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar tarefas..."
            className="flex-1 min-w-[160px] text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as TaskStatus | '')}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Todos os status</option>
            {(Object.keys(STATUS_LABELS) as TaskStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as TaskPriority | '')}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Todas prioridades</option>
            {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map(p => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
          <select value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Todos os responsáveis</option>
            {users?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button
            onClick={() => openNew()}
            className="flex items-center gap-1.5 bg-primary-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors ml-auto"
          >
            <Plus className="w-4 h-4" /> Nova Tarefa
          </button>
        </div>

        {/* Abas */}
        <div className="flex gap-2">
          {(['kanban', 'checklist', 'calendar'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                view === v ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {v === 'kanban' ? 'Kanban' : v === 'checklist' ? 'Checklist' : 'Calendário'}
            </button>
          ))}
        </div>

        {/* Views */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">Carregando tarefas...</div>
        ) : (
          <>
            {/* KANBAN */}
            {view === 'kanban' && (
              <div className="flex gap-4 overflow-x-auto pb-4">
                {COLUMNS.map(col => {
                  const colTasks = filtered.filter(t => t.status === col.status)
                  return (
                    <div
                      key={col.status}
                      className="flex-shrink-0 w-72 flex flex-col gap-2"
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => {
                        if (!dragging) return
                        handleMoveTask(dragging, col.status)
                        setDragging(null)
                      }}
                    >
                      <div className={`rounded-xl px-3 py-2 flex items-center justify-between ${col.headerClass}`}>
                        <span className="text-xs font-bold uppercase tracking-wide">{col.label}</span>
                        <span className="text-xs font-semibold opacity-70">{colTasks.length}</span>
                      </div>
                      <div className="space-y-2 min-h-[80px]">
                        {colTasks.map(t => <KanbanCard key={t.id} task={t} />)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* CHECKLIST */}
            {view === 'checklist' && (
              <div className="space-y-2">
                {filtered.length === 0 && (
                  <div className="text-center py-12 text-slate-400">Nenhuma tarefa encontrada</div>
                )}
                {filtered.map(task => (
                  <div key={task.id} className="bg-white rounded-xl border border-slate-100 p-4 flex items-start gap-3">
                    <button
                      onClick={() => toggleDone(task)}
                      className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                        task.status === 'done' ? 'bg-green-500 border-green-500' : 'border-slate-300'
                      }`}
                    >
                      {task.status === 'done' && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${PRIORITY_COLORS[task.priority]}`}>
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                        {task.clientName && <span className="text-xs text-slate-400">{task.clientName}</span>}
                        {task.dueDate && (
                          <span className={`text-xs ${isOverdue(task) ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                            Vence: {formatDate(task.dueDate)}
                          </span>
                        )}
                        {task.assignedToName && <span className="text-xs text-slate-400">→ {task.assignedToName}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(task)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-primary-600 hover:bg-primary-50">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDuplicate(task.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-blue-600 hover:bg-blue-50">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => confirmDelete(task.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CALENDÁRIO */}
            {view === 'calendar' && (
              <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                {/* Nav */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                    className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                    <ChevronLeft className="w-4 h-4 text-slate-600" />
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-800 capitalize">{monthName}</span>
                    <button onClick={() => setCurrentMonth(new Date())}
                      className="text-xs text-primary-600 font-semibold hover:underline">
                      Mês Atual
                    </button>
                  </div>
                  <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                    className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
                {/* Header dias */}
                <div className="grid grid-cols-7 border-b border-slate-100">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                    <div key={d} className="py-2 text-center text-[11px] font-semibold text-slate-400">{d}</div>
                  ))}
                </div>
                {/* Cells */}
                <div className="grid grid-cols-7">
                  {calDays.map((day, i) => {
                    if (!day) return <div key={i} className="min-h-[80px] border-b border-r border-slate-50" />
                    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
                    const dayTasks = tasksByDate[dateStr] || []
                    const isToday = dateStr === new Date().toISOString().split('T')[0]
                    return (
                      <div
                        key={i}
                        onClick={() => openNew(dateStr)}
                        className="min-h-[80px] border-b border-r border-slate-50 p-1.5 cursor-pointer hover:bg-slate-50 transition-colors"
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mb-1 ${
                          isToday ? 'bg-primary-600 text-white' : 'text-slate-600'
                        }`}>
                          {day.getDate()}
                        </div>
                        {dayTasks.slice(0, 2).map(t => (
                          <div
                            key={t.id}
                            onClick={e => { e.stopPropagation(); openEdit(t) }}
                            className={`text-[9px] font-medium px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer ${PRIORITY_COLORS[t.priority]}`}
                          >
                            {t.title}
                          </div>
                        ))}
                        {dayTasks.length > 2 && (
                          <div className="text-[9px] text-slate-400">+{dayTasks.length - 2}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowModal(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto safe-bottom"
            >
              <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">{editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Título */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Título *</label>
                  <input
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Título da tarefa"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                {/* Descrição */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Descrição</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                </div>

                {/* Prioridade */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Prioridade</label>
                  <div className="flex gap-2">
                    {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map(p => (
                      <button
                        key={p}
                        onClick={() => setForm(f => ({ ...f, priority: p }))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          form.priority === p ? PRIORITY_COLORS[p] + ' ring-2 ring-offset-1 ring-current' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {PRIORITY_LABELS[p]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {(Object.keys(STATUS_LABELS) as TaskStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>

                {/* Data e hora */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Data de vencimento</label>
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Hora</label>
                    <input
                      type="time"
                      value={form.dueTime}
                      onChange={e => setForm(f => ({ ...f, dueTime: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* Responsável */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Responsável</label>
                  <select
                    value={form.assignedTo}
                    onChange={e => {
                      const selected = users?.find(u => u.id === e.target.value)
                      setForm(f => ({ ...f, assignedTo: e.target.value, assignedToName: selected?.name || '' }))
                    }}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Selecionar responsável</option>
                    {users?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>

                {/* Recorrência */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Recorrência</label>
                  <select
                    value={form.recurrence}
                    onChange={e => setForm(f => ({ ...f, recurrence: e.target.value as TaskRecurrence }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="none">Sem recorrência</option>
                    <option value="daily">Diária</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {TAG_OPTIONS.map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`text-xs px-3 py-1 rounded-full font-medium transition-all ${
                          form.tags.includes(tag)
                            ? 'bg-primary-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Observações */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Observações</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                </div>

                {/* Botões */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !form.title.trim()}
                    className="flex-1 py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Salvando...' : editingTask ? 'Salvar' : 'Criar Tarefa'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
