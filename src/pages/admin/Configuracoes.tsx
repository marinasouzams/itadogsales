import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Shield, Building2, Users, Save, Eye, EyeOff, Plus, X, MapPin, CheckCircle2, DollarSign } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useUsers, useCompanySettings } from '@/hooks/useData'
import { createRepresentante, updateProfile, updateCompanySettings } from '@/services/db'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { cn, formatCurrency } from '@/utils'
import type { User } from '@/types'

const SECTION_TABS = [
  { key: 'empresa', label: 'Empresa', icon: Building2 },
  { key: 'comercial', label: 'Comercial', icon: DollarSign },
  { key: 'notificacoes', label: 'Notificações', icon: Bell },
  { key: 'seguranca', label: 'Segurança', icon: Shield },
  { key: 'equipe', label: 'Equipe', icon: Users },
] as const

type TabKey = typeof SECTION_TABS[number]['key']

const ALL_CITIES = [
  'São José do Rio Preto', 'Votuporanga', 'Fernandópolis', 'Catanduva', 'Mirassol',
  'Uberlândia', 'Uberaba', 'Patos de Minas', 'Araguari', 'Ituiutaba',
  'Goiânia', 'Anápolis', 'Rio Verde', 'Jataí', 'Inhumas',
  'Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá', 'Ponta Porã',
  'Barretos', 'Ribeirão Preto', 'Sertãozinho', 'Jaboticabal', 'Bebedouro',
]

export default function AdminConfiguracoes() {
  const [activeTab, setActiveTab] = useState<TabKey>('empresa')
  const [saved, setSaved] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showNewRep, setShowNewRep] = useState(false)
  const [editingTerritoryId, setEditingTerritoryId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState('')

  const { data: users = [], loading: loadingUsers, refetch: refetchUsers } = useUsers()
  const { data: settings, refetch: refetchSettings } = useCompanySettings()
  const repsFromDb = users.filter(u => u.role === 'rep')

  const [newRepForm, setNewRepForm] = useState({ name: '', email: '', password: '', phone: '', region: '', territory: [] as string[], meta: '' })
  const [commRate, setCommRate] = useState('')
  const [monthlyGoal, setMonthlyGoal] = useState('')
  const [allowWithoutStock, setAllowWithoutStock] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  // Sync settings into local state when loaded
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  if (settings && !settingsLoaded) {
    setCommRate(String(settings.defaultCommissionRate))
    setMonthlyGoal(String(settings.defaultMonthlyGoal))
    setAllowWithoutStock(settings.allowSalesWithoutStock ?? false)
    setSettingsLoaded(true)
  }

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveCommercial = async () => {
    if (!commRate || Number(commRate) <= 0) return
    if (!monthlyGoal || Number(monthlyGoal) <= 0) return
    await updateCompanySettings({ defaultCommissionRate: Number(commRate), defaultMonthlyGoal: Number(monthlyGoal), allowSalesWithoutStock: allowWithoutStock })
    refetchSettings()
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  const toggleRepActive = async (rep: User) => {
    await updateProfile(rep.id, { active: !rep.active })
    refetchUsers()
  }

  const toggleCity = (city: string) => {
    setNewRepForm(prev => ({
      ...prev,
      territory: prev.territory.includes(city)
        ? prev.territory.filter(c => c !== city)
        : [...prev.territory, city],
    }))
  }

  const toggleRepCity = async (rep: User, city: string) => {
    const territory = rep.territory ?? []
    const newTerritory = territory.includes(city)
      ? territory.filter(c => c !== city)
      : [...territory, city]
    await updateProfile(rep.id, { territory: newTerritory })
    refetchUsers()
  }

  const handleAddRep = async () => {
    if (!newRepForm.name || !newRepForm.email || !newRepForm.password) return
    setSaving(true)
    setAddError('')
    const result = await createRepresentante({
      name: newRepForm.name,
      email: newRepForm.email,
      password: newRepForm.password,
      phone: newRepForm.phone || undefined,
      region: newRepForm.region || undefined,
      territory: newRepForm.territory,
      meta: newRepForm.meta ? Number(newRepForm.meta) : undefined,
    })
    if (result.success) {
      setShowNewRep(false)
      setNewRepForm({ name: '', email: '', password: '', phone: '', region: '', territory: [], meta: '' })
      refetchUsers()
    } else {
      setAddError(result.error ?? 'Erro ao criar representante')
    }
    setSaving(false)
  }

  return (
    <AdminLayout title="Configurações">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex gap-6">
          {/* Sidebar nav */}
          <div className="w-48 flex-shrink-0 space-y-1">
            {SECTION_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left',
                  activeTab === tab.key ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-4">
            {activeTab === 'empresa' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="card p-5">
                  <h3 className="font-semibold text-slate-900 mb-4">Dados da Empresa</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Nome da empresa', value: 'ITA Dog Sales' },
                      { label: 'CNPJ', value: '00.000.000/0001-00' },
                      { label: 'Segmento', value: 'Agronegócio — Insumos' },
                      { label: 'Email de suporte', value: 'suporte@itasales.com.br' },
                    ].map(field => (
                      <div key={field.label}>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">{field.label}</label>
                        <input defaultValue={field.value} className="input" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card p-5">
                  <h3 className="font-semibold text-slate-900 mb-4">Metas e Comissões</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Meta mensal padrão (R$)', value: '180000' },
                      { label: 'Taxa de comissão padrão (%)', value: '3.5' },
                      { label: 'Período de pagamento (dias)', value: '30' },
                      { label: 'Prazo de visita (dias)', value: '30' },
                    ].map(field => (
                      <div key={field.label}>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">{field.label}</label>
                        <input type="number" defaultValue={field.value} className="input" />
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'comercial' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="card p-5 space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary-600" /> Configurações Comerciais
                  </h3>
                  <p className="text-xs text-slate-400">Esses valores são usados automaticamente no cálculo de comissões e metas.</p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Taxa padrão de comissão (%)</label>
                    <div className="flex gap-2 flex-wrap mb-2">
                      {[3, 5, 7, 10, 12.5].map(v => (
                        <button key={v} onClick={() => setCommRate(String(v))}
                          className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                            String(commRate) === String(v) ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 text-slate-600 hover:border-primary-300')}>
                          {v}%
                        </button>
                      ))}
                    </div>
                    <input type="number" value={commRate} onChange={e => setCommRate(e.target.value)} step="0.1" min="0.1" max="50" placeholder="Ex: 3.5" className="input w-40" />
                    <p className="text-xs text-slate-400 mt-1">Atual no banco: <strong>{settings?.defaultCommissionRate ?? '...'}%</strong></p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Meta mensal padrão (R$)</label>
                    <input type="number" value={monthlyGoal} onChange={e => setMonthlyGoal(e.target.value)} step="1000" min="1000" placeholder="180000" className="input" />
                    <p className="text-xs text-slate-400 mt-1">Atual no banco: <strong>{settings?.defaultMonthlyGoal ? formatCurrency(settings.defaultMonthlyGoal) : '...'}</strong></p>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-500 font-semibold mb-2">Estoque</p>
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800">Permitir venda sem estoque</p>
                        <p className="text-xs text-slate-400">Quando ativo, pedidos são criados mesmo com estoque zerado</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={allowWithoutStock}
                          onChange={e => setAllowWithoutStock(e.target.checked)}
                        />
                        <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-primary-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-500 font-semibold mb-2">Simulação de comissão</p>
                    <div className="bg-slate-50 rounded-xl p-3 text-sm">
                      <p>Pedido {formatCurrency(1000)} → Comissão: <strong className="text-primary-600">{formatCurrency(1000 * Number(commRate || 0) / 100)}</strong></p>
                      <p className="mt-1">Pedido {formatCurrency(5000)} → Comissão: <strong className="text-primary-600">{formatCurrency(5000 * Number(commRate || 0) / 100)}</strong></p>
                    </div>
                  </div>

                  <button onClick={handleSaveCommercial}
                    className={cn('btn-primary flex items-center gap-2', settingsSaved && 'bg-green-600 border-green-700')}>
                    <Save className="w-4 h-4" />
                    {settingsSaved ? 'Salvo!' : 'Salvar Configurações Comerciais'}
                  </button>
                </div>
              </motion.div>
            )}

            {activeTab === 'notificacoes' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-5 space-y-4">
                <h3 className="font-semibold text-slate-900">Notificações</h3>
                {[
                  { label: 'Pedido criado', sub: 'Notificar quando representante cria um pedido' },
                  { label: 'Erro de sincronização Bling', sub: 'Alertar sobre falhas de integração' },
                  { label: 'Cliente sem visita', sub: 'Alertar clientes sem visita há mais de 30 dias' },
                  { label: 'Meta atingida', sub: 'Comemorar quando rep bate a meta do mês' },
                  { label: 'Novo lead disponível', sub: 'Alertar representantes sobre novos leads' },
                ].map((notif, i) => (
                  <div key={notif.label} className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{notif.label}</p>
                      <p className="text-xs text-slate-400">{notif.sub}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                      <input type="checkbox" defaultChecked={i < 3} className="sr-only peer" />
                      <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-primary-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                    </label>
                  </div>
                ))}
              </motion.div>
            )}

            {activeTab === 'seguranca' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="card p-5">
                  <h3 className="font-semibold text-slate-900 mb-4">Alterar Senha</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Senha atual</label>
                      <div className="relative">
                        <input type={showPass ? 'text' : 'password'} placeholder="••••••••" className="input pr-12" />
                        <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Nova senha</label>
                      <input type="password" placeholder="••••••••" className="input" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Confirmar nova senha</label>
                      <input type="password" placeholder="••••••••" className="input" />
                    </div>
                  </div>
                </div>
                <div className="card p-5">
                  <h3 className="font-semibold text-slate-900 mb-3">Segurança da Conta</h3>
                  {[
                    { label: 'Autenticação em dois fatores', enabled: false },
                    { label: 'Sessão expira em 8h', enabled: true },
                    { label: 'Log de acesso ativado', enabled: true },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                      <span className="text-sm text-slate-700">{item.label}</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked={item.enabled} className="sr-only peer" />
                        <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-primary-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'equipe' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                {/* Add rep button */}
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">Representantes ({loadingUsers ? '...' : repsFromDb.length})</h3>
                  <button
                    onClick={() => setShowNewRep(true)}
                    className="flex items-center gap-1.5 text-sm font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-xl bg-primary-50 hover:bg-primary-100 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Adicionar representante
                  </button>
                </div>

                {/* Rep list */}
                <div className="space-y-3">
                  {repsFromDb.map(rep => (
                    <div key={rep.id} className="card p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{rep.name}</p>
                          <p className="text-xs text-slate-400">{rep.email}</p>
                          {rep.region && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" />{rep.region}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', rep.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
                            {rep.active ? 'Ativo' : 'Inativo'}
                          </span>
                          <button
                            onClick={() => toggleRepActive(rep)}
                            className={cn('text-xs px-2 py-1 rounded-lg border font-medium transition-colors', rep.active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50')}
                          >
                            {rep.active ? 'Desativar' : 'Reativar'}
                          </button>
                        </div>
                      </div>

                      {/* Territory */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs text-slate-500 font-semibold">Território (cidades)</p>
                          <button
                            onClick={() => setEditingTerritoryId(editingTerritoryId === rep.id ? null : rep.id)}
                            className="text-xs text-primary-600 font-medium"
                          >
                            {editingTerritoryId === rep.id ? 'Fechar' : 'Editar'}
                          </button>
                        </div>
                        {(rep.territory ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {(rep.territory ?? []).map(city => (
                              <span key={city} className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">{city}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Nenhuma cidade definida</p>
                        )}

                        {editingTerritoryId === rep.id && (
                          <div className="mt-2 flex flex-wrap gap-1.5 border border-slate-100 rounded-xl p-2 bg-slate-50">
                            {ALL_CITIES.map(city => {
                              const selected = (rep.territory ?? []).includes(city)
                              return (
                                <button
                                  key={city}
                                  onClick={() => toggleRepCity(rep, city)}
                                  className={cn(
                                    'text-xs px-2 py-1 rounded-full transition-colors font-medium',
                                    selected ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-primary-300'
                                  )}
                                >
                                  {selected && <CheckCircle2 className="w-3 h-3 inline mr-0.5" />}
                                  {city}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Permissions */}
                <div className="card p-5">
                  <h3 className="font-semibold text-slate-900 mb-3">Permissões</h3>
                  {[
                    { label: 'Representantes podem ver outros representantes', enabled: false },
                    { label: 'Representantes podem editar dados de clientes', enabled: true },
                    { label: 'Representantes podem cancelar pedidos', enabled: false },
                    { label: 'Admins recebem relatório semanal por email', enabled: true },
                  ].map(perm => (
                    <div key={perm.label} className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
                      <p className="text-sm text-slate-700">{perm.label}</p>
                      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                        <input type="checkbox" defaultChecked={perm.enabled} className="sr-only peer" />
                        <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-primary-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Save button */}
            {activeTab !== 'equipe' && (
              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  className={cn('btn-primary flex items-center gap-2', saved && 'bg-green-600 border-green-700')}
                >
                  <Save className="w-4 h-4" />
                  {saved ? 'Salvo!' : 'Salvar alterações'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Rep Modal */}
      <AnimatePresence>
        {showNewRep && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowNewRep(false)}
            />
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-6"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900">Novo Representante</h2>
                  <button onClick={() => setShowNewRep(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {addError && <p className="text-xs text-red-600 text-center bg-red-50 p-2 rounded-lg">{addError}</p>}
                  <p className="text-xs text-slate-400">⚠️ Requer "Email confirmations" desativado no painel Supabase → Authentication → Settings.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Nome completo *</label>
                      <input value={newRepForm.name} onChange={e => setNewRepForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: João da Silva" className="input" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Email *</label>
                      <input value={newRepForm.email} onChange={e => setNewRepForm(p => ({ ...p, email: e.target.value }))} placeholder="rep@empresa.com" className="input" type="email" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Senha *</label>
                      <input value={newRepForm.password} onChange={e => setNewRepForm(p => ({ ...p, password: e.target.value }))} placeholder="Senha inicial" className="input" type="password" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Telefone</label>
                      <input value={newRepForm.phone} onChange={e => setNewRepForm(p => ({ ...p, phone: e.target.value }))} placeholder="(17) 99999-0000" className="input" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Região</label>
                      <input value={newRepForm.region} onChange={e => setNewRepForm(p => ({ ...p, region: e.target.value }))} placeholder="Ex: Norte SP" className="input" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Meta mensal (R$)</label>
                      <input value={newRepForm.meta} onChange={e => setNewRepForm(p => ({ ...p, meta: e.target.value }))} placeholder="180000" className="input" type="number" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-2">Território (cidades)</label>
                    <div className="flex flex-wrap gap-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50 max-h-36 overflow-y-auto">
                      {ALL_CITIES.map(city => {
                        const selected = newRepForm.territory.includes(city)
                        return (
                          <button key={city} onClick={() => toggleCity(city)}
                            className={cn('text-xs px-2 py-1 rounded-full transition-colors font-medium',
                              selected ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-primary-300')}>
                            {city}
                          </button>
                        )
                      })}
                    </div>
                    {newRepForm.territory.length > 0 && <p className="text-xs text-primary-600 mt-1">{newRepForm.territory.length} cidade(s)</p>}
                  </div>

                  <button onClick={handleAddRep}
                    disabled={!newRepForm.name || !newRepForm.email || !newRepForm.password || saving}
                    className="w-full btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                    {saving ? 'Criando...' : 'Cadastrar Representante'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
