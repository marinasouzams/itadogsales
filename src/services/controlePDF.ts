/**
 * PDF de Controle de Costureira — formato A4, estilo planilha manual
 */
import jsPDF from 'jspdf'
import type { Seamstress } from '@/types'

function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export function printControlePDF(
  seamstress: Seamstress,
  periodStart: string,
  periodEnd: string,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = 210
  const margin = 12

  // ── Cabeçalho ────────────────────────────────────────────
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, pw, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('ITADOG', pw / 2, 10, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Controle de Produção', pw / 2, 15, { align: 'center' })

  doc.setTextColor(30, 41, 59)

  // Info costureira
  let y = 25
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Costureira:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(seamstress.name, margin + 32, y)

  if (seamstress.phone) {
    doc.setFont('helvetica', 'bold')
    doc.text('Tel:', margin + 100, y)
    doc.setFont('helvetica', 'normal')
    doc.text(seamstress.phone, margin + 110, y)
  }

  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('Período:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`${fmtDate(periodStart)} a ${fmtDate(periodEnd)}`, margin + 32, y)

  y += 4
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pw - margin, y)
  y += 5

  // ── Tabela ───────────────────────────────────────────────
  const colWidths = [22, 52, 22, 36, 36, 0] // última = restante
  const totalFixed = colWidths.slice(0, -1).reduce((a, b) => a + b, 0)
  colWidths[colWidths.length - 1] = pw - 2 * margin - totalFixed

  const headers = ['Data', 'Produto', 'Qtd', 'Ass. Costureira', 'Ass. ITADOG', 'Observações']
  const rowH = 10
  const headerH = 8

  // Cabeçalho da tabela
  doc.setFillColor(30, 41, 59)
  doc.rect(margin, y, pw - 2 * margin, headerH, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')

  let cx = margin
  headers.forEach((h, i) => {
    doc.text(h, cx + 1, y + 5.5)
    cx += colWidths[i]
  })

  y += headerH
  doc.setTextColor(30, 41, 59)
  doc.setFont('helvetica', 'normal')

  // Linhas em branco
  const totalLines = 28
  for (let i = 0; i < totalLines; i++) {
    // Fundo alternado
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252)
      doc.rect(margin, y, pw - 2 * margin, rowH, 'F')
    }

    // Bordas das células
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.25)
    cx = margin
    colWidths.forEach(w => {
      doc.rect(cx, y, w, rowH)
      cx += w
    })

    y += rowH

    // Nova página se necessário
    if (y > 275 && i < totalLines - 1) {
      doc.addPage()
      y = 15
    }
  }

  // ── Rodapé ───────────────────────────────────────────────
  const sigY = Math.min(y + 10, 280)

  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(0.3)
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  doc.text(
    'Ambas as partes devem assinar a cada movimentação de material ou produção.',
    pw / 2, sigY, { align: 'center' }
  )

  const sigLineY = sigY + 12
  const sigW = (pw - 2 * margin - 20) / 2

  doc.setLineWidth(0.4)
  doc.setDrawColor(30, 41, 59)
  doc.line(margin, sigLineY, margin + sigW, sigLineY)
  doc.setFontSize(8)
  doc.setTextColor(30, 41, 59)
  doc.text(`Costureira: ${seamstress.name}`, margin, sigLineY + 4)

  doc.line(pw - margin - sigW, sigLineY, pw - margin, sigLineY)
  doc.text('ITADOG', pw - margin - sigW, sigLineY + 4)

  doc.save(`controle-${seamstress.name.replace(/\s+/g, '-').toLowerCase()}-${periodStart}.pdf`)
}
