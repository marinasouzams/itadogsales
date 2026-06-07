import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Calendar, Clock, CheckCircle2 } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import MapMock from '@/components/shared/MapMock'
import { MOCK_VISITS, MOCK_CLIENTS, MOCK_USERS } from '@/mock/data'
import { formatDate, formatDuration } from '@/utils'
import { VisitStatusBadge, VisitResultBadge } from '@/components/shared/StatusBadge'
import type { VisitStatus } from '@/types'

export default function AdminVisitas() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<VisitStatus | 'todos'>('todos')
  const [repFilter, setRepFilter] = useState('todos')
  const [clientFilter, setClientFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showPeriod, setShowPeriod] = useState(false)
  const [view, setView] = useState<'list' | 'map'>('list')

  const reps = MOCK_USERS.filter(u => u.role === 'rep')

  const filtered = MOCK_VISITS.filter(v => {
    const matchSearch = v.clientName.toLowerCase().includes(search.toLowerCase()) ||
      v.repName.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'todos' || v.status === statusFilter
    const matchRep = repFilter === 'todos' || v.repId === repFilter
    const matchClient = !clientFilter || v.clientName.toLowerCase().includes(clientFilter.toLowerCase())
    const matchFrom = !dateFrom || v.createdAt >= dateFrom
    const matchTo = !dateTo || v.createdAt <= dateTo
    return matchSearch && matchStatus && matchRep && matchClient && matchFrom && matchTo
  })

  const mapClients = MOCK_CLIENTS.map(c => ({
    id: c.id,
    name: c.name,
    lat: c.address.lat,
    lng: c.address.lng,
    priority: c.priority,
    visited: MOCK_VISITS.some(v => v.clientId === c.id && v.status === 'concluida'),
  }))

  const completedCount = MOCK_VISITS.filter(v => v.status === 'concluida').length
  const inProgressCount = MOCK_VISITS.filter(v => v.status === 'em_andamento').length

  const STATUS_OPTS: { label: string; value: VisitStatus | 'todos' }[] = [
    { label: 'Todas', value: 'todos' },
    { label: 'Agendadas', value: 'agendada' },
    { label: 'Em andamento', value: 'em_andamento' },
    { label: 'Concluídas', value: 'concluida' },
    { label: 'Canceladas', value: 'cancelada' },
  ]

  return (
    <AdminLayout title="Visitas">
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total', value: MOCK_VISITS.length, color: 'text-slate-900' },
            { label: 'Em andamento', value: inProgressCount, color: 'text-amber-600' },
            { label: 'Concluídas', value: completedCount, color: 'text-green-600' },
          ].map(stat => (
            <div key={stat.label} className="card p-4 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setView('list')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${view === 'list' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Lista
          </button>
          <button
            onClick={() => setView('map')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${view === 'map' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Mapa
          </button>
        </div>

        {view === 'map' ? (
          <div className="card p-4">
            <MapMock clients={mapClients} height="h-96" showRoute={false} />
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente ou rep..." className="input pl-10" />
              </div>
              <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="input w-auto min-w-36">
                <option value="todos">Todos reps</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name.split(' ')[0]}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as VisitStatus | 'todos')} className="input w-auto">
                {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <button onClick={() => setShowPeriod(v => !v)} className="text-xs text-primary-600 font-medium">
                {showPeriod ? '↑ Ocultar período' : '↓ Filtrar por período'}
              </button>
              {showPeriod && (
                <div className="flex gap-2 mt-2">
                  <div className="flex-1">
                    <label className="text-xs text-slate-400 block mb-1">De</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input text-sm" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-400 block mb-1">Até</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input text-sm" />
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500">{filtered.length} visita{filtered.length !== 1 ? 's' : ''}</p>

            {/* Table */}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Cliente</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Representante</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">Resultado</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Duração</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((visit, i) => (
                      <motion.tr
                        key={visit.id}
                        className="hover:bg-slate-50 transition-colors"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-900">{visit.clientName}</p>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <p className="text-sm text-slate-500">{visit.repName.split(' ')[0]}</p>
                        </td>
                        <td className="px-4 py-3">
                          <VisitStatusBadge status={visit.status} />
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {visit.result ? <VisitResultBadge result={visit.result} /> : <span className="text-xs text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-xs text-slate-500">
                            {visit.duration ? formatDuration(visit.duration) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs text-slate-400">{formatDate(visit.createdAt)}</span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
