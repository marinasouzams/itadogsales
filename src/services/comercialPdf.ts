import jsPDF from 'jspdf'
import { formatDate } from '@/utils'
import { saleDateOf, financialBaseDate } from '@/types'
import type { Order, Product } from '@/types'

// ══════════════════════════════════════════════════════════════════
// PDF COMERCIAL — documento oficial do pedido para envio ao cliente.
// Reutilizado em todas as telas (admin/rep · lista/detalhe) como
// "segunda via" permanente, independente do status do pedido.
// Layout idêntico ao anterior — NÃO alterar sem revalidar renderização.
// ══════════════════════════════════════════════════════════════════
export async function printComercialPdf(order: Order, products: Product[]): Promise<void> {
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
  } catch { /* sem logo */ }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PW  = 210
  const PH  = 297
  const ML  = 12
  const MR  = 12
  const USE = PW - ML - MR   // 186mm
  const numPages = () => doc.getNumberOfPages()

  // ─── paleta ITADOG (Clean Moderno — V3) ──────────────────────
  const BLUE    = [30, 80, 200] as const   // azul institucional
  const NAVYBG  = [22, 50, 100] as const   // rodapé
  const LBLUE   = [213, 225, 248] as const // borda azul pálida
  const BLBG    = [240, 245, 255] as const // fundo azul ghostly

  // ─── utilidades ──────────────────────────────────────────────
  const fmtBRL = (v: number) =>
    'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const addDate = (base: string, days: number): string => {
    // 'YYYY-MM-DD' → meia-noite LOCAL (evita off-by-one de fuso ao somar dias)
    const d = new Date(base.length <= 10 ? base + 'T00:00:00' : base)
    d.setDate(d.getDate() + days)
    return d.toLocaleDateString('pt-BR')
  }
  const parseInstallDays = (terms: string): number[] => {
    if (!terms) return []
    const lower = terms.toLowerCase()
    if (lower.includes('vista') || lower.includes('avista')) return []
    const nums = terms.match(/\d+/g)
    if (!nums) return []
    return nums.map(Number).filter(n => n > 0 && n <= 365)
  }

  const installDays  = parseInstallDays(order.paymentTerms ?? '')
  const nInstall     = installDays.length
  const installValue = nInstall > 0 ? order.total / nInstall : 0

  // Cheques (quando forma de pagamento = Cheque)
  const checks = order.paymentMethod === 'Cheque'
    ? (order.checks ?? []).filter(c => c.compensationDate && (Number(c.amount) || 0) > 0)
    : []
  const usingChecks = checks.length > 0

  // ─── CABEÇALHO — branco limpo com acento azul ────────────────
  const HDR_H = 20
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, PW, HDR_H, 'F')
  // Linha inferior azul forte
  doc.setFillColor(...BLUE); doc.rect(0, HDR_H - 2, PW, 2, 'F')

  // Logo
  if (logoData) {
    try {
      const lh = HDR_H - 4
      const lw = lh * (300 / 80)
      doc.addImage(logoData, 'PNG', ML, 2, lw, lh)
    } catch { /* fallback */ }
  }
  if (!logoData) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...BLUE)
    doc.text('ITADOG', ML, HDR_H / 2 + 2)
  }

  // Badge número do pedido (canto direito)
  const badgeW = 54, badgeH = 12
  doc.setFillColor(...BLBG)
  doc.rect(PW - MR - badgeW, 4, badgeW, badgeH, 'F')
  doc.setDrawColor(...LBLUE); doc.setLineWidth(0.3)
  doc.rect(PW - MR - badgeW, 4, badgeW, badgeH, 'S')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLUE)
  doc.text('PEDIDO COMERCIAL', PW - MR - badgeW / 2, 9.5, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(80, 80, 80)
  doc.text(order.number, PW - MR - badgeW / 2, 13.5, { align: 'center' })

  let y = HDR_H + 4

  // ─── BLOCO CLIENTE ───────────────────────────────────────────
  const BLK_H = 22
  doc.setFillColor(...BLBG); doc.rect(ML, y, USE, BLK_H, 'F')
  doc.setDrawColor(...LBLUE); doc.setLineWidth(0.3)
  doc.rect(ML, y, USE, BLK_H, 'S')

  const lbl = (label: string, val: string, lx: number, ly: number) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.8); doc.setTextColor(...BLUE)
    doc.text(label, lx, ly)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(18, 18, 18)
    doc.text(val || '—', lx, ly + 4.2)
  }
  const c1 = ML + 4, c2 = ML + USE * 0.42, c3 = ML + USE * 0.70
  lbl('CLIENTE / RAZÃO SOCIAL', order.clientName, c1, y + 6)
  lbl('CIDADE', order.clientCity ?? '', c1, y + 15.5)
  lbl('REPRESENTANTE', order.repName, c2, y + 6)
  lbl('FORMA DE PAGAMENTO', order.paymentMethod ?? 'A combinar', c2, y + 15.5)
  lbl('CONDIÇÃO DE PAGAMENTO', order.paymentTerms ?? '—', c3, y + 6)
  lbl('DATA DA VENDA', formatDate(saleDateOf(order)), c3, y + 15.5)

  y += BLK_H + 5

  // ─── TABELA DE PRODUTOS ──────────────────────────────────────
  // Colunas: CÓDIGO | PRODUTO | QTDE | UNITÁRIO | TOTAL
  // (variação/cor NÃO aparecem no PDF comercial — apenas na separação)
  const TH_H  = 6.5
  const ROW_H = 5
  const PAD   = 1.8
  const LINE_H = 7.5 * 0.352   // altura de uma linha de texto do nome

  // mapa productId → código real
  const comCodeMap = new Map<string, string>()
  for (const p of products) comCodeMap.set(p.id, p.code ?? p.id.slice(0, 6).toUpperCase())

  const C_CODE = 22
  const C_QTY  = 14
  const C_UNIT = 28
  const C_TOT  = 30
  const C_PROD = USE - C_CODE - C_QTY - C_UNIT - C_TOT

  const X_CODE = ML
  const X_PROD = X_CODE + C_CODE
  const X_QTY  = X_PROD + C_PROD
  const X_UNIT = X_QTY  + C_QTY
  const X_TOT  = X_UNIT + C_UNIT
  const X_END  = X_TOT  + C_TOT

  // Reserva mínima no rodapé: só a barra de rodapé (8mm) + folga.
  // O resumo financeiro quebra de página por conta própria (ensureSimple),
  // então a tabela pode ocupar quase toda a página sem quebras prematuras.
  const SAFE_Y = PH - 14

  const drawTableHeader = () => {
    doc.setFillColor(...BLUE); doc.rect(ML, y, USE, TH_H, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(255, 255, 255)
    const ty = y + TH_H / 2 + 7 * 0.18
    doc.text('CODIGO',  X_CODE + PAD, ty)
    doc.text('PRODUTO', X_PROD + PAD, ty)
    doc.text('QT',      X_QTY  + C_QTY  - PAD, ty, { align: 'right' })
    doc.text('UNIT',    X_UNIT + C_UNIT - PAD, ty, { align: 'right' })
    doc.text('TOTAL',   X_TOT  + C_TOT  - PAD, ty, { align: 'right' })
    doc.setDrawColor(60, 100, 200); doc.setLineWidth(0.15)
    ;[X_PROD, X_QTY, X_UNIT, X_TOT, X_END].forEach(x => doc.line(x, y, x, y + TH_H))
    y += TH_H
  }

  const drawRowBorders = (rowY: number, rh: number) => {
    doc.setDrawColor(...LBLUE); doc.setLineWidth(0.12)
    doc.line(ML, rowY, ML, rowY + rh)
    ;[X_PROD, X_QTY, X_UNIT, X_TOT, X_END].forEach(x => doc.line(x, rowY, x, rowY + rh))
    doc.line(ML, rowY + rh, X_END, rowY + rh)
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > SAFE_Y) {
      const pg = numPages()
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(180, 200, 240)
      doc.setFillColor(...NAVYBG); doc.rect(0, PH - 8, PW, 8, 'F')
      doc.text(`${order.number}  |  PEDIDO COMERCIAL ITADOG SALES  |  Pag. ${pg}`, PW / 2, PH - 2.5, { align: 'center' })
      doc.addPage()
      y = 10
      drawTableHeader()
    }
  }

  drawTableHeader()

  let altRow = false

  // Uma linha por produto — quantidade agregada (sem detalhar variações)
  for (const item of order.items) {
    const isKit = item.kitCount != null
    const qty = isKit ? (item.billedQuantity ?? item.quantity) : item.quantity
    const code = comCodeMap.get(item.productId) ?? item.productId.slice(0, 6).toUpperCase()

    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
    const prodLines = doc.splitTextToSize(item.productName.toUpperCase(), C_PROD - PAD * 2)
    const kitExtraH = isKit ? 4 : 0
    const rh = Math.max(ROW_H, prodLines.length * LINE_H + PAD * 1.5 + kitExtraH)

    ensureSpace(rh)

    if (altRow) { doc.setFillColor(...BLBG); doc.rect(ML, y, USE, rh, 'F') }
    else        { doc.setFillColor(255, 255, 255); doc.rect(ML, y, USE, rh, 'F') }
    altRow = !altRow

    const midY = y + rh / 2 + 7.5 * 0.18
    const nameTopY = y + LINE_H + PAD * 0.8

    // Código
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLUE)
    doc.text(code, X_CODE + PAD, nameTopY)

    // Produto (+ nota de kit promocional)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(20)
    doc.text(prodLines, X_PROD + PAD, nameTopY, { lineHeightFactor: 1.15 })
    if (isKit) {
      const kitNoteY = nameTopY + prodLines.length * (LINE_H + 0.5) + 1
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(200, 80, 0)
      doc.text(`Promocao: Pague ${item.kitPaidQty} e leve ${item.kitDeliveredQty}`, X_PROD + PAD, kitNoteY)
      doc.setTextColor(20)
    }

    // Qtde — destaque em azul
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLUE)
    doc.text(String(qty), X_QTY + C_QTY - PAD, midY, { align: 'right' })

    // Preço unitário (+ desconto)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(80)
    doc.text(fmtBRL(item.price), X_UNIT + C_UNIT - PAD, midY, { align: 'right' })
    if (item.discount > 0) {
      doc.setFontSize(6); doc.setTextColor(34, 130, 70)
      doc.text(`-${item.discount}%`, X_UNIT + C_UNIT - PAD, midY + 3, { align: 'right' })
    }

    // Total da linha
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(20)
    doc.text(fmtBRL(item.total), X_TOT + C_TOT - PAD, midY, { align: 'right' })

    drawRowBorders(y, rh)
    y += rh
  }

  y += 4

  // ─── RESUMO FINANCEIRO ────────────────────────────────────────
  const ensureSimple = (needed: number) => {
    if (y + needed > PH - MR - 8) { doc.addPage(); y = 10 }
  }
  // Mantém resumo financeiro + parcelamento juntos na MESMA página:
  // reserva a altura do bloco inteiro e, se não couber no rodapé da página
  // atual, leva tudo de uma vez para a próxima (evita parcelamento sozinho
  // numa folha quase vazia).
  const PAY_H = usingChecks ? 23 + checks.length * 6 : (nInstall > 0 ? 23 + nInstall * 6 : 14)
  const finBlockH = 9 + (order.discount > 0 ? 9 : 0) + 13 + PAY_H + 4
  ensureSimple(finBlockH)

  const FIN_W = X_END - X_UNIT + 4

  // Subtotal (sempre visível)
  doc.setFillColor(...BLBG); doc.rect(X_UNIT - 4, y, FIN_W, 8, 'F')
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60)
  doc.text('Subtotal', X_UNIT, y + 5.5)
  doc.text(fmtBRL(order.subtotal), X_END, y + 5.5, { align: 'right' })
  y += 9

  // Desconto (só se houver)
  if (order.discount > 0) {
    doc.setFillColor(...BLBG); doc.rect(X_UNIT - 4, y, FIN_W, 8, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    const discLabel = order.discountType === 'percent' && order.discountValue
      ? `Desconto (${order.discountValue}%)`
      : 'Desconto'
    doc.setTextColor(34, 130, 70)
    doc.text(discLabel, X_UNIT, y + 5.5)
    doc.text(`- ${fmtBRL(order.discount)}`, X_END, y + 5.5, { align: 'right' })
    y += 9
  }

  // Barra TOTAL — azul institucional
  doc.setFillColor(...BLUE); doc.rect(X_UNIT - 4, y, FIN_W, 11, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255)
  doc.text('TOTAL', X_UNIT, y + 7.5)
  doc.text(fmtBRL(order.total), X_END, y + 7.5, { align: 'right' })
  y += 13

  // ─── PARCELAMENTO ─────────────────────────────────────────────
  // (altura PAY_H já reservada junto do resumo financeiro acima)
  doc.setFillColor(...BLBG); doc.rect(ML, y, USE, PAY_H, 'F')
  doc.setDrawColor(...LBLUE); doc.setLineWidth(0.3)
  doc.rect(ML, y, USE, PAY_H, 'S')
  // barra lateral azul
  doc.setFillColor(...BLUE); doc.rect(ML, y, 2.5, PAY_H, 'F')

  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...BLUE)
  doc.text(usingChecks ? 'PAGAMENTO EM CHEQUE' : 'CONDICOES DE PAGAMENTO', ML + 6, y + 5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(20)
  const condLabel = usingChecks ? `Cheque · ${checks.length} cheque(s)` : (order.paymentTerms ?? 'A combinar')
  doc.text(order.deliveryDate ? `${condLabel}   ·   Entrega: ${formatDate(order.deliveryDate)}` : condLabel, ML + 6, y + 12)

  if (usingChecks) {
    y += 16
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(80)
    doc.text('CHEQUE', ML + 6, y)
    doc.text('COMPENSACAO', ML + 44, y)
    doc.text('VALOR', ML + 97, y)
    y += 1
    doc.setDrawColor(...LBLUE); doc.setLineWidth(0.3)
    doc.line(ML + 6, y, ML + 130, y)
    y += 4
    for (let p = 0; p < checks.length; p++) {
      const c = checks[p]
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(20)
      doc.text(`${String(p + 1).padStart(2, '0')}${c.number ? ' (nº ' + c.number + ')' : ''}`, ML + 6, y)
      doc.text(formatDate(c.compensationDate), ML + 44, y)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...BLUE)
      doc.text(fmtBRL(Number(c.amount) || 0), ML + 97, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(20)
      y += 6
    }
  } else if (nInstall > 0) {
    y += 16
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(80)
    doc.text('PARCELA', ML + 6, y)
    doc.text('VENCIMENTO', ML + 44, y)
    doc.text('VALOR', ML + 97, y)
    y += 1
    doc.setDrawColor(...LBLUE); doc.setLineWidth(0.3)
    doc.line(ML + 6, y, ML + 130, y)
    y += 4

    for (let p = 0; p < nInstall; p++) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(20)
      doc.text(`${p + 1}a parcela`, ML + 6, y)
      doc.text(addDate(financialBaseDate(order), installDays[p]), ML + 44, y)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...BLUE)
      doc.text(fmtBRL(installValue), ML + 97, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(20)
      y += 6
    }
  } else {
    y += PAY_H
  }

  y += 4

  // ─── PAGAMENTO PARCIAL (quando existir) ───────────────────────
  if (order.partialPaymentAmount && order.partialPaymentAmount > 0) {
    ensureSimple(22)
    const PPAR_H = 20
    doc.setFillColor(255, 251, 235); doc.rect(ML, y, USE, PPAR_H, 'F')
    doc.setDrawColor(217, 119, 6); doc.setLineWidth(0.3); doc.rect(ML, y, USE, PPAR_H, 'S')
    doc.setFillColor(217, 119, 6); doc.rect(ML, y, 2.5, PPAR_H, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(180, 83, 9)
    doc.text('PAGAMENTO PARCIAL REGISTRADO', ML + 6, y + 5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(20)
    doc.text(`Valor pago: ${fmtBRL(order.partialPaymentAmount)}`, ML + 6, y + 12)
    const saldo = order.total - order.partialPaymentAmount
    doc.setFont('helvetica', 'bold'); doc.setTextColor(180, 83, 9)
    doc.text(`Saldo restante: ${fmtBRL(saldo)}`, ML + 80, y + 12)
    y += PPAR_H + 6
  }

  // ─── OBSERVAÇÕES ──────────────────────────────────────────────
  if (order.notes) {
    ensureSimple(20)
    // Separador
    doc.setFillColor(...BLUE); doc.rect(ML, y, USE, 0.8, 'F')
    y += 5
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...BLUE)
    doc.text('OBSERVACOES', ML, y)
    y += 4
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(40)
    const obsLines = doc.splitTextToSize(order.notes, USE)
    doc.text(obsLines, ML, y)
    y += obsLines.length * 4.5 + 4
  }

  // ─── RODAPÉ azul escuro (todas as páginas) ────────────────────
  const totalPages = numPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFillColor(...NAVYBG); doc.rect(0, PH - 8, PW, 8, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(180, 200, 240)
    doc.text(
      `${order.number}  |  PEDIDO COMERCIAL ITADOG SALES  |  ${formatDate(saleDateOf(order))}  |  Pag. ${p} de ${totalPages}`,
      PW / 2, PH - 2.5, { align: 'center' }
    )
  }

  doc.save(`pedido-comercial-${order.number}.pdf`)
}
