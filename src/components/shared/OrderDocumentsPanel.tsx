import { useEffect, useState } from 'react'
import { FileText, Receipt, ExternalLink, CheckCircle2 } from 'lucide-react'
import { getOrderReceivables } from '@/services/db'
import { formatCurrency, formatDate, cn } from '@/utils'
import type { FinancialReceivable, Order } from '@/types'

/** Nota fiscal e boletos do pedido (vindos do Bling) — admin e representante. */
export default function OrderDocumentsPanel({ order }: { order: Order }) {
  const [receivables, setReceivables] = useState<FinancialReceivable[]>([])

  useEffect(() => {
    if (!order.blingOrderId) return
    getOrderReceivables(order.id).then(setReceivables).catch(() => setReceivables([]))
  }, [order.id, order.blingOrderId])

  if (!order.blingOrderId) return null

  const pdf = order.nfePdfUrl || order.nfeDanfeUrl
  const withLinks = receivables.filter(r => r.boletoUrl || r.pixUrl || r.blingContaId)

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-slate-400" />
        <p className="section-title">Nota fiscal e boletos</p>
      </div>

      {/* Nota fiscal */}
      {order.nfeNumber ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              NF-e nº {order.nfeNumber}{order.nfeSeries ? ` · série ${order.nfeSeries}` : ''}
            </p>
            <p className="text-xs text-slate-400">
              {order.nfeStatus ?? ''}{order.nfeIssuedAt ? ` · emitida em ${formatDate(order.nfeIssuedAt)}` : ''}
            </p>
          </div>
          {pdf && (
            <a href={pdf} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-lg hover:bg-primary-50">
              PDF da nota <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Nota fiscal ainda não emitida.</p>
      )}

      {/* Boletos / parcelas */}
      {withLinks.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {withLinks.map(r => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Receipt className="w-4 h-4 text-slate-300 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">
                    Parcela {r.installmentNumber}/{r.installmentTotal} · {formatCurrency(r.amount)}
                  </p>
                  <p className={cn('text-xs', r.status === 'pago' ? 'text-green-600' : 'text-slate-400')}>
                    {r.status === 'pago'
                      ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Pago{r.paymentDate ? ` em ${formatDate(r.paymentDate)}` : ''}</span>
                      : `Vence em ${formatDate(r.dueDate)}`}
                  </p>
                </div>
              </div>
              {r.status !== 'pago' && (r.boletoUrl || r.pixUrl) && (
                <a href={r.boletoUrl || r.pixUrl} target="_blank" rel="noreferrer"
                  className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-lg hover:bg-primary-50">
                  {r.boletoUrl ? 'Boleto' : 'PIX'} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {order.nfeNumber && withLinks.length === 0 && (
        <p className="text-xs text-slate-400">Boletos ainda não disponíveis no Bling.</p>
      )}
    </div>
  )
}
