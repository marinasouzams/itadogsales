import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search, Warehouse, FileText, AlertTriangle } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useWholesaleOrders, useWholesaleItems, useCompanySettings } from '@/hooks/useData'
import { syncWholesaleNow, wholesaleCounts } from '@/services/db'
import { LoadingSpinner, EmptyState } from '@/components/shared/LoadingState'
import { periodRange, PERIOD_LABELS, type PeriodKey } from '@/services/reportExport'
import { formatCurrency, formatDate, formatRelative, cn } from '@/utils'
import type { WholesaleOrder } from '@/types'

const TABS = ['Visão geral', 'Pedidos', 'Clientes', 'Produtos'] as const
type Tab = typeof TABS[number]

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function WholesaleStatusBadge({ o }: { o: Pick<WholesaleOrder, 'status' | 'ignored' | 'blingSituacao'> }) {
  if (o.ignored) return <span className="badge bg-slate-100 text-slate-500">Ignorado</span>
  if (o.status === 'cancelado') return <span className="badge bg-red-50 text-red-700">Cancelada</span>
  if (o.status === 'rascunho') return <span className="badge bg-slate-100 text-slate-600">Em digitação</span>
  return <span className="badge bg-green-50 text-green-700">{o.blingSituacao ?? 'Ativo'}</span>
}

export default function AdminAtacado() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Visão geral')
  const [periodKey, setPeriodKey] = useState<PeriodKey>('current')
  const [dateFrom, setDateFrom] = useState(() => periodRange('current').from)
  const [dateTo, setDateTo] = useState(() => periodRange('current').to)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'cancelado'>('todos')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  useEffect(() => {
    if (periodKey !== 'custom') {
      const r = periodRange(periodKey)
      setDateFrom(r.from)
      setDateTo(r.to)
    }
  }, [periodKey])

  const { data: orders = [], loading, refetch } = useWholesaleOrders()
  const { data: items = [], refetch: refetchItems } = useWholesaleItems()
  const { data: settings } = useCompanySettings()
  const goal = settings?.wholesaleGoal ?? 10000

  const inPeriod = useMemo(
    () => orders.filter(o => (!dateFrom || o.saleDate >= dateFrom) && (!dateTo || o.saleDate <= dateTo)),
    [orders, dateFrom, dateTo],
  )
  const counting = useMemo(() => inPeriod.filter(wholesaleCounts), [inPeriod])
  const cancelled = inPeriod.filter(o => o.status === 'cancelado' && !o.ignored)

  const faturamento = counting.reduce((s, o) => s + o.total, 0)
  const ticket = counting.length ? faturamento / counting.length : 0
  const clientsBought = new Set(counting.map(o => o.clientId ?? o.clientCnpj ?? o.clientName)).size
  const singleMonth = periodKey === 'current' || periodKey === 'prev'
  const goalPct = goal > 0 ? Math.round((faturamento / goal) * 100) : 0

  // Evolução: últimos 6 meses (independe do período escolhido)
  const monthly = useMemo(() => {
    const now = new Date()
    const out: { key: string; label: string; total: number; count: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTHS[d.getMonth()], total: 0, count: 0 })
    }
    orders.filter(wholesaleCounts).forEach(o => {
      const m = out.find(x => x.key === o.saleDate.slice(0, 7))
      if (m) { m.total += o.total; m.count++ }
    })
    return out
  }, [orders])
  const monthlyMax = Math.max(goal, ...monthly.map(m => m.total), 1)

  const countingIds = useMemo(() => new Set(counting.map(o => o.blingId)), [counting])
  const products = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; total: number }>()
    items.filter(i => countingIds.has(i.orderBlingId)).forEach(i => {
      const key = i.productBlingId ? String(i.productBlingId) : i.description
      const cur = map.get(key) ?? { name: i.description, qty: 0, total: 0 }
      cur.qty += i.quantity
      cur.total += i.total
      map.set(key, cur)
    })
    return [...map.values()].sort((a, b) => b.qty - a.qty)
  }, [items, countingIds])

  const clients = useMemo(() => {
    const map = new Map<string, { id?: string; name: string; city?: string; count: number; total: number; last: string }>()
    counting.forEach(o => {
      const key = o.clientId ?? o.clientCnpj ?? o.clientName ?? o.number
      const cur = map.get(key) ?? { id: o.clientId, name: o.clientName ?? '—', city: o.clientCity, count: 0, total: 0, last: '' }
      cur.count++
      cur.total += o.total
      if (o.saleDate > cur.last) cur.last = o.saleDate
      map.set(key, cur)
    })
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [counting])

  const filteredOrders = useMemo(() => inPeriod.filter(o => {
    const q = search.trim().toLowerCase()
    const matchSearch = !q || (o.clientName ?? '').toLowerCase().includes(q) || o.number.includes(q) || (o.nfeNumber ?? '').includes(q)
    const matchStatus = statusFilter === 'todos' || o.status === statusFilter
    return matchSearch && matchStatus
  }), [inPeriod, search, statusFilter])

  const lastSync = orders.reduce((m, o) => (o.syncedAt > m ? o.syncedAt : m), '')

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const r = await syncWholesaleNow()
      setSyncMsg(r.novos || r.atualizados ? `${r.novos} novo(s), ${r.atualizados} atualizado(s)` : 'Tudo em dia')
      refetch(); refetchItems()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Não foi possível atualizar')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <AdminLayout title="Atacado"><div className="p-6"><LoadingSpinner /></div></AdminLayout>

  return (
    <AdminLayout title="Atacado">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-orange-600" />
            <p className="text-sm text-slate-500">
              Pedidos feitos direto no Bling. Somente leitura{lastSync ? ` · atualizado ${formatRelative(lastSync)}` : ''}.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {syncMsg && <span className="text-xs text-slate-500">{syncMsg}</span>}
            <button onClick={handleSync} disabled={syncing} className="btn-secondary !py-2 !px-4">
              <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} /> Atualizar do Bling
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['current', 'prev', '3months', 'year', 'all', 'custom'] as PeriodKey[]).map(k => (
            <button key={k} onClick={() => setPeriodKey(k)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border',
                periodKey === k ? 'bg-orange-600 text-white border-orange-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}>
              {PERIOD_LABELS[k]}
            </button>
          ))}
          {periodKey === 'custom' && (
            <>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input text-xs py-1.5 w-36" />
              <span className="text-slate-400 text-xs">até</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input text-xs py-1.5 w-36" />
            </>
          )}
        </div>

        <div className="flex gap-1 border-b border-slate-200">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors',
                tab === t ? 'border-orange-600 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>
              {t}
            </button>
          ))}
        </div>

        {orders.length === 0 && (
          <div className="card"><EmptyState label="Nenhum pedido de atacado lido do Bling ainda" icon={Warehouse} /></div>
        )}

        {orders.length > 0 && tab === 'Visão geral' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card border-t-4 border-t-orange-500">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Faturamento</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(faturamento)}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {singleMonth ? `meta ${formatCurrency(goal)} · ${goalPct}%` : `${counting.length} pedidos no período`}
                </p>
                {singleMonth && (
                  <div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
                    <div className="h-full bg-orange-500" style={{ width: `${Math.min(goalPct, 100)}%` }} />
                  </div>
                )}
              </div>
              <div className="card border-t-4 border-t-orange-500">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pedidos</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{counting.length}</p>
                <p className="text-xs text-slate-500 mt-1">{cancelled.length > 0 ? `${cancelled.length} cancelado(s) fora do total` : 'nenhum cancelado'}</p>
              </div>
              <div className="card border-t-4 border-t-orange-500">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ticket médio</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(ticket)}</p>
                <p className="text-xs text-slate-500 mt-1">por pedido</p>
              </div>
              <div className="card border-t-4 border-t-orange-500">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Clientes que compraram</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{clientsBought}</p>
                <p className="text-xs text-slate-500 mt-1">no período</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card">
                <h3 className="font-semibold text-slate-900 mb-4">Faturamento por mês</h3>
                <div className="relative flex items-end gap-3 h-44 pt-4">
                  <div className="absolute left-0 right-0 border-t-2 border-dashed border-amber-400 pointer-events-none"
                    style={{ bottom: `calc(${(goal / monthlyMax) * 100}% * 0.86 + 1.5rem)` }}>
                    <span className="absolute right-0 -top-4 text-[10px] font-bold text-amber-600">meta {formatCurrency(goal)}</span>
                  </div>
                  {monthly.map((m, i) => (
                    <div key={m.key} className="flex-1 flex flex-col items-center justify-end h-full gap-1 min-w-0">
                      <span className="text-[10px] font-semibold text-slate-500">{m.total > 0 ? `${(m.total / 1000).toFixed(1)}k` : ''}</span>
                      <div className={cn('w-full max-w-[40px] rounded-t-md', i === monthly.length - 1 ? 'bg-orange-500' : 'bg-orange-300')}
                        style={{ height: `${(m.total / monthlyMax) * 86}%`, minHeight: m.total > 0 ? 4 : 0 }} />
                      <span className="text-xs text-slate-500">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h3 className="font-semibold text-slate-900 mb-4">Peças mais pedidas</h3>
                {products.length === 0 ? <p className="text-sm text-slate-400 py-4 text-center">Sem pedidos no período</p> : (
                  <div className="space-y-3">
                    {products.slice(0, 8).map(p => (
                      <div key={p.name}>
                        <div className="flex justify-between text-sm gap-3">
                          <span className="truncate text-slate-700">{p.name}</span>
                          <span className="font-semibold text-slate-900 whitespace-nowrap">{p.qty.toLocaleString('pt-BR')} un</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                          <div className="h-full bg-orange-400" style={{ width: `${(p.qty / products[0].qty) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <h3 className="font-semibold text-slate-900 mb-4">Melhores clientes do atacado</h3>
              <ClientsTable rows={clients.slice(0, 8)} onOpen={id => id && navigate(`/admin/clientes/${id}`)} />
            </div>
          </>
        )}

        {orders.length > 0 && tab === 'Pedidos' && (
          <div className="card !p-0 overflow-hidden">
            <div className="p-4 flex flex-wrap items-center gap-3 border-b border-slate-100">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente, pedido ou nota"
                  className="input !pl-9 !py-2" />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="input !w-auto !py-2">
                <option value="todos">Todas as situações</option>
                <option value="ativo">Ativos</option>
                <option value="cancelado">Cancelados</option>
              </select>
              <p className="text-xs text-slate-400 ml-auto">{filteredOrders.length} pedido(s)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 bg-slate-50">
                    <th className="px-4 py-3">Pedido</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Situação</th><th className="px-4 py-3">Nota</th><th className="px-4 py-3 text-right">Itens</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(o => (
                    <tr key={o.blingId} onClick={() => navigate(`/admin/atacado/${o.blingId}`)}
                      className={cn('border-t border-slate-100 cursor-pointer hover:bg-orange-50/40', (o.status !== 'ativo' || o.ignored) && 'text-slate-400')}>
                      <td className="px-4 py-3 font-semibold">#{o.number}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(o.saleDate)}</td>
                      <td className="px-4 py-3">{o.clientName ?? '—'}{o.clientCity && <span className="text-xs text-slate-400"> · {o.clientCity}</span>}</td>
                      <td className="px-4 py-3"><WholesaleStatusBadge o={o} /></td>
                      <td className="px-4 py-3">
                        {o.nfeNumber ? <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{o.nfeNumber}</span>
                          : <span className="text-slate-300">sem nota</span>}
                      </td>
                      <td className="px-4 py-3 text-right">{o.itemsCount}</td>
                      <td className={cn('px-4 py-3 text-right font-semibold whitespace-nowrap', o.status === 'cancelado' && 'line-through')}>{formatCurrency(o.total)}</td>
                    </tr>
                  ))}
                  {filteredOrders.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Nenhum pedido neste período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {orders.length > 0 && tab === 'Clientes' && (
          <div className="card">
            <ClientsTable rows={clients} onOpen={id => id && navigate(`/admin/clientes/${id}`)} />
          </div>
        )}

        {orders.length > 0 && tab === 'Produtos' && (
          <div className="card !p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 bg-slate-50">
                  <th className="px-4 py-3">Produto</th><th className="px-4 py-3 text-right">Quantidade</th><th className="px-4 py-3 text-right">Valor vendido</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={p.name} className="border-t border-slate-100">
                    <td className="px-4 py-3"><span className="inline-flex w-5 h-5 mr-2 items-center justify-center rounded-full bg-orange-50 text-orange-700 text-[11px] font-bold">{i + 1}</span>{p.name}</td>
                    <td className="px-4 py-3 text-right font-semibold">{p.qty.toLocaleString('pt-BR')} un</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(p.total)}</td>
                  </tr>
                ))}
                {products.length === 0 && <tr><td colSpan={3} className="px-4 py-10 text-center text-slate-400">Sem pedidos no período</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {orders.some(o => o.ignored) && (
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Pedidos marcados como ignorados (testes) aparecem na lista, mas não entram nos totais.
          </p>
        )}
      </div>
    </AdminLayout>
  )
}

function ClientsTable({ rows, onOpen }: {
  rows: { id?: string; name: string; city?: string; count: number; total: number; last: string }[]
  onOpen: (id?: string) => void
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-400 py-4 text-center">Sem pedidos no período</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-4">Cliente</th><th className="py-2 pr-4">Cidade</th><th className="py-2 pr-4 text-right">Pedidos</th>
            <th className="py-2 pr-4 text-right">Faturamento</th><th className="py-2 text-right">Última compra</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id ?? r.name} onClick={() => onOpen(r.id)} className="border-t border-slate-100 cursor-pointer hover:bg-orange-50/40">
              <td className="py-2.5 pr-4 font-medium text-slate-800">{r.name}</td>
              <td className="py-2.5 pr-4 text-slate-500">{r.city ?? '—'}</td>
              <td className="py-2.5 pr-4 text-right">{r.count}</td>
              <td className="py-2.5 pr-4 text-right font-semibold">{formatCurrency(r.total)}</td>
              <td className="py-2.5 text-right text-slate-500 whitespace-nowrap">{formatDate(r.last)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
