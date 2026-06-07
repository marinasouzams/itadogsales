import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  MapPin, Users, ShoppingCart, Star, AlertTriangle,
  TrendingUp, Calendar, ChevronRight, Clock, Package, Truck,
} from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { getClientsForRep, getOrdersForRep, getVisitsForRep, MOCK_PROSPECTS } from '@/mock/data'
import { formatCurrency, daysSince, calcPercentage } from '@/utils'

export default function RepHome() {
  const { user } = useAuth()
  const clients = getClientsForRep(user?.id ?? '')
  const orders = getOrdersForRep(user?.id ?? '')
  const visits = getVisitsForRep(user?.id ?? '')
  const myProspects = MOCK_PROSPECTS.filter(p => p.repId === user?.id && p.status === 'assumido')

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const firstName = user?.name?.split(' ')[0] ?? 'Representante'

  const clientsWithoutVisit = clients.filter(c => !c.lastVisit || daysSince(c.lastVisit) > 30)
  const clientsWithoutOrder = clients.filter(c => !c.lastOrder || daysSince(c.lastOrder) > 60)
  const todayVisits = visits.filter(v => v.status === 'em_andamento' || v.status === 'agendada')
  const recentOrders = orders.filter(o => o.status !== 'pronto_entrega').slice(0, 3)
  const readyToDeliver = orders.filter(o => o.status === 'pronto_entrega')

  const metaPercent = user?.meta && user?.metaAting
    ? calcPercentage(user.metaAting, user.meta)
    : 79

  const navigate = useNavigate()

  return (
    <RepLayout>
      <div className="p-4 space-y-5">
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="pt-2"
        >
          <p className="text-slate-500 text-sm">{greeting},</p>
          <h1 className="text-2xl font-bold text-slate-900">{firstName} 👋</h1>
        </motion.div>

        {/* Meta Card */}
        <motion.div
          className="bg-gradient-to-br from-primary-600 to-blue-700 rounded-2xl p-5 text-white"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Meta do Mês</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(user?.metaAting ?? 142500)}</p>
              <p className="text-white/60 text-xs mt-0.5">de {formatCurrency(user?.meta ?? 180000)}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{metaPercent}%</p>
              <p className="text-white/60 text-xs">atingido</p>
            </div>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${metaPercent}%` }}
              transition={{ duration: 1, delay: 0.4 }}
            />
          </div>
          <p className="text-white/60 text-xs mt-2">
            Faltam {formatCurrency((user?.meta ?? 180000) - (user?.metaAting ?? 142500))} para a meta
          </p>
        </motion.div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Clientes', value: clients.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Pedidos', value: orders.length, icon: ShoppingCart, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Leads', value: myProspects.length, icon: Star, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              className="card p-4 flex flex-col items-center gap-2 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05 }}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-[11px] text-slate-500">{stat.label}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <div>
          <p className="section-title">Ações Rápidas</p>
          <div className="grid grid-cols-2 gap-3">
            <motion.button
              onClick={() => navigate('/rep/rota')}
              className="card p-4 flex items-center gap-3 text-left hover:border-primary-200 hover:bg-primary-50 transition-all border-2 border-transparent active:scale-95"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 }}
            >
              <div className="w-11 h-11 rounded-2xl bg-primary-600 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm text-slate-900">Rota do Dia</p>
                <p className="text-xs text-slate-500">{clients.length} clientes</p>
              </div>
            </motion.button>

            <motion.button
              onClick={() => navigate('/rep/clientes')}
              className="card p-4 flex items-center gap-3 text-left hover:border-blue-200 hover:bg-blue-50 transition-all border-2 border-transparent active:scale-95"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="w-11 h-11 rounded-2xl bg-slate-700 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm text-slate-900">Clientes</p>
                <p className="text-xs text-slate-500">Ver todos</p>
              </div>
            </motion.button>

            <motion.button
              onClick={() => navigate('/rep/pedidos')}
              className="card p-4 flex items-center gap-3 text-left hover:border-green-200 hover:bg-green-50 transition-all border-2 border-transparent active:scale-95"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 }}
            >
              <div className="w-11 h-11 rounded-2xl bg-green-600 flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm text-slate-900">Pedidos</p>
                <p className="text-xs text-slate-500">{orders.filter(o => o.syncStatus === 'pendente').length} pendentes</p>
              </div>
            </motion.button>

            <motion.button
              onClick={() => navigate('/rep/prospects')}
              className="card p-4 flex items-center gap-3 text-left hover:border-purple-200 hover:bg-purple-50 transition-all border-2 border-transparent active:scale-95"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <div className="w-11 h-11 rounded-2xl bg-purple-600 flex items-center justify-center flex-shrink-0">
                <Star className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm text-slate-900">Leads</p>
                <p className="text-xs text-slate-500">Ver disponíveis</p>
              </div>
            </motion.button>
          </div>
        </div>

        {/* Pronto para entrega */}
        {readyToDeliver.length > 0 && (
          <motion.div
            className="card border-amber-300 bg-amber-50 p-4"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.44 }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-bold text-amber-800">Pronto para Entrega</p>
              </div>
              <span className="text-xs bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full">{readyToDeliver.length}</span>
            </div>
            <div className="space-y-2">
              {readyToDeliver.map(order => (
                <button
                  key={order.id}
                  onClick={() => navigate(`/rep/pedidos/${order.id}`)}
                  className="w-full flex items-center justify-between text-sm py-2 border-t border-amber-200 first:border-0 first:pt-0"
                >
                  <div className="text-left">
                    <p className="font-semibold text-slate-800 text-xs">{order.clientName}</p>
                    <p className="text-xs text-slate-500">{order.number}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-amber-700">{formatCurrency(order.total)}</span>
                    <ChevronRight className="w-4 h-4 text-amber-500" />
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Alerts */}
        {(clientsWithoutVisit.length > 0 || clientsWithoutOrder.length > 0) && (
          <motion.div
            className="card border-amber-200 bg-amber-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">Atenção Necessária</p>
            </div>
            <div className="space-y-2">
              {clientsWithoutVisit.length > 0 && (
                <button
                  onClick={() => navigate('/rep/clientes?filter=semVisita')}
                  className="w-full flex items-center justify-between text-sm text-amber-700 hover:text-amber-900"
                >
                  <span className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    {clientsWithoutVisit.length} clientes sem visita há +30 dias
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              {clientsWithoutOrder.length > 0 && (
                <button
                  onClick={() => navigate('/rep/clientes?filter=semPedido')}
                  className="w-full flex items-center justify-between text-sm text-amber-700 hover:text-amber-900"
                >
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="w-3.5 h-3.5" />
                    {clientsWithoutOrder.length} clientes sem pedido há +60 dias
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Recent Orders */}
        {recentOrders.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="section-title">Pedidos Recentes</p>
              <button
                onClick={() => navigate('/rep/pedidos')}
                className="text-xs text-primary-600 font-medium flex items-center gap-1"
              >
                Ver todos <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {recentOrders.map((order, i) => (
                <motion.div
                  key={order.id}
                  className="card p-4 flex items-center justify-between"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.05 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                      <ShoppingCart className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{order.clientName.split(' ').slice(0, 2).join(' ')}</p>
                      <p className="text-xs text-slate-500">{order.number}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">{formatCurrency(order.total)}</p>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      order.syncStatus === 'sincronizado' ? 'bg-green-50 text-green-700' :
                      order.syncStatus === 'pendente' ? 'bg-amber-50 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {order.syncStatus === 'sincronizado' ? 'Sincronizado' : order.syncStatus === 'pendente' ? 'Pendente' : order.syncStatus}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Today's Schedule */}
        {todayVisits.length > 0 && (
          <div>
            <p className="section-title flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Hoje
            </p>
            <div className="space-y-2">
              {todayVisits.map((visit, i) => (
                <motion.div
                  key={visit.id}
                  className="card p-4 flex items-center gap-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 + i * 0.05 }}
                >
                  <div className="w-2 h-2 rounded-full bg-primary-600 animate-pulse" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">{visit.clientName}</p>
                    <p className="text-xs text-slate-500 capitalize">{visit.status.replace('_', ' ')}</p>
                  </div>
                  <button
                    onClick={() => navigate(`/rep/clientes/${visit.clientId}`)}
                    className="text-xs text-primary-600 font-medium"
                  >
                    Ver
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        <div className="h-2" />
      </div>
    </RepLayout>
  )
}
