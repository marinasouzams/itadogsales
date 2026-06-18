import { Plus, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/utils'
import type { OrderCheck } from '@/types'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

/** Cria um cheque vazio (id local). */
export function newCheck(amount = 0): OrderCheck {
  return { id: uid(), amount, compensationDate: '' }
}

interface Props {
  checks: OrderCheck[]
  onChange: (checks: OrderCheck[]) => void
}

/** Editor de múltiplos cheques (valor + data de compensação + dados opcionais).
 *  Reutilizado na criação (rep) e na edição (admin) do pedido. */
export default function ChecksEditor({ checks, onChange }: Props) {
  const add = () => onChange([...checks, newCheck()])
  const update = (id: string, patch: Partial<OrderCheck>) =>
    onChange(checks.map(c => (c.id === id ? { ...c, ...patch } : c)))
  const remove = (id: string) => onChange(checks.filter(c => c.id !== id))
  const total = checks.reduce((s, c) => s + (Number(c.amount) || 0), 0)

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 space-y-3 mt-2">
      <p className="text-xs font-semibold text-teal-800">Cheques</p>

      {checks.map((c, i) => (
        <div key={c.id} className="bg-white border border-teal-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-teal-700">Cheque {String(i + 1).padStart(2, '0')}</span>
            <button type="button" onClick={() => remove(c.id)} className="text-red-500 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Valor (R$) *</label>
              <input type="number" min="0" step="0.01" value={c.amount || ''}
                onChange={e => update(c.id, { amount: parseFloat(e.target.value) || 0 })}
                placeholder="0,00" className="input text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Data de compensação *</label>
              <input type="date" value={c.compensationDate}
                onChange={e => update(c.id, { compensationDate: e.target.value })}
                className="input text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Número do cheque</label>
              <input type="text" value={c.number ?? ''} onChange={e => update(c.id, { number: e.target.value })}
                placeholder="Ex: 000123" className="input text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Banco</label>
              <input type="text" value={c.bank ?? ''} onChange={e => update(c.id, { bank: e.target.value })}
                placeholder="Ex: Banco do Brasil" className="input text-sm w-full" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-500 mb-1 block">Titular</label>
              <input type="text" value={c.holder ?? ''} onChange={e => update(c.id, { holder: e.target.value })}
                placeholder="Nome do titular" className="input text-sm w-full" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-500 mb-1 block">Observações</label>
              <input type="text" value={c.notes ?? ''} onChange={e => update(c.id, { notes: e.target.value })}
                placeholder="Opcional" className="input text-sm w-full" />
            </div>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button type="button" onClick={add}
          className="flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-800">
          <Plus className="w-4 h-4" /> Adicionar cheque
        </button>
        {checks.length > 0 && (
          <span className="text-xs text-slate-500">Total: <strong className="text-teal-700">{formatCurrency(total)}</strong></span>
        )}
      </div>
    </div>
  )
}
