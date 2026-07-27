import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign, TrendingUp, AlertCircle, Clock, CheckCircle,
  Search, X, MessageCircle, Check, ChevronDown, ChevronUp,
  RefreshCw, Trash2, Scale,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { formatCurrency, formatDate, cn } from '@/utils'
import { supabase } from '@/lib/supabase'
import { useUsers } from '@/hooks/useData'
import { useAuth } from '@/contexts/AuthContext'
import { deleteReceivable, logAudit, registerPayment, writeOffReceivable } from '@/services/db'
import { WRITE_OFF_REASONS } from '@/types'
import type { FinancialReceivable, ReceivableStatus, WriteOffReason } from '@/types'

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

function nextMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10)
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
    hasWriteOff: Boolean(r.has_write_off),
    writeOffAmount: Number(r.write_off_amount) || 0,
    writeOffReason: r.write_off_reason as WriteOffReason | undefined,
    writeOffDescription: r.write_off_description as string | undefined,
    writeOffBy: r.write_off_by as string | undefined,
    writeOffByName: r.write_off_by_name as string | undefined,
    writeOffAt: r.write_off_at as string | undefined,
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

function StatusBadge({ status, hasWriteOff, writeOffReason }: { status: ReceivableStatus; hasWriteOff?: boolean; writeOffReason?: string }) {
  if (status === 'pago' && hasWriteOff) {
    return (
      <span
        title={writeOffReason ? `Liquidado com abatimento — ${writeOffReason}` : 'Liquidado com abatimento'}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 whitespace-nowrap"
      >
        Liquidado <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', STATUS_CLASS[status])}>
      {STATUS_LABEL[status]}
    </span>
  )
}

// Atraso é DERIVADO da data (não apenas do status armazenado): um título
// "aberto" ou "parcial" com vencimento anterior a hoje está EM ATRASO, mesmo
// que o status gravado continue "aberto" (o sistema não vira o status para
// "vencido" automaticamente). Um status já gravado como "vencido" (definido
// por outra tela, ex. getReceivables()) também conta. Toda a tela usa estes
// helpers como fonte da verdade.
function isOverdue(r: FinancialReceivable): boolean {
  return r.status === 'vencido' || ((r.status === 'aberto' || r.status === 'parcial') && r.dueDate < today())
}
function isDueToday(r: FinancialReceivable): boolean {
  return (r.status === 'aberto' || r.status === 'parcial') && r.dueDate === today()
}

// ── forma de pagamento (vem do pedido) ───────────────────────────────────────

type OrderInfo = { paymentMethod: string; paymentTerms: string; saleDate: string; deliveryDate: string }

const PAY_METHODS_FILTER = ['PIX', 'Boleto', 'Cheque', 'Dinheiro', 'Cartão', 'Transferência', 'Pago Parcial']

const METHOD_CLASS: Record<string, string> = {
  'PIX': 'bg-green-100 text-green-700',
  'Boleto': 'bg-orange-100 text-orange-700',
  'Cheque': 'bg-purple-100 text-purple-700',
  'Transferência': 'bg-blue-100 text-blue-700',
  'Dinheiro': 'bg-yellow-100 text-yellow-700',
  'Cartão': 'bg-slate-200 text-slate-700',
  'Pago Parcial': 'bg-amber-100 text-amber-800',
}

function PaymentMethodBadge({ method }: { method: string }) {
  if (!method) return <span className="text-xs text-slate-300">—</span>
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap', METHOD_CLASS[method] ?? 'bg-slate-100 text-slate-600')}>
      {method}
    </span>
  )
}

// ── types ────────────────────────────────────────────────────────────────────

type StatusFilter = ReceivableStatus | 'todos'

const PAYMENT_METHODS = ['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão', 'Cheque']

// Detecta título originado de cheque de forma estável (o payment_method pode
// ser sobrescrito ao registrar o recebimento; as notas começam com "Cheque").
function isCheckReceivable(r: FinancialReceivable): boolean {
  return r.paymentMethod === 'Cheque' || (r.notes ?? '').startsWith('Cheque')
}

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
  const [orderMap, setOrderMap] = useState<Record<string, OrderInfo>>({})
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)

  // filters
  const [search, setSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState('todos')
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
  const [writeOffReason, setWriteOffReason] = useState<WriteOffReason | ''>('')
  const [writeOffDescription, setWriteOffDescription] = useState('')
  const [writingOff, setWritingOff] = useState(false)

  // previsão
  const [cashOpen, setCashOpen] = useState(false)
  const [deleteTitle, setDeleteTitle] = useState<FinancialReceivable | null>(null)
  const [deletingTitle, setDeletingTitle] = useState(false)

  const { user } = useAuth()
  const { data: users = [] } = useUsers()
  const reps = users.filter(u => u.role === 'rep')

  // fetch — recebíveis + mapa de pedidos (forma/condição/datas vêm do pedido)
  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase?.from('financial_receivables').select('*').order('due_date'),
      supabase?.from('orders').select('id, payment_method, payment_terms, sale_date, delivery_date'),
    ]).then(([recRes, ordRes]) => {
      setReceivables(((recRes?.data ?? []) as Record<string, unknown>[]).map(r => mapRow(r)))
      const map: Record<string, OrderInfo> = {}
      ;((ordRes?.data ?? []) as Record<string, unknown>[]).forEach(o => {
        map[o.id as string] = {
          paymentMethod: (o.payment_method as string) ?? '',
          paymentTerms: (o.payment_terms as string) ?? '',
          saleDate: (o.sale_date as string) ?? '',
          deliveryDate: (o.delivery_date as string) ?? '',
        }
      })
      setOrderMap(map)
      setLoading(false)
    })
  }, [refresh])

  const formaOf = useCallback((r: FinancialReceivable) => orderMap[r.orderId]?.paymentMethod ?? '', [orderMap])

  // filters
  const filtered = useMemo(() => receivables.filter(r => {
    const q = search.toLowerCase()
    const forma = formaOf(r)
    const matchSearch = !q ||
      r.clientName.toLowerCase().includes(q) ||
      r.orderNumber.toLowerCase().includes(q) ||
      r.repName.toLowerCase().includes(q) ||
      forma.toLowerCase().includes(q)
    // "vencido" no filtro = atraso derivado (título aberto/parcial vencido)
    const matchStatus = statusFilter === 'todos'
      || (statusFilter === 'vencido' ? isOverdue(r) : r.status === statusFilter && !isOverdue(r))
    const matchRep = repFilter === 'todos' || r.repId === repFilter
    const matchMethod = methodFilter === 'todos' || forma === methodFilter
    const matchFrom = !dateFrom || r.dueDate >= dateFrom
    const matchTo = !dateTo || r.dueDate <= dateTo
    return matchSearch && matchStatus && matchRep && matchMethod && matchFrom && matchTo
  }), [receivables, search, statusFilter, repFilter, methodFilter, dateFrom, dateTo, formaOf])

  // Ordena por prioridade de cobrança: atraso → vence hoje → próximos → demais
  const sortedFiltered = useMemo(() => {
    const rank = (r: FinancialReceivable) => {
      if (['pago', 'cancelado'].includes(r.status)) return 4
      if (isOverdue(r)) return 0
      if (isDueToday(r)) return 1
      return 2
    }
    return [...filtered].sort((a, b) => rank(a) - rank(b) || a.dueDate.localeCompare(b.dueDate))
  }, [filtered])

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

    const { from: nFrom, to: nTo } = nextMonthRange()
    const receberProximoMes = receivables
      .filter(r => !['pago', 'cancelado'].includes(r.status) && r.dueDate >= nFrom && r.dueDate <= nTo)
      .reduce((s, r) => s + r.remainingAmount, 0)

    const vencendo7 = receivables
      .filter(r => !['pago', 'cancelado'].includes(r.status) && r.dueDate >= t && r.dueDate <= plus7)
      .reduce((s, r) => s + r.remainingAmount, 0)

    // EM ATRASO = vencidos derivados (aberto/parcial com vencimento < hoje)
    const emAtraso = receivables
      .filter(isOverdue)
      .reduce((s, r) => s + r.remainingAmount, 0)

    const recebidoMes = receivables
      .filter(r => r.paymentDate && r.paymentDate >= mFrom && r.paymentDate <= mTo)
      .reduce((s, r) => s + r.paidAmount, 0)

    const inadimplencia = totalReceber > 0 ? (emAtraso / totalReceber) * 100 : 0

    // ── Cheques ──
    const chequeRecs = receivables.filter(r => isCheckReceivable(r) && r.status !== 'cancelado')
    const valoresCheque = chequeRecs.reduce((s, r) => s + r.amount, 0)
    const chequesACompensar = chequeRecs
      .filter(r => r.status === 'aberto' || r.status === 'parcial')
      .reduce((s, r) => s + r.remainingAmount, 0)
    const chequesCompensados = chequeRecs.reduce((s, r) => s + r.paidAmount, 0)
    const temCheques = chequeRecs.length > 0

    // ── Abatimentos (baixa com diferença) — mês da baixa ──
    const writeOffsMes = receivables.filter(r => r.hasWriteOff && r.writeOffAt && r.writeOffAt.slice(0, 10) >= mFrom && r.writeOffAt.slice(0, 10) <= mTo)
    const totalAbatidoMes = writeOffsMes.reduce((s, r) => s + r.writeOffAmount, 0)
    const abatidoPorMotivo = (motivo: WriteOffReason) =>
      writeOffsMes.filter(r => r.writeOffReason === motivo).reduce((s, r) => s + r.writeOffAmount, 0)
    const descontosConcedidosMes = abatidoPorMotivo('Desconto Comercial')
    const trocasMercadoriaMes = abatidoPorMotivo('Troca de Mercadoria')
    const perdasFinanceirasMes = abatidoPorMotivo('Perda Financeira')
    const ajustesComerciaisMes = abatidoPorMotivo('Ajuste Comercial')
    const temAbatimentos = writeOffsMes.length > 0

    return { totalReceber, receberMes, receberProximoMes, vencendo7, emAtraso, recebidoMes, inadimplencia,
      valoresCheque, chequesACompensar, chequesCompensados, temCheques,
      totalAbatidoMes, descontosConcedidosMes, trocasMercadoriaMes, perdasFinanceirasMes, ajustesComerciaisMes, temAbatimentos }
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
    setWriteOffReason('')
    setWriteOffDescription('')
  }

  const closeModal = () => setSelected(null)

  // Saldo que ficaria em aberto após este pagamento — dispara a oferta de baixa com abatimento
  const saldoAposPagamento = selected
    ? Math.max(0, selected.amount - (selected.paidAmount + Math.max(0, parseFloat(payValue) || 0)))
    : 0
  const temSaldoParaAbater = saldoAposPagamento > 0.004
  const writeOffValido = writeOffReason !== '' && (writeOffReason !== 'Outro' || writeOffDescription.trim().length > 0)

  const confirmPayment = useCallback(async () => {
    if (!selected || !user) return
    const amount = parseFloat(payValue)
    if (isNaN(amount) || amount <= 0) return

    setSaving(true)
    try {
      await registerPayment({
        id: selected.id,
        paidAmount: amount,
        paymentDate: payDate,
        paymentMethod: payMethod,
        notes: payNotes || selected.notes,
        userId: user.id,
        userName: user.name,
      })
      closeModal()
      setRefresh(prev => prev + 1)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao registrar pagamento')
    } finally {
      setSaving(false)
    }
  }, [selected, user, payValue, payDate, payMethod, payNotes])

  const confirmWriteOff = useCallback(async () => {
    if (!selected || !user || !writeOffValido) return
    const amount = Math.max(0, parseFloat(payValue) || 0)

    setWritingOff(true)
    try {
      await writeOffReceivable({
        id: selected.id,
        paidAmount: amount,
        paymentDate: payDate,
        paymentMethod: payMethod,
        writeOffReason: writeOffReason as WriteOffReason,
        writeOffDescription: writeOffReason === 'Outro' ? writeOffDescription.trim() : undefined,
        notes: payNotes || selected.notes,
        userId: user.id,
        userName: user.name,
      })
      closeModal()
      setRefresh(prev => prev + 1)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao baixar saldo remanescente')
    } finally {
      setWritingOff(false)
    }
  }, [selected, user, writeOffValido, payValue, payDate, payMethod, writeOffReason, writeOffDescription, payNotes])

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
    const atraso = isOverdue(r)
    const msg = encodeURIComponent(
      `Olá, ${r.clientName}, tudo bem?\n` +
      `Identificamos um título ${atraso ? 'em atraso' : 'em aberto'} referente ao pedido ${r.orderNumber}.\n` +
      `Vencimento: ${formatDate(r.dueDate)}\n` +
      `Valor: ${formatCurrency(r.remainingAmount)}\n` +
      `Poderia nos confirmar a previsão de pagamento?\n` +
      `Caso o pagamento já tenha sido realizado, favor desconsiderar.\n` +
      `Equipe ITADOG.`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('todos')
    setRepFilter('todos')
    setMethodFilter('todos')
    setDateFrom('')
    setDateTo('')
  }

  const hasFilters = search || statusFilter !== 'todos' || repFilter !== 'todos' || methodFilter !== 'todos' || dateFrom || dateTo

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
            label="Receber Próximo Mês"
            value={formatCurrency(kpis.receberProximoMes)}
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

        {/* Indicadores de Cheque (só quando há cheques) */}
        {kpis.temCheques && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <KpiCard label="Valores em Cheque" value={formatCurrency(kpis.valoresCheque)} icon={<DollarSign className="w-5 h-5" />} color="indigo" />
            <KpiCard label="Cheques a Compensar" value={formatCurrency(kpis.chequesACompensar)} icon={<Clock className="w-5 h-5" />} color="amber" />
            <KpiCard label="Cheques Compensados" value={formatCurrency(kpis.chequesCompensados)} icon={<CheckCircle className="w-5 h-5" />} color="green" />
          </div>
        )}

        {/* Indicadores de Abatimento (só quando há baixas com diferença no mês) */}
        {kpis.temAbatimentos && (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <KpiCard label="Total Abatido (Mês)" value={formatCurrency(kpis.totalAbatidoMes)} icon={<Scale className="w-5 h-5" />} color="slate" />
            <KpiCard label="Descontos Concedidos" value={formatCurrency(kpis.descontosConcedidosMes)} icon={<Scale className="w-5 h-5" />} color="indigo" />
            <KpiCard label="Abatido em Trocas" value={formatCurrency(kpis.trocasMercadoriaMes)} icon={<Scale className="w-5 h-5" />} color="amber" />
            <KpiCard label="Perdas Financeiras" value={formatCurrency(kpis.perdasFinanceirasMes)} icon={<Scale className="w-5 h-5" />} color="red" />
            <KpiCard label="Ajustes Comerciais" value={formatCurrency(kpis.ajustesComerciaisMes)} icon={<Scale className="w-5 h-5" />} color="blue" />
          </div>
        )}

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
              <option value="vencido">Em Atraso</option>
              <option value="aberto">Aberto (a vencer)</option>
              <option value="parcial">Parcial</option>
              <option value="pago">Pago</option>
              <option value="cancelado">Cancelado</option>
            </select>

            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="todos">Toda forma de pagto</option>
              {PAY_METHODS_FILTER.map(m => <option key={m} value={m}>{m}</option>)}
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

        {/* Table / Cards */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <DollarSign className="w-8 h-8 opacity-30" />
              <p className="text-sm">Nenhum lançamento encontrado</p>
            </div>
          ) : (
            <>
              {/* ── Desktop table (md+) ────────────────────────────────── */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left bg-slate-50/60">
                      <th style={{ minWidth: 200 }} className="px-2.5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cliente</th>
                      <th className="px-2.5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Pedido</th>
                      <th className="px-2.5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap text-center">Parcela</th>
                      <th className="px-2.5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Forma Pag.</th>
                      <th className="px-2.5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Vencimento</th>
                      <th className="px-2.5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap text-right">Valor</th>
                      <th className="px-2.5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap text-right">A Receber</th>
                      <th className="px-2.5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                      <th className="px-2.5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Rep</th>
                      <th className="px-2.5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sortedFiltered.map((r, i) => {
                      const overdue = isOverdue(r)
                      return (
                        <motion.tr
                          key={r.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className={cn('hover:bg-slate-50/80 transition-colors', overdue && 'bg-red-50 hover:bg-red-50')}
                        >
                          {/* Cliente — prioridade máxima: tooltip + min-width generoso */}
                          <td
                            title={r.clientName}
                            style={{ minWidth: 200, maxWidth: 300 }}
                            className={cn('px-2.5 py-2.5 font-medium', overdue ? 'text-red-700' : 'text-slate-900')}
                          >
                            <span className="block truncate">{r.clientName}</span>
                          </td>
                          <td className="px-2.5 py-2.5 text-slate-500 whitespace-nowrap font-mono text-xs">{r.orderNumber}</td>
                          <td className="px-2.5 py-2.5 text-slate-500 whitespace-nowrap text-center">{r.installmentNumber}/{r.installmentTotal}</td>
                          <td className="px-2.5 py-2.5"><PaymentMethodBadge method={formaOf(r)} /></td>
                          <td className="px-2.5 py-2.5 whitespace-nowrap">
                            <span className={cn(overdue ? 'text-red-600 font-semibold' : 'text-slate-600')}>{formatDate(r.dueDate)}</span>
                          </td>
                          <td className="px-2.5 py-2.5 text-slate-500 whitespace-nowrap text-right text-xs">{formatCurrency(r.amount)}</td>
                          <td className={cn('px-2.5 py-2.5 font-semibold whitespace-nowrap text-right', overdue ? 'text-red-600' : 'text-slate-900')}>
                            {formatCurrency(r.remainingAmount)}
                          </td>
                          <td className="px-2.5 py-2.5">
                            {overdue
                              ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 whitespace-nowrap">EM ATRASO</span>
                              : <StatusBadge status={r.status} hasWriteOff={r.hasWriteOff} writeOffReason={r.writeOffReason} />}
                          </td>
                          <td className="px-2.5 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                            {r.repName.split(' ').slice(0, 2).join(' ')}
                          </td>
                          <td className="px-2.5 py-2.5">
                            <div className="flex items-center gap-0.5">
                              {!['pago', 'cancelado'].includes(r.status) && (
                                <button onClick={() => openModal(r)} title="Registrar recebimento"
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-green-600 hover:bg-green-50 transition-colors">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button onClick={() => openWhatsapp(r)} title="Enviar cobrança via WhatsApp"
                                className={cn('w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                                  overdue ? 'bg-red-500 text-white hover:bg-red-600' : 'text-emerald-600 hover:bg-emerald-50')}>
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setDeleteTitle(r)} title="Excluir título"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-red-300 hover:bg-red-50 hover:text-red-600 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Mobile cards (< md) ────────────────────────────────── */}
              <div className="md:hidden divide-y divide-slate-100">
                {sortedFiltered.map((r, i) => {
                  const overdue = isOverdue(r)
                  return (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className={cn('p-4 space-y-3', overdue ? 'bg-red-50' : 'bg-white')}
                    >
                      {/* Nome completo + status */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-semibold text-sm leading-snug', overdue ? 'text-red-700' : 'text-slate-900')}>
                            {r.clientName}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {r.orderNumber} · Parcela {r.installmentNumber}/{r.installmentTotal}
                          </p>
                        </div>
                        <div className="flex-shrink-0 pt-0.5">
                          {overdue
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 whitespace-nowrap">EM ATRASO</span>
                            : <StatusBadge status={r.status} hasWriteOff={r.hasWriteOff} writeOffReason={r.writeOffReason} />}
                        </div>
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="text-slate-400 mb-0.5">Vencimento</p>
                          <p className={cn('font-semibold', overdue ? 'text-red-600' : 'text-slate-700')}>
                            {formatDate(r.dueDate)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400 mb-0.5">A Receber</p>
                          <p className={cn('font-bold', overdue ? 'text-red-600' : 'text-slate-900')}>
                            {formatCurrency(r.remainingAmount)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400 mb-0.5">Forma Pag.</p>
                          <PaymentMethodBadge method={formaOf(r)} />
                        </div>
                      </div>

                      {/* Rep + ações */}
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                          {r.repName.split(' ').slice(0, 2).join(' ')}
                        </p>
                        <div className="flex items-center gap-1">
                          {!['pago', 'cancelado'].includes(r.status) && (
                            <button onClick={() => openModal(r)} title="Registrar recebimento"
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 transition-colors">
                              <Check className="w-3.5 h-3.5" /> Receber
                            </button>
                          )}
                          <button onClick={() => openWhatsapp(r)} title="WhatsApp"
                            className={cn('w-8 h-8 rounded-xl flex items-center justify-center transition-colors',
                              overdue ? 'bg-red-500 text-white' : 'bg-emerald-50 text-emerald-600')}>
                            <MessageCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => setDeleteTitle(r)} title="Excluir"
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-red-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </>
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

                {/* Dados do pedido (para a cobrança) */}
                <div className="bg-primary-50 border border-primary-100 rounded-2xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cliente</span>
                    <span className="font-semibold text-slate-800 text-right max-w-[60%] truncate">{selected.clientName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pedido</span>
                    <span className="font-medium text-slate-700">{selected.orderNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Representante</span>
                    <span className="font-medium text-slate-700">{selected.repName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Forma de pagamento</span>
                    <PaymentMethodBadge method={orderMap[selected.orderId]?.paymentMethod ?? ''} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Condição</span>
                    <span className="font-medium text-slate-700">{orderMap[selected.orderId]?.paymentTerms || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Data da venda</span>
                    <span className="font-medium text-slate-700">{orderMap[selected.orderId]?.saleDate ? formatDate(orderMap[selected.orderId].saleDate) : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Data de entrega</span>
                    <span className="font-medium text-slate-700">{orderMap[selected.orderId]?.deliveryDate ? formatDate(orderMap[selected.orderId].deliveryDate) : '—'}</span>
                  </div>
                </div>

                {/* Resumo */}
                <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Parcela</span>
                    <span className="font-medium">{selected.installmentNumber}/{selected.installmentTotal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Vencimento</span>
                    <span className={cn('font-medium', isOverdue(selected) && 'text-red-600')}>
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
                      min="0"
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

                {/* Diferença entre saldo e valor recebido — baixa com abatimento */}
                {temSaldoParaAbater && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                    <p className="text-sm text-amber-800">
                      Existe um saldo restante de <strong>{formatCurrency(saldoAposPagamento)}</strong>. Como deseja tratar essa diferença?
                    </p>

                    <div>
                      <label className="block text-xs font-medium text-amber-800 mb-1.5">Motivo da diferença</label>
                      <select
                        value={writeOffReason}
                        onChange={e => setWriteOffReason(e.target.value as WriteOffReason | '')}
                        className="w-full px-3 py-2.5 text-sm border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                      >
                        <option value="">Selecione um motivo...</option>
                        {WRITE_OFF_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>

                    {writeOffReason === 'Outro' && (
                      <div>
                        <label className="block text-xs font-medium text-amber-800 mb-1.5">Descrição *</label>
                        <textarea
                          value={writeOffDescription}
                          onChange={e => setWriteOffDescription(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2.5 text-sm border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                          placeholder="Descreva o motivo..."
                        />
                      </div>
                    )}

                    <button
                      onClick={confirmWriteOff}
                      disabled={writingOff || !writeOffValido}
                      className={cn(
                        'w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5',
                        writingOff || !writeOffValido
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-amber-600 text-white hover:bg-amber-700 active:scale-[0.98]',
                      )}
                    >
                      <Scale className="w-4 h-4" />
                      {writingOff ? 'Baixando...' : 'Baixar Saldo Remanescente'}
                    </button>
                  </div>
                )}

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
