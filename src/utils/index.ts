import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, parseISO, format, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Client } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formata valor monetário no padrão brasileiro: R$ 1.234,56 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0)
}

/** Alias explícito — garante padrão BRL em todo o sistema */
export const formatCurrencyBRL = formatCurrency

export function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return dateStr
  }
}

export function formatDateTime(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  } catch {
    return dateStr
  }
}

export function formatRelative(dateStr: string): string {
  try {
    return formatDistanceToNow(parseISO(dateStr), { locale: ptBR, addSuffix: true })
  } catch {
    return dateStr
  }
}

export function daysSince(dateStr: string): number {
  try {
    return differenceInDays(new Date(), parseISO(dateStr))
  } catch {
    return 0
  }
}

export function formatPhone(phone: string): string {
  return phone
}

/** Aplica a máscara 00000-000 a um CEP, aceitando digitado com ou sem máscara. */
export function formatCep(v?: string): string {
  if (!v) return ''
  const d = v.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

/** Campos exigidos pra identificação/endereço fiscal (NF-e) que ainda faltam
 *  no cadastro do cliente. Complemento não entra aqui — é opcional por
 *  natureza (nem todo endereço tem). Usado no resumo do cliente e no pedido. */
export function fiscalPendingFields(client: Client): string[] {
  const a = client.address
  const checks: [string, unknown][] = [
    ['CNPJ', client.cnpj],
    ['Razão Social', client.name],
    ['Inscrição Estadual', client.stateRegistration],
    ['CEP', a.zipCode],
    ['Logradouro', a.street],
    ['Número', a.number],
    ['Bairro', a.neighborhood],
    ['Cidade', a.city],
    ['UF', a.state],
  ]
  return checks.filter(([, v]) => !v).map(([label]) => label)
}

/** Monta o endereço completo em uma linha amigável, ex:
 *  "Rua Exemplo, 1250, Sala 02 — Centro — Itajaí/SC — CEP 88300-000".
 *  Omite partes ausentes sem quebrar o formato. */
export function fullAddressLine(a: Client['address']): string {
  const streetPart = [a.street, a.number].filter(Boolean).join(', ')
  const withComplement = [streetPart, a.complement].filter(Boolean).join(', ')
  const parts = [withComplement || null, a.neighborhood || null]
  const cityState = [a.city, a.state].filter(Boolean).join('/')
  if (cityState) parts.push(cityState)
  if (a.zipCode) parts.push(`CEP ${formatCep(a.zipCode)}`)
  return parts.filter(Boolean).join(' — ') || '—'
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

export function priorityLabel(p: string): string {
  const map: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }
  return map[p] ?? p
}

export function statusOrderLabel(s: string): string {
  const map: Record<string, string> = {
    rascunho: 'Rascunho',
    enviado: 'Enviado',
    aprovado: 'Aprovado',
    faturado: 'Faturado',
    cancelado: 'Cancelado',
  }
  return map[s] ?? s
}

export function syncStatusLabel(s: string): string {
  const map: Record<string, string> = {
    pendente: 'Pendente',
    sincronizando: 'Sincronizando',
    sincronizado: 'Sincronizado',
    erro: 'Erro',
  }
  return map[s] ?? s
}

export function visitResultLabel(r: string): string {
  const map: Record<string, string> = {
    positivo: 'Positivo',
    negativo: 'Negativo',
    neutro: 'Neutro',
    reagendado: 'Reagendado',
  }
  return map[r] ?? r
}

export function clientTypeLabel(t: string): string {
  const map: Record<string, string> = {
    fazenda: 'Fazenda',
    cooperativa: 'Cooperativa',
    agropecuaria: 'Agropecuária',
    distribuidor: 'Distribuidor',
    revendedor: 'Revendedor',
  }
  return map[t] ?? t
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export function calcPercentage(value: number, total: number): number {
  if (total === 0) return 0
  return Math.round((value / total) * 100)
}

export type ProspectShortcut = 'todos' | 'hoje' | 'atrasados' | 'sem_contato'

/** Filtros rápidos do Kanban do CRM — hoje/atrasados usam nextActionDate,
 *  sem_contato considera quem nunca teve um follow-up registrado. */
export function matchesProspectShortcut(
  p: { nextActionDate?: string; lastContactDate?: string; stage: string },
  shortcut: ProspectShortcut,
): boolean {
  if (shortcut === 'todos') return true
  const today = new Date().toISOString().slice(0, 10)
  if (shortcut === 'hoje') return p.nextActionDate === today
  if (shortcut === 'atrasados') {
    return !!p.nextActionDate && p.nextActionDate < today && p.stage !== 'perdido' && p.stage !== 'pedido_realizado'
  }
  if (shortcut === 'sem_contato') return !p.lastContactDate
  return true
}

export function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500',
    'bg-orange-500', 'bg-pink-500', 'bg-teal-500',
  ]
  const index = name.charCodeAt(0) % colors.length
  return colors[index]
}
