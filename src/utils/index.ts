import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, parseISO, format, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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

export function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500',
    'bg-orange-500', 'bg-pink-500', 'bg-teal-500',
  ]
  const index = name.charCodeAt(0) % colors.length
  return colors[index]
}
