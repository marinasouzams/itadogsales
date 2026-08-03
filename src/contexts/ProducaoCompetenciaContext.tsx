import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'
import type { CompetenciaFilter, CompetenciaOption } from '@/types'

function pad(n: number) { return String(n).padStart(2, '0') }
function iso(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}` }
function lastDayOfMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }

function computeRange(option: CompetenciaOption, customFrom?: string, customTo?: string): { from: string | null; to: string | null } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  switch (option) {
    case 'mes_atual':
      return { from: iso(y, m, 1), to: iso(y, m, lastDayOfMonth(y, m)) }
    case 'mes_anterior': {
      const pm = (m - 1 + 12) % 12
      const py = m === 0 ? y - 1 : y
      return { from: iso(py, pm, 1), to: iso(py, pm, lastDayOfMonth(py, pm)) }
    }
    case 'ultimos_3_meses': {
      const sm = (m - 2 + 24) % 12
      const sy = m - 2 < 0 ? y - 1 : y
      return { from: iso(sy, sm, 1), to: iso(y, m, lastDayOfMonth(y, m)) }
    }
    case 'este_ano':
      return { from: iso(y, 0, 1), to: iso(y, 11, 31) }
    case 'todos':
      return { from: null, to: null }
    case 'personalizado':
      return { from: customFrom ?? null, to: customTo ?? null }
  }
}

interface ProducaoCompetenciaCtx {
  filter: CompetenciaFilter
  setOption: (option: CompetenciaOption) => void
  setCustomRange: (from: string, to: string) => void
}

const Ctx = createContext<ProducaoCompetenciaCtx | null>(null)

/** Filtro de competência (mês/período) compartilhado entre as telas do
 *  módulo Produção (Ordens, Financeiro, Dashboard). Vive no ProducaoLayout
 *  — persiste enquanto o usuário navega dentro do módulo, reseta para
 *  "Mês Atual" ao sair e voltar (sem localStorage, por design). */
export function ProducaoCompetenciaProvider({ children }: { children: ReactNode }) {
  const [option, setOption] = useState<CompetenciaOption>('mes_atual')
  const [customFrom, setCustomFrom] = useState<string | undefined>()
  const [customTo, setCustomTo] = useState<string | undefined>()

  const filter = useMemo<CompetenciaFilter>(() => {
    const { from, to } = computeRange(option, customFrom, customTo)
    return { option, from, to, customFrom, customTo }
  }, [option, customFrom, customTo])

  function setCustomRange(from: string, to: string) {
    setCustomFrom(from)
    setCustomTo(to)
    setOption('personalizado')
  }

  return (
    <Ctx.Provider value={{ filter, setOption, setCustomRange }}>
      {children}
    </Ctx.Provider>
  )
}

export function useProducaoCompetencia(): ProducaoCompetenciaCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProducaoCompetencia deve ser usado dentro de ProducaoCompetenciaProvider')
  return ctx
}

export const COMPETENCIA_LABELS: Record<CompetenciaOption, string> = {
  mes_atual: 'Mês Atual',
  mes_anterior: 'Mês Anterior',
  ultimos_3_meses: 'Últimos 3 Meses',
  este_ano: 'Este Ano',
  todos: 'Todos',
  personalizado: 'Período Personalizado',
}
