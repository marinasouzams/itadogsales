import { cn } from '@/utils'
import type { OrderStatus, SyncStatus, VisitStatus, VisitResult, ProspectStatus, CommissionStatus, Priority } from '@/types'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple'

function Badge({ variant, children, className }: { variant: BadgeVariant; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        variant === 'success' && 'bg-green-50 text-green-700',
        variant === 'warning' && 'bg-amber-50 text-amber-700',
        variant === 'danger' && 'bg-red-50 text-red-700',
        variant === 'info' && 'bg-blue-50 text-blue-700',
        variant === 'neutral' && 'bg-slate-100 text-slate-600',
        variant === 'purple' && 'bg-purple-50 text-purple-700',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { label: string; variant: BadgeVariant }> = {
    draft:                  { label: 'Rascunho',              variant: 'neutral' },
    generated:              { label: 'Gerado',                variant: 'info' },
    pending_separation:     { label: 'Pendente Separação',    variant: 'warning' },
    separation:             { label: 'Em Separação',          variant: 'purple' },
    invoiced_ready_to_ship: { label: '🚚 Faturado / Envio',   variant: 'success' },
    partial_delivery:       { label: '📦 Entrega Parcial',    variant: 'warning' },
    delivered:              { label: '✅ Entregue',            variant: 'neutral' },
  }
  const { label, variant } = map[status] ?? { label: status, variant: 'neutral' as BadgeVariant }
  return <Badge variant={variant}>{label}</Badge>
}

export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  const map: Record<SyncStatus, { label: string; variant: BadgeVariant }> = {
    pendente: { label: 'Pendente', variant: 'warning' },
    sincronizando: { label: 'Sincronizando...', variant: 'info' },
    sincronizado: { label: 'Sincronizado', variant: 'success' },
    erro: { label: 'Erro', variant: 'danger' },
  }
  const { label, variant } = map[status]
  return <Badge variant={variant}>{label}</Badge>
}

export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  const map: Record<VisitStatus, { label: string; variant: BadgeVariant }> = {
    agendada: { label: 'Agendada', variant: 'info' },
    em_andamento: { label: 'Em andamento', variant: 'warning' },
    concluida: { label: 'Concluída', variant: 'success' },
    cancelada: { label: 'Cancelada', variant: 'danger' },
  }
  const { label, variant } = map[status]
  return <Badge variant={variant}>{label}</Badge>
}

export function VisitResultBadge({ result }: { result: VisitResult }) {
  const map: Record<VisitResult, { label: string; variant: BadgeVariant }> = {
    positivo: { label: 'Positivo', variant: 'success' },
    negativo: { label: 'Negativo', variant: 'danger' },
    neutro: { label: 'Neutro', variant: 'neutral' },
    reagendado: { label: 'Reagendado', variant: 'warning' },
  }
  const { label, variant } = map[result]
  return <Badge variant={variant}>{label}</Badge>
}

export function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  const map: Record<ProspectStatus, { label: string; variant: BadgeVariant }> = {
    disponivel: { label: 'Disponível', variant: 'info' },
    assumido: { label: 'Assumido', variant: 'warning' },
    convertido: { label: 'Convertido', variant: 'success' },
    descartado: { label: 'Descartado', variant: 'neutral' },
  }
  const { label, variant } = map[status]
  return <Badge variant={variant}>{label}</Badge>
}

export function CommissionStatusBadge({ status }: { status: CommissionStatus }) {
  const map: Record<CommissionStatus, { label: string; variant: BadgeVariant }> = {
    prevista: { label: 'Prevista', variant: 'neutral' },
    aprovada: { label: 'Aprovada', variant: 'info' },
    paga: { label: 'Paga', variant: 'success' },
    cancelada: { label: 'Cancelada', variant: 'danger' },
  }
  const { label, variant } = map[status]
  return <Badge variant={variant}>{label}</Badge>
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const map: Record<Priority, { label: string; variant: BadgeVariant }> = {
    alta: { label: 'Alta', variant: 'danger' },
    media: { label: 'Média', variant: 'warning' },
    baixa: { label: 'Baixa', variant: 'neutral' },
  }
  const { label, variant } = map[priority]
  return <Badge variant={variant}>{label}</Badge>
}
