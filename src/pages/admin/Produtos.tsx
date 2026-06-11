import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, Package, Edit2, ToggleLeft, ToggleRight, X, Check, AlertCircle, Tag, Sliders, Gift } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useAllProducts, useProductCategories, useProductSubcategories, useProductAttributes, useProductAttributeValues, useProductAttributeAssignments } from '@/hooks/useData'
import { useAuth } from '@/contexts/AuthContext'
import { createProduct, updateProduct, toggleProductActive, setProductCategory, saveProductAttributeAssignment, deleteProductAttributeAssignment, logAudit } from '@/services/db'
import { LoadingSpinner, EmptyState } from '@/components/shared/LoadingState'
import { formatCurrency, cn } from '@/utils'
import type { Product } from '@/types'

const UNITS = ['un', 'cx', 'kg', 'L', 'sc', 'par', 'dose', 'kit']
const EMPTY_FORM = {
  code: '', name: '', category: 'Acessórios Pet',
  price: '', unit: 'un', stock: '', image_url: '',
  productType: 'normal' as 'normal' | 'kit_promocional',
  kitPaidQty: '10', kitDeliveredQty: '11',
}

export default function AdminProdutos() {
  const { user } = useAuth()
  const { data: allProducts = [], loading, refetch } = useAllProducts()
  const { data: allCategories = [] } = useProductCategories()
  const { data: allSubcategories = [] } = useProductSubcategories()

  const [search, setSearch]         = useState('')
  const [catIdFilter, setCatIdFilter]     = useState('todas')
  const [subIdFilter, setSubIdFilter]     = useState('todas')
  const [statusFilter, setStatusFilter]   = useState<'todos' | 'ativo' | 'inativo'>('todos')
  const [showForm, setShowForm]           = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm]                   = useState(EMPTY_FORM)
  const [saving, setSaving]               = useState(false)
  const [formError, setFormError]         = useState('')

  // Modal de categoria rápida
  const [showCatModal, setShowCatModal]       = useState(false)
  const [catProduct, setCatProduct]           = useState<Product | null>(null)
  const [catModalCatId, setCatModalCatId]     = useState('')
  const [catModalSubId, setCatModalSubId]     = useState('')
  const [savingCat, setSavingCat]             = useState(false)

  // Modal de atributos
  const [showAttrModal, setShowAttrModal]     = useState(false)
  const [attrProduct, setAttrProduct]         = useState<Product | null>(null)
  const [attrSelections, setAttrSelections]   = useState<Record<string, Set<string>>>({}) // attrId → Set<valueId>
  const [savingAttr, setSavingAttr]           = useState(false)

  const { data: allAttributes = [] } = useProductAttributes()
  const { data: allAttrValues = [] }  = useProductAttributeValues()
  const { data: existingAssignments = [], refetch: refetchAssignments } = useProductAttributeAssignments(attrProduct?.id)

  const filteredSubs = useMemo(
    () => catIdFilter === 'todas' ? allSubcategories : allSubcategories.filter(s => s.categoryId === catIdFilter),
    [allSubcategories, catIdFilter]
  )

  const modalSubs = useMemo(
    () => allSubcategories.filter(s => s.categoryId === catModalCatId),
    [allSubcategories, catModalCatId]
  )

  const filtered = useMemo(() => allProducts.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
    const matchCat  = catIdFilter === 'todas' || p.categoryId === catIdFilter
    const matchSub  = subIdFilter === 'todas' || p.subcategoryId === subIdFilter
    const matchStatus = statusFilter === 'todos' ||
      (statusFilter === 'ativo' && p.active !== false) ||
      (statusFilter === 'inativo' && p.active === false)
    return matchSearch && matchCat && matchSub && matchStatus
  }), [allProducts, search, catIdFilter, subIdFilter, statusFilter])

  const openCreate = () => { setEditingProduct(null); setForm(EMPTY_FORM); setFormError(''); setShowForm(true) }
  const openEdit   = (p: Product) => {
    setEditingProduct(p)
    setForm({
      code: p.code, name: p.name, category: p.category,
      price: String(p.price), unit: p.unit, stock: String(p.stock), image_url: p.image ?? '',
      productType: p.productType ?? 'normal',
      kitPaidQty: String(p.kitPaidQty ?? 10),
      kitDeliveredQty: String(p.kitDeliveredQty ?? 11),
    })
    setFormError(''); setShowForm(true)
  }

  const openCatModal = (p: Product) => {
    setCatProduct(p)
    setCatModalCatId(p.categoryId ?? '')
    setCatModalSubId(p.subcategoryId ?? '')
    setShowCatModal(true)
  }

  const validate = () => {
    if (!form.code.trim()) return 'Código é obrigatório'
    if (!form.name.trim()) return 'Nome é obrigatório'
    if (!form.price || Number(form.price) <= 0) return 'Preço deve ser maior que zero'
    return ''
  }

  const handleSave = async () => {
    const err = validate(); if (err) { setFormError(err); return }
    if (!user) return
    setSaving(true); setFormError('')
    try {
      const data = {
        code: form.code.trim(), name: form.name.trim(), category: form.category,
        price: Number(form.price), unit: form.unit,
        stock: form.stock !== '' ? Number(form.stock) : 0,
        image: form.image_url.trim() || undefined, active: true,
        productType: form.productType,
        kitPaidQty: form.productType === 'kit_promocional' ? Number(form.kitPaidQty) || 1 : 1,
        kitDeliveredQty: form.productType === 'kit_promocional' ? Number(form.kitDeliveredQty) || 1 : 1,
      }
      if (editingProduct) {
        await updateProduct(editingProduct.id, data)
        await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_product', entity: 'Produto', entityId: editingProduct.id, description: `Atualizou produto ${data.name}`, timestamp: new Date().toISOString() })
      } else {
        const created = await createProduct(data as Omit<Product, 'id'>)
        if (created) await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'create_product', entity: 'Produto', entityId: created.id, description: `Criou produto ${data.name}`, timestamp: new Date().toISOString() })
      }
      setShowForm(false); refetch()
    } catch { setFormError('Erro ao salvar produto') }
    finally { setSaving(false) }
  }

  const handleToggle = async (p: Product) => {
    await toggleProductActive(p.id, !p.active)
    await logAudit({ userId: user!.id, userName: user!.name, userRole: user!.role, action: 'update_product', entity: 'Produto', entityId: p.id, description: `${p.active ? 'Desativou' : 'Ativou'} produto ${p.name}`, timestamp: new Date().toISOString() })
    refetch()
  }

  const handleSaveCat = async () => {
    if (!catProduct || !user) return
    setSavingCat(true)
    await setProductCategory(catProduct.id, catModalCatId || null, catModalSubId || null)
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'change_product_category', entity: 'Produto', entityId: catProduct.id, description: `Categoria/subcategoria de "${catProduct.name}" atualizada`, timestamp: new Date().toISOString() })
    setSavingCat(false); setShowCatModal(false); refetch()
  }

  const openAttrModal = (p: Product) => {
    setAttrProduct(p)
    // Pre-preenche com assignments existentes
    const sel: Record<string, Set<string>> = {}
    existingAssignments.forEach(a => {
      sel[a.attributeId] = new Set(a.values.map(v => v.id))
    })
    setAttrSelections(sel)
    setShowAttrModal(true)
  }

  const toggleAttrValue = (attrId: string, valId: string) => {
    setAttrSelections(prev => {
      const next = { ...prev }
      if (!next[attrId]) next[attrId] = new Set()
      const s = new Set(next[attrId])
      if (s.has(valId)) s.delete(valId); else s.add(valId)
      next[attrId] = s
      return next
    })
  }

  const handleSaveAttr = async () => {
    if (!attrProduct || !user) return
    setSavingAttr(true)
    // Remove atributos removidos
    for (const a of existingAssignments) {
      if (!attrSelections[a.attributeId] || attrSelections[a.attributeId].size === 0) {
        await deleteProductAttributeAssignment(attrProduct.id, a.attributeId)
      }
    }
    // Salva/atualiza atributos com valores
    for (const [attrId, valueSet] of Object.entries(attrSelections)) {
      if (valueSet.size > 0) {
        await saveProductAttributeAssignment(attrProduct.id, attrId, Array.from(valueSet))
      }
    }
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'assign_product_attributes', entity: 'Produto', entityId: attrProduct.id, description: `Atributos de "${attrProduct.name}" atualizados`, timestamp: new Date().toISOString() })
    setSavingAttr(false); setShowAttrModal(false); refetch()
  }

  return (
    <AdminLayout title="Produtos">
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Catálogo de Produtos</h2>
            <p className="text-xs text-slate-400 mt-0.5">{allProducts.filter(p => p.active !== false).length} ativos · {allProducts.filter(p => p.active === false).length} inativos</p>
          </div>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Produto
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código ou nome..." className="input pl-10" />
          </div>
          <select value={catIdFilter} onChange={e => { setCatIdFilter(e.target.value); setSubIdFilter('todas') }} className="input w-auto min-w-40">
            <option value="todas">Todas categorias</option>
            {allCategories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={subIdFilter} onChange={e => setSubIdFilter(e.target.value)} className="input w-auto min-w-44">
            <option value="todas">Todas subcategorias</option>
            {filteredSubs.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="input w-auto">
            <option value="todos">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total', value: allProducts.length, color: 'text-slate-900' },
            { label: 'Ativos', value: allProducts.filter(p => p.active !== false).length, color: 'text-green-600' },
            { label: 'Inativos', value: allProducts.filter(p => p.active === false).length, color: 'text-slate-400' },
            { label: 'Filtrados', value: filtered.length, color: 'text-primary-600' },
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
                    {['Código', 'Nome', 'Subcategoria', 'Preço', 'Estoque', 'Status', 'Ações'].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-slate-500 px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <motion.tr key={p.id}
                      className={cn('border-b border-slate-50 hover:bg-slate-50/50 transition-colors', p.active === false && 'opacity-50')}
                      initial={{ opacity: 0 }} animate={{ opacity: p.active === false ? 0.5 : 1 }} transition={{ delay: i * 0.01 }}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.code}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 max-w-xs">
                        <span className="truncate block">{p.name}</span>
                        {p.productType === 'kit_promocional' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full mt-0.5">
                            <Gift className="w-2.5 h-2.5" />
                            Kit {p.kitPaidQty}+{(p.kitDeliveredQty ?? 0) - (p.kitPaidQty ?? 0)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.subcategoryName
                          ? <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">{p.subcategoryName}</span>
                          : <span className="text-xs text-slate-300 italic">—</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(p.price)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('font-semibold', p.stock < 10 ? 'text-red-600' : 'text-slate-700')}>{p.stock}</span>
                        {p.stock < 10 && p.active !== false && <span className="ml-1 text-xs text-red-400">baixo</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', p.active !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
                          {p.active !== false ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(p)} className="text-slate-400 hover:text-primary-600 transition-colors" title="Editar produto">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => openCatModal(p)} className="text-slate-400 hover:text-teal-600 transition-colors" title="Alterar categoria">
                            <Tag className="w-4 h-4" />
                          </button>
                          <button onClick={() => openAttrModal(p)} className="text-slate-400 hover:text-violet-600 transition-colors" title="Atributos do produto">
                            <Sliders className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleToggle(p)} className="text-slate-400 hover:text-green-600 transition-colors" title={p.active !== false ? 'Desativar' : 'Ativar'}>
                            {p.active !== false ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
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

      {/* Modal: Criar/Editar Produto */}
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
                  {formError && <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl"><AlertCircle className="w-3.5 h-3.5" />{formError}</div>}
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
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Preço (R$) *</label>
                      <input value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="0,00" type="number" step="0.01" min="0.01" className="input" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 block mb-1">Estoque</label>
                      <input value={form.stock} onChange={e => setForm(p => ({ ...p, stock: e.target.value }))} placeholder="0" type="number" min="0" className="input" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-slate-500 block mb-1">URL da Imagem</label>
                      <input value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} placeholder="https://..." className="input" />
                    </div>
                  </div>

                  {/* Kit Promocional */}
                  <div className="border border-orange-200 rounded-xl p-3 space-y-3 bg-orange-50/40">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.productType === 'kit_promocional'}
                        onChange={e => setForm(p => ({ ...p, productType: e.target.checked ? 'kit_promocional' : 'normal' }))}
                        className="w-4 h-4 accent-orange-500"
                      />
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-orange-700">
                        <Gift className="w-4 h-4" /> Produto Promocional (Kit)
                      </span>
                    </label>
                    {form.productType === 'kit_promocional' && (
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="text-xs font-semibold text-slate-500 block mb-1">Quantidade cobrada</label>
                          <input
                            type="number" min={1} value={form.kitPaidQty}
                            onChange={e => setForm(p => ({ ...p, kitPaidQty: e.target.value }))}
                            placeholder="10" className="input" />
                          <p className="text-[10px] text-slate-400 mt-0.5">Pague X</p>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-500 block mb-1">Quantidade entregue</label>
                          <input
                            type="number" min={1} value={form.kitDeliveredQty}
                            onChange={e => setForm(p => ({ ...p, kitDeliveredQty: e.target.value }))}
                            placeholder="11" className="input" />
                          <p className="text-[10px] text-slate-400 mt-0.5">Leve Y</p>
                        </div>
                        <div className="col-span-2 bg-orange-100 rounded-lg px-3 py-2 text-xs text-orange-800 font-medium">
                          🎁 Promoção: Pague {form.kitPaidQty || '?'} e leve {form.kitDeliveredQty || '?'}
                          — Por kit: cobra {form.kitPaidQty || '?'} un · entrega {form.kitDeliveredQty || '?'} un
                        </div>
                      </div>
                    )}
                  </div>

                  <button onClick={handleSave} disabled={saving} className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                    <Check className="w-4 h-4" /> {saving ? 'Salvando...' : editingProduct ? 'Salvar Alterações' : 'Criar Produto'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal: Alterar categoria do produto */}
      <AnimatePresence>
        {showCatModal && catProduct && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCatModal(false)} />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900">Alterar Categoria</h2>
                  <button onClick={() => setShowCatModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-xs text-slate-500 truncate">Produto: <strong>{catProduct.name}</strong></p>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Categoria</label>
                    <select value={catModalCatId} onChange={e => { setCatModalCatId(e.target.value); setCatModalSubId('') }} className="input">
                      <option value="">Sem categoria</option>
                      {allCategories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Subcategoria</label>
                    <select value={catModalSubId} onChange={e => setCatModalSubId(e.target.value)} className="input" disabled={!catModalCatId}>
                      <option value="">Sem subcategoria</option>
                      {modalSubs.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowCatModal(false)} className="flex-1 btn-secondary">Cancelar</button>
                    <button onClick={handleSaveCat} disabled={savingCat} className="flex-1 btn-primary disabled:opacity-50">
                      {savingCat ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal: Atributos do produto */}
      <AnimatePresence>
        {showAttrModal && attrProduct && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAttrModal(false)} />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
                  <div>
                    <h2 className="font-bold text-slate-900">Atributos do Produto</h2>
                    <p className="text-xs text-slate-400 truncate">{attrProduct.name}</p>
                  </div>
                  <button onClick={() => setShowAttrModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
                <div className="p-5 space-y-5">
                  {allAttributes.filter(a => a.active).map(attr => {
                    const values = allAttrValues.filter(v => v.attributeId === attr.id && v.active)
                    const selected = attrSelections[attr.id] ?? new Set()
                    const hasAny = selected.size > 0
                    return (
                      <div key={attr.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm font-semibold text-slate-800">{attr.name}</p>
                          {attr.description && <p className="text-xs text-slate-400">{attr.description}</p>}
                          {hasAny && <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">{selected.size} selecionado(s)</span>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {values.map(v => {
                            const isSelected = selected.has(v.id)
                            return (
                              <button key={v.id} onClick={() => toggleAttrValue(attr.id, v.id)}
                                className={cn('px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all',
                                  isSelected ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 text-slate-600 bg-white hover:border-primary-300')}>
                                {isSelected && <Check className="w-3 h-3 inline mr-1" />}{v.name}
                              </button>
                            )
                          })}
                          {values.length === 0 && <p className="text-xs text-slate-400 italic">Nenhum valor cadastrado para este atributo</p>}
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex gap-3 pt-2 border-t border-slate-100">
                    <button onClick={() => setShowAttrModal(false)} className="flex-1 btn-secondary">Cancelar</button>
                    <button onClick={handleSaveAttr} disabled={savingAttr}
                      className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50">
                      <Check className="w-4 h-4" /> {savingAttr ? 'Salvando...' : 'Salvar Atributos'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
