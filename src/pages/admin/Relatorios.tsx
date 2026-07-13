/**
 * Central de Relatórios — ITADOG Sales
 * Exportação profissional em Excel e PDF para todos os módulos
 */
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingCart, Users, Package, DollarSign, UserCheck, MapPin,
  FileSpreadsheet, FileText, ChevronDown, ChevronUp, Search, AlertCircle,
  CheckCircle, Clock,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import {
  useOrders, useClients, useUsers, useVisits, useAllProducts,
  useReceivables, useRepRanking,
} from '@/hooks/useData'
import { formatCurrency, formatDate, cn } from '@/utils'
import { saleDateOf, type OrderStatus } from '@/types'
import {
  exportExcel, exportPDF,
  ORDER_STATUS_PT, VISIT_RESULT_PT, RECEIVABLE_STATUS_PT,
  fmtDate, fmtCurrency, daysBetween,
  periodRange, type PeriodKey, PERIOD_LABELS,
  type XCol, type PCol,
} from '@/services/reportExport'

// ── Types ────────────────────────────────────────────────────
type ReportType = 'pedidos' | 'clientes' | 'contas' | 'representantes' | 'visitas' | 'produtos' | 'trocas'

const REPORT_TABS: { key: ReportType; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'pedidos',        label: 'Pedidos',           icon: ShoppingCart,  desc: 'Todos os pedidos com status, tempo, pagamento'  },
  { key: 'clientes',       label: 'Clientes',          icon: Users,         desc: 'Cadastro completo dos clientes'                  },
  { key: 'contas',         label: 'Contas a Receber',  icon: DollarSign,    desc: 'Parcelas vencidas, a vencer e pagas'             },
  { key: 'representantes', label: 'Representantes',    icon: UserCheck,     desc: 'Performance, faturamento e metas'                },
  { key: 'visitas',        label: 'Visitas',           icon: MapPin,        desc: 'Histórico de visitas e resultados'               },
  { key: 'produtos',       label: 'Produtos',          icon: Package,       desc: 'Catálogo e quantidade vendida'                   },
  { key: 'trocas',         label: 'Trocas',            icon: Package,       desc: 'Pedidos de troca — sem impacto financeiro'       },
]

// ── Status colors (UI) ──────────────────────────────────────
const STATUS_UI: Record<OrderStatus, string> = {
  draft:                  'bg-slate-100 text-slate-600',
  generated:              'bg-blue-100 text-blue-700',
  pending_separation:     'bg-amber-100 text-amber-700',
  separation:             'bg-orange-100 text-orange-700',
  invoiced_ready_to_ship: 'bg-green-100 text-green-700',
  partial_delivery:       'bg-teal-100 text-teal-700',
  delivered:              'bg-emerald-100 text-emerald-800',
}

// ── Period selector component ────────────────────────────────
function PeriodPicker({
  value, onChange, from, to, onFromChange, onToChange,
}: {
  value: PeriodKey
  onChange: (k: PeriodKey) => void
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {(['current','prev','3months','year','all','custom'] as PeriodKey[]).map(k => (
          <button key={k} onClick={() => onChange(k)}
            className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border',
              value === k
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50')}>
            {PERIOD_LABELS[k]}
          </button>
        ))}
      </div>
      {value === 'custom' && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-slate-400 block mb-1">De</label>
            <input type="date" value={from} onChange={e => onFromChange(e.target.value)} className="input text-sm" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-400 block mb-1">Até</label>
            <input type="date" value={to} onChange={e => onToChange(e.target.value)} className="input text-sm" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Export buttons ───────────────────────────────────────────
function ExportBar({ onExcel, onPDF, count }: { onExcel: () => void; onPDF: () => void; count: number }) {
  return (
    <div className="flex items-center justify-between py-2">
      <p className="text-xs text-slate-500">{count} registro(s)</p>
      <div className="flex gap-2">
        <button onClick={onPDF}
          className="flex items-center gap-1.5 text-xs font-semibold text-red-700 border border-red-200 bg-red-50 px-3 py-1.5 rounded-xl hover:bg-red-100 transition-colors">
          <FileText className="w-3.5 h-3.5" /> PDF
        </button>
        <button onClick={onExcel}
          className="flex items-center gap-1.5 text-xs font-semibold text-green-700 border border-green-200 bg-green-50 px-3 py-1.5 rounded-xl hover:bg-green-100 transition-colors">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
        </button>
      </div>
    </div>
  )
}

// ── Preview table wrapper ────────────────────────────────────
function PreviewTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        {children}
      </table>
    </div>
  )
}

function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={cn('px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-white bg-[#1E3A8A] whitespace-nowrap', right && 'text-right')}>
      {children}
    </th>
  )
}

function TD({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <td className={cn('px-3 py-2 text-slate-700 whitespace-nowrap', right && 'text-right', className)}>
      {children}
    </td>
  )
}

// ─────────────────────────────────────────────────────────────
// RELATÓRIO: PEDIDOS
// ─────────────────────────────────────────────────────────────
function RelatorioPedidos() {
  const { data: allOrders = [], loading } = useOrders()
  const { data: users = [] } = useUsers()

  const [periodKey, setPeriodKey] = useState<PeriodKey>('current')
  const [dateFrom, setDateFrom] = useState(() => periodRange('current').from)
  const [dateTo,   setDateTo]   = useState(() => periodRange('current').to)
  const [statusF,  setStatusF]  = useState<OrderStatus | 'todos'>('todos')
  const [repF,     setRepF]     = useState('todos')
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    if (periodKey !== 'custom') {
      const r = periodRange(periodKey)
      setDateFrom(r.from); setDateTo(r.to)
    }
  }, [periodKey])

  const reps = users.filter(u => u.role === 'rep')
  const today = new Date().toISOString().slice(0, 10)

  const data = useMemo(() => allOrders.filter(o => {
    const d = saleDateOf(o).slice(0, 10)
    const matchDate   = (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo)
    const matchStatus = statusF === 'todos' || o.status === statusF
    const matchRep    = repF === 'todos' || o.repId === repF
    const matchSearch = !search || o.clientName.toLowerCase().includes(search.toLowerCase()) || o.number.toLowerCase().includes(search.toLowerCase())
    return matchDate && matchStatus && matchRep && matchSearch && !o.isDeleted
  }), [allOrders, dateFrom, dateTo, statusF, repF, search])

  function orderDays(o: (typeof data)[0]) {
    const start = saleDateOf(o).slice(0, 10)
    const end   = o.deliveredAt?.slice(0, 10) ?? today
    return daysBetween(start, end)
  }

  function installmentCount(terms?: string) {
    if (!terms) return '—'
    const n = (terms.match(/\//g) ?? []).length + 1
    return n === 1 ? '1x' : `${n}x`
  }

  const XCOLS: XCol[] = [
    { header: 'Nº Pedido',        key: 'number',         width: 12, align: 'center' },
    { header: 'Data da Venda',     key: 'saleDate',       width: 13, align: 'center' },
    { header: 'Data de Entrega',   key: 'deliveryDate',   width: 13, align: 'center' },
    { header: 'Cliente',           key: 'clientName',     width: 28 },
    { header: 'Cidade',            key: 'clientCity',     width: 16 },
    { header: 'Representante',     key: 'repName',        width: 18 },
    { header: 'Valor Total',       key: 'total',          width: 14, align: 'right',  numFmt: '"R$" #,##0.00', red: (_v, r) => Boolean(r._late) },
    { header: 'Forma Pag.',        key: 'paymentMethod',  width: 14 },
    { header: 'Condição',          key: 'paymentTerms',   width: 14, align: 'center' },
    { header: 'Parcelas',          key: 'installments',   width: 10, align: 'center' },
    { header: 'Status',            key: 'statusPT',       width: 22 },
    { header: 'Tempo (dias)',      key: 'days',           width: 12, align: 'center', red: (v) => Number(v) > 7 },
    { header: 'Observações',       key: 'notes',          width: 30 },
  ]

  function buildRows() {
    return data.map(o => {
      const days = orderDays(o)
      return {
        number:        o.number,
        saleDate:      fmtDate(saleDateOf(o)),
        deliveryDate:  fmtDate(o.deliveryDate),
        clientName:    o.clientName,
        clientCity:    o.clientCity ?? '',
        repName:       o.repName,
        total:         o.total,
        paymentMethod: o.paymentMethod ?? '',
        paymentTerms:  o.paymentTerms ?? '',
        installments:  installmentCount(o.paymentTerms),
        statusPT:      ORDER_STATUS_PT[o.status],
        days,
        notes:         o.notes ?? '',
        _late:         days > 7,
      }
    })
  }

  const rows = useMemo(buildRows, [data])

  const PCOLS: PCol[] = [
    { header: 'Nº', key: 'number', width: '7%', align: 'center' },
    { header: 'Data Venda', key: 'saleDate', width: '8%', align: 'center' },
    { header: 'Entrega', key: 'deliveryDate', width: '8%', align: 'center' },
    { header: 'Cliente', key: 'clientName', width: '16%' },
    { header: 'Cidade', key: 'clientCity', width: '8%' },
    { header: 'Rep', key: 'repName', width: '9%' },
    { header: 'Valor', key: 'totalFmt', width: '8%', align: 'right' },
    { header: 'Pagamento', key: 'paymentMethod', width: '8%' },
    { header: 'Condição', key: 'paymentTerms', width: '8%', align: 'center' },
    { header: 'Parcelas', key: 'installments', width: '6%', align: 'center' },
    { header: 'Status', key: 'statusPT', width: '11%' },
    { header: 'Dias', key: 'days', width: '5%', align: 'center' },
    { header: 'Obs.', key: 'notes', width: '8%' },
  ]

  function pdfRows() {
    return rows.map(r => ({ ...r, totalFmt: fmtCurrency(r.total as number) }))
  }

  const desc = dateFrom && dateTo ? `${fmtDate(dateFrom)} a ${fmtDate(dateTo)}` : 'Todos os períodos'

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4 space-y-3">
        <PeriodPicker value={periodKey} onChange={setPeriodKey} from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="input pl-8 text-sm" />
          </div>
          <select value={statusF} onChange={e => setStatusF(e.target.value as OrderStatus | 'todos')} className="input text-sm">
            <option value="todos">Todo status</option>
            {(Object.entries(ORDER_STATUS_PT) as [OrderStatus, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select value={repF} onChange={e => setRepF(e.target.value)} className="input text-sm">
            <option value="todos">Todos os reps</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>

      <ExportBar count={data.length}
        onExcel={() => exportExcel('Pedidos', desc, XCOLS, rows, 'pedidos')}
        onPDF={() => exportPDF('Pedidos', desc, PCOLS, pdfRows(), {
          red: r => Number(r.days) > 7,
        })}
      />

      {loading ? <LoadingSpinner /> : (
        <PreviewTable>
          <thead>
            <tr>
              <TH>Nº</TH><TH>Data Venda</TH><TH>Cliente</TH><TH>Cidade</TH>
              <TH>Rep</TH><TH right>Valor</TH><TH>Forma Pag.</TH><TH>Condição</TH>
              <TH right>Dias</TH><TH>Status</TH>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 100).map((o, i) => {
              const days = orderDays(o)
              const late = days > 7
              return (
                <tr key={o.id} className={cn(i % 2 === 0 ? 'bg-white' : 'bg-slate-50', late && 'bg-red-50')}>
                  <TD className="font-mono font-semibold">{o.number}</TD>
                  <TD>{fmtDate(saleDateOf(o))}</TD>
                  <TD className="max-w-[160px] truncate">{o.clientName}</TD>
                  <TD>{o.clientCity ?? '—'}</TD>
                  <TD>{o.repName.split(' ')[0]}</TD>
                  <TD right className={cn('font-semibold', late && 'text-red-600')}>{fmtCurrency(o.total)}</TD>
                  <TD>{o.paymentMethod ?? '—'}</TD>
                  <TD className="text-center">{o.paymentTerms ?? '—'}</TD>
                  <TD right className={cn(late && 'text-red-600 font-bold')}>{days}d</TD>
                  <TD>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', STATUS_UI[o.status])}>
                      {ORDER_STATUS_PT[o.status]}
                    </span>
                  </TD>
                </tr>
              )
            })}
          </tbody>
        </PreviewTable>
      )}
      {data.length > 100 && <p className="text-xs text-slate-400 text-center">Mostrando 100 de {data.length}. Exporte para ver todos.</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// RELATÓRIO: CLIENTES
// ─────────────────────────────────────────────────────────────
function RelatorioClientes() {
  const { data: allClients = [], loading } = useClients()
  const { data: users = [] } = useUsers()
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('todos')
  const [repF, setRepF] = useState('todos')

  const reps = users.filter(u => u.role === 'rep')

  const data = useMemo(() => allClients.filter(c => {
    const match = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.address?.city?.toLowerCase().includes(search.toLowerCase())
    const st    = statusF === 'todos' || c.status === statusF
    const r     = repF === 'todos' || c.repId === repF
    return match && st && r
  }), [allClients, search, statusF, repF])

  const XCOLS: XCol[] = [
    { header: 'Nome',               key: 'name',             width: 28 },
    { header: 'Responsável',        key: 'buyerName',        width: 22 },
    { header: 'Telefone',           key: 'phone',            width: 16 },
    { header: 'WhatsApp',           key: 'whatsapp',         width: 16 },
    { header: 'Cidade',             key: 'city',             width: 16 },
    { header: 'Estado',             key: 'state',            width: 6,  align: 'center' },
    { header: 'Cadastrado em',      key: 'createdAt',        width: 14, align: 'center' },
    { header: 'Representante',      key: 'repName',          width: 18 },
    { header: 'Forma Pag. Prefer.', key: 'defaultPayment',   width: 18 },
    { header: 'Crédito',            key: 'credit',           width: 10, align: 'center' },
    { header: 'Última Visita',      key: 'lastVisit',        width: 14, align: 'center' },
    { header: 'Último Pedido',      key: 'lastOrder',        width: 14, align: 'center' },
    { header: 'Total Comprado',     key: 'totalRevenue',     width: 16, align: 'right',  numFmt: '"R$" #,##0.00' },
    { header: 'Situação',           key: 'status',           width: 12, align: 'center' },
  ]

  const STATUS_CLIENT_PT: Record<string, string> = { ativo: 'Ativo', inativo: 'Inativo', prospecto: 'Prospecto' }

  function buildRows() {
    return data.map(c => {
      const repUser = users.find(u => u.id === c.repId)
      return {
        name:           c.name,
        buyerName:      c.buyerName ?? '',
        phone:          c.phone ?? '',
        whatsapp:       c.buyerWhatsapp ?? '',
        city:           c.address?.city ?? '',
        state:          c.address?.state ?? '',
        createdAt:      fmtDate(c.createdAt),
        repName:        repUser?.name ?? '',
        defaultPayment: c.defaultPaymentMethod ?? '',
        credit:         c.creditClassification ?? '',
        lastVisit:      fmtDate(c.lastVisit),
        lastOrder:      fmtDate(c.lastOrder),
        totalRevenue:   c.totalRevenue ?? 0,
        status:         STATUS_CLIENT_PT[c.status] ?? c.status,
      }
    })
  }

  const rows = useMemo(buildRows, [data, users])

  const PCOLS: PCol[] = XCOLS.map(c => ({ header: c.header, key: c.key, align: c.align }))

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="input pl-8 text-sm" />
          </div>
          <select value={statusF} onChange={e => setStatusF(e.target.value)} className="input text-sm">
            <option value="todos">Todo status</option>
            <option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="prospecto">Prospecto</option>
          </select>
          <select value={repF} onChange={e => setRepF(e.target.value)} className="input text-sm">
            <option value="todos">Todos os reps</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>

      <ExportBar count={data.length}
        onExcel={() => exportExcel('Clientes', 'Cadastro de Clientes', XCOLS, rows, 'clientes')}
        onPDF={() => exportPDF('Clientes', 'Cadastro de Clientes', PCOLS, rows as Record<string, unknown>[])}
      />

      {loading ? <LoadingSpinner /> : (
        <PreviewTable>
          <thead>
            <tr>
              <TH>Nome</TH><TH>Cidade/Estado</TH><TH>Telefone</TH><TH>WhatsApp</TH>
              <TH>Rep</TH><TH>Crédito</TH><TH right>Total Comprado</TH><TH>Status</TH>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 100).map((c, i) => {
              const repUser = users.find(u => u.id === c.repId)
              return (
                <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <TD className="font-medium">{c.name}</TD>
                  <TD>{c.address?.city}{c.address?.state ? ` — ${c.address.state}` : ''}</TD>
                  <TD>{c.phone ?? '—'}</TD>
                  <TD>{c.buyerWhatsapp ?? '—'}</TD>
                  <TD>{repUser?.name.split(' ')[0] ?? '—'}</TD>
                  <TD>
                    {c.creditClassification && (
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                        c.creditClassification === 'A+' ? 'bg-green-100 text-green-700'
                        : c.creditClassification === 'Bloqueado' ? 'bg-red-100 text-red-700'
                        : 'bg-slate-100 text-slate-600')}>
                        {c.creditClassification}
                      </span>
                    )}
                  </TD>
                  <TD right className="font-semibold">{fmtCurrency(c.totalRevenue)}</TD>
                  <TD>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                      c.status === 'ativo' ? 'bg-green-100 text-green-700'
                      : c.status === 'inativo' ? 'bg-red-100 text-red-600'
                      : 'bg-blue-100 text-blue-700')}>
                      {STATUS_CLIENT_PT[c.status] ?? c.status}
                    </span>
                  </TD>
                </tr>
              )
            })}
          </tbody>
        </PreviewTable>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// RELATÓRIO: CONTAS A RECEBER
// ─────────────────────────────────────────────────────────────
function RelatorioContas() {
  const { data: receivables = [], loading } = useReceivables()
  const { data: allClients = [] } = useClients()
  const [statusF, setStatusF] = useState('todos')
  const [search, setSearch] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const clientMap = useMemo(() => {
    const m = new Map<string, { phone: string; whatsapp: string }>()
    allClients.forEach(c => m.set(c.id, { phone: c.phone ?? '', whatsapp: c.buyerWhatsapp ?? '' }))
    return m
  }, [allClients])

  const data = useMemo(() => receivables.filter(r => {
    const matchStatus = statusF === 'todos' || r.status === statusF
    const matchSearch = !search || r.clientName.toLowerCase().includes(search.toLowerCase()) || r.orderNumber.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  }), [receivables, statusF, search])

  const overdueTotal = data.filter(r => r.status === 'vencido').reduce((s, r) => s + r.remainingAmount, 0)

  function daysLate(r: (typeof data)[0]) {
    if (r.status === 'pago') return 0
    return r.dueDate < today ? daysBetween(r.dueDate, today) : 0
  }

  const XCOLS: XCol[] = [
    { header: 'Cliente',        key: 'clientName',     width: 28 },
    { header: 'Pedido',         key: 'orderNumber',    width: 12, align: 'center' },
    { header: 'Representante',  key: 'repName',        width: 18 },
    { header: 'Forma Pag.',     key: 'paymentMethod',  width: 14 },
    { header: 'Parcela',        key: 'installment',    width: 8,  align: 'center' },
    { header: 'Valor (R$)',     key: 'amount',         width: 14, align: 'right',  numFmt: '"R$" #,##0.00', red: (_v, r) => r.status === 'vencido' },
    { header: 'Vencimento',     key: 'dueDate',        width: 13, align: 'center', red: (_v, r) => r.status === 'vencido' },
    { header: 'Dias Atraso',    key: 'daysLate',       width: 11, align: 'center', red: v => Number(v) > 0 },
    { header: 'Status',         key: 'statusPT',       width: 14 },
    { header: 'Telefone',       key: 'phone',          width: 14 },
    { header: 'WhatsApp',       key: 'whatsapp',       width: 14 },
  ]

  function buildRows() {
    return data.map(r => {
      const cl = clientMap.get(r.clientId)
      return {
        clientName:    r.clientName,
        orderNumber:   r.orderNumber,
        repName:       r.repName,
        paymentMethod: r.paymentMethod ?? '',
        installment:   `${r.installmentNumber}/${r.installmentTotal}`,
        amount:        r.amount,
        dueDate:       fmtDate(r.dueDate),
        daysLate:      daysLate(r),
        statusPT:      RECEIVABLE_STATUS_PT[r.status] ?? r.status,
        phone:         cl?.phone ?? '',
        whatsapp:      cl?.whatsapp ?? '',
        status:        r.status,
      }
    })
  }

  const rows = useMemo(buildRows, [data, clientMap])

  const PCOLS: PCol[] = XCOLS.map(c => ({ header: c.header, key: c.key === 'amount' ? 'amountFmt' : c.key, align: c.align }))

  function pdfRows() {
    return rows.map(r => ({ ...r, amountFmt: fmtCurrency(r.amount as number) }))
  }

  return (
    <div className="space-y-4">
      {overdueTotal > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">
            Total vencido: <strong>{fmtCurrency(overdueTotal)}</strong>
          </p>
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente ou pedido..." className="input pl-8 text-sm" />
          </div>
          <select value={statusF} onChange={e => setStatusF(e.target.value)} className="input text-sm">
            <option value="todos">Todo status</option>
            {Object.entries(RECEIVABLE_STATUS_PT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <ExportBar count={data.length}
        onExcel={() => exportExcel('Contas a Receber', 'Parcelas e status de pagamento', XCOLS, rows, 'contas-receber')}
        onPDF={() => exportPDF('Contas a Receber', 'Parcelas e status de pagamento', PCOLS, pdfRows() as Record<string, unknown>[], {
          red: r => r.status === 'vencido',
          green: r => r.status === 'pago',
        })}
      />

      {loading ? <LoadingSpinner /> : (
        <PreviewTable>
          <thead>
            <tr>
              <TH>Cliente</TH><TH>Pedido</TH><TH>Rep</TH><TH>Parcela</TH>
              <TH right>Valor</TH><TH>Vencimento</TH><TH right>Dias Atraso</TH><TH>Status</TH>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 100).map((r, i) => {
              const dl = daysLate(r)
              return (
                <tr key={r.id} className={cn(
                  i % 2 === 0 ? 'bg-white' : 'bg-slate-50',
                  r.status === 'vencido' && 'bg-red-50',
                  r.status === 'pago' && 'bg-green-50',
                )}>
                  <TD className="font-medium">{r.clientName}</TD>
                  <TD className="font-mono text-slate-500">{r.orderNumber}</TD>
                  <TD>{r.repName.split(' ')[0]}</TD>
                  <TD className="text-center">{r.installmentNumber}/{r.installmentTotal}</TD>
                  <TD right className={cn('font-semibold', r.status === 'vencido' && 'text-red-600')}>{fmtCurrency(r.amount)}</TD>
                  <TD className={cn('text-center', r.status === 'vencido' && 'text-red-600 font-semibold')}>{fmtDate(r.dueDate)}</TD>
                  <TD right className={cn(dl > 0 && 'text-red-600 font-bold')}>{dl > 0 ? `${dl}d` : '—'}</TD>
                  <TD>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                      r.status === 'pago' ? 'bg-green-100 text-green-700'
                      : r.status === 'vencido' ? 'bg-red-100 text-red-700'
                      : r.status === 'parcial' ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-600')}>
                      {RECEIVABLE_STATUS_PT[r.status] ?? r.status}
                    </span>
                  </TD>
                </tr>
              )
            })}
          </tbody>
        </PreviewTable>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// RELATÓRIO: REPRESENTANTES
// ─────────────────────────────────────────────────────────────
function RelatorioRepresentantes() {
  const { data: ranking = [], loading } = useRepRanking()
  const { data: allOrders = [] } = useOrders()
  const { data: users = [] } = useUsers()

  const data = useMemo(() => {
    return ranking.map(r => {
      const repOrders = allOrders.filter(o => o.repId === r.id && !o.isDeleted)
      const totalOrders = repOrders.length
      const ticket = totalOrders > 0 ? r.faturamento / totalOrders : 0
      const pct = r.meta > 0 ? Math.round((r.faturamento / r.meta) * 100) : 0
      const repClients = [...new Set(repOrders.map(o => o.clientId))].length
      return { ...r, totalOrders, ticket, pct, clients: repClients }
    })
  }, [ranking, allOrders])

  const XCOLS: XCol[] = [
    { header: 'Representante',  key: 'name',         width: 22 },
    { header: 'Clientes',       key: 'clients',      width: 10, align: 'center' },
    { header: 'Pedidos',        key: 'totalOrders',  width: 10, align: 'center' },
    { header: 'Faturamento',    key: 'faturamento',  width: 16, align: 'right',  numFmt: '"R$" #,##0.00' },
    { header: 'Ticket Médio',   key: 'ticket',       width: 14, align: 'right',  numFmt: '"R$" #,##0.00' },
    { header: 'Meta',           key: 'meta',         width: 14, align: 'right',  numFmt: '"R$" #,##0.00' },
    { header: '% Meta',         key: 'pct',          width: 10, align: 'center',
      green: v => Number(v) >= 100,
      amber: v => Number(v) >= 70 && Number(v) < 100,
      red:   v => Number(v) < 70  },
    { header: 'Visitas',        key: 'visitas',      width: 10, align: 'center' },
    { header: 'Conv. Visitas',  key: 'conversao',    width: 14, align: 'center' },
  ]

  const rows = data.map(r => ({
    ...r,
    pct: `${r.pct}%`,
    conversao: `${r.conversao}%`,
  }))

  const PCOLS: PCol[] = XCOLS.map(c => ({ header: c.header, key: c.key === 'faturamento' ? 'faturamentoFmt' : c.key === 'ticket' ? 'ticketFmt' : c.key === 'meta' ? 'metaFmt' : c.key, align: c.align }))

  function pdfRows() {
    return rows.map(r => ({
      ...r,
      faturamentoFmt: fmtCurrency(r.faturamento),
      ticketFmt: fmtCurrency(r.ticket),
      metaFmt: fmtCurrency(r.meta),
    }))
  }

  return (
    <div className="space-y-4">
      <ExportBar count={data.length}
        onExcel={() => exportExcel('Representantes', 'Performance e metas', XCOLS, rows as Record<string, unknown>[], 'representantes')}
        onPDF={() => exportPDF('Representantes', 'Performance e metas', PCOLS, pdfRows() as Record<string, unknown>[], {
          green: r => Number((r.pct as string).replace('%', '')) >= 100,
          amber: r => { const p = Number((r.pct as string).replace('%', '')); return p >= 70 && p < 100 },
          red:   r => Number((r.pct as string).replace('%', '')) < 70,
        })}
      />

      {loading ? <LoadingSpinner /> : (
        <PreviewTable>
          <thead>
            <tr>
              <TH>#</TH><TH>Representante</TH><TH right>Faturamento</TH><TH right>Meta</TH>
              <TH right>% Meta</TH><TH right>Ticket Médio</TH><TH right>Pedidos</TH><TH right>Clientes</TH>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => {
              const pctOk = r.pct >= 100
              const pctWarn = r.pct >= 70 && r.pct < 100
              return (
                <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <TD className="text-center font-bold text-slate-400">{i + 1}</TD>
                  <TD className="font-semibold">{r.name}</TD>
                  <TD right className="font-bold text-slate-900">{fmtCurrency(r.faturamento)}</TD>
                  <TD right className="text-slate-500">{fmtCurrency(r.meta)}</TD>
                  <TD right>
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                      pctOk ? 'bg-green-100 text-green-700' : pctWarn ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
                      {r.pct}%
                    </span>
                  </TD>
                  <TD right>{fmtCurrency(r.ticket)}</TD>
                  <TD right>{r.totalOrders}</TD>
                  <TD right>{r.clients}</TD>
                </tr>
              )
            })}
          </tbody>
        </PreviewTable>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// RELATÓRIO: VISITAS
// ─────────────────────────────────────────────────────────────
function RelatorioVisitas() {
  const { data: allVisits = [], loading } = useVisits()
  const { data: users = [] } = useUsers()
  const [periodKey, setPeriodKey] = useState<PeriodKey>('current')
  const [dateFrom, setDateFrom] = useState(() => periodRange('current').from)
  const [dateTo,   setDateTo]   = useState(() => periodRange('current').to)
  const [repF,     setRepF]     = useState('todos')
  const [resultF,  setResultF]  = useState('todos')

  useEffect(() => {
    if (periodKey !== 'custom') { const r = periodRange(periodKey); setDateFrom(r.from); setDateTo(r.to) }
  }, [periodKey])

  const reps = users.filter(u => u.role === 'rep')

  const data = useMemo(() => allVisits.filter(v => {
    const d = v.createdAt.slice(0, 10)
    return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo)
      && (repF === 'todos' || v.repId === repF)
      && (resultF === 'todos' || v.result === resultF)
  }), [allVisits, dateFrom, dateTo, repF, resultF])

  const XCOLS: XCol[] = [
    { header: 'Cliente',       key: 'clientName',  width: 28 },
    { header: 'Cidade',        key: 'clientCity',  width: 16 },
    { header: 'Representante', key: 'repName',     width: 18 },
    { header: 'Check-in',      key: 'checkIn',     width: 16, align: 'center' },
    { header: 'Check-out',     key: 'checkOut',    width: 16, align: 'center' },
    { header: 'Duração (min)', key: 'duration',    width: 12, align: 'center' },
    { header: 'Resultado',     key: 'resultPT',    width: 14, align: 'center' },
    { header: 'Status',        key: 'status',      width: 14, align: 'center' },
    { header: 'Observações',   key: 'notes',       width: 30 },
  ]

  const STATUS_VISIT_PT: Record<string, string> = {
    agendada: 'Agendada', em_andamento: 'Em Andamento', concluida: 'Concluída', cancelada: 'Cancelada',
  }

  function buildRows() {
    return data.map(v => ({
      clientName: v.clientName,
      clientCity: v.clientCity ?? '',
      repName:    v.repName,
      checkIn:    v.checkIn?.timestamp ? formatDate(v.checkIn.timestamp) : '—',
      checkOut:   v.checkOut?.timestamp ? formatDate(v.checkOut.timestamp) : '—',
      duration:   v.duration ?? '—',
      resultPT:   v.result ? VISIT_RESULT_PT[v.result] ?? v.result : '—',
      status:     STATUS_VISIT_PT[v.status] ?? v.status,
      notes:      v.notes ?? '',
    }))
  }

  const rows = useMemo(buildRows, [data])
  const PCOLS: PCol[] = XCOLS.map(c => ({ header: c.header, key: c.key, align: c.align }))
  const desc = dateFrom && dateTo ? `${fmtDate(dateFrom)} a ${fmtDate(dateTo)}` : 'Todos os períodos'

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <PeriodPicker value={periodKey} onChange={setPeriodKey} from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <div className="grid grid-cols-2 gap-2">
          <select value={repF} onChange={e => setRepF(e.target.value)} className="input text-sm">
            <option value="todos">Todos os reps</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={resultF} onChange={e => setResultF(e.target.value)} className="input text-sm">
            <option value="todos">Todo resultado</option>
            {Object.entries(VISIT_RESULT_PT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <ExportBar count={data.length}
        onExcel={() => exportExcel('Visitas', desc, XCOLS, rows, 'visitas')}
        onPDF={() => exportPDF('Visitas', desc, PCOLS, rows as Record<string, unknown>[], {
          green: r => r.resultPT === 'Positivo',
          red: r => r.resultPT === 'Negativo',
        })}
      />

      {loading ? <LoadingSpinner /> : (
        <PreviewTable>
          <thead>
            <tr>
              <TH>Cliente</TH><TH>Cidade</TH><TH>Rep</TH><TH>Check-in</TH>
              <TH>Check-out</TH><TH right>Duração</TH><TH>Resultado</TH><TH>Status</TH>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 100).map((v, i) => (
              <tr key={v.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <TD className="font-medium">{v.clientName}</TD>
                <TD>{v.clientCity ?? '—'}</TD>
                <TD>{v.repName.split(' ')[0]}</TD>
                <TD>{v.checkIn?.timestamp ? formatDate(v.checkIn.timestamp) : '—'}</TD>
                <TD>{v.checkOut?.timestamp ? formatDate(v.checkOut.timestamp) : '—'}</TD>
                <TD right>{v.duration ? `${v.duration}min` : '—'}</TD>
                <TD>
                  {v.result && (
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                      v.result === 'positivo' ? 'bg-green-100 text-green-700'
                      : v.result === 'negativo' ? 'bg-red-100 text-red-700'
                      : 'bg-slate-100 text-slate-500')}>
                      {VISIT_RESULT_PT[v.result] ?? v.result}
                    </span>
                  )}
                </TD>
                <TD>{v.status === 'concluida' ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Clock className="w-3.5 h-3.5 text-slate-400" />}</TD>
              </tr>
            ))}
          </tbody>
        </PreviewTable>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// RELATÓRIO: PRODUTOS
// ─────────────────────────────────────────────────────────────
function RelatorioProdutos() {
  const { data: allProducts = [], loading } = useAllProducts()
  const { data: allOrders = [] } = useOrders()
  const [search, setSearch] = useState('')
  const [activeF, setActiveF] = useState('todos')

  const productSales = useMemo(() => {
    const map = new Map<string, number>()
    allOrders.filter(o => !o.isDeleted).forEach(o =>
      o.items.forEach(it => map.set(it.productId, (map.get(it.productId) ?? 0) + it.quantity))
    )
    return map
  }, [allOrders])

  const data = useMemo(() => allProducts.filter(p => {
    const match = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code?.toLowerCase().includes(search.toLowerCase())
    const act = activeF === 'todos' || (activeF === 'ativo' ? p.active !== false : p.active === false)
    return match && act
  }), [allProducts, search, activeF])

  const XCOLS: XCol[] = [
    { header: 'Código',      key: 'code',          width: 12, align: 'center' },
    { header: 'Produto',     key: 'name',          width: 35 },
    { header: 'Categoria',   key: 'categoryName',  width: 18 },
    { header: 'Subcategoria',key: 'subcategoryName',width: 18 },
    { header: 'Preço (R$)', key: 'price',          width: 14, align: 'right', numFmt: '"R$" #,##0.00' },
    { header: 'Status',      key: 'statusStr',     width: 10, align: 'center' },
    { header: 'Qtd Vendida', key: 'qtdSold',       width: 12, align: 'right' },
  ]

  const rows = data.map(p => ({
    code:          p.code ?? '',
    name:          p.name,
    categoryName:  p.categoryName ?? p.category ?? '',
    subcategoryName: p.subcategoryName ?? '',
    price:         p.price,
    statusStr:     p.active !== false ? 'Ativo' : 'Inativo',
    qtdSold:       productSales.get(p.id) ?? 0,
  }))

  const PCOLS: PCol[] = XCOLS.map(c => ({ header: c.header, key: c.key === 'price' ? 'priceFmt' : c.key, align: c.align }))

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Código ou nome..." className="input pl-8 text-sm" />
          </div>
          <select value={activeF} onChange={e => setActiveF(e.target.value)} className="input text-sm">
            <option value="todos">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
        </div>
      </div>

      <ExportBar count={data.length}
        onExcel={() => exportExcel('Produtos', 'Catálogo de Produtos', XCOLS, rows, 'produtos')}
        onPDF={() => exportPDF('Produtos', 'Catálogo de Produtos', PCOLS, rows.map(r => ({ ...r, priceFmt: fmtCurrency(r.price) })) as Record<string, unknown>[])}
      />

      {loading ? <LoadingSpinner /> : (
        <PreviewTable>
          <thead>
            <tr><TH>Código</TH><TH>Produto</TH><TH>Categoria</TH><TH right>Preço</TH><TH right>Qtd Vendida</TH><TH>Status</TH></tr>
          </thead>
          <tbody>
            {data.slice(0, 100).map((p, i) => (
              <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <TD className="font-mono text-slate-500">{p.code ?? '—'}</TD>
                <TD className="font-medium max-w-[200px] truncate">{p.name}</TD>
                <TD>{p.categoryName ?? p.category ?? '—'}</TD>
                <TD right className="font-semibold">{fmtCurrency(p.price)}</TD>
                <TD right className="font-semibold">{productSales.get(p.id) ?? 0}</TD>
                <TD>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                    p.active !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
                    {p.active !== false ? 'Ativo' : 'Inativo'}
                  </span>
                </TD>
              </tr>
            ))}
          </tbody>
        </PreviewTable>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// RELATÓRIO DE TROCAS
// ─────────────────────────────────────────────────────────────
function RelatorioTrocas() {
  const { data: allOrders = [], loading } = useOrders()
  const [search, setSearch]   = useState('')
  const [period, setPeriod]   = useState<PeriodKey>('current')
  const [dateFrom, setDateFrom] = useState(() => periodRange('current').from)
  const [dateTo,   setDateTo]   = useState(() => periodRange('current').to)

  useEffect(() => {
    if (period !== 'custom') { const r = periodRange(period); setDateFrom(r.from); setDateTo(r.to) }
  }, [period])

  const data = useMemo(() => allOrders.filter(o => {
    if ((o.orderType ?? 'venda') !== 'troca') return false
    if (o.isDeleted) return false
    const d = saleDateOf(o).slice(0, 10)
    if (dateFrom && d < dateFrom) return false
    if (dateTo   && d > dateTo)   return false
    if (search) {
      const q = search.toLowerCase()
      if (!o.clientName.toLowerCase().includes(q) && !o.number.toLowerCase().includes(q) && !o.repName.toLowerCase().includes(q)) return false
    }
    return true
  }), [allOrders, search, dateFrom, dateTo])

  const ORDER_STATUS_LABELS: Record<string, string> = {
    draft: 'Rascunho', generated: 'Gerado', pending_separation: 'Pend. Sep.',
    separation: 'Separação', invoiced_ready_to_ship: 'Faturado', partial_delivery: 'Entrega Parcial', delivered: 'Entregue',
  }

  const XCOLS: XCol[] = [
    { header: 'Número',      key: 'number',         width: 14 },
    { header: 'Cliente',     key: 'clientName',     width: 28 },
    { header: 'Representante', key: 'repName',      width: 20 },
    { header: 'Motivo',      key: 'exchangeReason', width: 22 },
    { header: 'Data',        key: 'saleDate',       width: 12, align: 'center' },
    { header: 'Status',      key: 'statusLabel',    width: 16 },
    { header: 'Total (R$)',  key: 'total',          width: 14, align: 'right', numFmt: '"R$" #,##0.00' },
  ]

  const rows = data.map(o => ({
    number:         o.number,
    clientName:     o.clientName,
    repName:        o.repName,
    exchangeReason: o.exchangeReason ?? '—',
    saleDate:       fmtDate(saleDateOf(o)),
    statusLabel:    ORDER_STATUS_LABELS[o.status] ?? o.status,
    total:          o.total,
  }))

  const PCOLS: PCol[] = XCOLS.map(c => ({ header: c.header, key: c.key === 'total' ? 'totalFmt' : c.key, align: c.align }))

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <PeriodPicker value={period} onChange={setPeriod} from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cliente, número ou rep..." className="input pl-8 text-sm" />
        </div>
      </div>

      <ExportBar count={data.length}
        onExcel={() => exportExcel('Trocas', 'Pedidos de Troca', XCOLS, rows, 'trocas')}
        onPDF={() => exportPDF('Trocas', 'Pedidos de Troca', PCOLS, rows.map(r => ({ ...r, totalFmt: fmtCurrency(r.total) })) as Record<string, unknown>[])}
      />

      {loading ? <LoadingSpinner /> : (
        <PreviewTable>
          <thead>
            <tr><TH>Número</TH><TH>Cliente</TH><TH>Rep</TH><TH>Motivo</TH><TH>Data</TH><TH>Status</TH><TH right>Total</TH></tr>
          </thead>
          <tbody>
            {data.slice(0, 200).map((o, i) => (
              <tr key={o.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <TD className="font-mono text-slate-500">{o.number}</TD>
                <TD className="font-medium max-w-[160px] truncate">{o.clientName}</TD>
                <TD className="text-slate-500">{o.repName.split(' ')[0]}</TD>
                <TD className="text-slate-600 max-w-[140px] truncate">{o.exchangeReason ?? '—'}</TD>
                <TD>{fmtDate(saleDateOf(o))}</TD>
                <TD>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-orange-100 text-orange-700">
                    {ORDER_STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </TD>
                <TD right className="font-semibold">{fmtCurrency(o.total)}</TD>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-slate-400 text-sm">Nenhuma troca no período</td></tr>
            )}
          </tbody>
        </PreviewTable>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function AdminRelatorios() {
  const [activeTab, setActiveTab] = useState<ReportType>('pedidos')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const activeInfo = REPORT_TABS.find(t => t.key === activeTab)!

  return (
    <AdminLayout title="Central de Relatórios">
      <div className="flex flex-col lg:flex-row min-h-screen">

        {/* ── Sidebar (desktop) ── */}
        <aside className="hidden lg:flex flex-col w-64 border-r border-slate-200 bg-slate-50 p-4 gap-1 flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-2">Relatórios</p>
          {REPORT_TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn('flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left',
                activeTab === tab.key
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900')}>
              <tab.icon className="w-4 h-4 flex-shrink-0" />
              {tab.label}
            </button>
          ))}
        </aside>

        {/* ── Mobile tab selector ── */}
        <div className="lg:hidden border-b border-slate-200 bg-white sticky top-0 z-10">
          <button onClick={() => setMobileMenuOpen(o => !o)}
            className="flex items-center justify-between w-full px-4 py-3">
            <div className="flex items-center gap-2">
              <activeInfo.icon className="w-4 h-4 text-primary-600" />
              <span className="text-sm font-semibold text-slate-900">{activeInfo.label}</span>
            </div>
            {mobileMenuOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-slate-100">
                {REPORT_TABS.map(tab => (
                  <button key={tab.key} onClick={() => { setActiveTab(tab.key); setMobileMenuOpen(false) }}
                    className={cn('flex items-center gap-2.5 px-4 py-3 w-full text-sm font-medium text-left',
                      activeTab === tab.key ? 'bg-primary-50 text-primary-700' : 'text-slate-600')}>
                    <tab.icon className="w-4 h-4" />
                    <div>
                      <p>{tab.label}</p>
                      <p className="text-[11px] font-normal text-slate-400">{tab.desc}</p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Content ── */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <div className="max-w-6xl mx-auto">
            {/* Section header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                <activeInfo.icon className="w-5 h-5 text-primary-700" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">{activeInfo.label}</h1>
                <p className="text-sm text-slate-500">{activeInfo.desc}</p>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}>
                {activeTab === 'pedidos'        && <RelatorioPedidos />}
                {activeTab === 'clientes'       && <RelatorioClientes />}
                {activeTab === 'contas'         && <RelatorioContas />}
                {activeTab === 'representantes' && <RelatorioRepresentantes />}
                {activeTab === 'visitas'        && <RelatorioVisitas />}
                {activeTab === 'produtos'       && <RelatorioProdutos />}
                {activeTab === 'trocas'         && <RelatorioTrocas />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </AdminLayout>
  )
}
