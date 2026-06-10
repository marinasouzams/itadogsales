import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, Check, CheckCheck } from 'lucide-react'
import { useNotifications } from '@/hooks/useData'
import { markNotificationRead, markAllNotificationsRead } from '@/services/db'
import { cn } from '@/utils'

const TYPE_ICONS: Record<string, string> = {
  new_client: '👤',
  new_prospect: '⭐',
  new_order: '🛒',
  order_separation: '📦',
  order_invoiced: '🧾',
  client_overdue: '⚠️',
  birthday: '🎂',
  default: '🔔',
}

export default function NotificationPanel() {
  const [open, setOpen] = useState(false)
  const { data: notifications = [], refetch } = useNotifications()
  const panelRef = useRef<HTMLDivElement>(null)

  const unread = notifications.filter(n => !n.read).length

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id)
    refetch()
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
    refetch()
  }

  function timeAgo(dateStr: string): string {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
    if (diff < 60) return 'Agora'
    if (diff < 3600) return `${Math.floor(diff / 60)}min`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`
    return `${Math.floor(diff / 86400)}d`
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-600" />
                <span className="font-semibold text-sm text-slate-900">Notificações</span>
                {unread > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unread}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button onClick={handleMarkAllRead} className="text-xs text-primary-600 font-medium flex items-center gap-1 hover:underline">
                    <CheckCheck className="w-3.5 h-3.5" /> Marcar todas lidas
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="ml-2 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
              {notifications.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma notificação</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors',
                      !n.read && 'bg-primary-50/30'
                    )}
                    onClick={() => !n.read && handleMarkRead(n.id)}
                  >
                    <span className="text-xl flex-shrink-0 mt-0.5">{TYPE_ICONS[n.type] ?? TYPE_ICONS.default}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium text-slate-900 leading-tight', !n.read && 'font-semibold')}>{n.title}</p>
                      {n.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.description}</p>}
                      <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.read && (
                      <button onClick={e => { e.stopPropagation(); handleMarkRead(n.id) }} className="flex-shrink-0 mt-1">
                        <Check className="w-4 h-4 text-primary-600" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
