import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Clock, ShoppingCart, CheckCircle2, Navigation,
  MessageCircle, ChevronRight, AlertCircle, Plus, X,
  Search, Check,
} from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import MapMock from '@/components/shared/MapMock'
import { useAuth } from '@/contexts/AuthContext'
import { useClients, useActiveRouteSession } from '@/hooks/useData'
import { createVisit, updateVisit, createInteraction, logAudit, upsertRouteSession, finalizeRouteSession, updateRouteCheckedIn } from '@/services/db'
import { formatCurrency, daysSince, cn } from '@/utils'

const statusBadge: Record<string, string> = {
  planejada: 'bg-slate-100 text-slate-600',
  em_andamento: 'bg-blue-100 text-blue-700',
  finalizada: 'bg-green-100 text-green-700',
}
const statusLabel: Record<string, string> = {
  planejada: 'Planejada',
  em_andamento: 'Em andamento',
  finalizada: 'Finalizada',
}

export default function RotaDoDia() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: allClients = [] } = useClients(user?.id)
  const { data: activeSession, refetch: refetchSession } = useActiveRouteSession(user?.id)

  const [routeClientIds, setRouteClientIds] = useState<string[]>([])
  const [routeSessionId, setRouteSessionId] = useState<string | null>(null)
  // visitId por clientId (criado no checkin)
  const [activeVisits, setActiveVisits] = useState<Record<string, string>>({})
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set())
  const [showMap, setShowMap] = useState(true)
  const [showRouteBuilder, setShowRouteBuilder] = useState(false)
  const [routeCity, setRouteCity] = useState('')
  const [citySearch, setCitySearch] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [selectedForRoute, setSelectedForRoute] = useState<Set<string>>(new Set())
  const [showCheckoutModal, setShowCheckoutModal] = useState<string | null>(null)
  const [checkoutNote, setCheckoutNote] = useState('')
  const [checkoutRating, setCheckoutRating] = useState(0)
  const [processing, setProcessing] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<'planejada' | 'em_andamento' | 'finalizada' | null>(null)

  // Carregar sessão ativa ao montar
  useEffect(() => {
    if (activeSession) {
      setRouteClientIds(activeSession.clientIds)
      setCheckedIn(new Set(activeSession.checkedInIds))
      setRouteSessionId(activeSession.id)
      setSessionStatus(activeSession.status)
    }
  }, [activeSession])

  const cities = useMemo(() => [...new Set(allClients.map(c => c.address.city))].sort(), [allClients])
  const citiesFiltered = cities.filter(c => c.toLowerCase().includes(citySearch.toLowerCase()))

  const clientsInCity = useMemo(() =>
    routeCity ? allClients.filter(c => c.address.city === routeCity) : [],
    [allClients, routeCity])

  const clientsInCityFiltered = clientsInCity.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()))

  const routeClients = useMemo(() =>
    allClients
      .filter(c => routeClientIds.includes(c.id))
      .sort((a, b) => routeClientIds.indexOf(a.id) - routeClientIds.indexOf(b.id))
      .map((c, i) => ({ ...c, routeOrder: i + 1 })),
    [allClients, routeClientIds])

  const completedCount = checkedIn.size
  const totalCount = routeClients.length

  const priorityConfig: Record<string, string> = {
    alta: 'border-l-red-500 bg-red-50/30',
    media: 'border-l-amber-500 bg-amber-50/30',
    baixa: 'border-l-slate-300',
  }

  const handleFinishRoute = async () => {
    if (!routeSessionId) return
    await finalizeRouteSession(routeSessionId)
    setSessionStatus('finalizada')
    refetchSession()
  }

  const handleCheckIn = async (clientId: string) => {
    if (!user || processing) return
    setProcessing(clientId)
    const client = allClients.find(c => c.id === clientId)
    if (!client) { setProcessing(null); return }

    const now = new Date()
    const coords = await new Promise<{ lat: number; lng: number }>(resolve => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve({ lat: client.address.lat, lng: client.address.lng })
        )
      } else resolve({ lat: client.address.lat, lng: client.address.lng })
    })

    const visit = await createVisit({
      clientId, clientName: client.name, clientCity: client.address.city,
      repId: user.id, repName: user.name, status: 'em_andamento',
      checkIn: { lat: coords.lat, lng: coords.lng, timestamp: now.toISOString() },
    })

    if (visit) {
      const newCheckedIn = new Set([...checkedIn, clientId])
      setActiveVisits(prev => ({ ...prev, [clientId]: visit.id }))
      setCheckedIn(newCheckedIn)
      if (routeSessionId) {
        await updateRouteCheckedIn(routeSessionId, Array.from(newCheckedIn))
      }
      await createInteraction({
        clientId, clientName: client.name, repId: user.id, repName: user.name,
        type: 'checkin', title: 'Check-in realizado', description: `Check-in em ${client.name}`,
        timestamp: now.toISOString(),
      })
      await logAudit({
        userId: user.id, userName: user.name, userRole: user.role, action: 'checkin',
        entity: 'Visita', entityId: visit.id, description: `Check-in em ${client.name}`,
        timestamp: now.toISOString(),
      })
    }
    setProcessing(null)
  }

  const handleCheckout = async (clientId: string) => {
    if (!user || processing) return
    const visitId = activeVisits[clientId]
    if (!visitId) { setShowCheckoutModal(null); return }
    setProcessing(clientId)
    const client = allClients.find(c => c.id === clientId)
    if (!client) { setProcessing(null); return }

    const now = new Date()
    const coords = await new Promise<{ lat: number; lng: number }>(resolve => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve({ lat: client.address.lat, lng: client.address.lng })
        )
      } else resolve({ lat: client.address.lat, lng: client.address.lng })
    })

    await updateVisit(visitId, {
      status: 'concluida',
      result: 'positivo',
      notes: checkoutNote || undefined,
      rating: checkoutRating || undefined,
      checkOut: { lat: coords.lat, lng: coords.lng, timestamp: now.toISOString() },
      clientId, // for last_visit update
    })

    await createInteraction({
      clientId, clientName: client.name, repId: user.id, repName: user.name,
      type: 'checkout', title: 'Check-out realizado',
      description: checkoutNote || `Check-out em ${client.name}`,
      rating: checkoutRating || undefined, relatedId: visitId,
      timestamp: now.toISOString(),
    })
    await logAudit({
      userId: user.id, userName: user.name, userRole: user.role, action: 'checkout',
      entity: 'Visita', entityId: visitId, description: `Check-out em ${client.name}`,
      timestamp: now.toISOString(),
    })

    setShowCheckoutModal(null)
    setCheckoutNote('')
    setCheckoutRating(0)
    setProcessing(null)
  }

  const buildRoute = async () => {
    if (!user) return
    const ids = [...selectedForRoute]
    setRouteClientIds(ids)
    setShowRouteBuilder(false)
    setSelectedForRoute(new Set())
    setCitySearch('')
    setClientSearch('')

    const saved = await upsertRouteSession({
      repId: user.id,
      repName: user.name,
      date: new Date().toISOString().slice(0, 10),
      city: routeCity,
      clientIds: ids,
      checkedInIds: [],
      status: 'em_andamento',
    })
    if (saved) {
      setRouteSessionId(saved.id)
      setSessionStatus(saved.status)
      setCheckedIn(new Set())
    }
    setRouteCity('')
  }

  const mapClients = routeClients.map(c => ({
    id: c.id, name: c.name, lat: c.address.lat, lng: c.address.lng,
    priority: c.priority, visited: checkedIn.has(c.id),
  }))

  return (
    <RepLayout title="Rota do Dia">
      <div className="flex flex-col pb-6">
        {/* Header Stats */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {totalCount > 0 ? `${totalCount} clientes na rota` : 'Nenhuma rota criada'}
                </h2>
                {sessionStatus && (
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', statusBadge[sessionStatus])}>
                    {statusLabel[sessionStatus]}
                  </span>
                )}
              </div>
              {totalCount > 0 && (
                <p className="text-sm text-slate-500">{completedCount} visitados · {totalCount - completedCount} restantes</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {totalCount > 0 && (
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary-600">{Math.round((completedCount / totalCount) * 100) || 0}%</div>
                  <div className="text-xs text-slate-500">concluído</div>
                </div>
              )}
              {totalCount > 0 && sessionStatus !== 'finalizada' && (
                <button
                  onClick={handleFinishRoute}
                  className="flex items-center gap-1.5 bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-xl"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Finalizar
                </button>
              )}
              <button
                onClick={() => setShowRouteBuilder(true)}
                className="flex items-center gap-1.5 bg-primary-600 text-white text-xs font-bold px-3 py-2 rounded-xl"
              >
                <Plus className="w-3.5 h-3.5" /> Criar rota
              </button>
            </div>
          </div>

          {totalCount > 0 && (
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary-600 rounded-full"
                animate={{ width: `${(completedCount / totalCount) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          )}
        </div>

        {totalCount === 0 ? (
          <div className="px-4 text-center py-16">
            <MapPin className="w-14 h-14 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">Nenhuma rota para hoje</p>
            <p className="text-slate-300 text-sm mt-1">Crie uma rota selecionando clientes de uma cidade</p>
            <button onClick={() => setShowRouteBuilder(true)} className="mt-4 btn-primary flex items-center gap-2 mx-auto">
              <Plus className="w-4 h-4" /> Criar rota do dia
            </button>
          </div>
        ) : (
          <>
            {/* Map Toggle */}
            <div className="px-4 pb-3">
              <div className="flex gap-2">
                <button onClick={() => setShowMap(true)} className={cn('flex-1 py-2 rounded-xl text-sm font-medium transition-all', showMap ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600')}>Mapa</button>
                <button onClick={() => setShowMap(false)} className={cn('flex-1 py-2 rounded-xl text-sm font-medium transition-all', !showMap ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600')}>Lista</button>
              </div>
            </div>

            <AnimatePresence>
              {showMap && (
                <motion.div className="px-4 pb-3" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <MapMock clients={mapClients} height="h-52" showRoute />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Client list */}
            <div className="px-4 space-y-3">
              <p className="section-title">Clientes na rota</p>
              {routeClients.map((client, i) => {
                const isCheckedIn = checkedIn.has(client.id)
                const dv = client.lastVisit ? daysSince(client.lastVisit) : 999
                const dp = client.lastOrder ? daysSince(client.lastOrder) : 999
                const whatsappUrl = `https://wa.me/55${client.phone.replace(/\D/g, '')}`

                return (
                  <motion.div
                    key={client.id}
                    className={cn('card border-l-4 p-4 transition-all', isCheckedIn ? 'border-l-green-500 bg-green-50/30 opacity-80' : priorityConfig[client.priority])}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-white', isCheckedIn ? 'bg-green-500' : client.priority === 'alta' ? 'bg-red-500' : client.priority === 'media' ? 'bg-amber-500' : 'bg-slate-400')}>
                          {isCheckedIn ? <CheckCircle2 className="w-4 h-4" /> : client.routeOrder}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-900 text-sm leading-tight truncate">{client.name}</h3>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {client.address.city}{client.distance && ` · ${client.distance}km`}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => navigate(`/rep/clientes/${client.id}`)} className="text-slate-300 hover:text-slate-500 p-1">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                      <span className={cn('flex items-center gap-1', dv > 30 && 'text-red-500 font-medium')}>
                        <Clock className="w-3 h-3" />{dv < 999 ? `${dv}d s/ visita` : 'Nunca visitado'}
                      </span>
                      <span className="flex items-center gap-1">
                        <ShoppingCart className="w-3 h-3" />{dp < 999 ? `${dp}d s/ pedido` : 'Sem pedidos'}
                      </span>
                      {client.totalRevenue > 0 && <span className="font-medium text-slate-600 ml-auto">{formatCurrency(client.totalRevenue)}</span>}
                    </div>

                    {!isCheckedIn ? (
                      <div className="flex gap-2">
                        <button onClick={() => handleCheckIn(client.id)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold">
                          <Navigation className="w-4 h-4" /> Check-in
                        </button>
                        <button onClick={() => navigate(`/rep/pedidos/novo?cliente=${client.id}`)} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium">
                          Pedido
                        </button>
                        <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center w-11 h-11 rounded-xl bg-[#25D366] text-white">
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-sm text-green-700 font-medium">Visitado</span>
                          <button onClick={() => setShowCheckoutModal(client.id)} className="ml-2 text-xs border border-green-300 text-green-700 px-2.5 py-1 rounded-lg font-medium">
                            Check-out
                          </button>
                          <button onClick={() => navigate(`/rep/pedidos/novo?cliente=${client.id}`)} className="ml-auto text-xs text-primary-600 font-medium flex items-center gap-1">
                            <ShoppingCart className="w-3 h-3" /> Novo pedido
                          </button>
                        </div>
                      </div>
                    )}

                    {client.priority === 'alta' && dv > 30 && !isCheckedIn && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
                        <AlertCircle className="w-3 h-3" /> Visita atrasada — cliente prioritário
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Route Builder Modal */}
      <AnimatePresence>
        {showRouteBuilder && (
          <motion.div className="fixed inset-0 bg-black/50 z-50 flex items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="bg-white w-full rounded-t-3xl flex flex-col"
              style={{ maxHeight: '90vh' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h3 className="font-bold text-slate-900">Criar Rota do Dia</h3>
                <button onClick={() => setShowRouteBuilder(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Step 1: city */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">1. Selecione a cidade</p>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input value={citySearch} onChange={e => setCitySearch(e.target.value)} placeholder="Buscar cidade..." className="input pl-9 text-sm" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {citiesFiltered.map(city => (
                      <button
                        key={city}
                        onClick={() => { setRouteCity(city); setSelectedForRoute(new Set()); setClientSearch('') }}
                        className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-all', routeCity === city ? 'bg-primary-600 text-white border-primary-600' : 'bg-white border-slate-200 text-slate-600')}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2: clients */}
                {routeCity && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-2">
                      2. Selecione os clientes em {routeCity} ({selectedForRoute.size} selecionados)
                    </p>
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Buscar cliente..." className="input pl-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                      {clientsInCityFiltered.map(client => {
                        const sel = selectedForRoute.has(client.id)
                        return (
                          <button
                            key={client.id}
                            onClick={() => setSelectedForRoute(prev => {
                              const next = new Set(prev)
                              sel ? next.delete(client.id) : next.add(client.id)
                              return next
                            })}
                            className={cn('w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left', sel ? 'bg-primary-50 border-primary-300' : 'bg-white border-slate-100')}
                          >
                            <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0', sel ? 'bg-primary-600 border-primary-600' : 'border-slate-300')}>
                              {sel && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{client.name}</p>
                              <p className="text-xs text-slate-400">
                                {client.priority === 'alta' ? '🔴' : client.priority === 'media' ? '🟡' : '⚪'} {client.priority} · {formatCurrency(client.totalRevenue)}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                      {clientsInCityFiltered.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-4">Nenhum cliente nessa cidade</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-5 border-t border-slate-100">
                <button
                  onClick={buildRoute}
                  disabled={selectedForRoute.size === 0}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <MapPin className="w-4 h-4" /> Iniciar rota com {selectedForRoute.size} cliente{selectedForRoute.size !== 1 ? 's' : ''}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checkout modal */}
      <AnimatePresence>
        {showCheckoutModal && (
          <motion.div className="fixed inset-0 bg-black/50 z-50 flex items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="bg-white w-full rounded-t-3xl p-6 space-y-4" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Parecer da Visita</h3>
                <button onClick={() => setShowCheckoutModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Avaliação</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setCheckoutRating(n)} className={cn('text-3xl transition-all', n <= checkoutRating ? 'text-amber-400' : 'text-slate-200')}>★</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Observações da visita</label>
                <textarea value={checkoutNote} onChange={e => setCheckoutNote(e.target.value)} placeholder="Como foi a visita? Próximos passos..." className="input resize-none h-20" />
              </div>
              <button onClick={() => handleCheckout(showCheckoutModal!)} disabled={!!processing} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40">
                <CheckCircle2 className="w-4 h-4" /> Confirmar check-out
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </RepLayout>
  )
}
