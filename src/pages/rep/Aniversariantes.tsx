import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { MessageCircle } from 'lucide-react'
import RepLayout from '@/layouts/RepLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useClients } from '@/hooks/useData'
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

function buildEntries(clients: Client[]): BirthdayEntry[] {
  const entries: BirthdayEntry[] = []
  for (const c of clients) {
    if (c.buyerBirthday) {
      entries.push({ client: c, type: 'pessoa', date: c.buyerBirthday, daysUntil: daysUntilBirthday(c.buyerBirthday) })
    }
    if (c.companyAnniversary) {
      entries.push({ client: c, type: 'empresa', date: c.companyAnniversary, daysUntil: daysUntilBirthday(c.companyAnniversary) })
    }
  }
  return entries.filter(e => e.daysUntil <= 30).sort((a, b) => a.daysUntil - b.daysUntil)
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
        <p className="text-xs text-slate-400 mt-0.5">{formatted} · {client.address.city}</p>
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
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 px-4">{title}</p>
      {pessoas.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-400 mb-2 px-4">Pessoa</p>
          <div className="px-4 space-y-2 mb-3">
            {pessoas.map((e, i) => <BirthdayCard key={`${e.client.id}-pessoa-${i}`} entry={e} />)}
          </div>
        </>
      )}
      {empresas.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-400 mb-2 px-4">Empresa</p>
          <div className="px-4 space-y-2">
            {empresas.map((e, i) => <BirthdayCard key={`${e.client.id}-empresa-${i}`} entry={e} />)}
          </div>
        </>
      )}
    </div>
  )
}

export default function Aniversariantes() {
  const { user } = useAuth()
  const { data: clients = [], loading } = useClients(user?.id)

  const all = useMemo(() => buildEntries(clients), [clients])
  const hoje = useMemo(() => all.filter(e => e.daysUntil === 0), [all])
  const proximos7 = useMemo(() => all.filter(e => e.daysUntil > 0 && e.daysUntil <= 7), [all])
  const proximos30 = useMemo(() => all.filter(e => e.daysUntil > 7 && e.daysUntil <= 30), [all])

  return (
    <RepLayout title="Aniversariantes">
      <div className="flex flex-col pb-6 pt-4">
        {loading ? (
          <div className="text-center py-16 text-slate-400">Carregando...</div>
        ) : all.length === 0 ? (
          <div className="text-center py-16 px-4">
            <p className="text-5xl mb-3">🎂</p>
            <p className="text-slate-400 font-medium">Nenhum aniversariante nos próximos 30 dias</p>
          </div>
        ) : (
          <>
            <Group title="Hoje" entries={hoje} />
            <Group title="Próximos 7 dias" entries={proximos7} />
            <Group title="Próximos 30 dias" entries={proximos30} />
          </>
        )}
      </div>
    </RepLayout>
  )
}
