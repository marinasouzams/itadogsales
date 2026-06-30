import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Filter, X, Check, Scissors, ChevronRight, Trash2 } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { useProductionOrders, useSeamstresses, useSeamstressProducts } from '@/hooks/useProducaoData'
import { createProductionOrder } from '@/services/producaoDB'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/utils'
import { cn } from '@/utils'
import type { ProductionOrderStatus, SeamstressProduct } from '@/types'

const STATUS_COLOR: Record<ProductionOrderStatus, string> = {
  solicitada: 'bg-slate-100 text-slate-600',
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

interface OrderItem {
  seamstressProductId: string
  productName: string
  quantity: number
  unitValue: number
}

export default function OrdensProducao() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: orders = [], loading, refetch } = useProductionOrders()
  const { data: seamstresses = [] } = useSeamstresses()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProductionOrderStatus | 'todas'>('todas')
  const [seamstressFilter, setSeamstressFilter] = useState('')
  const [modal, setModal] = useState(false)

  // Form state
  const [form, setForm] = useState({
    seamstressId: '',
    requestDate: new Date().toISOString().slice(0, 10),
    deadline: '',
    notes: '',
  })
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Load products for selected seamstress
  const { data: seamstressProducts = [] } = useSeamstressProducts(form.seamstressId || undefined)

  const today = new Date().toISOString().slice(0, 10)

  const filtered = orders.filter(o => {
    const matchSearch = !search || o.seamstressName.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'todas' || o.status === statusFilter
    const matchSeamstress = !seamstressFilter || o.seamstressId === seamstressFilter
    return matchSearch && matchStatus && matchSeamstress
  })

  function addItem() {
    setOrderItems(prev => [...prev, { seamstressProductId: '', productName: '', quantity: 0, unitValue: 0 }])
  }

  function removeItem(i: number) {
    setOrderItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function setItemProduct(i: number, product: SeamstressProduct | null) {
    setOrderItems(prev => prev.map((item, idx) => idx !== i ? item : {
      seamstressProductId: product?.id ?? '',
      productName: product?.productName ?? '',
      quantity: item.quantity || 1,
      unitValue: product?.unitValue ?? 0,
    }))
  }

  function setItemQty(i: number, qty: number) {
    setOrderItems(prev => prev.map((item, idx) => idx !== i ? item : { ...item, quantity: qty }))
  }

  async function handleSave() {
    if (!form.seamstressId) { setError('Selecione uma costureira'); return }
    if (orderItems.length === 0) { setError('Adicione ao menos um produto'); return }
    if (orderItems.some(it => !it.productName.trim() || it.quantity <= 0)) {
      setError('Preencha produto e quantidade em todos os itens'); return
    }
    setSaving(true)
    setError('')
    try {
      const s = seamstresses.find(s => s.id === form.seamstressId)
      await createProductionOrder({
        seamstressId: form.seamstressId,
        seamstressName: s?.name ?? '',
        requestDate: form.requestDate,
        deadline: form.deadline || undefined,
        notes: form.notes || undefined,
        items: orderItems.map(it => ({
          seamstressProductId: it.seamstressProductId || undefined,
          productName: it.productName,
          quantity: it.quantity,
          unitValue: it.unitValue,
        })),
      }, user?.id, user?.name)
      setModal(false)
      setForm({ seamstressId: '', requestDate: new Date().toISOString().slice(0, 10), deadline: '', notes: '' })
      setOrderItems([])
      refetch()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const totalValue = orderItems.reduce((s, it) => s + it.quantity * it.unitValue, 0)

  return (
    <AdminLayout title="Ordens de Produção">
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Ordens de Produção</h1>
            <p className="text-sm text-slate-500">{orders.filter(o => ['solicitada','em_producao','parcialmente_entregue'].includes(o.status)).length} em aberto</p>
          </div>
          <button onClick={() => { setModal(true); setError(''); setOrderItems([{ seamstressProductId: '', productName: '', quantity: 1, unitValue: 0 }]) }}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors">
            <Plus className="w-4 h-4" /> Nova Ordem
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex-1 min-w-48 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar costureira..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
          </div>
          <select value={seamstressFilter} onChange={e => setSeamstressFilter(e.target.value)}
            className="border border-slate-200 rounded-xl text-sm px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none">
            <option value="">Toda costureira</option>
            {seamstresses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="border border-slate-200 rounded-xl text-sm px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none">
            <option value="todas">Todo status</option>
            {(Object.keys(STATUS_LABEL) as ProductionOrderStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-10"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Scissors className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Nenhuma ordem encontrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(o => {
              const isLate = o.deadline && o.deadline < today && !['concluida','cancelada'].includes(o.status)
              const totalItems = (o.items ?? []).reduce((s, i) => s + i.quantity, 0)
              const totalDelivered = (o.items ?? []).reduce((s, i) => s + i.deliveredQty, 0)
              const totalVal = (o.items ?? []).reduce((s, i) => s + i.quantity * i.unitValue, 0)
              return (
                <motion.div key={o.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={cn('card hover:shadow-md transition-shadow cursor-pointer', isLate && 'border-l-4 border-red-400')}
                  onClick={() => navigate(`/admin/producao/ordens/${o.id}`)}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-sm',
                      'bg-purple-500'
                    )}>
                      {o.seamstressName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900">{o.seamstressName}</p>
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_COLOR[o.status])}>
                          {STATUS_LABEL[o.status]}
                        </span>
                        {isLate && <span className="text-xs text-red-600 font-semibold">ATRASADA</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                        <span>Solicitada: {fmt(o.requestDate)}</span>
                        {o.deadline && <span>Prazo: {fmt(o.deadline)}</span>}
                        <span>{totalItems} peças · {formatCurrency(totalVal)}</span>
                      </div>
                      {totalDelivered > 0 && (
                        <div className="mt-1.5">
                          <div className="flex justify-between text-xs text-slate-400 mb-0.5">
                            <span>Entregue: {totalDelivered}/{totalItems}</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full"
                              style={{ width: `${Math.min(100, (totalDelivered / totalItems) * 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal Nova Ordem */}
      <AnimatePresence>
        {modal && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setModal(false)} />
            <motion.div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
              initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}>
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">Nova Ordem de Produção</h2>
                <button onClick={() => setModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Costureira *</label>
                  <select value={form.seamstressId} onChange={e => setForm(f => ({ ...f, seamstressId: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                    <option value="">Selecionar costureira...</option>
                    {seamstresses.filter(s => s.status === 'ativa').map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data da Solicitação</label>
                    <input type="date" value={form.requestDate} onChange={e => setForm(f => ({ ...f, requestDate: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Prazo de Entrega</label>
                    <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                  </div>
                </div>

                {/* Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-600">Produtos *</label>
                    <button onClick={addItem}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium">
                      <Plus className="w-3.5 h-3.5" /> Adicionar
                    </button>
                  </div>
                  <div className="space-y-2">
                    {orderItems.map((item, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <div className="flex-1">
                          {form.seamstressId && seamstressProducts.length > 0 ? (
                            <select
                              value={item.seamstressProductId}
                              onChange={e => {
                                const prod = seamstressProducts.find(p => p.id === e.target.value) ?? null
                                setItemProduct(i, prod)
                              }}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            >
                              <option value="">Selecionar produto...</option>
                              {seamstressProducts.map(p => (
                                <option key={p.id} value={p.id}>{p.productName} — {formatCurrency(p.unitValue)}/peça</option>
                              ))}
                            </select>
                          ) : (
                            <input value={item.productName}
                              onChange={e => setOrderItems(prev => prev.map((it, idx) => idx !== i ? it : { ...it, productName: e.target.value }))}
                              placeholder="Nome do produto"
                              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                          )}
                        </div>
                        <input type="number" min="1" value={item.quantity || ''}
                          onChange={e => setItemQty(i, parseInt(e.target.value) || 0)}
                          placeholder="Qtd"
                          className="w-20 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                        <div className="w-24 text-xs text-slate-500 py-2.5 text-right">
                          {formatCurrency(item.quantity * item.unitValue)}
                        </div>
                        <button onClick={() => removeItem(i)}
                          className="w-8 h-8 mt-0.5 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {orderItems.length > 0 && (
                    <div className="flex justify-end mt-2">
                      <p className="text-sm font-semibold text-slate-700">Total: {formatCurrency(totalValue)}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Observações</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
                    placeholder="Observações..." />
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 flex gap-3">
                <button onClick={() => setModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                  Criar Ordem
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
