/**
 * Condição (prazo) de pagamento — lista padrão + "Outro" só com números.
 *
 * Formato gravado em orders.payment_terms / clients.default_payment_terms:
 *   "À vista" | "N dias" | "30/45/60"  (dias após a entrega, em ordem crescente)
 * É o que o financeiro (parcelas) e o Bling sabem interpretar.
 */
export const PAYMENT_TERMS = ['À vista', '7 dias', '14 dias', '21 dias', '28 dias', '30 dias', '30/45', '30/60', '30/45/60', '30/60/90']
export const OTHER_TERMS = 'Outro'

const MAX_DAYS = 365
const MAX_PARCELAS = 12

export function isListTerm(v?: string | null): boolean {
  return !!v && PAYMENT_TERMS.includes(v)
}

/** Enquanto digita no "Outro": só números e "/" (vírgula, espaço, ponto e ";" viram "/"). */
export function sanitizeTermsInput(v: string): string {
  return v.replace(/[,;.\s-]+/g, '/').replace(/[^\d/]/g, '').replace(/\/{2,}/g, '/').replace(/^\//, '')
}

/** Dias de cada parcela, ou null se o texto não for um prazo válido. */
export function termDays(terms?: string | null): number[] | null {
  // "/" sobrando no fim (ainda digitando) não invalida
  const t = (terms ?? '').trim().toLowerCase().replace(/[\s/,;.-]+$/, '')
  if (!t) return null
  if (/^[àa]\s*vista$/.test(t)) return [0]
  // Aceita "30/45/60", "30,45", "30 / 60 dias", "45 dias", "7d" — nada além de números e separadores
  if (!/^\d+([\s/,;.-]+\d+)*\s*(dias?|d)?$/.test(t)) return null
  const days = (t.match(/\d+/g) ?? []).map(Number)
  if (days.length === 1 && days[0] === 0) return [0]
  if (days.length > MAX_PARCELAS) return null
  if (days.some(d => d < 1 || d > MAX_DAYS)) return null
  for (let i = 1; i < days.length; i++) if (days[i] <= days[i - 1]) return null
  return days
}

/** Texto padrão: [0] → "À vista", [45] → "45 dias", [30, 60] → "30/60". */
export function formatTerms(days: number[]): string {
  if (days.length === 1) return days[0] === 0 ? 'À vista' : `${days[0]} dias`
  return days.join('/')
}

/** Prazo no formato padrão, ou null se inválido. "30,45" → "30/45"; "30/60 dias" → "30/60". */
export function normalizeTerms(terms?: string | null): string | null {
  const days = termDays(terms)
  return days ? formatTerms(days) : null
}

/** Mensagem de erro para o "Outro" (null = ok ou vazio). */
export function termsError(terms?: string | null): string | null {
  const t = (terms ?? '').trim()
  if (!t || termDays(t)) return null
  if (!/^[\d\s/,;.-]+(dias?|d)?$/i.test(t)) return 'Use só os dias, separados por "/". Ex.: 30/60/90.'
  const days = (t.match(/\d+/g) ?? []).map(Number)
  if (days.length > MAX_PARCELAS) return `No máximo ${MAX_PARCELAS} parcelas.`
  if (days.some(d => d > MAX_DAYS)) return `Prazo máximo de ${MAX_DAYS} dias.`
  if (days.some((d, i) => i > 0 && d <= days[i - 1])) return 'Os dias precisam estar em ordem crescente (ex.: 30/60/90).'
  return 'Use só os dias, separados por "/". Ex.: 30/60/90.'
}

/** Resumo legível: "3 parcelas: 30, 45 e 60 dias após a entrega". */
export function termsSummary(terms?: string | null): string | null {
  const days = termDays(terms)
  if (!days) return null
  if (days.length === 1) return days[0] === 0 ? 'Pagamento à vista' : `1 parcela: ${days[0]} dias após a entrega`
  const list = days.slice(0, -1).join(', ') + ' e ' + days[days.length - 1]
  return `${days.length} parcelas: ${list} dias após a entrega`
}
