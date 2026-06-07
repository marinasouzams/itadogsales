import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ChevronLeft, MapPin, Phone, MessageCircle, Package,
  ShoppingCart, TrendingUp, Calendar, User, Star,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useClient, useOrders, useInteractions, useUser } from '@/hooks/useData'
import { LoadingSpinner, ErrorState } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate, daysSince, cn } from '@/utils'
import { PriorityBadge, OrderStatusBadge } from '@/components/shared/StatusBadge'

const INTERACTION_ICONS: Record<string, string> = {
  checkin: '📍',
  checkout: '✅',
  pedido: '🛒',
  rota: '🗺️',
  ligacao: '📞',
  whatsapp: '💬',
  visita: '🏠',
}

const TABS = ['Resumo', 'Pedidos', 'Interações'] as const
type Tab = typeof TABS[number]

export default function AdminClienteDetalhes() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Resumo')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: client, loading, error } = useClient(id)
  const { data: rep } = useUser(client?.repId)
  const { data: allOrders = [] } = useOrders()
  const { data: interactions = [] } = useInteractions(id)

  // Filter orders for this client
  const clientOrders = allOrders.filter(o => o.clientId === id)
  const filteredOrders = useMemo(() => clientOrders.filter(o => {
    const matchFrom = !dateFrom || o.createdAt.slice(0, 10) >= dateFrom
    const matchTo = !dateTo || o.createdAt.slice(0, 10) <= dateTo
    return matchFrom && matchTo
  }), [clientOrders, dateFrom, dateTo])

  const totalRevenue = filteredOrders.reduce((s, o) => s + o.total, 0)
  const avgTicket = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0

  if (loading) return <AdminLayout title="Cliente"><div className="p-6"><LoadingSpinner /></div></AdminLayout>
  if (error || !client) return (
    <AdminLayout title="Cliente">
      <div className="p-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm mb-4"><ChevronLeft className="w-4 h-4" /> Voltar</button>
        <ErrorState message="Cliente não encontrado" />
      </div>
    </AdminLayout>
  )

  const waLink = `https://wa.me/55${client.phone.replace(/\D/g, '')}`

  return (
    <AdminLayout title={client.name}>
      <div className="p-6 space-y-5 max-w-4xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>

        {/* Header card */}
        <div className="card p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <PriorityBadge priority={client.priority} />
                <span className="text-xs text-slate-400">{client.type}</span>
              </div>
              <h1 className="text-xl font-bold text-slate-900">{client.name}</h1>
              <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5" />
                {client.address.city}, {client.address.state}
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
                style={{ backgroundColor: '#25D36615', color: '#25D366' }}
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
              <a
                href={`tel:${client.phone}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-medium"
              >
                <Phone className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400">Representante</p>
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                {rep?.name.split(' ')[0] ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Última visita</p>
              <p className={cn('text-sm font-semibold mt-0.5', client.lastVisit && daysSince(client.lastVisit) > 30 ? 'text-red-600' : 'text-slate-800')}>
                {client.lastVisit ? `${daysSince(client.lastVisit)}d atrás` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Último pedido</p>
              <p className={cn('text-sm font-semibold mt-0.5', client.lastOrder && daysSince(client.lastOrder) > 60 ? 'text-amber-600' : 'text-slate-800')}>
                {client.lastOrder ? `${daysSince(client.lastOrder)}d atrás` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Total de pedidos</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{allOrders.length}</p>
            </div>
          </div>
        </div>

        {/* Revenue summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <TrendingUp className="w-5 h-5 text-primary-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-900">{formatCurrency(totalRevenue)}</p>
            <p className="text-xs text-slate-400">Receita (período)</p>
          </div>
          <div className="card p-4 text-center">
            <ShoppingCart className="w-5 h-5 text-green-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-900">{filteredOrders.length}</p>
            <p className="text-xs text-slate-400">Pedidos</p>
          </div>
          <div className="card p-4 text-center">
            <Package className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-900">{formatCurrency(avgTicket)}</p>
            <p className="text-xs text-slate-400">Ticket médio</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Period filter */}
        {(tab === 'Pedidos') && (
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">De</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input text-sm" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">Até</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input text-sm" />
            </div>
          </div>
        )}

        {tab === 'Resumo' && (
          <div className="space-y-4">
            <div className="card p-4 space-y-3">
              <h3 className="font-semibold text-slate-900 text-sm">Dados de Contato</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Telefone</span>
                  <a href={`tel:${client.phone}`} className="font-medium text-primary-600">{client.phone}</a>
                </div>
                {client.email && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Email</span>
                    <span className="font-medium text-slate-800">{client.email}</span>
                  </div>
                )}
                {(client.cnpj ?? client.cpf) && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">CNPJ / CPF</span>
                    <span className="font-medium text-slate-800 font-mono">{client.cnpj ?? client.cpf}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Endereço</span>
                  <span className="font-medium text-slate-800 text-right max-w-48">
                    {client.address.street}, {client.address.city} — {client.address.state}
                  </span>
                </div>
              </div>
            </div>

            {client.notes && (
              <div className="card p-4">
                <h3 className="font-semibold text-slate-900 text-sm mb-2">Observações</h3>
                <p className="text-sm text-slate-600">{client.notes}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'Pedidos' && (
          <div className="space-y-3">
            {filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Nenhum pedido no período</div>
            ) : (
              filteredOrders.map((order, i) => (
                <motion.div
                  key={order.id}
                  className="card p-4"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs text-slate-400 font-mono">{order.number}</p>
                      <p className="text-xs text-slate-400">{formatDate(order.createdAt)}</p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <div className="flex justify-between items-end pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-400">{order.items.length} produto(s)</span>
                    <span className="text-base font-bold text-slate-900">{formatCurrency(order.total)}</span>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}

        {tab === 'Interações' && (
          <div className="space-y-3">
            {interactions.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Nenhuma interação registrada</div>
            ) : (
              interactions.map((int, i) => (
                <motion.div
                  key={int.id}
                  className="card p-4 flex gap-3"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <span className="text-xl flex-shrink-0 mt-0.5">{INTERACTION_ICONS[int.type] ?? '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{int.title}</p>
                      {int.rating && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {Array.from({ length: int.rating }).map((_, j) => (
                            <Star key={j} className="w-3 h-3 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                      )}
                    </div>
                    {int.description && <p className="text-xs text-slate-400 mt-0.5">{int.description}</p>}
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(int.timestamp)}</span>
                      <span>·</span>
                      <span>{int.repName}</span>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
