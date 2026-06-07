import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Edit2, ToggleLeft, ToggleRight, X, Check, ChevronRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useProductCategories, useProductSubcategories,
  useProductAttributes, useProductAttributeValues,
} from '@/hooks/useData'
import {
  createProductCategory, updateProductCategory,
  createProductSubcategory, updateProductSubcategory,
  createProductAttribute, updateProductAttribute,
  createProductAttributeValue, updateProductAttributeValue,
  logAudit,
} from '@/services/db'
import { cn } from '@/utils'
import type { ProductCategory, ProductSubcategory, ProductAttribute, ProductAttributeValue } from '@/types'

type View = 'categorias' | 'subcategorias' | 'atributos'

export default function ParametrizacaoProdutos() {
  const { user } = useAuth()
  const { data: categories = [], refetch: refetchCats } = useProductCategories()
  const { data: subcategories = [], refetch: refetchSubs } = useProductSubcategories()
  const { data: attributes = [], refetch: refetchAttrs } = useProductAttributes()
  const { data: allAttrValues = [], refetch: refetchVals } = useProductAttributeValues()

  const [view, setView] = useState<View>('categorias')
  const [catFilter, setCatFilter] = useState('todas')
  const [attrFilter, setAttrFilter] = useState('') // filtro de atributo para valores

  // Category form
  const [showCatForm, setShowCatForm] = useState(false)
  const [editingCat, setEditingCat] = useState<ProductCategory | null>(null)
  const [catForm, setCatForm] = useState({ name: '', description: '' })
  const [catSaving, setCatSaving] = useState(false)
  const [catError, setCatError] = useState('')

  // Subcategory form
  const [showSubForm, setShowSubForm] = useState(false)
  const [editingSub, setEditingSub] = useState<ProductSubcategory | null>(null)
  const [subForm, setSubForm] = useState({ name: '', description: '', categoryId: '' })
  const [subSaving, setSubSaving] = useState(false)
  const [subError, setSubError] = useState('')

  // Attribute form
  const [showAttrForm, setShowAttrForm] = useState(false)
  const [editingAttr, setEditingAttr] = useState<ProductAttribute | null>(null)
  const [attrForm, setAttrForm] = useState({ name: '', description: '' })
  const [attrSaving, setAttrSaving] = useState(false)
  const [attrError, setAttrError] = useState('')

  // Attribute Value form
  const [showValForm, setShowValForm] = useState(false)
  const [editingVal, setEditingVal] = useState<ProductAttributeValue | null>(null)
  const [valForm, setValForm] = useState({ name: '', attributeId: '' })
  const [valSaving, setValSaving] = useState(false)
  const [valError, setValError] = useState('')

  const filteredSubs = catFilter === 'todas' ? subcategories : subcategories.filter(s => s.categoryId === catFilter)
  const filteredVals = attrFilter ? allAttrValues.filter(v => v.attributeId === attrFilter) : allAttrValues

  // ── Category handlers ──
  const openCreateCat = () => { setEditingCat(null); setCatForm({ name: '', description: '' }); setCatError(''); setShowCatForm(true) }
  const openEditCat = (c: ProductCategory) => { setEditingCat(c); setCatForm({ name: c.name, description: c.description ?? '' }); setCatError(''); setShowCatForm(true) }

  const handleSaveCat = async () => {
    if (!catForm.name.trim()) { setCatError('Nome é obrigatório'); return }
    if (!user) return; setCatSaving(true)
    if (editingCat) {
      await updateProductCategory(editingCat.id, { name: catForm.name.trim(), description: catForm.description.trim() || undefined })
      await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_category', entity: 'Categoria', entityId: editingCat.id, description: `Categoria "${catForm.name}" atualizada`, timestamp: new Date().toISOString() })
    } else {
      const c = await createProductCategory({ name: catForm.name.trim(), description: catForm.description.trim() || undefined })
      if (c) await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'create_category', entity: 'Categoria', entityId: c.id, description: `Categoria "${catForm.name}" criada`, timestamp: new Date().toISOString() })
    }
    setCatSaving(false); setShowCatForm(false); refetchCats()
  }

  const handleToggleCat = async (c: ProductCategory) => {
    if (!user) return
    await updateProductCategory(c.id, { active: !c.active })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_category', entity: 'Categoria', entityId: c.id, description: `Categoria "${c.name}" ${c.active ? 'desativada' : 'ativada'}`, timestamp: new Date().toISOString() })
    refetchCats()
  }

  // ── Subcategory handlers ──
  const openCreateSub = () => { setEditingSub(null); setSubForm({ name: '', description: '', categoryId: categories[0]?.id ?? '' }); setSubError(''); setShowSubForm(true) }
  const openEditSub = (s: ProductSubcategory) => { setEditingSub(s); setSubForm({ name: s.name, description: s.description ?? '', categoryId: s.categoryId }); setSubError(''); setShowSubForm(true) }

  const handleSaveSub = async () => {
    if (!subForm.name.trim()) { setSubError('Nome é obrigatório'); return }
    if (!subForm.categoryId) { setSubError('Selecione a categoria'); return }
    if (!user) return; setSubSaving(true)
    if (editingSub) {
      await updateProductSubcategory(editingSub.id, { name: subForm.name.trim(), description: subForm.description.trim() || undefined })
      await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_subcategory', entity: 'Subcategoria', entityId: editingSub.id, description: `Subcategoria "${subForm.name}" atualizada`, timestamp: new Date().toISOString() })
    } else {
      const s = await createProductSubcategory({ categoryId: subForm.categoryId, name: subForm.name.trim(), description: subForm.description.trim() || undefined })
      if (s) await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'create_subcategory', entity: 'Subcategoria', entityId: s.id, description: `Subcategoria "${subForm.name}" criada`, timestamp: new Date().toISOString() })
    }
    setSubSaving(false); setShowSubForm(false); refetchSubs()
  }

  const handleToggleSub = async (s: ProductSubcategory) => {
    if (!user) return
    await updateProductSubcategory(s.id, { active: !s.active })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_subcategory', entity: 'Subcategoria', entityId: s.id, description: `Subcategoria "${s.name}" ${s.active ? 'desativada' : 'ativada'}`, timestamp: new Date().toISOString() })
    refetchSubs()
  }

  // ── Attribute handlers ──
  const openCreateAttr = () => { setEditingAttr(null); setAttrForm({ name: '', description: '' }); setAttrError(''); setShowAttrForm(true) }
  const openEditAttr = (a: ProductAttribute) => { setEditingAttr(a); setAttrForm({ name: a.name, description: a.description ?? '' }); setAttrError(''); setShowAttrForm(true) }

  const handleSaveAttr = async () => {
    if (!attrForm.name.trim()) { setAttrError('Nome é obrigatório'); return }
    if (!user) return; setAttrSaving(true)
    if (editingAttr) {
      await updateProductAttribute(editingAttr.id, { name: attrForm.name.trim(), description: attrForm.description.trim() || undefined })
      await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_attribute', entity: 'Atributo', entityId: editingAttr.id, description: `Atributo "${attrForm.name}" atualizado`, timestamp: new Date().toISOString() })
    } else {
      const a = await createProductAttribute({ name: attrForm.name.trim(), description: attrForm.description.trim() || undefined })
      if (a) await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'create_attribute', entity: 'Atributo', entityId: a.id, description: `Atributo "${attrForm.name}" criado`, timestamp: new Date().toISOString() })
    }
    setAttrSaving(false); setShowAttrForm(false); refetchAttrs()
  }

  const handleToggleAttr = async (a: ProductAttribute) => {
    if (!user) return
    await updateProductAttribute(a.id, { active: !a.active })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_attribute', entity: 'Atributo', entityId: a.id, description: `Atributo "${a.name}" ${a.active ? 'desativado' : 'ativado'}`, timestamp: new Date().toISOString() })
    refetchAttrs()
  }

  // ── Attribute Value handlers ──
  const openCreateVal = (attrId?: string) => { setEditingVal(null); setValForm({ name: '', attributeId: attrId ?? attributes[0]?.id ?? '' }); setValError(''); setShowValForm(true) }
  const openEditVal = (v: ProductAttributeValue) => { setEditingVal(v); setValForm({ name: v.name, attributeId: v.attributeId }); setValError(''); setShowValForm(true) }

  const handleSaveVal = async () => {
    if (!valForm.name.trim()) { setValError('Nome é obrigatório'); return }
    if (!valForm.attributeId) { setValError('Selecione o atributo'); return }
    if (!user) return; setValSaving(true)
    if (editingVal) {
      await updateProductAttributeValue(editingVal.id, { name: valForm.name.trim() })
      await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_attribute_value', entity: 'Valor', entityId: editingVal.id, description: `Valor "${valForm.name}" atualizado`, timestamp: new Date().toISOString() })
    } else {
      const v = await createProductAttributeValue({ attributeId: valForm.attributeId, name: valForm.name.trim() })
      if (v) await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'create_attribute_value', entity: 'Valor', entityId: v.id, description: `Valor "${valForm.name}" criado para atributo`, timestamp: new Date().toISOString() })
    }
    setValSaving(false); setShowValForm(false); refetchVals()
  }

  const handleToggleVal = async (v: ProductAttributeValue) => {
    if (!user) return
    await updateProductAttributeValue(v.id, { active: !v.active })
    refetchVals()
  }

  return (
    <div className="space-y-4">
      {/* Sub-nav */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
        {(['categorias', 'subcategorias', 'atributos'] as View[]).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={cn('px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all',
              view === v ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}>
            {v}
          </button>
        ))}
      </div>

      {/* ── CATEGORIAS ── */}
      {view === 'categorias' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{categories.length} categoria{categories.length !== 1 ? 's' : ''}</p>
            <button onClick={openCreateCat} className="flex items-center gap-1.5 text-sm font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-xl bg-primary-50 hover:bg-primary-100">
              <Plus className="w-4 h-4" /> Nova Categoria
            </button>
          </div>
          {categories.map(c => (
            <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={cn('card p-4 flex items-center justify-between gap-3', !c.active && 'opacity-50')}>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm">{c.name}</p>
                {c.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{c.description}</p>}
                <p className="text-xs text-slate-400 mt-0.5">{subcategories.filter(s => s.categoryId === c.id).length} subcategoria(s)</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEditCat(c)} className="text-slate-400 hover:text-primary-600"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => handleToggleCat(c)}>
                  {c.active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── SUBCATEGORIAS ── */}
      {view === 'subcategorias' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="input w-auto text-sm">
              <option value="todas">Todas categorias</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={openCreateSub} className="flex items-center gap-1.5 text-sm font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-xl bg-primary-50 hover:bg-primary-100">
              <Plus className="w-4 h-4" /> Nova Subcategoria
            </button>
          </div>
          {filteredSubs.map(s => {
            const cat = categories.find(c => c.id === s.categoryId)
            return (
              <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={cn('card p-4 flex items-center justify-between gap-3', !s.active && 'opacity-50')}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full flex-shrink-0">{cat?.name ?? '—'}</span>
                  <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                  <p className="font-semibold text-slate-900 text-sm">{s.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEditSub(s)} className="text-slate-400 hover:text-primary-600"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleToggleSub(s)}>
                    {s.active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />}
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* ── ATRIBUTOS ── */}
      {view === 'atributos' && (
        <div className="space-y-5">
          {/* Atributos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Atributos ({attributes.length})</p>
              <button onClick={openCreateAttr} className="flex items-center gap-1.5 text-sm font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-xl bg-primary-50 hover:bg-primary-100">
                <Plus className="w-4 h-4" /> Novo Atributo
              </button>
            </div>
            {attributes.map(a => (
              <motion.div key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={cn('card p-4 flex items-center justify-between gap-3', !a.active && 'opacity-50')}>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{a.name}</p>
                  {a.description && <p className="text-xs text-slate-400 mt-0.5">{a.description}</p>}
                  <p className="text-xs text-slate-400 mt-0.5">{allAttrValues.filter(v => v.attributeId === a.id).length} valor(es)</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setAttrFilter(a.id); openCreateVal(a.id) }}
                    className="text-xs text-primary-600 font-semibold border border-primary-200 px-2 py-1 rounded-lg bg-primary-50">
                    + Valor
                  </button>
                  <button onClick={() => openEditAttr(a)} className="text-slate-400 hover:text-primary-600"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleToggleAttr(a)}>
                    {a.active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Valores */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-700">Valores</p>
                <select value={attrFilter} onChange={e => setAttrFilter(e.target.value)} className="input w-auto text-xs py-1.5">
                  <option value="">Todos atributos</option>
                  {attributes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <button onClick={() => openCreateVal(attrFilter || undefined)}
                className="flex items-center gap-1.5 text-sm font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-xl bg-primary-50 hover:bg-primary-100">
                <Plus className="w-4 h-4" /> Novo Valor
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {filteredVals.map(v => {
                const attr = attributes.find(a => a.id === v.attributeId)
                return (
                  <motion.div key={v.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className={cn('flex items-center gap-2 bg-white border rounded-xl px-3 py-2', !v.active && 'opacity-40')}>
                    {attr && <span className="text-[10px] text-slate-400 font-medium">{attr.name}:</span>}
                    <span className="text-sm font-semibold text-slate-800">{v.name}</span>
                    <button onClick={() => openEditVal(v)} className="text-slate-300 hover:text-primary-500 ml-1"><Edit2 className="w-3 h-3" /></button>
                    <button onClick={() => handleToggleVal(v)}>
                      {v.active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-slate-300" />}
                    </button>
                  </motion.div>
                )
              })}
              {filteredVals.length === 0 && <p className="text-sm text-slate-400 italic">Nenhum valor encontrado</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Modais ── */}
      {/* Categoria */}
      <AnimatePresence>
        {showCatForm && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCatForm(false)} />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
                <div className="flex items-center justify-between"><p className="font-bold text-slate-900">{editingCat ? 'Editar Categoria' : 'Nova Categoria'}</p><button onClick={() => setShowCatForm(false)}><X className="w-5 h-5 text-slate-400" /></button></div>
                {catError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">{catError}</p>}
                <div><label className="text-xs font-semibold text-slate-500 block mb-1">Nome *</label><input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} className="input" /></div>
                <div><label className="text-xs font-semibold text-slate-500 block mb-1">Descrição</label><textarea value={catForm.description} onChange={e => setCatForm(p => ({ ...p, description: e.target.value }))} rows={2} className="input resize-none" /></div>
                <button onClick={handleSaveCat} disabled={catSaving} className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40"><Check className="w-4 h-4" />{catSaving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Subcategoria */}
      <AnimatePresence>
        {showSubForm && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSubForm(false)} />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
                <div className="flex items-center justify-between"><p className="font-bold text-slate-900">{editingSub ? 'Editar Subcategoria' : 'Nova Subcategoria'}</p><button onClick={() => setShowSubForm(false)}><X className="w-5 h-5 text-slate-400" /></button></div>
                {subError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">{subError}</p>}
                <div><label className="text-xs font-semibold text-slate-500 block mb-1">Categoria *</label><select value={subForm.categoryId} onChange={e => setSubForm(p => ({ ...p, categoryId: e.target.value }))} className="input" disabled={!!editingSub}><option value="">Selecione...</option>{categories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="text-xs font-semibold text-slate-500 block mb-1">Nome *</label><input value={subForm.name} onChange={e => setSubForm(p => ({ ...p, name: e.target.value }))} className="input" /></div>
                <div><label className="text-xs font-semibold text-slate-500 block mb-1">Descrição</label><textarea value={subForm.description} onChange={e => setSubForm(p => ({ ...p, description: e.target.value }))} rows={2} className="input resize-none" /></div>
                <button onClick={handleSaveSub} disabled={subSaving} className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40"><Check className="w-4 h-4" />{subSaving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Atributo */}
      <AnimatePresence>
        {showAttrForm && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAttrForm(false)} />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
                <div className="flex items-center justify-between"><p className="font-bold text-slate-900">{editingAttr ? 'Editar Atributo' : 'Novo Atributo'}</p><button onClick={() => setShowAttrForm(false)}><X className="w-5 h-5 text-slate-400" /></button></div>
                {attrError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">{attrError}</p>}
                <div><label className="text-xs font-semibold text-slate-500 block mb-1">Nome * (ex: Cor, Estampa, Tamanho)</label><input value={attrForm.name} onChange={e => setAttrForm(p => ({ ...p, name: e.target.value }))} className="input" /></div>
                <div><label className="text-xs font-semibold text-slate-500 block mb-1">Descrição</label><textarea value={attrForm.description} onChange={e => setAttrForm(p => ({ ...p, description: e.target.value }))} rows={2} className="input resize-none" /></div>
                <button onClick={handleSaveAttr} disabled={attrSaving} className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40"><Check className="w-4 h-4" />{attrSaving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Valor de Atributo */}
      <AnimatePresence>
        {showValForm && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowValForm(false)} />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
                <div className="flex items-center justify-between"><p className="font-bold text-slate-900">{editingVal ? 'Editar Valor' : 'Novo Valor'}</p><button onClick={() => setShowValForm(false)}><X className="w-5 h-5 text-slate-400" /></button></div>
                {valError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">{valError}</p>}
                <div><label className="text-xs font-semibold text-slate-500 block mb-1">Atributo *</label><select value={valForm.attributeId} onChange={e => setValForm(p => ({ ...p, attributeId: e.target.value }))} className="input" disabled={!!editingVal}><option value="">Selecione...</option>{attributes.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                <div><label className="text-xs font-semibold text-slate-500 block mb-1">Valor * (ex: Azul, Macho, P)</label><input value={valForm.name} onChange={e => setValForm(p => ({ ...p, name: e.target.value }))} className="input" /></div>
                <button onClick={handleSaveVal} disabled={valSaving} className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40"><Check className="w-4 h-4" />{valSaving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
