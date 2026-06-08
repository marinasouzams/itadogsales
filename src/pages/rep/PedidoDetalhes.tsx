import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Package, Calendar, CreditCard, MessageSquare, CheckCircle, Trash2, X, Send } from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useOrder } from '@/hooks/useData'
import { generateOrder, deliverOrder, deleteOrder, createInteraction, logAudit } from '@/services/db'
import { LoadingSpinner, ErrorState } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate, cn } from '@/utils'
import { OrderStatusBadge } from '@/components/shared/StatusBadge'

export default function PedidoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: order, loading, error, refetch } = useOrder(id)

  const [showFinalize, setShowFinalize] = useState(false)
  const [showDeliver, setShowDeliver] = useState(false)
  const [showDelete, setShowDelete]   = useState(false)
  const [deliverNotes, setDeliverNotes] = useState('')
  const [acting, setActing] = useState(false)

  if (loading) return <RepLayout title="Pedido"><LoadingSpinner /></RepLayout>
  if (error || !order) return (
    <RepLayout title="Pedido">
      <div className="p-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm mb-4"><ChevronLeft className="w-4 h-4" /> Voltar</button>
        <ErrorState message="Pedido não encontrado" />
      </div>
    </RepLayout>
  )

  const isDraft     = order.status === 'draft'
  const isInvoiced  = order.status === 'invoiced_ready_to_ship'
  const isDelivered = order.status === 'delivered'
  const isReadOnly  = isDelivered

  const handleFinalize = async () => {
    if (!user) return
    setActing(true)
    await generateOrder(order.id, user.name)
    await createInteraction({ clientId: order.clientId, clientName: order.clientName, repId: user.id, repName: user.name, type: 'pedido', title: 'Pedido gerado', description: `Pedido ${order.number} finalizado pelo representante`, relatedId: order.id, timestamp: new Date().toISOString() })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'generate_order', entity: 'Pedido', entityId: order.id, description: `Pedido ${order.number} gerado`, timestamp: new Date().toISOString() })
    setActing(false); setShowFinalize(false); refetch()
  }

  const handleDeliver = async () => {
    if (!user) return
    setActing(true)
    await deliverOrder(order.id, user.name, deliverNotes.trim() || undefined)
    await createInteraction({ clientId: order.clientId, clientName: order.clientName, repId: user.id, repName: user.name, type: 'pedido', title: 'Pedido entregue', description: `Pedido ${order.number} marcado como entregue`, relatedId: order.id, timestamp: new Date().toISOString() })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'mark_as_delivered', entity: 'Pedido', entityId: order.id, description: `Pedido ${order.number} entregue`, timestamp: new Date().toISOString() })
    setActing(false); setShowDeliver(false); refetch()
  }

  const handleDelete = async () => {
    if (!user) return
    setActing(true)
    await deleteOrder(order.id)
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'delete_draft_order', entity: 'Pedido', entityId: order.id, description: `Rascunho ${order.number} excluído`, timestamp: new Date().toISOString() })
    navigate('/rep/pedidos', { replace: true })
  }

  return (
    <RepLayout title={order.number}>
      <div className="p-4 space-y-4 pb-8">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
          {isDraft && (
            <button onClick={() => setShowDelete(true)} className="flex items-center gap-1.5 text-sm font-medium text-red-500">
              <Trash2 className="w-4 h-4" /> Excluir
            </button>
          )}
        </div>

        {/* Status banner para invoiced */}
        {isInvoiced && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-green-500 rounded-2xl p-4 flex items-center gap-3 text-white">
            <CheckCircle className="w-8 h-8 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm">Faturado — Pronto para Envio!</p>
              <p className="text-green-100 text-xs">Confirme a entrega ao receber o produto no cliente.</p>
            </div>
          </motion.div>
        )}

        {isDelivered && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-600 rounded-2xl p-4 flex items-center gap-3 text-white">
            <CheckCircle className="w-8 h-8 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm">Pedido Entregue</p>
              {order.deliveredAt && <p className="text-slate-300 text-xs">{formatDate(order.deliveredAt)}{order.deliveredBy ? ` · ${order.deliveredBy}` : ''}</p>}
            </div>
          </motion.div>
        )}

        {/* Header card */}
        <motion.div className="card p-5" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-slate-400 font-mono">{order.number}</p>
              <h2 className="font-bold text-slate-900 mt-0.5">{order.clientName}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{formatDate(order.createdAt)}</p>
            </div>
            <OrderStatusBadge status={order.status} />
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
              <motion.div key={`${item.productId}-${i}`} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{item.productName}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span>{item.quantity} un × {formatCurrency(item.price)}</span>
                      {item.discount > 0 && <span className="text-green-600 font-medium">−{item.discount}% desc</span>}
                    </div>
                    {/* Variantes */}
                    {item.variants && item.variants.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {item.variants.map(v => (
                          <div key={v.valueId} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-500">{v.attributeName}: <span className="font-semibold text-slate-700">{v.valueName}</span></span>
                            <span className="font-bold text-slate-800">{v.qty} un</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Atributo único (retrocompat) */}
                    {!item.variants && item.attribute && (
                      <p className="text-xs text-primary-600 font-medium mt-1">
                        {item.attribute.attributeName}: {item.attribute.valueName}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-bold text-slate-900 flex-shrink-0">{formatCurrency(item.total)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="card p-4 space-y-2">
          <div className="flex justify-between text-sm text-slate-500">
            <span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Desconto</span><span>−{formatCurrency(order.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-100">
            <span>Total</span><span>{formatCurrency(order.total)}</span>
          </div>
        </div>

        {order.notes && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-slate-400" />
              <p className="section-title">Observações</p>
            </div>
            <p className="text-sm text-slate-600">{order.notes}</p>
          </div>
        )}

        {order.deliveredNotes && (
          <div className="card p-4 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 mb-1">Observação de entrega</p>
            <p className="text-sm text-slate-600">{order.deliveredNotes}</p>
          </div>
        )}

        {/* Action buttons */}
        {!isReadOnly && (
          <div className="space-y-2">
            {isDraft && (
              <button onClick={() => setShowFinalize(true)}
                className={cn('w-full btn-primary flex items-center justify-center gap-2 py-3.5')}>
                <Send className="w-4 h-4" /> Finalizar Pedido
              </button>
            )}
            {isInvoiced && order.repId === user?.id && (
              <button onClick={() => setShowDeliver(true)}
                className="w-full bg-green-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <CheckCircle className="w-4 h-4" /> Marcar como Entregue
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal: Finalizar */}
      <AnimatePresence>
        {showFinalize && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowFinalize(false)} />
            <motion.div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 z-50 safe-bottom" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-slate-900">Finalizar Pedido</p>
                <button onClick={() => setShowFinalize(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <p className="text-sm text-slate-500 mb-1">Ao finalizar, o pedido <strong>{order.number}</strong> será enviado para o administrativo.</p>
              <p className="text-xs text-amber-600 mb-5">Após finalizar você não poderá mais editar este pedido.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowFinalize(false)} className="flex-1 btn-secondary">Cancelar</button>
                <button onClick={handleFinalize} disabled={acting}
                  className="flex-1 btn-primary disabled:opacity-50">
                  {acting ? 'Finalizando...' : 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal: Marcar entregue */}
      <AnimatePresence>
        {showDeliver && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDeliver(false)} />
            <motion.div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 z-50 safe-bottom" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-slate-900">Marcar como Entregue</p>
                <button onClick={() => setShowDeliver(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <p className="text-sm text-slate-500 mb-3">Confirma a entrega do pedido <strong>{order.number}</strong> ao cliente?</p>
              <textarea value={deliverNotes} onChange={e => setDeliverNotes(e.target.value)}
                placeholder="Observação sobre a entrega (opcional)..." rows={3} className="input resize-none mb-4" />
              <div className="flex gap-3">
                <button onClick={() => setShowDeliver(false)} className="flex-1 btn-secondary">Cancelar</button>
                <button onClick={handleDeliver} disabled={acting}
                  className="flex-1 bg-green-600 text-white font-semibold py-3 rounded-xl disabled:opacity-50">
                  {acting ? 'Confirmando...' : 'Confirmar Entrega'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal: Excluir */}
      <AnimatePresence>
        {showDelete && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDelete(false)} />
            <motion.div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 z-50 safe-bottom" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-slate-900">Excluir Rascunho</p>
                <button onClick={() => setShowDelete(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <p className="text-sm text-slate-500 mb-5">Tem certeza que deseja excluir o rascunho <strong>{order.number}</strong>? Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDelete(false)} className="flex-1 btn-secondary">Cancelar</button>
                <button onClick={handleDelete} disabled={acting}
                  className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-xl disabled:opacity-50">
                  {acting ? 'Excluindo...' : 'Sim, excluir'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </RepLayout>
  )
}
