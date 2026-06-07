import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, Package, Edit2, ToggleLeft, ToggleRight, X, Check, AlertCircle } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useAllProducts } from '@/hooks/useData'
import { useAuth } from '@/contexts/AuthContext'
import { createProduct, updateProduct, toggleProductActive, logAudit } from '@/services/db'
import { LoadingSpinner, EmptyState } from '@/components/shared/LoadingState'
import { formatCurrency, cn } from '@/utils'
import type { Product } from '@/types'

const CATEGORIES = ['Acessórios', 'Alimentação', 'Higiene', 'Brinquedos', 'Vestuário', 'Saúde', 'Camas/Casinhas', 'Outros']
const UNITS = ['un', 'cx', 'kg', 'L', 'sc', 'par', 'dose', 'kit']

const EMPTY_FORM = { code: '', name: '', category: '', price: '', unit: 'un', stock: '', image_url: '' }

export default function AdminProdutos() {
  const { user } = useAuth()
  const { data: allProducts = [], loading, refetch } = useAllProducts()

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('todas')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo'>('todos')
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const categories = useMemo(() => [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort(), [allProducts])

  const filtered = useMemo(() => allProducts.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter === 'todas' || p.category === catFilter
    const matchStatus = statusFilter === 'todos' ||
      (statusFilter === 'ativo' && p.active) ||
      (statusFilter === 'inativo' && !p.active)
    return matchSearch && matchCat && matchStatus
  }), [allProducts, search, catFilter, statusFilter])

  const openCreate = () => {
    setEditingProduct(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowForm(true)
  }

  const openEdit = (p: Product) => {
    setEditingProduct(p)
    setForm({ code: p.code, name: p.name, category: p.category, price: String(p.price), unit: p.unit, stock: String(p.stock), image_url: p.image ?? '' })
    setFormError('')
    setShowForm(true)
  }

  // MELHORIA 5: Validações
  const validate = () => {
    if (!form.code.trim()) return 'Código é obrigatório'
    if (!form.name.trim()) return 'Nome é obrigatório'
    if (!form.category) return 'Categoria é obrigatória'
    if (!form.price || Number(form.price) <= 0) return 'Preço deve ser maior que zero'
    if (!form.unit) return 'Unidade é obrigatória'
    if (form.stock !== '' && Number(form.stock) < 0) return 'Estoque não pode ser negativo'
    return ''
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { setFormError(err); return }
    if (!user) return

    setSaving(true)
    setFormError('')

    try {
      const data = {
        code: form.code.trim(),
        name: form.name.trim(),
        category: form.category,
        price: Number(form.price),
        unit: form.unit,
        stock: form.stock !== '' ? Number(form.stock) : 0,
        image: form.image_url.trim() || undefined,
        active: true,
      }

      if (editingProduct) {
        await updateProduct(editingProduct.id, data)
        await logAudit({
          userId: user.id, userName: user.name, userRole: user.role,
          action: 'update_product', entity: 'Produto', entityId: editingProduct.id,
          description: `Atualizou produto ${data.name}`,
          timestamp: new Date().toISOString(),
        })
      } else {
        const created = await createProduct(data as Omit<Product, 'id'>)
        if (created) {
          await logAudit({
            userId: user.id, userName: user.name, userRole: user.role,
            action: 'create_product', entity: 'Produto', entityId: created.id,
            description: `Criou produto ${data.name}`,
            timestamp: new Date().toISOString(),
          })
        }
      }

      setShowForm(false)
      refetch()
    } catch {
      setFormError('Erro ao salvar produto')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (p: Product) => {
    await toggleProductActive(p.id, !p.active)
    await logAudit({
      userId: user!.id, userName: user!.name, userRole: user!.role,
      action: 'update_product', entity: 'Produto', entityId: p.id,
      description: `${p.active ? 'Desativou' : 'Ativou'} produto ${p.name}`,
      timestamp: new Date().toISOString(),
    })
    refetch()
  }

  return (
    <AdminLayout title="Produtos">
      <div className="p-6 space-y-5 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Catálogo de Produtos</h2>
            <p className="text-xs text-slate-400 mt-0.5">{allProducts.filter(p => p.active).length} ativos · {allProducts.filter(p => !p.active).length} inativos</p>
          </div>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Produto
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código, nome ou categoria..." className="input pl-10" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="input w-auto min-w-36">
            <option value="todas">Todas categorias</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="input w-auto">
            <option value="todos">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total', value: allProducts.length, color: 'text-slate-900' },
            { label: 'Ativos', value: allProducts.filter(p => p.active).length, color: 'text-green-600' },
            { label: 'Inativos', value: allProducts.filter(p => !p.active).length, color: 'text-slate-400' },
          ].map(s => (
            <div key={s.label} className="card p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState label="Nenhum produto encontrado" icon={Package} />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['Código', 'Nome', 'Categoria', 'Preço', 'Unidade', 'Estoque', 'Status', 'Ações'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-slate-500 px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <motion.tr key={p.id} className={cn('border-b border-slate-50 hover:bg-slate-50/50 transition-colors', !p.active && 'opacity-50')}
                      initial={{ opacity: 0 }} animate={{ opacity: p.active ? 1 : 0.5 }} transition={{ delay: i * 0.02 }}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.code}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                      <td className="px-4 py-3"><span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{p.category}</span></td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(p.price)}</td>
                      <td className="px-4 py-3 text-slate-500">{p.unit}</td>
                      <td className="px-4 py-3">
                        <span className={cn('font-semibold', p.stock < 10 ? 'text-red-600' : 'text-slate-700')}>{p.stock}</span>
                        {p.stock < 10 && p.active && <span className="ml-1 text-xs text-red-500">baixo</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', p.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
                          {p.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(p)} className="text-slate-400 hover:text-primary-600 transition-colors" title="Editar">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleToggle(p)} className={cn('transition-colors', p.active ? 'text-slate-400 hover:text-red-500' : 'text-slate-400 hover:text-green-600')} title={p.active ? 'Desativar' : 'Ativar'}>
                            {p.active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForm(false)} />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h2>
                  <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  {formError && (
                    <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{formError}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Código *</label>
                      <input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="Ex: COL001" className="input" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Unidade *</label>
                      <select value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} className="input">
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Nome *</label>
                      <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome do produto" className="input" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Categoria *</label>
                      <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="input">
                        <option value="">Selecione...</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Preço (R$) *</label>
                      <input value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="0,00" type="number" step="0.01" min="0.01" className="input" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Estoque</label>
                      <input value={form.stock} onChange={e => setForm(p => ({ ...p, stock: e.target.value }))} placeholder="0" type="number" min="0" className="input" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 block mb-1">URL da Imagem</label>
                      <input value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} placeholder="https://..." className="input" />
                    </div>
                  </div>
                  <button onClick={handleSave} disabled={saving}
                    className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                    <Check className="w-4 h-4" /> {saving ? 'Salvando...' : editingProduct ? 'Salvar Alterações' : 'Criar Produto'}
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
