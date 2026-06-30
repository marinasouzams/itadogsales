import { useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Download, FileText, TrendingUp, Package, DollarSign } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { useProductionOrders, useProductionPayments, useProductionRequests, useSeamstresses } from '@/hooks/useProducaoData'
import { formatCurrency } from '@/utils'
import { cn } from '@/utils'
import type { ProductionOrderStatus, ProductionRequestStatus } from '@/types'

function fmt(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function fmtMonth(m: string) {
  const [y, mo] = m.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(mo, 10) - 1]}/${y.slice(2)}`
}

const STATUS_LABEL: Record<ProductionOrderStatus, string> = {
  solicitada: 'Solicitada', em_producao: 'Em Produção',
  parcialmente_entregue: 'Parcialmente Entregue', concluida: 'Concluída', cancelada: 'Cancelada',
}

export default function RelatoriosProducao() {
  const { data: orders = [], loading: lo } = useProductionOrders()
  const { data: payments = [], loading: lp } = useProductionPayments()
  const { data: requests = [], loading: lr } = useProductionRequests()
  const { data: seamstresses = [] } = useSeamstresses()
  const [report, setReport] = useState<'costureira' | 'produto' | 'pagamentos' | 'ordens' | 'solicitacoes'>('costureira')
  const [seamstressFilter, setSeamstressFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  // ── Produção por Costureira ────────────────────────────────
  const bySeamstress = seamstresses.map(s => {
    const sOrders = orders.filter(o => o.seamstressId === s.id)
    const totalPecas = sOrders.reduce((sum, o) => sum + (o.items ?? []).reduce((s2, i) => s2 + i.deliveredQty, 0), 0)
    const totalValor = payments.filter(p => p.seamstressId === s.id).reduce((sum, p) => sum + p.totalAmount, 0)
    const pendente = payments.filter(p => p.seamstressId === s.id && p.status === 'pendente').reduce((sum, p) => sum + p.totalAmount, 0)
    return { name: s.name, totalPecas, totalValor, pendente, ordensAtivas: sOrders.filter(o => !['concluida','cancelada'].includes(o.status)).length }
  }).sort((a, b) => b.totalValor - a.totalValor)

  // ── Produção por Produto ───────────────────────────────────
  const productMap: Record<string, { name: string; qty: number; valor: number }> = {}
  orders.forEach(o => (o.items ?? []).forEach(it => {
    if (!productMap[it.productName]) productMap[it.productName] = { name: it.productName, qty: 0, valor: 0 }
    productMap[it.productName].qty += it.deliveredQty
    productMap[it.productName].valor += it.deliveredQty * it.unitValue
  }))
  const byProduct = Object.values(productMap).sort((a, b) => b.qty - a.qty)

  // ── Ordens ────────────────────────────────────────────────
  const filteredOrders = orders.filter(o => {
    const matchS = !seamstressFilter || o.seamstressId === seamstressFilter
    return matchS
  })
  const ordensAtrasadas = filteredOrders.filter(o => o.deadline && o.deadline < today && !['concluida','cancelada'].includes(o.status))
  const ordensAbertas = filteredOrders.filter(o => !['concluida','cancelada'].includes(o.status))

  // ── Pagamentos ────────────────────────────────────────────
  const filteredPayments = payments.filter(p => {
    const matchS = !seamstressFilter || p.seamstressId === seamstressFilter
    const matchM = !monthFilter || p.referenceMonth === monthFilter
    return matchS && matchM
  })

  // ── Solicitações ──────────────────────────────────────────
  const filteredRequests = requests.filter(r => {
    const matchS = !seamstressFilter || r.seamstressId === seamstressFilter
    return matchS
  })
  const pendentesReq = filteredRequests.filter(r => ['pendente','em_andamento','aguardando'].includes(r.status))
  const concluidasReq = filteredRequests.filter(r => r.status === 'concluida')

  const loading = lo || lp || lr

  function exportCSV() {
    let csv = ''
    if (report === 'costureira') {
      csv = 'Costureira,Peças Produzidas,Valor Total,Pendente,Ordens Ativas\n'
      bySeamstress.forEach(s => {
        csv += `"${s.name}",${s.totalPecas},${s.totalValor},${s.pendente},${s.ordensAtivas}\n`
      })
    } else if (report === 'produto') {
      csv = 'Produto,Qtd Produzida,Valor Total\n'
      byProduct.forEach(p => {
        csv += `"${p.name}",${p.qty},${p.valor}\n`
      })
    } else if (report === 'pagamentos') {
      csv = 'Costureira,Mês,Valor,Status,Data Pagamento,Forma\n'
      filteredPayments.forEach(p => {
        csv += `"${p.seamstressName}","${p.referenceMonth}",${p.totalAmount},"${p.status}","${p.paymentDate ?? ''}","${p.paymentMethod ?? ''}"\n`
      })
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `relatorio-producao-${report}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const REPORTS = [
    { key: 'costureira', label: 'Por Costureira', icon: '👩‍🦱' },
    { key: 'produto', label: 'Por Produto', icon: '📦' },
    { key: 'pagamentos', label: 'Pagamentos', icon: '💰' },
    { key: 'ordens', label: 'Ordens', icon: '🧵' },
    { key: 'solicitacoes', label: 'Solicitações', icon: '🔔' },
  ] as const

  return (
    <AdminLayout title="Relatórios Produção">
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Relatórios de Produção</h1>
            <p className="text-sm text-slate-500">Análise completa da produção</p>
          </div>
          <button onClick={exportCSV}
            className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-900 transition-colors">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>

        {/* Report selector */}
        <div className="flex flex-wrap gap-2 mb-5">
          {REPORTS.map(r => (
            <button key={r.key} onClick={() => setReport(r.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                report === r.key ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              )}>
              <span>{r.icon}</span> {r.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <select value={seamstressFilter} onChange={e => setSeamstressFilter(e.target.value)}
            className="border border-slate-200 rounded-xl text-sm px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none">
            <option value="">Toda costureira</option>
            {seamstresses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {report === 'pagamentos' && (
            <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
              className="border border-slate-200 rounded-xl text-sm px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none" />
          )}
        </div>

        {loading ? (
          <div className="py-10"><LoadingSpinner /></div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {/* Por Costureira */}
            {report === 'costureira' && (
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-500 py-3 px-4">Costureira</th>
                      <th className="text-right text-xs font-semibold text-slate-500 py-3 px-4">Peças</th>
                      <th className="text-right text-xs font-semibold text-slate-500 py-3 px-4">Valor Total</th>
                      <th className="text-right text-xs font-semibold text-slate-500 py-3 px-4">Pendente</th>
                      <th className="text-right text-xs font-semibold text-slate-500 py-3 px-4">Em Aberto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySeamstress.map(s => (
                      <tr key={s.name} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-800">{s.name}</td>
                        <td className="py-3 px-4 text-right text-slate-700">{s.totalPecas}</td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-900">{formatCurrency(s.totalValor)}</td>
                        <td className="py-3 px-4 text-right text-orange-600 font-semibold">{formatCurrency(s.pendente)}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                            s.ordensAtivas > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}>
                            {s.ordensAtivas} ordens
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200">
                      <td className="py-3 px-4 font-bold text-slate-900">Total</td>
                      <td className="py-3 px-4 text-right font-bold">{bySeamstress.reduce((s, r) => s + r.totalPecas, 0)}</td>
                      <td className="py-3 px-4 text-right font-bold">{formatCurrency(bySeamstress.reduce((s, r) => s + r.totalValor, 0))}</td>
                      <td className="py-3 px-4 text-right font-bold text-orange-600">{formatCurrency(bySeamstress.reduce((s, r) => s + r.pendente, 0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Por Produto */}
            {report === 'produto' && (
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-500 py-3 px-4">Produto</th>
                      <th className="text-right text-xs font-semibold text-slate-500 py-3 px-4">Qtd Produzida</th>
                      <th className="text-right text-xs font-semibold text-slate-500 py-3 px-4">Valor Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProduct.map(p => (
                      <tr key={p.name} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-800">{p.name}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-700">{p.qty}</td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-900">{formatCurrency(p.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200">
                      <td className="py-3 px-4 font-bold text-slate-900">Total</td>
                      <td className="py-3 px-4 text-right font-bold">{byProduct.reduce((s, p) => s + p.qty, 0)}</td>
                      <td className="py-3 px-4 text-right font-bold">{formatCurrency(byProduct.reduce((s, p) => s + p.valor, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Pagamentos */}
            {report === 'pagamentos' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="card text-center">
                    <p className="text-xs text-slate-500 mb-1">Pendente</p>
                    <p className="text-xl font-bold text-orange-600">
                      {formatCurrency(filteredPayments.filter(p => p.status === 'pendente').reduce((s, p) => s + p.totalAmount, 0))}
                    </p>
                  </div>
                  <div className="card text-center">
                    <p className="text-xs text-slate-500 mb-1">Pago</p>
                    <p className="text-xl font-bold text-green-600">
                      {formatCurrency(filteredPayments.filter(p => p.status === 'pago').reduce((s, p) => s + p.totalAmount, 0))}
                    </p>
                  </div>
                </div>
                <div className="card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left text-xs font-semibold text-slate-500 py-3 px-4">Costureira</th>
                        <th className="text-left text-xs font-semibold text-slate-500 py-3 px-4">Mês</th>
                        <th className="text-right text-xs font-semibold text-slate-500 py-3 px-4">Valor</th>
                        <th className="text-center text-xs font-semibold text-slate-500 py-3 px-4">Status</th>
                        <th className="text-left text-xs font-semibold text-slate-500 py-3 px-4">Pago em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.map(p => (
                        <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-3 px-4 font-medium text-slate-800">{p.seamstressName}</td>
                          <td className="py-3 px-4 text-slate-600">{fmtMonth(p.referenceMonth)}</td>
                          <td className="py-3 px-4 text-right font-semibold text-slate-900">{formatCurrency(p.totalAmount)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                              p.status === 'pago' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700')}>
                              {p.status === 'pago' ? 'Pago' : 'Pendente'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-sm">
                            {p.paymentDate ? `${fmt(p.paymentDate)} · ${p.paymentMethod}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Ordens */}
            {report === 'ordens' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="card text-center">
                    <p className="text-xs text-slate-500 mb-1">Em Aberto</p>
                    <p className="text-2xl font-bold text-blue-600">{ordensAbertas.length}</p>
                  </div>
                  <div className="card text-center">
                    <p className="text-xs text-slate-500 mb-1">Atrasadas</p>
                    <p className="text-2xl font-bold text-red-600">{ordensAtrasadas.length}</p>
                  </div>
                  <div className="card text-center">
                    <p className="text-xs text-slate-500 mb-1">Concluídas</p>
                    <p className="text-2xl font-bold text-green-600">{filteredOrders.filter(o => o.status === 'concluida').length}</p>
                  </div>
                  <div className="card text-center">
                    <p className="text-xs text-slate-500 mb-1">Total</p>
                    <p className="text-2xl font-bold text-slate-700">{filteredOrders.length}</p>
                  </div>
                </div>
                <div className="card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left text-xs font-semibold text-slate-500 py-3 px-4">Costureira</th>
                        <th className="text-left text-xs font-semibold text-slate-500 py-3 px-4">Solicitação</th>
                        <th className="text-left text-xs font-semibold text-slate-500 py-3 px-4">Prazo</th>
                        <th className="text-right text-xs font-semibold text-slate-500 py-3 px-4">Peças</th>
                        <th className="text-center text-xs font-semibold text-slate-500 py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.slice(0, 50).map(o => {
                        const isLate = o.deadline && o.deadline < today && !['concluida','cancelada'].includes(o.status)
                        return (
                          <tr key={o.id} className={cn('border-b border-slate-50 hover:bg-slate-50', isLate && 'bg-red-50')}>
                            <td className="py-3 px-4 font-medium text-slate-800">{o.seamstressName}</td>
                            <td className="py-3 px-4 text-slate-600 text-sm">{fmt(o.requestDate)}</td>
                            <td className={cn('py-3 px-4 text-sm', isLate ? 'text-red-600 font-semibold' : 'text-slate-600')}>
                              {o.deadline ? fmt(o.deadline) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-700">
                              {(o.items ?? []).reduce((s, i) => s + i.quantity, 0)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                {STATUS_LABEL[o.status]}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Solicitações */}
            {report === 'solicitacoes' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="card text-center">
                    <p className="text-xs text-slate-500 mb-1">Pendentes</p>
                    <p className="text-2xl font-bold text-orange-600">{pendentesReq.length}</p>
                  </div>
                  <div className="card text-center">
                    <p className="text-xs text-slate-500 mb-1">Concluídas</p>
                    <p className="text-2xl font-bold text-green-600">{concluidasReq.length}</p>
                  </div>
                </div>
                <div className="card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left text-xs font-semibold text-slate-500 py-3 px-4">Costureira</th>
                        <th className="text-left text-xs font-semibold text-slate-500 py-3 px-4">Título</th>
                        <th className="text-left text-xs font-semibold text-slate-500 py-3 px-4">Tipo</th>
                        <th className="text-center text-xs font-semibold text-slate-500 py-3 px-4">Prioridade</th>
                        <th className="text-center text-xs font-semibold text-slate-500 py-3 px-4">Status</th>
                        <th className="text-left text-xs font-semibold text-slate-500 py-3 px-4">Prazo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map(r => (
                        <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-3 px-4 font-medium text-slate-800">{r.seamstressName}</td>
                          <td className="py-3 px-4 text-slate-700 text-sm">{r.title}</td>
                          <td className="py-3 px-4 text-slate-500 text-sm capitalize">{r.type}</td>
                          <td className="py-3 px-4 text-center text-sm capitalize">{r.priority}</td>
                          <td className="py-3 px-4 text-center text-sm capitalize">{r.status.replace('_', ' ')}</td>
                          <td className="py-3 px-4 text-slate-500 text-sm">{r.dueDate ? fmt(r.dueDate) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </AdminLayout>
  )
}
