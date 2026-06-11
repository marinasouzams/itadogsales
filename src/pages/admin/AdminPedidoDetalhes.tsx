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
} from '@/services/db'
import { LoadingSpinner, ErrorState } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate, cn } from '@/utils'
import { OrderStatusBadge } from '@/components/shared/StatusBadge'
import type { OrderItem } from '@/types'
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
  const [compactPDF, setCompactPDF] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteOther, setDeleteOther] = useState('')

  const DELETE_REASONS = [
    'Pedido duplicado',
    'Pedido cancelado pelo cliente',
    'Erro operacional',
    'Teste',
    'Outro',
  ]

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

  const isEditable = ['generated', 'pending_separation', 'separation'].includes(order.status)
  const canSendToSeparation = order.status === 'generated'
  const canPrintSeparation  = ['pending_separation', 'separation'].includes(order.status)
  const canInvoice          = ['pending_separation', 'separation'].includes(order.status)
  const isInvoiced          = order.status === 'invoiced_ready_to_ship'
  const isDelivered         = order.status === 'delivered'

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

  const handleSendToSeparation = async () => {
    if (!user) return
    setActing(true)
    await sendToSeparation(order.id)
    await createInteraction({ clientId: order.clientId, clientName: order.clientName, repId: user.id, repName: user.name, type: 'pedido', title: 'Pedido enviado para separação', description: `Pedido ${order.number} enviado para separação`, relatedId: order.id, timestamp: new Date().toISOString() })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'send_to_separation', entity: 'Pedido', entityId: order.id, description: `Pedido ${order.number} → pendente separação`, timestamp: new Date().toISOString() })
    setActing(false); setShowConfirm(null); refetch()
  }

  const handlePrintSeparation = async () => {
    if (!user) return

    // ─── carregar logo ───────────────────────────────────────────
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

    // ─── categorizar atributos ───────────────────────────────────
    const COR_NAMES  = new Set(['cor', 'cor/estampa', 'estampa', 'cores', 'color'])
    const TAM_NAMES  = new Set(['tamanho', 'numeração', 'numeracao', 'numero', 'número', 'grade', 'porte', 'tamanhos'])
    const attrType = (name: string): 'cor' | 'tam' | 'other' => {
      const n = name.toLowerCase()
      if (COR_NAMES.has(n)) return 'cor'
      if (TAM_NAMES.has(n)) return 'tam'
      return 'other'
    }

    // ─── ordenar itens por código ASC ───────────────────────────
    const sorted = [...order.items].sort((a, b) => {
      const ca = codeMap.get(a.productId) ?? ''
      const cb = codeMap.get(b.productId) ?? ''
      // natural sort: números antes de letras
      return ca.localeCompare(cb, 'pt-BR', { numeric: true, sensitivity: 'base' })
    })

    // ─── configuração da página ──────────────────────────────────
    const compact = compactPDF
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W  = 210
    const ML = 8
    const MR = 8
    const USE = W - ML - MR // 194mm

    // Colunas (x relativo a ML=0, depois somar ML)
    const C = compact
      ? { cod: { x: ML,      w: 18 }, prod: { x: ML+18,  w: 80 }, cor: { x: ML+98,  w: 42 }, tam: { x: ML+140, w: 28 }, qtd: { x: ML+168, w: 18 }, obs: null }
      : { cod: { x: ML,      w: 18 }, prod: { x: ML+18,  w: 72 }, cor: { x: ML+90,  w: 40 }, tam: { x: ML+130, w: 24 }, qtd: { x: ML+154, w: 14 }, obs: { x: ML+168, w: 26 } }

    const ROW_H  = 5      // altura linha dados (mm)
    const HEAD_H = 5.5    // altura linha cabeçalho tabela

    // Reserva para rodapé
    const FOOTER_H = compact ? 14 : 38
    const PAGE_H   = 297
    const SAFE_MAX = PAGE_H - MR - FOOTER_H

    let y = ML
    let isFirstPage = true

    // ─── cabeçalho da tabela (repetido a cada página) ───────────
    const drawTableHeader = () => {
      doc.setFillColor(235, 235, 235)
      doc.rect(ML, y, USE, HEAD_H, 'F')
      doc.setDrawColor(160)
      doc.setLineWidth(0.2)
      doc.rect(ML, y, USE, HEAD_H)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(30)
      doc.text('CÓDIGO',        C.cod.x  + 1, y + 3.7)
      doc.text('PRODUTO',       C.prod.x + 1, y + 3.7)
      doc.text('COR / ESTAMPA', C.cor.x  + 1, y + 3.7)
      doc.text('TAMANHO',       C.tam.x  + 1, y + 3.7)
      doc.text('QTD',           C.qtd.x  + C.qtd.w - 1, y + 3.7, { align: 'right' })
      if (C.obs) doc.text('OBS', C.obs.x + 1, y + 3.7)
      y += HEAD_H
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(20)
    }

    // ─── verificação de quebra de página ────────────────────────
    const ensureSpace = (needed: number) => {
      if (y + needed > SAFE_MAX) {
        // rodapé de página
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(140)
        const pg = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages()
        doc.text(`Página ${pg}`, W / 2, PAGE_H - 5, { align: 'center' })
        doc.text(`${order.number}`, W - MR, PAGE_H - 5, { align: 'right' })
        doc.setTextColor(20)
        doc.addPage()
        y = ML
        isFirstPage = false
        drawTableHeader()
      }
    }

    // ═══════════════════════════════════════════════════════════
    // CABEÇALHO DO DOCUMENTO
    // ═══════════════════════════════════════════════════════════
    // Logo + título
    const LOGO_H = 10
    if (logoData) {
      try { doc.addImage(logoData, 'PNG', ML, y, LOGO_H * 1.6, LOGO_H) } catch { /* skip */ }
    }
    const titleX = logoData ? ML + LOGO_H * 1.6 + 4 : ML
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(20)
    doc.text('FOLHA DE SEPARAÇÃO', titleX, y + 4.5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(80)
    doc.text('ITADOG SALES — DOCUMENTO OPERACIONAL', titleX, y + 9)
    doc.setTextColor(20)

    // Número do pedido (direita)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(order.number, W - MR, y + 4.5, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(80)
    doc.text(formatDate(order.createdAt), W - MR, y + 9, { align: 'right' })
    doc.setTextColor(20)

    y += LOGO_H + 3

    // Linha info 1: Cliente | Cidade | Rep
    doc.setFontSize(8.5)
    const infoH = 4.5
    const bold  = (t: string, x: number, yy: number) => { doc.setFont('helvetica','bold'); doc.text(t, x, yy); doc.setFont('helvetica','normal') }

    bold('Cliente:', ML, y + infoH)
    doc.text(order.clientName, ML + 14, y + infoH)

    bold('Cidade:', ML + 90, y + infoH)
    doc.text(order.clientCity ?? '—', ML + 102, y + infoH)

    bold('Rep:', ML + 158, y + infoH)
    doc.text(order.repName, ML + 166, y + infoH)
    y += infoH + 1.5

    // Linha info 2: Pgto | Entrega
    bold('Pgto:', ML, y + infoH)
    doc.text(order.paymentTerms ?? '—', ML + 12, y + infoH)

    if (order.deliveryDate) {
      bold('Entrega:', ML + 90, y + infoH)
      doc.text(formatDate(order.deliveryDate), ML + 103, y + infoH)
    }

    bold('Imp:', ML + 158, y + infoH)
    doc.setFontSize(7.5)
    doc.setTextColor(80)
    doc.text(`${new Date().toLocaleDateString('pt-BR')} ${user.name.split(' ')[0]}`, ML + 166, y + infoH)
    doc.setTextColor(20)
    doc.setFontSize(8.5)
    y += infoH + 1.5

    // Obs (se existir e não compacto)
    if (!compact && order.notes) {
      bold('Obs:', ML, y + infoH)
      const obsLines = doc.splitTextToSize(order.notes, USE - 12)
      doc.text(obsLines, ML + 9, y + infoH)
      y += Math.max(infoH, obsLines.length * 3.8) + 1
    }

    // Separador
    doc.setDrawColor(80)
    doc.setLineWidth(0.5)
    doc.line(ML, y, W - MR, y)
    y += 2

    // ═══════════════════════════════════════════════════════════
    // TABELA
    // ═══════════════════════════════════════════════════════════
    drawTableHeader()

    doc.setLineWidth(0.15)
    doc.setDrawColor(200)
    doc.setFontSize(8.5)

    let totalUnits = 0
    let totalSkus  = 0
    let altRow     = false

    for (const item of sorted) {
      const code = codeMap.get(item.productId) ?? item.productId.slice(0, 8).toUpperCase()
      totalUnits += item.quantity
      totalSkus++

      if (item.variants && item.variants.length > 0) {
        // ── PRODUTO COM VARIANTES ──
        // Linha de cabeçalho do produto (negrito, fundo levemente cinza)
        ensureSpace(ROW_H * 2)
        doc.setFillColor(248, 248, 248)
        doc.rect(ML, y, USE, ROW_H + 0.5, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.text(code, C.cod.x + 1, y + ROW_H - 1)
        const pname = doc.splitTextToSize(item.productName.toUpperCase(), C.prod.w - 3)
        doc.text(pname[0], C.prod.x + 1, y + ROW_H - 1)
        // Total à direita alinhado
        doc.text('Total:', C.cor.x + 1, y + ROW_H - 1)
        doc.text(String(item.quantity), C.qtd.x + C.qtd.w - 1, y + ROW_H - 1, { align: 'right' })
        doc.setDrawColor(160); doc.line(ML, y + ROW_H + 0.5, W - MR, y + ROW_H + 0.5); doc.setDrawColor(200)
        y += ROW_H + 1
        altRow = false

        // Linhas de variantes
        doc.setFont('helvetica', 'normal')
        for (const v of item.variants) {
          ensureSpace(ROW_H)
          if (altRow) { doc.setFillColor(250,250,250); doc.rect(ML, y, USE, ROW_H, 'F') }
          altRow = !altRow

          const vType = attrType(v.attributeName)
          const corTxt = vType === 'cor' || vType === 'other' ? v.valueName.toUpperCase() : ''
          const tamTxt = vType === 'tam' ? v.valueName.toUpperCase() : ''

          doc.setTextColor(120)
          doc.text('', C.cod.x + 1, y + ROW_H - 1)
          doc.setTextColor(20)
          doc.text('  › ' + v.valueName, C.prod.x + 1, y + ROW_H - 1)
          if (corTxt) doc.text(corTxt, C.cor.x + 1, y + ROW_H - 1)
          if (tamTxt) doc.text(tamTxt, C.tam.x + 1, y + ROW_H - 1)
          doc.text(String(v.qty), C.qtd.x + C.qtd.w - 1, y + ROW_H - 1, { align: 'right' })
          doc.line(ML, y + ROW_H, W - MR, y + ROW_H)
          y += ROW_H
        }
        y += 1.5 // espaço entre produtos

      } else {
        // ── PRODUTO SIMPLES ──
        ensureSpace(ROW_H)
        if (altRow) { doc.setFillColor(250,250,250); doc.rect(ML, y, USE, ROW_H, 'F') }
        altRow = !altRow

        doc.setFont('helvetica', 'normal')
        const corTxt = item.attribute && attrType(item.attribute.attributeName) === 'cor'
          ? item.attribute.valueName.toUpperCase() : ''
        const tamTxt = item.attribute && attrType(item.attribute.attributeName) === 'tam'
          ? item.attribute.valueName.toUpperCase() : ''
        const otherTxt = item.attribute && attrType(item.attribute.attributeName) === 'other'
          ? item.attribute.valueName.toUpperCase() : ''

        const pname = doc.splitTextToSize(item.productName.toUpperCase(), C.prod.w - 3)
        doc.text(code,     C.cod.x  + 1, y + ROW_H - 1)
        doc.text(pname[0], C.prod.x + 1, y + ROW_H - 1)
        doc.text(corTxt || otherTxt, C.cor.x + 1, y + ROW_H - 1)
        doc.text(tamTxt, C.tam.x + 1, y + ROW_H - 1)
        doc.text(String(item.quantity), C.qtd.x + C.qtd.w - 1, y + ROW_H - 1, { align: 'right' })
        doc.line(ML, y + ROW_H, W - MR, y + ROW_H)
        y += ROW_H
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RODAPÉ
    // ═══════════════════════════════════════════════════════════
    y += 4
    doc.setDrawColor(60)
    doc.setLineWidth(0.4)
    doc.line(ML, y, W - MR, y)
    y += 4

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(20)
    doc.text(`SKUs: ${totalSkus}`, ML, y + 3)
    doc.text(`Unidades totais: ${totalUnits}`, ML + 30, y + 3)
    doc.text(`Volumes: ____`, ML + 100, y + 3)
    doc.text(`Pedido: ${order.number}`, W - MR, y + 3, { align: 'right' })
    y += 8

    if (!compact) {
      // ── ÁREA DE ASSINATURAS ──
      doc.setDrawColor(160)
      doc.setLineWidth(0.3)
      y += 4
      const sigW  = (USE - 16) / 3
      const SIGS = ['SEPARAÇÃO', 'CONFERÊNCIA', 'EXPEDIÇÃO']
      for (let i = 0; i < 3; i++) {
        const sx = ML + i * (sigW + 8)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(40)
        doc.text(SIGS[i], sx + sigW / 2, y, { align: 'center' })
        // linha de assinatura
        doc.line(sx, y + 10, sx + sigW, y + 10)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        doc.setTextColor(140)
        doc.text('Nome / Data', sx + sigW / 2, y + 14, { align: 'center' })
        doc.setTextColor(20)
      }
    }

    // número de página final
    const totalPages = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(140)
      if (totalPages > 1) {
        doc.text(`Página ${p} de ${totalPages}`, W / 2, PAGE_H - 3, { align: 'center' })
      }
      doc.setTextColor(20)
    }

    doc.save(`separacao-${order.number}.pdf`)

    // Avança status e registra
    await markAsSeparation(order.id)
    await createInteraction({ clientId: order.clientId, clientName: order.clientName, repId: user.id, repName: user.name, type: 'pedido', title: 'PDF de separação gerado', description: `Pedido ${order.number} — PDF de separação impresso`, relatedId: order.id, timestamp: new Date().toISOString() })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'print_separation_pdf', entity: 'Pedido', entityId: order.id, description: `PDF separação gerado — pedido ${order.number} ${compact ? '(compacto)' : ''}`, timestamp: new Date().toISOString() })
    refetch()
  }

  const handleInvoice = async () => {
    if (!user) return
    setActing(true)
    const commRate = settings?.defaultCommissionRate ?? 3
    await invoiceOrder(order, user.name, commRate)
    // Notificação ao representante via interação
    await createInteraction({ clientId: order.clientId, clientName: order.clientName, repId: order.repId, repName: order.repName, type: 'pedido', title: `Pedido nº ${order.number} faturado`, description: `Seu pedido nº ${order.number} foi faturado e está pronto para envio.`, relatedId: order.id, timestamp: new Date().toISOString() })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'invoice_ready_to_ship', entity: 'Pedido', entityId: order.id, description: `Pedido ${order.number} faturado por ${user.name}`, timestamp: new Date().toISOString() })
    // Gerar recebíveis automaticamente
    try {
      const { generateReceivables } = await import('@/services/db')
      await generateReceivables(order)
    } catch { /* silencioso — não travar o fluxo */ }
    setActing(false); setShowConfirm(null); setConfirmNote(''); refetch()
  }

  const handleSoftDelete = async () => {
    if (!user) return
    const reason = deleteReason === 'Outro' ? deleteOther.trim() : deleteReason
    if (!reason) return
    setActing(true)
    try {
      await softDeleteOrder(order.id, user.name, reason, order.status)
      await logAudit({
        userId: user.id, userName: user.name, userRole: user.role,
        action: 'delete_order', entity: 'Pedido', entityId: order.id,
        description: `Pedido ${order.number} excluído (soft). Status: ${order.status}. Motivo: ${reason}`,
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
              onClick={() => { setDeleteReason(''); setDeleteOther(''); setShowDeleteModal(true) }}
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
            {order.paymentTerms && <div><p className="text-xs text-slate-400">Pagamento</p><p className="font-medium text-slate-700">{order.paymentTerms}</p></div>}
            {order.invoicedAt && <div><p className="text-xs text-slate-400">Faturado em</p><p className="font-medium text-slate-700">{formatDate(order.invoicedAt)} · {order.invoicedBy}</p></div>}
            {order.deliveredAt && <div><p className="text-xs text-slate-400">Entregue em</p><p className="font-medium text-slate-700">{formatDate(order.deliveredAt)} · {order.deliveredBy}</p></div>}
            {order.generatedAt && <div><p className="text-xs text-slate-400">Gerado em</p><p className="font-medium text-slate-700">{formatDate(order.generatedAt)} · {order.generatedBy}</p></div>}
          </div>
        </div>

        {/* Itens */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">Produtos ({items.length})</p>
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
        </div>

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
              <span>Desconto</span><span>−{formatCurrency(order.discount)}</span>
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
            <button onClick={() => setEditMode(false)} className="flex-1 btn-secondary">Cancelar</button>
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
            {canPrintSeparation && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={compactPDF}
                    onChange={e => setCompactPDF(e.target.checked)}
                    className="accent-purple-600"
                  />
                  <span>PDF Compacto — máximo de itens por página (remove obs e assinaturas)</span>
                </label>
                <button onClick={handlePrintSeparation}
                  className="w-full bg-purple-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-purple-700 transition-colors">
                  <Printer className="w-4 h-4" /> Imprimir Separação (gera PDF)
                </button>
              </div>
            )}
            {canInvoice && (
              <button onClick={() => setShowConfirm('invoice')}
                className={cn('w-full bg-green-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-green-700 transition-colors')}>
                <CheckCircle className="w-4 h-4" /> Faturar e Pronto para Envio
              </button>
            )}
            {(isInvoiced || isDelivered) && (
              <div className={cn('rounded-2xl p-4 flex items-center gap-3', isDelivered ? 'bg-slate-100 text-slate-600' : 'bg-green-50 text-green-700 border border-green-200')}>
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">{isDelivered ? 'Pedido encerrado — entregue ao cliente.' : 'Faturado — aguardando confirmação de entrega pelo representante.'}</p>
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
              onClick={() => setShowDeleteModal(false)}
            />
            <motion.div
              key="delete-modal"
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl p-5 pb-10 max-w-lg mx-auto">
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
                <button onClick={() => setShowDeleteModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                O pedido <strong>não será deletado</strong> do banco de dados — ficará oculto da operação e pode ser restaurado a qualquer momento.
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
                onClick={handleSoftDelete}
                disabled={acting || !deleteReason || (deleteReason === 'Outro' && !deleteOther.trim())}
                className="w-full bg-red-600 text-white font-semibold py-3 rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                <Trash2 className="w-4 h-4" />
                {acting ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
