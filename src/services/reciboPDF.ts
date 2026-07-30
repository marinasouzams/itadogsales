import jsPDF from 'jspdf'
import type { ProductionPayment } from '@/types'

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtMonth(m: string) {
  const [y, mo] = m.split('-')
  const months = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
  ]
  return `${months[parseInt(mo, 10) - 1]} de ${y}`
}

function fmtCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function gerarReciboPDF(payment: ProductionPayment) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = 210
  const margin = 20
  const cw = pw - 2 * margin

  // ── Cabeçalho ────────────────────────────────────────────────
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, pw, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('ITADOG', pw / 2, 11, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Recibo de Pagamento — Produção', pw / 2, 17, { align: 'center' })

  // ── Título "RECIBO" ──────────────────────────────────────────
  doc.setTextColor(30, 41, 59)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('RECIBO', pw / 2, 34, { align: 'center' })

  // Linha decorativa
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(0.8)
  doc.line(margin, 37, pw - margin, 37)

  // ── Dados do pagamento ───────────────────────────────────────
  let y = 47

  const labelW = 42
  const valueX = margin + labelW

  const row = (label: string, value: string) => {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text(label, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 41, 59)
    doc.text(value, valueX, y)
    y += 7
  }

  row('Costureira:', payment.seamstressName)
  row('Mês de Referência:', fmtMonth(payment.referenceMonth))
  if (payment.paymentDate) row('Data de Pagamento:', fmtDate(payment.paymentDate))
  if (payment.paymentMethod) row('Forma de Pagamento:', payment.paymentMethod)

  y += 3
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pw - margin, y)
  y += 8

  // ── Tabela de itens ───────────────────────────────────────────
  const items = payment.items ?? []
  if (items.length > 0) {
    const colProd = cw * 0.45
    const colQtd  = cw * 0.12
    const colUnit = cw * 0.22
    const colTot  = cw * 0.21

    // Cabeçalho da tabela
    doc.setFillColor(30, 41, 59)
    doc.rect(margin, y, cw, 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text('Produto', margin + 2, y + 5.5)
    doc.text('Qtd', margin + colProd + 1, y + 5.5)
    doc.text('Valor Unit.', margin + colProd + colQtd + 1, y + 5.5)
    doc.text('Total', margin + colProd + colQtd + colUnit + 1, y + 5.5)
    y += 8

    // Linhas
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    items.forEach((it, i) => {
      const bg = i % 2 === 0 ? 248 : 255
      doc.setFillColor(bg, bg, bg)
      doc.rect(margin, y, cw, 7, 'F')
      doc.setTextColor(30, 41, 59)
      doc.text(it.productName, margin + 2, y + 5)
      doc.text(String(it.quantity), margin + colProd + 1, y + 5)
      doc.text(fmtCurrency(it.unitValue), margin + colProd + colQtd + 1, y + 5)
      doc.text(fmtCurrency(it.totalValue), margin + colProd + colQtd + colUnit + 1, y + 5)
      y += 7
    })

    // Borda da tabela
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.3)
    doc.rect(margin, y - items.length * 7 - 8, cw, items.length * 7 + 8)

    y += 4
  }

  // ── Ajustes financeiros (acréscimos/descontos) ────────────────
  const adjustments = payment.adjustments ?? []
  if (adjustments.length > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text('Ajustes Financeiros:', margin, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    adjustments.forEach(a => {
      const sign = a.type === 'acrescimo' ? '+' : '−'
      doc.setTextColor(a.type === 'acrescimo' ? 22 : 190, a.type === 'acrescimo' ? 163 : 30, a.type === 'acrescimo' ? 74 : 30)
      doc.text(`${sign} ${fmtCurrency(a.amount)}`, margin + 2, y)
      doc.setTextColor(71, 85, 105)
      doc.text(`${a.reason}${a.notes ? ' — ' + a.notes : ''}`, margin + 32, y)
      y += 5.5
    })
    y += 2

    // Resumo: Valor Produção / Acréscimos / Descontos
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text('Valor Produção:', margin, y)
    doc.setTextColor(30, 41, 59)
    doc.text(fmtCurrency(payment.productionAmount), valueX, y)
    y += 5.5
    if (payment.totalAcrescimos > 0) {
      doc.setTextColor(100, 116, 139)
      doc.text('Acréscimos:', margin, y)
      doc.setTextColor(22, 163, 74)
      doc.text(`+ ${fmtCurrency(payment.totalAcrescimos)}`, valueX, y)
      y += 5.5
    }
    if (payment.totalDescontos > 0) {
      doc.setTextColor(100, 116, 139)
      doc.text('Descontos:', margin, y)
      doc.setTextColor(190, 30, 30)
      doc.text(`− ${fmtCurrency(payment.totalDescontos)}`, valueX, y)
      y += 5.5
    }
    y += 3
  }

  // ── Total ────────────────────────────────────────────────────
  doc.setFillColor(30, 41, 59)
  doc.rect(margin, y, cw, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TOTAL', margin + 3, y + 7)
  doc.text(fmtCurrency(payment.totalAmount), pw - margin - 2, y + 7, { align: 'right' })
  y += 18

  // ── Observações ──────────────────────────────────────────────
  if (payment.notes) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text('Observações:', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 41, 59)
    y += 5
    const noteLines = doc.splitTextToSize(payment.notes, cw)
    doc.text(noteLines, margin, y)
    y += noteLines.length * 5 + 6
  }

  // ── Assinaturas ──────────────────────────────────────────────
  const sigY = Math.max(y + 10, 230)
  const sigW = 70
  const sig1X = margin
  const sig2X = pw - margin - sigW

  doc.setDrawColor(100, 116, 139)
  doc.setLineWidth(0.5)
  doc.line(sig1X, sigY, sig1X + sigW, sigY)
  doc.line(sig2X, sigY, sig2X + sigW, sigY)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(payment.seamstressName, sig1X + sigW / 2, sigY + 5, { align: 'center' })
  doc.text('Costureira', sig1X + sigW / 2, sigY + 9, { align: 'center' })
  doc.text('ITADOG', sig2X + sigW / 2, sigY + 5, { align: 'center' })
  doc.text('Responsável', sig2X + sigW / 2, sigY + 9, { align: 'center' })

  // ── Rodapé ───────────────────────────────────────────────────
  const footerY = 287
  doc.setFontSize(7.5)
  doc.setTextColor(148, 163, 184)
  const emitDate = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  doc.text(`Emitido em ${emitDate} · ITADOG Sistema de Gestão`, pw / 2, footerY, { align: 'center' })

  const filename = `recibo-${payment.seamstressName.replace(/\s+/g, '_')}-${payment.referenceMonth}.pdf`
  doc.save(filename)
}
