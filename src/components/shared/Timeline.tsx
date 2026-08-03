import { motion } from 'framer-motion'
import { CheckCircle, MapPin, Package, UserPlus, LogIn, LogOut, RefreshCw, ArrowRightLeft, Calendar, CreditCard, Scale, GitMerge } from 'lucide-react'
import { formatDateTime } from '@/utils'
import { cn } from '@/utils'
import type { AuditLog, AuditAction } from '@/types'

const ACTION_CONFIG: Record<AuditAction, { icon: any; color: string; bg: string }> = {
  login: { icon: LogIn, color: 'text-green-600', bg: 'bg-green-50' },
  logout: { icon: LogOut, color: 'text-slate-500', bg: 'bg-slate-100' },
  create_draft_order:    { icon: Package, color: 'text-slate-500', bg: 'bg-slate-100' },
  update_draft_order:    { icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
  delete_draft_order:    { icon: Package, color: 'text-red-600', bg: 'bg-red-50' },
  generate_order:        { icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
  generate_spreadsheet:  { icon: Package, color: 'text-teal-600', bg: 'bg-teal-50' },
  send_to_separation:    { icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
  print_separation_pdf:  { icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  invoice_ready_to_ship: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
  mark_as_delivered:     { icon: CheckCircle, color: 'text-green-700', bg: 'bg-green-100' },
  update_order_admin:    { icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
  create_order:          { icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
  update_order:          { icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
  cancel_order:          { icon: Package, color: 'text-red-600', bg: 'bg-red-50' },
  create_exchange_order: { icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
  update_exchange_order: { icon: Package, color: 'text-orange-500', bg: 'bg-orange-50' },
  change_order_type:     { icon: Package, color: 'text-orange-700', bg: 'bg-orange-100' },
  create_visit: { icon: MapPin, color: 'text-purple-600', bg: 'bg-purple-50' },
  checkin: { icon: MapPin, color: 'text-primary-600', bg: 'bg-primary-50' },
  checkout: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
  update_client: { icon: UserPlus, color: 'text-slate-600', bg: 'bg-slate-100' },
  assume_prospect: { icon: UserPlus, color: 'text-purple-600', bg: 'bg-purple-50' },
  convert_prospect: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
  sync_bling: { icon: RefreshCw, color: 'text-blue-600', bg: 'bg-blue-50' },
  transfer_client: { icon: ArrowRightLeft, color: 'text-orange-600', bg: 'bg-orange-50' },
  create_client: { icon: UserPlus, color: 'text-primary-600', bg: 'bg-primary-50' },
  create_product: { icon: Package, color: 'text-green-600', bg: 'bg-green-50' },
  update_product: { icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
  create_attribute:        { icon: Package, color: 'text-violet-600', bg: 'bg-violet-50' },
  update_attribute:        { icon: Package, color: 'text-violet-600', bg: 'bg-violet-50' },
  create_attribute_value:  { icon: Package, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50' },
  update_attribute_value:  { icon: Package, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50' },
  assign_product_attributes: { icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  create_category:        { icon: Package, color: 'text-teal-600', bg: 'bg-teal-50' },
  update_category:        { icon: Package, color: 'text-teal-600', bg: 'bg-teal-50' },
  create_subcategory:     { icon: Package, color: 'text-cyan-600', bg: 'bg-cyan-50' },
  update_subcategory:     { icon: Package, color: 'text-cyan-600', bg: 'bg-cyan-50' },
  change_product_category:{ icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  register_payment:             { icon: Package, color: 'text-green-600', bg: 'bg-green-50' },
  write_off_balance:            { icon: Scale, color: 'text-amber-600', bg: 'bg-amber-50' },
  delete_financial_title:       { icon: Package, color: 'text-red-600', bg: 'bg-red-50' },
  delete_order_and_financial:   { icon: Package, color: 'text-red-600', bg: 'bg-red-50' },
  delete_order_keep_financial:  { icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
  payment_method_changed:       { icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
  partial_payment_registered:   { icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
  partial_delivery_registered:  { icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
  delivery_completed:           { icon: Package, color: 'text-green-700', bg: 'bg-green-50' },
  administrative_adjustment:    { icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
  financial_generated:          { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  financial_recalculated:       { icon: RefreshCw, color: 'text-amber-600', bg: 'bg-amber-50' },
  financial_deleted:            { icon: Package, color: 'text-red-600', bg: 'bg-red-50' },
  commission_generated:         { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
  create_retroactive_order:     { icon: Calendar, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  update_sale_date:             { icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-50' },
  recalculate_financial:        { icon: RefreshCw, color: 'text-amber-600', bg: 'bg-amber-50' },
  create_check_payment:         { icon: CreditCard, color: 'text-teal-600', bg: 'bg-teal-50' },
  update_check_payment:         { icon: CreditCard, color: 'text-amber-600', bg: 'bg-amber-50' },
  delete_check_payment:         { icon: CreditCard, color: 'text-red-600', bg: 'bg-red-50' },
  create_installment:           { icon: Package, color: 'text-teal-600', bg: 'bg-teal-50' },
  update_installment:           { icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
  delete_installment:           { icon: Package, color: 'text-red-600', bg: 'bg-red-50' },
  recalculate_installments:     { icon: RefreshCw, color: 'text-amber-600', bg: 'bg-amber-50' },
  change_delivery_date:         { icon: Calendar, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  create_task:                  { icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
  update_task:            { icon: Package, color: 'text-blue-400', bg: 'bg-blue-50' },
  delete_task:            { icon: Package, color: 'text-red-500', bg: 'bg-red-50' },
  complete_task:          { icon: Package, color: 'text-green-700', bg: 'bg-green-50' },
  delete_order:           { icon: Package, color: 'text-red-600', bg: 'bg-red-50' },
  restore_order:          { icon: Package, color: 'text-primary-600', bg: 'bg-primary-50' },
  create_seamstress:           { icon: UserPlus, color: 'text-purple-600', bg: 'bg-purple-50' },
  update_seamstress:           { icon: UserPlus, color: 'text-amber-600', bg: 'bg-amber-50' },
  delete_seamstress:           { icon: UserPlus, color: 'text-red-600', bg: 'bg-red-50' },
  create_production_order:     { icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
  update_production_order:     { icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
  cancel_production_order:     { icon: Package, color: 'text-red-600', bg: 'bg-red-50' },
  register_production_delivery:{ icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
  create_production_payment:   { icon: Package, color: 'text-teal-600', bg: 'bg-teal-50' },
  mark_production_paid:        { icon: CheckCircle, color: 'text-green-700', bg: 'bg-green-100' },
  create_production_request:   { icon: Package, color: 'text-orange-600', bg: 'bg-orange-50' },
  update_production_request:   { icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
  complete_production_request: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
  delete_production_request:   { icon: Package, color: 'text-red-600', bg: 'bg-red-50' },
  delete_production_payment:   { icon: Package, color: 'text-red-600', bg: 'bg-red-50' },
  update_production_payment:   { icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
  create_production_flow_group: { icon: GitMerge, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  update_production_flow_group: { icon: GitMerge, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  delete_production_flow_group: { icon: GitMerge, color: 'text-red-600', bg: 'bg-red-50' },
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
