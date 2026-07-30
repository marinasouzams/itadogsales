import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign, Check, X, ChevronDown, ChevronUp, Plus,
  MoreVertical, Trash2, AlertTriangle, FileText, PlusCircle, MinusCircle,
  TrendingUp, TrendingDown,
} from 'lucide-react'
import { gerarReciboPDF } from '@/services/reciboPDF'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { useProductionPayments, useSeamstresses, useUnpaidOrders } from '@/hooks/useProducaoData'
import { createProductionPayment, markPaymentPaid, deleteProductionPayment } from '@/services/producaoDB'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, cn } from '@/utils'
import { ADJUSTMENT_REASON_SUGGESTIONS } from '@/types'
import type { ProductionPayment, ProductionPaymentMethod, ProductionAdjustmentType } from '@/types'

const PAYMENT_METHODS: ProductionPaymentMethod[] = ['PIX', 'Dinheiro', 'Transferência', 'Cheque']

type DraftAdjustment = { type: ProductionAdjustmentType; amount: string; reason: string; notes: string }

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
function PaymentMenu({ onDelete }: { onDelete: () => void }) {
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

// ── Main ──────────────────────────────────────────────────────
export default function PagamentosProducao() {
  const { user } = useAuth()
  const { data: payments = [], loading, refetch } = useProductionPayments()
  const { data: seamstresses = [] } = useSeamstresses()

  const [seamstressFilter, setSeamstressFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'pago'>('todos')
  const [expanded, setExpanded] = useState<string | null>(null)

  // create
  const [newModal, setNewModal] = useState(false)
  const [newForm, setNewForm] = useState({
    seamstressId: '',
    referenceMonth: new Date().toISOString().slice(0, 7),
    notes: '',
  })
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
  const [adjustments, setAdjustments] = useState<DraftAdjustment[]>([])
  const [showAddAdjustment, setShowAddAdjustment] = useState(false)
  const [draftAdjustment, setDraftAdjustment] = useState<DraftAdjustment>({ type: 'acrescimo', amount: '', reason: '', notes: '' })
  const [newError, setNewError] = useState('')

  const { data: unpaidOrders = [], loading: loadingUnpaid } = useUnpaidOrders(newForm.seamstressId || undefined)

  // mark paid
  const [payModal, setPayModal] = useState<string | null>(null)
  const [payForm, setPayForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'PIX' as ProductionPaymentMethod,
  })

  // delete
  const [deleteTarget, setDeleteTarget] = useState<ProductionPayment | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [saving, setSaving] = useState(false)

  const selectedOrders = useMemo(
    () => unpaidOrders.filter(o => selectedOrderIds.has(o.order.id)),
    [unpaidOrders, selectedOrderIds]
  )
  const summaryPecas = selectedOrders.reduce((s, o) => s + o.pieces, 0)
  const summaryValor = selectedOrders.reduce((s, o) => s + o.value, 0)
  const summaryQtdOrdens = selectedOrders.length
  const summaryValorMedio = summaryQtdOrdens > 0 ? summaryValor / summaryQtdOrdens : 0

  const totalAcrescimos = adjustments.filter(a => a.type === 'acrescimo').reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
  const totalDescontos = adjustments.filter(a => a.type === 'desconto').reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
  const valorFinal = Math.max(0, summaryValor + totalAcrescimos - totalDescontos)

  function toggleOrder(orderId: string) {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId)
      return next
    })
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

  async function handleNewPayment() {
    if (!newForm.seamstressId) { setNewError('Selecione uma costureira'); return }
    if (selectedOrderIds.size === 0) { setNewError('Selecione ao menos uma ordem para o fechamento'); return }
    setSaving(true)
    setNewError('')
    try {
      const s = seamstresses.find(s => s.id === newForm.seamstressId)
      await createProductionPayment({
        seamstressId: newForm.seamstressId,
        seamstressName: s?.name ?? '',
        referenceMonth: newForm.referenceMonth,
        orderIds: Array.from(selectedOrderIds),
        adjustments: adjustments.map(a => ({
          type: a.type, amount: parseFloat(a.amount) || 0, reason: a.reason.trim(), notes: a.notes.trim() || undefined,
        })),
        notes: newForm.notes || undefined,
      }, user?.id, user?.name)
      setNewModal(false)
      refetch()
    } catch (e: unknown) {
      setNewError((e as Error).message ?? 'Erro')
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkPaid() {
    if (!payModal) return
    setSaving(true)
    try {
      await markPaymentPaid(payModal, payForm.paymentDate, payForm.paymentMethod, user?.id, user?.name)
      setPayModal(null)
      refetch()
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
    } catch (e: unknown) {
      alert((e as Error).message ?? 'Erro ao excluir')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = payments.filter(p => {
    const matchS = !seamstressFilter || p.seamstressId === seamstressFilter
    const matchStatus = statusFilter === 'todos' || p.status === statusFilter
    return matchS && matchStatus
  })

  const totalPendente = filtered.filter(p => p.status === 'pendente').reduce((s, p) => s + p.totalAmount, 0)
  const totalPago     = filtered.filter(p => p.status === 'pago').reduce((s, p) => s + p.totalAmount, 0)

  return (
    <>
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Pagamentos</h1>
            <p className="text-sm text-slate-500">Fechamentos de produção</p>
          </div>
          <button
            onClick={() => {
              setNewModal(true)
              setSelectedOrderIds(new Set())
              setAdjustments([])
              setShowAddAdjustment(false)
              setNewError('')
              setNewForm({ seamstressId: '', referenceMonth: new Date().toISOString().slice(0, 7), notes: '' })
            }}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo Fechamento
          </button>
        </div>

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
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{fmtMonth(p.referenceMonth)}</p>
                    <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(p.totalAmount)}</p>
                    {p.paymentDate && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Pago em {fmt(p.paymentDate)} · {p.paymentMethod}
                      </p>
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
                      <PaymentMenu onDelete={() => setDeleteTarget(p)} />
                    </div>
                    <button
                      onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                    >
                      {(p.orderIds ?? []).length} ordem(ns)
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
                            <span className="text-slate-700">{it.productName}</span>
                            <div className="flex items-center gap-4 text-slate-500">
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
                            <span>Valor Produção</span>
                            <span>{formatCurrency(p.productionAmount)}</span>
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

      {/* ── New Payment Modal ───────────────────────────────── */}
      <AnimatePresence>
        {newModal && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setNewModal(false)} />
            <motion.div
              className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}>
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">Novo Fechamento</h2>
                <button onClick={() => setNewModal(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {newError && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{newError}</p>}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Costureira *</label>
                  <select value={newForm.seamstressId}
                    onChange={e => {
                      setNewForm(f => ({ ...f, seamstressId: e.target.value }))
                      setSelectedOrderIds(new Set())
                    }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                    <option value="">Selecionar costureira...</option>
                    {seamstresses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mês de Referência</label>
                  <input type="month" value={newForm.referenceMonth}
                    onChange={e => setNewForm(f => ({ ...f, referenceMonth: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                </div>

                {/* Seleção de Ordens não pagas */}
                {loadingUnpaid ? (
                  <div className="py-4"><LoadingSpinner /></div>
                ) : newForm.seamstressId && unpaidOrders.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">Ordens não pagas — selecione quais entram neste fechamento</p>
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
                      {unpaidOrders.map(({ order, pieces, value }) => {
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
                  </div>
                ) : newForm.seamstressId ? (
                  <p className="text-sm text-slate-400 text-center py-3">Nenhuma ordem pendente de pagamento para esta costureira</p>
                ) : null}

                {/* Resumo ao vivo da seleção */}
                {summaryQtdOrdens > 0 && (
                  <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-slate-400">Peças</p>
                      <p className="text-sm font-bold text-slate-800">{summaryPecas}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">Ordens</p>
                      <p className="text-sm font-bold text-slate-800">{summaryQtdOrdens}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">Valor Médio</p>
                      <p className="text-sm font-bold text-slate-800">{formatCurrency(summaryValorMedio)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">Valor Total</p>
                      <p className="text-sm font-bold text-primary-700">{formatCurrency(summaryValor)}</p>
                    </div>
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
                        <button onClick={() => setDraftAdjustment(d => ({ ...d, type: 'acrescimo' }))}
                          className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                            draftAdjustment.type === 'acrescimo' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-500')}>
                          Acréscimo
                        </button>
                        <button onClick={() => setDraftAdjustment(d => ({ ...d, type: 'desconto' }))}
                          className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                            draftAdjustment.type === 'desconto' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500')}>
                          Desconto
                        </button>
                      </div>
                      <input type="number" min="0.01" step="0.01" placeholder="Valor (R$)"
                        value={draftAdjustment.amount}
                        onChange={e => setDraftAdjustment(d => ({ ...d, amount: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                      <input list="adjustment-reasons" placeholder="Motivo (ex: Ajuda de custo, Bônus...)"
                        value={draftAdjustment.reason}
                        onChange={e => setDraftAdjustment(d => ({ ...d, reason: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                      <datalist id="adjustment-reasons">
                        {ADJUSTMENT_REASON_SUGGESTIONS.map(r => <option key={r} value={r} />)}
                      </datalist>
                      <input placeholder="Observação (opcional)"
                        value={draftAdjustment.notes}
                        onChange={e => setDraftAdjustment(d => ({ ...d, notes: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                      <div className="flex gap-2">
                        <button onClick={() => setShowAddAdjustment(false)}
                          className="flex-1 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50">
                          Cancelar
                        </button>
                        <button onClick={confirmAddAdjustment}
                          disabled={!draftAdjustment.reason.trim() || !(parseFloat(draftAdjustment.amount) > 0)}
                          className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-xs font-semibold hover:bg-primary-700 disabled:opacity-50">
                          Adicionar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Resumo Final */}
                {summaryQtdOrdens > 0 && (
                  <div className="bg-primary-50 border border-primary-100 rounded-xl p-3 space-y-1">
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>Valor Produção</span>
                      <span>{formatCurrency(summaryValor)}</span>
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
                      <span>Valor Final</span>
                      <span>{formatCurrency(valorFinal)}</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observações</label>
                  <textarea value={newForm.notes}
                    onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none" />
                </div>
              </div>
              <div className="p-5 border-t border-slate-100 flex gap-3">
                <button onClick={() => setNewModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleNewPayment} disabled={saving || summaryQtdOrdens === 0}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Check className="w-4 h-4" />}
                  Gerar Fechamento
                </button>
              </div>
            </motion.div>
          </motion.div>
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
                será removido permanentemente e as ordens voltarão a ficar disponíveis para um novo fechamento.
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
