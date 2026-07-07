import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign, Check, X, ChevronDown, ChevronUp, Plus,
  MoreVertical, Trash2, AlertTriangle,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { useProductionPayments, useSeamstresses } from '@/hooks/useProducaoData'
import {
  createProductionPayment, markPaymentPaid,
  getUnpaidDeliveries, deleteProductionPayment,
} from '@/services/producaoDB'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, cn } from '@/utils'
import type { ProductionPayment, ProductionPaymentMethod } from '@/types'

const PAYMENT_METHODS: ProductionPaymentMethod[] = ['PIX', 'Dinheiro', 'Transferência', 'Cheque']

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
  const [unpaidItems, setUnpaidItems] = useState<{ productName: string; quantity: number; unitValue: number; totalValue: number }[]>([])
  const [loadingUnpaid, setLoadingUnpaid] = useState(false)
  const [newError, setNewError] = useState('')

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

  async function loadUnpaid(seamstressId: string) {
    setLoadingUnpaid(true)
    try {
      const items = await getUnpaidDeliveries(seamstressId)
      setUnpaidItems(items)
    } finally {
      setLoadingUnpaid(false)
    }
  }

  async function handleNewPayment() {
    if (!newForm.seamstressId) { setNewError('Selecione uma costureira'); return }
    if (unpaidItems.length === 0) { setNewError('Não há peças a pagar para esta costureira'); return }
    setSaving(true)
    setNewError('')
    try {
      const s = seamstresses.find(s => s.id === newForm.seamstressId)
      const total = unpaidItems.reduce((sum, it) => sum + it.totalValue, 0)
      await createProductionPayment({
        seamstressId: newForm.seamstressId,
        seamstressName: s?.name ?? '',
        referenceMonth: newForm.referenceMonth,
        totalAmount: total,
        items: unpaidItems,
        notes: newForm.notes || undefined,
      }, user?.id, user?.name)
      setNewModal(false)
      setUnpaidItems([])
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
    <AdminLayout title="Pagamentos Produção">
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Pagamentos</h1>
            <p className="text-sm text-slate-500">Fechamentos mensais de produção</p>
          </div>
          <button
            onClick={() => {
              setNewModal(true)
              setUnpaidItems([])
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
                      <PaymentMenu onDelete={() => setDeleteTarget(p)} />
                    </div>
                    <button
                      onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                    >
                      {(p.items ?? []).length} produto(s)
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
                    onChange={async e => {
                      const v = e.target.value
                      setNewForm(f => ({ ...f, seamstressId: v }))
                      if (v) await loadUnpaid(v)
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

                {loadingUnpaid ? (
                  <div className="py-4"><LoadingSpinner /></div>
                ) : newForm.seamstressId && unpaidItems.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">Peças a Pagar</p>
                    <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                      {unpaidItems.map((it, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{it.productName}</span>
                          <div className="text-slate-500 flex gap-4">
                            <span>{it.quantity} × {formatCurrency(it.unitValue)}</span>
                            <span className="font-semibold text-slate-700">{formatCurrency(it.totalValue)}</span>
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900">
                        <span>Total Geral</span>
                        <span>{formatCurrency(unpaidItems.reduce((s, it) => s + it.totalValue, 0))}</span>
                      </div>
                    </div>
                  </div>
                ) : newForm.seamstressId ? (
                  <p className="text-sm text-slate-400 text-center py-3">Nenhuma peça pendente de pagamento</p>
                ) : null}

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
                <button onClick={handleNewPayment} disabled={saving}
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
                será removido permanentemente.
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
    </AdminLayout>
  )
}
