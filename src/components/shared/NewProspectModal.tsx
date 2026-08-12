import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import CnpjLookupField from './CnpjLookupField'
import { createProspect, logAudit } from '@/services/db'
import type { CnpjData } from '@/services/cnpj'
import type { Client as ClientType, User } from '@/types'

const SEGMENTS = ['Agropecuária', 'Pet Shop', 'Distribuidor', 'Cooperativa', 'Fazenda', 'Revendedor', 'Outros']
const ORIGINS = ['Indicação', 'Prospecção ativa', 'Feira/Evento', 'Redes sociais', 'Site', 'Outro']

interface Props {
  open: boolean
  userId: string
  userName: string
  userRole: 'admin' | 'rep'
  existingClients?: ClientType[]
  reps?: User[] // se informado, mostra seletor de representante (uso admin)
  onClose: () => void
  onCreated: () => void
}

const EMPTY = {
  name: '', tradeName: '', cnpj: '', contact: '', phone: '', whatsapp: '', email: '',
  city: '', state: 'SC', region: '', address: '', segment: '', source: '', notes: '', repId: '',
}

export default function NewProspectModal({ open, userId, userName, userRole, existingClients = [], reps, onClose, onCreated }: Props) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [autoFilled, setAutoFilled] = useState<Set<string>>(new Set())

  if (!open) return null

  function handleCnpjFill(data: CnpjData) {
    setForm(f => ({
      ...f,
      name: data.razaoSocial || f.name,
      tradeName: data.nomeFantasia || f.tradeName,
      phone: data.telefone || f.phone,
      email: data.email || f.email,
      city: data.municipio || f.city,
      state: data.uf || f.state,
      address: [data.logradouro, data.numero, data.bairro].filter(Boolean).join(', ') || f.address,
    }))
    setAutoFilled(new Set(['name', 'tradeName', 'phone', 'email', 'city', 'state', 'address']))
  }

  function close() { setForm(EMPTY); setError(''); setAutoFilled(new Set()); onClose() }

  async function handleSave() {
    if (!form.name.trim()) { setError('Razão Social é obrigatória'); return }
    if (!form.phone.trim()) { setError('Telefone é obrigatório'); return }
    if (!form.city.trim()) { setError('Cidade é obrigatória'); return }
    if (!form.segment) { setError('Segmento é obrigatório'); return }
    const repId = reps ? form.repId : userId
    const repName = reps ? (reps.find(r => r.id === form.repId)?.name ?? '') : userName
    if (reps && !repId) { setError('Selecione um representante'); return }

    setSaving(true); setError('')
    try {
      const prospect = await createProspect({
        name: form.name.trim(),
        tradeName: form.tradeName.trim() || undefined,
        cnpj: form.cnpj.replace(/\D/g, '') || undefined,
        contact: form.contact.trim(),
        phone: form.phone.trim(),
        whatsapp: form.whatsapp.trim() || undefined,
        email: form.email.trim() || undefined,
        city: form.city.trim(),
        state: form.state,
        region: form.region.trim() || undefined,
        address: form.address.trim() || undefined,
        segment: form.segment,
        status: 'disponivel',
        stage: 'novo_prospect',
        repId, repName,
        source: form.source || undefined,
        notes: form.notes.trim() || undefined,
        attempts: 0,
      } as Parameters<typeof createProspect>[0])
      if (prospect) {
        await logAudit({
          userId, userName, userRole, action: 'create_prospect', entity: 'Prospect', entityId: prospect.id,
          description: `Prospect ${prospect.name} cadastrado`, timestamp: new Date().toISOString(),
        })
      }
      close(); onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao cadastrar prospect')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-black/50" onClick={close} />
        <motion.div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
          initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}>
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">Novo Prospect</h2>
            <button onClick={close} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-3">
            {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}

            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">CNPJ (opcional)</label>
              <CnpjLookupField
                value={form.cnpj}
                onChange={v => setForm(f => ({ ...f, cnpj: v }))}
                onFill={handleCnpjFill}
                existingClients={existingClients}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500 block mb-1">Razão Social *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input w-full" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500 block mb-1">Nome Fantasia</label>
                <input value={form.tradeName} onChange={e => setForm(f => ({ ...f, tradeName: e.target.value }))} className="input w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Responsável</label>
                <input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} className="input w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Telefone *</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">WhatsApp</label>
                <input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} className="input w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">E-mail</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Cidade *</label>
                <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="input w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Estado</label>
                <input value={form.state} maxLength={2} onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} className="input w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Região</label>
                <input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="Ex: Vale do Itajaí" className="input w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Segmento *</label>
                <select value={form.segment} onChange={e => setForm(f => ({ ...f, segment: e.target.value }))} className="input w-full">
                  <option value="">Selecionar...</option>
                  {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500 block mb-1">Endereço</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="input w-full" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Origem do Lead</label>
                <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} className="input w-full">
                  <option value="">—</option>
                  {ORIGINS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              {reps && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Representante *</label>
                  <select value={form.repId} onChange={e => setForm(f => ({ ...f, repId: e.target.value }))} className="input w-full">
                    <option value="">Selecionar...</option>
                    {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500 block mb-1">Observações</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="input resize-none w-full" />
              </div>
            </div>
            {autoFilled.size > 0 && (
              <p className="text-xs text-blue-600 flex items-center gap-1"><Check className="w-3 h-3" /> Preenchido automaticamente pelo CNPJ. Confira antes de salvar.</p>
            )}
          </div>

          <div className="p-5 border-t border-slate-100 flex gap-3">
            <button onClick={close} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
              Cadastrar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
