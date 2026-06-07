import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Package, Calendar, CreditCard, MessageSquare, Truck } from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useOrder } from '@/hooks/useData'
import { LoadingSpinner, ErrorState } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate } from '@/utils'
import { OrderStatusBadge, SyncStatusBadge } from '@/components/shared/StatusBadge'

export default function PedidoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: order, loading, error } = useOrder(id)

  if (loading) return <RepLayout title="Pedido"><LoadingSpinner /></RepLayout>
  if (error || !order) return (
    <RepLayout title="Pedido">
      <div className="p-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm mb-4"><ChevronLeft className="w-4 h-4" /> Voltar</button>
        <ErrorState message="Pedido não encontrado" />
      </div>
    </RepLayout>
  )

  const isReadyToDeliver = order.status === 'pronto_entrega'

  return (
    <RepLayout title={order.number}>
      <div className="p-4 space-y-4 pb-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>

        {/* Pronto para entrega destaque */}
        {isReadyToDeliver && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-amber-500 rounded-2xl p-4 flex items-center gap-3 text-white"
          >
            <Truck className="w-8 h-8 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm">Pronto para entrega!</p>
              <p className="text-amber-100 text-xs">Produto disponível para ser entregue ao cliente.</p>
            </div>
          </motion.div>
        )}

        {/* Header */}
        <motion.div className="card p-5" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-slate-400 font-mono">{order.number}</p>
              <h2 className="font-bold text-slate-900 mt-0.5">{order.clientName}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{formatDate(order.createdAt)}</p>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <OrderStatusBadge status={order.status} />
              <SyncStatusBadge status={order.syncStatus} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
            {order.paymentTerms && (
              <div className="flex items-start gap-2">
                <CreditCard className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Pagamento</p>
                  <p className="text-sm font-medium text-slate-700">{order.paymentTerms}</p>
                </div>
              </div>
            )}
            {order.deliveryDate && (
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Entrega prevista</p>
                  <p className="text-sm font-medium text-slate-700">{formatDate(order.deliveryDate)}</p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Items */}
        <div className="card p-4">
          <p className="section-title mb-3">Produtos ({order.items.length})</p>
          <div className="space-y-3">
            {order.items.map((item, i) => (
              <motion.div
                key={item.productId}
                className="flex items-start gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 leading-tight">{item.productName}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span>{item.quantity} un × {formatCurrency(item.price)}</span>
                    {item.discount > 0 && <span className="text-green-600 font-medium">−{item.discount}% desc</span>}
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-900 flex-shrink-0">{formatCurrency(item.total)}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="card p-4 space-y-2">
          <div className="flex justify-between text-sm text-slate-500">
            <span>Subtotal</span>
            <span>{formatCurrency(order.subtotal)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Desconto</span>
              <span>−{formatCurrency(order.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-100">
            <span>Total</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-slate-400" />
              <p className="section-title">Observações</p>
            </div>
            <p className="text-sm text-slate-600">{order.notes}</p>
          </div>
        )}

        {/* Bling info */}
        {order.blingOrderId && (
          <div className="card p-4">
            <p className="section-title mb-2">Bling ERP</p>
            <p className="text-xs text-slate-400">ID no Bling: <span className="font-mono font-medium text-slate-700">{order.blingOrderId}</span></p>
          </div>
        )}
      </div>
    </RepLayout>
  )
}
