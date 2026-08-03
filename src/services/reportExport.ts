/**
 * Central de Exportações — ITADOG Sales
 * Excel profissional com xlsx-js-style + PDF via HTML print
 */
// @ts-ignore – xlsx-js-style doesn't ship its own types but is API-compatible with xlsx
import XLSXStyle from 'xlsx-js-style'
import type { OrderStatus } from '@/types'

// ── Brand colors — paleta oficial ITADOG (tailwind.config.js: primary) ──
const NAVY   = '082956' // primary-600 — cor principal ITADOG
const BLUE   = '1A4E9A' // primary-500
const WHITE  = 'FFFFFF'
const SLATE  = 'C5D8F0' // primary-100
const PALE   = 'EAF0F8' // primary-50

// ── Style builders ───────────────────────────────────────────
type CellBorder = { style: 'thin' | 'medium'; color: { rgb: string } }
type BorderSet  = { top: CellBorder; bottom: CellBorder; left: CellBorder; right: CellBorder }

const border = (color = SLATE, bottom?: 'medium'): BorderSet => ({
  top:    { style: 'thin',   color: { rgb: color } },
  bottom: { style: bottom ?? 'thin', color: { rgb: color } },
  left:   { style: 'thin',   color: { rgb: color } },
  right:  { style: 'thin',   color: { rgb: color } },
})

const s = (fill: string, fontColor: string, bold = false, sz = 10, align = 'left') => ({
  fill: { patternType: 'solid', fgColor: { rgb: fill } },
  font: { bold, color: { rgb: fontColor }, sz, name: 'Calibri' },
  alignment: { horizontal: align, vertical: 'center', wrapText: false },
  border: border(fill === WHITE || fill === PALE ? SLATE : BLUE, bold ? 'medium' : undefined),
})

const S_TITLE    = s(NAVY,  WHITE, true,  15, 'center')
const S_META     = s(BLUE,  'CBD5E1', false, 9,  'center')
const S_HEADER   = s(BLUE,  WHITE, true,  10, 'center')
const S_EVEN     = s(WHITE, '1E293B', false, 9)
const S_ODD      = s(PALE,  '1E293B', false, 9)
const S_RED      = s('FEF2F2', 'DC2626', true,  9)
const S_AMBER    = s('FFFBEB', '92400E', false, 9)
const S_GREEN    = s('F0FDF4', '166534', false, 9)

// ── Column definition ────────────────────────────────────────
export interface XCol {
  header: string
  key: string
  width?: number             // chars (approx)
  numFmt?: string            // Excel number format
  align?: 'left' | 'center' | 'right'
  red?:   (val: unknown, row: Record<string, unknown>) => boolean
  amber?: (val: unknown, row: Record<string, unknown>) => boolean
  green?: (val: unknown, row: Record<string, unknown>) => boolean
}

const CURRENCY_FMT = '"R$"\\ #,##0.00'
const DATE_FMT     = 'DD/MM/YYYY'

// ── Main Excel exporter ──────────────────────────────────────
export function exportExcel<T extends Record<string, unknown>>(
  title: string,
  description: string,
  cols: XCol[],
  data: T[],
  filename: string,
) {
  const wb   = XLSXStyle.utils.book_new()
  const ws: Record<string, unknown> = {}
  const nc   = cols.length
  const DR   = 4 // data starts at row index 4 (rows 0-3 = header area)

  // Merge title/meta rows across all columns
  const lastCol = XLSXStyle.utils.encode_col(nc - 1)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: nc - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: nc - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: nc - 1 } },
  ]

  const now = new Date()
  const genStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  ws['A1'] = { v: `ITADOG — ${title}`, t: 's', s: S_TITLE }
  ws['A2'] = { v: description,         t: 's', s: S_META  }
  ws['A3'] = { v: `Gerado em: ${genStr}  |  ${data.length} registro(s)`, t: 's', s: S_META }

  // Column header row
  cols.forEach((col, c) => {
    ws[XLSXStyle.utils.encode_cell({ r: 3, c })] = {
      v: col.header, t: 's',
      s: { ...S_HEADER, alignment: { horizontal: col.align ?? 'center', vertical: 'center' } },
    }
  })

  // Data rows
  data.forEach((row, r) => {
    const base = r % 2 === 0 ? S_EVEN : S_ODD
    cols.forEach((col, c) => {
      const val = row[col.key]
      let sty = base
      if (col.red?.(val, row as Record<string, unknown>))   sty = S_RED
      else if (col.amber?.(val, row as Record<string, unknown>)) sty = S_AMBER
      else if (col.green?.(val, row as Record<string, unknown>)) sty = S_GREEN

      const align = col.align ?? (typeof val === 'number' ? 'right' : 'left')
      const cell: Record<string, unknown> = {
        v: val ?? '',
        t: typeof val === 'number' ? 'n' : 's',
        s: { ...sty, alignment: { horizontal: align, vertical: 'center' } },
      }
      if (col.numFmt) cell.z = col.numFmt
      ws[XLSXStyle.utils.encode_cell({ r: DR + r, c })] = cell
    })
  })

  ws['!ref'] = XLSXStyle.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: DR + Math.max(data.length - 1, 0), c: nc - 1 },
  })

  ws['!cols'] = cols.map(col => ({ wch: col.width ?? 16 }))
  ws['!rows'] = [{ hpt: 36 }, { hpt: 18 }, { hpt: 16 }, { hpt: 24 }, ...data.map(() => ({ hpt: 18 }))]
  ws['!sheetView'] = [{ state: 'frozen', ySplit: 4, topLeftCell: 'A5', activeCell: 'A5' }]
  ws['!autofilter'] = { ref: `A4:${lastCol}4` }

  XLSXStyle.utils.book_append_sheet(wb, ws as never, title.slice(0, 31))
  XLSXStyle.writeFile(wb, `ITADOG-${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── HTML-print PDF exporter ──────────────────────────────────
export interface PCol {
  header: string
  key: string
  width?: string
  align?: 'left' | 'center' | 'right'
}

export async function exportPDF<T extends Record<string, unknown>>(
  title: string,
  description: string,
  cols: PCol[],
  data: T[],
  opts?: {
    red?:   (row: T) => boolean
    amber?: (row: T) => boolean
    green?: (row: T) => boolean
  },
) {
  // Reserva a aba já — ainda dentro do gesto de clique do usuário — para não
  // ser bloqueada como pop-up pelo navegador depois do await abaixo.
  const win = window.open('', '_blank')

  const now    = new Date()
  const genStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  // Logo ITADOG — mesmo padrão visual do PDF Comercial do pedido
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

  const rowsHTML = data.map((row, i) => {
    const isRed   = opts?.red?.(row)
    const isAmber = opts?.amber?.(row)
    const isGreen = opts?.green?.(row)
    const bg   = isRed ? '#FEF2F2' : isAmber ? '#FFFBEB' : isGreen ? '#F0FDF4' : i % 2 === 0 ? '#FFFFFF' : '#EAF0F8'
    const fc   = isRed ? '#DC2626' : isAmber ? '#92400E' : isGreen ? '#166534' : '#1E293B'
    const bold = isRed ? 'font-weight:700;' : ''
    const tds  = cols.map(col =>
      `<td style="padding:4px 6px;border:1px solid #C5D8F0;text-align:${col.align ?? 'left'};${bold}color:${fc};">${row[col.key] ?? ''}</td>`
    ).join('')
    return `<tr style="background:${bg};">${tds}</tr>`
  }).join('')

  const thsHTML = cols.map(col =>
    `<th style="padding:7px 6px;background:#1A4E9A;color:#fff;font-size:9px;font-weight:600;text-align:center;border:1px solid #3470BE;width:${col.width ?? 'auto'}">${col.header}</th>`
  ).join('')

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${title} — ITADOG</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:Arial,sans-serif;background:#fff;color:#1e293b;font-size:10px;}
.wrapper{padding:16px;}
.hd{background:#082956;color:#fff;padding:14px 18px;border-radius:6px 6px 0 0;margin-bottom:0;display:flex;align-items:center;gap:12px;}
.hd img{height:26px;width:auto;flex-shrink:0;}
.hd .txt{flex:1;}
.hd h1{font-size:16px;font-weight:700;letter-spacing:0.5px;}
.hd p{font-size:10px;color:#c5d8f0;margin-top:2px;}
.meta{background:#1A4E9A;color:#eaf0f8;padding:6px 18px;font-size:9px;margin-bottom:8px;}
table{width:100%;border-collapse:collapse;margin-top:6px;}
tbody tr:nth-child(odd){background:#EAF0F8;}
.footer{margin-top:16px;padding-top:6px;border-top:1px solid #c5d8f0;font-size:8px;color:#94a3b8;text-align:center;}
@media print{
  @page{size:A4 landscape;margin:10mm;}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .no-print{display:none!important;}
}
</style>
</head>
<body>
<div class="wrapper">
  <div class="hd">
    ${logoData ? `<img src="${logoData}" alt="ITADOG" />` : ''}
    <div class="txt">
      <h1>ITADOG &mdash; ${title}</h1>
      <p>${description}</p>
    </div>
  </div>
  <div class="meta">Gerado em: ${genStr} &nbsp;|&nbsp; ${data.length} registro(s)</div>
  <table>
    <thead><tr>${thsHTML}</tr></thead>
    <tbody>${rowsHTML}</tbody>
  </table>
  <div class="footer">ITADOG Sales &mdash; ${title} &mdash; Gerado em ${genStr}</div>
</div>
<script>window.addEventListener('load',()=>window.print())</script>
</body>
</html>`

  if (win) {
    win.document.open()
    win.document.write(html)
    win.document.close()
  } else {
    // Pop-up bloqueado mesmo assim (ex: configuração restritiva do navegador) — cai para download do HTML.
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }
}

// ── Status helpers ───────────────────────────────────────────
export const ORDER_STATUS_PT: Record<OrderStatus, string> = {
  draft:                   'Rascunho',
  generated:               'Pedido Gerado',
  pending_separation:      'Aguardando Separação',
  separation:              'Em Separação',
  invoiced_ready_to_ship:  'Faturado / Pronto Envio',
  partial_delivery:        'Entrega Parcial',
  delivered:               'Entregue',
}

export const ORDER_STATUS_COLOR_HEX: Record<OrderStatus, string> = {
  draft:                   '#94A3B8',
  generated:               '#3B82F6',
  pending_separation:      '#F59E0B',
  separation:              '#F97316',
  invoiced_ready_to_ship:  '#10B981',
  partial_delivery:        '#14B8A6',
  delivered:               '#065F46',
}

export const VISIT_RESULT_PT: Record<string, string> = {
  positivo:    'Positivo',
  negativo:    'Negativo',
  neutro:      'Neutro',
  reagendado:  'Reagendado',
}

export const RECEIVABLE_STATUS_PT: Record<string, string> = {
  aberto:    'Em Aberto',
  parcial:   'Pago Parcial',
  pago:      'Pago',
  vencido:   'Vencido',
  cancelado: 'Cancelado',
}

// ── Date helpers ─────────────────────────────────────────────
export function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}

export function fmtCurrency(v?: number | null): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function daysBetween(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
}

// Quick period helpers
export type PeriodKey = 'current' | 'prev' | '3months' | 'year' | 'all' | 'custom'

export function periodRange(key: PeriodKey): { from: string; to: string } {
  const now  = new Date()
  const y    = now.getFullYear()
  const m    = now.getMonth()
  const iso  = (d: Date) => d.toISOString().slice(0, 10)
  switch (key) {
    case 'current':
      return { from: iso(new Date(y, m, 1)),    to: iso(new Date(y, m + 1, 0)) }
    case 'prev':
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    case '3months':
      return { from: iso(new Date(y, m - 2, 1)), to: iso(new Date(y, m + 1, 0)) }
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    case 'all':
      return { from: '', to: '' }
    default:
      return { from: '', to: '' }
  }
}

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  current:  'Mês Atual',
  prev:     'Mês Anterior',
  '3months': 'Últimos 3 Meses',
  year:     'Este Ano',
  all:      'Todos',
  custom:   'Personalizado',
}
