import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, MapPinned } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useProspects, useClients, useUsers, useRegions } from '@/hooks/useData'
import { moveProspectStage, logAudit } from '@/services/db'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import KanbanBoard, { CRM_STAGES } from '@/components/shared/KanbanBoard'
import ProspectCard from '@/components/shared/ProspectCard'
import NewProspectModal from '@/components/shared/NewProspectModal'
import RegisterFollowupModal from '@/components/shared/RegisterFollowupModal'
import ScheduleFollowupModal from '@/components/shared/ScheduleFollowupModal'
import LostReasonModal from '@/components/shared/LostReasonModal'
import RegionsManagerModal from '@/components/shared/RegionsManagerModal'
import CRMDashboard from '@/components/shared/CRMDashboard'
import { cn, matchesProspectShortcut, type ProspectShortcut } from '@/utils'
import type { Prospect, ProspectStage, FollowupChannel } from '@/types'

const SHORTCUTS: { key: ProspectShortcut; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'hoje', label: 'Hoje' },
  { key: 'atrasados', label: 'Atrasados' },
  { key: 'sem_contato', label: 'Sem contato' },
]

export default function AdminCRM() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: allProspects = [], loading, refetch } = useProspects()
  const { data: allClients = [] } = useClients()
  const { data: users = [] } = useUsers()
  const { data: regions = [] } = useRegions()
  const reps = users.filter(u => u.role === 'rep' && u.active)

  const [search, setSearch] = useState('')
  const [repFilter, setRepFilter] = useState('todos')
  const [regionFilter, setRegionFilter] = useState('todas')
  const [attemptsFilter, setAttemptsFilter] = useState('todos')
  const [shortcut, setShortcut] = useState<ProspectShortcut>('todos')
  const [showNew, setShowNew] = useState(false)
  const [showRegions, setShowRegions] = useState(false)
  const [followupTarget, setFollowupTarget] = useState<Prospect | null>(null)
  const [followupChannel, setFollowupChannel] = useState<FollowupChannel | undefined>(undefined)
  const [scheduleTarget, setScheduleTarget] = useState<Prospect | null>(null)
  const [lostTarget, setLostTarget] = useState<Prospect | null>(null)
  const [savingLost, setSavingLost] = useState(false)

  const filtered = useMemo(() =>
    allProspects
      .filter(p => repFilter === 'todos' || p.repId === repFilter)
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.city.toLowerCase().includes(search.toLowerCase()))
      .filter(p => regionFilter === 'todas' || p.regionId === regionFilter)
      .filter(p => {
        const a = p.attempts ?? 0
        if (attemptsFilter === 'todos') return true
        if (attemptsFilter === '0') return a === 0
        if (attemptsFilter === '1-2') return a >= 1 && a <= 2
        if (attemptsFilter === '3-4') return a >= 3 && a <= 4
        if (attemptsFilter === '5') return a >= 5
        return true
      })
      .filter(p => matchesProspectShortcut(p, shortcut)),
    [allProspects, repFilter, search, regionFilter, attemptsFilter, shortcut],
  )

  async function handleMove(id: string, stage: ProspectStage) {
    const prospect = allProspects.find(p => p.id === id)
    if (!prospect || !user) return
    if (stage === 'perdido') { setLostTarget(prospect); return }
    await moveProspectStage(id, stage)
    await logAudit({
      userId: user.id, userName: user.name, userRole: user.role, action: 'move_prospect_stage',
      entity: 'Prospect', entityId: id,
      description: `${prospect.name}: ${prospect.stage} → ${stage}`,
      timestamp: new Date().toISOString(),
    })
    refetch()
  }

  async function handleConfirmLost(reason: string, detail?: string) {
    if (!lostTarget || !user) return
    setSavingLost(true)
    try {
      await moveProspectStage(lostTarget.id, 'perdido', { lostReason: reason, lostReasonDetail: detail })
      await logAudit({
        userId: user.id, userName: user.name, userRole: user.role, action: 'move_prospect_stage',
        entity: 'Prospect', entityId: lostTarget.id,
        description: `${lostTarget.name} marcado como perdido — motivo: ${reason}${detail ? ' — ' + detail : ''}`,
        timestamp: new Date().toISOString(),
      })
      setLostTarget(null)
      refetch()
    } finally { setSavingLost(false) }
  }

  return (
    <AdminLayout title="CRM">
      <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">CRM Comercial</h1>
            <p className="text-sm text-slate-500">{filtered.length} prospect(s)</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowRegions(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
              <MapPinned className="w-4 h-4" /> Regiões
            </button>
            <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Novo Prospect
            </button>
          </div>
        </div>

        <CRMDashboard prospects={allProspects} />

        <div className="flex gap-1.5 flex-wrap">
          {SHORTCUTS.map(s => (
            <button
              key={s.key}
              onClick={() => setShortcut(s.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                shortcut === s.key ? 'bg-primary-600 text-white border-primary-600' : 'bg-white border-slate-200 text-slate-600',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar prospect ou cidade..." className="input pl-10" />
          </div>
          <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="input w-auto min-w-44">
            <option value="todos">Todos representantes</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="input w-auto min-w-40">
            <option value="todas">Todas as regiões</option>
            {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={attemptsFilter} onChange={e => setAttemptsFilter(e.target.value)} className="input w-auto min-w-40">
            <option value="todos">Todas tentativas</option>
            <option value="0">Sem tentativa</option>
            <option value="1-2">1-2 tentativas</option>
            <option value="3-4">3-4 tentativas</option>
            <option value="5">5 tentativas</option>
          </select>
        </div>

        {loading ? <div className="py-10"><LoadingSpinner /></div> : (
          <KanbanBoard
            columns={CRM_STAGES}
            items={filtered}
            onMove={handleMove}
            renderCard={(p, dragProps) => (
              <ProspectCard
                key={p.id}
                prospect={p}
                showRep
                {...dragProps}
                onOpen={() => navigate(`/admin/crm/${p.id}`)}
                onMoveStage={stage => handleMove(p.id, stage)}
                onCall={() => window.open(`tel:${p.phone}`)}
                onWhatsapp={() => window.open(`https://wa.me/55${(p.whatsapp || p.phone).replace(/\D/g, '')}`, '_blank')}
                onRegisterContact={() => { setFollowupChannel(undefined); setFollowupTarget(p) }}
                onVisit={() => { setFollowupChannel('visita'); setFollowupTarget(p) }}
                onScheduleFollowup={() => setScheduleTarget(p)}
              />
            )}
          />
        )}
      </div>

      <NewProspectModal
        open={showNew}
        userId={user?.id ?? ''} userName={user?.name ?? ''} userRole="admin"
        existingClients={allClients} reps={reps}
        onClose={() => setShowNew(false)}
        onCreated={refetch}
      />
      <RegisterFollowupModal
        open={!!followupTarget} prospect={followupTarget} initialChannel={followupChannel}
        userId={user?.id ?? ''} userName={user?.name ?? ''} userRole="admin"
        onClose={() => setFollowupTarget(null)} onSaved={refetch}
      />
      <ScheduleFollowupModal
        open={!!scheduleTarget} prospect={scheduleTarget}
        userId={user?.id ?? ''} userName={user?.name ?? ''} userRole="admin"
        onClose={() => setScheduleTarget(null)} onSaved={refetch}
      />
      <LostReasonModal
        open={!!lostTarget} prospectName={lostTarget?.name ?? ''} saving={savingLost}
        onCancel={() => setLostTarget(null)} onConfirm={handleConfirmLost}
      />
      <RegionsManagerModal open={showRegions} onClose={() => setShowRegions(false)} />
    </AdminLayout>
  )
}
