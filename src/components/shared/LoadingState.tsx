import { Loader2, AlertCircle, InboxIcon } from 'lucide-react'

export function LoadingSpinner({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  )
}

export function ErrorState({ message = 'Erro ao carregar dados', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <AlertCircle className="w-8 h-8 text-red-400" />
      <p className="text-sm text-slate-500">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-xs text-primary-600 font-semibold underline">
          Tentar novamente
        </button>
      )}
    </div>
  )
}

export function EmptyState({ label = 'Nenhum registro encontrado', icon: Icon = InboxIcon }: { label?: string; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Icon className="w-10 h-10 text-slate-200" />
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  )
}
