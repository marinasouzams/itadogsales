import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShoppingCart, Plus, Search, Truck, Calendar, Printer } from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useOrders, useAllProducts } from '@/hooks/useData'
import { logAudit } from '@/services/db'
import { printComercialPdf } from '@/services/comercialPdf'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate, cn } from '@/utils'
import { OrderStatusBadge, SyncStatusBadge } from '@/components/shared/StatusBadge'
import type { OrderStatus, Order } from '@/types'

const STATUS_FILTERS: { label: string; value: OrderStatus | 'todos' }[] = [
  { label: 'Todos', value: 'todos' },
  { label: '🚚 Faturado / Envio', value: 'invoiced_ready_to_ship' },
  { label: 'Rascunho', value: 'draft' },
  { label: 'Gerado', value: 'generated' },
  { label: 'Pend. Separação', value: 'pending_separation' },
  { label: 'Em Separação', value: 'separation' },
  { label: '✅ Entregue', value: 'delivered' },
]

function orderAgeDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

export default function RepPedidos() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: orders = [], loading } = useOrders(user?.id)
  const { data: allProducts = [] } = useAllProducts()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<OrderStatus | 'todos'>('todos')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [printingId, setPrintingId] = useState<string | null>(null)

  const printOrder = async (e: React.MouseEvent, order: Order) => {
    e.stopPropagation()
    setPrintingId(order.id)
    try {
      await printComercialPdf(order, allProducts)
      if (user) await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'generate_spreadsheet', entity: 'Pedido', entityId: order.id, description: `PDF Comercial (2ª via) gerado — pedido ${order.number}`, timestamp: new Date().toISOString() })
    } finally {
      setPrintingId(null)
    }
  }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  const ordersThisMonth = useMemo(() => orders.filter(o => o.createdAt.slice(0, 10) >= startOfMonth), [orders])
  const readyToDeliver = useMemo(() => orders.filter(o => o.status === 'invoiced_ready_to_ship'), [orders])

  const filtered = useMemo(() => orders.filter(o => {
    // clienteId filter removed (no longer used)
    const matchSearch = o.clientName.toLowerCase().includes(search.toLowerCase()) ||
      o.number.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'todos' || o.status === filter
    const matchFrom = !dateFrom || o.createdAt.slice(0, 10) >= dateFrom
    const matchTo = !dateTo || o.createdAt.slice(0, 10) <= dateTo
    return matchSearch && matchFilter && matchFrom && matchTo
  }), [orders, search, filter, dateFrom, dateTo])

  if (loading) return <RepLayout title="Pedidos"><LoadingSpinner /></RepLayout>

  return (
    <RepLayout title="Pedidos">
      <div className="p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div className="card p-4" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-primary-600" />
              <p className="text-xs text-slate-400">Pedidos este mês</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{ordersThisMonth.length}</p>
            <p className="text-xs text-slate-400">{formatCurrency(ordersThisMonth.reduce((s, o) => s + o.total, 0))}</p>
          </motion.div>
          <motion.div
            className={cn('card p-4', readyToDeliver.length > 0 ? 'border-amber-300 bg-amber-50' : '')}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Truck className={cn('w-4 h-4', readyToDeliver.length > 0 ? 'text-amber-600' : 'text-slate-400')} />
              <p className="text-xs text-slate-400">Pronto p/ entrega</p>
            </div>
            <p className={cn('text-2xl font-bold', readyToDeliver.length > 0 ? 'text-amber-700' : 'text-slate-900')}>
              {readyToDeliver.length}
            </p>
            {readyToDeliver.length > 0 && (
              <button onClick={() => setFilter('invoiced_ready_to_ship')} className="text-xs text-amber-600 font-medium mt-0.5">Ver pedidos →</button>
            )}
          </motion.div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente ou número..." className="input pl-10" />
        </div>

        {/* Status filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                filter === f.value ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600',
                f.value === 'invoiced_ready_to_ship' && filter !== f.value && 'border-amber-300 text-amber-600'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Period filter */}
        <div>
          <button onClick={() => setShowDateFilter(v => !v)} className="text-xs text-primary-600 font-medium">
            {showDateFilter ? '↑ Ocultar filtro de período' : '↓ Filtrar por período'}
          </button>
          {showDateFilter && (
            <div className="flex gap-2 mt-2">
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
        </div>

        <p className="text-xs text-slate-500">{filtered.length} pedido{filtered.length !== 1 ? 's' : ''}</p>

        {/* New order button */}
        <button
          onClick={() => navigate('/rep/pedidos/novo')}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-primary-200 text-primary-600 text-sm font-semibold hover:bg-primary-50 transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Pedido
        </button>

        {/* Orders list */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">Nenhum pedido encontrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((order, i) => (
              <motion.div
                key={order.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/rep/pedidos/${order.id}`)}
                className={cn(
                  'w-full card p-4 text-left cursor-pointer',
                  order.status === 'invoiced_ready_to_ship' && 'border-amber-300 bg-amber-50/50'
                )}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                {order.status === 'invoiced_ready_to_ship' && (
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-amber-600">
                    <Truck className="w-3.5 h-3.5" /> FATURADO — PRONTO PARA ENVIO
                  </div>
                )}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 text-sm truncate">{order.clientName}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{order.number} · {formatDate(order.createdAt)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <OrderStatusBadge status={order.status} />
                    <span className="text-xs text-slate-400 font-medium">{orderAgeDays(order.createdAt)}d</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <SyncStatusBadge status={order.syncStatus} />
                    <span className="text-xs text-slate-400">{order.items.length} produto(s)</span>
                  </div>
                  <span className="text-base font-bold text-slate-900">{formatCurrency(order.total)}</span>
                </div>
                <button
                  onClick={(e) => printOrder(e, order)}
                  disabled={printingId === order.id}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg py-2 transition-colors disabled:opacity-50">
                  <Printer className="w-3.5 h-3.5" /> {printingId === order.id ? 'Gerando...' : '📄 Imprimir Pedido'}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </RepLayout>
  )
}
