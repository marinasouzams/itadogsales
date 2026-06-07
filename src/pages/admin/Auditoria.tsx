import { useState } from 'react'
import { Search, Shield, Download } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import Timeline from '@/components/shared/Timeline'
import { useAuditLogs, useUsers } from '@/hooks/useData'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import type { AuditAction } from '@/types'

const ACTION_LABELS: Record<AuditAction, string> = {
  login: 'Login',
  logout: 'Logout',
  create_order: 'Criar pedido',
  update_order: 'Editar pedido',
  cancel_order: 'Cancelar pedido',
  create_visit: 'Nova visita',
  checkin: 'Check-in',
  checkout: 'Check-out',
  update_client: 'Editar cliente',
  assume_prospect: 'Assumir lead',
  convert_prospect: 'Converter lead',
  sync_bling: 'Sync Bling',
  transfer_client: 'Transferir cliente',
}

export default function AdminAuditoria() {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState<AuditAction | 'todos'>('todos')
  const [repFilter, setRepFilter] = useState('todos')

  const { data: allLogs = [], loading } = useAuditLogs()
  const { data: users = [] } = useUsers()
  const reps = users.filter(u => u.role === 'rep')

  const filtered = allLogs.filter(log => {
    const matchSearch = log.userName.toLowerCase().includes(search.toLowerCase()) ||
      log.description.toLowerCase().includes(search.toLowerCase())
    const matchAction = actionFilter === 'todos' || log.action === actionFilter
    const matchRep = repFilter === 'todos' || log.userId === repFilter
    return matchSearch && matchAction && matchRep
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const uniqueActions = [...new Set(allLogs.map(l => l.action))] as AuditAction[]

  if (loading) return <AdminLayout title="Auditoria"><div className="p-6"><LoadingSpinner /></div></AdminLayout>

  return (
    <AdminLayout title="Auditoria">
      <div className="p-6 space-y-5 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-slate-400" />
            <span className="text-sm text-slate-500">{allLogs.length} eventos registrados</span>
          </div>
          <button className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" />
            Exportar log
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar usuário ou descrição..."
              className="input pl-10"
            />
          </div>

          <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="input w-auto min-w-36">
            <option value="todos">Todos usuários</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name.split(' ')[0]}</option>)}
          </select>

          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value as AuditAction | 'todos')}
            className="input w-auto min-w-44"
          >
            <option value="todos">Todas as ações</option>
            {uniqueActions.map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a]}</option>
            ))}
          </select>
        </div>

        <p className="text-xs text-slate-500">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</p>

        {/* Timeline */}
        <div className="card p-5">
          <Timeline logs={filtered} />
        </div>
      </div>
    </AdminLayout>
  )
}
