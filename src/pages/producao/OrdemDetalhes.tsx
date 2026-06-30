import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Package, Check, X, Calendar, AlertTriangle,
  Truck, ChevronDown, ChevronUp, Edit2, Trash2, Plus, MoreVertical,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { useProductionOrder, useSeamstressProducts } from '@/hooks/useProducaoData'
import {
  registerDelivery, updateProductionOrder,
  editProductionOrder, deleteProductionOrder, deleteProductionOrderItem,
} from '@/services/producaoDB'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/utils'
import { cn } from '@/utils'
import type { ProductionOrderStatus, ProductionDelivery } from '@/types'

const STATUS_COLOR: Record<ProductionOrderStatus, string> = {
  solicitada: 'bg-slate-100 text-slate-700',
  em_producao: 'bg-blue-100 text-blue-700',
  parcialmente_entregue: 'bg-orange-100 text-orange-700',
  concluida: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-600',
}
const STATUS_LABEL: Record<ProductionOrderStatus, string> = {
  solicitada: 'Solicitada', em_producao: 'Em Produção',
  parcialmente_entregue: 'Parcialmente Entregue', concluida: 'Concluída', cancelada: 'Cancelada',
}

function fmt(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

interface EditItem {
  id?: string
  seamstressProductId: string
  productName: string
  quantity: number
  unitValue: number
  deliveredQty: number // para bloquear edição se já entregue
}

export default function OrdemDetalhes() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: order, loading, refetch } = useProductionOrder(id)

  // Delivery
  const [deliveryModal, setDeliveryModal] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10))
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [deliveryQtys, setDeliveryQtys] = useState<Record<string, number>>({})

  // Status
  const [statusModal, setStatusModal] = useState(false)
  const [showDeliveries, setShowDeliveries] = useState(false)

  // Edit
  const [editModal, setEditModal] = useState(false)
  const [editDeadline, setEditDeadline] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editItems, setEditItems] = useState<EditItem[]>([])
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([])

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Menu
  const [menuOpen, setMenuOpen] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  // Products for the seamstress (para o select de edição)
  const { data: seamstressProducts = [] } = useSeamstressProducts(order?.seamstressId)

  function openEdit() {
    if (!order) return
    setMenuOpen(false)
    setEditDeadline(order.deadline ?? '')
    setEditNotes(order.notes ?? '')
    setEditItems((order.items ?? []).map(it => ({
      id: it.id,
      seamstressProductId: it.seamstressProductId ?? '',
      productName: it.productName,
      quantity: it.quantity,
      unitValue: it.unitValue,
      deliveredQty: it.deliveredQty,
    })))
    setDeletedItemIds([])
    setError('')
    setEditModal(true)
  }

  function addEditItem() {
    setEditItems(prev => [...prev, {
      seamstressProductId: '', productName: '', quantity: 1, unitValue: 0, deliveredQty: 0,
    }])
  }

  function removeEditItem(i: number) {
    const item = editItems[i]
    if (item.id) setDeletedItemIds(prev => [...prev, item.id!])
    setEditItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function setEditItemProduct(i: number, productId: string) {
    const prod = seamstressProducts.find(p => p.id === productId)
    setEditItems(prev => prev.map((it, idx) => idx !== i ? it : {
      ...it,
      seamstressProductId: productId,
      productName: prod?.productName ?? it.productName,
      unitValue: prod?.unitValue ?? it.unitValue,
    }))
  }

  async function handleEdit() {
    if (editItems.length === 0) { setError('Adicione ao menos um produto'); return }
    if (editItems.some(it => !it.productName.trim() || it.quantity <= 0)) {
      setError('Preencha produto e quantidade em todos os itens'); return
    }
    setSaving(true)
    setError('')
    try {
      // Excluir itens removidos
      for (const itemId of deletedItemIds) {
        await deleteProductionOrderItem(itemId)
      }
      await editProductionOrder(id!, {
        deadline: editDeadline || undefined,
        notes: editNotes || undefined,
        items: editItems.map(it => ({
          id: it.id,
          seamstressProductId: it.seamstressProductId || undefined,
          productName: it.productName,
          quantity: it.quantity,
          unitValue: it.unitValue,
        })),
      }, user?.id, user?.name)
      setEditModal(false)
      refetch()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!order) return
    setSaving(true)
    try {
      await deleteProductionOrder(order.id, order.seamstressName, user?.id, user?.name)
      navigate('/admin/producao/ordens')
    } catch (e: unknown) {
      alert((e as Error).message)
      setSaving(false)
    }
  }

  async function handleDelivery() {
    if (!order) return
    const items = (order.items ?? [])
      .filter(it => (deliveryQtys[it.id] ?? 0) > 0)
      .map(it => ({
        orderItemId: it.id,
        productName: it.productName,
        quantityDelivered: deliveryQtys[it.id] ?? 0,
      }))
    if (items.length === 0) { setError('Informe pelo menos uma quantidade'); return }
    for (const it of order.items ?? []) {
      const remaining = it.quantity - it.deliveredQty
      const qty = deliveryQtys[it.id] ?? 0
      if (qty > remaining) {
        setError(`Quantidade de "${it.productName}" excede o pedido (faltam ${remaining})`)
        return
      }
    }
    setSaving(true)
    setError('')
    try {
      await registerDelivery({
        orderId: order.id, seamstressId: order.seamstressId,
        deliveryDate, notes: deliveryNotes || undefined, items,
      }, user?.id, user?.name)
      setDeliveryModal(false)
      setDeliveryQtys({})
      setDeliveryNotes('')
      refetch()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Erro')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(status: ProductionOrderStatus) {
    if (!order) return
    await updateProductionOrder(order.id, { status }, user?.id, user?.name)
    setStatusModal(false)
    refetch()
  }

  if (loading) return <AdminLayout title="Ordem"><div className="p-6"><LoadingSpinner /></div></AdminLayout>
  if (!order) return <AdminLayout title="Ordem"><div className="p-6 text-center text-slate-400">Ordem não encontrada</div></AdminLayout>

  const isLate = order.deadline && order.deadline < today && !['concluida','cancelada'].includes(order.status)
  const totalQty = (order.items ?? []).reduce((s, i) => s + i.quantity, 0)
  const deliveredQty = (order.items ?? []).reduce((s, i) => s + i.deliveredQty, 0)
  const totalVal = (order.items ?? []).reduce((s, i) => s + i.totalValue, 0)
  const deliveredVal = (order.items ?? []).reduce((s, i) => s + i.deliveredQty * i.unitValue, 0)
  const deliveries = (order as (typeof order & { deliveries?: ProductionDelivery[] })).deliveries ?? []
  const canDeliver = !['concluida', 'cancelada'].includes(order.status)
  const hasDeliveries = deliveries.length > 0

  return (
    <AdminLayout title="Ordem de Produção">
      <div className="p-4 lg:p-6 max-w-3xl mx-auto">
        {/* Back */}
        <button onClick={() => navigate('/admin/producao/ordens')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        {/* Header */}
        <div className={cn('card mb-4', isLate && 'border-l-4 border-red-400')}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900">{order.seamstressName}</h1>
              <div className="flex flex-wrap gap-2 mt-1 text-sm text-slate-500">
                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Solicitada: {fmt(order.requestDate)}</span>
                {order.deadline && <span>Prazo: {fmt(order.deadline)}</span>}
              </div>
              {isLate && (
                <div className="flex items-center gap-1 mt-1 text-red-600 text-sm font-semibold">
                  <AlertTriangle className="w-4 h-4" /> Entrega atrasada
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Status badge */}
              <button onClick={() => setStatusModal(true)}
                className={cn('text-xs font-semibold px-3 py-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity', STATUS_COLOR[order.status])}>
                {STATUS_LABEL[order.status]}
              </button>

              {/* ⋮ Menu */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(o => !o)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                      <motion.div
                        className="absolute right-0 top-9 z-40 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-40"
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                        transition={{ duration: 0.12 }}
                      >
                        <button
                          onClick={openEdit}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Edit2 className="w-4 h-4 text-slate-400" /> Editar Ordem
                        </button>
                        <button
                          onClick={() => { setMenuOpen(false); setDeleteConfirm(true) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" /> Apagar Ordem
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-slate-500">Progresso</span>
              <span className="font-semibold text-slate-700">{deliveredQty}/{totalQty} peças</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <motion.div className="h-full rounded-full bg-green-500"
                initial={{ width: 0 }}
                animate={{ width: totalQty > 0 ? `${Math.min(100, (deliveredQty / totalQty) * 100)}%` : '0%' }}
                transition={{ duration: 0.8 }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>Valor entregue: {formatCurrency(deliveredVal)}</span>
              <span>Total pedido: {formatCurrency(totalVal)}</span>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="card mb-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Produtos da Ordem</h2>
          <div className="space-y-2">
            {(order.items ?? []).map(it => {
              const remaining = it.quantity - it.deliveredQty
              return (
                <div key={it.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <Package className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{it.productName}</p>
                    <p className="text-xs text-slate-500">{formatCurrency(it.unitValue)}/peça</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-700">{it.deliveredQty}/{it.quantity}</p>
                    {remaining > 0 && <p className="text-xs text-orange-600">faltam {remaining}</p>}
                    {remaining === 0 && <p className="text-xs text-green-600">concluído</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Deliveries history */}
        {deliveries.length > 0 && (
          <div className="card mb-4">
            <button className="flex items-center justify-between w-full"
              onClick={() => setShowDeliveries(!showDeliveries)}>
              <h2 className="text-sm font-semibold text-slate-700">Histórico de Entregas ({deliveries.length})</h2>
              {showDeliveries ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            <AnimatePresence>
              {showDeliveries && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-3 space-y-3">
                    {deliveries.map(d => (
                      <div key={d.id} className="bg-slate-50 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Truck className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-medium text-slate-700">{fmt(d.deliveryDate)}</span>
                        </div>
                        {(d.items ?? []).map((it, i) => (
                          <div key={i} className="flex justify-between text-xs text-slate-600 mt-1">
                            <span>{it.productName}</span>
                            <span className="font-semibold">{it.quantityDelivered} peças</span>
                          </div>
                        ))}
                        {d.notes && <p className="text-xs text-slate-500 mt-2 italic">{d.notes}</p>}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {order.notes && (
          <div className="card mb-4">
            <p className="text-xs font-semibold text-slate-500 mb-1">Observações</p>
            <p className="text-sm text-slate-700">{order.notes}</p>
          </div>
        )}

        {/* Action */}
        {canDeliver && (
          <button onClick={() => { setDeliveryModal(true); setDeliveryQtys({}); setError('') }}
            className="w-full py-3 bg-green-600 text-white rounded-xl font-medium text-sm hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
            <Truck className="w-4 h-4" /> Registrar Entrega
          </button>
        )}
      </div>

      {/* ── EDIT MODAL ─────────────────────────────────────────── */}
      <AnimatePresence>
        {editModal && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setEditModal(false)} />
            <motion.div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
              initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}>
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">Editar Ordem</h2>
                <button onClick={() => setEditModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Prazo de Entrega</label>
                    <input type="date" value={editDeadline} onChange={e => setEditDeadline(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                  </div>
                  <div className="flex items-end">
                    {editDeadline && (
                      <button onClick={() => setEditDeadline('')}
                        className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-1">
                        <X className="w-3 h-3" /> Remover prazo
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observações</label>
                  <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
                    placeholder="Observações..." />
                </div>

                {/* Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-600">Produtos</label>
                    <button onClick={addEditItem}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
                      <Plus className="w-3.5 h-3.5" /> Adicionar
                    </button>
                  </div>

                  <div className="space-y-2">
                    {editItems.map((item, i) => {
                      const hasDelivered = (item.deliveredQty ?? 0) > 0
                      return (
                        <div key={i} className={cn('flex gap-2 items-start p-2 rounded-xl', hasDelivered ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50')}>
                          <div className="flex-1">
                            {seamstressProducts.length > 0 ? (
                              <select
                                value={item.seamstressProductId}
                                onChange={e => setEditItemProduct(i, e.target.value)}
                                disabled={hasDelivered}
                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                <option value="">Selecionar produto...</option>
                                {seamstressProducts.map(p => (
                                  <option key={p.id} value={p.id}>{p.productName} — {formatCurrency(p.unitValue)}/peça</option>
                                ))}
                              </select>
                            ) : (
                              <input value={item.productName}
                                onChange={e => setEditItems(prev => prev.map((it, idx) => idx !== i ? it : { ...it, productName: e.target.value }))}
                                disabled={hasDelivered}
                                placeholder="Nome do produto"
                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:opacity-60" />
                            )}
                            {hasDelivered && (
                              <p className="text-[11px] text-amber-600 mt-0.5 px-1">
                                {item.deliveredQty} já entregue(s) — produto não pode ser alterado
                              </p>
                            )}
                          </div>
                          <input type="number" min={item.deliveredQty || 1} value={item.quantity}
                            onChange={e => setEditItems(prev => prev.map((it, idx) => idx !== i ? it : { ...it, quantity: parseInt(e.target.value) || 1 }))}
                            placeholder="Qtd"
                            className="w-20 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                          <div className="w-20 text-xs text-slate-500 py-2.5 text-right">
                            {formatCurrency(item.quantity * item.unitValue)}
                          </div>
                          <button
                            onClick={() => removeEditItem(i)}
                            disabled={hasDelivered}
                            className="w-8 h-8 mt-0.5 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                            title={hasDelivered ? 'Não é possível remover um item com entregas registradas' : 'Remover'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {editItems.length > 0 && (
                    <div className="flex justify-end mt-2">
                      <p className="text-sm font-semibold text-slate-700">
                        Total: {formatCurrency(editItems.reduce((s, it) => s + it.quantity * it.unitValue, 0))}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 flex gap-3">
                <button onClick={() => setEditModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleEdit} disabled={saving}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar Alterações
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DELETE CONFIRM ─────────────────────────────────────── */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(false)} />
            <motion.div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4 w-full"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Apagar Ordem?</h3>
              <p className="text-sm text-slate-600 mb-2">
                Essa ação removerá permanentemente a ordem de produção de <strong>{order.seamstressName}</strong>.
              </p>
              {hasDeliveries && (
                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl mb-4">
                  <strong>Atenção:</strong> esta ordem possui {deliveries.length} entrega(s) registrada(s). Ao apagar, todas as entregas também serão removidas.
                </p>
              )}
              <div className="flex gap-3 mt-4">
                <button onClick={() => setDeleteConfirm(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleDelete} disabled={saving}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Apagar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DELIVERY MODAL ─────────────────────────────────────── */}
      <AnimatePresence>
        {deliveryModal && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setDeliveryModal(false)} />
            <motion.div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto"
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}>
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">Registrar Entrega</h2>
                <button onClick={() => setDeliveryModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data da Entrega</label>
                  <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Quantidades Entregues</label>
                  <div className="space-y-2">
                    {(order.items ?? []).map(it => {
                      const remaining = it.quantity - it.deliveredQty
                      if (remaining <= 0) return null
                      return (
                        <div key={it.id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800">{it.productName}</p>
                            <p className="text-xs text-slate-500">Pedido: {it.quantity} · Entregue: {it.deliveredQty} · Faltam: {remaining}</p>
                          </div>
                          <input type="number" min="0" max={remaining}
                            value={deliveryQtys[it.id] ?? ''}
                            onChange={e => setDeliveryQtys(prev => ({ ...prev, [it.id]: parseInt(e.target.value) || 0 }))}
                            className="w-20 border border-slate-200 rounded-xl px-2 py-1.5 text-sm text-center focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            placeholder="0" />
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observação</label>
                  <textarea value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
                    placeholder="Observações..." />
                </div>
              </div>
              <div className="p-5 border-t border-slate-100 flex gap-3">
                <button onClick={() => setDeliveryModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleDelivery} disabled={saving}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                  Confirmar Entrega
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── STATUS MODAL ───────────────────────────────────────── */}
      <AnimatePresence>
        {statusModal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setStatusModal(false)} />
            <motion.div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4 w-full"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <h3 className="text-lg font-bold text-slate-900 mb-4">Alterar Status</h3>
              <div className="space-y-2">
                {(Object.keys(STATUS_LABEL) as ProductionOrderStatus[])
                  .filter(s => s !== order.status)
                  .map(s => (
                    <button key={s} onClick={() => handleStatusChange(s)}
                      className={cn('w-full py-2.5 text-sm font-semibold rounded-xl transition-colors', STATUS_COLOR[s], 'hover:opacity-80')}>
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
              </div>
              <button onClick={() => setStatusModal(false)}
                className="w-full mt-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
