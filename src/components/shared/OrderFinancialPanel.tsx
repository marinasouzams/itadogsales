import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, RefreshCw, Save } from 'lucide-react'
import {
  getOrderReceivables, updateReceivable, deleteReceivable, createReceivable,
  reprocessOrderFinancial, logAudit,
} from '@/services/db'
import { formatCurrency, formatDate, cn } from '@/utils'
import { financialBaseDate } from '@/types'
import type { Order, User, FinancialReceivable } from '@/types'

interface Props {
  order: Order
  user: User | null
  refreshKey?: number
}

type Edit = { dueDate: string; amount: string; notes: string }

/** Seção Financeira do pedido: total, forma/condição, data de entrega e as
 *  parcelas — com edição individual (data/valor/obs), exclusão, adição e
 *  "Recalcular Parcelas" (regera a partir da data de entrega + condição). */
export default function OrderFinancialPanel({ order, user, refreshKey = 0 }: Props) {
  const [recs, setRecs] = useState<FinancialReceivable[]>([])
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmRecalc, setConfirmRecalc] = useState(false)
  const [local, setLocal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getOrderReceivables(order.id)
      setRecs(data)
      const e: Record<string, Edit> = {}
      data.forEach(r => { e[r.id] = { dueDate: r.dueDate.slice(0, 10), amount: String(r.amount), notes: r.notes ?? '' } })
      setEdits(e)
    } finally { setLoading(false) }
  }, [order.id])

  useEffect(() => { load() }, [load, refreshKey, local])

  const audit = (action: Parameters<typeof logAudit>[0]['action'], description: string, extra: Record<string, string> = {}) =>
    user && logAudit({ userId: user.id, userName: user.name, userRole: user.role, action, entity: 'Pedido', entityId: order.id, description, timestamp: new Date().toISOString(), ...extra })

  const saveRow = async (r: FinancialReceivable) => {
    const e = edits[r.id]; if (!e) return
    const newAmount = parseFloat(e.amount) || 0
    const changed = e.dueDate !== r.dueDate.slice(0, 10) || newAmount !== r.amount || (e.notes ?? '') !== (r.notes ?? '')
    if (!changed) return
    setBusy(true)
    try {
      await updateReceivable(r.id, { dueDate: e.dueDate, amount: newAmount, notes: e.notes })
      await audit('update_installment',
        `Parcela ${r.installmentNumber}/${r.installmentTotal} editada — venc ${formatDate(r.dueDate)}→${formatDate(e.dueDate)}, valor ${formatCurrency(r.amount)}→${formatCurrency(newAmount)}. Pedido ${order.number}`,
        { oldValue: `${r.dueDate} | ${r.amount}`, newValue: `${e.dueDate} | ${newAmount}` })
      setLocal(v => v + 1)
    } catch (err) { alert(err instanceof Error ? err.message : 'Erro ao salvar parcela') } finally { setBusy(false) }
  }

  const removeRow = async (r: FinancialReceivable) => {
    if (!confirm(`Remover a parcela ${r.installmentNumber}/${r.installmentTotal} (${formatCurrency(r.amount)})?`)) return
    setBusy(true)
    try {
      await deleteReceivable(r.id)
      await audit('delete_installment', `Parcela ${r.installmentNumber}/${r.installmentTotal} (${formatCurrency(r.amount)}, venc ${formatDate(r.dueDate)}) removida. Pedido ${order.number}`)
      setLocal(v => v + 1)
    } catch (err) { alert(err instanceof Error ? err.message : 'Erro ao remover parcela') } finally { setBusy(false) }
  }

  const addRow = async () => {
    setBusy(true)
    try {
      const base = financialBaseDate(order).slice(0, 10)
      await createReceivable(order, { dueDate: base, amount: 0 })
      await audit('create_installment', `Parcela adicionada manualmente ao pedido ${order.number}`)
      setLocal(v => v + 1)
    } catch (err) { alert(err instanceof Error ? err.message : 'Erro ao adicionar parcela') } finally { setBusy(false) }
  }

  const recalc = async () => {
    setConfirmRecalc(false); setBusy(true)
    try {
      const r = await reprocessOrderFinancial(order)
      await audit('recalculate_installments', `Parcelas recalculadas a partir da data de entrega (${formatDate(financialBaseDate(order))}) e condição "${order.paymentTerms ?? '—'}"${r.receivablesRecreated ? '' : ' (sem financeiro a recriar)'}. Pedido ${order.number}`)
      setLocal(v => v + 1)
    } catch (err) { alert(err instanceof Error ? err.message : 'Erro ao recalcular') } finally { setBusy(false) }
  }

  const totalParcelas = recs.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900 text-sm">💰 Financeiro do Pedido</h3>
        <button onClick={() => setConfirmRecalc(true)} disabled={busy}
          className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 border border-amber-200 bg-amber-50 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 disabled:opacity-50">
          <RefreshCw className="w-3.5 h-3.5" /> Recalcular Parcelas
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><p className="text-xs text-slate-400">Valor Total</p><p className="font-semibold text-slate-800">{formatCurrency(order.total)}</p></div>
        <div><p className="text-xs text-slate-400">Forma de Pagamento</p><p className="font-medium text-slate-700">{order.paymentMethod || '—'}</p></div>
        <div><p className="text-xs text-slate-400">Condição</p><p className="font-medium text-slate-700">{order.paymentTerms || '—'}</p></div>
        <div><p className="text-xs text-slate-400">Data de Entrega</p><p className="font-medium text-slate-700">{order.deliveryDate ? formatDate(order.deliveryDate) : 'Usa data da venda'}</p></div>
      </div>

      {/* Parcelas */}
      {loading ? (
        <p className="text-xs text-slate-400 py-3 text-center">Carregando parcelas...</p>
      ) : recs.length === 0 ? (
        <p className="text-xs text-slate-400 py-3 text-center">Nenhuma parcela gerada ainda.</p>
      ) : (
        <div className="space-y-2">
          {recs.map(r => {
            const e = edits[r.id] ?? { dueDate: '', amount: '', notes: '' }
            const dirty = e.dueDate !== r.dueDate.slice(0, 10) || (parseFloat(e.amount) || 0) !== r.amount || (e.notes ?? '') !== (r.notes ?? '')
            const isPaid = r.status === 'pago'
            return (
              <div key={r.id} className={cn('border rounded-xl p-2.5', isPaid ? 'border-green-200 bg-green-50/40' : 'border-slate-200')}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-600">Parcela {r.installmentNumber}/{r.installmentTotal}{isPaid && ' · paga'}</span>
                  <div className="flex items-center gap-1">
                    {dirty && !isPaid && (
                      <button onClick={() => saveRow(r)} disabled={busy} className="text-green-600 disabled:opacity-50" title="Salvar"><Save className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => removeRow(r)} disabled={busy} className="text-red-400 hover:text-red-600 disabled:opacity-50" title="Remover"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block">Vencimento</label>
                    <input type="date" value={e.dueDate} disabled={isPaid}
                      onChange={ev => setEdits(p => ({ ...p, [r.id]: { ...p[r.id], dueDate: ev.target.value } }))}
                      className="input py-1 text-xs w-full disabled:bg-slate-100" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block">Valor (R$)</label>
                    <input type="number" min="0" step="0.01" value={e.amount} disabled={isPaid}
                      onChange={ev => setEdits(p => ({ ...p, [r.id]: { ...p[r.id], amount: ev.target.value } }))}
                      className="input py-1 text-xs w-full disabled:bg-slate-100" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-slate-400 block">Observação</label>
                    <input type="text" value={e.notes}
                      onChange={ev => setEdits(p => ({ ...p, [r.id]: { ...p[r.id], notes: ev.target.value } }))}
                      className="input py-1 text-xs w-full" placeholder="Opcional" />
                  </div>
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between pt-1">
            <button onClick={addRow} disabled={busy} className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-50">
              <Plus className="w-4 h-4" /> Adicionar parcela
            </button>
            <span className="text-xs text-slate-500">Soma das parcelas: <strong className={cn(Math.abs(totalParcelas - order.total) > 0.01 ? 'text-amber-600' : 'text-slate-700')}>{formatCurrency(totalParcelas)}</strong></span>
          </div>
        </div>
      )}

      {confirmRecalc && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 text-sm">
          <p className="text-amber-800 mb-2">Esta ação substituirá as parcelas atuais, recalculando a partir da data de entrega e da condição de pagamento.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmRecalc(false)} className="flex-1 btn-secondary text-xs py-2">Cancelar</button>
            <button onClick={recalc} disabled={busy} className="flex-1 bg-amber-600 text-white font-semibold py-2 rounded-xl text-xs disabled:opacity-50">Recalcular</button>
          </div>
        </div>
      )}
    </div>
  )
}
