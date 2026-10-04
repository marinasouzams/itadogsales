import { useState } from 'react'
import { cn } from '@/utils'
import { PAYMENT_TERMS, OTHER_TERMS, isListTerm, sanitizeTermsInput, termsError, termsSummary } from '@/utils/paymentTerms'

interface Props {
  value: string
  onChange: (value: string) => void
  /** chips = botões (telas grandes); select = lista suspensa (telas compactas) */
  variant?: 'chips' | 'select'
  size?: 'sm' | 'md'
}

/** Condição de pagamento: lista padrão + "Outro" (só números de dias, ex.: 30/60/90).
 *  O valor pode chegar fora do padrão (pedidos antigos) — aparece em "Outro" com o aviso. */
export default function PaymentTermsPicker({ value, onChange, variant = 'chips', size = 'md' }: Props) {
  const [other, setOther] = useState(() => !!value && !isListTerm(value))
  const selected = other ? OTHER_TERMS : value
  const error = other ? termsError(value) : null
  const summary = other && !error ? termsSummary(value) : null

  const pick = (opt: string) => {
    if (opt === OTHER_TERMS) {
      if (!other) { setOther(true); onChange('') }
      return
    }
    setOther(false)
    // "—" na lista, ou clicar de novo no botão já escolhido, desmarca
    onChange(variant === 'chips' && opt === value ? '' : opt)
  }

  const sm = size === 'sm'

  return (
    <div className="space-y-1.5">
      {variant === 'chips' ? (
        <div className="flex flex-wrap gap-2">
          {[...PAYMENT_TERMS, OTHER_TERMS].map(opt => (
            <button key={opt} type="button" onClick={() => pick(opt)}
              className={cn('rounded-xl font-semibold border-2 transition-all',
                sm ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm',
                selected === opt ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 text-slate-600 bg-white')}>
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <select value={selected} onChange={e => pick(e.target.value)}
          className={cn('input w-full bg-white', sm && 'py-1 text-xs')}>
          <option value="">—</option>
          {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
          <option value={OTHER_TERMS}>Outro…</option>
        </select>
      )}

      {other && (
        <>
          <input value={value} inputMode="numeric" autoFocus={!value}
            onChange={e => onChange(sanitizeTermsInput(e.target.value))}
            placeholder="Dias de cada parcela. Ex.: 30/60/90/120"
            className={cn('input w-full', sm ? 'py-1 text-xs' : 'text-sm', error && 'border-red-300 focus:ring-red-200')} />
          {error && <p className={cn('text-red-600', sm ? 'text-[10px]' : 'text-xs')}>{error}</p>}
          {summary && <p className={cn('text-slate-500', sm ? 'text-[10px]' : 'text-xs')}>{summary}</p>}
        </>
      )}
    </div>
  )
}
