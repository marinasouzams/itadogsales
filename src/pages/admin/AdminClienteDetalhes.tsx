import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, MapPin, Phone, MessageCircle, Package,
  ShoppingCart, TrendingUp, Calendar, User, Star,
  Edit2, Save, X, CreditCard, Cake, Building2,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useClient, useOrders, useInteractions, useUser } from '@/hooks/useData'
import { updateClient } from '@/services/db'
import { LoadingSpinner, ErrorState } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate, daysSince, cn } from '@/utils'
import { PriorityBadge, OrderStatusBadge } from '@/components/shared/StatusBadge'
import type { Client } from '@/types'

const INTERACTION_ICONS: Record<string, string> = {
  checkin: '📍', checkout: '✅', pedido: '🛒', rota: '🗺️',
  ligacao: '📞', whatsapp: '💬', visita: '🏠',
}

const TABS = ['Resumo', 'Responsável', 'Crédito', 'Pedidos', 'Interações'] as const
type Tab = typeof TABS[number]

const CREDIT_OPTS = ['A+', 'A', 'B', 'C', 'D', 'Bloqueado'] as const
const CREDIT_COLORS: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-800',
  'A':  'bg-green-100 text-green-800',
  'B':  'bg-blue-100 text-blue-800',
  'C':  'bg-yellow-100 text-yellow-800',
  'D':  'bg-orange-100 text-orange-800',
  'Bloqueado': 'bg-red-100 text-red-800',
}
const PAYMENT_METHODS = ['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão']
const PAYMENT_TERMS   = ['À vista', '7 dias', '14 dias', '21 dias', '28 dias', '35 dias', '42 dias', 'Personalizado']

export default function AdminClienteDetalhes() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Resumo')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  const { data: client, loading, error, refetch } = useClient(id)
  const { data: rep }       = useUser(client?.repId)
  const { data: allOrders = [] } = useOrders()
  const { data: interactions = [] } = useInteractions(id)

  // ── form state para edição ──────────────────────────────────────
  const [form, setForm] = useState<Partial<Client & {
    buyerName: string; buyerPhone: string; buyerWhatsapp: string
    buyerEmail: string; buyerBirthday: string; companyAnniversary: string
    creditLimit: number; creditClassification: string; creditNotes: string
    issuesInvoice: boolean; defaultPaymentMethod: string; defaultPaymentTerms: string
  }>>({})

  function openEdit() {
    const c = client as unknown as Record<string, unknown>
    setForm({
      buyerName:            (c.buyerName as string)            ?? '',
      buyerPhone:           (c.buyerPhone as string)           ?? '',
      buyerWhatsapp:        (c.buyerWhatsapp as string)        ?? '',
      buyerEmail:           (c.buyerEmail as string)           ?? '',
      buyerBirthday:        (c.buyerBirthday as string)        ?? '',
      companyAnniversary:   (c.companyAnniversary as string)   ?? '',
      creditLimit:          (c.creditLimit as number)          ?? 0,
      creditClassification: (c.creditClassification as 'A+' | 'A' | 'B' | 'C' | 'D' | 'Bloqueado') ?? 'A',
      creditNotes:          (c.creditNotes as string)          ?? '',
      issuesInvoice:        (c.issuesInvoice as boolean)       ?? true,
      defaultPaymentMethod: (c.defaultPaymentMethod as string) ?? '',
      defaultPaymentTerms:  (c.defaultPaymentTerms as string)  ?? '',
    })
    setShowEdit(true)
  }

  async function handleSave() {
    if (!id) return
    setSaving(true)
    await updateClient(id, form as Partial<Client>)
    await refetch()
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); setShowEdit(false) }, 1200)
  }

  // ── derivados ───────────────────────────────────────────────────
  const clientOrders = allOrders.filter(o => o.clientId === id)
  const filteredOrders = useMemo(() => clientOrders.filter(o => {
    const matchFrom = !dateFrom || o.createdAt.slice(0, 10) >= dateFrom
    const matchTo   = !dateTo   || o.createdAt.slice(0, 10) <= dateTo
    return matchFrom && matchTo
  }), [clientOrders, dateFrom, dateTo])

  const totalRevenue = filteredOrders.reduce((s, o) => s + o.total, 0)
  const avgTicket    = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0

  if (loading) return <AdminLayout title="Cliente"><div className="p-6"><LoadingSpinner /></div></AdminLayout>
  if (error || !client) return (
    <AdminLayout title="Cliente">
      <div className="p-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm mb-4">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <ErrorState message="Cliente não encontrado" />
      </div>
    </AdminLayout>
  )

  const c = client as unknown as Record<string, unknown>
  const waLink = `https://wa.me/55${client.phone.replace(/\D/g, '')}`

  return (
    <AdminLayout title={client.name}>
      <div className="p-6 space-y-5 max-w-4xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>

        {/* Header card */}
        <div className="card p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <PriorityBadge priority={client.priority} />
                <span className="text-xs text-slate-400">{client.type}</span>
              </div>
              <h1 className="text-xl font-bold text-slate-900">{client.name}</h1>
              <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5" />
                {client.address.city}, {client.address.state}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={openEdit}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-50 text-primary-700 text-xs font-semibold hover:bg-primary-100 transition-colors">
                <Edit2 className="w-3.5 h-3.5" /> Editar
              </button>
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
                style={{ backgroundColor: '#25D36615', color: '#25D366' }}>
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
              <a href={`tel:${client.phone}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-medium">
                <Phone className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400">Representante</p>
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                {rep?.name.split(' ')[0] ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Última visita</p>
              <p className={cn('text-sm font-semibold mt-0.5', client.lastVisit && daysSince(client.lastVisit) > 30 ? 'text-red-600' : 'text-slate-800')}>
                {client.lastVisit ? `${daysSince(client.lastVisit)}d atrás` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Último pedido</p>
              <p className={cn('text-sm font-semibold mt-0.5', client.lastOrder && daysSince(client.lastOrder) > 60 ? 'text-amber-600' : 'text-slate-800')}>
                {client.lastOrder ? `${daysSince(client.lastOrder)}d atrás` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Crédito</p>
              {c.creditClassification ? (
                <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full mt-0.5 inline-block', CREDIT_COLORS[c.creditClassification as string] ?? 'bg-slate-100 text-slate-700')}>
                  {c.creditClassification as string}
                </span>
              ) : (
                <p className="text-sm text-slate-400 mt-0.5">—</p>
              )}
            </div>
          </div>
        </div>

        {/* Revenue summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <TrendingUp className="w-5 h-5 text-primary-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-900">{formatCurrency(totalRevenue)}</p>
            <p className="text-xs text-slate-400">Receita (período)</p>
          </div>
          <div className="card p-4 text-center">
            <ShoppingCart className="w-5 h-5 text-green-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-900">{filteredOrders.length}</p>
            <p className="text-xs text-slate-400">Pedidos</p>
          </div>
          <div className="card p-4 text-center">
            <Package className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-900">{formatCurrency(avgTicket)}</p>
            <p className="text-xs text-slate-400">Ticket médio</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('flex-shrink-0 flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}>
              {t}
            </button>
          ))}
        </div>

        {/* Period filter */}
        {tab === 'Pedidos' && (
          <div className="flex gap-2">
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

        {/* ── Tab: Resumo ── */}
        {tab === 'Resumo' && (
          <div className="space-y-4">
            <div className="card p-4 space-y-3">
              <h3 className="font-semibold text-slate-900 text-sm">Dados de Contato</h3>
              <div className="space-y-2 text-sm">
                {[
                  { label: 'Telefone', value: client.phone },
                  { label: 'Email', value: client.email },
                  { label: 'CNPJ / CPF', value: client.cnpj ?? client.cpf },
                  { label: 'Endereço', value: `${client.address.street}, ${client.address.city} — ${client.address.state}` },
                  { label: 'Segmento', value: client.segment },
                  { label: 'Emite NF', value: c.issuesInvoice !== undefined ? (c.issuesInvoice ? 'Sim' : 'Não') : undefined },
                  { label: 'Pagamento padrão', value: c.defaultPaymentMethod as string },
                  { label: 'Prazo padrão', value: c.defaultPaymentTerms as string },
                ].filter(f => f.value).map(f => (
                  <div key={f.label} className="flex justify-between gap-4">
                    <span className="text-slate-400 flex-shrink-0">{f.label}</span>
                    <span className="font-medium text-slate-800 text-right">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
            {client.notes && (
              <div className="card p-4">
                <h3 className="font-semibold text-slate-900 text-sm mb-2">Observações</h3>
                <p className="text-sm text-slate-600">{client.notes}</p>
              </div>
            )}
            <div className="card p-4 border-dashed border-2 border-slate-200 flex items-center justify-between">
              <p className="text-sm text-slate-500">Preencha responsável, crédito e financeiro nas abas acima</p>
              <button onClick={openEdit} className="btn-secondary text-xs py-1.5 px-3">
                <Edit2 className="w-3 h-3 mr-1 inline" /> Editar
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: Responsável ── */}
        {tab === 'Responsável' && (
          <div className="space-y-3">
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                  <User className="w-4 h-4 text-primary-600" /> Responsável pela Compra
                </h3>
                <button onClick={openEdit} className="flex items-center gap-1 text-xs text-primary-600 font-semibold">
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </button>
              </div>
              {!c.buyerName && !c.buyerPhone && !c.buyerEmail ? (
                <div className="text-center py-6">
                  <p className="text-slate-400 text-sm mb-3">Nenhum responsável cadastrado</p>
                  <button onClick={openEdit} className="btn-primary text-sm py-2">
                    + Adicionar responsável
                  </button>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  {[
                    { label: 'Nome', value: c.buyerName as string },
                    { label: 'Telefone', value: c.buyerPhone as string },
                    { label: 'WhatsApp', value: c.buyerWhatsapp as string },
                    { label: 'E-mail', value: c.buyerEmail as string },
                    { label: 'Aniversário', value: c.buyerBirthday ? new Date((c.buyerBirthday as string) + 'T12:00:00').toLocaleDateString('pt-BR') : undefined },
                  ].filter(f => f.value).map(f => (
                    <div key={f.label} className="flex justify-between gap-4">
                      <span className="text-slate-400 flex-shrink-0">{f.label}</span>
                      <span className="font-medium text-slate-800 text-right">{f.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-500" /> Aniversário da Empresa
                </h3>
                <button onClick={openEdit} className="flex items-center gap-1 text-xs text-primary-600 font-semibold">
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </button>
              </div>
              {c.companyAnniversary ? (
                <p className="text-sm font-medium text-slate-800">
                  {new Date((c.companyAnniversary as string) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                </p>
              ) : (
                <div className="text-center py-4">
                  <p className="text-slate-400 text-sm mb-2">Não cadastrado</p>
                  <button onClick={openEdit} className="text-primary-600 text-sm font-semibold">+ Adicionar data</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Crédito ── */}
        {tab === 'Crédito' && (
          <div className="space-y-3">
            <div className="card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary-600" /> Classificação de Crédito
                </h3>
                <button onClick={openEdit} className="flex items-center gap-1 text-xs text-primary-600 font-semibold">
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </button>
              </div>

              {!c.creditClassification ? (
                <div className="text-center py-6">
                  <p className="text-slate-400 text-sm mb-3">Crédito não avaliado</p>
                  <button onClick={openEdit} className="btn-primary text-sm py-2">+ Classificar crédito</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={cn('text-lg font-black px-4 py-2 rounded-xl', CREDIT_COLORS[c.creditClassification as string] ?? 'bg-slate-100 text-slate-700')}>
                      {c.creditClassification as string}
                    </span>
                    <div>
                      <p className="text-xs text-slate-400">Limite aprovado</p>
                      <p className="text-base font-bold text-slate-900">{formatCurrency((c.creditLimit as number) ?? 0)}</p>
                    </div>
                  </div>
                  {!!c.creditNotes && (
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-500 font-semibold mb-1">Observação financeira</p>
                      <p className="text-sm text-slate-700">{String(c.creditNotes)}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Pedidos ── */}
        {tab === 'Pedidos' && (
          <div className="space-y-3">
            {filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Nenhum pedido no período</div>
            ) : filteredOrders.map((order, i) => (
              <motion.div key={order.id} className="card p-4"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs text-slate-400 font-mono">{order.number}</p>
                    <p className="text-xs text-slate-400">{formatDate(order.createdAt)}</p>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>
                <div className="flex justify-between items-end pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-400">{order.items.length} produto(s)</span>
                  <span className="text-base font-bold text-slate-900">{formatCurrency(order.total)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* ── Tab: Interações ── */}
        {tab === 'Interações' && (
          <div className="space-y-3">
            {interactions.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Nenhuma interação registrada</div>
            ) : interactions.map((int, i) => (
              <motion.div key={int.id} className="card p-4 flex gap-3"
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <span className="text-xl flex-shrink-0 mt-0.5">{INTERACTION_ICONS[int.type] ?? '📋'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{int.title}</p>
                    {int.rating && (
                      <div className="flex gap-0.5 flex-shrink-0">
                        {Array.from({ length: int.rating }).map((_, j) => (
                          <Star key={j} className="w-3 h-3 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                    )}
                  </div>
                  {int.description && <p className="text-xs text-slate-400 mt-0.5">{int.description}</p>}
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(int.timestamp)}</span>
                    <span>·</span>
                    <span>{int.repName}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ── BOTTOM SHEET: EDITAR CLIENTE ── */}
      <AnimatePresence>
        {showEdit && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowEdit(false)} />
            <motion.div
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-h-[90vh] flex flex-col"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}>

              {/* Header */}
              <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <div className="w-10 h-1 bg-slate-200 rounded-full absolute top-3 left-1/2 -translate-x-1/2" />
                <p className="font-bold text-slate-900 mt-2">Editar Cliente</p>
                <button onClick={() => setShowEdit(false)}>
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* Form */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

                {/* Responsável pela Compra */}
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Responsável pela Compra
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Nome do responsável</label>
                      <input className="input" placeholder="Ex: João da Silva"
                        value={form.buyerName ?? ''}
                        onChange={e => setForm(f => ({ ...f, buyerName: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Telefone direto</label>
                      <input className="input" placeholder="(11) 99999-9999"
                        value={form.buyerPhone ?? ''}
                        onChange={e => setForm(f => ({ ...f, buyerPhone: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">WhatsApp</label>
                      <input className="input" placeholder="(11) 99999-9999"
                        value={form.buyerWhatsapp ?? ''}
                        onChange={e => setForm(f => ({ ...f, buyerWhatsapp: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">E-mail do responsável</label>
                      <input className="input" type="email" placeholder="responsavel@empresa.com"
                        value={form.buyerEmail ?? ''}
                        onChange={e => setForm(f => ({ ...f, buyerEmail: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block flex items-center gap-1">
                        <Cake className="w-3 h-3" /> Aniversário do responsável
                      </label>
                      <input className="input" type="date"
                        value={form.buyerBirthday ?? ''}
                        onChange={e => setForm(f => ({ ...f, buyerBirthday: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* Aniversário da Empresa */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" /> Empresa
                  </p>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Aniversário da empresa</label>
                    <input className="input" type="date"
                      value={form.companyAnniversary ?? ''}
                      onChange={e => setForm(f => ({ ...f, companyAnniversary: e.target.value }))} />
                  </div>
                </div>

                {/* Crédito */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" /> Crédito
                  </p>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-2 block">Classificação</label>
                    <div className="flex flex-wrap gap-2">
                      {CREDIT_OPTS.map(opt => (
                        <button key={opt} type="button"
                          onClick={() => setForm(f => ({ ...f, creditClassification: opt }))}
                          className={cn('px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all',
                            form.creditClassification === opt
                              ? cn(CREDIT_COLORS[opt], 'border-current')
                              : 'border-slate-200 text-slate-600 bg-white')}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Limite de crédito (R$)</label>
                    <input className="input" type="number" min={0} step={500} placeholder="0"
                      value={form.creditLimit ?? ''}
                      onChange={e => setForm(f => ({ ...f, creditLimit: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">Observação financeira</label>
                    <textarea className="input resize-none" rows={2} placeholder="Ex: Cliente inadimplente em 2023, regularizado."
                      value={form.creditNotes ?? ''}
                      onChange={e => setForm(f => ({ ...f, creditNotes: e.target.value }))} />
                  </div>
                </div>

                {/* Faturamento */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Faturamento</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">Emite Nota Fiscal?</p>
                    </div>
                    <div className="flex gap-2">
                      {[true, false].map(v => (
                        <button key={String(v)} type="button"
                          onClick={() => setForm(f => ({ ...f, issuesInvoice: v }))}
                          className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all',
                            form.issuesInvoice === v ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 text-slate-600')}>
                          {v ? 'Sim' : 'Não'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-2 block">Forma de pagamento padrão</label>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_METHODS.map(m => (
                        <button key={m} type="button"
                          onClick={() => setForm(f => ({ ...f, defaultPaymentMethod: m }))}
                          className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all',
                            form.defaultPaymentMethod === m ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 text-slate-600 bg-white')}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-2 block">Prazo padrão</label>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_TERMS.map(t => (
                        <button key={t} type="button"
                          onClick={() => setForm(f => ({ ...f, defaultPaymentTerms: t }))}
                          className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all',
                            form.defaultPaymentTerms === t ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 text-slate-600 bg-white')}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="h-4" />
              </div>

              {/* Footer */}
              <div className="px-5 pb-6 pt-3 border-t border-slate-100 flex-shrink-0">
                <button onClick={handleSave} disabled={saving}
                  className={cn('w-full btn-primary py-3.5 text-base flex items-center justify-center gap-2',
                    saved && 'bg-green-600')}>
                  {saved ? '✓ Salvo!' : saving ? 'Salvando...' : <><Save className="w-4 h-4" /> Salvar alterações</>}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
