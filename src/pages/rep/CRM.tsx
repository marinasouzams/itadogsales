import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useProspects, useClients } from '@/hooks/useData'
import { moveProspectStage, logAudit } from '@/services/db'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import KanbanBoard, { CRM_STAGES } from '@/components/shared/KanbanBoard'
import ProspectCard from '@/components/shared/ProspectCard'
import NewProspectModal from '@/components/shared/NewProspectModal'
import RegisterFollowupModal from '@/components/shared/RegisterFollowupModal'
import ScheduleFollowupModal from '@/components/shared/ScheduleFollowupModal'
import LostReasonModal from '@/components/shared/LostReasonModal'
import type { Prospect, ProspectStage } from '@/types'

export default function CRM() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: allProspects = [], loading, refetch } = useProspects()
  const { data: allClients = [] } = useClients()

  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [followupTarget, setFollowupTarget] = useState<Prospect | null>(null)
  const [scheduleTarget, setScheduleTarget] = useState<Prospect | null>(null)
  const [lostTarget, setLostTarget] = useState<Prospect | null>(null)
  const [savingLost, setSavingLost] = useState(false)

  const myProspects = useMemo(() =>
    allProspects
      .filter(p => p.repId === user?.id)
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.city.toLowerCase().includes(search.toLowerCase())),
    [allProspects, user?.id, search],
  )

  async function handleMove(id: string, stage: ProspectStage) {
    const prospect = allProspects.find(p => p.id === id)
    if (!prospect) return
    if (stage === 'perdido') { setLostTarget(prospect); return }
    await moveProspectStage(id, stage)
    if (user) {
      await logAudit({
        userId: user.id, userName: user.name, userRole: user.role, action: 'move_prospect_stage',
        entity: 'Prospect', entityId: id,
        description: `${prospect.name}: ${prospect.stage} → ${stage}`,
        timestamp: new Date().toISOString(),
      })
    }
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
    <RepLayout title="CRM">
      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar prospect ou cidade..."
              className="input pl-10 w-full" />
          </div>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {loading ? <div className="py-10"><LoadingSpinner /></div> : (
          <KanbanBoard
            columns={CRM_STAGES}
            items={myProspects}
            onMove={handleMove}
            renderCard={(p, dragProps) => (
              <ProspectCard
                key={p.id}
                prospect={p}
                {...dragProps}
                onOpen={() => navigate(`/rep/crm/${p.id}`)}
                onMoveStage={stage => handleMove(p.id, stage)}
                onCall={() => window.open(`tel:${p.phone}`)}
                onWhatsapp={() => window.open(`https://wa.me/55${(p.whatsapp || p.phone).replace(/\D/g, '')}`, '_blank')}
                onRegisterContact={() => setFollowupTarget(p)}
                onScheduleFollowup={() => setScheduleTarget(p)}
              />
            )}
          />
        )}
      </div>

      <NewProspectModal
        open={showNew}
        userId={user?.id ?? ''} userName={user?.name ?? ''} userRole="rep"
        existingClients={allClients}
        onClose={() => setShowNew(false)}
        onCreated={refetch}
      />
      <RegisterFollowupModal
        open={!!followupTarget} prospect={followupTarget}
        userId={user?.id ?? ''} userName={user?.name ?? ''} userRole="rep"
        onClose={() => setFollowupTarget(null)} onSaved={refetch}
      />
      <ScheduleFollowupModal
        open={!!scheduleTarget} prospect={scheduleTarget}
        userId={user?.id ?? ''} userName={user?.name ?? ''} userRole="rep"
        onClose={() => setScheduleTarget(null)} onSaved={refetch}
      />
      <LostReasonModal
        open={!!lostTarget} prospectName={lostTarget?.name ?? ''} saving={savingLost}
        onCancel={() => setLostTarget(null)} onConfirm={handleConfirmLost}
      />
    </RepLayout>
  )
}
