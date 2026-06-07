import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Plus, Minus, Trash2, ShoppingCart, Save, Search, Package } from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useClients, useProducts, useCompanySettings } from '@/hooks/useData'
import { createOrder, generateOrder, createInteraction, logAudit } from '@/services/db'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { formatCurrency, cn } from '@/utils'
import type { OrderItem } from '@/types'

export default function NovoPedido() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preClientId = searchParams.get('cliente') ?? ''

  const [clientId, setClientId] = useState(preClientId)
  const [productSearch, setProductSearch] = useState('')
  const [items, setItems] = useState<OrderItem[]>([])
  const [paymentTerms, setPaymentTerms] = useState('')
  const [notes, setNotes] = useState('')
  const [showProducts, setShowProducts] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const { data: myClients = [], loading: loadingClients } = useClients(user?.id)
  const { data: allProducts = [], loading: loadingProducts } = useProducts()
  const { data: settings } = useCompanySettings()

  const selectedClient = myClients.find(c => c.id === clientId)

  const filteredProducts = useMemo(() =>
    allProducts.filter(p =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(productSearch.toLowerCase())
    ), [productSearch, allProducts])

  const addProduct = (productId: string) => {
    const product = allProducts.find(p => p.id === productId)
    if (!product) return
    setItems(prev => {
      const existing = prev.find(i => i.productId === productId)
      if (existing) {
        return prev.map(i => i.productId === productId
          ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.price * (1 - i.discount / 100) }
          : i)
      }
      return [...prev, { productId: product.id, productName: product.name, quantity: 1, price: product.price, discount: 0, total: product.price }]
    })
    setShowProducts(false)
    setProductSearch('')
  }

  const updateQty = (productId: string, delta: number) => {
    setItems(prev => prev.map(i => {
      if (i.productId !== productId) return i
      const qty = Math.max(1, i.quantity + delta)
      return { ...i, quantity: qty, total: qty * i.price * (1 - i.discount / 100) }
    }))
  }

  const updateDiscount = (productId: string, discount: number) => {
    setItems(prev => prev.map(i => {
      if (i.productId !== productId) return i
      const d = Math.min(100, Math.max(0, discount))
      return { ...i, discount: d, total: i.quantity * i.price * (1 - d / 100) }
    }))
  }

  const removeItem = (productId: string) => setItems(prev => prev.filter(i => i.productId !== productId))

  const subtotal = items.reduce((s, i) => s + i.total, 0)

  const handleSave = async (asDraft = false) => {
    if (!selectedClient || !user) return
    // MELHORIA 5: Validações operacionais
    if (items.length === 0) { setSaveError('Adicione pelo menos um produto ao pedido.'); return }
    if (subtotal <= 0) { setSaveError('O valor total do pedido não pode ser zero.'); return }

    // TAREFA 3+4: Valida estoque se configuração exigir
    if (!asDraft && settings?.allowSalesWithoutStock === false) {
      for (const item of items) {
        const prod = allProducts.find(p => p.id === item.productId)
        if (prod && (prod.stock ?? 0) < item.quantity) {
          setSaveError(`Estoque insuficiente: "${item.productName}" — disponível: ${prod.stock ?? 0}, solicitado: ${item.quantity}`)
          return
        }
      }
    }

    setSaving(true)
    setSaveError('')
    try {
      const now = new Date()
      const number = `PED-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}${String(Math.floor(Math.random() * 9000) + 1000)}`
      const order = await createOrder({
        number, clientId: selectedClient.id, clientName: selectedClient.name,
        clientCity: selectedClient.address.city, repId: user.id, repName: user.name,
        status: 'draft', syncStatus: 'pendente', items, subtotal, discount: 0, total: subtotal,
        paymentTerms: paymentTerms || undefined, notes: notes || undefined,
      })

      if (!order) throw new Error('Erro ao criar pedido')

      // Registra interação
      await createInteraction({
        clientId: selectedClient.id, clientName: selectedClient.name,
        repId: user.id, repName: user.name, type: 'pedido',
        title: 'Pedido criado', description: `Pedido ${number} — ${formatCurrency(subtotal)}`,
        relatedId: order.id, timestamp: now.toISOString(),
      })

      if (!asDraft) {
        await generateOrder(order.id, user.name)
        await createInteraction({
          clientId: selectedClient.id, clientName: selectedClient.name,
          repId: user.id, repName: user.name, type: 'pedido',
          title: 'Pedido gerado', description: `Pedido ${number} finalizado — ${formatCurrency(subtotal)}`,
          relatedId: order.id, timestamp: now.toISOString(),
        })
        await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'generate_order', entity: 'Pedido', entityId: order.id, description: `Pedido ${number} gerado — ${formatCurrency(subtotal)}`, timestamp: now.toISOString() })
      } else {
        await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'create_draft_order', entity: 'Pedido', entityId: order.id, description: `Rascunho ${number} salvo — ${formatCurrency(subtotal)}`, timestamp: now.toISOString() })
      }

      navigate('/rep/pedidos')
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao salvar pedido')
    } finally {
      setSaving(false)
    }
  }

  if (loadingClients || loadingProducts) return <RepLayout title="Novo Pedido"><LoadingSpinner /></RepLayout>

  return (
    <RepLayout title="Novo Pedido">
      <div className="p-4 space-y-4 pb-32">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>

        {/* Client selector */}
        <div className="card p-4">
          <p className="section-title mb-2">Cliente *</p>
          <select
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            className="input"
          >
            <option value="">Selecione o cliente</option>
            {myClients.map(c => (
              <option key={c.id} value={c.id}>{c.name} — {c.address.city}</option>
            ))}
          </select>
          {selectedClient && (
            <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
              📍 {selectedClient.address.city}, {selectedClient.address.state}
            </p>
          )}
        </div>

        {/* Products */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">Produtos</p>
            <button
              onClick={() => setShowProducts(v => !v)}
              className="flex items-center gap-1.5 text-xs text-primary-600 font-semibold border border-primary-200 px-3 py-1.5 rounded-xl bg-primary-50"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar produto
            </button>
          </div>

          {showProducts && (
            <div className="mb-4">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="Buscar produto..."
                  className="input pl-9 text-sm"
                  autoFocus
                />
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto border border-slate-100 rounded-xl">
                {filteredProducts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p.id)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-primary-50 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.category} · {p.unit}</p>
                    </div>
                    <span className="text-sm font-bold text-primary-700">{formatCurrency(p.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-10 h-10 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Nenhum produto adicionado</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map(item => (
                <div key={item.productId} className="border border-slate-100 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{item.productName}</p>
                    <button onClick={() => removeItem(item.productId)}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(item.productId, -1)} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-bold w-8 text-center">{item.quantity}</span>
                      <button onClick={() => updateQty(item.productId, 1)} className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">Desc %</span>
                      <input
                        type="number"
                        value={item.discount}
                        onChange={e => updateDiscount(item.productId, Number(e.target.value))}
                        className="w-14 text-center text-sm border border-slate-200 rounded-lg py-1"
                        min="0" max="100"
                      />
                    </div>
                    <span className="ml-auto text-sm font-bold text-slate-900">{formatCurrency(item.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment + Notes */}
        <div className="card p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Condição de pagamento</label>
            <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} className="input">
              <option value="">Selecione</option>
              <option value="À vista">À vista</option>
              <option value="30 dias">30 dias</option>
              <option value="30/60 dias">30/60 dias</option>
              <option value="30/60/90 dias">30/60/90 dias</option>
              <option value="30/60/90/120 dias">30/60/90/120 dias</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Observações</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input resize-none h-16" placeholder="Alguma observação sobre o pedido..." />
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-20 left-0 right-0 bg-white border-t border-slate-200 p-4 space-y-2">
        {saveError && <p className="text-xs text-red-600 text-center">{saveError}</p>}
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs text-slate-400">Total</p>
            <p className="text-xl font-bold text-primary-700">{formatCurrency(subtotal)}</p>
          </div>
          <button onClick={() => handleSave(true)} disabled={!clientId || items.length === 0 || saving}
            className="flex-1 btn-secondary flex items-center justify-center gap-2 disabled:opacity-40 text-sm py-2.5">
            Salvar Rascunho
          </button>
          <button onClick={() => handleSave(false)} disabled={!clientId || items.length === 0 || saving}
            className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
            <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Finalizar Pedido'}
          </button>
        </div>
      </div>
    </RepLayout>
  )
}
