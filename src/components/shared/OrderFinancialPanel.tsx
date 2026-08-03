import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, RefreshCw, Save, CheckCircle2 } from 'lucide-react'
import {
  getOrderReceivables, updateReceivable, deleteReceivable, createReceivable,
  reprocessOrderFinancial, updateOrderAdmin, logAudit,
} from '@/services/db'
import { formatCurrency, formatDate, cn } from '@/utils'
import { financialBaseDate } from '@/types'
import type { Order, User, FinancialReceivable } from '@/types'

const FORMAS = ['PIX', 'Boleto', 'Dinheiro', 'Cartão', 'Transferência', 'Cheque', 'Pago Parcial']
const CONDICOES = ['À vista', '7 dias', '14 dias', '21 dias', '28 dias', '30 dias', '30/45', '30/60', '30/45/60', '30/60/90']

interface Props {
  order: Order
  user: User | null
  refreshKey?: number
  onOrderChanged?: () => void
}

type Edit = { dueDate: string; amount: string; notes: string }

/** Seção Financeira do pedido: total, forma/condição, data de entrega e as
 *  parcelas — com edição individual (data/valor/obs), exclusão, adição e
 *  "Recalcular Parcelas" (regera a partir da data de entrega + condição). */
export default function OrderFinancialPanel({ order, user, refreshKey = 0, onOrderChanged }: Props) {
  const [recs, setRecs] = useState<FinancialReceivable[]>([])
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmRecalc, setConfirmRecalc] = useState(false)
  const [local, setLocal] = useState(0)
  const [savedMsg, setSavedMsg] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashSaved = () => {
    setSavedMsg(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedMsg(false), 3000)
  }
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  // Informações financeiras editáveis (forma, condição, valor pago, observações)
  const condIsCustom = !!order.paymentTerms && !CONDICOES.includes(order.paymentTerms)
  const [forma, setForma] = useState(order.paymentMethod ?? '')
  const [cond, setCond] = useState(condIsCustom ? 'Outro' : (order.paymentTerms ?? ''))
  const [condOther, setCondOther] = useState(condIsCustom ? (order.paymentTerms ?? '') : '')
  const [valorPago, setValorPago] = useState(order.partialPaymentAmount ? String(order.partialPaymentAmount) : '')
  const [obs, setObs] = useState(order.partialPaymentNotes ?? '')
  const [savingInfo, setSavingInfo] = useState(false)

  const hasLocked = recs.some(r => r.status === 'pago' || r.status === 'parcial')

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
      flashSaved()
    } catch (err) { alert(err instanceof Error ? err.message : 'Erro ao salvar parcela') } finally { setBusy(false) }
  }

  const removeRow = async (r: FinancialReceivable) => {
    if (!confirm(`Remover a parcela ${r.installmentNumber}/${r.installmentTotal} (${formatCurrency(r.amount)})?`)) return
    setBusy(true)
    try {
      await deleteReceivable(r.id)
      await audit('delete_installment', `Parcela ${r.installmentNumber}/${r.installmentTotal} (${formatCurrency(r.amount)}, venc ${formatDate(r.dueDate)}) removida. Pedido ${order.number}`)
      setLocal(v => v + 1)
      flashSaved()
    } catch (err) { alert(err instanceof Error ? err.message : 'Erro ao remover parcela') } finally { setBusy(false) }
  }

  const addRow = async () => {
    setBusy(true)
    try {
      const base = financialBaseDate(order).slice(0, 10)
      await createReceivable(order, { dueDate: base, amount: 0 })
      await audit('create_installment', `Parcela adicionada manualmente ao pedido ${order.number}`)
      setLocal(v => v + 1)
      flashSaved()
    } catch (err) { alert(err instanceof Error ? err.message : 'Erro ao adicionar parcela') } finally { setBusy(false) }
  }

  // Pedido com as informações financeiras atuais do formulário (usado ao
  // recalcular logo após salvar, antes do refetch do pai).
  const condValue = cond === 'Outro' ? condOther.trim() : cond
  const effectiveOrder: Order = {
    ...order,
    paymentMethod: forma || undefined,
    paymentTerms: condValue || undefined,
    partialPaymentAmount: parseFloat(valorPago) || 0,
    partialPaymentNotes: obs || undefined,
  }

  const recalc = async () => {
    setConfirmRecalc(false); setBusy(true)
    try {
      const r = await reprocessOrderFinancial(effectiveOrder)
      await audit('recalculate_installments', `Parcelas recalculadas — entrega ${formatDate(financialBaseDate(effectiveOrder))}, condição "${condValue || '—'}", forma "${forma || '—'}"${r.hadLocked ? ' (parcelas pagas/parciais preservadas)' : ''}. Pedido ${order.number}`)
      setLocal(v => v + 1)
      flashSaved()
      onOrderChanged?.()
    } catch (err) { alert(err instanceof Error ? err.message : 'Erro ao recalcular') } finally { setBusy(false) }
  }

  const saveInfo = async () => {
    const formaChanged = (forma || '') !== (order.paymentMethod ?? '')
    const condChanged = (condValue || '') !== (order.paymentTerms ?? '')
    const valorChanged = (parseFloat(valorPago) || 0) !== (order.partialPaymentAmount ?? 0)
    const obsChanged = (obs || '') !== (order.partialPaymentNotes ?? '')
    if (!formaChanged && !condChanged && !valorChanged && !obsChanged) return
    setSavingInfo(true)
    try {
      await updateOrderAdmin(order.id, {
        paymentMethod: forma || undefined,
        paymentTerms: condValue || undefined,
        partialPaymentAmount: parseFloat(valorPago) || 0,
        partialPaymentNotes: obs || undefined,
      })
      if (formaChanged) await audit('payment_method_changed', `Forma de pagamento: "${order.paymentMethod ?? '—'}" → "${forma || '—'}". Pedido ${order.number}`, { oldValue: order.paymentMethod ?? '—', newValue: forma || '—' })
      if (condChanged) await audit('update_order_admin', `Condição de pagamento: "${order.paymentTerms ?? '—'}" → "${condValue || '—'}". Pedido ${order.number}`, { oldValue: order.paymentTerms ?? '—', newValue: condValue || '—' })
      if (valorChanged) await audit('update_order_admin', `Valor pago alterado: ${formatCurrency(order.partialPaymentAmount ?? 0)} → ${formatCurrency(parseFloat(valorPago) || 0)}. Pedido ${order.number}`)
      // Se mudou forma ou condição e já existe financeiro, oferece recalcular ANTES de
      // recarregar (o refetch do pai remonta o painel e perderia a confirmação).
      if ((formaChanged || condChanged) && recs.length > 0) setConfirmRecalc(true)
      else { flashSaved(); onOrderChanged?.() }
    } catch (err) { alert(err instanceof Error ? err.message : 'Erro ao salvar informações financeiras') } finally { setSavingInfo(false) }
  }

  const infoDirty = (forma || '') !== (order.paymentMethod ?? '')
    || (condValue || '') !== (order.paymentTerms ?? '')
    || (parseFloat(valorPago) || 0) !== (order.partialPaymentAmount ?? 0)
    || (obs || '') !== (order.partialPaymentNotes ?? '')

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

      {savedMsg && (
        <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 text-xs font-medium rounded-lg px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          Alterações financeiras salvas e documentos atualizados com sucesso.
        </div>
      )}

      {/* Informações financeiras editáveis */}
      <div className="bg-slate-50 rounded-xl p-3 space-y-2.5">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400 text-xs">Valor Total</span>
          <span className="font-semibold text-slate-800">{formatCurrency(order.total)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-400 block">Forma de Pagamento</label>
            <select value={forma} onChange={e => setForma(e.target.value)} className="input py-1 text-xs w-full bg-white">
              <option value="">—</option>
              {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block">Condição de Pagamento</label>
            <select value={cond} onChange={e => setCond(e.target.value)} className="input py-1 text-xs w-full bg-white">
              <option value="">—</option>
              {CONDICOES.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="Outro">Outro…</option>
            </select>
          </div>
          {cond === 'Outro' && (
            <div className="col-span-2">
              <input value={condOther} onChange={e => setCondOther(e.target.value)} placeholder="Ex: 30/60/90/120"
                className="input py-1 text-xs w-full" />
            </div>
          )}
          <div>
            <label className="text-[10px] text-slate-400 block">Valor Pago (R$)</label>
            <input type="number" min="0" step="0.01" value={valorPago} onChange={e => setValorPago(e.target.value)}
              placeholder="0,00" className="input py-1 text-xs w-full" />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block">Data de Entrega</label>
            <div className="input py-1 text-xs w-full bg-slate-100 text-slate-500">{order.deliveryDate ? formatDate(order.deliveryDate) : 'Usa data da venda'}</div>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-slate-400 block">Observações Financeiras</label>
            <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" className="input py-1 text-xs w-full" />
          </div>
        </div>
        {infoDirty && (
          <button onClick={saveInfo} disabled={savingInfo}
            className="w-full flex items-center justify-center gap-1.5 bg-primary-600 text-white text-xs font-semibold py-2 rounded-lg disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {savingInfo ? 'Salvando...' : 'Salvar informações financeiras'}
          </button>
        )}
        <p className="text-[10px] text-slate-400">Alterar forma ou condição com financeiro gerado abre o recálculo das parcelas em aberto. A Data de Entrega é editada no topo do pedido.</p>
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
          <p className="text-amber-800 mb-2">
            Este pedido já possui parcelas financeiras geradas. Deseja recalcular automaticamente o
            financeiro com a nova condição de pagamento? Esta ação substituirá as parcelas em aberto.
          </p>
          {hasLocked && (
            <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mb-2 text-xs">
              Existem parcelas já liquidadas ou parcialmente liquidadas. As alterações serão aplicadas
              <strong> apenas às parcelas em aberto</strong> — as pagas/parciais serão preservadas.
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={() => { setConfirmRecalc(false); onOrderChanged?.() }} className="flex-1 btn-secondary text-xs py-2">Cancelar</button>
            <button onClick={recalc} disabled={busy} className="flex-1 bg-amber-600 text-white font-semibold py-2 rounded-xl text-xs disabled:opacity-50">Recalcular Financeiro</button>
          </div>
        </div>
      )}
    </div>
  )
}
