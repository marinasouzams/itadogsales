import { useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, ShoppingCart, ChevronLeft, Plus, Minus,
  Trash2, Package, User, X, ChevronRight, Save, Send,
  AlertCircle,
} from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useClients, useAllProducts, useCompanySettings, useProductSubcategories } from '@/hooks/useData'
import { createOrder, generateOrder, createInteraction, logAudit } from '@/services/db'
import { formatCurrency, formatDate, cn, daysSince } from '@/utils'
import type { Product } from '@/types'

// ─── tipos internos ──────────────────────────────────────────
interface CartItem {
  product: Product
  qty: number
  discount: number // % por item (futuro)
}

type View = 'catalog' | 'cart'

const PAYMENT_OPTS = ['À vista', '30 dias', '45 dias', '60 dias', '30/60 dias', '30/60/90 dias', 'Outro']

// ─── componente ──────────────────────────────────────────────
export default function NovoPedido() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preClientId = searchParams.get('cliente') ?? ''

  // estado principal
  const [view, setView]           = useState<View>('catalog')
  const [clientId, setClientId]   = useState(preClientId)
  const [showClientPicker, setShowClientPicker] = useState(!preClientId)
  const [clientSearch, setClientSearch]         = useState('')

  // catálogo
  const [search, setSearch]       = useState('')
  const [activeSub, setActiveSub] = useState('todos')

  // carrinho: Map<productId, CartItem>
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map())

  // finalização
  const [globalDiscount, setGlobalDiscount] = useState(0)
  const [payment, setPayment]     = useState('')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showOtherPayment, setShowOtherPayment] = useState(false)
  const [otherPayment, setOtherPayment]         = useState('')

  // dados
  const { data: myClients = [] }    = useClients(user?.id)
  const { data: allProducts = [], loading: loadingProds } = useAllProducts()
  const { data: settings }          = useCompanySettings()
  const { data: subcategories = [] } = useProductSubcategories()

  const searchRef = useRef<HTMLInputElement>(null)

  // ── cliente selecionado ──
  const selectedClient = myClients.find(c => c.id === clientId)
  const filteredClients = useMemo(() =>
    !clientSearch.trim() ? myClients :
    myClients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.address.city.toLowerCase().includes(clientSearch.toLowerCase())),
  [myClients, clientSearch])

  // ── categorias únicas dos produtos ──
  const chips = useMemo(() => {
    const subIds = new Set(allProducts.filter(p => p.active !== false).map(p => p.subcategoryId).filter(Boolean))
    return subcategories.filter(s => subIds.has(s.id))
  }, [allProducts, subcategories])

  // ── lista filtrada ──
  const filteredProducts = useMemo(() => {
    let list = allProducts.filter(p => p.active !== false)
    if (activeSub !== 'todos') list = list.filter(p => p.subcategoryId === activeSub)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
    }
    return list
  }, [allProducts, activeSub, search])

  // ── carrinho ──
  const cartItems   = useMemo(() => Array.from(cart.values()), [cart])
  const cartCount   = useMemo(() => cartItems.reduce((s, i) => s + i.qty, 0), [cartItems])
  const subtotal    = useMemo(() => cartItems.reduce((s, i) => s + i.product.price * i.qty, 0), [cartItems])
  const discountAmt = useMemo(() => subtotal * (globalDiscount / 100), [subtotal, globalDiscount])
  const total       = subtotal - discountAmt

  const setQty = useCallback((product: Product, qty: number) => {
    setCart(prev => {
      const next = new Map(prev)
      if (qty <= 0) { next.delete(product.id); return next }
      next.set(product.id, { product, qty, discount: 0 })
      return next
    })
  }, [])

  const getQty = (productId: string) => cart.get(productId)?.qty ?? 0

  // ── validação e envio ──
  const handleSave = async (finalize = false) => {
    if (!selectedClient || !user) return
    if (cartItems.length === 0) { setSaveError('Adicione pelo menos um produto.'); return }

    if (!finalize && settings?.allowSalesWithoutStock === false) {
      for (const { product, qty } of cartItems) {
        if ((product.stock ?? 0) < qty) {
          setSaveError(`Estoque insuficiente: "${product.name}" — disponível ${product.stock ?? 0}`)
          return
        }
      }
    }

    setSaving(true); setSaveError('')
    try {
      const now    = new Date()
      const number = `PED-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}${String(Math.floor(Math.random() * 9000) + 1000)}`
      const paymentTerms = payment === 'Outro' ? otherPayment : payment

      const items = cartItems.map(({ product, qty }) => ({
        productId: product.id, productName: product.name,
        quantity: qty, price: product.price,
        discount: globalDiscount,
        total: product.price * qty * (1 - globalDiscount / 100),
      }))

      const order = await createOrder({
        number, clientId: selectedClient.id, clientName: selectedClient.name,
        clientCity: selectedClient.address.city, repId: user.id, repName: user.name,
        status: 'draft', syncStatus: 'pendente', items,
        subtotal, discount: discountAmt, total,
        paymentTerms: paymentTerms || undefined,
        notes: notes || undefined,
      })
      if (!order) throw new Error('Erro ao criar pedido')

      await createInteraction({
        clientId: selectedClient.id, clientName: selectedClient.name,
        repId: user.id, repName: user.name, type: 'pedido',
        title: finalize ? 'Pedido gerado' : 'Rascunho salvo',
        description: `${number} — ${formatCurrency(total)}`,
        relatedId: order.id, timestamp: now.toISOString(),
      })

      if (finalize) {
        await generateOrder(order.id, user.name)
        await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'generate_order', entity: 'Pedido', entityId: order.id, description: `Pedido ${number} gerado — ${formatCurrency(total)}`, timestamp: now.toISOString() })
      } else {
        await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'create_draft_order', entity: 'Pedido', entityId: order.id, description: `Rascunho ${number} — ${formatCurrency(total)}`, timestamp: now.toISOString() })
      }

      navigate('/rep/pedidos')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────────
  // RENDER: CLIENT PICKER
  // ─────────────────────────────────────────────────
  if (showClientPicker) {
    return (
      <RepLayout title="Selecionar Cliente" hideNav>
        <div className="flex flex-col h-screen">
          <div className="p-4 space-y-3 flex-1 overflow-hidden flex flex-col">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm w-fit">
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
            <h2 className="text-lg font-bold text-slate-900">Para qual cliente?</h2>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                autoFocus
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                placeholder="Buscar cliente ou cidade..."
                className="input pl-10 text-base"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pb-4">
              {filteredClients.map(c => (
                <button key={c.id} onClick={() => { setClientId(c.id); setShowClientPicker(false) }}
                  className="w-full card p-4 text-left active:scale-[0.98] transition-transform">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 text-sm leading-tight">{c.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{c.address.city} · {c.segment}</p>
                    </div>
                    <div className="text-right">
                      {c.lastOrder && <p className="text-xs text-slate-400">{daysSince(c.lastOrder)}d sem pedido</p>}
                      <ChevronRight className="w-4 h-4 text-slate-300 ml-auto mt-0.5" />
                    </div>
                  </div>
                </button>
              ))}
              {filteredClients.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-12">Nenhum cliente encontrado</p>
              )}
            </div>
          </div>
        </div>
      </RepLayout>
    )
  }

  // ─────────────────────────────────────────────────
  // RENDER: CART VIEW
  // ─────────────────────────────────────────────────
  if (view === 'cart') {
    return (
      <RepLayout title="Pedido" hideNav>
        <div className="flex flex-col h-dvh bg-slate-50">
          {/* Topbar */}
          <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-slate-100 flex-shrink-0">
            <button onClick={() => setView('catalog')} className="flex items-center gap-1 text-slate-500 text-sm">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <p className="font-bold text-slate-900 text-sm">Revisão do Pedido</p>
              <p className="text-xs text-slate-400">{selectedClient?.name}</p>
            </div>
            <span className="text-xs font-bold text-primary-600 bg-primary-50 px-2 py-1 rounded-full">{cartCount} item{cartCount !== 1 ? 's' : ''}</span>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {cartItems.map(({ product, qty }) => (
              <motion.div key={product.id} layout
                className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 leading-tight line-clamp-2">{product.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatCurrency(product.price)} / un</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setQty(product, qty - 1)}
                    className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
                    {qty === 1 ? <Trash2 className="w-3.5 h-3.5 text-red-400" /> : <Minus className="w-3.5 h-3.5 text-slate-600" />}
                  </button>
                  <span className="w-6 text-center font-bold text-slate-900 text-sm">{qty}</span>
                  <button
                    onClick={() => setQty(product, qty + 1)}
                    className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center active:scale-90 transition-transform">
                    <Plus className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
                <p className="text-sm font-bold text-slate-900 w-20 text-right flex-shrink-0">
                  {formatCurrency(product.price * qty)}
                </p>
              </motion.div>
            ))}

            {cartItems.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p className="text-sm">Carrinho vazio</p>
                <button onClick={() => setView('catalog')} className="text-primary-600 text-sm font-semibold mt-2">← Voltar ao catálogo</button>
              </div>
            )}

            {/* Totais */}
            {cartItems.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2 mt-2">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Desconto (%)</span>
                  <div className="flex items-center gap-2">
                    {[0,5,10,15].map(d => (
                      <button key={d} onClick={() => setGlobalDiscount(d)}
                        className={cn('px-3 py-1 rounded-full text-xs font-bold transition-all',
                          globalDiscount === d ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600')}>
                        {d}%
                      </button>
                    ))}
                    <input type="number" min={0} max={100} value={globalDiscount || ''}
                      onChange={e => setGlobalDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                      placeholder="0" className="w-14 input text-center text-sm py-1" />
                  </div>
                </div>
                {discountAmt > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Economia</span><span>− {formatCurrency(discountAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-100">
                  <span>Total</span><span>{formatCurrency(total)}</span>
                </div>
              </div>
            )}

            {/* Condição de pagamento */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <p className="text-sm font-semibold text-slate-700">💳 Condição de pagamento</p>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_OPTS.map(opt => (
                  <button key={opt} onClick={() => { setPayment(opt); if (opt !== 'Outro') setShowOtherPayment(false); else setShowOtherPayment(true) }}
                    className={cn('px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all',
                      payment === opt ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 text-slate-600 bg-white')}>
                    {opt}
                  </button>
                ))}
              </div>
              {showOtherPayment && (
                <input value={otherPayment} onChange={e => setOtherPayment(e.target.value)}
                  placeholder="Ex: 30/60/90/120 dias" className="input text-sm" />
              )}
            </div>

            {/* Observações */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <p className="text-sm font-semibold text-slate-700">📝 Observações</p>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Observações do pedido (opcional)..."
                rows={3} className="input resize-none text-sm w-full" />
            </div>

            {/* Erro */}
            {saveError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 px-4 py-3 rounded-2xl">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600">{saveError}</p>
              </div>
            )}

            <div className="h-28" /> {/* espaço para os botões fixos */}
          </div>

          {/* Botões fixos */}
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-4 pt-3 pb-3 safe-bottom space-y-2 shadow-lg">
            <div className="flex gap-3">
              <button onClick={() => handleSave(false)} disabled={saving || cartItems.length === 0}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-slate-300 text-slate-700 font-semibold text-sm disabled:opacity-40 active:scale-95 transition-transform">
                <Save className="w-4 h-4" />
                {saving ? 'Salvando...' : 'Salvar Rascunho'}
              </button>
              <button onClick={() => handleSave(true)} disabled={saving || cartItems.length === 0}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary-600 text-white font-bold text-sm disabled:opacity-40 active:scale-95 transition-transform shadow-md">
                <Send className="w-4 h-4" />
                {saving ? 'Enviando...' : 'Finalizar Pedido'}
              </button>
            </div>
          </div>
        </div>
      </RepLayout>
    )
  }

  // ─────────────────────────────────────────────────
  // RENDER: CATALOG VIEW (principal)
  // ─────────────────────────────────────────────────
  return (
    <RepLayout title="Novo Pedido" hideNav>
      <div className="flex flex-col bg-slate-50 h-dvh">

        {/* ── CLIENT CARD ── */}
        <div className="bg-white px-4 pt-3 pb-3 flex-shrink-0">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-400 text-sm mb-2">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
          {selectedClient ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-sm leading-tight truncate">{selectedClient.name}</p>
                <p className="text-xs text-slate-400">{selectedClient.address.city} · SC</p>
              </div>
              <button onClick={() => { setShowClientPicker(true); setClientSearch('') }}
                className="text-xs text-primary-600 font-semibold border border-primary-200 px-3 py-1.5 rounded-xl bg-primary-50 flex-shrink-0">
                Trocar
              </button>
            </div>
          ) : (
            <button onClick={() => setShowClientPicker(true)}
              className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 border-dashed border-primary-200 text-primary-600">
              <User className="w-5 h-5" />
              <span className="font-semibold text-sm">Selecionar cliente</span>
            </button>
          )}
        </div>

        {/* ── SEARCH ── */}
        <div className="bg-white px-4 pb-3 flex-shrink-0 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar produto..."
              className="input pl-10 text-base bg-slate-50 border-slate-200"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
          </div>
        </div>

        {/* ── CHIPS DE SUBCATEGORIA ── */}
        <div className="bg-white flex-shrink-0 pb-3 border-b border-slate-100">
          <div className="flex gap-2 overflow-x-auto px-4 scrollbar-none">
            <button
              onClick={() => setActiveSub('todos')}
              className={cn('flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all',
                activeSub === 'todos' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600')}>
              Todos
            </button>
            {chips.map(s => (
              <button key={s.id} onClick={() => setActiveSub(s.id)}
                className={cn('flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap',
                  activeSub === s.id ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600')}>
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── PRODUCT LIST ── */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 pb-24">
          {loadingProds ? (
            <div className="text-center py-16 text-slate-400 text-sm">Carregando produtos...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Package className="w-10 h-10 mx-auto mb-2 text-slate-200" />
              <p className="text-sm">Nenhum produto encontrado</p>
            </div>
          ) : (
            filteredProducts.map(product => {
              const qty = getQty(product.id)
              return (
                <motion.div key={product.id} layout
                  className={cn(
                    'bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm transition-all',
                    qty > 0 && 'ring-2 ring-primary-400 shadow-primary-100 shadow-md'
                  )}>
                  {/* Ícone / imagem */}
                  <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                    qty > 0 ? 'bg-primary-100' : 'bg-slate-100')}>
                    {product.image
                      ? <img src={product.image} alt="" className="w-10 h-10 object-contain rounded-lg" />
                      : <Package className={cn('w-6 h-6', qty > 0 ? 'text-primary-500' : 'text-slate-300')} />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 leading-tight line-clamp-2">{product.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{product.code}</p>
                    <p className="text-sm font-bold text-primary-700 mt-0.5">{formatCurrency(product.price)}</p>
                  </div>

                  {/* Controles de quantidade */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {qty === 0 ? (
                      <button
                        onClick={() => setQty(product, 1)}
                        className="flex items-center gap-1.5 bg-primary-600 text-white px-4 py-2 rounded-xl font-semibold text-sm active:scale-95 transition-transform shadow-sm">
                        <Plus className="w-4 h-4" /> Add
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setQty(product, qty - 1)}
                          className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform flex-shrink-0">
                          {qty === 1 ? <Trash2 className="w-4 h-4 text-red-400" /> : <Minus className="w-4 h-4 text-slate-700" />}
                        </button>
                        <span className="w-7 text-center font-bold text-slate-900 text-base tabular-nums">{qty}</span>
                        <button
                          onClick={() => setQty(product, qty + 1)}
                          className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center active:scale-90 transition-transform flex-shrink-0">
                          <Plus className="w-4 h-4 text-white" />
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )
            })
          )}
          <div className="h-6" />
        </div>

        {/* ── CART BAR FIXO ── */}
        <AnimatePresence>
          {cartCount > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-0 left-0 right-0 px-4 pt-2 pb-4 safe-bottom z-30">
              <button
                onClick={() => { setSaveError(''); setView('cart') }}
                className="w-full bg-primary-600 text-white rounded-2xl px-5 py-4 flex items-center justify-between shadow-xl active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <ShoppingCart className="w-5 h-5" />
                    <span className="absolute -top-2 -right-2 bg-white text-primary-700 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                      {cartCount > 9 ? '9+' : cartCount}
                    </span>
                  </div>
                  <span className="font-semibold text-sm">{cartCount} item{cartCount !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base">{formatCurrency(total)}</span>
                  <ChevronRight className="w-5 h-5 opacity-80" />
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </RepLayout>
  )
}
