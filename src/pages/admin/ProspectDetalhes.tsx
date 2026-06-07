import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, MapPin, Phone, Mail, TrendingUp, MessageSquare, Star, User } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useProspect, useInteractions } from '@/hooks/useData'
import { LoadingSpinner, ErrorState } from '@/components/shared/LoadingState'
import { formatCurrency, formatDate } from '@/utils'
import { ProspectStatusBadge } from '@/components/shared/StatusBadge'

const TYPE_ICONS: Record<string, string> = {
  checkin: '📍', checkout: '✅', pedido: '🛒', orcamento: '📄',
  rota: '🗺️', ligacao: '📞', whatsapp: '💬', anotacao: '📝', visita: '👁️',
}

export default function ProspectDetalhes() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: prospect, loading, error } = useProspect(id)
  const { data: interactions = [] } = useInteractions(undefined, prospect?.repId)

  if (loading) return <AdminLayout title="Prospect"><div className="p-6"><LoadingSpinner /></div></AdminLayout>
  if (error || !prospect) return (
    <AdminLayout title="Prospect">
      <div className="p-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-slate-500 text-sm mb-4"><ChevronLeft className="w-4 h-4" /> Voltar</button>
        <ErrorState message="Prospect não encontrado" />
      </div>
    </AdminLayout>
  )

  return (
    <AdminLayout title="Detalhe do Prospect">
      <div className="p-6 space-y-5 max-w-3xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-slate-500 text-sm hover:text-slate-700">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>

        {/* Header card */}
        <motion.div className="card p-5" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-5 h-5 text-amber-400" />
                <h2 className="font-bold text-slate-900 text-lg">{prospect.name}</h2>
              </div>
              <p className="text-sm text-slate-500">{prospect.contact} · {prospect.segment}</p>
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3" /> {prospect.city}, {prospect.state}
              </p>
            </div>
            <ProspectStatusBadge status={prospect.status} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-4 border-t border-slate-100">
            {[
              { label: 'Representante', value: prospect.repName?.split(' ')[0] ?? 'Não assumido' },
              { label: 'Potencial/ano', value: prospect.estimatedRevenue ? formatCurrency(prospect.estimatedRevenue) : '—' },
              { label: 'Fonte', value: prospect.source ?? '—' },
              { label: 'Criado em', value: formatDate(prospect.createdAt) },
            ].map(f => (
              <div key={f.label}>
                <p className="text-xs text-slate-400">{f.label}</p>
                <p className="text-sm font-semibold text-slate-800">{f.value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Contact */}
        <div className="card p-4 space-y-3">
          <p className="font-semibold text-slate-900 text-sm">Contato</p>
          <div className="flex items-center gap-3 text-sm">
            <Phone className="w-4 h-4 text-slate-300" />
            <a href={`https://wa.me/55${prospect.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-green-600 font-medium">
              {prospect.phone}
            </a>
          </div>
          {prospect.email && (
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-slate-300" />
              <a href={`mailto:${prospect.email}`} className="text-primary-600">{prospect.email}</a>
            </div>
          )}
        </div>

        {/* Notes */}
        {prospect.notes && (
          <div className="card p-4">
            <p className="font-semibold text-slate-900 text-sm mb-2 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-slate-400" /> Observações
            </p>
            <p className="text-sm text-slate-600 leading-relaxed">{prospect.notes}</p>
          </div>
        )}

        {/* Interaction history */}
        <div className="card p-5">
          <p className="font-semibold text-slate-900 text-sm mb-4">Histórico de Interações do Representante</p>
          {interactions.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Sem interações registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {interactions.map(int => (
                <div key={int.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                  <span className="text-xl flex-shrink-0">{TYPE_ICONS[int.type] ?? '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{int.title}</p>
                      {int.rating && (
                        <span className="text-xs text-amber-500">{'★'.repeat(int.rating)}</span>
                      )}
                    </div>
                    {int.description && <p className="text-xs text-slate-500 mt-0.5">{int.description}</p>}
                    <p className="text-xs text-slate-400 mt-1">{int.repName} · {new Date(int.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
