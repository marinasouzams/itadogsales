import { useState } from 'react'
import { RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { sendOrderToBling } from '@/services/bling'
import { formatDateTime, cn } from '@/utils'
import type { Order } from '@/types'

/** Situação do pedido no Bling + botão de envio manual (admin). */
export default function OrderBlingPanel({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const sent = Boolean(order.blingOrderId)
  const error = order.blingError

  const handleSend = async () => {
    setSending(true); setMessage(null)
    try {
      await sendOrderToBling(order.id)
      setMessage('Enviado para a fila. Em alguns segundos aparece no Bling.')
      setTimeout(onChanged, 5000)
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={cn(
      'card p-4 border',
      error ? 'border-red-200 bg-red-50/40' : sent ? 'border-green-200 bg-green-50/30' : 'border-slate-200',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {error
            ? <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
            : sent ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" /> : <Clock className="w-4 h-4 text-slate-400 mt-0.5" />}
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {sent ? `No Bling${order.blingOrderNumber ? ` — pedido nº ${order.blingOrderNumber}` : ''}` : 'Ainda não enviado ao Bling'}
            </p>
            {sent && order.blingSituacao && <p className="text-xs text-slate-500">Situação no Bling: {order.blingSituacao}</p>}
            {sent && order.blingSentAt && <p className="text-xs text-slate-400">Última sincronização: {formatDateTime(order.blingSentAt)}</p>}
            {error && <p className="text-xs text-red-700 mt-1">{error}</p>}
          </div>
        </div>
        {!order.isDeleted && (
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-lg bg-white hover:bg-primary-50 disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3 h-3', sending && 'animate-spin')} />
            {sending ? 'Enviando...' : sent ? 'Reenviar ao Bling' : 'Enviar ao Bling'}
          </button>
        )}
      </div>
      {message && <p className="mt-2 text-xs text-slate-600">{message}</p>}
    </div>
  )
}
