import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, MapPin, Clock, ShoppingCart, ChevronRight, AlertTriangle, Plus, X, Check, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '@/layouts/AdminLayout'
import { useClients, useUsers } from '@/hooks/useData'
import { createClient, createInteraction, logAudit } from '@/services/db'
import { useAuth } from '@/contexts/AuthContext'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { formatCurrency, daysSince, clientTypeLabel, cn } from '@/utils'
import { PriorityBadge } from '@/components/shared/StatusBadge'
import type { Priority, ClientType } from '@/types'

const SEGMENTS = ['Acessórios Pet', 'Agropecuária', 'Distribuidor', 'Pet Shop', 'Lojista', 'Revendedor', 'Veterinário', 'Outros']
const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'agropecuaria', label: 'Agropecuária' },
  { value: 'distribuidor', label: 'Distribuidor' },
  { value: 'revendedor', label: 'Revendedor' },
  { value: 'fazenda', label: 'Fazenda' },
  { value: 'cooperativa', label: 'Cooperativa' },
]
const EMPTY_C = { name: '', tradeName: '', cnpj: '', phone: '', email: '', segment: '', type: 'revendedor' as ClientType, priority: 'media' as Priority, notes: '', street: '', number: '', city: '', state: 'SP', zipCode: '', repId: '' }

const VIEWS = ['Lista', 'Estratégico'] as const
type View = typeof VIEWS[number]

export default function AdminClientes() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [repFilter, setRepFilter] = useState('todos')
  const [cityFilter, setCityFilter] = useState('todas')
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'todos'>('todos')
  const [view, setView] = useState<View>('Lista')
  const [showNewClient, setShowNewClient] = useState(false)
  const [cForm, setCForm] = useState(EMPTY_C)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const navigate = useNavigate()

  const { data: allClients = [], loading, refetch } = useClients()
  const { data: users = [] } = useUsers()
  const reps = users.filter(u => u.role === 'rep' && u.active)

  const handleCreateClient = async () => {
    if (!cForm.name.trim()) { setFormError('Razão Social é obrigatória'); return }
    if (!cForm.phone.trim()) { setFormError('Telefone é obrigatório'); return }
    if (!cForm.segment) { setFormError('Segmento é obrigatório'); return }
    if (!cForm.repId) { setFormError('Representante é obrigatório'); return }
    if (!cForm.city.trim()) { setFormError('Cidade é obrigatória'); return }
    if (!user) return
    setSaving(true); setFormError('')
    try {
      const repName = reps.find(r => r.id === cForm.repId)?.name ?? ''
      const client = await createClient({
        name: cForm.name.trim(),
        tradeName: cForm.tradeName.trim() || undefined,
        cnpj: cForm.cnpj.trim() || undefined,
        type: cForm.type,
        repId: cForm.repId,
        address: { street: `${cForm.street} ${cForm.number}`.trim(), city: cForm.city.trim(), state: cForm.state, zipCode: cForm.zipCode.trim(), lat: 0, lng: 0 },
        phone: cForm.phone.trim(),
        email: cForm.email.trim() || undefined,
        status: 'ativo',
        segment: cForm.segment,
        priority: cForm.priority,
        notes: cForm.notes.trim() || undefined,
      })
      if (client) {
        await createInteraction({ clientId: client.id, clientName: client.name, repId: cForm.repId, repName, type: 'anotacao', title: 'Cliente cadastrado pelo admin', description: `Cadastro realizado por ${user.name}`, timestamp: new Date().toISOString() })
        await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'create_client', entity: 'Cliente', entityId: client.id, description: `Admin cadastrou cliente ${client.name}`, timestamp: new Date().toISOString() })
      }
      setShowNewClient(false); setCForm(EMPTY_C); refetch()
    } catch { setFormError('Erro ao cadastrar cliente') }
    finally { setSaving(false) }
  }
  const allCities = useMemo(() => [...new Set(allClients.map(c => c.address.city))].sort(), [allClients])

  const filtered = useMemo(() => allClients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.address.city.toLowerCase().includes(search.toLowerCase())
    const matchRep = repFilter === 'todos' || c.repId === repFilter
    const matchCity = cityFilter === 'todas' || c.address.city === cityFilter
    const matchPriority = priorityFilter === 'todos' || c.priority === priorityFilter
    return matchSearch && matchRep && matchCity && matchPriority
  }), [allClients, search, repFilter, cityFilter, priorityFilter])

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const noVisitThisMonth = allClients.filter(c => !c.lastVisit || c.lastVisit < startOfMonth)
  const noOrderThisMonth = allClients.filter(c => !c.lastOrder || c.lastOrder < startOfMonth)
  const noVisit30 = allClients.filter(c => !c.lastVisit || daysSince(c.lastVisit) > 30)
  const noOrder60 = allClients.filter(c => !c.lastOrder || daysSince(c.lastOrder) > 60)
  const criticalClients = allClients.filter(c =>
    (!c.lastVisit || daysSince(c.lastVisit) > 30) && (!c.lastOrder || daysSince(c.lastOrder) > 60)
  )

  if (loading) return <AdminLayout title="Clientes"><div className="p-6"><LoadingSpinner /></div></AdminLayout>

  return (
    <AdminLayout title="Clientes">
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {VIEWS.map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                view === v ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {v}
            </button>
          ))}
          </div>
          <button onClick={() => { setShowNewClient(true); setFormError('') }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Cliente
          </button>
        </div>

        {view === 'Lista' && (
          <>
            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente ou cidade..." className="input pl-10" />
              </div>
              <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="input w-auto min-w-40">
                <option value="todos">Todos representantes</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name.split(' ')[0]}</option>)}
              </select>
              <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="input w-auto min-w-36">
                <option value="todas">Todas cidades</option>
                {allCities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as Priority | 'todos')} className="input w-auto">
                <option value="todos">Todas prioridades</option>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>

            <p className="text-xs text-slate-500">{filtered.length} cliente{filtered.length !== 1 ? 's' : ''}</p>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Cliente</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Tipo</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">Representante</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Prioridade</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Receita</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">S/ Visita</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((client, i) => {
                      const rep = reps.find(r => r.id === client.repId)
                      const daysSinceVisit = client.lastVisit ? daysSince(client.lastVisit) : 999
                      const isOverdue = daysSinceVisit > 30

                      return (
                        <motion.tr
                          key={client.id}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          onClick={() => navigate(`/admin/clientes/${client.id}`)}
                        >
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-slate-900">{client.name}</p>
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" />
                              {client.address.city}, {client.address.state}
                            </p>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-xs text-slate-500">{clientTypeLabel(client.type)}</span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-xs text-slate-600">{rep?.name.split(' ')[0] ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <PriorityBadge priority={client.priority} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-slate-900">{formatCurrency(client.totalRevenue)}</span>
                          </td>
                          <td className="px-4 py-3 text-right hidden lg:table-cell">
                            <span className={cn('text-xs font-medium', isOverdue ? 'text-red-500' : 'text-slate-400')}>
                              {daysSinceVisit < 999 ? `${daysSinceVisit}d` : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                          </td>
                        </motion.tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {view === 'Estratégico' && (
          <div className="space-y-5">
            {/* Alert cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Sem visita este mês', value: noVisitThisMonth.length, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
                { label: 'Sem pedido este mês', value: noOrderThisMonth.length, icon: ShoppingCart, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
                { label: 'Sem visita +30d', value: noVisit30.length, icon: Clock, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
                { label: 'Sem pedido +60d', value: noOrder60.length, icon: ShoppingCart, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
              ].map((card, i) => (
                <motion.div
                  key={card.label}
                  className={cn('card p-4 border', card.border, card.bg)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-2', 'bg-white/80')}>
                    <card.icon className={cn('w-4 h-4', card.color)} />
                  </div>
                  <p className={cn('text-2xl font-bold', card.color)}>{card.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
                </motion.div>
              ))}
            </div>

            {/* Critical clients */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <h3 className="font-semibold text-slate-900">Clientes Críticos</h3>
                <span className="text-xs bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">{criticalClients.length}</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">Sem visita há +30 dias E sem pedido há +60 dias</p>

              {criticalClients.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Nenhum cliente crítico</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left text-xs text-slate-400 pb-2">Cliente</th>
                        <th className="text-left text-xs text-slate-400 pb-2 hidden md:table-cell">Representante</th>
                        <th className="text-right text-xs text-slate-400 pb-2">S/ visita</th>
                        <th className="text-right text-xs text-slate-400 pb-2">S/ pedido</th>
                        <th className="px-2 pb-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {criticalClients.map((c, i) => {
                        const rep = reps.find(r => r.id === c.repId)
                        return (
                          <motion.tr
                            key={c.id}
                            className="hover:bg-slate-50 cursor-pointer"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.03 }}
                            onClick={() => navigate(`/admin/clientes/${c.id}`)}
                          >
                            <td className="py-2.5">
                              <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                              <p className="text-xs text-slate-400">{c.address.city}</p>
                            </td>
                            <td className="py-2.5 hidden md:table-cell">
                              <span className="text-xs text-slate-600">{rep?.name.split(' ')[0] ?? '—'}</span>
                            </td>
                            <td className="py-2.5 text-right">
                              <span className="text-xs font-bold text-red-500">
                                {c.lastVisit ? `${daysSince(c.lastVisit)}d` : 'Nunca'}
                              </span>
                            </td>
                            <td className="py-2.5 text-right">
                              <span className="text-xs font-bold text-red-500">
                                {c.lastOrder ? `${daysSince(c.lastOrder)}d` : 'Nunca'}
                              </span>
                            </td>
                            <td className="py-2.5 px-2">
                              <ChevronRight className="w-4 h-4 text-slate-300" />
                            </td>
                          </motion.tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Novo Cliente */}
      <AnimatePresence>
        {showNewClient && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowNewClient(false)} />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
                  <h2 className="font-bold text-slate-900">Novo Cliente</h2>
                  <button onClick={() => setShowNewClient(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4 text-slate-500" /></button>
                </div>
                <div className="p-5 space-y-4">
                  {formError && <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{formError}</div>}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Representante responsável *</label>
                    <select value={cForm.repId} onChange={e => setCForm(p => ({ ...p, repId: e.target.value }))} className="input">
                      <option value="">Selecione o representante</option>
                      {reps.map(r => <option key={r.id} value={r.id}>{r.name} {r.region ? `— ${r.region}` : ''}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Razão Social *</label><input value={cForm.name} onChange={e => setCForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome da empresa" className="input" /></div>
                    <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Nome Fantasia</label><input value={cForm.tradeName} onChange={e => setCForm(p => ({ ...p, tradeName: e.target.value }))} className="input" /></div>
                    <div><label className="text-xs font-semibold text-slate-500 block mb-1">CNPJ / CPF</label><input value={cForm.cnpj} onChange={e => setCForm(p => ({ ...p, cnpj: e.target.value }))} className="input" /></div>
                    <div><label className="text-xs font-semibold text-slate-500 block mb-1">Telefone *</label><input value={cForm.phone} onChange={e => setCForm(p => ({ ...p, phone: e.target.value }))} className="input" /></div>
                    <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">E-mail</label><input value={cForm.email} onChange={e => setCForm(p => ({ ...p, email: e.target.value }))} type="email" className="input" /></div>
                    <div><label className="text-xs font-semibold text-slate-500 block mb-1">Tipo</label>
                      <select value={cForm.type} onChange={e => setCForm(p => ({ ...p, type: e.target.value as ClientType }))} className="input">
                        {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div><label className="text-xs font-semibold text-slate-500 block mb-1">Segmento *</label>
                      <select value={cForm.segment} onChange={e => setCForm(p => ({ ...p, segment: e.target.value }))} className="input">
                        <option value="">Selecione...</option>
                        {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div><label className="text-xs font-semibold text-slate-500 block mb-1">Prioridade</label>
                      <select value={cForm.priority} onChange={e => setCForm(p => ({ ...p, priority: e.target.value as Priority }))} className="input">
                        <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
                      </select>
                    </div>
                    <div><label className="text-xs font-semibold text-slate-500 block mb-1">Cidade *</label><input value={cForm.city} onChange={e => setCForm(p => ({ ...p, city: e.target.value }))} className="input" /></div>
                    <div><label className="text-xs font-semibold text-slate-500 block mb-1">UF</label>
                      <select value={cForm.state} onChange={e => setCForm(p => ({ ...p, state: e.target.value }))} className="input">
                        {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={handleCreateClient} disabled={saving} className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                    <Check className="w-4 h-4" />{saving ? 'Criando...' : 'Criar Cliente'}
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
