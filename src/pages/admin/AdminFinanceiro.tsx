import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign, TrendingUp, AlertCircle, Clock, CheckCircle,
  Search, X, MessageCircle, Check, ChevronDown, ChevronUp,
  RefreshCw, Trash2,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { formatCurrency, formatDate, cn } from '@/utils'
import { supabase } from '@/lib/supabase'
import { useUsers } from '@/hooks/useData'
import { useAuth } from '@/contexts/AuthContext'
import { deleteReceivable, logAudit } from '@/services/db'
import type { FinancialReceivable, ReceivableStatus } from '@/types'

// ── helpers ────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function currentMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

function mapRow(r: Record<string, unknown>): FinancialReceivable {
  return {
    id: r.id as string,
    clientId: r.client_id as string,
    clientName: r.client_name as string,
    orderId: r.order_id as string,
    orderNumber: r.order_number as string,
    repId: r.rep_id as string,
    repName: r.rep_name as string,
    installmentNumber: r.installment_number as number,
    installmentTotal: r.installment_total as number,
    amount: Number(r.amount),
    dueDate: r.due_date as string,
    paymentDate: r.payment_date as string | undefined,
    paidAmount: Number(r.paid_amount),
    remainingAmount: Number(r.remaining_amount),
    status: r.status as ReceivableStatus,
    paymentMethod: r.payment_method as string | undefined,
    notes: r.notes as string | undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

// ── status badge ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ReceivableStatus, string> = {
  aberto: 'Aberto',
  parcial: 'Parcial',
  pago: 'Pago',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
}

const STATUS_CLASS: Record<ReceivableStatus, string> = {
  aberto: 'bg-blue-100 text-blue-700',
  parcial: 'bg-yellow-100 text-yellow-700',
  pago: 'bg-green-100 text-green-700',
  vencido: 'bg-red-100 text-red-700',
  cancelado: 'bg-slate-100 text-slate-500',
}

function StatusBadge({ status }: { status: ReceivableStatus }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', STATUS_CLASS[status])}>
      {STATUS_LABEL[status]}
    </span>
  )
}

// ── types ────────────────────────────────────────────────────────────────────

type StatusFilter = ReceivableStatus | 'todos'

const PAYMENT_METHODS = ['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão']

type KpiColor = 'blue' | 'indigo' | 'amber' | 'red' | 'green' | 'slate'

const KPI_ICON_CLASS: Record<KpiColor, string> = {
  blue: 'bg-blue-100 text-blue-600',
  indigo: 'bg-indigo-100 text-indigo-600',
  amber: 'bg-amber-100 text-amber-600',
  red: 'bg-red-100 text-red-600',
  green: 'bg-green-100 text-green-600',
  slate: 'bg-slate-100 text-slate-500',
}

function KpiCard({ label, value, icon, color }: {
  label: string
  value: string
  icon: React.ReactNode
  color: KpiColor
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-col gap-3">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', KPI_ICON_CLASS[color])}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-500 leading-tight">{label}</p>
        <p className="text-base font-bold text-slate-900 mt-0.5 leading-tight">{value}</p>
      </div>
    </div>
  )
}

// ── component ────────────────────────────────────────────────────────────────

export default function AdminFinanceiro() {
  const [receivables, setReceivables] = useState<FinancialReceivable[]>([])
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)

  // filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [repFilter, setRepFilter] = useState('todos')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // modal
  const [selected, setSelected] = useState<FinancialReceivable | null>(null)
  const [payValue, setPayValue] = useState('')
  const [payDate, setPayDate] = useState(today())
  const [payMethod, setPayMethod] = useState('PIX')
  const [payNotes, setPayNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // previsão
  const [cashOpen, setCashOpen] = useState(false)
  const [deleteTitle, setDeleteTitle] = useState<FinancialReceivable | null>(null)
  const [deletingTitle, setDeletingTitle] = useState(false)

  const { user } = useAuth()
  const { data: users = [] } = useUsers()
  const reps = users.filter(u => u.role === 'rep')

  // fetch
  useEffect(() => {
    setLoading(true)
    supabase
      ?.from('financial_receivables')
      .select('*')
      .order('due_date')
      .then(({ data }) => {
        setReceivables((data ?? []).map(r => mapRow(r as Record<string, unknown>)))
        setLoading(false)
      })
  }, [refresh])

  // filters
  const filtered = useMemo(() => receivables.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      r.clientName.toLowerCase().includes(q) ||
      r.orderNumber.toLowerCase().includes(q) ||
      r.repName.toLowerCase().includes(q)
    const matchStatus = statusFilter === 'todos' || r.status === statusFilter
    const matchRep = repFilter === 'todos' || r.repId === repFilter
    const matchFrom = !dateFrom || r.dueDate >= dateFrom
    const matchTo = !dateTo || r.dueDate <= dateTo
    return matchSearch && matchStatus && matchRep && matchFrom && matchTo
  }), [receivables, search, statusFilter, repFilter, dateFrom, dateTo])

  // KPIs
  const kpis = useMemo(() => {
    const { from: mFrom, to: mTo } = currentMonthRange()
    const t = today()
    const plus7 = addDays(7)

    const totalReceber = receivables
      .filter(r => ['aberto', 'parcial', 'vencido'].includes(r.status))
      .reduce((s, r) => s + r.remainingAmount, 0)

    const receberMes = receivables
      .filter(r => !['pago', 'cancelado'].includes(r.status) && r.dueDate >= mFrom && r.dueDate <= mTo)
      .reduce((s, r) => s + r.remainingAmount, 0)

    const vencendo7 = receivables
      .filter(r => !['pago', 'cancelado'].includes(r.status) && r.dueDate >= t && r.dueDate <= plus7)
      .reduce((s, r) => s + r.remainingAmount, 0)

    const emAtraso = receivables
      .filter(r => r.status === 'vencido')
      .reduce((s, r) => s + r.remainingAmount, 0)

    const recebidoMes = receivables
      .filter(r => r.paymentDate && r.paymentDate >= mFrom && r.paymentDate <= mTo)
      .reduce((s, r) => s + r.paidAmount, 0)

    const inadimplencia = totalReceber > 0 ? (emAtraso / totalReceber) * 100 : 0

    return { totalReceber, receberMes, vencendo7, emAtraso, recebidoMes, inadimplencia }
  }, [receivables])

  // previsão de caixa
  const cashFlow = useMemo(() => {
    const t = today()
    const periods = [
      { label: 'Hoje', max: 0 },
      { label: '7 dias', max: 7 },
      { label: '15 dias', max: 15 },
      { label: '30 dias', max: 30 },
      { label: '60 dias', max: 60 },
      { label: '90 dias', max: 90 },
    ]
    return periods.map(p => {
      const limit = addDays(p.max)
      const total = receivables
        .filter(r => !['pago', 'cancelado'].includes(r.status) && r.dueDate >= t && r.dueDate <= limit)
        .reduce((s, r) => s + r.remainingAmount, 0)
      return { label: p.label, total }
    })
  }, [receivables])

  // modal
  const openModal = (r: FinancialReceivable) => {
    setSelected(r)
    setPayValue(String(r.remainingAmount))
    setPayDate(today())
    setPayMethod('PIX')
    setPayNotes('')
  }

  const closeModal = () => setSelected(null)

  const confirmPayment = useCallback(async () => {
    if (!selected) return
    const amount = parseFloat(payValue)
    if (isNaN(amount) || amount <= 0) return

    setSaving(true)
    const newPaid = selected.paidAmount + amount
    const newRemaining = Math.max(0, selected.amount - newPaid)
    const newStatus: ReceivableStatus = newRemaining <= 0 ? 'pago' : 'parcial'

    await supabase
      ?.from('financial_receivables')
      .update({
        paid_amount: newPaid,
        remaining_amount: newRemaining,
        status: newStatus,
        payment_date: payDate,
        payment_method: payMethod,
        notes: payNotes || selected.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selected.id)

    setSaving(false)
    closeModal()
    setRefresh(prev => prev + 1)
  }, [selected, payValue, payDate, payMethod, payNotes])

  const handleDeleteTitle = async () => {
    if (!deleteTitle || !user) return
    setDeletingTitle(true)
    try {
      await deleteReceivable(deleteTitle.id)
      await logAudit({
        userId: user.id, userName: user.name, userRole: user.role,
        action: 'delete_financial_title', entity: 'financial_receivables', entityId: deleteTitle.id,
        description: `Título excluído — ${deleteTitle.clientName} | Pedido ${deleteTitle.orderNumber} | Parcela ${deleteTitle.installmentNumber}/${deleteTitle.installmentTotal} | Valor ${formatCurrency(deleteTitle.amount)} | Venc. ${formatDate(deleteTitle.dueDate)}`,
        timestamp: new Date().toISOString(),
      })
      setDeleteTitle(null)
      setRefresh(prev => prev + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir título')
    } finally {
      setDeletingTitle(false)
    }
  }

  // whatsapp
  const openWhatsapp = (r: FinancialReceivable) => {
    const msg = encodeURIComponent(
      `Olá, ${r.clientName}.\n` +
      `Identificamos uma parcela em aberto referente ao pedido ${r.orderNumber}.\n` +
      `Vencimento: ${formatDate(r.dueDate)}\n` +
      `Valor: ${formatCurrency(r.remainingAmount)}\n` +
      `Caso o pagamento já tenha sido realizado, favor desconsiderar.\n` +
      `Equipe ITADOG SALES.`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('todos')
    setRepFilter('todos')
    setDateFrom('')
    setDateTo('')
  }

  const hasFilters = search || statusFilter !== 'todos' || repFilter !== 'todos' || dateFrom || dateTo

  return (
    <AdminLayout title="Financeiro">
      <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Contas a Receber</h1>
            <p className="text-sm text-slate-500">{filtered.length} lançamentos</p>
          </div>
          <button
            onClick={() => setRefresh(prev => prev + 1)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Atualizar
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard
            label="Total a Receber"
            value={formatCurrency(kpis.totalReceber)}
            icon={<DollarSign className="w-5 h-5" />}
            color="blue"
          />
          <KpiCard
            label="A Receber no Mês"
            value={formatCurrency(kpis.receberMes)}
            icon={<TrendingUp className="w-5 h-5" />}
            color="indigo"
          />
          <KpiCard
            label="Vencendo em 7 dias"
            value={formatCurrency(kpis.vencendo7)}
            icon={<Clock className="w-5 h-5" />}
            color="amber"
          />
          <KpiCard
            label="Em Atraso"
            value={formatCurrency(kpis.emAtraso)}
            icon={<AlertCircle className="w-5 h-5" />}
            color="red"
          />
          <KpiCard
            label="Recebido no Mês"
            value={formatCurrency(kpis.recebidoMes)}
            icon={<CheckCircle className="w-5 h-5" />}
            color="green"
          />
          <KpiCard
            label="Inadimplência"
            value={`${kpis.inadimplencia.toFixed(1)}%`}
            icon={<AlertCircle className="w-5 h-5" />}
            color={kpis.inadimplencia > 20 ? 'red' : kpis.inadimplencia > 10 ? 'amber' : 'slate'}
          />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente, pedido..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="todos">Todos status</option>
              <option value="aberto">Aberto</option>
              <option value="parcial">Parcial</option>
              <option value="pago">Pago</option>
              <option value="vencido">Vencido</option>
              <option value="cancelado">Cancelado</option>
            </select>

            <select
              value={repFilter}
              onChange={e => setRepFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="todos">Todos representantes</option>
              {reps.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />

            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
              Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <DollarSign className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhum lançamento encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    {['Cliente', 'Pedido', 'Parcela', 'Vencimento', 'Valor', 'Recebido', 'Saldo', 'Status', 'Rep', 'Ações'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((r, i) => (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className={cn(
                        'hover:bg-slate-50 transition-colors',
                        r.status === 'vencido' && 'bg-red-50/40',
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 max-w-[160px] truncate">{r.clientName}</td>
                      <td className="px-4 py-3 text-slate-600">{r.orderNumber}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.installmentNumber}/{r.installmentTotal}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn('text-slate-600', r.status === 'vencido' && 'text-red-600 font-medium')}>
                          {formatDate(r.dueDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatCurrency(r.amount)}</td>
                      <td className="px-4 py-3 text-green-600 whitespace-nowrap">{formatCurrency(r.paidAmount)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(r.remainingAmount)}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3 text-slate-500 max-w-[120px] truncate">{r.repName}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {!['pago', 'cancelado'].includes(r.status) && (
                            <button
                              onClick={() => openModal(r)}
                              title="Registrar recebimento"
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-green-600 hover:bg-green-50 transition-colors"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openWhatsapp(r)}
                            title="Enviar cobrança via WhatsApp"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTitle(r)}
                            title="Excluir título"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Previsão de Caixa */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <button
            onClick={() => setCashOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary-600" />
              <span className="font-semibold text-slate-800">Previsão de Caixa</span>
              <span className="text-xs text-slate-400 font-normal">(recebíveis em aberto por período)</span>
            </div>
            {cashOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          <AnimatePresence>
            {cashOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-slate-100"
              >
                <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {cashFlow.map(p => (
                    <div key={p.label} className="bg-slate-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-slate-500 font-medium mb-1">{p.label}</p>
                      <p className="text-sm font-bold text-slate-800">{formatCurrency(p.total)}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* Payment Modal — bottom sheet */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mt-3 mb-5" />

              <div className="px-5 pb-8 space-y-5 max-h-[85dvh] overflow-y-auto">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Registrar Recebimento</h2>
                    <p className="text-sm text-slate-500">{selected.clientName} · Pedido {selected.orderNumber}</p>
                  </div>
                  <button
                    onClick={closeModal}
                    className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>

                {/* Resumo */}
                <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Parcela</span>
                    <span className="font-medium">{selected.installmentNumber}/{selected.installmentTotal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Vencimento</span>
                    <span className={cn('font-medium', selected.status === 'vencido' && 'text-red-600')}>
                      {formatDate(selected.dueDate)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Valor original</span>
                    <span className="font-medium">{formatCurrency(selected.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Já pago</span>
                    <span className="font-medium text-green-600">{formatCurrency(selected.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 mt-1">
                    <span className="text-slate-700 font-semibold">Saldo restante</span>
                    <span className="font-bold text-slate-900">{formatCurrency(selected.remainingAmount)}</span>
                  </div>
                </div>

                {/* Inputs */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Valor Recebido *</label>
                    <input
                      type="number"
                      min="0.01"
                      max={selected.remainingAmount}
                      step="0.01"
                      value={payValue}
                      onChange={e => setPayValue(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="0,00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Data do Pagamento *</label>
                    <input
                      type="date"
                      value={payDate}
                      onChange={e => setPayDate(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Forma de Pagamento</label>
                    <select
                      value={payMethod}
                      onChange={e => setPayMethod(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Observação</label>
                    <textarea
                      value={payNotes}
                      onChange={e => setPayNotes(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                      placeholder="Opcional..."
                    />
                  </div>
                </div>

                <button
                  onClick={confirmPayment}
                  disabled={saving || !payValue || parseFloat(payValue) <= 0}
                  className={cn(
                    'w-full py-3.5 rounded-2xl text-sm font-semibold transition-all',
                    saving || !payValue || parseFloat(payValue) <= 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-primary-600 text-white hover:bg-primary-700 active:scale-[0.98]',
                  )}
                >
                  {saving ? 'Salvando...' : 'Confirmar Pagamento'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal: Excluir Título Financeiro */}
      <AnimatePresence>
        {deleteTitle && (
          <>
            <motion.div
              key="del-title-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => !deletingTitle && setDeleteTitle(null)}
            />
            <motion.div
              key="del-title-modal"
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl p-5 pb-10 max-w-lg mx-auto"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Excluir Título Financeiro</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{deleteTitle.clientName} · Pedido {deleteTitle.orderNumber}</p>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 space-y-1.5">
                <p className="text-sm font-bold text-red-800">ATENÇÃO</p>
                <p className="text-sm text-red-700">Você está excluindo um título financeiro.</p>
                <p className="text-sm text-red-700 font-semibold">Esta ação não poderá ser desfeita.</p>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-1 text-xs text-slate-600">
                <div className="flex justify-between"><span>Parcela</span><span className="font-semibold">{deleteTitle.installmentNumber}/{deleteTitle.installmentTotal}</span></div>
                <div className="flex justify-between"><span>Vencimento</span><span className="font-semibold">{formatDate(deleteTitle.dueDate)}</span></div>
                <div className="flex justify-between"><span>Valor</span><span className="font-semibold">{formatCurrency(deleteTitle.amount)}</span></div>
                {deleteTitle.paidAmount > 0 && (
                  <div className="flex justify-between text-amber-700"><span>Valor pago</span><span className="font-semibold">{formatCurrency(deleteTitle.paidAmount)}</span></div>
                )}
                <div className="flex justify-between"><span>Representante</span><span className="font-semibold">{deleteTitle.repName}</span></div>
              </div>

              {deleteTitle.paidAmount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
                  <p className="text-xs text-amber-800 font-semibold">Existem pagamentos registrados neste título ({formatCurrency(deleteTitle.paidAmount)}). Confirme que deseja excluir mesmo assim.</p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setDeleteTitle(null)} disabled={deletingTitle} className="flex-1 btn-secondary">Cancelar</button>
                <button onClick={handleDeleteTitle} disabled={deletingTitle}
                  className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  {deletingTitle ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
