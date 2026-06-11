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
  const [pdfMode, setPdfMode] = useState<'compacta' | 'comercial'>('compacta')
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _jsPDFPages = (doc: unknown) => (doc as any).internal.getNumberOfPages() as number

  const handlePrintSeparation = async () => {
    if (!user) return

    const isCompact = pdfMode === 'compacta'

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
    const sorted = [...order.items].sort((a, b) => {
      const ca = codeMap.get(a.productId) ?? ''
      const cb = codeMap.get(b.productId) ?? ''
      return ca.localeCompare(cb, 'pt-BR', { numeric: true, sensitivity: 'base' })
    })

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
    const colors = [...colorSet].sort((a, b) => a.localeCompare(b, 'pt-BR'))

    // ─── CONFIGURAÇÃO PAISAGEM A4 ────────────────────────────────
    const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const PW   = 297   // page width
    const PH   = 210   // page height
    const ML   = 5     // margin left
    const MR   = 5     // margin right
    const USE  = PW - ML - MR  // 287mm usable

    const FSZ      = isCompact ? 7.5 : 8   // font size dados
    const FSZ_HEAD = 7.5                    // font size cabeçalho tabela
    const ROW_H    = isCompact ? 4.2 : 5   // altura linha dados (mm)
    const TH_H     = 6                     // altura linha cabeçalho tabela

    // ─── CÁLCULO DE COLUNAS ──────────────────────────────────────
    const COL_CODE = 17
    const COL_QTY  = 13
    const COL_OBS  = isCompact ? 0 : 23
    const nColors  = colors.length

    // largura de cada coluna de cor: mín 11mm, máx 18mm
    const availForColors = USE - COL_CODE - COL_QTY - COL_OBS - 55  // 55mm mínimo p/ descrição
    const COL_C = nColors > 0
      ? Math.min(18, Math.max(11, availForColors / nColors))
      : 0
    const COL_DESC = Math.max(55, USE - COL_CODE - COL_QTY - COL_OBS - nColors * COL_C)

    // posições X das colunas
    const XC: number[] = []
    let cx = ML
    const X_CODE = cx; cx += COL_CODE
    const X_DESC = cx; cx += COL_DESC
    const X_QTY  = cx; cx += COL_QTY
    for (let i = 0; i < nColors; i++) { XC.push(cx); cx += COL_C }
    const X_OBS  = cx

    // ─── ESPAÇO PARA RODAPÉ ──────────────────────────────────────
    const FOOT_H  = isCompact ? 10 : 30
    const SAFE_Y  = PH - MR - FOOT_H

    let y = ML

    // totalizadores de cores (para rodapé conferência)
    const colorTotals: Record<string, number> = {}
    for (const c of colors) colorTotals[c] = 0

    // ─── CABEÇALHO DA TABELA (repetível) ────────────────────────
    const drawTH = () => {
      doc.setFillColor(30, 30, 30)
      doc.rect(ML, y, USE, TH_H, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(FSZ_HEAD)
      doc.setTextColor(255)
      const ty = y + TH_H - 1.5
      doc.text('CÓDIGO',    X_CODE + 1,  ty)
      doc.text('DESCRIÇÃO', X_DESC + 1,  ty)
      doc.text('QTDE',      X_QTY + COL_QTY - 1, ty, { align: 'right' })
      for (let i = 0; i < nColors; i++) {
        const lbl = colors[i].length > 8 ? colors[i].slice(0, 7) + '.' : colors[i]
        doc.text(lbl, XC[i] + COL_C / 2, ty, { align: 'center' })
      }
      if (!isCompact && COL_OBS > 0) doc.text('OBS', X_OBS + 1, ty)
      // linhas divisórias verticais cinza claro
      doc.setDrawColor(80)
      doc.setLineWidth(0.15)
      ;[X_DESC, X_QTY, ...XC, ...(COL_OBS > 0 ? [X_OBS] : [])].forEach(x => {
        doc.line(x, y, x, y + TH_H)
      })
      doc.setTextColor(20)
      y += TH_H
    }

    // ─── QUEBRA DE PÁGINA ────────────────────────────────────────
    const ensureSpace = (needed: number) => {
      if (y + needed > SAFE_Y) {
        const pg = _jsPDFPages(doc)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        doc.setTextColor(120)
        doc.text(`${order.number}  —  Pág. ${pg}`, PW / 2, PH - 2, { align: 'center' })
        doc.setTextColor(20)
        doc.addPage()
        y = ML
        drawTH()
      }
    }

    // ════════════════════════════════════════════════════════════
    // CABEÇALHO DO DOCUMENTO
    // ════════════════════════════════════════════════════════════
    const HDR_H = 14
    doc.setFillColor(248, 248, 248)
    doc.rect(ML, y, USE, HDR_H, 'F')
    doc.setDrawColor(180)
    doc.setLineWidth(0.3)
    doc.line(ML, y + HDR_H, PW - MR, y + HDR_H)

    // Logo
    let logoW = 0
    if (logoData) {
      try {
        const lh = HDR_H - 3
        logoW = lh * 1.9
        doc.addImage(logoData, 'PNG', ML + 1, y + 1.5, logoW, lh)
        logoW += 3
      } catch { logoW = 0 }
    }
    const hx = ML + logoW + 2

    // Título
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(20)
    doc.text('ORDEM DE SEPARAÇÃO', hx, y + 5.5)

    // Infos em linha única compacta
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(50)
    const setB = () => doc.setFont('helvetica', 'bold')
    const setN = () => doc.setFont('helvetica', 'normal')
    const hiy = y + 10.5
    let hix = hx

    const hInfo = (label: string, val: string, gap: number = 3) => {
      setB(); doc.text(label, hix, hiy); const lw = doc.getTextWidth(label)
      setN(); hix += lw + 1; doc.text(val, hix, hiy); hix += doc.getTextWidth(val) + gap
    }
    hInfo('PEDIDO:', order.number, 4)
    hInfo('CLIENTE:', order.clientName, 4)
    if (order.clientCity) hInfo('CIDADE:', order.clientCity, 4)
    hInfo('REP:', order.repName, 4)
    hInfo('DATA:', formatDate(order.createdAt), 4)
    if (order.paymentTerms) hInfo('PGTO:', order.paymentTerms, 4)

    // Obs (linha 2 cabeçalho) — só no modo comercial
    if (!isCompact && order.notes) {
      doc.setFontSize(7)
      setB(); doc.text('OBS:', ML + logoW + 2, y + HDR_H - 2.5)
      setN(); doc.setTextColor(60)
      const obsT = doc.splitTextToSize(order.notes, USE - logoW - 20)
      doc.text(obsT[0], ML + logoW + 12, y + HDR_H - 2.5)
      doc.setTextColor(50)
    }

    // Data/imp à direita
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(100)
    doc.text(`Imp: ${new Date().toLocaleDateString('pt-BR')} ${user.name.split(' ')[0]}`, PW - MR, y + 5.5, { align: 'right' })
    doc.setTextColor(20)

    y += HDR_H + 1

    // ════════════════════════════════════════════════════════════
    // TABELA
    // ════════════════════════════════════════════════════════════
    drawTH()

    doc.setFontSize(FSZ)
    doc.setLineWidth(0.1)
    doc.setDrawColor(210)

    let totalUnits = 0
    let totalSkus  = 0
    let altRow     = false

    for (const item of sorted) {
      ensureSpace(ROW_H)

      const code = codeMap.get(item.productId) ?? item.productId.slice(0, 6).toUpperCase()
      totalSkus++
      totalUnits += item.quantity

      // Mapa cor → qty deste item
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
        cqty[key] = (cqty[key] ?? 0) + item.quantity
        colorTotals[key] = (colorTotals[key] ?? 0) + item.quantity
      }

      // Fundo zebra
      if (altRow) { doc.setFillColor(246, 247, 248); doc.rect(ML, y, USE, ROW_H, 'F') }
      altRow = !altRow

      const ty2 = y + ROW_H - 1.3

      // Célula CÓDIGO
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(40)
      doc.text(code, X_CODE + 1, ty2)

      // Célula DESCRIÇÃO
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(20)
      const dname = doc.splitTextToSize(item.productName.toUpperCase(), COL_DESC - 3)
      doc.text(dname[0], X_DESC + 1, ty2)

      // Célula QTDE (direita)
      doc.setFont('helvetica', 'bold')
      doc.text(String(item.quantity), X_QTY + COL_QTY - 1, ty2, { align: 'right' })
      doc.setFont('helvetica', 'normal')

      // Células de cor
      for (let i = 0; i < nColors; i++) {
        const q = cqty[colors[i]]
        if (q) {
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(20)
          doc.text(String(q), XC[i] + COL_C - 1, ty2, { align: 'right' })
          doc.setFont('helvetica', 'normal')
        }
      }

      // Célula OBS
      if (!isCompact && COL_OBS > 0 && item.attribute && !isColorAttr(item.attribute.attributeName)) {
        doc.setFontSize(FSZ - 1)
        doc.setTextColor(80)
        doc.text(item.attribute.valueName.toUpperCase(), X_OBS + 1, ty2)
        doc.setFontSize(FSZ)
        doc.setTextColor(20)
      }

      // Linha divisória horizontal e separadores verticais
      doc.setDrawColor(215)
      doc.setLineWidth(0.1)
      doc.line(ML, y + ROW_H, PW - MR, y + ROW_H)
      ;[X_DESC, X_QTY, ...XC, ...(COL_OBS > 0 ? [X_OBS] : [])].forEach(x => {
        doc.setDrawColor(230); doc.line(x, y, x, y + ROW_H)
      })
      y += ROW_H
    }

    // ════════════════════════════════════════════════════════════
    // RODAPÉ DA ÚLTIMA PÁGINA
    // ════════════════════════════════════════════════════════════
    y += 2
    doc.setDrawColor(60)
    doc.setLineWidth(0.4)
    doc.line(ML, y, PW - MR, y)
    y += 3

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(20)
    doc.text(`SKUs: ${totalSkus}`, ML, y + 3)
    doc.text(`Unidades: ${totalUnits}`, ML + 28, y + 3)

    // Totais por cor (modo conferência)
    if (!isCompact && nColors > 0) {
      let cx2 = X_QTY
      for (const c of colors) {
        if (colorTotals[c] > 0) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.text(`${c}: ${colorTotals[c]}`, cx2, y + 3)
          cx2 += doc.getTextWidth(`${c}: ${colorTotals[c]}`) + 5
        }
      }

      // Assinaturas
      y += 10
      const sigW = (USE - 20) / 3
      const SIGS = ['SEPARAÇÃO', 'CONFERÊNCIA', 'EXPEDIÇÃO']
      doc.setDrawColor(140)
      doc.setLineWidth(0.3)
      for (let i = 0; i < 3; i++) {
        const sx = ML + i * (sigW + 10)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(40)
        doc.text(SIGS[i], sx + sigW / 2, y, { align: 'center' })
        doc.line(sx, y + 9, sx + sigW, y + 9)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        doc.setTextColor(130)
        doc.text('Nome / Assinatura / Data', sx + sigW / 2, y + 13, { align: 'center' })
        doc.setTextColor(20)
      }
    }

    // Número de página em todas as páginas
    const totalPages = _jsPDFPages(doc)
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(130)
      doc.text(
        `${order.number}  —  ${pdfMode === 'compacta' ? 'SEPARAÇÃO COMPACTA' : 'CONFERÊNCIA COMERCIAL'}  —  Pág. ${p} de ${totalPages}`,
        PW / 2, PH - 2, { align: 'center' }
      )
      doc.setTextColor(20)
    }

    doc.save(`separacao-${order.number}.pdf`)

    // Avança status e registra
    await markAsSeparation(order.id)
    await createInteraction({ clientId: order.clientId, clientName: order.clientName, repId: user.id, repName: user.name, type: 'pedido', title: 'PDF de separação gerado', description: `Pedido ${order.number} — PDF de separação impresso`, relatedId: order.id, timestamp: new Date().toISOString() })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'print_separation_pdf', entity: 'Pedido', entityId: order.id, description: `PDF separação gerado — pedido ${order.number} [${pdfMode}]`, timestamp: new Date().toISOString() })
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
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Modo do PDF</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPdfMode('compacta')}
                    className={cn(
                      'text-xs font-semibold py-2 rounded-lg border transition-colors',
                      pdfMode === 'compacta'
                        ? 'bg-purple-700 text-white border-purple-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    )}>
                    📦 Separação Compacta<br/>
                    <span className="font-normal text-[10px] opacity-80">Máx. itens por página</span>
                  </button>
                  <button
                    onClick={() => setPdfMode('comercial')}
                    className={cn(
                      'text-xs font-semibold py-2 rounded-lg border transition-colors',
                      pdfMode === 'comercial'
                        ? 'bg-purple-700 text-white border-purple-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    )}>
                    📋 Conferência Comercial<br/>
                    <span className="font-normal text-[10px] opacity-80">Com obs e assinaturas</span>
                  </button>
                </div>
                <button onClick={handlePrintSeparation}
                  className="w-full bg-purple-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-purple-700 transition-colors">
                  <Printer className="w-4 h-4" /> Gerar PDF de Separação (A4 Paisagem)
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
