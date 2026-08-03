import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Phone, MessageSquare, ShoppingCart, Package, X, Check, MapPin, Trash2, Plus } from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useClient, useOrders, useInteractions } from '@/hooks/useData'
import { createInteraction, createVisit, deleteClient, logAudit } from '@/services/db'
import { LoadingSpinner, ErrorState } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate, daysSince, clientTypeLabel, cn } from '@/utils'
import { OrderStatusBadge, ClientApprovalBadge } from '@/components/shared/StatusBadge'
import type { VisitResult } from '@/types'

type Tab = 'Resumo' | 'Pedidos' | 'Interações'

const CREDIT_COLORS: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-800',
  'A': 'bg-green-100 text-green-800',
  'B': 'bg-blue-100 text-blue-800',
  'C': 'bg-yellow-100 text-yellow-800',
  'D': 'bg-orange-100 text-orange-800',
  'Bloqueado': 'bg-red-100 text-red-800',
}

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Nova Visita state
  const [showVisit, setShowVisit] = useState(false)
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [visitTime, setVisitTime] = useState(() => new Date().toTimeString().slice(0, 5))
  const [visitResult, setVisitResult] = useState<VisitResult | ''>('')
  const [visitRating, setVisitRating] = useState(0)
  const [visitNotes, setVisitNotes] = useState('')
  const [savingVisit, setSavingVisit] = useState(false)

  // Note date/time state
  const [noteDate, setNoteDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [noteTime, setNoteTime] = useState(() => new Date().toTimeString().slice(0, 5))

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
    const ts = new Date(`${noteDate}T${noteTime}:00`).toISOString()
    await createInteraction({
      clientId: id!, clientName: client.name, repId: user.id, repName: user.name,
      type: 'anotacao', title: 'Anotação registrada', description: noteText.trim(),
      timestamp: ts,
    })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_client', entity: 'Cliente', entityId: id!, description: `Anotação em ${client.name}`, timestamp: new Date().toISOString() })
    setNoteText(''); setShowNote(false); setSaving(false)
    refetchInteractions()
  }

  const handleAddVisit = async () => {
    if (!user) return
    setSavingVisit(true)
    const ts = new Date(`${visitDate}T${visitTime}:00`).toISOString()
    await createVisit({
      clientId: id!, clientName: client.name,
      repId: user.id, repName: user.name,
      status: 'concluida',
      result: visitResult || undefined,
      rating: visitRating || undefined,
      notes: visitNotes.trim() || undefined,
    })
    await createInteraction({
      clientId: id!, clientName: client.name, repId: user.id, repName: user.name,
      type: 'visita', title: 'Visita registrada',
      description: visitNotes.trim() || undefined,
      rating: visitRating || undefined,
      timestamp: ts,
    })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_client', entity: 'Cliente', entityId: id!, description: `Visita registrada em ${client.name}`, timestamp: new Date().toISOString() })
    setVisitResult(''); setVisitRating(0); setVisitNotes('')
    setShowVisit(false); setSavingVisit(false)
    refetchInteractions()
  }

  const handleDeleteClient = async () => {
    if (!user) return
    setDeleting(true)
    await deleteClient(id!)
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_client', entity: 'Cliente', entityId: id!, description: `Cliente ${client?.name} excluído`, timestamp: new Date().toISOString() })
    navigate('/rep/clientes', { replace: true })
  }

  return (
    <RepLayout title={client.name}>
      <div className="pb-8">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm">
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
            <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-700">
              <Trash2 className="w-4 h-4" /> Excluir
            </button>
          </div>
          <h1 className="text-lg font-bold text-slate-900">{client.name}</h1>
          {client.tradeName && <p className="text-xs text-slate-400">{client.tradeName}</p>}
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3" />{client.address.city}, {client.address.state} · {clientTypeLabel(client.type)}
          </p>
          {client.approvalStatus !== 'aprovado' && (
            <div className="mt-2"><ClientApprovalBadge status={client.approvalStatus} /></div>
          )}
        </div>

        {/* Banner de aprovação pendente/devolvido/reprovado */}
        {client.approvalStatus !== 'aprovado' && (
          <div className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            {client.approvalStatus === 'pendente' && (
              <p className="text-xs text-amber-800">
                Este cadastro está aguardando aprovação do responsável administrativo. Pedidos ficam liberados assim que for aprovado.
              </p>
            )}
            {client.approvalStatus === 'devolvido' && (
              <>
                <p className="text-xs font-semibold text-amber-800">Cadastro devolvido para correção:</p>
                <p className="text-xs text-amber-800 mt-0.5">{client.approvalReason || 'Nenhum motivo informado.'}</p>
              </>
            )}
            {client.approvalStatus === 'reprovado' && (
              <>
                <p className="text-xs font-semibold text-red-700">Cadastro reprovado:</p>
                <p className="text-xs text-red-700 mt-0.5">{client.approvalReason || 'Nenhum motivo informado.'}</p>
              </>
            )}
          </div>
        )}

        {/* Quick actions */}
        <div className="px-4 pb-4 grid grid-cols-4 gap-2">
          {[
            { icon: Phone, label: 'Ligar', color: 'bg-green-600', action: () => window.open(`tel:${client.phone}`) },
            { icon: MessageSquare, label: 'WhatsApp', color: 'bg-green-500', action: () => window.open(`https://wa.me/55${client.phone.replace(/\D/g, '')}`, '_blank') },
            {
              icon: ShoppingCart, label: 'Pedido',
              color: client.approvalStatus === 'aprovado' ? 'bg-primary-600' : 'bg-slate-300',
              action: () => {
                if (client.approvalStatus !== 'aprovado') {
                  alert('Este cliente ainda não foi aprovado. Pedidos só podem ser feitos após a aprovação do cadastro.')
                  return
                }
                navigate(`/rep/pedidos/novo?cliente=${id}`)
              },
            },
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

              {/* Responsável pela Compra */}
              {((client as any).buyerName || (client as any).buyerPhone || (client as any).buyerEmail) && (
                <div className="card p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Responsável pela Compra</p>
                  {[
                    { label: 'Nome', value: (client as any).buyerName },
                    { label: 'Telefone', value: (client as any).buyerPhone },
                    { label: 'WhatsApp', value: (client as any).buyerWhatsapp },
                    { label: 'E-mail', value: (client as any).buyerEmail },
                    { label: 'Aniversário', value: (client as any).buyerBirthday },
                  ].filter(f => f.value).map(f => (
                    <div key={f.label} className="flex justify-between gap-4 text-sm">
                      <span className="text-slate-400 flex-shrink-0">{f.label}</span>
                      <span className="font-medium text-slate-800 text-right">{f.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Informações Financeiras */}
              {((client as any).defaultPaymentMethod || (client as any).defaultPaymentTerms || (client as any).issuesInvoice !== undefined) && (
                <div className="card p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Informações Financeiras</p>
                  {[
                    { label: 'Emite NF', value: (client as any).issuesInvoice != null ? ((client as any).issuesInvoice ? 'Sim' : 'Não') : undefined },
                    { label: 'Forma de Pagamento', value: (client as any).defaultPaymentMethod },
                    { label: 'Prazo de Pagamento', value: (client as any).defaultPaymentTerms },
                  ].filter(f => f.value).map(f => (
                    <div key={f.label} className="flex justify-between gap-4 text-sm">
                      <span className="text-slate-400 flex-shrink-0">{f.label}</span>
                      <span className="font-medium text-slate-800 text-right">{f.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Classificação de Crédito */}
              {((client as any).creditRating || (client as any).creditLimit || (client as any).creditNotes) && (
                <div className="card p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Classificação de Crédito</p>
                  {(client as any).creditRating && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm flex-shrink-0">Rating</span>
                      <span className={cn('ml-auto px-2.5 py-0.5 rounded-full text-xs font-bold', CREDIT_COLORS[(client as any).creditRating] ?? 'bg-slate-100 text-slate-700')}>
                        {(client as any).creditRating}
                      </span>
                    </div>
                  )}
                  {(client as any).creditLimit != null && (
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-slate-400 flex-shrink-0">Limite de Crédito</span>
                      <span className="font-medium text-slate-800 text-right">{formatCurrency((client as any).creditLimit)}</span>
                    </div>
                  )}
                  {(client as any).creditNotes && (
                    <p className="text-xs text-slate-500 mt-1">{(client as any).creditNotes}</p>
                  )}
                </div>
              )}
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
              <div className="flex justify-end mb-3">
                <button onClick={() => setShowVisit(true)} className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 bg-primary-50 px-3 py-2 rounded-xl active:scale-95 transition-transform">
                  <Plus className="w-3.5 h-3.5" /> Nova Visita
                </button>
              </div>
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
        {showDeleteConfirm && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDeleteConfirm(false)} />
            <motion.div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 z-50 safe-bottom" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-slate-900">Excluir Cliente</p>
                <button onClick={() => setShowDeleteConfirm(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <p className="text-sm text-slate-500 mb-1">Tem certeza que deseja excluir o cliente <strong>{client.name}</strong>?</p>
              <p className="text-xs text-red-500 mb-5">Todo o histórico de pedidos e interações será mantido, mas o cliente será removido da sua carteira.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 btn-secondary">Cancelar</button>
                <button onClick={handleDeleteClient} disabled={deleting}
                  className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-50">
                  {deleting ? 'Excluindo...' : 'Sim, excluir'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNote && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowNote(false)} />
            <motion.div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 z-50 safe-bottom" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-slate-900">Nova Anotação</p>
                <button onClick={() => setShowNote(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Data</label>
                  <input type="date" value={noteDate} onChange={e => setNoteDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Hora</label>
                  <input type="time" value={noteTime} onChange={e => setNoteTime(e.target.value)} className="input" />
                </div>
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
      <AnimatePresence>
        {showVisit && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowVisit(false)} />
            <motion.div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 z-50 safe-bottom" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-slate-900">Nova Visita</p>
                <button onClick={() => setShowVisit(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Data</label>
                  <input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Hora</label>
                  <input type="time" value={visitTime} onChange={e => setVisitTime(e.target.value)} className="input" />
                </div>
              </div>

              <div className="mb-4">
                <label className="text-xs text-slate-500 mb-2 block">Resultado</label>
                <div className="flex gap-2 flex-wrap">
                  {(['positivo', 'negativo', 'neutro', 'reagendado'] as VisitResult[]).map(r => (
                    <button key={r} onClick={() => setVisitResult(visitResult === r ? '' : r)}
                      className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-all', visitResult === r ? 'bg-primary-600 text-white border-primary-600' : 'bg-slate-50 text-slate-600 border-slate-200')}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="text-xs text-slate-500 mb-2 block">Avaliação</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button key={s} onClick={() => setVisitRating(visitRating === s ? 0 : s)}
                      className={cn('text-2xl transition-transform active:scale-90', s <= visitRating ? 'text-amber-400' : 'text-slate-200')}>
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <textarea value={visitNotes} onChange={e => setVisitNotes(e.target.value)} placeholder="Observações da visita..." rows={3} className="input resize-none mb-4" />

              <button onClick={handleAddVisit} disabled={savingVisit}
                className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                <Check className="w-4 h-4" />{savingVisit ? 'Salvando...' : 'Salvar Visita'}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </RepLayout>
  )
}
