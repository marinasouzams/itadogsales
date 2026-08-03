import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, MapPin, Phone, MessageCircle, Package,
  ShoppingCart, TrendingUp, Calendar, User, Star,
  Edit2, Save, X, CreditCard, Building2, DollarSign,
  Check, ShieldAlert, Undo2, Ban,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useClient, useOrders, useInteractions, useUser } from '@/hooks/useData'
import { updateClient, reviewClient, logAudit } from '@/services/db'
import { supabase } from '@/lib/supabase'
import CnpjLookupField from '@/components/shared/CnpjLookupField'
import { useClients } from '@/hooks/useData'
import type { CnpjData } from '@/services/cnpj'
import { LoadingSpinner, ErrorState } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate, daysSince, cn } from '@/utils'
import { PriorityBadge, OrderStatusBadge, ClientApprovalBadge } from '@/components/shared/StatusBadge'
import type { Client, ClientApprovalStatus } from '@/types'

// ── constantes ────────────────────────────────────────────────
const INTERACTION_ICONS: Record<string, string> = {
  checkin: '📍', checkout: '✅', pedido: '🛒', rota: '🗺️',
  ligacao: '📞', whatsapp: '💬', visita: '🏠',
}
const TABS = ['Resumo', 'Pedidos', 'Interações'] as const
type Tab = typeof TABS[number]

const CREDIT_OPTS = ['A+', 'A', 'B', 'C', 'D', 'Bloqueado'] as const
const CREDIT_COLORS: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'A':  'bg-green-100 text-green-800 border-green-200',
  'B':  'bg-blue-100 text-blue-800 border-blue-200',
  'C':  'bg-yellow-100 text-yellow-800 border-yellow-200',
  'D':  'bg-orange-100 text-orange-800 border-orange-200',
  'Bloqueado': 'bg-red-100 text-red-800 border-red-200',
}
const PAYMENT_METHODS = ['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão']
const PAYMENT_TERMS   = ['À vista', '7 dias', '14 dias', '21 dias', '28 dias', '35 dias', '42 dias', 'Personalizado']

// ── helper de campo ──
function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-slate-400 text-sm flex-shrink-0">{label}</span>
      <span className="font-medium text-slate-800 text-sm text-right">{value}</span>
    </div>
  )
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
        {icon}
      </div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</p>
    </div>
  )
}

// ── componente principal ──────────────────────────────────────
export default function AdminClienteDetalhes() {
  const { user } = useAuth()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab]       = useState<Tab>('Resumo')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  // ── aprovação de cadastro ──
  const [reviewModal, setReviewModal] = useState<'devolvido' | 'reprovado' | null>(null)
  const [reviewReason, setReviewReason] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [showDecisionPanel, setShowDecisionPanel] = useState(false)

  const [receivables, setReceivables] = useState<Array<{
    status: string; amount: number; remaining_amount: number; paid_amount: number; due_date: string
  }>>([])

  useEffect(() => {
    if (!id) return
    supabase?.from('financial_receivables')
      .select('status, amount, remaining_amount, paid_amount, due_date')
      .eq('client_id', id)
      .then(({ data }) => setReceivables(data ?? []))
  }, [id])

  const { data: client, loading, error, refetch } = useClient(id)
  const { data: rep }             = useUser(client?.repId)
  const { data: allOrders = [] }  = useOrders()
  const { data: interactions = [] } = useInteractions(id)
  const { data: allClients = [] } = useClients()
  // ── estado do formulário de edição ──
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [originalForm, setOriginalForm] = useState<Record<string, unknown>>({})
  const [cnpjAutoFilled, setCnpjAutoFilled] = useState<Set<string>>(new Set())
  const [saveError, setSaveError] = useState('')

  function openEdit() {
    if (!client) return
    const c = client as unknown as Record<string, unknown>
    const snapshot = {
      // Dados da Empresa
      name:               c.name            ?? '',
      tradeName:          c.tradeName       ?? '',
      cnpj:               c.cnpj            ?? '',
      phone:              c.phone           ?? '',
      email:              c.email           ?? '',
      segment:            c.segment         ?? '',
      notes:              c.notes           ?? '',
      // Endereço
      city:          (c.address as unknown as Record<string,unknown>)?.city         ?? '',
      state:         (c.address as unknown as Record<string,unknown>)?.state        ?? '',
      zipCode:       (c.address as unknown as Record<string,unknown>)?.zipCode      ?? '',
      street:        (c.address as unknown as Record<string,unknown>)?.street       ?? '',
      number:        (c.address as unknown as Record<string,unknown>)?.number       ?? '',
      complement:    (c.address as unknown as Record<string,unknown>)?.complement   ?? '',
      neighborhood:  (c.address as unknown as Record<string,unknown>)?.neighborhood ?? '',
      // Receita Federal
      stateRegistration: c.stateRegistration ?? '',
      foundedAt:         c.foundedAt         ?? '',
      companyType:       c.companyType        ?? '',
      cnae:              c.cnae               ?? '',
      companyStatus:     c.companyStatus      ?? '',
      // Responsável
      buyerName:          c.buyerName          ?? '',
      buyerPhone:         c.buyerPhone         ?? '',
      buyerWhatsapp:      c.buyerWhatsapp      ?? '',
      buyerEmail:         c.buyerEmail         ?? '',
      buyerBirthday:      c.buyerBirthday      ?? '',
      // Comercial
      issuesInvoice:      c.issuesInvoice      ?? true,
      defaultPaymentMethod: c.defaultPaymentMethod ?? '',
      defaultPaymentTerms:  c.defaultPaymentTerms  ?? '',
      // Crédito
      creditClassification: c.creditClassification ?? '',
      creditLimit:          c.creditLimit          ?? 0,
      creditNotes:          c.creditNotes          ?? '',
      // Relacionamento
      companyAnniversary:   c.companyAnniversary   ?? '',
    }
    setForm(snapshot)
    setOriginalForm(snapshot)
    setShowEdit(true)
    setCnpjAutoFilled(new Set())
    setSaveError('')
  }

  const FIELD_LABELS: Record<string, string> = {
    name: 'Razão Social', tradeName: 'Nome Fantasia', cnpj: 'CNPJ', phone: 'Telefone', email: 'E-mail',
    segment: 'Segmento', notes: 'Observações',
    city: 'Cidade', state: 'Estado', zipCode: 'CEP', street: 'Logradouro', number: 'Número',
    complement: 'Complemento', neighborhood: 'Bairro',
    stateRegistration: 'Inscrição Estadual', foundedAt: 'Data de Abertura', companyType: 'Natureza Jurídica',
    cnae: 'CNAE', companyStatus: 'Situação Cadastral',
    buyerName: 'Responsável', buyerPhone: 'Telefone do responsável', buyerWhatsapp: 'WhatsApp do responsável',
    buyerEmail: 'E-mail do responsável', buyerBirthday: 'Aniversário do responsável',
    issuesInvoice: 'Emite NF', defaultPaymentMethod: 'Forma de pagamento', defaultPaymentTerms: 'Prazo de pagamento',
    creditClassification: 'Classificação de crédito', creditLimit: 'Limite de crédito', creditNotes: 'Observação financeira',
    companyAnniversary: 'Aniversário da empresa',
  }

  /** Compara o formulário antes/depois e monta uma descrição legível das mudanças p/ auditoria. */
  function describeChanges(before: Record<string, unknown>, after: Record<string, unknown>): string {
    const diffs: string[] = []
    for (const key of Object.keys(FIELD_LABELS)) {
      const a = before[key] ?? ''
      const b = after[key] ?? ''
      if (String(a) !== String(b)) {
        diffs.push(`${FIELD_LABELS[key]}: "${a || '—'}" → "${b || '—'}"`)
      }
    }
    return diffs.join('; ')
  }

  function handleCnpjFill(data: CnpjData) {
    setForm(f => ({
      ...f,
      name:          data.razaoSocial          || f.name,
      tradeName:     data.nomeFantasia         || f.tradeName,
      phone:         data.telefone             || f.phone,
      email:         data.email                || f.email,
      street:        data.logradouro           || f.street,
      number:        data.numero               || f.number,
      complement:    data.complemento          || f.complement,
      neighborhood:  data.bairro               || f.neighborhood,
      city:          data.municipio            || f.city,
      state:         data.uf                   || f.state,
      zipCode:       data.cep                  || f.zipCode,
      foundedAt:     data.dataInicioAtividade  || f.foundedAt,
      companyType:   data.naturezaJuridica     || f.companyType,
      cnae:          data.cnae                 || f.cnae,
      companyStatus: data.situacaoCadastral    || f.companyStatus,
    }))
    setCnpjAutoFilled(new Set(['name','tradeName','phone','email','street','number','complement',
      'neighborhood','city','state','zipCode','foundedAt','companyType','cnae','companyStatus']))
  }

  async function handleSave() {
    if (!id || !client || !user) return
    setSaving(true)
    setSaveError('')
    // Monta o update preservando o endereço atual
    const currentAddress = client.address as unknown as Record<string, unknown>
    const updates: Partial<Client> = {
      name:     (form.name as string)      || client.name,
      tradeName: (form.tradeName as string) || undefined,
      cnpj:      (form.cnpj as string)?.replace(/\D/g, '') || undefined,
      phone:     (form.phone as string)    || client.phone,
      email:     (form.email as string)    || undefined,
      segment:   (form.segment as string)  || client.segment,
      notes:     (form.notes as string)    || undefined,
      address: {
        ...currentAddress,
        street:       (form.street as string)       || currentAddress.street as string,
        number:       (form.number as string)       || undefined,
        complement:   (form.complement as string)   || undefined,
        neighborhood: (form.neighborhood as string) || undefined,
        city:         (form.city as string)         || currentAddress.city as string,
        state:        (form.state as string)        || currentAddress.state as string,
        zipCode:      (form.zipCode as string)      || currentAddress.zipCode as string,
        lat:          currentAddress.lat as number,
        lng:          currentAddress.lng as number,
      },
    } as Partial<Client>

    // Campos estendidos via cast
    const extended: Record<string, unknown> = {
      stateRegistration:    form.stateRegistration    || null,
      foundedAt:            form.foundedAt            || null,
      companyType:          form.companyType          || null,
      cnae:                 form.cnae                 || null,
      companyStatus:        form.companyStatus        || null,
      buyerName:            form.buyerName            || null,
      buyerPhone:           form.buyerPhone           || null,
      buyerWhatsapp:        form.buyerWhatsapp        || null,
      buyerEmail:           form.buyerEmail           || null,
      buyerBirthday:        form.buyerBirthday        || null,
      issuesInvoice:        form.issuesInvoice,
      defaultPaymentMethod: form.defaultPaymentMethod || null,
      defaultPaymentTerms:  form.defaultPaymentTerms  || null,
      creditClassification: form.creditClassification || null,
      creditLimit:          form.creditLimit ?? 0,
      creditNotes:          form.creditNotes || null,
      companyAnniversary:   form.companyAnniversary || null,
    }

    try {
      await updateClient(id, { ...updates, ...extended } as Partial<Client>)
      const changes = describeChanges(originalForm, form)
      await logAudit({
        userId: user.id, userName: user.name, userRole: user.role,
        action: 'update_client', entity: 'Cliente', entityId: id,
        description: changes ? `Editou cadastro de ${client.name}: ${changes}` : `Revisou cadastro de ${client.name} (sem alterações de campo)`,
        timestamp: new Date().toISOString(),
      })
      await refetch()
      setSaved(true)
      setTimeout(() => { setSaved(false); setShowEdit(false) }, 1200)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao salvar cadastro')
    } finally {
      setSaving(false)
    }
  }

  async function handleReview(decision: Exclude<ClientApprovalStatus, 'pendente'>, reason?: string) {
    if (!id || !client || !user) return
    setReviewSaving(true)
    try {
      await reviewClient(id, decision, reason, user.id)
      const actionMap = { aprovado: 'approve_client', devolvido: 'return_client', reprovado: 'reject_client' } as const
      const verbMap = { aprovado: 'Aprovou', devolvido: 'Devolveu para correção', reprovado: 'Reprovou' } as const
      await logAudit({
        userId: user.id, userName: user.name, userRole: user.role,
        action: actionMap[decision], entity: 'Cliente', entityId: id,
        description: `${verbMap[decision]} o cadastro de ${client.name}${reason ? ` — motivo: ${reason}` : ''}`,
        timestamp: new Date().toISOString(),
      })
      await refetch()
      setReviewModal(null)
      setReviewReason('')
      setShowDecisionPanel(false)
    } finally {
      setReviewSaving(false)
    }
  }

  // ── derivados ──
  const clientOrders = allOrders.filter(o => o.clientId === id)
  const filteredOrders = useMemo(() => clientOrders.filter(o => {
    const matchFrom = !dateFrom || o.createdAt.slice(0, 10) >= dateFrom
    const matchTo   = !dateTo   || o.createdAt.slice(0, 10) <= dateTo
    return matchFrom && matchTo
  }), [clientOrders, dateFrom, dateTo])

  const totalRevenue = filteredOrders.reduce((s, o) => s + o.total, 0)
  const avgTicket    = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0

  // ── guards ──
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

  const c   = client as unknown as Record<string, unknown>
  const waLink = `https://wa.me/55${client.phone.replace(/\D/g, '')}`
  const creditClass = c.creditClassification as string | undefined

  return (
    <AdminLayout title={client.name}>
      <div className="p-6 space-y-5 max-w-4xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>

        {/* ── HEADER CARD ── */}
        <div className="card p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <ClientApprovalBadge status={client.approvalStatus} />
                <PriorityBadge priority={client.priority} />
                <span className="text-xs text-slate-400">{client.type}</span>
                {creditClass && (
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full border', CREDIT_COLORS[creditClass] ?? 'bg-slate-100 text-slate-600 border-slate-200')}>
                    Crédito {creditClass}
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">{client.name}</h1>
              {client.tradeName && <p className="text-sm text-slate-500 mt-0.5">{client.tradeName}</p>}
              <p className="text-sm text-slate-400 flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                {client.address.city}, {client.address.state}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={openEdit}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-50 text-primary-700 text-xs font-semibold hover:bg-primary-100 transition-colors">
                <Edit2 className="w-3.5 h-3.5" /> Editar
              </button>
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
                style={{ backgroundColor: '#25D36615', color: '#25D366' }}>
                <MessageCircle className="w-3.5 h-3.5" />
              </a>
              <a href={`tel:${client.phone}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-medium">
                <Phone className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Representante</p>
              <p className="text-sm font-semibold text-slate-800">{rep?.name.split(' ')[0] ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Última visita</p>
              <p className={cn('text-sm font-semibold', client.lastVisit && daysSince(client.lastVisit) > 30 ? 'text-red-600' : 'text-slate-800')}>
                {client.lastVisit ? `${daysSince(client.lastVisit)}d atrás` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Último pedido</p>
              <p className={cn('text-sm font-semibold', client.lastOrder && daysSince(client.lastOrder) > 60 ? 'text-amber-600' : 'text-slate-800')}>
                {client.lastOrder ? `${daysSince(client.lastOrder)}d atrás` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Pagamento</p>
              <p className="text-sm font-semibold text-slate-800">
                {(c.defaultPaymentMethod as string) || (c.defaultPaymentTerms as string) || '—'}
              </p>
            </div>
          </div>
        </div>

        {/* ── PAINEL DE APROVAÇÃO DE CADASTRO ── */}
        {client.approvalStatus !== 'aprovado' ? (
          <div className="card p-5 border-amber-200 bg-amber-50/50">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-bold text-amber-800">
                {client.approvalStatus === 'pendente' ? 'Cadastro aguardando aprovação' : 'Cadastro precisa de nova decisão'}
              </p>
            </div>
            {(client.approvalStatus === 'devolvido' || client.approvalStatus === 'reprovado') && client.approvalReason && (
              <p className="text-xs text-slate-600 mb-3">
                Motivo da última decisão: <span className="font-medium">{client.approvalReason}</span>
              </p>
            )}
            <p className="text-xs text-slate-500 mb-3">
              Confira os dados abaixo, edite o que for necessário e registre a decisão. Só clientes aprovados podem realizar pedidos.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => handleReview('aprovado')} disabled={reviewSaving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors disabled:opacity-60">
                <Check className="w-3.5 h-3.5" /> Aprovar
              </button>
              <button onClick={() => { setReviewModal('devolvido'); setReviewReason('') }} disabled={reviewSaving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-100 text-orange-700 text-xs font-semibold hover:bg-orange-200 transition-colors disabled:opacity-60">
                <Undo2 className="w-3.5 h-3.5" /> Devolver para correção
              </button>
              <button onClick={() => { setReviewModal('reprovado'); setReviewReason('') }} disabled={reviewSaving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-60">
                <Ban className="w-3.5 h-3.5" /> Reprovar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-slate-400">
              {client.reviewedAt ? `Aprovado em ${formatDate(client.reviewedAt)}` : 'Cadastro aprovado'}
            </p>
            <button onClick={() => setShowDecisionPanel(v => !v)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
              {showDecisionPanel ? 'Ocultar decisão' : 'Alterar decisão'}
            </button>
          </div>
        )}
        {client.approvalStatus === 'aprovado' && showDecisionPanel && (
          <div className="card p-4 flex gap-2 flex-wrap">
            <button onClick={() => { setReviewModal('devolvido'); setReviewReason('') }} disabled={reviewSaving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-100 text-orange-700 text-xs font-semibold hover:bg-orange-200 transition-colors disabled:opacity-60">
              <Undo2 className="w-3.5 h-3.5" /> Devolver para correção
            </button>
            <button onClick={() => { setReviewModal('reprovado'); setReviewReason('') }} disabled={reviewSaving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-60">
              <Ban className="w-3.5 h-3.5" /> Reprovar
            </button>
          </div>
        )}

        {/* ── KPIs ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <TrendingUp className="w-5 h-5 text-primary-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-900">{formatCurrency(totalRevenue)}</p>
            <p className="text-xs text-slate-400">Receita</p>
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

        {/* ── ABAS ── */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}>
              {t}
            </button>
          ))}
        </div>

        {/* filtro de período (pedidos) */}
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

        {/* ══════════════════════════════════════════════════════
            ABA: RESUMO — todos os dados do cadastro numa tela
        ══════════════════════════════════════════════════════ */}
        {tab === 'Resumo' && (
          <div className="space-y-4">

            {/* Dados da Empresa */}
            <div className="card p-5">
              <SectionTitle icon={<Building2 className="w-3.5 h-3.5" />} label="Dados da Empresa" />
              <Field label="Razão Social"       value={client.name} />
              <Field label="Nome Fantasia"      value={client.tradeName} />
              <Field label="CNPJ"               value={client.cnpj} />
              <Field label="Inscrição Estadual" value={client.stateRegistration} />
              <Field label="Segmento"           value={client.segment} />
              <Field label="Telefone"           value={client.phone} />
              <Field label="E-mail"             value={client.email} />
              <Field label="CEP"                value={client.address.zipCode} />
              <Field label="Logradouro"         value={[client.address.street, (client.address as unknown as Record<string,string>).number].filter(Boolean).join(', ')} />
              {client.address.neighborhood && (
                <Field label="Bairro"            value={client.address.neighborhood} />
              )}
              {client.address.complement && (
                <Field label="Complemento"       value={client.address.complement} />
              )}
              <Field label="Cidade / UF"         value={`${client.address.city} — ${client.address.state}`} />
              {client.companyStatus && (
                <Field label="Situação"          value={client.companyStatus} />
              )}
              {client.foundedAt && (
                <Field label="Data de Abertura"  value={client.foundedAt} />
              )}
              {client.companyType && (
                <Field label="Natureza Jurídica" value={client.companyType} />
              )}
              {client.cnae && (
                <Field label="CNAE Principal"    value={client.cnae} />
              )}
              {client.notes && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-400 mb-1">Observações gerais</p>
                  <p className="text-sm text-slate-700">{client.notes}</p>
                </div>
              )}
            </div>

            {/* Responsável pela Compra */}
            <div className="card p-5">
              <SectionTitle icon={<User className="w-3.5 h-3.5" />} label="Responsável pela Compra" />
              {!c.buyerName && !c.buyerPhone && !c.buyerWhatsapp ? (
                <div className="flex items-center justify-between py-2">
                  <p className="text-sm text-slate-400">Não cadastrado</p>
                  <button onClick={openEdit} className="text-xs text-primary-600 font-semibold">+ Adicionar</button>
                </div>
              ) : (
                <>
                  <Field label="Nome"          value={c.buyerName as string} />
                  <Field label="Telefone"       value={c.buyerPhone as string} />
                  <Field label="WhatsApp"       value={c.buyerWhatsapp as string} />
                  <Field label="E-mail"         value={c.buyerEmail as string} />
                  <Field label="Aniversário"    value={c.buyerBirthday ? new Date((c.buyerBirthday as string) + 'T12:00:00').toLocaleDateString('pt-BR') : undefined} />
                </>
              )}
            </div>

            {/* Informações Comerciais */}
            <div className="card p-5">
              <SectionTitle icon={<CreditCard className="w-3.5 h-3.5" />} label="Informações Comerciais" />
              <Field label="Emite NF"          value={c.issuesInvoice !== undefined && c.issuesInvoice !== null ? (c.issuesInvoice ? 'Sim' : 'Não') : undefined} />
              <Field label="Forma de pagamento" value={c.defaultPaymentMethod as string} />
              <Field label="Prazo padrão"       value={c.defaultPaymentTerms as string} />
              {!c.defaultPaymentMethod && !c.defaultPaymentTerms && (
                <div className="flex items-center justify-between py-2">
                  <p className="text-sm text-slate-400">Não cadastrado</p>
                  <button onClick={openEdit} className="text-xs text-primary-600 font-semibold">+ Adicionar</button>
                </div>
              )}
            </div>

            {/* Crédito */}
            <div className="card p-5">
              <SectionTitle icon={<CreditCard className="w-3.5 h-3.5" />} label="Crédito" />
              {!creditClass ? (
                <div className="flex items-center justify-between py-2">
                  <p className="text-sm text-slate-400">Não avaliado</p>
                  <button onClick={openEdit} className="text-xs text-primary-600 font-semibold">+ Classificar</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={cn('text-base font-black px-3 py-1.5 rounded-xl border', CREDIT_COLORS[creditClass] ?? 'bg-slate-100 text-slate-600 border-slate-200')}>
                      {creditClass}
                    </span>
                    <div>
                      <p className="text-xs text-slate-400">Limite aprovado</p>
                      <p className="text-sm font-bold text-slate-900">{formatCurrency(Number(c.creditLimit) || 0)}</p>
                    </div>
                  </div>
                  {!!c.creditNotes && (
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-400 mb-1">Observação financeira</p>
                      <p className="text-sm text-slate-700">{String(c.creditNotes)}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Relacionamento */}
            <div className="card p-5">
              <SectionTitle icon={<Calendar className="w-3.5 h-3.5" />} label="Relacionamento" />
              <Field label="Aniversário da empresa"
                value={c.companyAnniversary ? new Date((c.companyAnniversary as string) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) : undefined} />
              {!c.companyAnniversary && (
                <div className="flex items-center justify-between py-2">
                  <p className="text-sm text-slate-400">Aniversário não cadastrado</p>
                  <button onClick={openEdit} className="text-xs text-primary-600 font-semibold">+ Adicionar</button>
                </div>
              )}
            </div>

            {/* Financeiro */}
            {(() => {
              const totalAberto = receivables.filter(r => ['aberto','parcial','vencido'].includes(r.status)).reduce((s, r) => s + r.remaining_amount, 0)
              const totalVencido = receivables.filter(r => r.status === 'vencido').reduce((s, r) => s + r.remaining_amount, 0)
              const totalPago = receivables.filter(r => r.status === 'pago').reduce((s, r) => s + r.paid_amount, 0)
              const totalTitulos = receivables.length
              return (
                <div className="card p-5">
                  <SectionTitle icon={<DollarSign className="w-3.5 h-3.5" />} label="Financeiro" />
                  {totalVencido > 0 && (
                    <div className="mb-3 inline-flex items-center gap-1.5 bg-red-100 text-red-700 text-xs font-bold px-3 py-1.5 rounded-full border border-red-200">
                      INADIMPLENTE
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-400 mb-0.5">Total em Aberto</p>
                      <p className="text-sm font-bold text-slate-900">{formatCurrency(totalAberto)}</p>
                    </div>
                    <div className={cn('rounded-xl p-3', totalVencido > 0 ? 'bg-red-50' : 'bg-slate-50')}>
                      <p className="text-xs text-slate-400 mb-0.5">Total Vencido</p>
                      <p className={cn('text-sm font-bold', totalVencido > 0 ? 'text-red-700' : 'text-slate-900')}>{formatCurrency(totalVencido)}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3">
                      <p className="text-xs text-slate-400 mb-0.5">Total Pago</p>
                      <p className="text-sm font-bold text-green-700">{formatCurrency(totalPago)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-400 mb-0.5">Títulos</p>
                      <p className="text-sm font-bold text-slate-900">{totalTitulos}</p>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── ABA: PEDIDOS ── */}
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

        {/* ── ABA: INTERAÇÕES ── */}
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

      {/* ══════════════════════════════════════════════════════════
          BOTTOM SHEET — EDITAR CLIENTE
          Todos os campos em uma única tela, organizado em seções
      ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showEdit && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowEdit(false)} />

            <motion.div
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-h-[93vh] flex flex-col"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}>

              {/* Cabeçalho */}
              <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex-shrink-0 relative">
                <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto absolute top-3 left-1/2 -translate-x-1/2" />
                <div className="flex items-center justify-between mt-2">
                  <p className="font-bold text-slate-900">Editar Cliente</p>
                  <button onClick={() => setShowEdit(false)}>
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Formulário completo */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

                {/* ── 1. Dados da Empresa ── */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                    <Building2 className="w-3.5 h-3.5" /> Dados da Empresa
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Razão Social *</label>
                      <input className="input" placeholder="Nome da empresa"
                        value={form.name as string ?? ''}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Nome Fantasia</label>
                        <input className="input" placeholder="Nome comercial"
                          value={form.tradeName as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, tradeName: e.target.value }))} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">CNPJ</label>
                        <CnpjLookupField
                          value={form.cnpj as string ?? ''}
                          onChange={v => setForm(f => ({ ...f, cnpj: v }))}
                          onFill={handleCnpjFill}
                          existingClients={allClients.filter(c => c.id !== id)}
                          onNavigateToDuplicate={dupId => navigate(`/admin/clientes/${dupId}`)}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Inscrição Estadual</label>
                        <input className="input" placeholder="000.000.000.000"
                          value={form.stateRegistration as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, stateRegistration: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Telefone Principal</label>
                        <input className="input" placeholder="(11) 99999-9999"
                          value={form.phone as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">E-mail</label>
                        <input className="input" type="email" placeholder="contato@empresa.com"
                          value={form.email as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Cidade</label>
                        <input className="input" placeholder="São Paulo"
                          value={form.city as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Estado</label>
                        <input className="input" placeholder="SP" maxLength={2}
                          value={form.state as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">CEP</label>
                        <input className={cn('input', cnpjAutoFilled.has('zipCode') && 'border-blue-400 bg-blue-50/40')} placeholder="00000-000"
                          value={form.zipCode as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, zipCode: e.target.value }))} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Logradouro</label>
                        <input className={cn('input', cnpjAutoFilled.has('street') && 'border-blue-400 bg-blue-50/40')} placeholder="Rua das Flores"
                          value={form.street as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, street: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Número</label>
                        <input className={cn('input', cnpjAutoFilled.has('number') && 'border-blue-400 bg-blue-50/40')} placeholder="123"
                          value={form.number as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, number: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Bairro</label>
                        <input className={cn('input', cnpjAutoFilled.has('neighborhood') && 'border-blue-400 bg-blue-50/40')} placeholder="Centro"
                          value={form.neighborhood as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Complemento</label>
                        <input className={cn('input', cnpjAutoFilled.has('complement') && 'border-blue-400 bg-blue-50/40')} placeholder="Sala 1..."
                          value={form.complement as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, complement: e.target.value }))} />
                      </div>
                    </div>

                    {/* Dados Receita Federal */}
                    <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Situação Cadastral</label>
                        <input className={cn('input', cnpjAutoFilled.has('companyStatus') && 'border-blue-400 bg-blue-50/40')}
                          value={form.companyStatus as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, companyStatus: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Data de Abertura</label>
                        <input className={cn('input', cnpjAutoFilled.has('foundedAt') && 'border-blue-400 bg-blue-50/40')}
                          value={form.foundedAt as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, foundedAt: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">Natureza Jurídica</label>
                        <input className={cn('input', cnpjAutoFilled.has('companyType') && 'border-blue-400 bg-blue-50/40')}
                          value={form.companyType as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, companyType: e.target.value }))} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-slate-500 mb-1 block">CNAE Principal</label>
                        <input className={cn('input', cnpjAutoFilled.has('cnae') && 'border-blue-400 bg-blue-50/40')}
                          value={form.cnae as string ?? ''}
                          onChange={e => setForm(f => ({ ...f, cnae: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Observações gerais</label>
                      <textarea className="input resize-none" rows={2}
                        value={form.notes as string ?? ''}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* ── 2. Responsável pela Compra ── */}
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                    <User className="w-3.5 h-3.5" /> Responsável pela Compra
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Nome do responsável</label>
                      <input className="input" placeholder="Ex: João da Silva"
                        value={form.buyerName as string ?? ''}
                        onChange={e => setForm(f => ({ ...f, buyerName: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Telefone direto</label>
                      <input className="input" placeholder="(11) 99999-9999"
                        value={form.buyerPhone as string ?? ''}
                        onChange={e => setForm(f => ({ ...f, buyerPhone: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">WhatsApp direto</label>
                      <input className="input" placeholder="(11) 99999-9999"
                        value={form.buyerWhatsapp as string ?? ''}
                        onChange={e => setForm(f => ({ ...f, buyerWhatsapp: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">E-mail direto</label>
                      <input className="input" type="email"
                        value={form.buyerEmail as string ?? ''}
                        onChange={e => setForm(f => ({ ...f, buyerEmail: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">🎂 Data de nascimento</label>
                      <input className="input" type="date"
                        value={form.buyerBirthday as string ?? ''}
                        onChange={e => setForm(f => ({ ...f, buyerBirthday: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* ── 3. Informações Comerciais ── */}
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                    <CreditCard className="w-3.5 h-3.5" /> Informações Comerciais
                  </p>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-800">Emite Nota Fiscal?</p>
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
                            onClick={() => setForm(f => ({ ...f, defaultPaymentMethod: form.defaultPaymentMethod === m ? '' : m }))}
                            className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all',
                              form.defaultPaymentMethod === m ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 text-slate-600 bg-white')}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-2 block">Prazo de pagamento</label>
                      <div className="flex flex-wrap gap-2">
                        {PAYMENT_TERMS.map(t => (
                          <button key={t} type="button"
                            onClick={() => setForm(f => ({ ...f, defaultPaymentTerms: form.defaultPaymentTerms === t ? '' : t }))}
                            className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all',
                              form.defaultPaymentTerms === t ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 text-slate-600 bg-white')}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── 4. Crédito ── */}
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                    <CreditCard className="w-3.5 h-3.5" /> Crédito
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-2 block">Classificação</label>
                      <div className="flex flex-wrap gap-2">
                        {CREDIT_OPTS.map(opt => (
                          <button key={opt} type="button"
                            onClick={() => setForm(f => ({ ...f, creditClassification: f.creditClassification === opt ? '' : opt }))}
                            className={cn('px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all',
                              form.creditClassification === opt
                                ? cn(CREDIT_COLORS[opt].replace('border-', 'border-'), CREDIT_COLORS[opt])
                                : 'border-slate-200 text-slate-600 bg-white')}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Limite de crédito (R$)</label>
                      <input className="input" type="number" min={0} step={500} placeholder="0"
                        value={form.creditLimit as number ?? ''}
                        onChange={e => setForm(f => ({ ...f, creditLimit: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1 block">Observação financeira</label>
                      <textarea className="input resize-none" rows={2}
                        placeholder="Ex: Bom pagador, sem restrições."
                        value={form.creditNotes as string ?? ''}
                        onChange={e => setForm(f => ({ ...f, creditNotes: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* ── 5. Relacionamento ── */}
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                    <Calendar className="w-3.5 h-3.5" /> Relacionamento
                  </p>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1 block">🏢 Aniversário da empresa</label>
                    <input className="input" type="date"
                      value={form.companyAnniversary as string ?? ''}
                      onChange={e => setForm(f => ({ ...f, companyAnniversary: e.target.value }))} />
                    <p className="text-xs text-slate-400 mt-1">Usado na Central de Aniversários para envio de mensagens</p>
                  </div>
                </div>

                <div className="h-4" />
              </div>

              {/* Rodapé com botão salvar */}
              <div className="px-5 pb-6 pt-3 border-t border-slate-100 flex-shrink-0">
                {saveError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-2">{saveError}</p>}
                <button onClick={handleSave} disabled={saving}
                  className={cn('w-full btn-primary py-4 text-base flex items-center justify-center gap-2',
                    saved && '!bg-green-600')}>
                  {saved ? '✓ Salvo com sucesso!'
                    : saving ? 'Salvando...'
                    : <><Save className="w-4 h-4" /> Salvar cadastro</>}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── MODAL: MOTIVO DE DEVOLUÇÃO/REPROVAÇÃO ── */}
      <AnimatePresence>
        {reviewModal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => !reviewSaving && setReviewModal(null)} />
            <motion.div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4 w-full"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                {reviewModal === 'devolvido' ? 'Devolver cadastro para correção' : 'Reprovar cadastro'}
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                {reviewModal === 'devolvido'
                  ? 'O representante verá este motivo e poderá corrigir o cadastro.'
                  : 'O cliente permanece bloqueado para pedidos até uma nova revisão.'}
              </p>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Motivo *</label>
              <textarea
                value={reviewReason}
                onChange={e => setReviewReason(e.target.value)}
                rows={3}
                placeholder="Descreva o motivo..."
                className="input resize-none w-full"
                autoFocus
              />
              <div className="flex gap-3 mt-4">
                <button onClick={() => setReviewModal(null)} disabled={reviewSaving}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={() => handleReview(reviewModal, reviewReason.trim())}
                  disabled={reviewSaving || !reviewReason.trim()}
                  className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2',
                    reviewModal === 'devolvido' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-red-600 hover:bg-red-700')}>
                  {reviewSaving
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : reviewModal === 'devolvido' ? <Undo2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                  Confirmar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
