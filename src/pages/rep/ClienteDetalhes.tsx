import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Phone, MessageSquare, ShoppingCart, Package, X, Check, MapPin } from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useClient, useOrders, useInteractions } from '@/hooks/useData'
import { createInteraction, logAudit } from '@/services/db'
import { LoadingSpinner, ErrorState } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate, daysSince, clientTypeLabel, cn } from '@/utils'
import { OrderStatusBadge } from '@/components/shared/StatusBadge'

type Tab = 'Resumo' | 'Pedidos' | 'Interações'

const TYPE_ICONS: Record<string, string> = {
  checkin: '📍', checkout: '✅', pedido: '🛒', orcamento: '📄',
  rota: '🗺️', ligacao: '📞', whatsapp: '💬', anotacao: '📝', visita: '👁️',
}

export default function ClienteDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('Resumo')
  const [showNote, setShowNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: client, loading, error } = useClient(id)
  const { data: orders = [], loading: loadingOrders } = useOrders(client?.repId)
  const { data: interactions = [], refetch: refetchInteractions } = useInteractions(id)

  if (loading) return <RepLayout title="Cliente"><LoadingSpinner /></RepLayout>
  if (error || !client) return (
    <RepLayout title="Cliente">
      <div className="p-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm mb-4">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <ErrorState message="Cliente não encontrado" />
      </div>
    </RepLayout>
  )

  const clientOrders = orders.filter(o => o.clientId === id)
  const dv = client.lastVisit ? daysSince(client.lastVisit) : 999
  const dp = client.lastOrder ? daysSince(client.lastOrder) : 999

  const handleAddNote = async () => {
    if (!noteText.trim() || !user) return
    setSaving(true)
    await createInteraction({
      clientId: id!, clientName: client.name, repId: user.id, repName: user.name,
      type: 'anotacao', title: 'Anotação registrada', description: noteText.trim(),
      timestamp: new Date().toISOString(),
    })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_client', entity: 'Cliente', entityId: id!, description: `Anotação em ${client.name}`, timestamp: new Date().toISOString() })
    setNoteText(''); setShowNote(false); setSaving(false)
    refetchInteractions()
  }

  return (
    <RepLayout title={client.name}>
      <div className="pb-8">
        <div className="px-4 pt-4 pb-3">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
          <h1 className="text-lg font-bold text-slate-900">{client.name}</h1>
          {client.tradeName && <p className="text-xs text-slate-400">{client.tradeName}</p>}
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3" />{client.address.city}, {client.address.state} · {clientTypeLabel(client.type)}
          </p>
        </div>

        {/* Quick actions */}
        <div className="px-4 pb-4 grid grid-cols-4 gap-2">
          {[
            { icon: Phone, label: 'Ligar', color: 'bg-green-600', action: () => window.open(`tel:${client.phone}`) },
            { icon: MessageSquare, label: 'WhatsApp', color: 'bg-green-500', action: () => window.open(`https://wa.me/55${client.phone.replace(/\D/g, '')}`, '_blank') },
            { icon: ShoppingCart, label: 'Pedido', color: 'bg-primary-600', action: () => navigate(`/rep/pedidos/novo?cliente=${id}`) },
            { icon: Package, label: 'Nota', color: 'bg-slate-600', action: () => setShowNote(true) },
          ].map(a => (
            <button key={a.label} onClick={a.action}
              className={`${a.color} text-white rounded-2xl py-3 flex flex-col items-center gap-1.5 text-[11px] font-semibold active:scale-95 transition-transform`}>
              <a.icon className="w-5 h-5" />{a.label}
            </button>
          ))}
        </div>

        {/* KPIs */}
        <div className="px-4 pb-4 grid grid-cols-3 gap-3">
          {[
            { label: 'Pedidos', value: String(client.totalOrders) },
            { label: 'Faturamento', value: formatCurrency(client.totalRevenue) },
            { label: 'Sem visita', value: dv < 999 ? `${dv}d` : 'Nunca', warn: dv > 30 },
          ].map(k => (
            <div key={k.label} className={cn('card p-3 text-center', k.warn && 'border-red-200 bg-red-50')}>
              <p className={cn('text-base font-bold', k.warn ? 'text-red-600' : 'text-slate-900')}>{k.value}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="px-4 flex gap-2 mb-4">
          {(['Resumo', 'Pedidos', 'Interações'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('px-4 py-2 rounded-xl text-xs font-semibold transition-all', tab === t ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600')}>
              {t}{t === 'Pedidos' && clientOrders.length > 0 && ` (${clientOrders.length})`}{t === 'Interações' && interactions.length > 0 && ` (${interactions.length})`}
            </button>
          ))}
        </div>

        <div className="px-4">
          {tab === 'Resumo' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="card p-4 space-y-3">
                {[
                  { label: 'Segmento', value: client.segment },
                  { label: 'CNPJ / CPF', value: client.cnpj ?? client.cpf },
                  { label: 'Telefone', value: client.phone },
                  { label: 'E-mail', value: client.email },
                  { label: 'Endereço', value: `${client.address.street}, ${client.address.city} - ${client.address.state}` },
                  { label: 'CEP', value: client.address.zipCode },
                  { label: 'Prioridade', value: client.priority.toUpperCase() },
                  { label: 'Sem pedido há', value: dp < 999 ? `${dp} dias` : 'Nunca pediu' },
                ].filter(f => f.value).map(f => (
                  <div key={f.label} className="flex justify-between gap-4 text-sm">
                    <span className="text-slate-400 flex-shrink-0">{f.label}</span>
                    <span className="font-medium text-slate-800 text-right">{f.value}</span>
                  </div>
                ))}
              </div>
              {client.notes && <div className="card p-4"><p className="text-xs font-semibold text-slate-500 mb-1">Observações</p><p className="text-sm text-slate-600">{client.notes}</p></div>}
            </motion.div>
          )}

          {tab === 'Pedidos' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {loadingOrders ? <LoadingSpinner label="Carregando pedidos..." /> :
               clientOrders.length === 0 ? <p className="text-center py-8 text-slate-400 text-sm">Nenhum pedido</p> :
               <div className="space-y-2">
                 {clientOrders.map(o => (
                   <button key={o.id} onClick={() => navigate(`/rep/pedidos/${o.id}`)} className="w-full card p-4 text-left">
                     <div className="flex items-center justify-between">
                       <div><p className="text-sm font-semibold text-slate-900">{o.number}</p><p className="text-xs text-slate-400">{formatDate(o.createdAt)}</p></div>
                       <div className="text-right"><p className="text-sm font-bold text-slate-900">{formatCurrency(o.total)}</p><OrderStatusBadge status={o.status} /></div>
                     </div>
                   </button>
                 ))}
               </div>}
            </motion.div>
          )}

          {tab === 'Interações' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {interactions.length === 0 ? <p className="text-center py-8 text-slate-400 text-sm">Nenhuma interação</p> :
               <div className="space-y-3">
                 {interactions.map(int => (
                   <div key={int.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                     <span className="text-lg flex-shrink-0">{TYPE_ICONS[int.type] ?? '📋'}</span>
                     <div className="flex-1 min-w-0">
                       <div className="flex items-center gap-2">
                         <p className="text-sm font-semibold text-slate-800">{int.title}</p>
                         {int.rating && <span className="text-xs text-amber-500">{'★'.repeat(int.rating)}</span>}
                       </div>
                       {int.description && <p className="text-xs text-slate-500 mt-0.5">{int.description}</p>}
                       <p className="text-xs text-slate-400 mt-1">{int.repName} · {new Date(int.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                     </div>
                   </div>
                 ))}
               </div>}
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showNote && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowNote(false)} />
            <motion.div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 z-50 safe-bottom" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-slate-900">Nova Anotação</p>
                <button onClick={() => setShowNote(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Descreva a observação..." rows={4} className="input resize-none mb-3" />
              <button onClick={handleAddNote} disabled={!noteText.trim() || saving}
                className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                <Check className="w-4 h-4" />{saving ? 'Salvando...' : 'Salvar Anotação'}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </RepLayout>
  )
}
