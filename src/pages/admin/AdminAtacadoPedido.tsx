import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useWholesaleOrders, useWholesaleItems } from '@/hooks/useData'
import { LoadingSpinner, EmptyState } from '@/components/shared/LoadingState'
import { WholesaleStatusBadge } from '@/pages/admin/AdminAtacado'
import { formatCurrency, formatDate } from '@/utils'

export default function AdminAtacadoPedido() {
  const { id } = useParams()
  const navigate = useNavigate()
  const blingId = Number(id)
  const { data: orders = [], loading } = useWholesaleOrders()
  const { data: items = [], loading: loadingItems } = useWholesaleItems(blingId)
  const order = useMemo(() => orders.find(o => o.blingId === blingId), [orders, blingId])

  if (loading || loadingItems) return <AdminLayout title="Pedido de atacado"><div className="p-6"><LoadingSpinner /></div></AdminLayout>
  if (!order) return (
    <AdminLayout title="Pedido de atacado">
      <div className="p-6"><EmptyState label="Pedido não encontrado" /></div>
    </AdminLayout>
  )

  const cancelled = order.status === 'cancelado'

  return (
    <AdminLayout title={`Pedido de atacado #${order.number}`}>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => navigate('/admin/atacado')} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="w-4 h-4" /> Voltar ao atacado
          </button>
          <a href={`https://www.bling.com.br/vendas.php#edit/${order.blingId}`} target="_blank" rel="noreferrer"
            className="btn-secondary !py-2 !px-4">
            <ExternalLink className="w-4 h-4" /> Abrir no Bling
          </a>
        </div>

        <div className="card space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900">Pedido Bling #{order.number}</h2>
            <span className="badge bg-orange-50 text-orange-700">Atacado</span>
            <WholesaleStatusBadge o={order} />
          </div>
          {order.ignored && order.ignoreReason && <p className="text-sm text-slate-500">Fora dos totais: {order.ignoreReason}</p>}
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Cliente</dt>
              <dd className="font-medium text-slate-800 mt-0.5">
                {order.clientId
                  ? <button onClick={() => navigate(`/admin/clientes/${order.clientId}`)} className="text-primary-600 hover:underline text-left">{order.clientName}</button>
                  : order.clientName}
              </dd>
              {order.clientCity && <dd className="text-slate-500">{order.clientCity}</dd>}
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Data da venda</dt>
              <dd className="font-medium text-slate-800 mt-0.5">{formatDate(order.saleDate)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Nota fiscal</dt>
              <dd className="font-medium text-slate-800 mt-0.5">
                {order.nfeNumber ? (
                  <span className="inline-flex items-center gap-1.5"><FileText className="w-4 h-4" />NF-e {order.nfeNumber}
                    {order.nfeStatus && <span className="text-xs text-slate-400">({order.nfeStatus})</span>}</span>
                ) : <span className="text-slate-400">sem nota</span>}
              </dd>
              {(order.nfeDanfeUrl || order.nfePdfUrl) && (
                <dd className="mt-0.5">
                  <a href={order.nfeDanfeUrl ?? order.nfePdfUrl} target="_blank" rel="noreferrer" className="text-primary-600 text-xs hover:underline">Abrir DANFE</a>
                </dd>
              )}
            </div>
          </dl>
        </div>

        <div className="card !p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 bg-slate-50">
                <th className="px-4 py-3">Código</th><th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3 text-right">Qtd.</th><th className="px-4 py-3 text-right">Preço un.</th><th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 text-slate-500">{i.code}</td>
                  <td className="px-4 py-2.5">{i.description}</td>
                  <td className="px-4 py-2.5 text-right">{i.quantity.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2.5 text-right">{formatCurrency(i.unitPrice)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(i.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 text-slate-600">
                <td colSpan={4} className="px-4 py-2 text-right">Produtos</td>
                <td className="px-4 py-2 text-right">{formatCurrency(order.productsTotal)}</td>
              </tr>
              {order.discount > 0 && (
                <tr className="text-slate-600"><td colSpan={4} className="px-4 py-2 text-right">Desconto</td><td className="px-4 py-2 text-right">− {formatCurrency(order.discount)}</td></tr>
              )}
              {order.freight > 0 && (
                <tr className="text-slate-600"><td colSpan={4} className="px-4 py-2 text-right">Frete</td><td className="px-4 py-2 text-right">{formatCurrency(order.freight)}</td></tr>
              )}
              <tr className="font-bold text-slate-900">
                <td colSpan={4} className="px-4 py-3 text-right">Total</td>
                <td className={cancelled ? 'px-4 py-3 text-right line-through' : 'px-4 py-3 text-right'}>{formatCurrency(order.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {order.installments.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-slate-900 mb-3">Parcelas</h3>
            <div className="flex flex-wrap gap-3">
              {order.installments.map((p, i) => (
                <div key={i} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
                  <p className="text-xs text-slate-400">{p.due ? `vence ${formatDate(p.due)}` : 'sem vencimento'}</p>
                  <p className="font-semibold">{formatCurrency(p.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {order.notes && <div className="card text-sm text-slate-600"><p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Observações</p>{order.notes}</div>}
      </div>
    </AdminLayout>
  )
}
