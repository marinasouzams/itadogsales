import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Star, MapPin, Phone, MessageCircle, TrendingUp,
  CheckCircle2, UserPlus, Plus, X, Search,
} from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { MOCK_PROSPECTS } from '@/mock/data'
import { formatCurrency, cn } from '@/utils'
import { ProspectStatusBadge } from '@/components/shared/StatusBadge'
import type { Prospect, ProspectStatus } from '@/types'

const FILTERS: { label: string; value: ProspectStatus | 'todos' }[] = [
  { label: 'Todos', value: 'todos' },
  { label: 'Disponíveis', value: 'disponivel' },
  { label: 'Assumidos', value: 'assumido' },
  { label: 'Convertidos', value: 'convertido' },
]

const SEGMENTS = ['Soja / Milho', 'Pecuária / Leite', 'Insumos / Veterinário', 'Cana-de-açúcar', 'Horticultura', 'Outros']
const SOURCES = ['Indicação cliente', 'Prospecção ativa', 'Feira / Evento', 'Redes sociais', 'Cold call', 'Outros']

export default function RepProspects() {
  const { user } = useAuth()
  const [filter, setFilter] = useState<ProspectStatus | 'todos'>('todos')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [assumed, setAssumed] = useState<Set<string>>(
    new Set(MOCK_PROSPECTS.filter(p => p.repId === user?.id).map(p => p.id))
  )
  const [localProspects, setLocalProspects] = useState<Prospect[]>([])

  const [form, setForm] = useState({
    name: '', contact: '', phone: '', email: '',
    city: '', state: 'SP', segment: '', source: '',
    estimatedRevenue: '', notes: '',
  })

  const repTerritory = user?.territory ?? []

  const allProspects = useMemo(() => {
    const base = [...MOCK_PROSPECTS, ...localProspects]
    return base.filter(p => {
      if (p.repId === user?.id) return true
      if (p.status === 'disponivel') {
        if (repTerritory.length === 0) return true
        return repTerritory.includes(p.city)
      }
      return false
    })
  }, [localProspects, user?.id, repTerritory])

  const filtered = useMemo(() => allProspects.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.city.toLowerCase().includes(search.toLowerCase()) ||
      p.contact.toLowerCase().includes(search.toLowerCase())
    const isAssumed = assumed.has(p.id)
    const matchFilter =
      filter === 'todos' ||
      (filter === 'assumido' && isAssumed) ||
      (filter === 'disponivel' && !isAssumed && p.status === 'disponivel') ||
      (filter === 'convertido' && p.status === 'convertido')
    return matchSearch && matchFilter
  }), [allProspects, search, filter, assumed])

  const handleAssume = (id: string) => setAssumed(prev => new Set([...prev, id]))

  const handleSubmit = () => {
    if (!form.name || !form.contact || !form.phone || !form.city || !form.segment) return
    const newProspect: Prospect = {
      id: `pro-local-${Date.now()}`,
      name: form.name,
      contact: form.contact,
      phone: form.phone,
      email: form.email || undefined,
      city: form.city,
      state: form.state,
      segment: form.segment,
      source: form.source || 'Prospecção ativa',
      estimatedRevenue: form.estimatedRevenue ? Number(form.estimatedRevenue) : undefined,
      notes: form.notes || undefined,
      status: 'assumido',
      repId: user?.id,
      repName: user?.name,
      createdAt: new Date().toISOString().slice(0, 10),
      attempts: 0,
      region: user?.region,
    }
    setLocalProspects(prev => [newProspect, ...prev])
    setAssumed(prev => new Set([...prev, newProspect.id]))
    setShowForm(false)
    setForm({ name: '', contact: '', phone: '', email: '', city: '', state: 'SP', segment: '', source: '', estimatedRevenue: '', notes: '' })
  }

  const availableCount = allProspects.filter(p => !assumed.has(p.id) && p.status === 'disponivel').length
  const myCount = allProspects.filter(p => assumed.has(p.id)).length

  return (
    <RepLayout title="Leads & Prospects">
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-primary-600">{availableCount}</p>
            <p className="text-xs text-slate-400 mt-0.5">Disponíveis</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{myCount}</p>
            <p className="text-xs text-slate-400 mt-0.5">Assumidos por mim</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, cidade..." className="input pl-10" />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                filter === f.value ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-primary-200 text-primary-600 text-sm font-semibold hover:bg-primary-50 transition-colors"
        >
          <Plus className="w-4 h-4" /> Cadastrar Novo Prospect
        </button>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Star className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">Nenhum lead encontrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((prospect, i) => {
              const isAssumed = assumed.has(prospect.id)
              const waLink = `https://wa.me/55${prospect.phone.replace(/\D/g, '')}`

              return (
                <motion.div
                  key={prospect.id}
                  className="card p-4"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 text-sm truncate">{prospect.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{prospect.contact}</p>
                    </div>
                    <ProspectStatusBadge status={isAssumed ? 'assumido' : prospect.status} />
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{prospect.city}, {prospect.state}</span>
                    <span className="text-slate-200">·</span>
                    <span>{prospect.segment}</span>
                  </div>

                  {prospect.estimatedRevenue && (
                    <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium mb-3">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Potencial: {formatCurrency(prospect.estimatedRevenue)}/ano
                    </div>
                  )}

                  {prospect.notes && (
                    <p className="text-xs text-slate-400 italic line-clamp-1 mb-3">{prospect.notes}</p>
                  )}

                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-xl text-xs font-medium active:scale-95 transition-transform"
                      style={{ backgroundColor: '#25D36615', color: '#25D366' }}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>
                    <a
                      href={`tel:${prospect.phone}`}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-medium"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                    {!isAssumed ? (
                      <button
                        onClick={() => handleAssume(prospect.id)}
                        className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold active:scale-95 transition-transform"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Assumir
                      </button>
                    ) : (
                      <div className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-xl bg-green-50 text-green-700 text-xs font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Assumido
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-h-[92vh] overflow-y-auto"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-4 flex items-center justify-between">
                <h2 className="font-bold text-slate-900">Novo Prospect</h2>
                <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <div className="p-4 space-y-4 pb-8">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Nome da empresa *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Fazenda São João" className="input" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Nome do contato *</label>
                  <input value={form.contact} onChange={e => setForm(p => ({ ...p, contact: e.target.value }))} placeholder="Ex: João da Silva" className="input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Telefone *</label>
                    <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="(17) 99999-0000" className="input" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">E-mail</label>
                    <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@..." className="input" type="email" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Cidade *</label>
                    <input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="Ex: Barretos" className="input" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">UF</label>
                    <input value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} placeholder="SP" className="input" maxLength={2} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Segmento *</label>
                  <select value={form.segment} onChange={e => setForm(p => ({ ...p, segment: e.target.value }))} className="input">
                    <option value="">Selecione</option>
                    {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Origem</label>
                  <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} className="input">
                    <option value="">Selecione</option>
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Potencial anual (R$)</label>
                  <input value={form.estimatedRevenue} onChange={e => setForm(p => ({ ...p, estimatedRevenue: e.target.value }))} placeholder="Ex: 50000" className="input" type="number" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Observações</label>
                  <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="input resize-none h-20" placeholder="Contexto, interesse, próximos passos..." />
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={!form.name || !form.contact || !form.phone || !form.city || !form.segment}
                  className="w-full btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Cadastrar Prospect
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </RepLayout>
  )
}
