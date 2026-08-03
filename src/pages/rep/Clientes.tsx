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
import type { Priority, ClientType, Client } from '@/types'
import CnpjLookupField from '@/components/shared/CnpjLookupField'
import type { CnpjData } from '@/services/cnpj'
import { ClientApprovalBadge } from '@/components/shared/StatusBadge'

const SEGMENTS = ['Acessórios Pet', 'Agropecuária', 'Distribuidor', 'Pet Shop', 'Lojista', 'Revendedor', 'Veterinário', 'Outros']
const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'agropecuaria', label: 'Agropecuária' },
  { value: 'distribuidor', label: 'Distribuidor' },
  { value: 'revendedor', label: 'Revendedor' },
  { value: 'fazenda', label: 'Fazenda' },
  { value: 'cooperativa', label: 'Cooperativa' },
]
const PAYMENT_METHODS = ['Boleto', 'PIX', 'Cartão', 'Cheque', 'Dinheiro']
const PAYMENT_TERMS = ['À vista', '30 dias', '30/60', '30/45/60', '30/60/90']
const CREDIT_CLASSIFICATIONS = ['A+', 'A', 'B', 'C', 'D', 'Bloqueado']

const EMPTY_CLIENT = {
  // Básico
  name: '', tradeName: '', cnpj: '', phone: '', email: '',
  segment: '', type: 'revendedor' as ClientType, priority: 'media' as Priority,
  notes: '',
  // Endereço
  street: '', number: '', complement: '', neighborhood: '', city: '', state: 'SP', zipCode: '',
  // Receita Federal
  stateRegistration: '', foundedAt: '', companyType: '', cnae: '', companyStatus: '',
  // Responsável
  buyerName: '', buyerPhone: '', buyerWhatsapp: '', buyerEmail: '', buyerBirthday: '',
  // Empresa
  companyAnniversary: '',
  // Crédito
  creditLimit: '' as string | number,
  creditClassification: '' as string,
  creditNotes: '',
  // Comercial
  issuesInvoice: false,
  defaultPaymentMethod: '',
  defaultPaymentTerms: '',
}

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
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set())

  const handleCnpjFill = (data: CnpjData) => {
    setClientForm(p => ({
      ...p,
      name:          data.razaoSocial          || p.name,
      tradeName:     data.nomeFantasia         || p.tradeName,
      phone:         data.telefone             || p.phone,
      email:         data.email                || p.email,
      street:        data.logradouro           || p.street,
      number:        data.numero               || p.number,
      complement:    data.complemento          || p.complement,
      neighborhood:  data.bairro               || p.neighborhood,
      city:          data.municipio            || p.city,
      state:         data.uf                   || p.state,
      zipCode:       data.cep                  || p.zipCode,
      foundedAt:     data.dataInicioAtividade  || p.foundedAt,
      companyType:   data.naturezaJuridica     || p.companyType,
      cnae:          data.cnae                 || p.cnae,
      companyStatus: data.situacaoCadastral    || p.companyStatus,
    }))
    const filled = new Set<string>()
    if (data.razaoSocial)         filled.add('name')
    if (data.nomeFantasia)        filled.add('tradeName')
    if (data.telefone)            filled.add('phone')
    if (data.email)               filled.add('email')
    if (data.logradouro)          filled.add('street')
    if (data.numero)              filled.add('number')
    if (data.complemento)         filled.add('complement')
    if (data.bairro)              filled.add('neighborhood')
    if (data.municipio)           filled.add('city')
    if (data.uf)                  filled.add('state')
    if (data.cep)                 filled.add('zipCode')
    if (data.dataInicioAtividade) filled.add('foundedAt')
    if (data.naturezaJuridica)    filled.add('companyType')
    if (data.cnae)                filled.add('cnae')
    if (data.situacaoCadastral)   filled.add('companyStatus')
    setAutoFilledFields(filled)
  }

  const af = (field: string) => autoFilledFields.has(field)

  const handleCreateClient = async () => {
    // MELHORIA 5: Validações
    if (!clientForm.name.trim()) { setFormError('Razão Social é obrigatória'); return }
    if (!clientForm.phone.trim()) { setFormError('Telefone é obrigatório'); return }
    if (!clientForm.segment) { setFormError('Segmento é obrigatório'); return }
    if (!clientForm.city.trim()) { setFormError('Cidade é obrigatória'); return }
    if (!user) return
    const cnpjDigits = clientForm.cnpj.replace(/\D/g, '')
    if (cnpjDigits && allClients.some(c => (c.cnpj ?? '').replace(/\D/g, '') === cnpjDigits)) {
      setFormError('Já existe um cliente cadastrado com este CNPJ.'); return
    }
    setSaving(true); setFormError('')
    try {
      const client = await createClient({
        name: clientForm.name.trim(),
        tradeName: clientForm.tradeName.trim() || undefined,
        cnpj: cnpjDigits || undefined,
        stateRegistration: clientForm.stateRegistration.trim() || undefined,
        type: clientForm.type,
        repId: user.id,
        address: {
          street: clientForm.street.trim(),
          number: clientForm.number.trim() || undefined,
          complement: clientForm.complement.trim() || undefined,
          neighborhood: clientForm.neighborhood.trim() || undefined,
          city: clientForm.city.trim(),
          state: clientForm.state,
          zipCode: clientForm.zipCode.trim(),
          lat: 0, lng: 0,
        },
        phone: clientForm.phone.trim(),
        email: clientForm.email.trim() || undefined,
        status: 'ativo',
        approvalStatus: 'pendente',
        segment: clientForm.segment,
        priority: clientForm.priority,
        notes: clientForm.notes.trim() || undefined,
        foundedAt: clientForm.foundedAt || undefined,
        companyType: clientForm.companyType || undefined,
        cnae: clientForm.cnae || undefined,
        companyStatus: clientForm.companyStatus || undefined,
        buyerName: clientForm.buyerName.trim() || undefined,
        buyerPhone: clientForm.buyerPhone.trim() || undefined,
        buyerWhatsapp: clientForm.buyerWhatsapp.trim() || undefined,
        buyerEmail: clientForm.buyerEmail.trim() || undefined,
        buyerBirthday: clientForm.buyerBirthday || undefined,
        companyAnniversary: clientForm.companyAnniversary || undefined,
        creditLimit: clientForm.creditLimit ? Number(clientForm.creditLimit) : undefined,
        creditClassification: (clientForm.creditClassification as Client['creditClassification']) || undefined,
        creditNotes: clientForm.creditNotes.trim() || undefined,
        issuesInvoice: clientForm.issuesInvoice,
        defaultPaymentMethod: clientForm.defaultPaymentMethod || undefined,
        defaultPaymentTerms: clientForm.defaultPaymentTerms || undefined,
      } as unknown as Parameters<typeof createClient>[0])
      if (client) {
        await createInteraction({ clientId: client.id, clientName: client.name, repId: user.id, repName: user.name, type: 'anotacao', title: 'Cliente cadastrado', description: 'Novo cliente adicionado à carteira — aguardando aprovação', timestamp: new Date().toISOString() })
        await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'create_client', entity: 'Cliente', entityId: client.id, description: `Cadastrou cliente ${client.name} (aguardando aprovação)`, timestamp: new Date().toISOString() })
      }
      setShowNewClient(false); setClientForm(EMPTY_CLIENT); setAutoFilledFields(new Set()); refetch()
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Erro ao cadastrar cliente') }
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
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-slate-900 text-sm truncate">{client.name}</h3>
                              {client.approvalStatus !== 'aprovado' && <ClientApprovalBadge status={client.approvalStatus} />}
                            </div>
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

                {/* Dados da Empresa */}
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Dados da Empresa</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-slate-500 block mb-1">CNPJ / CPF</label>
                    <CnpjLookupField
                      value={clientForm.cnpj}
                      onChange={v => { setClientForm(p => ({ ...p, cnpj: v })); setAutoFilledFields(new Set()) }}
                      onFill={handleCnpjFill}
                      existingClients={allClients}
                      onNavigateToDuplicate={id => { setShowNewClient(false); navigate(`/clientes/${id}`) }}
                    />
                    {autoFilledFields.size > 0 && (
                      <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Preenchido automaticamente. Confira antes de salvar.
                      </p>
                    )}
                  </div>
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Razão Social *</label><input value={clientForm.name} onChange={e => setClientForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome da empresa" className={cn('input', af('name') && 'border-blue-400 bg-blue-50/40')} /></div>
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Nome Fantasia</label><input value={clientForm.tradeName} onChange={e => setClientForm(p => ({ ...p, tradeName: e.target.value }))} placeholder="Como é conhecido" className={cn('input', af('tradeName') && 'border-blue-400 bg-blue-50/40')} /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Telefone *</label><input value={clientForm.phone} onChange={e => setClientForm(p => ({ ...p, phone: e.target.value }))} placeholder="(00) 99999-0000" className={cn('input', af('phone') && 'border-blue-400 bg-blue-50/40')} /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Inscrição Estadual</label><input value={clientForm.stateRegistration} onChange={e => setClientForm(p => ({ ...p, stateRegistration: e.target.value }))} className="input" /></div>
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">E-mail</label><input value={clientForm.email} onChange={e => setClientForm(p => ({ ...p, email: e.target.value }))} type="email" placeholder="email@empresa.com" className={cn('input', af('email') && 'border-blue-400 bg-blue-50/40')} /></div>
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

                {/* Endereço */}
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Endereço</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">CEP</label><input value={clientForm.zipCode} onChange={e => setClientForm(p => ({ ...p, zipCode: e.target.value }))} placeholder="00000-000" className={cn('input', af('zipCode') && 'border-blue-400 bg-blue-50/40')} /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Cidade *</label><input value={clientForm.city} onChange={e => setClientForm(p => ({ ...p, city: e.target.value }))} placeholder="São Paulo" className={cn('input', af('city') && 'border-blue-400 bg-blue-50/40')} /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">UF</label>
                    <select value={clientForm.state} onChange={e => setClientForm(p => ({ ...p, state: e.target.value }))} className={cn('input', af('state') && 'border-blue-400 bg-blue-50/40')}>
                      {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Logradouro</label><input value={clientForm.street} onChange={e => setClientForm(p => ({ ...p, street: e.target.value }))} placeholder="Rua / Av. / Rod." className={cn('input', af('street') && 'border-blue-400 bg-blue-50/40')} /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Número</label><input value={clientForm.number} onChange={e => setClientForm(p => ({ ...p, number: e.target.value }))} placeholder="100" className={cn('input', af('number') && 'border-blue-400 bg-blue-50/40')} /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Bairro</label><input value={clientForm.neighborhood} onChange={e => setClientForm(p => ({ ...p, neighborhood: e.target.value }))} placeholder="Centro" className={cn('input', af('neighborhood') && 'border-blue-400 bg-blue-50/40')} /></div>
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Complemento</label><input value={clientForm.complement} onChange={e => setClientForm(p => ({ ...p, complement: e.target.value }))} placeholder="Sala 1, Galpão B..." className={cn('input', af('complement') && 'border-blue-400 bg-blue-50/40')} /></div>
                </div>

                {/* Responsável */}
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Responsável</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Nome do Comprador</label><input value={clientForm.buyerName} onChange={e => setClientForm(p => ({ ...p, buyerName: e.target.value }))} placeholder="Nome do responsável" className="input" /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Telefone</label><input value={clientForm.buyerPhone} onChange={e => setClientForm(p => ({ ...p, buyerPhone: e.target.value }))} placeholder="(00) 99999-0000" className="input" /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">WhatsApp</label><input value={clientForm.buyerWhatsapp} onChange={e => setClientForm(p => ({ ...p, buyerWhatsapp: e.target.value }))} placeholder="(00) 99999-0000" className="input" /></div>
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">E-mail</label><input value={clientForm.buyerEmail} onChange={e => setClientForm(p => ({ ...p, buyerEmail: e.target.value }))} type="email" placeholder="email@responsavel.com" className="input" /></div>
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Aniversário</label><input value={clientForm.buyerBirthday} onChange={e => setClientForm(p => ({ ...p, buyerBirthday: e.target.value }))} type="date" className="input" /></div>
                </div>

                {/* Empresa */}
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Empresa</p>
                <div><label className="text-xs font-semibold text-slate-500 block mb-1">Data Aniversário Empresa</label><input value={clientForm.companyAnniversary} onChange={e => setClientForm(p => ({ ...p, companyAnniversary: e.target.value }))} type="date" className="input" /></div>

                {/* Crédito */}
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Crédito</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Limite de Crédito</label><input value={clientForm.creditLimit as string} onChange={e => setClientForm(p => ({ ...p, creditLimit: e.target.value }))} type="number" placeholder="0,00" className="input" /></div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Classificação</label>
                    <select value={clientForm.creditClassification} onChange={e => setClientForm(p => ({ ...p, creditClassification: e.target.value }))} className="input">
                      <option value="">Selecione...</option>
                      {CREDIT_CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Observações de Crédito</label><textarea value={clientForm.creditNotes} onChange={e => setClientForm(p => ({ ...p, creditNotes: e.target.value }))} rows={2} placeholder="Observações sobre crédito..." className="input resize-none" /></div>
                </div>

                {/* Comercial */}
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Comercial</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                    <label className="text-sm font-medium text-slate-700">Emite Nota Fiscal?</label>
                    <button onClick={() => setClientForm(p => ({ ...p, issuesInvoice: !p.issuesInvoice }))}
                      className={cn('w-11 h-6 rounded-full transition-colors relative', clientForm.issuesInvoice ? 'bg-primary-600' : 'bg-slate-300')}>
                      <span className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', clientForm.issuesInvoice ? 'translate-x-5.5' : 'translate-x-0.5')} />
                    </button>
                  </div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Forma de Pagamento</label>
                    <select value={clientForm.defaultPaymentMethod} onChange={e => setClientForm(p => ({ ...p, defaultPaymentMethod: e.target.value }))} className="input">
                      <option value="">Selecione...</option>
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs font-semibold text-slate-500 block mb-1">Prazo de Pagamento</label>
                    <select value={clientForm.defaultPaymentTerms} onChange={e => setClientForm(p => ({ ...p, defaultPaymentTerms: e.target.value }))} className="input">
                      <option value="">Selecione...</option>
                      {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 block mb-1">Observações Gerais</label><textarea value={clientForm.notes} onChange={e => setClientForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Informações adicionais..." className="input resize-none" /></div>
                </div>

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
