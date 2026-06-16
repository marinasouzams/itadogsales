import { useState, useMemo, useRef, useCallback, useEffect, Component, type ErrorInfo, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, ShoppingCart, ChevronLeft, Plus, Minus,
  Trash2, Package, User, X, ChevronRight, Save, Send,
  AlertCircle,
} from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useClients, useAllProducts, useCompanySettings, useProductSubcategories, useProductAttributeAssignments } from '@/hooks/useData'
import { createOrder, generateOrder, createInteraction, logAudit, getOrderById, updateOrderRep } from '@/services/db'
import { formatCurrency, formatDate, cn, daysSince } from '@/utils'
import type { Product, Order, OrderItemAttribute, OrderItemVariant, ProductAttributeAssignment } from '@/types'

// ─── Error Boundary — evita tela branca em erros de render ──
class OrderErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; errorMsg: string }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, errorMsg: '' }
  }
  static getDerivedStateFromError(error: Error): { hasError: boolean; errorMsg: string } {
    return { hasError: true, errorMsg: error?.message ?? 'Erro desconhecido' }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[OrderErrorBoundary]', error.message, info.componentStack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-white">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <p className="font-bold text-slate-900 mb-2">Não foi possível carregar este pedido</p>
          <p className="text-sm text-slate-500 mb-6">Um erro inesperado ocorreu. Seus itens não foram perdidos.</p>
          <button
            onClick={() => this.setState({ hasError: false, errorMsg: '' })}
            className="btn-primary">
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── tipos internos ──────────────────────────────────────────
interface CartItem {
  product: Product
  qty: number                    // total (soma de todas as variantes)
  discount: number
  variants?: OrderItemVariant[]  // multi-variante (Rosa:2, Azul:1…)
  attribute?: OrderItemAttribute // compatibilidade retroativa
}

/** Chave única no carrinho: sempre productId (um slot por produto) */
function cartKey(productId: string) {
  return productId
}

type View = 'catalog' | 'cart'

const PAYMENT_OPTS = ['À vista', '7 dias', '14 dias', '21 dias', '28 dias', '30 dias', '30/45', '30/60', '30/45/60', '30/60/90', 'Outro']
const PAYMENT_METHODS = ['PIX', 'Boleto', 'Dinheiro', 'Cartão', 'Transferência', 'Pago Parcial'] as const

// ─── componente ──────────────────────────────────────────────
export default function NovoPedido() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preClientId  = searchParams.get('cliente') ?? ''
  const editOrderId  = searchParams.get('editar') ?? ''

  // estado principal
  const [view, setView]           = useState<View>('catalog')
  const [clientId, setClientId]   = useState(preClientId)
  const [showClientPicker, setShowClientPicker] = useState(!preClientId && !editOrderId)
  const [clientSearch, setClientSearch]         = useState('')
  const [editOrder, setEditOrder] = useState<Order | null>(null)
  const [loadingEdit, setLoadingEdit] = useState(!!editOrderId)

  // catálogo
  const [search, setSearch]       = useState('')
  const [activeSub, setActiveSub] = useState('todos')

  // modal de variantes (multi-cor / multi-atributo)
  const [attrProduct, setAttrProduct]           = useState<Product | null>(null)
  const [attrAssignments, setAttrAssignments]   = useState<ProductAttributeAssignment[]>([])
  // variantQtys: valueId → qty  (controla as quantidades por variação)
  const [variantQtys, setVariantQtys]           = useState<Record<string, number>>({})
  const [showAttrPicker, setShowAttrPicker]     = useState(false)

  // carrinho: Map<cartKey, CartItem>
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map())

  // finalização
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')
  const [globalDiscount, setGlobalDiscount] = useState(0)
  const [payment, setPayment]     = useState('')
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showOtherPayment, setShowOtherPayment] = useState(false)
  const [otherPayment, setOtherPayment]         = useState('')

  // forma de pagamento + parcial
  const [paymentMethod, setPaymentMethod]               = useState('')
  const [partialPaymentAmount, setPartialPaymentAmount] = useState('')
  const [partialPaymentDate, setPartialPaymentDate]     = useState('')
  const [partialPaymentNotes, setPartialPaymentNotes]   = useState('')

  // dados
  const { data: myClients = [] }    = useClients(user?.id)
  const { data: allProducts = [], loading: loadingProds } = useAllProducts()
  const { data: settings }          = useCompanySettings()
  const { data: subcategories = [] } = useProductSubcategories()

  const searchRef = useRef<HTMLInputElement>(null)

  // ── carrega pedido existente para edição ──
  useEffect(() => {
    if (!editOrderId || allProducts.length === 0) return
    setLoadingEdit(true)
    getOrderById(editOrderId).then(ord => {
      if (!ord) { setLoadingEdit(false); return }
      setEditOrder(ord)
      setClientId(ord.clientId)
      setPayment(ord.paymentTerms ?? '')
      setNotes(ord.notes ?? '')
      setPaymentMethod(ord.paymentMethod ?? '')
      setPartialPaymentAmount(ord.partialPaymentAmount ? String(ord.partialPaymentAmount) : '')
      setPartialPaymentDate(ord.partialPaymentDate ?? '')
      setPartialPaymentNotes(ord.partialPaymentNotes ?? '')
      if (ord.paymentTerms && !['À vista', '7 dias', '14 dias', '21 dias', '28 dias', '30 dias', '30/45', '30/60', '30/45/60', '30/60/90'].includes(ord.paymentTerms)) {
        setShowOtherPayment(true)
        setOtherPayment(ord.paymentTerms)
        setPayment('Outro')
      }
      // reconstrói o carrinho a partir dos itens salvos
      const newCart = new Map<string, CartItem>()
      for (const item of ord.items) {
        const prod = allProducts.find(p => p.id === item.productId)
        if (!prod) continue
        const key = cartKey(prod.id)
        // Para kits: qty no carrinho = nº de kits (kitCount), não unidades entregues
        const cartQty = item.kitCount ?? item.quantity
        newCart.set(key, {
          product: prod,
          qty: cartQty,
          discount: item.discount ?? 0,
          variants: item.variants,
          attribute: item.attribute,  // restaura variante única (retrocompat)
        })
      }
      setCart(newCart)
      // Recuperar tipo e valor do desconto salvo
      const savedType = ord.discountType ?? 'percent'
      const savedValue = ord.discountValue ?? (
        savedType === 'percent' && ord.subtotal > 0
          ? Math.round((ord.discount / ord.subtotal) * 100)
          : ord.discount
      )
      setDiscountType(savedType)
      setGlobalDiscount(savedValue)
      setView('cart')
      setLoadingEdit(false)
    }).catch(() => setLoadingEdit(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOrderId, allProducts])

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
  const cartCount   = useMemo(() => cartItems.reduce((s, i) => s + (i?.qty ?? 0), 0), [cartItems])
  const subtotal    = useMemo(() =>
    // Kit items: cobrado por billedQty (kits × kitPaidQty), não por qty de kits
    cartItems.reduce((s, i) => {
      const billed = i.product?.productType === 'kit_promocional'
        ? (i.qty || 0) * (i.product.kitPaidQty ?? 1)
        : (i?.qty || 0)
      return s + (Number(i?.product?.price) || 0) * billed
    }, 0),
  [cartItems])
  /** Para kit: billedQty = kits × kitPaidQty; senão = qty */
  const getBilledQty = (item: CartItem) => {
    const p = item.product
    if (p.productType === 'kit_promocional') return item.qty * (p.kitPaidQty ?? 1)
    return item.qty
  }
  /** Para kit: deliveredQty = kits × kitDeliveredQty; senão = qty */
  const getDeliveredQty = (item: CartItem) => {
    const p = item.product
    if (p.productType === 'kit_promocional') return item.qty * (p.kitDeliveredQty ?? item.qty)
    return item.qty
  }

  const discountAmt = useMemo(() => {
    if (discountType === 'fixed') return Math.min(Math.max(0, globalDiscount), subtotal)
    return subtotal * (globalDiscount / 100)
  }, [subtotal, globalDiscount, discountType])
  const total       = subtotal - discountAmt

  /** Adiciona/atualiza produto sem variantes */
  const setQty = useCallback((product: Product, qty: number) => {
    if (!product?.id) return
    const key = cartKey(product.id)
    setCart(prev => {
      const next = new Map(prev)
      if (qty <= 0) { next.delete(key); return next }
      next.set(key, { product, qty, discount: 0 })
      return next
    })
  }, [])

  /** Quantidade total do produto no carrinho */
  const getQty = (productId: string) => cart.get(cartKey(productId))?.qty ?? 0

  /** Inicia o fluxo de adição — abre modal de variantes ou incrementa diretamente */
  const handleAddProduct = useCallback(async (product: Product) => {
    try {
      const { getProductAttributeAssignments } = await import('@/services/db')
      const assignments = await getProductAttributeAssignments(product.id)
      const validAssignments = (assignments ?? []).filter(a => a && (a.values ?? []).length > 0)
      if (validAssignments.length === 0) {
        // Produto sem variantes → incremento direto
        setQty(product, (getQty(product.id) || 0) + 1)
      } else {
        // Produto com variantes → abre modal multi-variante
        // Pré-preenche com quantidades já no carrinho (se existir)
        const existing = cart.get(cartKey(product.id))
        const initialQtys: Record<string, number> = {}
        if (existing?.variants) {
          existing.variants.forEach(v => { initialQtys[v.valueId] = v.qty })
        }
        setAttrProduct(product)
        setAttrAssignments(validAssignments)
        setVariantQtys(initialQtys)
        setShowAttrPicker(true)
      }
    } catch {
      setQty(product, (getQty(product.id) || 0) + 1)
    }
  }, [cart]) // eslint-disable-line

  /** Confirma seleção de variantes e atualiza carrinho */
  const handleConfirmVariants = () => {
    if (!attrProduct) return
    const key = cartKey(attrProduct.id)

    // Monta array de variantes com qty > 0
    const variants: OrderItemVariant[] = []
    for (const a of attrAssignments) {
      for (const v of a.values.filter(v => v.active !== false)) {
        const qty = variantQtys[v.id] ?? 0
        if (qty > 0) {
          variants.push({
            attributeId: a.attributeId,
            attributeName: a.attributeName,
            valueId: v.id,
            valueName: v.name,
            qty,
          })
        }
      }
    }

    const totalQty = variants.reduce((s, v) => s + v.qty, 0)

    setCart(prev => {
      const next = new Map(prev)
      if (totalQty === 0) {
        next.delete(key)
      } else {
        next.set(key, { product: attrProduct, qty: totalQty, discount: 0, variants })
      }
      return next
    })
    setShowAttrPicker(false)
  }

  // ── validação e envio ──
  const handleSave = async (finalize = false) => {
    if (!user) { setSaveError('Sessão expirada. Recarregue a página e faça login novamente.'); return }
    if (!selectedClient) { setSaveError('Cliente não encontrado. Volte e selecione o cliente novamente.'); return }
    if (cartItems.length === 0) { setSaveError('Adicione pelo menos um produto.'); return }

    if (!finalize && settings?.allowSalesWithoutStock === false) {
      for (const { product, qty } of cartItems) {
        if ((product.stock ?? 0) < qty) {
          setSaveError(`Estoque insuficiente: "${product.name}" — disponível ${product.stock ?? 0}`)
          return
        }
      }
    }

    // Condição de pagamento obrigatória ao finalizar
    const paymentTermsValue = payment === 'Outro' ? otherPayment.trim() : payment
    if (finalize && !paymentTermsValue) {
      setSaveError('Selecione a condição de pagamento antes de finalizar o pedido.')
      return
    }

    // Validar desconto
    if (discountAmt > subtotal) {
      setSaveError('Desconto não pode ser maior que o valor do pedido.')
      return
    }
    if (total < 0) {
      setSaveError('O total não pode ser negativo.')
      return
    }

    setSaving(true); setSaveError('')
    try {
      const now = new Date()
      const paymentTerms = payment === 'Outro' ? otherPayment : payment

      // Per-item discount: só em modo % (em R$ fixo o desconto é no pedido todo)
      const itemDiscountPct = discountType === 'percent' ? globalDiscount : 0
      const items = cartItems.map((ci) => {
        const { product, qty, variants, attribute } = ci
        const isKit = product.productType === 'kit_promocional'
        const billedQty   = getBilledQty(ci)
        const deliveredQty = getDeliveredQty(ci)
        const discount = isKit ? 0 : itemDiscountPct
        return {
          productId: product.id, productName: product.name,
          quantity: deliveredQty,           // quantidade para SEPARAÇÃO
          billedQuantity: isKit ? billedQty : undefined,
          kitCount:        isKit ? qty : undefined,
          kitPaidQty:      isKit ? product.kitPaidQty : undefined,
          kitDeliveredQty: isKit ? product.kitDeliveredQty : undefined,
          price: Number(product.price) || 0,
          discount,
          total: (Number(product.price) || 0) * billedQty * (1 - discount / 100),
          ...(variants && variants.length > 0 ? { variants } : {}),
          ...(attribute ? { attribute } : {}),
        }
      })

      if (editOrder) {
        // ── MODO EDIÇÃO ──
        // Só muda o status se o pedido ainda está em rascunho E o rep clicou em Finalizar
        const shouldFinalize = finalize && editOrder.status === 'draft'

        const partialAmt = parseFloat(partialPaymentAmount) || 0
        await updateOrderRep(editOrder.id, {
          items,
          subtotal, discount: discountAmt,
          discountType, discountValue: globalDiscount,
          total,
          paymentTerms: paymentTerms || undefined,
          paymentMethod: paymentMethod || undefined,
          partialPaymentAmount: partialAmt > 0 ? partialAmt : undefined,
          partialPaymentDate: partialPaymentDate || undefined,
          partialPaymentNotes: partialPaymentNotes || undefined,
          notes: notes || undefined,
        })
        if (shouldFinalize) {
          // Só chama generateOrder se era rascunho — evita resetar generated_at de pedidos já gerados
          await generateOrder(editOrder.id, user.name)
          await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'generate_order', entity: 'Pedido', entityId: editOrder.id, description: `Pedido ${editOrder.number} editado e gerado — ${formatCurrency(total)}`, timestamp: now.toISOString() })
        } else {
          await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_order', entity: 'Pedido', entityId: editOrder.id, description: `Pedido ${editOrder.number} (${editOrder.status}) atualizado pelo rep — ${formatCurrency(total)}`, timestamp: now.toISOString() })
        }
        navigate(`/rep/pedidos/${editOrder.id}`, { replace: true })
      } else {
        // ── MODO CRIAÇÃO ──
        const number = `PED-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}${String(Math.floor(Math.random() * 9000) + 1000)}`

        const partialAmt = parseFloat(partialPaymentAmount) || 0
        const order = await createOrder({
          number, clientId: selectedClient.id, clientName: selectedClient.name,
          clientCity: selectedClient.address.city, repId: user.id, repName: user.name,
          status: 'draft', syncStatus: 'pendente', items,
          subtotal, discount: discountAmt,
          discountType, discountValue: globalDiscount,
          total,
          paymentTerms: paymentTerms || undefined,
          paymentMethod: paymentMethod || undefined,
          partialPaymentAmount: partialAmt > 0 ? partialAmt : undefined,
          partialPaymentDate: partialPaymentDate || undefined,
          partialPaymentNotes: partialPaymentNotes || undefined,
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
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────────
  // RENDER ÚNICO — um único RepLayout para todas as views
  // Isso evita que o AnimatePresence do RepLayout (key={title}) dispare
  // uma transição exit+enter de 0.4s que deixava a tela em branco.
  // ─────────────────────────────────────────────────
  if (loadingEdit) {
    return (
      <RepLayout title="Editar Pedido" hideNav>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      </RepLayout>
    )
  }

  return (
    <OrderErrorBoundary>
      <RepLayout title={editOrder ? 'Editar Pedido' : 'Novo Pedido'} hideNav>
        <AnimatePresence mode="popLayout" initial={false}>

          {/* ── VIEW: CLIENT PICKER ── */}
          {showClientPicker && (
            <motion.div key="client-picker"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col h-screen">
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
            </motion.div>
          )}

          {/* ── VIEW: CARRINHO ── */}
          {!showClientPicker && view === 'cart' && (
            <motion.div key="cart"
              initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="flex flex-col bg-slate-50" style={{ minHeight: '100dvh' }}>

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
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 pb-32">
                {/* Aviso: editando pedido aguardando separação */}
                {editOrder && editOrder.status === 'pending_separation' && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 px-3 py-2.5 rounded-2xl">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 font-medium">Este pedido está aguardando separação. Suas alterações serão salvas.</p>
                  </div>
                )}
                {cartItems.filter(i => i?.product).map((ci) => {
                  const { product, qty, variants } = ci
                  const key = cartKey(product?.id ?? '')
                  const hasVariants = variants && variants.length > 0
                  const isKit = product?.productType === 'kit_promocional'
                  const billedQty    = getBilledQty(ci)
                  const deliveredQty = getDeliveredQty(ci)
                  const lineTotal = (Number(product?.price) || 0) * billedQty
                  return (
                    <motion.div key={key} layout
                      className="bg-white rounded-2xl px-4 py-3 shadow-sm">
                      {/* Linha do produto */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 leading-tight line-clamp-2">{product?.name ?? '—'}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{formatCurrency(Number(product?.price) || 0)} / un</p>
                        </div>
                        {hasVariants ? (
                          <button
                            onClick={() => product && handleAddProduct(product)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-50 text-primary-700 text-xs font-semibold border border-primary-200 active:scale-95 transition-transform">
                            <Plus className="w-3.5 h-3.5" /> Editar cores
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => product && setQty(product, (qty ?? 1) - 1)}
                              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
                              {(qty ?? 1) === 1 ? <Trash2 className="w-3.5 h-3.5 text-red-400" /> : <Minus className="w-3.5 h-3.5 text-slate-600" />}
                            </button>
                            <div className="text-center">
                              <span className="block w-8 font-bold text-slate-900 text-sm text-center">{qty ?? 0}</span>
                              {isKit && <span className="text-[9px] text-orange-600 font-semibold -mt-0.5 block">kit{(qty ?? 0) !== 1 ? 's' : ''}</span>}
                            </div>
                            <button
                              onClick={() => product && setQty(product, (qty ?? 0) + 1)}
                              className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center active:scale-90 transition-transform">
                              <Plus className="w-3.5 h-3.5 text-white" />
                            </button>
                          </div>
                        )}
                        <p className="text-sm font-bold text-slate-900 w-20 text-right flex-shrink-0">
                          {formatCurrency(lineTotal)}
                        </p>
                      </div>

                      {/* Detalhe kit promocional */}
                      {isKit && (
                        <div className="mt-2 pt-2 border-t border-orange-100 space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                              🎁 Kit Promocional · Pague {product.kitPaidQty} Leve {product.kitDeliveredQty}
                            </span>
                          </div>
                          <div className="flex gap-4 text-xs">
                            <span className="text-slate-500">Faturado: <strong className="text-slate-800">{billedQty} un</strong></span>
                            <span className="text-slate-500">Separar: <strong className="text-green-700">{deliveredQty} un</strong></span>
                          </div>
                        </div>
                      )}

                      {/* Detalhe de variantes */}
                      {hasVariants && (
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                          {variants!.map(v => (
                            <div key={v.valueId} className="flex items-center justify-between text-xs">
                              <span className="text-slate-500">{v.attributeName}: <span className="font-semibold text-slate-700">{v.valueName}</span></span>
                              <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-full">{v.qty} un</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-xs font-bold text-primary-700 pt-1 border-t border-slate-100">
                            <span>Total</span>
                            <span>{qty} un</span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )
                })}

                {cartItems.length === 0 && (
                  <div className="text-center py-16 text-slate-400">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                    <p className="text-sm">Carrinho vazio</p>
                    <button onClick={() => setView('catalog')} className="text-primary-600 text-sm font-semibold mt-2">← Voltar ao catálogo</button>
                  </div>
                )}

                {/* Totais */}
                {cartItems.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3 mt-2">
                    {/* Subtotal */}
                    <div className="flex justify-between text-sm text-slate-500">
                      <span>Subtotal</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>

                    {/* Desconto */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">Desconto</span>
                        {/* Toggle % / R$ */}
                        <div className="flex rounded-xl overflow-hidden border border-slate-200">
                          <button
                            onClick={() => { setDiscountType('percent'); setGlobalDiscount(0) }}
                            className={cn(
                              'px-3 py-1.5 text-xs font-bold transition-colors',
                              discountType === 'percent'
                                ? 'bg-primary-600 text-white'
                                : 'bg-white text-slate-500 hover:bg-slate-50'
                            )}>
                            %
                          </button>
                          <button
                            onClick={() => { setDiscountType('fixed'); setGlobalDiscount(0) }}
                            className={cn(
                              'px-3 py-1.5 text-xs font-bold transition-colors border-l border-slate-200',
                              discountType === 'fixed'
                                ? 'bg-primary-600 text-white'
                                : 'bg-white text-slate-500 hover:bg-slate-50'
                            )}>
                            R$
                          </button>
                        </div>
                      </div>

                      {/* Atalhos + Input */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {discountType === 'percent' ? (
                          <>
                            {[0, 5, 10, 15].map(d => (
                              <button key={d} onClick={() => setGlobalDiscount(d)}
                                className={cn(
                                  'px-3 py-1 rounded-full text-xs font-bold transition-all',
                                  globalDiscount === d
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-slate-100 text-slate-600'
                                )}>
                                {d}%
                              </button>
                            ))}
                            <input
                              type="number" min={0} max={100}
                              value={globalDiscount || ''}
                              onChange={e => setGlobalDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                              placeholder="0"
                              className="w-16 input text-center text-sm py-1" />
                            <span className="text-xs text-slate-400">%</span>
                          </>
                        ) : (
                          <>
                            {[0, 50, 100, 200].filter(d => d <= subtotal).map(d => (
                              <button key={d} onClick={() => setGlobalDiscount(d)}
                                className={cn(
                                  'px-3 py-1 rounded-full text-xs font-bold transition-all',
                                  globalDiscount === d
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-slate-100 text-slate-600'
                                )}>
                                {d === 0 ? 'Sem desc.' : formatCurrency(d)}
                              </button>
                            ))}
                            <input
                              type="number" min={0} max={subtotal}
                              value={globalDiscount || ''}
                              onChange={e => {
                                const v = Math.max(0, Number(e.target.value))
                                setGlobalDiscount(Math.min(subtotal, v))
                              }}
                              placeholder="0,00"
                              className="w-24 input text-center text-sm py-1" />
                            <span className="text-xs text-slate-400">R$</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Linha desconto calculado */}
                    {discountAmt > 0 && (
                      <div className="flex justify-between text-sm text-green-600 font-medium">
                        <span>
                          Desconto
                          {discountType === 'percent'
                            ? ` (${globalDiscount}%)`
                            : ' (valor fixo)'}
                        </span>
                        <span>− {formatCurrency(discountAmt)}</span>
                      </div>
                    )}

                    {/* Total */}
                    <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-100">
                      <span>Total</span>
                      <span>{formatCurrency(total)}</span>
                    </div>
                  </div>
                )}

                {/* Bloco PAGAMENTO */}
                <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
                  <p className="text-sm font-bold text-slate-800">💳 Pagamento</p>

                  {/* Forma de pagamento */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Forma de Pagamento <span className="text-red-500">*</span></p>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_METHODS.map(m => (
                        <button key={m} onClick={() => setPaymentMethod(m)}
                          className={cn('px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all',
                            paymentMethod === m ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 text-slate-600 bg-white')}>
                          {m}
                        </button>
                      ))}
                    </div>

                    {/* Campos extras — Pago Parcial */}
                    {paymentMethod === 'Pago Parcial' && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3 mt-2">
                        <p className="text-xs font-semibold text-amber-800">Registrar pagamento parcial</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Valor pago (R$)</label>
                            <input type="number" min="0" step="0.01"
                              value={partialPaymentAmount}
                              onChange={e => setPartialPaymentAmount(e.target.value)}
                              placeholder="0,00" className="input text-sm w-full" />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Valor restante</label>
                            <div className="input text-sm bg-slate-100 text-slate-500 flex items-center">
                              {total - (parseFloat(partialPaymentAmount) || 0) < 0
                                ? 'Inválido'
                                : `R$ ${(total - (parseFloat(partialPaymentAmount) || 0)).toFixed(2).replace('.', ',')}`
                              }
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Data do pagamento</label>
                          <input type="date" value={partialPaymentDate} onChange={e => setPartialPaymentDate(e.target.value)} className="input text-sm w-full" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Observação</label>
                          <input type="text" value={partialPaymentNotes} onChange={e => setPartialPaymentNotes(e.target.value)}
                            placeholder="Ex: Entrada realizada via PIX" className="input text-sm w-full" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Condição de pagamento */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Condição de Pagamento</p>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_OPTS.map(opt => (
                        <button key={opt} onClick={() => { setPayment(opt); if (opt !== 'Outro') setShowOtherPayment(false); else setShowOtherPayment(true) }}
                          className={cn('px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all',
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
              </div>

              {/* Botões fixos */}
              <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-4 pt-3 pb-3 safe-bottom space-y-2 shadow-lg">
                {/* Pedido já gerado/em separação: só "Salvar Alterações" */}
                {editOrder && editOrder.status !== 'draft' ? (
                  <button onClick={() => handleSave(false)} disabled={saving || cartItems.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary-600 text-white font-bold text-sm disabled:opacity-40 active:scale-95 transition-transform shadow-md">
                    <Save className="w-4 h-4" />
                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => handleSave(false)} disabled={saving || cartItems.length === 0}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-slate-300 text-slate-700 font-semibold text-sm disabled:opacity-40 active:scale-95 transition-transform">
                      <Save className="w-4 h-4" />
                      {saving ? 'Salvando...' : editOrder ? 'Salvar Rascunho' : 'Salvar Rascunho'}
                    </button>
                    <button onClick={() => handleSave(true)} disabled={saving || cartItems.length === 0}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary-600 text-white font-bold text-sm disabled:opacity-40 active:scale-95 transition-transform shadow-md">
                      <Send className="w-4 h-4" />
                      {saving ? 'Enviando...' : 'Finalizar Pedido'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── VIEW: CATÁLOGO ── */}
          {!showClientPicker && view === 'catalog' && (
            <motion.div key="catalog"
              initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="flex flex-col bg-slate-50" style={{ minHeight: '100dvh' }}>

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
                        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                          qty > 0 ? 'bg-primary-100' : 'bg-slate-100')}>
                          {product.image
                            ? <img src={product.image} alt="" className="w-10 h-10 object-contain rounded-lg" />
                            : <Package className={cn('w-6 h-6', qty > 0 ? 'text-primary-500' : 'text-slate-300')} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 leading-tight line-clamp-2">{product.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{product.code}</p>
                          <p className="text-sm font-bold text-primary-700 mt-0.5">{formatCurrency(Number(product.price) || 0)}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {qty === 0 ? (
                            <button
                              onClick={() => handleAddProduct(product)}
                              className="flex items-center gap-1.5 bg-primary-600 text-white px-4 py-2 rounded-xl font-semibold text-sm active:scale-95 transition-transform shadow-sm">
                              <Plus className="w-4 h-4" /> Add
                            </button>
                          ) : cart.get(cartKey(product.id))?.variants?.length ? (
                            /* Produto com variantes (cores) já no carrinho → abre picker de edição */
                            <button
                              onClick={() => handleAddProduct(product)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-50 text-primary-700 text-xs font-semibold border border-primary-200 active:scale-95 transition-transform">
                              <Plus className="w-3.5 h-3.5" /> Editar cores
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
            </motion.div>
          )}

        </AnimatePresence>

        {/* ── MODAL MULTI-VARIANTE ──────────────────────────────────────────
            FORA do AnimatePresence das views para funcionar tanto no catálogo
            quanto no carrinho. Posição fixed não depende do pai no DOM.
        ────────────────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showAttrPicker && attrProduct && (
            <>
              <motion.div className="fixed inset-0 bg-black/50 z-40"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowAttrPicker(false)} />
              <motion.div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 safe-bottom flex flex-col max-h-[85vh]"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}>

                {/* Header */}
                <div className="px-5 pt-3 pb-3 border-b border-slate-100 flex-shrink-0">
                  <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900 text-sm leading-tight">{attrProduct.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{formatCurrency(Number(attrProduct.price) || 0)} / un</p>
                    </div>
                    <button onClick={() => setShowAttrPicker(false)}>
                      <X className="w-5 h-5 text-slate-400" />
                    </button>
                  </div>
                </div>

                {/* Lista de variantes com controles de quantidade */}
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-5">
                  {attrAssignments.map(a => (
                    <div key={a.attributeId}>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">{a.attributeName}</p>
                      <div className="space-y-2">
                        {a.values.filter(v => v.active !== false).map(v => {
                          const qty = variantQtys[v.id] ?? 0
                          return (
                            <div key={v.id}
                              className={cn(
                                'flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all',
                                qty > 0 ? 'border-primary-400 bg-primary-50' : 'border-slate-100 bg-white'
                              )}>
                              <span className={cn('font-semibold text-sm flex-1', qty > 0 ? 'text-primary-800' : 'text-slate-700')}>
                                {v.name}
                              </span>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <button
                                  onClick={() => setVariantQtys(prev => ({ ...prev, [v.id]: Math.max(0, (prev[v.id] ?? 0) - 1) }))}
                                  className={cn(
                                    'w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90',
                                    qty > 0 ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-300'
                                  )}>
                                  {qty === 1 ? <Trash2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                                </button>
                                <span className={cn('w-8 text-center font-bold text-lg tabular-nums', qty > 0 ? 'text-primary-700' : 'text-slate-300')}>
                                  {qty}
                                </span>
                                <button
                                  onClick={() => setVariantQtys(prev => ({ ...prev, [v.id]: (prev[v.id] ?? 0) + 1 }))}
                                  className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center active:scale-90 transition-all">
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Resumo + botões */}
                <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex-shrink-0 space-y-2">
                  {(() => {
                    const totalUnits = Object.values(variantQtys).reduce((s, q) => s + q, 0)
                    const totalValue = totalUnits * (Number(attrProduct.price) || 0)
                    const isEditing  = !!cart.get(cartKey(attrProduct.id))
                    return (
                      <>
                        {totalUnits > 0 && (
                          <div className="flex justify-between text-sm mb-1 bg-slate-50 rounded-xl px-4 py-2.5">
                            <span className="text-slate-500 font-medium">Total:</span>
                            <span>
                              <span className="font-bold text-slate-900">{totalUnits} un</span>
                              <span className="text-slate-400 mx-1.5">·</span>
                              <span className="font-bold text-primary-700">{formatCurrency(totalValue)}</span>
                            </span>
                          </div>
                        )}
                        <button
                          onClick={handleConfirmVariants}
                          disabled={totalUnits === 0}
                          className="w-full btn-primary py-4 text-base disabled:opacity-40">
                          {totalUnits === 0
                            ? 'Informe a quantidade de cada cor'
                            : isEditing
                              ? `Salvar alterações — ${totalUnits} un`
                              : `Adicionar ${totalUnits} un ao Pedido`}
                        </button>
                        {/* Remover item inteiro (só quando está editando) */}
                        {isEditing && (
                          <button
                            onClick={() => {
                              const key = cartKey(attrProduct.id)
                              setCart(prev => { const n = new Map(prev); n.delete(key); return n })
                              setShowAttrPicker(false)
                            }}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-red-200 text-red-500 text-sm font-semibold active:scale-95 transition-transform">
                            <Trash2 className="w-4 h-4" /> Remover do pedido
                          </button>
                        )}
                      </>
                    )
                  })()}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

      </RepLayout>
    </OrderErrorBoundary>
  )
}
