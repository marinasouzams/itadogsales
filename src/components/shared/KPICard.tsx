import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn, formatCurrency } from '@/utils'

interface KPICardProps {
  label: string
  value: string | number
  sub?: string
  icon?: ReactNode
  iconBg?: string
  trend?: number
  currency?: boolean
  progress?: number
  progressLabel?: string
  color?: 'blue' | 'green' | 'red' | 'purple' | 'orange'
  delay?: number
}

const colorMap = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  red: 'bg-red-50 text-red-600',
  purple: 'bg-purple-50 text-purple-600',
  orange: 'bg-orange-50 text-orange-600',
}

export default function KPICard({
  label,
  value,
  sub,
  icon,
  iconBg,
  trend,
  currency,
  progress,
  progressLabel,
  color = 'blue',
  delay = 0,
}: KPICardProps) {
  const displayValue = currency && typeof value === 'number'
    ? formatCurrency(value)
    : value

  const TrendIcon = trend && trend > 0 ? TrendingUp : trend && trend < 0 ? TrendingDown : Minus

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-900 truncate">{displayValue}</p>
          {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        </div>
        {icon && (
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ml-3', iconBg ?? colorMap[color])}>
            {icon}
          </div>
        )}
      </div>

      {trend !== undefined && (
        <div className={cn(
          'flex items-center gap-1 text-xs font-medium',
          trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-slate-400',
        )}>
          <TrendIcon className="w-3.5 h-3.5" />
          {Math.abs(trend)}% vs mês anterior
        </div>
      )}

      {progress !== undefined && (
        <div className="mt-3">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-slate-500">{progressLabel ?? 'Meta'}</span>
            <span className="text-xs font-semibold text-slate-700">{progress}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                progress >= 100 ? 'bg-green-500' : progress >= 70 ? 'bg-primary-600' : 'bg-amber-500',
              )}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.8, delay: delay + 0.2 }}
            />
          </div>
        </div>
      )}
    </motion.div>
  )
}
