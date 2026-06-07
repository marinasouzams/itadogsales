import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Phone, Mail, ShoppingCart, Clock, Navigation,
  FileText, ChevronLeft, AlertCircle, Building2, Calendar,
  CheckCircle2, XCircle, MessageSquare, Edit3, Save, X,
  Star, MessageCircle,
} from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { MOCK_CLIENTS, getOrdersForRep, getVisitsForRep, getInteractionsForClient, MOCK_INTERACTIONS } from '@/mock/data'
import { formatCurrency, formatDate, daysSince, clientTypeLabel, cn } from '@/utils'
import { VisitStatusBadge, OrderStatusBadge } from '@/components/shared/StatusBadge'
import type { Client, Interaction } from '@/types'

const TYPE_ICONS: Record<string, string> = {
  checkin: '📍', checkout: '✅', pedido: '🛒', orcamento: '📄',
  rota: '🗺️', ligacao: '📞', whatsapp: '💬', anotacao: '📝', visita: '👁️',
}

export default function ClienteDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'info' | 'visitas' | 'pedidos' | 'interacoes'>('info')
  const [showEdit, setShowEdit] = useState(false)
  const [localInteractions, setLocalInteractions] = useState<Interaction[]>(getInteractionsForClient(id ?? ''))
  const [showCheckinFlow, setShowCheckinFlow] = useState(false)
  const [checkedIn, setCheckedIn] = useState(false)
  const [showCheckoutModal, setShowCheckoutModal] = useState(false)
  const [checkoutNote, setCheckoutNote] = useState('')
  const [checkoutRating, setCheckoutRating] = useState(0)
  const [editForm, setEditForm] = useState<Partial<Client>>({})

  const client = MOCK_CLIENTS.find(c => c.id === id)
  const allOrders = getOrdersForRep(client?.repId ?? '')
  const allVisits = getVisitsForRep(client?.repId ?? '')
  const clientOrders = allOrders.filter(o => o.clientId === id)
  const clientVisits = allVisits.filter(v => v.clientId === id)

  if (!client) {
    return (
      <RepLayout title="Cliente">
        <div className="p-4 text-center py-20">
          <AlertCircle className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">Cliente não encontrado</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-primary-600 text-sm font-medium">Voltar</button>
        </div>
      </RepLayout>
    )
  }

  const dv = client.lastVisit ? daysSince(client.lastVisit) : 999
  const dp = client.lastOrder ? daysSince(client.lastOrder) : 999

  const addInteraction = (interaction: Omit<Interaction, 'id' | 'timestamp'>) => {
    const newInt: Interaction = {
      ...interaction,
      id: `int-local-${Date.now()}`,
      timestamp: new Date().toISOString(),
    }
    setLocalInteractions(prev => [newInt, ...prev])
  }

  const handleCheckin = () => {
    setCheckedIn(true)
    addInteraction({
      clientId: client.id,
      clientName: client.name,
      repId: user?.id ?? '',
      repName: user?.name ?? '',
      type: 'checkin',
      title: 'Check-in realizado',
      description: 'Visita iniciada ao cliente',
    })
  }

  const handleCheckout = () => {
    setShowCheckoutModal(false)
    setCheckedIn(false)
    addInteraction({
      clientId: client.id,
      clientName: client.name,
      repId: user?.id ?? '',
      repName: user?.name ?? '',
      type: 'checkout',
      title: 'Check-out realizado',
      description: checkoutNote || undefined,
      rating: checkoutRating || undefined,
    })
    setCheckoutNote('')
    setCheckoutRating(0)
  }

  const whatsappUrl = `https://wa.me/55${client.phone.replace(/\D/g, '')}`
  const mapsUrl = `https://maps.google.com/?q=${client.address.lat},${client.address.lng}`

  const TABS = [
    { key: 'info', label: 'Dados' },
    { key: 'interacoes', label: `Interações (${localInteractions.length})` },
    { key: 'visitas', label: `Visitas (${clientVisits.length})` },
    { key: 'pedidos', label: `Pedidos (${clientOrders.length})` },
  ] as const

  return (
    <RepLayout title={client.tradeName ?? client.name}>
      <div className="flex flex-col">
        {/* Back */}
        <div className="px-4 pt-3 pb-2">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm mb-3">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>

          {/* Header card */}
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="card p-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-6 h-6 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-bold text-slate-900 leading-tight">{client.name}</h2>
                    {client.tradeName && <p className="text-xs text-slate-400 mt-0.5">{client.tradeName}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{clientTypeLabel(client.type)}</span>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', client.priority === 'alta' ? 'bg-red-50 text-red-600' : client.priority === 'media' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500')}>
                        {client.priority === 'alta' ? 'Alta' : client.priority === 'media' ? 'Média' : 'Baixa'}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => { setShowEdit(true); setEditForm(client) }} className="p-2 hover:bg-slate-100 rounded-xl">
                    <Edit3 className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-900">{formatCurrency(client.totalRevenue)}</p>
                <p className="text-[10px] text-slate-400">Receita total</p>
              </div>
              <div className="text-center border-x border-slate-100">
                <p className={cn('text-lg font-bold', dv > 30 ? 'text-red-600' : 'text-slate-900')}>{dv < 999 ? `${dv}d` : '—'}</p>
                <p className="text-[10px] text-slate-400">S/ visita</p>
              </div>
              <div className="text-center">
                <p className={cn('text-lg font-bold', dp > 60 ? 'text-amber-600' : 'text-slate-900')}>{dp < 999 ? `${dp}d` : '—'}</p>
                <p className="text-[10px] text-slate-400">S/ pedido</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-3 grid grid-cols-4 gap-2">
          {!checkedIn ? (
            <button onClick={handleCheckin} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-[11px] font-semibold bg-primary-600 text-white active:scale-95 transition-transform">
              <Navigation className="w-5 h-5" /> Check-in
            </button>
          ) : (
            <button onClick={() => setShowCheckoutModal(true)} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-[11px] font-semibold bg-green-600 text-white active:scale-95 transition-transform">
              <CheckCircle2 className="w-5 h-5" /> Check-out
            </button>
          )}
          <button onClick={() => navigate(`/rep/pedidos/novo?cliente=${client.id}`)} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-[11px] font-semibold bg-green-600 text-white active:scale-95 transition-transform">
            <FileText className="w-5 h-5" /> Pedido
          </button>
          <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-[11px] font-semibold bg-[#25D366] text-white active:scale-95 transition-transform">
            <MessageCircle className="w-5 h-5" /> WhatsApp
          </a>
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 py-3 rounded-2xl text-[11px] font-semibold bg-amber-500 text-white active:scale-95 transition-transform">
            <MapPin className="w-5 h-5" /> Rota
          </a>
        </div>

        {/* Tabs */}
        <div className="px-4 pb-2">
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn('flex-shrink-0 flex-1 py-2 text-xs font-semibold rounded-lg transition-all min-w-max px-2', tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="px-4 pb-24 space-y-3">
          {tab === 'info' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="card p-4">
                <p className="section-title mb-3">Contato</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-slate-700">{client.address.street}</p>
                      <p className="text-xs text-slate-400">{client.address.city}, {client.address.state} · {client.address.zipCode}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <a href={whatsappUrl} target="_blank" rel="noreferrer" className="text-sm text-green-600 font-medium">{client.phone}</a>
                  </div>
                  {client.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <a href={`mailto:${client.email}`} className="text-sm text-primary-600 font-medium">{client.email}</a>
                    </div>
                  )}
                </div>
              </div>
              <div className="card p-4">
                <p className="section-title mb-3">Dados Fiscais</p>
                <div className="space-y-2">
                  {client.cnpj && <div className="flex justify-between"><span className="text-xs text-slate-400">CNPJ</span><span className="text-xs font-medium text-slate-700">{client.cnpj}</span></div>}
                  <div className="flex justify-between"><span className="text-xs text-slate-400">Segmento</span><span className="text-xs font-medium text-slate-700">{client.segment}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-slate-400">Total de pedidos</span><span className="text-xs font-medium text-slate-700">{client.totalOrders}</span></div>
                  <div className="flex justify-between"><span className="text-xs text-slate-400">Cliente desde</span><span className="text-xs font-medium text-slate-700">{formatDate(client.createdAt)}</span></div>
                </div>
              </div>
              {client.notes && (
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2"><MessageSquare className="w-3.5 h-3.5 text-slate-400" /><p className="section-title">Observações</p></div>
                  <p className="text-sm text-slate-600 leading-relaxed">{client.notes}</p>
                </div>
              )}
            </motion.div>
          )}

          {tab === 'interacoes' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              {localInteractions.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Sem interações registradas</p>
                </div>
              ) : (
                localInteractions.map(int => (
                  <div key={int.id} className="card p-4 flex items-start gap-3">
                    <span className="text-xl flex-shrink-0">{TYPE_ICONS[int.type] ?? '📋'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800">{int.title}</p>
                        {int.rating && <span className="text-xs text-amber-500">{'★'.repeat(int.rating)}</span>}
                      </div>
                      {int.description && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{int.description}</p>}
                      <p className="text-xs text-slate-400 mt-1">{new Date(int.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}

          {tab === 'visitas' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              {clientVisits.length === 0 ? (
                <div className="text-center py-12"><Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" /><p className="text-slate-400 text-sm">Nenhuma visita registrada</p></div>
              ) : (
                clientVisits.map(visit => (
                  <div key={visit.id} className="card p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {visit.result === 'positivo' ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : visit.result === 'negativo' ? <XCircle className="w-4 h-4 text-red-500" /> : <Clock className="w-4 h-4 text-amber-500" />}
                        <span className="text-sm font-semibold text-slate-800">{formatDate(visit.createdAt)}</span>
                      </div>
                      <VisitStatusBadge status={visit.status} />
                    </div>
                    {visit.notes && <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{visit.notes}</p>}
                  </div>
                ))
              )}
            </motion.div>
          )}

          {tab === 'pedidos' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              {clientOrders.length === 0 ? (
                <div className="text-center py-12"><ShoppingCart className="w-10 h-10 text-slate-200 mx-auto mb-3" /><p className="text-slate-400 text-sm">Nenhum pedido registrado</p></div>
              ) : (
                clientOrders.map(order => (
                  <button key={order.id} onClick={() => navigate(`/rep/pedidos/${order.id}`)} className="w-full card p-4 text-left">
                    <div className="flex items-start justify-between mb-2">
                      <div><p className="text-sm font-semibold text-slate-900">{order.number}</p><p className="text-xs text-slate-400">{formatDate(order.createdAt)}</p></div>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                      <span className="text-xs text-slate-400">{order.items.length} produto(s)</span>
                      <span className="text-sm font-bold text-slate-900">{formatCurrency(order.total)}</span>
                    </div>
                  </button>
                ))
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Edit client modal */}
      <AnimatePresence>
        {showEdit && (
          <motion.div className="fixed inset-0 bg-black/50 z-50 flex items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Editar Cliente</h3>
                <button onClick={() => setShowEdit(false)} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Nome', key: 'name', value: editForm.name ?? client.name },
                  { label: 'Telefone', key: 'phone', value: editForm.phone ?? client.phone },
                  { label: 'Email', key: 'email', value: editForm.email ?? client.email ?? '' },
                  { label: 'Observações', key: 'notes', value: editForm.notes ?? client.notes ?? '' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">{f.label}</label>
                    {f.key === 'notes' ? (
                      <textarea className="input resize-none h-20" defaultValue={f.value} onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                    ) : (
                      <input className="input" defaultValue={f.value} onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => setShowEdit(false)} className="btn-primary w-full flex items-center justify-center gap-2">
                <Save className="w-4 h-4" /> Salvar alterações
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checkout assessment modal */}
      <AnimatePresence>
        {showCheckoutModal && (
          <motion.div className="fixed inset-0 bg-black/50 z-50 flex items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="bg-white w-full rounded-t-3xl p-6 space-y-4" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Parecer da Visita</h3>
                <button onClick={() => setShowCheckoutModal(false)} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Avaliação da visita</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setCheckoutRating(n)} className={cn('text-3xl transition-all', n <= checkoutRating ? 'text-amber-400' : 'text-slate-200')}>★</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Observações da visita</label>
                <textarea
                  value={checkoutNote}
                  onChange={e => setCheckoutNote(e.target.value)}
                  placeholder="Descreva como foi a visita, o que o cliente disse, próximos passos..."
                  className="input resize-none h-24"
                />
              </div>
              <button onClick={handleCheckout} className="btn-primary w-full flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Confirmar check-out
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </RepLayout>
  )
}
