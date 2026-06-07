import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, Package, FileText, Printer, CheckCircle,
  Plus, Minus, Trash2, Edit3, X, Save, FileSpreadsheet,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useOrder, useCompanySettings } from '@/hooks/useData'
import {
  sendToSeparation, markAsSeparation, invoiceOrder,
  updateOrderAdmin, createInteraction, logAudit,
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

  const [acting, setActing] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editItems, setEditItems] = useState<OrderItem[]>([])
  const [editNotes, setEditNotes] = useState('')
  const [editPayment, setEditPayment] = useState('')
  const [showConfirm, setShowConfirm] = useState<'separation' | 'invoice' | null>(null)
  const [confirmNote, setConfirmNote] = useState('')

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

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210
    let y = 20

    // Cabeçalho
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('ITADOG SALES', W / 2, y, { align: 'center' })
    y += 8
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text('FOLHA DE SEPARAÇÃO', W / 2, y, { align: 'center' })
    y += 10

    // Info do pedido
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`Pedido: ${order.number}`, 20, y)
    doc.text(`Data: ${formatDate(order.createdAt)}`, 140, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.text(`Cliente: ${order.clientName}`, 20, y)
    y += 6
    if (order.clientCity) { doc.text(`Cidade: ${order.clientCity}`, 20, y); y += 6 }
    doc.text(`Representante: ${order.repName}`, 20, y)
    y += 10

    // Linha separadora
    doc.setDrawColor(180)
    doc.line(20, y, W - 20, y)
    y += 6

    // Cabeçalho da tabela
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('CÓD.', 20, y)
    doc.text('PRODUTO', 45, y)
    doc.text('QTD.', 160, y)
    y += 5
    doc.line(20, y, W - 20, y)
    y += 6

    // Itens — sem preços
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    for (const item of order.items) {
      if (y > 265) { doc.addPage(); y = 20 }
      const prod = item.productId.slice(0, 8).toUpperCase()
      doc.text(prod, 20, y)
      const nameText = item.attribute
        ? `${item.productName} (${item.attribute.attributeName}: ${item.attribute.valueName})`
        : item.productName
      const nameLines = doc.splitTextToSize(nameText, 110)
      doc.text(nameLines, 45, y)
      doc.text(String(item.quantity), 162, y)
      y += nameLines.length > 1 ? nameLines.length * 5 + 2 : 7
    }

    // Rodapé
    y += 10
    doc.line(20, y, W - 20, y)
    y += 8
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`Impresso em ${new Date().toLocaleString('pt-BR')} por ${user.name}`, 20, y)

    doc.save(`separacao-${order.number}.pdf`)

    // Avança status para separation
    await markAsSeparation(order.id)
    await createInteraction({ clientId: order.clientId, clientName: order.clientName, repId: user.id, repName: user.name, type: 'pedido', title: 'PDF de separação gerado', description: `Pedido ${order.number} — PDF de separação impresso`, relatedId: order.id, timestamp: new Date().toISOString() })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'print_separation_pdf', entity: 'Pedido', entityId: order.id, description: `PDF separação gerado — pedido ${order.number}`, timestamp: new Date().toISOString() })
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
    setActing(false); setShowConfirm(null); setConfirmNote(''); refetch()
  }

  const handleExportXLSX = () => {
    const rows = order.items.map(item => ({
      'Número Pedido': order.number,
      'Cliente': order.clientName,
      'Representante': order.repName,
      'Data': formatDate(order.createdAt),
      'Código Produto': item.productId.slice(0, 8).toUpperCase(),
      'Produto': item.productName,
      'Atributo': item.attribute?.attributeName ?? '',
      'Valor': item.attribute?.valueName ?? '',
      'Quantidade': item.quantity,
      'Preço Unitário (R$)': item.price,
      'Desconto (%)': item.discount,
      'Total Item (R$)': item.total,
      'Observações': order.notes ?? '',
    }))
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
                    <div className="mt-1 space-y-0.5">
                      {item.attribute && (
                        <p className="text-xs text-primary-600 font-medium">{item.attribute.attributeName}: {item.attribute.valueName}</p>
                      )}
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>{item.quantity} un × {formatCurrency(item.price)}</span>
                      {item.discount > 0 && <span className="text-green-600 font-medium">−{item.discount}% desc</span>}
                    </div>
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
              <button onClick={handlePrintSeparation}
                className="w-full bg-purple-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-purple-700 transition-colors">
                <Printer className="w-4 h-4" /> Imprimir Separação (gera PDF)
              </button>
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
    </AdminLayout>
  )
}
