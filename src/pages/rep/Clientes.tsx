import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, SlidersHorizontal, MapPin, Clock, ShoppingCart, ChevronRight, X, Plus, Check, AlertCircle } from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useClients } from '@/hooks/useData'
import { createClient, createInteraction, logAudit } from '@/services/db'
import { LoadingSpinner, EmptyState } from '@/components/shared/LoadingState'
import { formatCurrency, daysSince, cn, clientTypeLabel } from '@/utils'
import type { Priority, ClientType } from '@/types'

const SEGMENTS = ['Acessórios Pet', 'Agropecuária', 'Distribuidor', 'Pet Shop', 'Lojista', 'Revendedor', 'Veterinário', 'Outros']
const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'agropecuaria', label: 'Agropecuária' },
  { value: 'distribuidor', label: 'Distribuidor' },
  { value: 'revendedor', label: 'Revendedor' },
  { value: 'fazenda', label: 'Fazenda' },
  { value: 'cooperativa', label: 'Cooperativa' },
]
const EMPTY_CLIENT = { name: '', tradeName: '', cnpj: '', phone: '', email: '', segment: '', type: 'revendedor' as ClientType, priority: 'media' as Priority, notes: '', street: '', number: '', city: '', state: 'SP', zipCode: '' }

type QuickFilter = 'todos' | 'semVisita30' | 'semPedido60' | 'semVisitaESemPedido' | 'visitadosMes' | 'pedidosMes'

const PRIORITY_DOT: Record<Priority, string> = { alta: 'bg-red-500', media: 'bg-amber-500', baixa: 'bg-slate-400' }

export default function RepClientes() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: allClients = [], loading, refetch } = useClients(user?.id)

  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('todos')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [cityFilter, setCityFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'todos'>('todos')
  const [showNewClient, setShowNewClient] = useState(false)
  const [clientForm, setClientForm] = useState(EMPTY_CLIENT)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const handleCreateClient = async () => {
    // MELHORIA 5: Validações
    if (!clientForm.name.trim()) { setFormError('Razão Social é obrigatória'); return }
    if (!clientForm.phone.trim()) { setFormError('Telefone é obrigatório'); return }
    if (!clientForm.segment) { setFormError('Segmento é obrigatório'); return }
    if (!clientForm.city.trim()) { setFormError('Cidade é obrigatória'); return }
    if (!user) return
    setSaving(true); setFormError('')
    try {
      const client = await createClient({
        name: clientForm.name.trim(),
        tradeName: clientForm.tradeName.trim() || undefined,
        cnpj: clientForm.cnpj.trim() || undefined,
        type: clientForm.type,
        repId: user.id,
        address: { street: `${clientForm.street} ${clientForm.number}`.trim(), city: clientForm.city.trim(), state: clientForm.state, zipCode: clientForm.zipCode.trim(), lat: 0, lng: 0 },
        phone: clientForm.phone.trim(),
        email: clientForm.email.trim() || undefined,
        status: 'ativo',
        segment: clientForm.segment,
        priority: clientForm.priority,
        notes: clientForm.notes.trim() || undefined,
      })
      if (client) {
        await createInteraction({ clientId: client.id, clientName: client.name, repId: user.id, repName: user.name, type: 'anotacao', title: 'Cliente cadastrado', description: 'Novo cliente adicionado à carteira', timestamp: new Date().toISOString() })
        await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'create_client', entity: 'Cliente', entityId: client.id, description: `Cadastrou cliente ${client.name}`, timestamp: new Date().toISOString() })
      }
      setShowNewClient(false); setClientForm(EMPTY_CLIENT); refetch()
    } catch { setFormError('Erro ao cadastrar cliente') }
    finally { setSaving(false) }
  }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const cities = useMemo(() => [...new Set(allClients.map(c => c.address.city))].sort(), [allClients])

  const filtered = useMemo(() => allClients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.address.city.toLowerCase().includes(search.toLowerCase())
    const matchCity = !cityFilter || c.address.city === cityFilter
    const matchPriority = priorityFilter === 'todos' || c.priority === priorityFilter
    const dv = c.lastVisit ? daysSince(c.lastVisit) : 999
    const dp = c.lastOrder ? daysSince(c.lastOrder) : 999
    let matchQuick = true
    switch (quickFilter) {
      case 'semVisita30': matchQuick = dv > 30; break
      case 'semPedido60': matchQuick = dp > 60; break
      case 'semVisitaESemPedido': matchQuick = dv > 30 && dp > 60; break
      case 'visitadosMes': matchQuick = !!(c.lastVisit && c.lastVisit >= startOfMonth); break
      case 'pedidosMes': matchQuick = !!(c.lastOrder && c.lastOrder >= startOfMonth); break
    }
    return matchSearch && matchCity && matchPriority && matchQuick
  }), [allClients, search, cityFilter, priorityFilter, quickFilter, startOfMonth])

  return (
    <RepLayout title="Meus Clientes">
      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou cidade..." className="input pl-10" />
          </div>
          <button onClick={() => setShowAdvanced(v => !v)}
            className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
              showAdvanced ? 'bg-primary-600 text-white border-primary-600' : 'bg-white border-slate-200 text-slate-600')}>
            <SlidersHorizontal className="w-4 h-4" /> Filtros
          </button>
          <button onClick={() => { setShowNewClient(true); setFormError('') }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="card p-4 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Cidade</label>
                  <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="input">
                    <option value="">Todas</option>
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Prioridade</label>
                  <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as Priority | 'todos')} className="input">
                    <option value="todos">Todas</option>
                    <option value="alta">Alta</option>
                    <option value="media">Média</option>
                    <option value="baixa">Baixa</option>
                  </select>
                </div>
                <button onClick={() => { setCityFilter(''); setPriorityFilter('todos'); setQuickFilter('todos') }}
                  className="text-xs text-red-500 font-medium flex items-center gap-1">
                  <X className="w-3 h-3" /> Limpar filtros
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {([
            { value: 'todos', label: `Todos (${allClients.length})` },
            { value: 'semVisita30', label: 'Sem visita +30d' },
            { value: 'semPedido60', label: 'Sem pedido +60d' },
            { value: 'semVisitaESemPedido', label: 'Sem visita e sem pedido' },
            { value: 'visitadosMes', label: 'Visitados este mês' },
            { value: 'pedidosMes', label: 'Pedido este mês' },
          ] as const).map(f => (
            <button key={f.value} onClick={() => setQuickFilter(f.value as QuickFilter)}
              className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                quickFilter === f.value ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600')}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState label="Nenhum cliente encontrado" />
        ) : (
          <>
            <p className="text-xs text-slate-500">{filtered.length} cliente{filtered.length !== 1 ? 's' : ''}</p>
            <div className="space-y-2">
              {filtered.map((client, i) => {
                const dv = client.lastVisit ? daysSince(client.lastVisit) : 999
                const dp = client.lastOrder ? daysSince(client.lastOrder) : 999
                return (
                  <motion.button key={client.id} onClick={() => navigate(`/rep/clientes/${client.id}`)}
                    className="w-full card p-4 text-left active:scale-[0.98] transition-transform"
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <div className="flex items-start gap-3">
                      <div className="pt-1 flex-shrink-0">
                        <div className={cn('w-2.5 h-2.5 rounded-full', PRIORITY_DOT[client.priority])} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-slate-900 text-sm truncate">{client.name}</h3>
                            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              {client.address.city}, {client.address.state}
                              <span className="text-slate-300">·</span>
                              {clientTypeLabel(client.type)}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
                        </div>
                        <div className="flex items-center gap-4 mt-2.5 text-xs">
                          <span className={cn('flex items-center gap-1', dv > 30 ? 'text-red-500 font-medium' : 'text-slate-400')}>
                            <Clock className="w-3 h-3" />
                            {dv < 999 ? `${dv}d s/ visita` : 'Sem visita'}
                          </span>
                          <span className={cn('flex items-center gap-1', dp > 60 ? 'text-amber-500 font-medium' : 'text-slate-400')}>
                            <ShoppingCart className="w-3 h-3" />
                            {dp < 999 ? `${dp}d s/ pedido` : 'Sem pedido'}
                          </span>
                          <span className="ml-auto font-semibold text-slate-600">{formatCurrency(client.totalRevenue)}</span>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal Novo Cliente */}
      <AnimatePresence>
        {showNewClient && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowNewClient(false)} />
            <motion.div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 max-h-[92vh] overflow-y-auto safe-bottom"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
                <h2 className="font-bold text-slate-900">Novo Cliente</h2>
                <button onClick={() => setShowNewClient(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4 text-slate-500" /></button>
              </div>
              <div className="p-5 space-y-4 pb-8">
                {formError && <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{formError}</div>}

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Razão Social *</label><input value={clientForm.name} onChange={e => setClientForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome da empresa" className="input" /></div>
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Nome Fantasia</label><input value={clientForm.tradeName} onChange={e => setClientForm(p => ({ ...p, tradeName: e.target.value }))} placeholder="Como é conhecido" className="input" /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">CNPJ / CPF</label><input value={clientForm.cnpj} onChange={e => setClientForm(p => ({ ...p, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" className="input" /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Telefone *</label><input value={clientForm.phone} onChange={e => setClientForm(p => ({ ...p, phone: e.target.value }))} placeholder="(00) 99999-0000" className="input" /></div>
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">E-mail</label><input value={clientForm.email} onChange={e => setClientForm(p => ({ ...p, email: e.target.value }))} type="email" placeholder="email@empresa.com" className="input" /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Tipo</label>
                    <select value={clientForm.type} onChange={e => setClientForm(p => ({ ...p, type: e.target.value as ClientType }))} className="input">
                      {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Segmento *</label>
                    <select value={clientForm.segment} onChange={e => setClientForm(p => ({ ...p, segment: e.target.value }))} className="input">
                      <option value="">Selecione...</option>
                      {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Prioridade</label>
                    <select value={clientForm.priority} onChange={e => setClientForm(p => ({ ...p, priority: e.target.value as Priority }))} className="input">
                      <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
                    </select>
                  </div>
                </div>

                <p className="text-xs font-semibold text-slate-500 -mb-2">Endereço</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Rua</label><input value={clientForm.street} onChange={e => setClientForm(p => ({ ...p, street: e.target.value }))} placeholder="Rua / Av. / Rod." className="input" /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Número</label><input value={clientForm.number} onChange={e => setClientForm(p => ({ ...p, number: e.target.value }))} placeholder="100" className="input" /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">CEP</label><input value={clientForm.zipCode} onChange={e => setClientForm(p => ({ ...p, zipCode: e.target.value }))} placeholder="00000-000" className="input" /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Cidade *</label><input value={clientForm.city} onChange={e => setClientForm(p => ({ ...p, city: e.target.value }))} placeholder="São Paulo" className="input" /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">UF</label>
                    <select value={clientForm.state} onChange={e => setClientForm(p => ({ ...p, state: e.target.value }))} className="input">
                      {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div><label className="text-xs font-semibold text-slate-500 block mb-1">Observações</label><textarea value={clientForm.notes} onChange={e => setClientForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Informações adicionais..." className="input resize-none" /></div>

                <button onClick={handleCreateClient} disabled={saving}
                  className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                  <Check className="w-4 h-4" /> {saving ? 'Cadastrando...' : 'Cadastrar Cliente'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </RepLayout>
  )
}
