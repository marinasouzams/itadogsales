import { useState } from 'react'
import { useMemo } from 'react'
import { Users, TrendingUp, PartyPopper, Target, Pencil, Check } from 'lucide-react'
import { useCompanySettings } from '@/hooks/useData'
import { updateCompanySettings } from '@/services/db'
import { CRM_STAGES } from './KanbanBoard'
import { cn } from '@/utils'
import type { Prospect } from '@/types'

interface Props {
  prospects: Prospect[]
}

export default function CRMDashboard({ prospects }: Props) {
  const { data: settings, refetch: refetchSettings } = useCompanySettings()
  const goal = settings?.monthlyNewClientsGoal ?? 10
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('')

  async function saveGoal() {
    const n = Number(goalInput)
    if (n > 0) {
      await updateCompanySettings({ monthlyNewClientsGoal: n })
      refetchSettings()
    }
    setEditingGoal(false)
  }

  const stats = useMemo(() => {
    const total = prospects.length
    const active = prospects.filter(p => p.stage !== 'perdido' && p.stage !== 'pedido_realizado').length
    const monthKey = new Date().toISOString().slice(0, 7)
    const convertedThisMonth = prospects.filter(p => p.convertedAt?.slice(0, 7) === monthKey).length
    const lost = prospects.filter(p => p.stage === 'perdido').length
    const converted = prospects.filter(p => p.stage === 'pedido_realizado').length
    const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0

    const funnel = CRM_STAGES.map(s => ({
      ...s,
      count: prospects.filter(p => p.stage === s.key).length,
    }))
    const maxCount = Math.max(1, ...funnel.map(f => f.count))

    return { total, active, convertedThisMonth, lost, converted, conversionRate, funnel, maxCount }
  }, [prospects])

  const goalPct = Math.min(100, Math.round((stats.convertedThisMonth / Math.max(1, goal)) * 100))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
            <Users className="w-3.5 h-3.5" /> Total de prospects
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
            <TrendingUp className="w-3.5 h-3.5" /> Em andamento
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.active}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
            <PartyPopper className="w-3.5 h-3.5" /> Taxa de conversão
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.conversionRate}%</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <Target className="w-3.5 h-3.5" /> Novos clientes no mês
            </div>
            {editingGoal ? (
              <div className="flex items-center gap-1">
                <input type="number" min={1} value={goalInput} onChange={e => setGoalInput(e.target.value)}
                  className="w-14 text-xs border border-slate-200 rounded-lg px-1.5 py-0.5" autoFocus
                  onKeyDown={e => e.key === 'Enter' && saveGoal()} />
                <button onClick={saveGoal} className="text-green-600"><Check className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button onClick={() => { setEditingGoal(true); setGoalInput(String(goal)) }}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-primary-600">
                {stats.convertedThisMonth}/{goal} <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
            <div className={cn('h-full rounded-full transition-all', goalPct >= 100 ? 'bg-green-500' : 'bg-primary-600')}
              style={{ width: `${goalPct}%` }} />
          </div>
        </div>
      </div>

      <div className="card p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3">Funil comercial</p>
        <div className="space-y-1.5">
          {stats.funnel.map(f => (
            <div key={f.key} className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-32 flex-shrink-0 truncate">{f.label.replace(' 🎉', '')}</span>
              <div className="flex-1 h-5 bg-slate-50 rounded-lg overflow-hidden">
                <div className={cn('h-full rounded-lg flex items-center justify-end px-2', f.color)}
                  style={{ width: `${Math.max(6, Math.round((f.count / stats.maxCount) * 100))}%` }}>
                  {f.count > 0 && <span className="text-[10px] font-bold text-white">{f.count}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
