import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, Star, MapPin, TrendingUp, ChevronRight, Users } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useProspects, useUsers } from '@/hooks/useData'
import { updateProspect } from '@/services/db'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { formatCurrency, cn } from '@/utils'
import { ProspectStatusBadge } from '@/components/shared/StatusBadge'
import type { ProspectStatus } from '@/types'

export default function AdminProspects() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [repFilter, setRepFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | 'todos'>('todos')

  const { data: allProspects = [], loading, refetch } = useProspects()
  const { data: users = [] } = useUsers()
  const reps = users.filter(u => u.role === 'rep')

  const filtered = allProspects.filter(p => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.city.toLowerCase().includes(search.toLowerCase()) ||
      p.segment.toLowerCase().includes(search.toLowerCase())
    const matchRep = repFilter === 'todos' || p.repId === repFilter
    const matchStatus = statusFilter === 'todos' || p.status === statusFilter
    return matchSearch && matchRep && matchStatus
  })

  const cityStats = allProspects.reduce<Record<string, number>>((acc, p) => {
    acc[p.city] = (acc[p.city] ?? 0) + 1
    return acc
  }, {})
  const topCities = Object.entries(cityStats).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const repStats = reps.map(r => ({
    name: r.name.split(' ')[0],
    count: allProspects.filter(p => p.repId === r.id).length,
  })).filter(r => r.count > 0).sort((a, b) => b.count - a.count)

  const STATUS_OPTS: { label: string; value: ProspectStatus | 'todos' }[] = [
    { label: 'Todos', value: 'todos' },
    { label: 'Disponíveis', value: 'disponivel' },
    { label: 'Assumidos', value: 'assumido' },
    { label: 'Convertidos', value: 'convertido' },
    { label: 'Descartados', value: 'descartado' },
  ]

  if (loading) return <AdminLayout title="Prospects / Leads"><div className="p-6"><LoadingSpinner /></div></AdminLayout>

  return (
    <AdminLayout title="Prospects / Leads">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: allProspects.length, color: 'text-slate-900' },
            { label: 'Disponíveis', value: allProspects.filter(p => p.status === 'disponivel').length, color: 'text-blue-600' },
            { label: 'Assumidos', value: allProspects.filter(p => p.status === 'assumido').length, color: 'text-amber-600' },
            { label: 'Convertidos', value: allProspects.filter(p => p.status === 'convertido').length, color: 'text-green-600' },
          ].map((s, i) => (
            <motion.div key={s.label} className="card p-4 text-center" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.label}</p>
            </motion.div>
          ))}
        </div>

        {/* City + Rep breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <p className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-600" /> Prospects por cidade
            </p>
            <div className="space-y-2">
              {topCities.map(([city, count]) => (
                <div key={city} className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">{city}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(count / allProspects.length) * 100}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-600 w-4 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <p className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary-600" /> Prospects por representante
            </p>
            <div className="space-y-2">
              {repStats.map(({ name, count }) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">{name}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(count / allProspects.length) * 100}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-600 w-4 text-right">{count}</span>
                  </div>
                </div>
              ))}
              {repStats.length === 0 && <p className="text-sm text-slate-400">Nenhum dado</p>}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, cidade ou segmento..." className="input pl-10" />
          </div>
          <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="input w-auto min-w-44">
            <option value="todos">Todos os representantes</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name.split(' ')[0]}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as ProspectStatus | 'todos')} className="input w-auto">
            {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <p className="text-xs text-slate-500">{filtered.length} prospect{filtered.length !== 1 ? 's' : ''}</p>

        {/* Table */}
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Prospect</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Cidade</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">Representante</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">Potencial</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p, i) => (
                <motion.tr
                  key={p.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/admin/prospects/${p.id}`)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.contact} · {p.segment}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="text-sm text-slate-600">{p.city}, {p.state}</p>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <p className="text-sm text-slate-500">{p.repName?.split(' ')[0] ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <ProspectStatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    {p.estimatedRevenue
                      ? <span className="text-sm font-medium text-green-700">{formatCurrency(p.estimatedRevenue)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  )
}
