import { motion } from 'framer-motion'
import { CheckCircle, MapPin, Package, UserPlus, LogIn, LogOut, RefreshCw, ArrowRightLeft } from 'lucide-react'
import { formatDateTime } from '@/utils'
import { cn } from '@/utils'
import type { AuditLog, AuditAction } from '@/types'

const ACTION_CONFIG: Record<AuditAction, { icon: any; color: string; bg: string }> = {
  login: { icon: LogIn, color: 'text-green-600', bg: 'bg-green-50' },
  logout: { icon: LogOut, color: 'text-slate-500', bg: 'bg-slate-100' },
  create_order: { icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
  update_order: { icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
  cancel_order: { icon: Package, color: 'text-red-600', bg: 'bg-red-50' },
  create_visit: { icon: MapPin, color: 'text-purple-600', bg: 'bg-purple-50' },
  checkin: { icon: MapPin, color: 'text-primary-600', bg: 'bg-primary-50' },
  checkout: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
  update_client: { icon: UserPlus, color: 'text-slate-600', bg: 'bg-slate-100' },
  assume_prospect: { icon: UserPlus, color: 'text-purple-600', bg: 'bg-purple-50' },
  convert_prospect: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
  sync_bling: { icon: RefreshCw, color: 'text-blue-600', bg: 'bg-blue-50' },
  transfer_client: { icon: ArrowRightLeft, color: 'text-orange-600', bg: 'bg-orange-50' },
}

interface TimelineProps {
  logs: AuditLog[]
  maxItems?: number
}

export default function Timeline({ logs, maxItems }: TimelineProps) {
  const items = maxItems ? logs.slice(0, maxItems) : logs

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm">
        Nenhum registro encontrado
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="absolute left-[18px] top-0 bottom-0 w-px bg-slate-100" />
      <div className="space-y-4">
        {items.map((log, i) => {
          const config = ACTION_CONFIG[log.action]
          const Icon = config?.icon ?? RefreshCw

          return (
            <motion.div
              key={log.id}
              className="flex gap-3 relative"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              {/* Icon */}
              <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 border-white', config?.bg ?? 'bg-slate-100')}>
                <Icon className={cn('w-4 h-4', config?.color ?? 'text-slate-500')} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-slate-800 leading-snug">{log.description}</p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-500">{log.userName}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-400">{formatDateTime(log.timestamp)}</span>
                  {log.ip && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs text-slate-400 font-mono">{log.ip}</span>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
