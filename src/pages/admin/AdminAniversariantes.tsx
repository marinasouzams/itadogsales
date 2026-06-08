import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { MessageCircle } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useClients } from '@/hooks/useData'
import { cn } from '@/utils'
import type { Client } from '@/types'

function daysUntilBirthday(dateStr: string): number {
  const today = new Date()
  const bday = new Date(dateStr)
  const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate())
  if (thisYear < today) thisYear.setFullYear(today.getFullYear() + 1)
  return Math.floor((thisYear.getTime() - today.getTime()) / 86400000)
}

interface BirthdayEntry {
  client: Client
  type: 'pessoa' | 'empresa'
  date: string
  daysUntil: number
}

function buildEntries(clients: Client[], maxDays: number): BirthdayEntry[] {
  const entries: BirthdayEntry[] = []
  for (const c of clients) {
    if (c.buyerBirthday) {
      const d = daysUntilBirthday(c.buyerBirthday)
      if (d <= maxDays) entries.push({ client: c, type: 'pessoa', date: c.buyerBirthday, daysUntil: d })
    }
    if (c.companyAnniversary) {
      const d = daysUntilBirthday(c.companyAnniversary)
      if (d <= maxDays) entries.push({ client: c, type: 'empresa', date: c.companyAnniversary, daysUntil: d })
    }
  }
  return entries.sort((a, b) => a.daysUntil - b.daysUntil)
}

function makeWhatsappUrl(client: Client, type: 'pessoa' | 'empresa'): string {
  const phone = (type === 'pessoa' ? client.buyerPhone || client.phone : client.phone).replace(/\D/g, '')
  const name = type === 'pessoa' ? (client.buyerName || client.name) : client.name
  const text = encodeURIComponent(
    `Olá ${name}. Toda equipe da ITADOG SALES deseja um feliz aniversário! Que seu novo ciclo seja repleto de saúde, prosperidade e muitas conquistas. Obrigado pela parceria. Equipe ITADOG SALES 🐾`
  )
  return `https://wa.me/55${phone}?text=${text}`
}

function BirthdayCard({ entry }: { entry: BirthdayEntry }) {
  const { client, type, date, daysUntil } = entry
  const displayName = type === 'pessoa' ? (client.buyerName || client.name) : client.name
  const formatted = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })

  return (
    <motion.div
      className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex items-center gap-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="text-3xl">{type === 'pessoa' ? '🎂' : '🏢'}</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm truncate">{displayName}</p>
        <p className="text-xs text-slate-500">{client.name}</p>
        <p className="text-xs text-slate-400 mt-0.5">{formatted}</p>
        {client.repId && (
          <p className="text-xs text-primary-600 font-medium mt-0.5">Rep: {client.repId}</p>
        )}
      </div>
      {daysUntil === 0 ? (
        <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">Hoje!</span>
      ) : (
        <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{daysUntil}d</span>
      )}
      <a
        href={makeWhatsappUrl(client, type)}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#25D366] text-white flex-shrink-0"
      >
        <MessageCircle className="w-4 h-4" />
      </a>
    </motion.div>
  )
}

function Group({ title, entries }: { title: string; entries: BirthdayEntry[] }) {
  const pessoas = entries.filter(e => e.type === 'pessoa')
  const empresas = entries.filter(e => e.type === 'empresa')
  if (entries.length === 0) return null
  return (
    <div className="mb-6">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">{title}</p>
      {pessoas.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-400 mb-2">Pessoa</p>
          <div className="space-y-2 mb-3">
            {pessoas.map((e, i) => <BirthdayCard key={`${e.client.id}-pessoa-${i}`} entry={e} />)}
          </div>
        </>
      )}
      {empresas.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-400 mb-2">Empresa</p>
          <div className="space-y-2">
            {empresas.map((e, i) => <BirthdayCard key={`${e.client.id}-empresa-${i}`} entry={e} />)}
          </div>
        </>
      )}
    </div>
  )
}

const TABS = [
  { key: 'dia', label: 'Hoje', days: 0 },
  { key: 'semana', label: 'Semana', days: 7 },
  { key: 'mes', label: 'Mês', days: 30 },
] as const
type TabKey = typeof TABS[number]['key']

export default function AdminAniversariantes() {
  const { data: clients = [], loading } = useClients()
  const [tab, setTab] = useState<TabKey>('dia')

  const currentDays = TABS.find(t => t.key === tab)!.days

  const all = useMemo(() => buildEntries(clients, 30), [clients])

  const filtered = useMemo(() => {
    if (tab === 'dia') return all.filter(e => e.daysUntil === 0)
    if (tab === 'semana') return all.filter(e => e.daysUntil <= 7)
    return all.filter(e => e.daysUntil <= 30)
  }, [all, tab, currentDays])

  const hoje = filtered.filter(e => e.daysUntil === 0)
  const resto = filtered.filter(e => e.daysUntil > 0)

  return (
    <AdminLayout title="Aniversariantes">
      <div className="p-4 pb-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-xl">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn('flex-1 py-2 rounded-lg text-sm font-semibold transition-all', tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-3">🎂</p>
            <p className="text-slate-400 font-medium">Nenhum aniversariante neste período</p>
          </div>
        ) : tab === 'dia' ? (
          <Group title="Hoje" entries={filtered} />
        ) : (
          <>
            {hoje.length > 0 && <Group title="Hoje" entries={hoje} />}
            {resto.length > 0 && <Group title={tab === 'semana' ? 'Esta semana' : 'Este mês'} entries={resto} />}
          </>
        )}
      </div>
    </AdminLayout>
  )
}
