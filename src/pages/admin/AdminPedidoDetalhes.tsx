import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, Package, FileText, Printer, CheckCircle,
  Plus, Minus, Trash2, Edit3, X, Save, FileSpreadsheet, MessageCircle,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useOrder, useCompanySettings, useClient, useAllProducts } from '@/hooks/useData'
import {
  sendToSeparation, markAsSeparation, invoiceOrder,
  updateOrderAdmin, createInteraction, logAudit, softDeleteOrder,
  getOrderReceivables, deleteOrderReceivables, addNoteToOrderReceivables,
  registerPartialDelivery, ensureOrderReceivables, generateOrderCommission,
  reprocessOrderFinancial,
} from '@/services/db'
import { printComercialPdf } from '@/services/comercialPdf'
import { saleDateOf } from '@/types'
import { LoadingSpinner, ErrorState } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate, cn } from '@/utils'
import { OrderStatusBadge } from '@/components/shared/StatusBadge'
import type { OrderItem, OrderItemAdjustment, Product, FinancialReceivable } from '@/types'
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'

export default function AdminPedidoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: order, loading, error, refetch } = useOrder(id)
  const { data: settings } = useCompanySettings()
  const { data: client } = useClient(order?.clientId)
  const { data: allProducts = [] } = useAllProducts()

  const [acting, setActing] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editItems, setEditItems] = useState<OrderItem[]>([])
  const [editNotes, setEditNotes] = useState('')
  const [editPayment, setEditPayment] = useState('')
  const [showConfirm, setShowConfirm] = useState<'separation' | 'invoice' | null>(null)
  const [confirmNote, setConfirmNote] = useState('')
  // Data da Venda (pedidos retroativos) + reprocessamento financeiro
  const [editingSaleDate, setEditingSaleDate] = useState(false)
  const [saleDateInput, setSaleDateInput] = useState('')
  const [savingSaleDate, setSavingSaleDate] = useState(false)
  const [reprocessDate, setReprocessDate] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteOther, setDeleteOther] = useState('')
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [addProductSearch, setAddProductSearch] = useState('')
  const [deleteStep, setDeleteStep] = useState<'reason' | 'financial'>('reason')
  const [orderReceivables, setOrderReceivables] = useState<FinancialReceivable[]>([])
  const [financialAction, setFinancialAction] = useState<'both' | 'keep' | null>(null)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [deliveryQtys, setDeliveryQtys] = useState<Record<string, number>>({})

  // Ajustes administrativos
  const [showAdjustPanel, setShowAdjustPanel] = useState(false)
  const [adjEntries, setAdjEntries] = useState<Record<string, { qty: number; reason: string; notes: string }>>({})
  const [recalcFinancial, setRecalcFinancial] = useState(false)
  const [savingAdj, setSavingAdj] = useState(false)

  const DELETE_REASONS = [
    'Pedido duplicado',
    'Pedido cancelado pelo cliente',
    'Erro operacional',
    'Teste',
    'Outro',
  ]

  const ADJUSTMENT_REASONS = [
    'Pronta Entrega',
    'Produto Já Retirado',
    'Produto Já Entregue',
    'Cortesia',
    'Ajuste Comercial',
    'Falta de Produção',
    'Cancelado pelo Cliente',
    'Outros',
  ] as const

  if (loading) return <AdminLayout title="Pedido"><div className="p-6"><LoadingSpinner /></div></AdminLayout>
  if (error || !order) return (
    <AdminLayout title="Pedido">
      <div className="p-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm mb-4">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <ErrorState message="Pedido não encontrado" />
      </div>
    </AdminLayout>
  )

  function makeOrderWhatsapp(o: { clientName: string; number: string; status: string; total: number }, clientPhone?: string): string {
    const statusLabels: Record<string, string> = {
      draft: 'em rascunho',
      generated: 'gerado',
      pending_separation: 'aguardando separação',
      separation: 'em separação',
      invoiced_ready_to_ship: 'faturado e pronto para envio',
      delivered: 'entregue',
    }
    const statusText = statusLabels[o.status] || o.status
    const text = encodeURIComponent(
      `Olá ${o.clientName}! Seu pedido ${o.number} está atualmente: *${statusText}*.\n\nQualquer dúvida estamos à disposição.\n\n_Equipe ITADOG SALES_ 🐾`
    )
    const phone = (clientPhone || '').replace(/\D/g, '')
    return `https://wa.me/55${phone}?text=${text}`
  }

  const getPastAdjustedQty = (item: OrderItem) =>
    (item.adminAdjustments ?? []).reduce((s, a) => s + a.qty, 0)

  const getSeparationQty = (item: OrderItem) =>
    Math.max(0, item.quantity - getPastAdjustedQty(item))

  const isEditable = ['generated', 'pending_separation', 'separation'].includes(order.status)
  const canAdminAdjust = ['generated', 'pending_separation', 'separation'].includes(order.status)
  const canSendToSeparation = order.status === 'generated'
  const canPrintSeparation  = ['pending_separation', 'separation'].includes(order.status)
  const canInvoice          = ['pending_separation', 'separation'].includes(order.status)
  const isInvoiced          = order.status === 'invoiced_ready_to_ship'
  const isPartialDelivery   = order.status === 'partial_delivery'
  const isDelivered         = order.status === 'delivered'
  const canRegisterDelivery = isPartialDelivery

  const startEdit = () => {
    setEditItems(order.items.map(i => ({ ...i })))
    setEditNotes(order.notes ?? '')
    setEditPayment(order.paymentTerms ?? '')
    setEditMode(true)
  }

  const editSubtotal = editItems.reduce((s, i) => s + i.total, 0)

  const updateEditQty = (idx: number, delta: number) => {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const qty = Math.max(1, item.quantity + delta)
      return { ...item, quantity: qty, total: qty * item.price * (1 - item.discount / 100) }
    }))
  }

  const updateEditDiscount = (idx: number, discount: number) => {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const d = Math.min(100, Math.max(0, discount))
      return { ...item, discount: d, total: item.quantity * item.price * (1 - d / 100) }
    }))
  }

  const removeEditItem = (idx: number) => setEditItems(prev => prev.filter((_, i) => i !== idx))

  const addEditItem = (product: Product) => {
    setEditItems(prev => {
      // se já existe o mesmo produto simples (sem variantes), só incrementa qty
      const existIdx = prev.findIndex(i => i.productId === product.id && !i.variants?.length)
      if (existIdx >= 0) {
        return prev.map((item, i) => {
          if (i !== existIdx) return item
          const qty = item.quantity + 1
          return { ...item, quantity: qty, total: qty * item.price * (1 - item.discount / 100) }
        })
      }
      // produto novo — adiciona com qty=1
      return [...prev, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        price: product.price,
        discount: 0,
        total: product.price,
      }]
    })
    setAddProductSearch('')
    setShowAddProduct(false)
  }

  const handleSaveEdit = async () => {
    if (!user) return
    setActing(true)
    const newSubtotal = editItems.reduce((s, i) => s + i.total, 0)
    await updateOrderAdmin(order.id, {
      items: editItems,
      subtotal: newSubtotal,
      total: newSubtotal,
      notes: editNotes || undefined,
      paymentTerms: editPayment || undefined,
    })
    await createInteraction({ clientId: order.clientId, clientName: order.clientName, repId: user.id, repName: user.name, type: 'pedido', title: 'Pedido atualizado pelo admin', description: `Pedido ${order.number} editado`, relatedId: order.id, timestamp: new Date().toISOString() })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_order_admin', entity: 'Pedido', entityId: order.id, description: `Admin editou pedido ${order.number}`, timestamp: new Date().toISOString() })
    setActing(false); setEditMode(false); refetch()
  }

  // ── Data da Venda (pedido retroativo) ──
  const handleSaveSaleDate = async () => {
    if (!user) return
    const newDate = saleDateInput
    const oldDate = saleDateOf(order).slice(0, 10)
    if (!newDate || newDate === oldDate) { setEditingSaleDate(false); return }
    setSavingSaleDate(true)
    try {
      await updateOrderAdmin(order.id, { saleDate: newDate })
      await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_sale_date', entity: 'Pedido', entityId: order.id, description: `Data da venda alterada: ${oldDate} → ${newDate}. Pedido ${order.number}`, oldValue: oldDate, newValue: newDate, timestamp: new Date().toISOString() })
      setEditingSaleDate(false)
      // Se já existe financeiro, oferece reprocessamento
      const recs = await getOrderReceivables(order.id)
      if (recs.length > 0) setReprocessDate(newDate)
      else refetch()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar data da venda')
    } finally {
      setSavingSaleDate(false)
    }
  }

  const handleReprocessFinancial = async (doIt: boolean) => {
    const newDate = reprocessDate
    setReprocessDate(null)
    if (doIt && user && newDate) {
      try {
        const r = await reprocessOrderFinancial({ ...order, saleDate: newDate })
        await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'recalculate_financial', entity: 'Pedido', entityId: order.id, description: `Financeiro reprocessado para a data da venda ${newDate}${r.receivablesRecreated ? ' — parcelas/vencimentos recriados' : ''}. Pedido ${order.number}`, timestamp: new Date().toISOString() })
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Erro ao reprocessar financeiro')
      }
    }
    refetch()
  }

  const handleSendToSeparation = async () => {
    if (!user) return
    setActing(true)
    const ts = new Date().toISOString()
    await sendToSeparation(order.id)
    await createInteraction({ clientId: order.clientId, clientName: order.clientName, repId: user.id, repName: user.name, type: 'pedido', title: 'Pedido enviado para separação', description: `Pedido ${order.number} enviado para separação`, relatedId: order.id, timestamp: ts })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'send_to_separation', entity: 'Pedido', entityId: order.id, description: `Pedido ${order.number} → pendente separação`, timestamp: ts })

    // ── Geração automática do financeiro + comissão (idempotente) ──
    try {
      const createdFin = await ensureOrderReceivables(order)
      if (createdFin) {
        await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'financial_generated', entity: 'Pedido', entityId: order.id, description: `Financeiro gerado ao enviar para separação — ${order.paymentTerms || 'sem condição'} · ${formatCurrency(order.total)}. Pedido ${order.number}`, timestamp: ts })
      }
      const timing = settings?.commissionTiming ?? 'separation'
      if (timing === 'separation') {
        const commRate = settings?.defaultCommissionRate ?? 3
        const createdComm = await generateOrderCommission(order, commRate)
        if (createdComm) {
          await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'commission_generated', entity: 'Pedido', entityId: order.id, description: `Comissão prevista gerada (${commRate}% · ${formatCurrency(order.total * (commRate / 100))}) para ${order.repName}. Pedido ${order.number}`, timestamp: ts })
        }
      }
    } catch { /* silencioso — não travar o fluxo de separação */ }

    setActing(false); setShowConfirm(null); refetch()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _jsPDFPages = (doc: unknown) => (doc as any).internal.getNumberOfPages() as number

  const handlePrintSeparation = async () => {
    if (!user) return

    // ─── logo ────────────────────────────────────────────────────
    let logoData: string | null = null
    try {
      const res = await fetch('/logo.png')
      if (res.ok) {
        const blob = await res.blob()
        logoData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
      }
    } catch { /* fallback: texto */ }

    // ─── mapa productId → código real ───────────────────────────
    const codeMap = new Map<string, string>()
    for (const p of allProducts) codeMap.set(p.id, p.code ?? p.id.slice(0, 6).toUpperCase())

    // ─── identificar atributos de cor ────────────────────────────
    const COR_NAMES = new Set(['cor', 'cor/estampa', 'estampa', 'cores', 'color'])
    const isColorAttr = (name: string) => COR_NAMES.has(name.toLowerCase())

    // ─── ordenar itens por código ASC (natural sort) ─────────────
    // Filtrar itens com quantidade de separação > 0 (após baixas administrativas)
    const sorted = [...order.items]
      .filter(item => {
        const adjQty = (item.adminAdjustments ?? []).reduce((s, a) => s + a.qty, 0)
        return Math.max(0, item.quantity - adjQty) > 0
      })
      .sort((a, b) => {
        const ca = codeMap.get(a.productId) ?? ''
        const cb = codeMap.get(b.productId) ?? ''
        return ca.localeCompare(cb, 'pt-BR', { numeric: true, sensitivity: 'base' })
      })

    const sepQtyMap = new Map<OrderItem, number>()
    for (const item of sorted) {
      const adjQty = (item.adminAdjustments ?? []).reduce((s, a) => s + a.qty, 0)
      sepQtyMap.set(item, Math.max(0, item.quantity - adjQty))
    }

    // ─── 1ª passagem: coletar todas as cores únicas ──────────────
    const colorSet = new Set<string>()
    for (const item of sorted) {
      for (const v of item.variants ?? []) {
        if (isColorAttr(v.attributeName)) colorSet.add(v.valueName.toUpperCase())
      }
      if (item.attribute && isColorAttr(item.attribute.attributeName)) {
        colorSet.add(item.attribute.valueName.toUpperCase())
      }
    }
    // Ordem operacional FIXA da ITADOG: Azul → Rosa → Preto → Vermelho.
    // Cores fora dessa lista entram depois, em ordem alfabética (não se perdem).
    const COLOR_ORDER = ['AZUL', 'ROSA', 'PRETO', 'VERMELHO']
    const colorRank = (c: string) => {
      const i = COLOR_ORDER.indexOf(c.toUpperCase())
      return i === -1 ? COLOR_ORDER.length : i
    }
    const colors = [...colorSet].sort((a, b) => {
      const ra = colorRank(a), rb = colorRank(b)
      if (ra !== rb) return ra - rb
      return a.localeCompare(b, 'pt-BR')
    })

    // ════════════════════════════════════════════════════════════
    // VERSÃO 3 — CLEAN MODERNO
    // Header branco + logo + linha azul | badge azul para código
    // Tabela 100% da largura utilizável da página
    // ════════════════════════════════════════════════════════════
    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const PW   = 210
    const PH   = 297
    const ML   = 5      // margem esquerda
    const MR   = 5      // margem direita
    const USE  = PW - ML - MR   // 200mm — tabela preenche 100%

    // ── TIPOGRAFIA ────────────────────────────────────────────
    const FSZ       = 8     // corpo principal
    const FSZ_HEAD  = 7.5   // cabeçalho de tabela
    const FSZ_QTY   = 9.5   // números de quantidade
    const FSZ_CODE  = 8.5   // código do produto
    const BASE_ROW  = 6     // altura mínima por linha (mm)
    const TH_H      = 8     // altura do cabeçalho da tabela
    const PAD       = 2     // padding interno célula

    // ── COLUNAS ──────────────────────────────────────────────
    // CÓDIGO: mede conteúdo real
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(FSZ_CODE)
    let maxCodeW = doc.getTextWidth('CÓD.')
    for (const item of sorted) {
      const code = codeMap.get(item.productId) ?? item.productId.slice(0, 6).toUpperCase()
      const w = doc.getTextWidth(code)
      if (w > maxCodeW) maxCodeW = w
    }
    const COL_CODE = maxCodeW + PAD * 2 + 1

    // QTY TOTAL: mede na fonte grande (usando separation qty)
    doc.setFontSize(FSZ_QTY)
    let maxQtyW = doc.getTextWidth('QT')
    for (const item of sorted) {
      const w = doc.getTextWidth(String(sepQtyMap.get(item) ?? item.quantity))
      if (w > maxQtyW) maxQtyW = w
    }
    const COL_QTY = maxQtyW + PAD * 2 + 1

    // CORES: fixo 13mm cada
    const nColors     = colors.length
    const COL_C       = 13
    const totalColorW = nColors * COL_C

    // DESC: preenche o restante — tabela 100% da página
    const COL_DESC = USE - COL_CODE - COL_QTY - totalColorW

    // Posições X
    const XC: number[] = []
    let cx = ML
    const X_CODE = cx; cx += COL_CODE
    const X_DESC = cx; cx += COL_DESC
    const X_QTY  = cx; cx += COL_QTY
    for (let i = 0; i < nColors; i++) { XC.push(cx); cx += COL_C }

    const TABLE_W = USE
    const TABLE_R = ML + USE

    // ── SAFE ZONE ────────────────────────────────────────────
    const FOOT_H = 10
    const SAFE_Y = PH - MR - FOOT_H

    let y = ML

    // totalizadores por cor
    const colorTotals: Record<string, number> = {}
    for (const c of colors) colorTotals[c] = 0

    // ── CABEÇALHO DA TABELA (repetível em cada página) ───────
    const drawTH = () => {
      doc.setFillColor(30, 80, 200)
      doc.rect(ML, y, TABLE_W, TH_H, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(FSZ_HEAD)
      doc.setTextColor(255)
      const ty = y + TH_H / 2 + FSZ_HEAD * 0.18
      doc.text('CÓD.',      X_CODE + COL_CODE / 2, ty, { align: 'center' })
      doc.text('DESCRIÇÃO', X_DESC + PAD, ty)
      doc.text('QT',        X_QTY + COL_QTY - PAD, ty, { align: 'right' })
      for (let i = 0; i < nColors; i++) {
        const lbl = colors[i].length <= 4 ? colors[i].toUpperCase() : colors[i].slice(0, 4).toUpperCase()
        doc.text(lbl, XC[i] + COL_C / 2, ty, { align: 'center' })
      }
      doc.setDrawColor(50, 90, 210)
      doc.setLineWidth(0.25)
      doc.line(ML, y, ML, y + TH_H)
      ;[X_DESC, X_QTY, ...XC, TABLE_R].forEach(x => doc.line(x, y, x, y + TH_H))
      doc.setLineWidth(0.35)
      doc.line(ML, y + TH_H, TABLE_R, y + TH_H)
      doc.setTextColor(20)
      y += TH_H
    }

    // ── QUEBRA DE PÁGINA ─────────────────────────────────────
    const ensureSpace = (needed: number) => {
      if (y + needed > SAFE_Y) {
        const pg = _jsPDFPages(doc)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(130)
        doc.text(`${order.number}  ·  ${order.clientName}  ·  Pág. ${pg}`, PW / 2, PH - 3, { align: 'center' })
        doc.setTextColor(20)
        doc.addPage()
        y = ML
        drawTH()
      }
    }

    // ════════════════════════════════════════════════════════════
    // CABEÇALHO DO DOCUMENTO — branco + logo + linha azul
    // ════════════════════════════════════════════════════════════
    const HDR_H = 18
    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, PW, HDR_H, 'F')
    // linha azul accent no rodapé do header
    doc.setFillColor(30, 80, 200)
    doc.rect(0, HDR_H - 2, PW, 2, 'F')

    // Logo
    if (logoData) {
      try {
        const lh = 11
        const lw = lh * (300 / 80)   // aspect ratio 300×80
        doc.addImage(logoData, 'PNG', ML + 1, (HDR_H - lh) / 2 - 1, lw, lh)
      } catch { /* sem logo */ }
    }

    // Título e número — direita
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(30, 80, 200)
    doc.text('ORDEM DE SEPARAÇÃO', PW - MR, 8, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`${order.number}  ·  ${formatDate(order.createdAt)}`, PW - MR, 14, { align: 'right' })

    y = HDR_H + 2

    // ── FAIXA DE INFO: sem fundo, labels azuis + linha separadora ─
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(30, 80, 200)
    doc.text('CLIENTE', ML, y + 4.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(20)
    doc.text(order.clientName, ML + 16, y + 5)

    if (order.clientCity) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(30, 80, 200)
      doc.text('CIDADE', ML + 90, y + 4.5)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(40)
      doc.text(order.clientCity, ML + 105, y + 5)
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(30, 80, 200)
    doc.text('REP', ML + 147, y + 4.5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(40)
    doc.text(order.repName, ML + 156, y + 5)

    if (order.paymentTerms) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(30, 80, 200)
      doc.text('PGTO', ML, y + 10.5)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(40)
      doc.text(order.paymentTerms, ML + 12, y + 11)
    }

    // linha separadora fina
    doc.setDrawColor(200, 210, 240)
    doc.setLineWidth(0.4)
    doc.line(ML, y + 13, TABLE_R, y + 13)

    y += 15

    // ════════════════════════════════════════════════════════════
    // TABELA DE PRODUTOS
    // ════════════════════════════════════════════════════════════
    drawTH()

    let totalUnits = 0
    let totalSkus  = 0
    let rowIdx     = 0

    for (const item of sorted) {
      const code = codeMap.get(item.productId) ?? item.productId.slice(0, 6).toUpperCase()
      const itemSepQty = sepQtyMap.get(item) ?? item.quantity
      const itemHasAdj = (item.adminAdjustments ?? []).length > 0
      totalSkus++
      totalUnits += itemSepQty

      // mapa cor → qty
      const cqty: Record<string, number> = {}
      for (const v of item.variants ?? []) {
        if (isColorAttr(v.attributeName)) {
          const key = v.valueName.toUpperCase()
          cqty[key] = (cqty[key] ?? 0) + v.qty
          colorTotals[key] = (colorTotals[key] ?? 0) + v.qty
        }
      }
      if (item.attribute && isColorAttr(item.attribute.attributeName)) {
        const key = item.attribute.valueName.toUpperCase()
        cqty[key] = (cqty[key] ?? 0) + itemSepQty
        colorTotals[key] = (colorTotals[key] ?? 0) + itemSepQty
      }

      // altura variável
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(FSZ)
      const isKitItem = item.kitCount != null
      const dname = doc.splitTextToSize(item.productName.toUpperCase(), COL_DESC - PAD * 2)
      // Kit items precisam de espaço extra para o label de promoção
      const extraKitH = isKitItem ? FSZ * 0.352 + 2 : 0
      const textH = dname.length * (FSZ * 0.352 + 0.4) + extraKitH
      const ROW_H = Math.max(BASE_ROW, textH + PAD * 1.8)

      ensureSpace(ROW_H)

      const isAlt = rowIdx % 2 === 1
      rowIdx++
      const midY = y + ROW_H / 2 + FSZ * 0.18

      // zebra suave para linhas alternadas
      if (isAlt) {
        doc.setFillColor(248, 250, 255)
        doc.rect(ML, y, TABLE_W, ROW_H, 'F')
      }

      // ── CÓDIGO — badge azul com texto branco ─────────────────
      if (isAlt) { doc.setFillColor(30, 80, 200) } else { doc.setFillColor(40, 95, 215) }
      doc.rect(ML, y, COL_CODE, ROW_H, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(FSZ_CODE)
      doc.setTextColor(255)
      doc.text(code, X_CODE + COL_CODE / 2, midY, { align: 'center' })

      // ── BORDAS — apenas linhas verticais e horizontal inferior ──
      doc.setDrawColor(180, 195, 230)
      doc.setLineWidth(0.15)
      doc.line(ML, y, ML, y + ROW_H)
      ;[X_DESC, X_QTY, ...XC, TABLE_R].forEach(x => doc.line(x, y, x, y + ROW_H))
      doc.setLineWidth(0.2)
      doc.line(ML, y + ROW_H, TABLE_R, y + ROW_H)

      // ── DESCRIÇÃO ────────────────────────────────────────────
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(FSZ)
      doc.setTextColor(25)
      const nameTopY = y + FSZ * 0.352 + PAD * 0.9
      doc.text(dname, X_DESC + PAD, nameTopY, { lineHeightFactor: 1.2 })
      // Kit: mostrar label de promoção abaixo do nome
      if (item.kitCount != null && item.kitPaidQty != null && item.kitDeliveredQty != null) {
        const kitLabelY = nameTopY + dname.length * (FSZ * 0.352 + 0.4) + 0.8
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(200, 80, 0)
        doc.text(
          `🎁 KIT ${item.kitCount}× (${item.kitPaidQty}+${item.kitDeliveredQty - item.kitPaidQty})  Faturado: ${item.billedQuantity ?? ''} un`,
          X_DESC + PAD, kitLabelY
        )
        doc.setTextColor(25)
      }

      // ── QTDE — separação (após baixas administrativas) ──────────
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(FSZ_QTY)
      doc.setTextColor(30, 80, 200)
      doc.text(String(itemSepQty), X_QTY + COL_QTY - PAD, midY + 0.5, { align: 'right' })
      // Nota de ajuste (se houver baixa administrativa)
      if (itemHasAdj) {
        const totalAdj = (item.adminAdjustments ?? []).reduce((s, a) => s + a.qty, 0)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(5.5)
        doc.setTextColor(200, 80, 0)
        doc.text(`(ped: ${item.quantity} −${totalAdj})`, X_QTY + COL_QTY - PAD, midY + 3.5, { align: 'right' })
      }

      // ── CORES ─────────────────────────────────────────────────
      for (let i = 0; i < nColors; i++) {
        const q = cqty[colors[i]]
        if (q) {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(FSZ_QTY)
          doc.setTextColor(20)
          doc.text(String(q), XC[i] + COL_C / 2, midY + 0.5, { align: 'center' })
        }
      }
      doc.setFont('helvetica', 'normal')

      y += ROW_H
    }

    // ════════════════════════════════════════════════════════════
    // BARRA DE TOTAIS
    // ════════════════════════════════════════════════════════════
    doc.setDrawColor(30, 80, 200)
    doc.setLineWidth(0.5)
    doc.line(ML, y, TABLE_R, y)

    const TOT_H = 8.5
    doc.setFillColor(30, 80, 200)
    doc.rect(ML, y, TABLE_W, TOT_H, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(255)
    const ty2 = y + TOT_H / 2 + 8.5 * 0.18
    doc.text(`TOTAL  ${totalSkus} SKU${totalSkus !== 1 ? 's' : ''}`, ML + PAD, ty2)
    doc.text(`${totalUnits} un`, X_QTY + COL_QTY - PAD, ty2, { align: 'right' })
    for (let i = 0; i < nColors; i++) {
      if (colorTotals[colors[i]] > 0) {
        doc.text(String(colorTotals[colors[i]]), XC[i] + COL_C / 2, ty2, { align: 'center' })
      }
    }
    doc.setTextColor(20)
    y += TOT_H

    // Número de página em todas as páginas
    const totalPages = _jsPDFPages(doc)
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(140)
      doc.text(
        `${order.number}  ·  SEPARAÇÃO  ·  ${order.clientName}  ·  Pág. ${p} / ${totalPages}`,
        PW / 2, PH - 3, { align: 'center' }
      )
      doc.setTextColor(20)
    }

    doc.save(`separacao-${order.number}.pdf`)

    await markAsSeparation(order.id)
    await createInteraction({ clientId: order.clientId, clientName: order.clientName, repId: user.id, repName: user.name, type: 'pedido', title: 'PDF de separação gerado', description: `Pedido ${order.number} — PDF de separação impresso`, relatedId: order.id, timestamp: new Date().toISOString() })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'print_separation_pdf', entity: 'Pedido', entityId: order.id, description: `PDF separação gerado — pedido ${order.number}`, timestamp: new Date().toISOString() })
    refetch()
  }

  // ══════════════════════════════════════════════════════════════════
  // PDF COMERCIAL — segunda via permanente (layout no módulo compartilhado
  // src/services/comercialPdf.ts, reutilizado em todas as telas)
  // ══════════════════════════════════════════════════════════════════
  const handlePrintComercial = async () => {
    if (!user) return
    await printComercialPdf(order, allProducts)
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'generate_spreadsheet', entity: 'Pedido', entityId: order.id, description: `PDF Comercial gerado — pedido ${order.number}`, timestamp: new Date().toISOString() })
  }

  const handleInvoice = async () => {
    if (!user) return
    setActing(true)
    const ts = new Date().toISOString()
    const commRate = settings?.defaultCommissionRate ?? 3
    const timing = settings?.commissionTiming ?? 'separation'
    await invoiceOrder(order, user.name)
    // Notificação ao representante via interação
    await createInteraction({ clientId: order.clientId, clientName: order.clientName, repId: order.repId, repName: order.repName, type: 'pedido', title: `Pedido nº ${order.number} faturado`, description: `Seu pedido nº ${order.number} foi faturado e está pronto para envio.`, relatedId: order.id, timestamp: ts })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'invoice_ready_to_ship', entity: 'Pedido', entityId: order.id, description: `Pedido ${order.number} faturado por ${user.name}`, timestamp: ts })
    // Financeiro: já deve ter sido gerado na separação; garante caso tenha pulado etapa (idempotente)
    try {
      const createdFin = await ensureOrderReceivables(order)
      if (createdFin) {
        await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'financial_generated', entity: 'Pedido', entityId: order.id, description: `Financeiro gerado no faturamento — ${order.paymentTerms || 'sem condição'} · ${formatCurrency(order.total)}. Pedido ${order.number}`, timestamp: ts })
      }
      // Comissão: gera se config = faturado, ou como garantia se config = separação e ainda não existe
      if (timing === 'separation' || timing === 'invoiced') {
        const createdComm = await generateOrderCommission(order, commRate)
        if (createdComm) {
          await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'commission_generated', entity: 'Pedido', entityId: order.id, description: `Comissão prevista gerada (${commRate}% · ${formatCurrency(order.total * (commRate / 100))}) para ${order.repName}. Pedido ${order.number}`, timestamp: ts })
        }
      }
    } catch { /* silencioso — não travar o fluxo */ }
    setActing(false); setShowConfirm(null); setConfirmNote(''); refetch()
  }

  // Etapa 1: verifica se há financeiro vinculado
  const handleCheckFinancial = async () => {
    if (!user) return
    const reason = deleteReason === 'Outro' ? deleteOther.trim() : deleteReason
    if (!reason) return
    setActing(true)
    try {
      const receivables = await getOrderReceivables(order.id)
      setOrderReceivables(receivables)
      if (receivables.length > 0) {
        setDeleteStep('financial')
        setFinancialAction(null)
      } else {
        await executeDelete('none')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao verificar financeiro')
    } finally {
      setActing(false)
    }
  }

  // Etapa 2: executa a exclusão com a ação financeira escolhida
  const executeDelete = async (action: 'none' | 'both' | 'keep') => {
    if (!user) return
    const reason = deleteReason === 'Outro' ? deleteOther.trim() : deleteReason
    setActing(true)
    try {
      const dateStr = new Date().toLocaleDateString('pt-BR')
      if (action === 'both') {
        await deleteOrderReceivables(order.id)
        await logAudit({
          userId: user.id, userName: user.name, userRole: user.role,
          action: 'financial_deleted', entity: 'Pedido', entityId: order.id,
          description: `${orderReceivables.length} título(s) financeiro(s) excluído(s) junto com o pedido ${order.number}. Motivo: ${reason}`,
          timestamp: new Date().toISOString(),
        })
        await logAudit({
          userId: user.id, userName: user.name, userRole: user.role,
          action: 'delete_order_and_financial', entity: 'Pedido', entityId: order.id,
          description: `Pedido ${order.number} excluído com ${orderReceivables.length} título(s) financeiro(s). Motivo: ${reason}`,
          timestamp: new Date().toISOString(),
        })
      } else if (action === 'keep') {
        await addNoteToOrderReceivables(order.id, `Pedido original removido em ${dateStr}`)
        await logAudit({
          userId: user.id, userName: user.name, userRole: user.role,
          action: 'delete_order_keep_financial', entity: 'Pedido', entityId: order.id,
          description: `Pedido ${order.number} excluído. Financeiro mantido (${orderReceivables.length} título(s)) com observação de remoção.`,
          timestamp: new Date().toISOString(),
        })
      }
      await softDeleteOrder(order.id, user.name, reason, order.status)
      await logAudit({
        userId: user.id, userName: user.name, userRole: user.role,
        action: 'delete_order', entity: 'Pedido', entityId: order.id,
        description: `Pedido ${order.number} excluído. Status: ${order.status}. Motivo: ${reason}`,
        timestamp: new Date().toISOString(),
      })
      setShowDeleteModal(false)
      navigate('/admin/pedidos', { replace: true })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir pedido')
    } finally {
      setActing(false)
    }
  }

  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setDeleteStep('reason')
    setOrderReceivables([])
    setFinancialAction(null)
    setDeleteReason('')
    setDeleteOther('')
  }

  const openDeliveryModal = () => {
    // Pré-carrega com as quantidades já entregues (acumulado)
    const initial: Record<string, number> = {}
    for (const item of order.items) {
      initial[item.productId] = item.deliveredQty ?? 0
    }
    setDeliveryQtys(initial)
    setShowDeliveryModal(true)
  }

  const handleRegisterDelivery = async () => {
    if (!user) return
    setActing(true)
    try {
      const deliveredItems = order.items.map(item => ({
        productId: item.productId,
        deliveredQty: deliveryQtys[item.productId] ?? 0,
      }))

      const newStatus = await registerPartialDelivery(order, deliveredItems, user.name)

      const totalPending = order.items.reduce((sum, item) => {
        const qty = item.quantity
        const delivered = deliveryQtys[item.productId] ?? 0
        return sum + Math.max(0, qty - delivered)
      }, 0)

      const auditAction = newStatus === 'delivered' ? 'delivery_completed' : 'partial_delivery_registered'
      const description = newStatus === 'delivered'
        ? `Entrega concluída — pedido ${order.number} totalmente entregue`
        : `Entrega parcial registrada — pedido ${order.number} — ${totalPending} unidade(s) pendente(s)`

      await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: auditAction, entity: 'Pedido', entityId: order.id, description, timestamp: new Date().toISOString() })

      await createInteraction({
        clientId: order.clientId, clientName: order.clientName,
        repId: order.repId, repName: order.repName,
        type: 'pedido',
        title: newStatus === 'delivered' ? 'Pedido entregue' : 'Entrega parcial registrada',
        description: newStatus === 'delivered'
          ? `Pedido ${order.number} — entrega concluída.`
          : `Pedido ${order.number} — entrega parcial. ${totalPending} unidade(s) ainda pendente(s).`,
        relatedId: order.id, timestamp: new Date().toISOString(),
      })

      setShowDeliveryModal(false)
      refetch()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao registrar entrega')
    } finally {
      setActing(false)
    }
  }

  const openAdjustPanel = () => {
    const initial: Record<string, { qty: number; reason: string; notes: string }> = {}
    order.items.forEach((_, i) => { initial[String(i)] = { qty: 0, reason: '', notes: '' } })
    setAdjEntries(initial)
    setRecalcFinancial(false)
    setShowAdjustPanel(true)
  }

  const handleSaveAdjustments = async () => {
    if (!user) return
    // Validate
    for (const [idxStr, entry] of Object.entries(adjEntries)) {
      if (entry.qty <= 0) continue
      const item = order.items[Number(idxStr)]
      const sepQty = getSeparationQty(item)
      if (entry.qty > sepQty) {
        alert(`A baixa de ${entry.qty} excede a quantidade disponível para separação (${sepQty}) em "${item.productName}"`)
        return
      }
      if (!entry.reason) {
        alert(`Selecione o motivo para "${item.productName}"`)
        return
      }
      if (entry.reason === 'Outros' && !entry.notes.trim()) {
        alert(`Preencha a observação para "${item.productName}"`)
        return
      }
    }
    const hasAny = Object.values(adjEntries).some(e => e.qty > 0)
    if (!hasAny) return

    setSavingAdj(true)
    try {
      const now = new Date().toISOString()
      const updatedItems = order.items.map((item, idx) => {
        const entry = adjEntries[String(idx)]
        if (!entry || entry.qty <= 0) return item
        const newAdj: OrderItemAdjustment = {
          qty: entry.qty,
          reason: entry.reason,
          notes: entry.reason === 'Outros' ? entry.notes.trim() : undefined,
          adjustedAt: now,
          adjustedBy: user.name,
        }
        return { ...item, adminAdjustments: [...(item.adminAdjustments ?? []), newAdj] }
      })

      const newTotal = recalcFinancial
        ? updatedItems.reduce((sum, item) => {
            const adjQty = (item.adminAdjustments ?? []).reduce((s, a) => s + a.qty, 0)
            const sepQty = Math.max(0, item.quantity - adjQty)
            return sum + sepQty * item.price * (1 - item.discount / 100)
          }, 0)
        : undefined

      await updateOrderAdmin(order.id, {
        items: updatedItems,
        ...(newTotal !== undefined && { subtotal: newTotal, total: newTotal }),
      })

      // Audit — one entry per adjusted item
      for (const [idxStr, entry] of Object.entries(adjEntries)) {
        if (entry.qty <= 0) continue
        const item = order.items[Number(idxStr)]
        const sepQtyBefore = getSeparationQty(item)
        await logAudit({
          userId: user.id, userName: user.name, userRole: user.role,
          action: 'administrative_adjustment',
          entity: 'Pedido', entityId: order.id,
          description: `Ajuste admin: "${item.productName}" — baixa de ${entry.qty} un (${entry.reason}${entry.notes ? ': ' + entry.notes : ''}). Pedido: ${item.quantity} | Sep: ${sepQtyBefore} → ${sepQtyBefore - entry.qty}. Pedido ${order.number}`,
          timestamp: now,
        })
      }

      // Financial recalculation (delete + recreate receivables if any)
      if (recalcFinancial && newTotal !== undefined) {
        const existing = await getOrderReceivables(order.id)
        if (existing.length > 0) {
          await deleteOrderReceivables(order.id)
          const { generateReceivables } = await import('@/services/db')
          await generateReceivables({ ...order, items: updatedItems, total: newTotal, subtotal: newTotal })
        }
        await logAudit({
          userId: user.id, userName: user.name, userRole: user.role,
          action: 'financial_recalculated',
          entity: 'Pedido', entityId: order.id,
          description: `Financeiro recalculado após ajustes administrativos — novo total: ${formatCurrency(newTotal)}. Pedido ${order.number}`,
          timestamp: now,
        })
      }

      setShowAdjustPanel(false)
      refetch()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar ajustes')
    } finally {
      setSavingAdj(false)
    }
  }

  const handleExportXLSX = () => {
    // Para produtos com variantes: uma linha por variante
    // Para produtos sem variantes: uma linha por item
    const rows: Record<string, string | number>[] = []
    for (const item of order.items) {
      const base = {
        'Número Pedido': order.number,
        'Cliente': order.clientName,
        'Representante': order.repName,
        'Data': formatDate(order.createdAt),
        'Código Produto': item.productId.slice(0, 8).toUpperCase(),
        'Produto': item.productName,
        'Preço Unitário (R$)': item.price,
        'Desconto (%)': item.discount,
        'Observações': order.notes ?? '',
      }
      if (item.variants && item.variants.length > 0) {
        // Uma linha por variante
        for (const v of item.variants) {
          rows.push({
            ...base,
            'Atributo': v.attributeName,
            'Variação': v.valueName,
            'Quantidade': v.qty,
            'Total Item (R$)': v.qty * item.price * (1 - item.discount / 100),
          })
        }
        // Linha de total do produto
        rows.push({
          ...base,
          'Atributo': '',
          'Variação': 'TOTAL',
          'Quantidade': item.quantity,
          'Total Item (R$)': item.total,
        })
      } else {
        rows.push({
          ...base,
          'Atributo': item.attribute?.attributeName ?? '',
          'Variação': item.attribute?.valueName ?? '',
          'Quantidade': item.quantity,
          'Total Item (R$)': item.total,
        })
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pedido')
    XLSX.writeFile(wb, `pedido-${order.number}.xlsx`)
    logAudit({ userId: user!.id, userName: user!.name, userRole: user!.role, action: 'generate_spreadsheet', entity: 'Pedido', entityId: order.id, description: `Planilha gerada para pedido ${order.number}`, timestamp: new Date().toISOString() })
  }

  const items = editMode ? editItems : order.items
  const subtotal = editMode ? editSubtotal : order.subtotal

  const filteredAddProducts = addProductSearch.trim().length >= 1
    ? allProducts
        .filter(p => p.active !== false &&
          (p.name.toLowerCase().includes(addProductSearch.toLowerCase()) ||
           p.code.toLowerCase().includes(addProductSearch.toLowerCase())))
        .slice(0, 8)
    : []

  return (
    <AdminLayout title={order.number}>
      <div className="p-6 max-w-3xl mx-auto space-y-5 pb-10">
        {/* Topbar */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm">
            <ChevronLeft className="w-4 h-4" /> Pedidos
          </button>
          <div className="flex gap-2">
            <a href={makeOrderWhatsapp(order, client?.phone)}
               target="_blank" rel="noreferrer"
               className="flex items-center gap-1.5 text-xs font-semibold text-[#25D366] border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-50">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
            <button onClick={handleExportXLSX}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Planilha
            </button>
            {isEditable && !editMode && (
              <button onClick={startEdit}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 border border-primary-200 px-3 py-1.5 rounded-lg bg-primary-50 hover:bg-primary-100">
                <Edit3 className="w-3.5 h-3.5" /> Editar Pedido
              </button>
            )}
            <button
              onClick={() => { setDeleteReason(''); setDeleteOther(''); setDeleteStep('reason'); setOrderReceivables([]); setFinancialAction(null); setShowDeleteModal(true) }}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="card p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-slate-400 font-mono">{order.number}</p>
              <h2 className="font-bold text-slate-900 text-lg mt-0.5">{order.clientName}</h2>
              {order.clientCity && <p className="text-xs text-slate-400">{order.clientCity}</p>}
              <p className="text-xs text-slate-500 mt-1">Rep: <strong>{order.repName}</strong></p>
              <p className="text-xs text-slate-400">{formatDate(order.createdAt)}</p>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 text-sm">
            <div>
              <p className="text-xs text-slate-400">Condição de Pagamento</p>
              <p className={cn('font-medium', order.paymentTerms ? 'text-slate-700' : 'text-slate-400 italic')}>
                {order.paymentTerms || 'Não informado'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Forma de Pagamento</p>
              <p className={cn('font-medium', order.paymentMethod ? 'text-slate-700' : 'text-slate-400 italic')}>
                {order.paymentMethod || 'Não informado'}
              </p>
            </div>
            {/* Data da Venda — referência comercial, editável pelo admin (retroativos) */}
            <div className="col-span-2">
              <p className="text-xs text-slate-400">Data da Venda</p>
              {editingSaleDate ? (
                <div className="flex items-center gap-2 mt-1">
                  <input type="date" value={saleDateInput} onChange={e => setSaleDateInput(e.target.value)}
                    className="input py-1 text-xs w-auto" />
                  <button onClick={handleSaveSaleDate} disabled={savingSaleDate}
                    className="text-xs font-semibold text-green-600 disabled:opacity-50">{savingSaleDate ? '...' : 'Salvar'}</button>
                  <button onClick={() => setEditingSaleDate(false)} className="text-xs text-slate-400">Cancelar</button>
                </div>
              ) : (
                <p className="font-medium text-slate-700 flex items-center gap-2">
                  {formatDate(saleDateOf(order))}
                  <button onClick={() => { setSaleDateInput(saleDateOf(order).slice(0, 10)); setEditingSaleDate(true) }}
                    className="text-xs font-semibold text-primary-600 hover:text-primary-700">Alterar</button>
                </p>
              )}
            </div>
            {order.invoicedAt && <div><p className="text-xs text-slate-400">Faturado em</p><p className="font-medium text-slate-700">{formatDate(order.invoicedAt)} · {order.invoicedBy}</p></div>}
            {order.deliveredAt && <div><p className="text-xs text-slate-400">Entregue em</p><p className="font-medium text-slate-700">{formatDate(order.deliveredAt)} · {order.deliveredBy}</p></div>}
            {order.generatedAt && <div><p className="text-xs text-slate-400">Gerado em</p><p className="font-medium text-slate-700">{formatDate(order.generatedAt)} · {order.generatedBy}</p></div>}
          </div>
        </div>

        {/* Itens */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">Produtos ({items.length})</p>
            {editMode && (
              <button
                onClick={() => { setShowAddProduct(v => !v); setAddProductSearch('') }}
                className="flex items-center gap-1 text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-200 px-2.5 py-1.5 rounded-lg hover:bg-primary-100 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {showAddProduct ? 'Fechar' : 'Adicionar Produto'}
              </button>
            )}
          </div>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={`${item.productId}-${i}`} className="flex items-start gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{item.productName}</p>
                  {editMode ? (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateEditQty(i, -1)} className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                        <span className="text-sm font-semibold w-8 text-center">{item.quantity}</span>
                        <button onClick={() => updateEditQty(i, 1)} className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                      </div>
                      <span className="text-xs text-slate-400">× {formatCurrency(item.price)}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400">Desc:</span>
                        <input type="number" value={item.discount} min={0} max={100} step={1}
                          onChange={e => updateEditDiscount(i, Number(e.target.value))}
                          className="w-14 input text-xs py-0.5 px-2" />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                      <button onClick={() => removeEditItem(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <div className="mt-1 space-y-1">
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span>{item.quantity} un × {formatCurrency(item.price)}</span>
                        {item.discount > 0 && <span className="text-green-600 font-medium">−{item.discount}% desc</span>}
                      </div>
                      {/* Variantes múltiplas */}
                      {item.variants && item.variants.length > 0 && (
                        <div className="space-y-1 mt-1.5">
                          {item.variants.map(v => (
                            <div key={v.valueId} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                              <span className="text-slate-500">• {v.attributeName}: <span className="font-semibold text-slate-700">{v.valueName}</span></span>
                              <span className="font-bold text-slate-800">{v.qty} un</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Atributo único (retrocompat) */}
                      {!item.variants && item.attribute && (
                        <p className="text-xs text-primary-600 font-medium">{item.attribute.attributeName}: {item.attribute.valueName}</p>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-sm font-bold text-slate-900 flex-shrink-0">{formatCurrency(item.total)}</span>
              </div>
            ))}
          </div>

          {/* Picker de produto — visível em editMode */}
          <AnimatePresence>
            {editMode && showAddProduct && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                  <input
                    autoFocus
                    type="text"
                    value={addProductSearch}
                    onChange={e => setAddProductSearch(e.target.value)}
                    placeholder="Buscar por nome ou código..."
                    className="input text-sm w-full"
                  />
                  {filteredAddProducts.length > 0 && (
                    <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
                      {filteredAddProducts.map(p => (
                        <button
                          key={p.id}
                          onClick={() => addEditItem(p)}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-primary-50 hover:border-primary-200 border border-transparent text-left transition-colors group"
                        >
                          <div className="min-w-0">
                            <span className="text-[10px] font-mono text-slate-400 mr-1.5">{p.code}</span>
                            <span className="text-sm font-medium text-slate-800 group-hover:text-primary-800">{p.name}</span>
                          </div>
                          <span className="text-xs font-semibold text-primary-700 flex-shrink-0 ml-3">{formatCurrency(p.price)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {addProductSearch.trim().length >= 1 && filteredAddProducts.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-3">Nenhum produto encontrado para "{addProductSearch}"</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Ajustes Administrativos */}
        {canAdminAdjust && !editMode && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="section-title">Ajustes Administrativos</p>
                <p className="text-xs text-slate-400 mt-0.5">Baixas antes da separação — pedido original preservado</p>
              </div>
              <button
                onClick={showAdjustPanel ? () => setShowAdjustPanel(false) : openAdjustPanel}
                className={cn(
                  'flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors',
                  showAdjustPanel
                    ? 'bg-slate-100 border-slate-200 text-slate-600'
                    : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                )}>
                {showAdjustPanel ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {showAdjustPanel ? 'Fechar' : 'Novo Ajuste'}
              </button>
            </div>

            {/* Resumo de ajustes existentes */}
            {order.items.some(item => (item.adminAdjustments ?? []).length > 0) && (
              <div className="mb-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-left">
                        {['Produto', 'Pedido', 'Ajustado', 'Separar'].map(h => (
                          <th key={h} className="pb-2 font-semibold text-slate-500 uppercase tracking-wide pr-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {order.items.map((item, i) => {
                        const adjusted = getPastAdjustedQty(item)
                        if (adjusted === 0) return null
                        return (
                          <tr key={i}>
                            <td className="py-2 pr-3 font-medium text-slate-800 max-w-[140px] truncate">{item.productName}</td>
                            <td className="py-2 pr-3 text-slate-500">{item.quantity}</td>
                            <td className="py-2 pr-3 text-amber-600 font-bold">−{adjusted}</td>
                            <td className="py-2 pr-3 font-bold text-blue-700">{getSeparationQty(item)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Histórico por item */}
                <div className="mt-2 space-y-2">
                  {order.items.map((item, i) =>
                    (item.adminAdjustments ?? []).length > 0 ? (
                      <div key={i}>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{item.productName}</p>
                        <div className="space-y-1">
                          {item.adminAdjustments!.map((adj, ai) => (
                            <div key={ai} className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 flex justify-between gap-2">
                              <span>−{adj.qty} un · <span className="font-semibold text-slate-700">{adj.reason}</span>{adj.notes ? ` · ${adj.notes}` : ''}</span>
                              <span className="text-slate-400 flex-shrink-0">{new Date(adj.adjustedAt).toLocaleDateString('pt-BR')} · {adj.adjustedBy.split(' ')[0]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )}

            {/* Formulário de novo ajuste */}
            <AnimatePresence>
              {showAdjustPanel && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    {order.items.map((item, i) => {
                      const sepQty = getSeparationQty(item)
                      const entry = adjEntries[String(i)] ?? { qty: 0, reason: '', notes: '' }
                      const key = String(i)
                      return (
                        <div key={i} className="bg-slate-50 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-800 min-w-0 truncate">{item.productName}</p>
                            <span className="text-xs text-slate-400 flex-shrink-0">
                              Disponível para sep: <span className="font-bold text-blue-700">{sepQty}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-slate-500">Baixa:</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setAdjEntries(p => ({ ...p, [key]: { ...entry, qty: Math.max(0, entry.qty - 1) } }))}
                                className="w-6 h-6 rounded-lg bg-slate-200 flex items-center justify-center">
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number" min={0} max={sepQty}
                                value={entry.qty}
                                onChange={e => setAdjEntries(p => ({ ...p, [key]: { ...entry, qty: Math.min(sepQty, Math.max(0, Number(e.target.value))) } }))}
                                className="w-12 text-center text-sm font-bold border border-slate-200 rounded-lg py-1 bg-white"
                              />
                              <button
                                onClick={() => setAdjEntries(p => ({ ...p, [key]: { ...entry, qty: Math.min(sepQty, entry.qty + 1) } }))}
                                className="w-6 h-6 rounded-lg bg-slate-200 flex items-center justify-center">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            {entry.qty > 0 && (
                              <span className="text-xs text-slate-500">
                                → Separar: <span className="font-bold text-blue-700">{sepQty - entry.qty}</span>
                              </span>
                            )}
                          </div>
                          {entry.qty > 0 && (
                            <>
                              <select
                                value={entry.reason}
                                onChange={e => setAdjEntries(p => ({ ...p, [key]: { ...entry, reason: e.target.value, notes: '' } }))}
                                className="input text-xs w-full"
                              >
                                <option value="">Selecione o motivo</option>
                                {ADJUSTMENT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                              {entry.reason === 'Outros' && (
                                <textarea
                                  value={entry.notes}
                                  onChange={e => setAdjEntries(p => ({ ...p, [key]: { ...entry, notes: e.target.value } }))}
                                  placeholder="Descreva o motivo..."
                                  rows={2}
                                  className="input text-xs w-full resize-none"
                                />
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}

                    {/* Recalcular financeiro */}
                    <label className="flex items-start gap-2.5 cursor-pointer p-3 bg-blue-50 border border-blue-100 rounded-xl">
                      <input
                        type="checkbox"
                        checked={recalcFinancial}
                        onChange={e => setRecalcFinancial(e.target.checked)}
                        className="mt-0.5 rounded"
                      />
                      <div>
                        <p className="text-xs font-semibold text-blue-800">Recalcular financeiro</p>
                        <p className="text-xs text-blue-600 mt-0.5">Atualiza o valor do pedido e reconstrói os títulos a receber com base na quantidade para separação.</p>
                      </div>
                    </label>

                    <div className="flex gap-2">
                      <button onClick={() => setShowAdjustPanel(false)} className="flex-1 btn-secondary text-xs py-2.5">
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveAdjustments}
                        disabled={savingAdj || !Object.values(adjEntries).some(e => e.qty > 0)}
                        className="flex-1 bg-amber-600 text-white font-semibold py-2.5 rounded-xl text-xs disabled:opacity-40 flex items-center justify-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {savingAdj ? 'Salvando...' : 'Salvar Ajustes'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!showAdjustPanel && order.items.every(item => (item.adminAdjustments ?? []).length === 0) && (
              <p className="text-xs text-slate-400 text-center py-2">Nenhum ajuste registrado</p>
            )}
          </div>
        )}

        {/* Edit extras */}
        {editMode && (
          <div className="card p-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Condição de pagamento</label>
              <input value={editPayment} onChange={e => setEditPayment(e.target.value)} className="input" placeholder="Ex: 30/60/90 dias" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Observações</label>
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} className="input resize-none" />
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="card p-4 space-y-2">
          <div className="flex justify-between text-sm text-slate-500">
            <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span className="flex items-center gap-1.5">
                Desconto
                {order.discountType === 'percent' && order.discountValue
                  ? <span className="text-xs bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">{order.discountValue}%</span>
                  : order.discountType === 'fixed'
                    ? <span className="text-xs bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">R$ fixo</span>
                    : null
                }
              </span>
              <span>−{formatCurrency(order.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-100">
            <span>Total</span><span>{formatCurrency(editMode ? editSubtotal : order.total)}</span>
          </div>
        </div>

        {order.notes && !editMode && (
          <div className="card p-4">
            <p className="text-xs font-semibold text-slate-500 mb-1">Observações</p>
            <p className="text-sm text-slate-600">{order.notes}</p>
          </div>
        )}

        {/* Salvar edição */}
        {editMode && (
          <div className="flex gap-3">
            <button onClick={() => { setEditMode(false); setShowAddProduct(false); setAddProductSearch('') }} className="flex-1 btn-secondary">Cancelar</button>
            <button onClick={handleSaveEdit} disabled={acting || editItems.length === 0}
              className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50">
              <Save className="w-4 h-4" /> {acting ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        )}

        {/* Ações de fluxo */}
        {!editMode && (
          <div className="space-y-3">
            {canSendToSeparation && (
              <button onClick={() => setShowConfirm('separation')}
                className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors">
                <FileText className="w-4 h-4" /> Enviar para Separação
              </button>
            )}
            {/* PDF Comercial — SEMPRE disponível (segunda via permanente do pedido) */}
            <button
              onClick={handlePrintComercial}
              className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors">
              <Printer className="w-4 h-4" /> 📄 Imprimir Pedido (PDF Comercial)
            </button>
            {/* PDF de Separação — só nas etapas de separação */}
            {canPrintSeparation && (
              <button
                onClick={handlePrintSeparation}
                className="w-full bg-purple-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-purple-700 transition-colors">
                <Printer className="w-4 h-4" /> 📦 PDF de Separação
              </button>
            )}
            {canInvoice && (
              <button onClick={() => setShowConfirm('invoice')}
                className={cn('w-full bg-green-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-green-700 transition-colors')}>
                <CheckCircle className="w-4 h-4" /> Faturar e Pronto para Envio
              </button>
            )}
            {isDelivered && (
              <div className="rounded-2xl p-4 flex items-center gap-3 bg-slate-100 text-slate-600">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">Pedido encerrado — entregue ao cliente.</p>
              </div>
            )}
            {isInvoiced && (
              <div className="rounded-2xl p-4 flex items-center gap-3 bg-green-50 text-green-700 border border-green-200">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">Pedido faturado e entregue ao cliente.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Confirmar envio separação */}
      <AnimatePresence>
        {showConfirm === 'separation' && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowConfirm(null)} />
            <motion.div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 z-50 safe-bottom" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-slate-900">Enviar para Separação</p>
                <button onClick={() => setShowConfirm(null)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <p className="text-sm text-slate-500 mb-5">Pedido <strong>{order.number}</strong> será enviado para a fila de separação. Confirma?</p>
              <div className="flex gap-3">
                <button onClick={() => setShowConfirm(null)} className="flex-1 btn-secondary">Cancelar</button>
                <button onClick={handleSendToSeparation} disabled={acting}
                  className="flex-1 bg-blue-600 text-white font-semibold py-3 rounded-xl disabled:opacity-50">
                  {acting ? 'Enviando...' : 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal: Reprocessar financeiro após mudar a Data da Venda */}
      <AnimatePresence>
        {reprocessDate && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => handleReprocessFinancial(false)} />
            <motion.div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 z-50 safe-bottom" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-slate-900">Reprocessar financeiro?</p>
                <button onClick={() => handleReprocessFinancial(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <p className="text-sm text-slate-500 mb-5">
                Este pedido já possui financeiro gerado. Deseja recalcular as parcelas e os
                vencimentos usando a nova data da venda (<strong>{formatDate(reprocessDate)}</strong>)?
              </p>
              <div className="flex gap-3">
                <button onClick={() => handleReprocessFinancial(false)} className="flex-1 btn-secondary">Manter Atual</button>
                <button onClick={() => handleReprocessFinancial(true)}
                  className="flex-1 bg-amber-600 text-white font-semibold py-3 rounded-xl hover:bg-amber-700">
                  Recalcular
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal: Confirmar faturamento */}
      <AnimatePresence>
        {showConfirm === 'invoice' && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowConfirm(null)} />
            <motion.div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 z-50 safe-bottom" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-slate-900">Faturar Pedido</p>
                <button onClick={() => setShowConfirm(null)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <p className="text-sm text-slate-500 mb-2">Faturar o pedido <strong>{order.number}</strong> — <strong>{formatCurrency(order.total)}</strong></p>
              <p className="text-xs text-amber-600 mb-4">Isso irá criar a comissão do representante e contabilizar no dashboard e metas.</p>
              <textarea value={confirmNote} onChange={e => setConfirmNote(e.target.value)}
                placeholder="Observação sobre o faturamento (opcional)..." rows={2} className="input resize-none mb-4" />
              <div className="flex gap-3">
                <button onClick={() => setShowConfirm(null)} className="flex-1 btn-secondary">Cancelar</button>
                <button onClick={handleInvoice} disabled={acting}
                  className="flex-1 bg-green-600 text-white font-semibold py-3 rounded-xl disabled:opacity-50">
                  {acting ? 'Faturando...' : 'Confirmar Faturamento'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── MODAL EXCLUSÃO LÓGICA ── */}
      <AnimatePresence>
        {showDeleteModal && (
          <>
            <motion.div
              key="delete-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => !acting && closeDeleteModal()}
            />
            <motion.div
              key="delete-modal"
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl p-5 pb-10 max-w-lg mx-auto">

              {/* ── Etapa 1: motivo ── */}
              {deleteStep === 'reason' && (<>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">Excluir Pedido</h3>
                      <p className="text-xs text-slate-400">{order.number} — {order.clientName}</p>
                    </div>
                  </div>
                  <button onClick={closeDeleteModal} className="p-1.5 rounded-lg hover:bg-slate-100">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                  O pedido ficará oculto da operação e pode ser restaurado pelo suporte a qualquer momento.
                </p>
                <p className="text-sm font-semibold text-slate-700 mb-2">Motivo da exclusão <span className="text-red-500">*</span></p>
                <div className="grid grid-cols-1 gap-2 mb-3">
                  {DELETE_REASONS.map(r => (
                    <button key={r}
                      onClick={() => setDeleteReason(r)}
                      className={cn(
                        'text-left px-3 py-2 rounded-lg border text-sm transition-colors',
                        deleteReason === r
                          ? 'bg-red-50 border-red-400 text-red-700 font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      )}>
                      {r}
                    </button>
                  ))}
                </div>
                {deleteReason === 'Outro' && (
                  <textarea
                    value={deleteOther}
                    onChange={e => setDeleteOther(e.target.value)}
                    placeholder="Descreva o motivo..."
                    rows={2}
                    className="input w-full text-sm mb-3 resize-none"
                  />
                )}
                <button
                  onClick={handleCheckFinancial}
                  disabled={acting || !deleteReason || (deleteReason === 'Outro' && !deleteOther.trim())}
                  className="w-full bg-red-600 text-white font-semibold py-3 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  {acting ? 'Verificando financeiro...' : 'Avançar'}
                </button>
              </>)}

              {/* ── Etapa 2: escolha financeira ── */}
              {deleteStep === 'financial' && (<>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Financeiro vinculado</h3>
                    <p className="text-xs text-slate-400">{order.number} — {orderReceivables.length} título(s) encontrado(s)</p>
                  </div>
                </div>

                <p className="text-sm text-slate-700 mb-3">
                  Este pedido possui <strong>{orderReceivables.length} título(s) financeiro(s)</strong> gerado(s). O que deseja fazer?
                </p>

                {/* Alerta parcial/pago */}
                {orderReceivables.some(r => r.paidAmount > 0) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3">
                    <p className="text-xs font-bold text-amber-800">Existem pagamentos registrados nestes títulos.</p>
                    <p className="text-xs text-amber-700 mt-0.5">Confirme que deseja prosseguir com a exclusão.</p>
                  </div>
                )}
                {orderReceivables.every(r => r.status === 'pago') && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-3">
                    <p className="text-xs font-bold text-red-800">Este pedido possui financeiro liquidado.</p>
                    <p className="text-xs text-red-700 mt-0.5">A exclusão de pedidos pagos exige atenção administrativa.</p>
                  </div>
                )}

                {/* Resumo dos títulos */}
                <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-1.5 max-h-40 overflow-y-auto">
                  {orderReceivables.map(r => (
                    <div key={r.id} className="flex justify-between text-xs text-slate-600">
                      <span>Parcela {r.installmentNumber}/{r.installmentTotal} · venc. {new Date(r.dueDate).toLocaleDateString('pt-BR')}</span>
                      <span className={cn('font-semibold', r.paidAmount > 0 ? 'text-green-600' : 'text-slate-800')}>{r.paidAmount > 0 ? `Pago: R$ ${r.paidAmount.toFixed(2).replace('.', ',')}` : `R$ ${r.amount.toFixed(2).replace('.', ',')}`}</span>
                    </div>
                  ))}
                </div>

                {/* Opções */}
                <div className="space-y-2 mb-4">
                  {[
                    { v: 'both' as const, label: 'Excluir pedido + títulos financeiros', desc: 'Remove o pedido e todos os títulos vinculados', color: 'red' },
                    { v: 'keep' as const, label: 'Excluir apenas o pedido', desc: 'Mantém os títulos financeiros com observação automática', color: 'amber' },
                  ].map(opt => (
                    <button key={opt.v} onClick={() => setFinancialAction(opt.v)}
                      className={cn(
                        'w-full text-left px-3 py-3 rounded-xl border text-sm transition-colors',
                        financialAction === opt.v
                          ? opt.color === 'red' ? 'bg-red-50 border-red-400 text-red-700' : 'bg-amber-50 border-amber-400 text-amber-800'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      )}>
                      <p className="font-semibold">{opt.label}</p>
                      <p className="text-xs opacity-70 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setDeleteStep('reason')} disabled={acting} className="flex-1 btn-secondary text-sm py-2.5">Voltar</button>
                  <button
                    onClick={() => financialAction && executeDelete(financialAction)}
                    disabled={acting || !financialAction}
                    className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2 text-sm">
                    <Trash2 className="w-4 h-4" />
                    {acting ? 'Excluindo...' : 'Confirmar Exclusão'}
                  </button>
                </div>
              </>)}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal: Registrar Entrega Parcial */}
      <AnimatePresence>
        {showDeliveryModal && (
          <>
            <motion.div key="del-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40" onClick={() => !acting && setShowDeliveryModal(false)} />
            <motion.div key="del-modal" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl p-5 pb-10 max-w-lg mx-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-900">Registrar Entrega</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{order.number} — informe as quantidades entregues</p>
                </div>
                <button onClick={() => setShowDeliveryModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
              </div>

              <div className="space-y-2 mb-5 max-h-80 overflow-y-auto pr-1">
                {order.items.map(item => {
                  const max = item.quantity
                  const current = deliveryQtys[item.productId] ?? 0
                  const pending = Math.max(0, max - current)
                  return (
                    <div key={item.productId} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{item.productName}</p>
                        <p className="text-xs text-slate-400">Pedido: {max} un · Pendente: {pending}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => setDeliveryQtys(p => ({ ...p, [item.productId]: Math.max(0, (p[item.productId] ?? 0) - 1) }))}
                          className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                        <input type="number" min={0} max={max}
                          value={deliveryQtys[item.productId] ?? 0}
                          onChange={e => setDeliveryQtys(p => ({ ...p, [item.productId]: Math.min(max, Math.max(0, Number(e.target.value))) }))}
                          className="w-12 text-center text-sm font-bold border border-slate-200 rounded-lg py-1" />
                        <button onClick={() => setDeliveryQtys(p => ({ ...p, [item.productId]: Math.min(max, (p[item.productId] ?? 0) + 1) }))}
                          className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Resumo */}
              {(() => {
                const totalPending = order.items.reduce((sum, item) => sum + Math.max(0, item.quantity - (deliveryQtys[item.productId] ?? 0)), 0)
                const allDelivered = totalPending === 0
                return (
                  <div className={cn('rounded-xl px-3 py-2.5 mb-4 text-xs font-semibold', allDelivered ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
                    {allDelivered ? '✅ Todos os itens serão marcados como entregues — pedido concluído.' : `📦 ${totalPending} unidade(s) ainda pendente(s) — status: Entrega Parcial.`}
                  </div>
                )
              })()}

              <div className="flex gap-3">
                <button onClick={() => setShowDeliveryModal(false)} disabled={acting} className="flex-1 btn-secondary">Cancelar</button>
                <button onClick={handleRegisterDelivery} disabled={acting}
                  className="flex-1 bg-primary-600 text-white font-semibold py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  {acting ? 'Salvando...' : 'Confirmar Entrega'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
