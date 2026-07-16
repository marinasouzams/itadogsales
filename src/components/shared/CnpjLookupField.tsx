import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { formatCnpj, stripCnpj, validateCnpj, lookupCnpj, type CnpjData } from '@/services/cnpj'
import type { Client } from '@/types'
import { cn } from '@/utils'

interface Props {
  value: string
  onChange: (v: string) => void
  onFill: (data: CnpjData) => void
  existingClients?: Client[]
  onNavigateToDuplicate?: (id: string) => void
  autoFilled?: boolean
}

export default function CnpjLookupField({
  value, onChange, onFill, existingClients = [], onNavigateToDuplicate, autoFilled,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [duplicate, setDuplicate] = useState<Client | null>(null)
  const autoTriggered = useRef(false)

  const stripped = stripCnpj(value)
  const isValid  = stripped.length === 14 && validateCnpj(stripped)

  // Auto-busca ao completar 14 dígitos válidos
  useEffect(() => {
    if (!isValid) { autoTriggered.current = false; return }
    if (autoTriggered.current) return
    autoTriggered.current = true
    handleLookup()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, stripped])

  const handleLookup = async () => {
    if (!isValid) { setError('CNPJ inválido.'); return }
    setError(''); setSuccess(false); setDuplicate(null)

    // Verifica duplicata
    const dup = existingClients.find(c => stripCnpj(c.cnpj ?? '') === stripped)
    if (dup) { setDuplicate(dup); return }

    setLoading(true)
    try {
      const data = await lookupCnpj(stripped)
      onFill(data)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na consulta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={value}
            onChange={e => {
              autoTriggered.current = false
              setError(''); setSuccess(false); setDuplicate(null)
              onChange(formatCnpj(e.target.value))
            }}
            placeholder="00.000.000/0001-00"
            maxLength={18}
            className={cn(
              'input w-full',
              autoFilled && 'border-blue-400 bg-blue-50/40',
              success    && 'border-green-400 bg-green-50/40',
            )}
          />
          {success && (
            <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500 pointer-events-none" />
          )}
        </div>
        <button
          type="button"
          onClick={handleLookup}
          disabled={loading || !isValid}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold disabled:opacity-40 hover:bg-primary-700 transition-colors whitespace-nowrap"
        >
          {loading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Consultando...</>
            : <><Search className="w-3.5 h-3.5" /> Buscar CNPJ</>
          }
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* CNPJ duplicado */}
      {duplicate && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 font-medium">
              Já existe um cliente cadastrado com este CNPJ:<br />
              <strong>{duplicate.name}</strong>
            </p>
          </div>
          {onNavigateToDuplicate && (
            <button
              type="button"
              onClick={() => onNavigateToDuplicate(duplicate.id)}
              className="text-xs font-semibold text-primary-600 hover:underline"
            >
              Abrir cadastro existente →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
