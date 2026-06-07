import { motion } from 'framer-motion'
import { RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { cn, formatRelative } from '@/utils'
import type { SyncStatus as SyncStatusType } from '@/types'

interface SyncStatusProps {
  status: SyncStatusType
  label?: string
  lastSync?: string
  count?: number
  errors?: number
  onRetry?: () => void
}

export default function SyncStatusBadge({
  status, label, lastSync, count, errors, onRetry,
}: SyncStatusProps) {
  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-xl border',
      status === 'sincronizado' && 'bg-green-50 border-green-200',
      status === 'pendente' && 'bg-amber-50 border-amber-200',
      status === 'sincronizando' && 'bg-blue-50 border-blue-200',
      status === 'erro' && 'bg-red-50 border-red-200',
    )}>
      <div className={cn(
        'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
        status === 'sincronizado' && 'bg-green-100',
        status === 'pendente' && 'bg-amber-100',
        status === 'sincronizando' && 'bg-blue-100',
        status === 'erro' && 'bg-red-100',
      )}>
        {status === 'sincronizado' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
        {status === 'pendente' && <Clock className="w-4 h-4 text-amber-600" />}
        {status === 'sincronizando' && (
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
            <RefreshCw className="w-4 h-4 text-blue-600" />
          </motion.div>
        )}
        {status === 'erro' && <AlertCircle className="w-4 h-4 text-red-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn(
          'text-sm font-medium',
          status === 'sincronizado' && 'text-green-800',
          status === 'pendente' && 'text-amber-800',
          status === 'sincronizando' && 'text-blue-800',
          status === 'erro' && 'text-red-800',
        )}>
          {label ?? {
            sincronizado: 'Sincronizado com Bling',
            pendente: 'Aguardando sincronização',
            sincronizando: 'Sincronizando...',
            erro: 'Erro na sincronização',
          }[status]}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {count !== undefined && (
            <span className="text-xs text-slate-500">{count} itens</span>
          )}
          {errors !== undefined && errors > 0 && (
            <span className="text-xs text-red-500">{errors} erro(s)</span>
          )}
          {lastSync && (
            <span className="text-xs text-slate-400">{formatRelative(lastSync)}</span>
          )}
        </div>
      </div>
      {(status === 'erro' || status === 'pendente') && onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Tentar
        </button>
      )}
    </div>
  )
}
