import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign, Check, X, ChevronDown, ChevronUp, Plus,
  MoreVertical, Trash2, AlertTriangle, FileText, PlusCircle, MinusCircle,
  TrendingUp, TrendingDown, Package, Edit2, ClipboardList, PenLine, Layers,
} from 'lucide-react'
import { gerarReciboPDF } from '@/services/reciboPDF'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import {
  useProductionPayments, useSeamstresses, useUnpaidOrders, useOrdersByIds,
  useSeamstressFinancialSummaries, useSeamstressProducts,
} from '@/hooks/useProducaoData'
import {
  createProductionPayment, updateProductionPayment, markPaymentPaid, deleteProductionPayment,
} from '@/services/producaoDB'
import { useAuth } from '@/contexts/AuthContext'
import { useProducaoCompetencia } from '@/contexts/ProducaoCompetenciaContext'
import { formatCurrency, cn } from '@/utils'
import type {
  ProductionPayment, ProductionPaymentMethod, ProductionAdjustmentType,
  SeamstressFinancialSummary, SeamstressPaymentStatus, UnpaidProductionOrder,
} from '@/types'
import type { ManualPaymentItemInput, PaymentAdjustmentInput } from '@/services/producaoDB'

const PAYMENT_METHODS: ProductionPaymentMethod[] = ['PIX', 'Dinheiro', 'Transferência', 'Cheque']

const ACRESCIMO_REASONS = ['Ajuda de custo de energia', 'Bônus', 'Transporte', 'Serviço adicional', 'Ajuste manual']
const DESCONTO_REASONS = ['Adiantamento', 'Material perdido', 'Produto com defeito', 'Ajuste de quantidade', 'Valor pago anteriormente']

type DraftAdjustment = { type: ProductionAdjustmentType; amount: string; reason: string; notes: string }
type ManualItemDraft = {
  seamstressProductId: string  // '' = nada selecionado ainda, 'outro' = descrição livre
  productName: string
  productionDate: string
  quantity: string
  unitValue: string
  notes: string
}
type PaymentMode = 'ordens' | 'manual' | 'ambos'

const EMPTY_MANUAL_DRAFT: ManualItemDraft = {
  seamstressProductId: '', productName: '', productionDate: new Date().toISOString().slice(0, 10),
  quantity: '', unitValue: '', notes: '',
}

function fmt(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function fmtMonth(m: string) {
  const [y, mo] = m.split('-')
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${months[parseInt(mo, 10) - 1]}/${y}`
}

// ── Three-dot menu ────────────────────────────────────────────
function PaymentMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute right-0 top-8 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[130px]"
          >
            <button
              onClick={e => { e.stopPropagation(); setOpen(false); onEdit() }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5 text-slate-400" /> Editar
            </button>
            <button
              onClick={e => { e.stopPropagation(); setOpen(false); onDelete() }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Alertas compactos (chips) ────────────────────────────────
const STATUS_CONFIG: Record<SeamstressPaymentStatus, { label: string; chip: string; dot: string }> = {
  em_dia:     { label: 'Em dia',        chip: 'bg-green-50 text-green-700 border-green-200',   dot: 'bg-green-500' },
  proximo:    { label: 'Próximo',       chip: 'bg-amber-50 text-amber-700 border-amber-200',    dot: 'bg-amber-400' },
  vence_hoje: { label: 'Vence hoje',    chip: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  atrasado:   { label: 'Em atraso',     chip: 'bg-red-50 text-red-700 border-red-200',          dot: 'bg-red-500' },
  pago:       { label: 'Pago',          chip: 'bg-blue-50 text-blue-700 border-blue-200',       dot: 'bg-blue-500' },
}

function SeamstressStatusChip({ summary, onClick }: { summary: SeamstressFinancialSummary; onClick: () => void }) {
  const hasDay = !!summary.paymentDay
  const cfg = hasDay ? STATUS_CONFIG[summary.status] : null
  return (
    <button onClick={onClick}
      className={cn(
        'flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-colors hover:shadow-sm',
        cfg ? cfg.chip : 'bg-slate-50 text-slate-400 border-slate-200'
      )}>
      {cfg && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot)} />}
      <span className="font-semibold">{summary.seamstressName}</span>
      <span className="opacity-60">— {hasDay ? `Dia ${summary.paymentDay}` : 'sem dia'} —</span>
      <span>{cfg ? cfg.label : '—'}</span>
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function PagamentosProducao() {
  const { user } = useAuth()
  const { data: payments = [], loading, refetch } = useProductionPayments()
  const { data: seamstresses = [] } = useSeamstresses()
  const { data: summaries = [], loading: loadingSummaries, refetch: refetchSummaries } = useSeamstressFinancialSummaries()
  const { filter: competencia } = useProducaoCompetencia()

  const [seamstressFilter, setSeamstressFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'pago'>('todos')
  const [expanded, setExpanded] = useState<string | null>(null)

  // fechamento modal (criar ou editar)
  const [modalStage, setModalStage] = useState<'choice' | 'form' | null>(null)
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('ordens')
  const [editingPayment, setEditingPayment] = useState<ProductionPayment | null>(null)
  const [initialSeamstressId, setInitialSeamstressId] = useState('')

  // mark paid
  const [payModal, setPayModal] = useState<string | null>(null)
  const [payForm, setPayForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'PIX' as ProductionPaymentMethod,
  })
  const [payingPending, setPayingPending] = useState(false)

  // delete
  const [deleteTarget, setDeleteTarget] = useState<ProductionPayment | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [saving, setSaving] = useState(false)

  function openNewFechamento(seamstressId = '') {
    setInitialSeamstressId(seamstressId)
    setEditingPayment(null)
    setModalStage('choice')
  }
  function openEditFechamento(payment: ProductionPayment) {
    setEditingPayment(payment)
    setInitialSeamstressId(payment.seamstressId)
    setPaymentMode('ambos')
    setModalStage('form')
  }
  function chooseMode(mode: PaymentMode) {
    setPaymentMode(mode)
    setModalStage('form')
  }
  function closeModal() {
    setModalStage(null)
    setEditingPayment(null)
  }
  function afterSave() {
    closeModal()
    refetch()
    refetchSummaries()
  }

  async function handleMarkPaid() {
    if (!payModal) return
    setSaving(true)
    try {
      await markPaymentPaid(payModal, payForm.paymentDate, payForm.paymentMethod, user?.id, user?.name)
      setPayModal(null)
      refetch()
      refetchSummaries()
    } catch (e: unknown) {
      alert((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteProductionPayment(
        deleteTarget.id,
        deleteTarget.seamstressName,
        deleteTarget.referenceMonth,
        user?.id, user?.name,
      )
      setDeleteTarget(null)
      refetch()
      refetchSummaries()
    } catch (e: unknown) {
      alert((e as Error).message ?? 'Erro ao excluir')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = payments.filter(p => {
    const matchS = !seamstressFilter || p.seamstressId === seamstressFilter
    const matchStatus = statusFilter === 'todos' || p.status === statusFilter
    // referenceMonth é 'YYYY-MM' — compara contra o intervalo (YYYY-MM-DD) por prefixo de mês
    const matchCompetencia = !competencia.from
      || (p.referenceMonth >= competencia.from.slice(0, 7) && (!competencia.to || p.referenceMonth <= competencia.to.slice(0, 7)))
    return matchS && matchStatus && matchCompetencia
  })

  const totalPendente = filtered.filter(p => p.status === 'pendente').reduce((s, p) => s + p.totalAmount, 0)
  const totalPago     = filtered.filter(p => p.status === 'pago').reduce((s, p) => s + p.totalAmount, 0)

  return (
    <>
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Pagamentos</h1>
            <p className="text-sm text-slate-500">Fechamentos de produção</p>
          </div>
          <button
            onClick={() => openNewFechamento()}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo Fechamento
          </button>
        </div>

        {/* Alertas compactos por costureira */}
        {loadingSummaries ? (
          <div className="py-3"><LoadingSpinner /></div>
        ) : summaries.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-5 -mx-1 px-1">
            {summaries.map(s => (
              <SeamstressStatusChip key={s.seamstressId} summary={s} onClick={() => openNewFechamento(s.seamstressId)} />
            ))}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="card text-center">
            <p className="text-xs text-slate-500 font-medium mb-1">Valor a Pagar</p>
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalPendente)}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-slate-500 font-medium mb-1">Total Pago</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPago)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          <select value={seamstressFilter} onChange={e => setSeamstressFilter(e.target.value)}
            className="border border-slate-200 rounded-xl text-sm px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none">
            <option value="">Toda costureira</option>
            {seamstresses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="border border-slate-200 rounded-xl text-sm px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none">
            <option value="todos">Todo status</option>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-10"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Nenhum fechamento encontrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(p => (
              <motion.div key={p.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900">{p.seamstressName}</p>
                      <span className={cn(
                        'text-xs font-semibold px-2 py-0.5 rounded-full',
                        p.status === 'pago'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-orange-100 text-orange-700',
                      )}>
                        {p.status === 'pago' ? 'Pago' : 'Pendente'}
                      </span>
                      {(p.adjustments ?? []).length > 0 && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          com ajustes
                        </span>
                      )}
                      {(p.items ?? []).some(i => i.source === 'manual') && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                          <PenLine className="w-3 h-3" /> manual
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">Competência: {fmtMonth(p.referenceMonth)}</p>
                    <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(p.totalAmount)}</p>
                    {p.paymentDate && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Pago em {fmt(p.paymentDate)} · {p.paymentMethod}
                      </p>
                    )}
                    {!p.paymentDate && p.expectedPaymentDate && (
                      <p className="text-xs text-slate-400 mt-0.5">Previsto para {fmt(p.expectedPaymentDate)}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1">
                      {p.status === 'pendente' && (
                        <button
                          onClick={() => {
                            setPayModal(p.id)
                            setPayForm({ paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'PIX' })
                          }}
                          className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" /> Marcar como Pago
                        </button>
                      )}
                      <button
                        onClick={() => gerarReciboPDF(p)}
                        title="Gerar Recibo PDF"
                        className="flex items-center gap-1.5 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" /> Recibo
                      </button>
                      <PaymentMenu onEdit={() => openEditFechamento(p)} onDelete={() => setDeleteTarget(p)} />
                    </div>
                    <button
                      onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                    >
                      {(p.orderIds ?? []).length} ordem(ns) · {(p.items ?? []).filter(i => i.source === 'manual').length} manual(is)
                      {expanded === p.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {expanded === p.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                        {(p.items ?? []).map((it, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {it.source === 'manual'
                                ? <PenLine className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                : <ClipboardList className="w-3 h-3 text-slate-300 flex-shrink-0" />}
                              <span className="text-slate-700 truncate">{it.productName}</span>
                              {it.productionDate && <span className="text-slate-400 text-xs flex-shrink-0">({fmt(it.productionDate)})</span>}
                            </div>
                            <div className="flex items-center gap-4 text-slate-500 flex-shrink-0">
                              <span>{it.quantity} × {formatCurrency(it.unitValue)}</span>
                              <span className="font-semibold text-slate-700">{formatCurrency(it.totalValue)}</span>
                            </div>
                          </div>
                        ))}

                        {(p.adjustments ?? []).length > 0 && (
                          <div className="pt-2 mt-2 border-t border-slate-100 space-y-1.5">
                            <p className="text-xs font-semibold text-slate-500">Ajustes Financeiros</p>
                            {(p.adjustments ?? []).map(a => (
                              <div key={a.id} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-1.5">
                                  {a.type === 'acrescimo'
                                    ? <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                                    : <TrendingDown className="w-3.5 h-3.5 text-red-600" />}
                                  <span className="text-slate-700">{a.reason}</span>
                                  {a.notes && <span className="text-slate-400 text-xs">— {a.notes}</span>}
                                </div>
                                <span className={cn('font-semibold', a.type === 'acrescimo' ? 'text-green-600' : 'text-red-600')}>
                                  {a.type === 'acrescimo' ? '+' : '−'} {formatCurrency(a.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="pt-2 mt-2 border-t border-slate-200 space-y-1">
                          <div className="flex justify-between text-sm text-slate-500">
                            <span>Produção por Ordens</span>
                            <span>{formatCurrency(p.productionFromOrders ?? 0)}</span>
                          </div>
                          <div className="flex justify-between text-sm text-slate-500">
                            <span>Produção Manual</span>
                            <span>{formatCurrency(p.productionFromManual ?? 0)}</span>
                          </div>
                          {p.totalAcrescimos > 0 && (
                            <div className="flex justify-between text-sm text-green-600">
                              <span>Acréscimos</span>
                              <span>+ {formatCurrency(p.totalAcrescimos)}</span>
                            </div>
                          )}
                          {p.totalDescontos > 0 && (
                            <div className="flex justify-between text-sm text-red-600">
                              <span>Descontos</span>
                              <span>− {formatCurrency(p.totalDescontos)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-slate-900">
                            <span>Valor Final</span>
                            <span>{formatCurrency(p.totalAmount)}</span>
                          </div>
                        </div>

                        {p.notes && <p className="text-xs text-slate-400 italic pt-1">{p.notes}</p>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ── Escolha de modo (só ao criar) ──────────────────────── */}
      <AnimatePresence>
        {modalStage === 'choice' && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
            <motion.div className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl"
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}>
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">Como deseja montar este pagamento?</h2>
                <button onClick={closeModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-2.5">
                <button onClick={() => chooseMode('ordens')}
                  className="w-full flex items-center gap-3 p-3.5 border border-slate-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-colors text-left">
                  <ClipboardList className="w-5 h-5 text-primary-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Selecionar Ordens de Produção</p>
                    <p className="text-xs text-slate-500">Monta o fechamento a partir de ordens já cadastradas</p>
                  </div>
                </button>
                <button onClick={() => chooseMode('manual')}
                  className="w-full flex items-center gap-3 p-3.5 border border-slate-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-colors text-left">
                  <PenLine className="w-5 h-5 text-primary-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Lançamento Manual</p>
                    <p className="text-xs text-slate-500">Lança produtos e valores direto da folha física, sem Ordem</p>
                  </div>
                </button>
                <button onClick={() => chooseMode('ambos')}
                  className="w-full flex items-center gap-3 p-3.5 border border-slate-200 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-colors text-left">
                  <Layers className="w-5 h-5 text-primary-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Ordens + Lançamentos Manuais</p>
                    <p className="text-xs text-slate-500">Combina os dois no mesmo fechamento</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Formulário do fechamento (criar ou editar) ─────────── */}
      <AnimatePresence>
        {modalStage === 'form' && (
          <FechamentoForm
            mode={paymentMode}
            editingPayment={editingPayment}
            initialSeamstressId={initialSeamstressId}
            seamstresses={seamstresses}
            onClose={closeModal}
            onSaved={afterSave}
          />
        )}
      </AnimatePresence>

      {/* ── Mark Paid Modal ─────────────────────────────────── */}
      <AnimatePresence>
        {payModal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setPayModal(null)} />
            <motion.div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4 w-full"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <h3 className="text-lg font-bold text-slate-900 mb-4">Marcar como Pago</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data do Pagamento</label>
                  <input type="date" value={payForm.paymentDate}
                    onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Forma de Pagamento</label>
                  <select value={payForm.paymentMethod}
                    onChange={e => setPayForm(f => ({ ...f, paymentMethod: e.target.value as ProductionPaymentMethod }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setPayModal(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleMarkPaid} disabled={saving}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Check className="w-4 h-4" />}
                  Confirmar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation Modal ───────────────────────── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50"
              onClick={() => !deleting && setDeleteTarget(null)} />
            <motion.div
              className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-6 space-y-4"
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Excluir Fechamento</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {deleteTarget.seamstressName} · {fmtMonth(deleteTarget.referenceMonth)}
                  </p>
                </div>
              </div>

              <p className="text-sm text-slate-600">
                O fechamento de{' '}
                <strong>{formatCurrency(deleteTarget.totalAmount)}</strong>{' '}
                será removido permanentemente e as ordens vinculadas voltarão a ficar disponíveis para um novo fechamento.
                <br />
                <strong>Deseja realmente excluir?</strong>
              </p>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {deleting
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                  Excluir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ── Formulário completo de fechamento (criar/editar) ───────────
function FechamentoForm({ mode, editingPayment, initialSeamstressId, seamstresses, onClose, onSaved }: {
  mode: PaymentMode
  editingPayment: ProductionPayment | null
  initialSeamstressId: string
  seamstresses: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuth()
  const isEdit = !!editingPayment
  const wasPaid = editingPayment?.status === 'pago'

  const [seamstressId, setSeamstressId] = useState(initialSeamstressId)
  const [referenceMonth, setReferenceMonth] = useState(editingPayment?.referenceMonth ?? new Date().toISOString().slice(0, 7))
  const [closingDate, setClosingDate] = useState(editingPayment?.closingDate ?? new Date().toISOString().slice(0, 10))
  const [expectedPaymentDate, setExpectedPaymentDate] = useState(editingPayment?.expectedPaymentDate ?? '')
  const [notes, setNotes] = useState(editingPayment?.notes ?? '')

  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set(editingPayment?.orderIds ?? []))
  const [manualItems, setManualItems] = useState<ManualItemDraft[]>(() =>
    (editingPayment?.items ?? []).filter(i => i.source === 'manual').map(i => ({
      seamstressProductId: i.seamstressProductId ?? 'outro',
      productName: i.productName,
      productionDate: i.productionDate ?? '',
      quantity: String(i.quantity),
      unitValue: String(i.unitValue),
      notes: i.notes ?? '',
    }))
  )
  const [showAddManual, setShowAddManual] = useState(false)
  const [draftManual, setDraftManual] = useState<ManualItemDraft>(EMPTY_MANUAL_DRAFT)

  const [adjustments, setAdjustments] = useState<DraftAdjustment[]>(() =>
    (editingPayment?.adjustments ?? []).map(a => ({
      type: a.type, amount: String(a.amount), reason: a.reason, notes: a.notes ?? '',
    }))
  )
  const [showAddAdjustment, setShowAddAdjustment] = useState(false)
  const [draftAdjustment, setDraftAdjustment] = useState<DraftAdjustment>({ type: 'acrescimo', amount: '', reason: '', notes: '' })

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmPaidEdit, setConfirmPaidEdit] = useState(false)

  const showOrdens = mode === 'ordens' || mode === 'ambos'
  const showManual = mode === 'manual' || mode === 'ambos'

  const { data: unpaidOrders = [], loading: loadingUnpaid } = useUnpaidOrders(seamstressId || undefined)
  const { data: linkedOrders = [] } = useOrdersByIds(isEdit ? (editingPayment!.orderIds ?? []) : [])
  const { data: seamstressProducts = [] } = useSeamstressProducts(seamstressId || undefined)

  // Combina ordens não pagas + as já vinculadas a este fechamento (que não
  // aparecem em "não pagas" pois já têm production_payment_id apontando p/ ele).
  const availableOrders: UnpaidProductionOrder[] = useMemo(() => {
    const map = new Map<string, UnpaidProductionOrder>()
    for (const o of linkedOrders) map.set(o.order.id, o)
    for (const o of unpaidOrders) map.set(o.order.id, o)
    return Array.from(map.values()).sort((a, b) => b.order.requestDate.localeCompare(a.order.requestDate))
  }, [unpaidOrders, linkedOrders])

  const selectedOrders = availableOrders.filter(o => selectedOrderIds.has(o.order.id))
  const ordersValue = selectedOrders.reduce((s, o) => s + o.value, 0)
  const ordersPecas = selectedOrders.reduce((s, o) => s + o.pieces, 0)

  const validManualItems = manualItems.filter(m => m.productName.trim() && parseFloat(m.quantity) > 0)
  const manualValue = validManualItems.reduce((s, m) => s + (parseFloat(m.quantity) || 0) * (parseFloat(m.unitValue) || 0), 0)

  const productionTotal = ordersValue + manualValue
  const totalAcrescimos = adjustments.reduce((s, a) => s + (a.type === 'acrescimo' ? (parseFloat(a.amount) || 0) : 0), 0)
  const totalDescontos = adjustments.reduce((s, a) => s + (a.type === 'desconto' ? (parseFloat(a.amount) || 0) : 0), 0)
  const valorFinal = Math.max(0, productionTotal + totalAcrescimos - totalDescontos)

  function toggleOrder(orderId: string) {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId)
      return next
    })
  }

  function pickManualProduct(productId: string) {
    if (productId === 'outro') {
      setDraftManual(d => ({ ...d, seamstressProductId: 'outro', productName: '' }))
      return
    }
    const prod = seamstressProducts.find(p => p.id === productId)
    setDraftManual(d => ({ ...d, seamstressProductId: productId, productName: prod?.productName ?? '', unitValue: prod ? String(prod.unitValue) : d.unitValue }))
  }

  function confirmAddManual() {
    if (!draftManual.productName.trim() || !(parseFloat(draftManual.quantity) > 0) || !(parseFloat(draftManual.unitValue) >= 0)) return
    setManualItems(prev => [...prev, draftManual])
    setDraftManual(EMPTY_MANUAL_DRAFT)
    setShowAddManual(false)
  }
  function removeManualItem(i: number) {
    setManualItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function confirmAddAdjustment() {
    const amount = parseFloat(draftAdjustment.amount)
    if (!draftAdjustment.reason.trim() || isNaN(amount) || amount <= 0) return
    setAdjustments(prev => [...prev, { ...draftAdjustment, amount: String(amount) }])
    setDraftAdjustment({ type: 'acrescimo', amount: '', reason: '', notes: '' })
    setShowAddAdjustment(false)
  }
  function removeAdjustment(i: number) {
    setAdjustments(prev => prev.filter((_, idx) => idx !== i))
  }

  async function doSave() {
    if (!seamstressId) { setError('Selecione uma costureira'); return }
    if (selectedOrderIds.size === 0 && validManualItems.length === 0) {
      setError('Selecione ao menos uma Ordem ou adicione um lançamento manual'); return
    }
    setSaving(true)
    setError('')
    try {
      const s = seamstresses.find(s => s.id === seamstressId)
      const manualInput: ManualPaymentItemInput[] = validManualItems.map(m => ({
        productName: m.productName.trim(),
        seamstressProductId: m.seamstressProductId && m.seamstressProductId !== 'outro' ? m.seamstressProductId : undefined,
        productionDate: m.productionDate || undefined,
        quantity: parseFloat(m.quantity) || 0,
        unitValue: parseFloat(m.unitValue) || 0,
        notes: m.notes.trim() || undefined,
      }))
      const adjustmentsInput: PaymentAdjustmentInput[] = adjustments.map(a => ({
        type: a.type, amount: parseFloat(a.amount) || 0, reason: a.reason.trim(), notes: a.notes.trim() || undefined,
      }))
      const payload = {
        seamstressId, seamstressName: s?.name ?? '',
        referenceMonth,
        closingDate: closingDate || undefined,
        expectedPaymentDate: expectedPaymentDate || undefined,
        orderIds: Array.from(selectedOrderIds),
        manualItems: manualInput,
        adjustments: adjustmentsInput,
        notes: notes || undefined,
      }
      if (isEdit) {
        await updateProductionPayment(editingPayment!.id, payload, user?.id, user?.name)
      } else {
        await createProductionPayment(payload, user?.id, user?.name)
      }
      onSaved()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function handleSaveClick() {
    if (wasPaid && !confirmPaidEdit) { setConfirmPaidEdit(true); return }
    doSave()
  }

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Editar Fechamento' : 'Novo Fechamento'}</h2>
            {wasPaid && <p className="text-xs text-amber-600 font-semibold mt-0.5">Este fechamento já foi pago — editar exige confirmação</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Costureira *</label>
            <select value={seamstressId}
              onChange={e => { setSeamstressId(e.target.value); setSelectedOrderIds(new Set()) }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
              <option value="">Selecionar costureira...</option>
              {seamstresses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Competência *</label>
              <input type="month" value={referenceMonth} onChange={e => setReferenceMonth(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data do fechamento</label>
              <input type="date" value={closingDate} onChange={e => setClosingDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Previsão pagto.</label>
              <input type="date" value={expectedPaymentDate} onChange={e => setExpectedPaymentDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            </div>
          </div>
          {referenceMonth !== new Date().toISOString().slice(0, 7) && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              Competência retroativa/futura — este valor entrará nos relatórios e no dashboard de {fmtMonth(referenceMonth)}, não do mês em que foi cadastrado.
            </p>
          )}

          {/* Ordens */}
          {showOrdens && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">Ordens não pagas — selecione quais entram neste fechamento</p>
              {!seamstressId ? (
                <p className="text-sm text-slate-400 text-center py-3">Selecione uma costureira</p>
              ) : loadingUnpaid ? (
                <div className="py-4"><LoadingSpinner /></div>
              ) : availableOrders.length > 0 ? (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {availableOrders.map(({ order, pieces, value }) => {
                    const checked = selectedOrderIds.has(order.id)
                    return (
                      <label key={order.id}
                        className={cn('flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors', checked ? 'bg-primary-50' : 'hover:bg-slate-50')}>
                        <input type="checkbox" checked={checked} onChange={() => toggleOrder(order.id)}
                          className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 truncate">
                            {(order.items ?? []).map(it => `${it.productName} (${it.deliveredQty})`).join(', ') || 'Sem itens entregues'}
                          </p>
                          <p className="text-xs text-slate-400">Solicitada em {fmt(order.requestDate)} · {pieces} peça(s)</p>
                        </div>
                        <span className="text-sm font-semibold text-slate-700 flex-shrink-0">{formatCurrency(value)}</span>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-3">Nenhuma ordem pendente de pagamento para esta costureira</p>
              )}
            </div>
          )}

          {/* Lançamento Manual */}
          {showManual && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-600">Lançamento Manual</label>
                {!showAddManual && (
                  <button onClick={() => setShowAddManual(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                    <PlusCircle className="w-3.5 h-3.5" /> Adicionar Linha
                  </button>
                )}
              </div>

              {manualItems.length > 0 && (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 mb-2">
                  {manualItems.map((m, i) => {
                    const qty = parseFloat(m.quantity) || 0
                    const uv = parseFloat(m.unitValue) || 0
                    return (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 truncate">{m.productName || '—'}</p>
                          <p className="text-xs text-slate-400">
                            {m.productionDate ? fmt(m.productionDate) + ' · ' : ''}{qty} × {formatCurrency(uv)}
                            {m.notes ? ` · ${m.notes}` : ''}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-slate-700 flex-shrink-0">{formatCurrency(qty * uv)}</span>
                        <button onClick={() => removeManualItem(i)} className="text-slate-400 hover:text-red-600 flex-shrink-0">
                          <MinusCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {showAddManual && (
                <div className="border border-slate-200 rounded-xl p-3 space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Produto</label>
                    {seamstressProducts.length > 0 ? (
                      <select value={draftManual.seamstressProductId}
                        onChange={e => pickManualProduct(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white">
                        <option value="">Selecionar produto cadastrado...</option>
                        {seamstressProducts.map(p => (
                          <option key={p.id} value={p.id}>{p.productName} — {formatCurrency(p.unitValue)}/peça</option>
                        ))}
                        <option value="outro">Outro (descrição livre)</option>
                      </select>
                    ) : null}
                    {(seamstressProducts.length === 0 || draftManual.seamstressProductId === 'outro') && (
                      <input value={draftManual.productName}
                        onChange={e => setDraftManual(d => ({ ...d, productName: e.target.value }))}
                        placeholder="Descrição do produto/serviço"
                        className={cn('w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none', seamstressProducts.length > 0 && 'mt-1.5')} />
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Data</label>
                      <input type="date" value={draftManual.productionDate}
                        onChange={e => setDraftManual(d => ({ ...d, productionDate: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Quantidade</label>
                      <input type="number" min="0.01" step="0.01" value={draftManual.quantity}
                        onChange={e => setDraftManual(d => ({ ...d, quantity: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Valor/peça</label>
                      <input type="number" min="0" step="0.01" value={draftManual.unitValue}
                        onChange={e => setDraftManual(d => ({ ...d, unitValue: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                    <span>Total da linha</span>
                    <span className="font-bold text-slate-800">{formatCurrency((parseFloat(draftManual.quantity) || 0) * (parseFloat(draftManual.unitValue) || 0))}</span>
                  </div>
                  <input value={draftManual.notes}
                    onChange={e => setDraftManual(d => ({ ...d, notes: e.target.value }))}
                    placeholder="Observação (opcional)"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                  <div className="flex gap-2">
                    <button onClick={() => { setShowAddManual(false); setDraftManual(EMPTY_MANUAL_DRAFT) }}
                      className="flex-1 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50">
                      Cancelar
                    </button>
                    <button onClick={confirmAddManual}
                      disabled={!draftManual.productName.trim() || !(parseFloat(draftManual.quantity) > 0)}
                      className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-xs font-semibold hover:bg-primary-700 disabled:opacity-50">
                      Adicionar Linha
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resumo da produção */}
          {(selectedOrderIds.size > 0 || validManualItems.length > 0) && (
            <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-center">
              {showOrdens && (
                <div>
                  <p className="text-[10px] text-slate-400">Produção por Ordens ({ordersPecas} pçs)</p>
                  <p className="text-sm font-bold text-slate-800">{formatCurrency(ordersValue)}</p>
                </div>
              )}
              {showManual && (
                <div>
                  <p className="text-[10px] text-slate-400">Produção Manual</p>
                  <p className="text-sm font-bold text-slate-800">{formatCurrency(manualValue)}</p>
                </div>
              )}
            </div>
          )}

          {/* Ajustes Financeiros */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-600">Ajustes Financeiros</label>
              {!showAddAdjustment && (
                <button onClick={() => setShowAddAdjustment(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                  <PlusCircle className="w-3.5 h-3.5" /> Adicionar Ajuste
                </button>
              )}
            </div>

            {adjustments.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {adjustments.map((a, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {a.type === 'acrescimo'
                        ? <TrendingUp className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                        : <TrendingDown className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />}
                      <span className="text-slate-700 truncate">{a.reason}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('font-semibold', a.type === 'acrescimo' ? 'text-green-600' : 'text-red-600')}>
                        {a.type === 'acrescimo' ? '+' : '−'} {formatCurrency(parseFloat(a.amount) || 0)}
                      </span>
                      <button onClick={() => removeAdjustment(i)} className="text-slate-400 hover:text-red-600">
                        <MinusCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showAddAdjustment && (
              <div className="border border-slate-200 rounded-xl p-3 space-y-2.5">
                <div className="flex gap-2">
                  <button onClick={() => setDraftAdjustment(d => ({ ...d, type: 'acrescimo', reason: '' }))}
                    className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                      draftAdjustment.type === 'acrescimo' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-500')}>
                    Acréscimo
                  </button>
                  <button onClick={() => setDraftAdjustment(d => ({ ...d, type: 'desconto', reason: '' }))}
                    className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                      draftAdjustment.type === 'desconto' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500')}>
                    Desconto
                  </button>
                </div>
                <input type="number" min="0.01" step="0.01" placeholder="Valor (R$)"
                  value={draftAdjustment.amount}
                  onChange={e => setDraftAdjustment(d => ({ ...d, amount: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                <input list="adjustment-reasons" placeholder="Motivo"
                  value={draftAdjustment.reason}
                  onChange={e => setDraftAdjustment(d => ({ ...d, reason: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                <datalist id="adjustment-reasons">
                  {(draftAdjustment.type === 'acrescimo' ? ACRESCIMO_REASONS : DESCONTO_REASONS).map(r => <option key={r} value={r} />)}
                  <option value="Outro" />
                </datalist>
                {draftAdjustment.reason === 'Outro' && (
                  <input placeholder="Descreva o motivo *"
                    value={draftAdjustment.notes}
                    onChange={e => setDraftAdjustment(d => ({ ...d, notes: e.target.value }))}
                    className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
                )}
                {draftAdjustment.reason !== 'Outro' && (
                  <input placeholder="Observação (opcional)"
                    value={draftAdjustment.notes}
                    onChange={e => setDraftAdjustment(d => ({ ...d, notes: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                )}
                <div className="flex gap-2">
                  <button onClick={() => setShowAddAdjustment(false)}
                    className="flex-1 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50">
                    Cancelar
                  </button>
                  <button onClick={confirmAddAdjustment}
                    disabled={!draftAdjustment.reason.trim() || !(parseFloat(draftAdjustment.amount) > 0) || (draftAdjustment.reason === 'Outro' && !draftAdjustment.notes.trim())}
                    className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-xs font-semibold hover:bg-primary-700 disabled:opacity-50">
                    Adicionar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Resumo Final */}
          {(selectedOrderIds.size > 0 || validManualItems.length > 0) && (
            <div className="bg-primary-50 border border-primary-100 rounded-xl p-3 space-y-1">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Produção por Ordens</span>
                <span>{formatCurrency(ordersValue)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>Produção Manual</span>
                <span>{formatCurrency(manualValue)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-700 font-semibold pt-1 border-t border-primary-200">
                <span>Subtotal da Produção</span>
                <span>{formatCurrency(productionTotal)}</span>
              </div>
              {totalAcrescimos > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Acréscimos</span>
                  <span>+ {formatCurrency(totalAcrescimos)}</span>
                </div>
              )}
              {totalDescontos > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>Descontos</span>
                  <span>− {formatCurrency(totalDescontos)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-primary-200">
                <span>Valor Final a Pagar</span>
                <span>{formatCurrency(valorFinal)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observações</label>
            <textarea value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none" />
          </div>

          {confirmPaidEdit && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-sm text-amber-800 font-semibold mb-2">
                Este fechamento já foi marcado como pago. Confirma a edição mesmo assim?
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmPaidEdit(false)} className="flex-1 py-2 border border-amber-300 rounded-lg text-xs font-semibold text-amber-700 hover:bg-amber-100">
                  Cancelar
                </button>
                <button onClick={doSave} className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700">
                  Sim, confirmar edição
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleSaveClick} disabled={saving || (selectedOrderIds.size === 0 && validManualItems.length === 0)}
            className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-60 flex items-center justify-center gap-2">
            {saving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Check className="w-4 h-4" />}
            {isEdit ? 'Salvar Alterações' : 'Gerar Fechamento'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
