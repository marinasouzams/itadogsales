import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Edit2, ToggleLeft, ToggleRight, X, Check, ChevronRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProductCategories, useProductSubcategories } from '@/hooks/useData'
import {
  createProductCategory, updateProductCategory,
  createProductSubcategory, updateProductSubcategory,
  logAudit,
} from '@/services/db'
import { cn } from '@/utils'
import type { ProductCategory, ProductSubcategory } from '@/types'

type View = 'categorias' | 'subcategorias'

export default function ParametrizacaoProdutos() {
  const { user } = useAuth()
  const { data: categories = [], refetch: refetchCats } = useProductCategories()
  const { data: subcategories = [], refetch: refetchSubs } = useProductSubcategories()

  const [view, setView] = useState<View>('categorias')
  const [catFilter, setCatFilter] = useState('todas')

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

  const filteredSubs = catFilter === 'todas'
    ? subcategories
    : subcategories.filter(s => s.categoryId === catFilter)

  const openCreateCat = () => { setEditingCat(null); setCatForm({ name: '', description: '' }); setCatError(''); setShowCatForm(true) }
  const openEditCat = (c: ProductCategory) => { setEditingCat(c); setCatForm({ name: c.name, description: c.description ?? '' }); setCatError(''); setShowCatForm(true) }

  const openCreateSub = () => { setEditingSub(null); setSubForm({ name: '', description: '', categoryId: categories[0]?.id ?? '' }); setSubError(''); setShowSubForm(true) }
  const openEditSub = (s: ProductSubcategory) => { setEditingSub(s); setSubForm({ name: s.name, description: s.description ?? '', categoryId: s.categoryId }); setSubError(''); setShowSubForm(true) }

  const handleSaveCat = async () => {
    if (!catForm.name.trim()) { setCatError('Nome é obrigatório'); return }
    if (!user) return
    setCatSaving(true)
    if (editingCat) {
      await updateProductCategory(editingCat.id, { name: catForm.name.trim(), description: catForm.description.trim() || undefined })
      await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_category', entity: 'Categoria', entityId: editingCat.id, description: `Categoria "${catForm.name}" atualizada`, timestamp: new Date().toISOString() })
    } else {
      const created = await createProductCategory({ name: catForm.name.trim(), description: catForm.description.trim() || undefined })
      if (created) await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'create_category', entity: 'Categoria', entityId: created.id, description: `Categoria "${catForm.name}" criada`, timestamp: new Date().toISOString() })
    }
    setCatSaving(false); setShowCatForm(false); refetchCats()
  }

  const handleToggleCat = async (c: ProductCategory) => {
    if (!user) return
    await updateProductCategory(c.id, { active: !c.active })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_category', entity: 'Categoria', entityId: c.id, description: `Categoria "${c.name}" ${c.active ? 'desativada' : 'ativada'}`, timestamp: new Date().toISOString() })
    refetchCats()
  }

  const handleSaveSub = async () => {
    if (!subForm.name.trim()) { setSubError('Nome é obrigatório'); return }
    if (!subForm.categoryId) { setSubError('Selecione a categoria'); return }
    if (!user) return
    setSubSaving(true)
    if (editingSub) {
      await updateProductSubcategory(editingSub.id, { name: subForm.name.trim(), description: subForm.description.trim() || undefined })
      await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_subcategory', entity: 'Subcategoria', entityId: editingSub.id, description: `Subcategoria "${subForm.name}" atualizada`, timestamp: new Date().toISOString() })
    } else {
      const created = await createProductSubcategory({ categoryId: subForm.categoryId, name: subForm.name.trim(), description: subForm.description.trim() || undefined })
      if (created) await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'create_subcategory', entity: 'Subcategoria', entityId: created.id, description: `Subcategoria "${subForm.name}" criada`, timestamp: new Date().toISOString() })
    }
    setSubSaving(false); setShowSubForm(false); refetchSubs()
  }

  const handleToggleSub = async (s: ProductSubcategory) => {
    if (!user) return
    await updateProductSubcategory(s.id, { active: !s.active })
    await logAudit({ userId: user.id, userName: user.name, userRole: user.role, action: 'update_subcategory', entity: 'Subcategoria', entityId: s.id, description: `Subcategoria "${s.name}" ${s.active ? 'desativada' : 'ativada'}`, timestamp: new Date().toISOString() })
    refetchSubs()
  }

  return (
    <div className="space-y-4">
      {/* Sub-nav */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(['categorias', 'subcategorias'] as View[]).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={cn('px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all',
              view === v ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}>
            {v}
          </button>
        ))}
      </div>

      {/* CATEGORIAS */}
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
                <p className="text-xs text-slate-400 mt-0.5">
                  {subcategories.filter(s => s.categoryId === c.id).length} subcategoria(s) · {' '}
                  <span className={cn('font-medium', c.active ? 'text-green-600' : 'text-slate-400')}>{c.active ? 'Ativa' : 'Inativa'}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEditCat(c)} className="text-slate-400 hover:text-primary-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => handleToggleCat(c)} className="text-slate-400 hover:text-green-600 transition-colors">
                  {c.active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
              </div>
            </motion.div>
          ))}
          {categories.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Nenhuma categoria cadastrada</p>}
        </div>
      )}

      {/* SUBCATEGORIAS */}
      {view === 'subcategorias' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="input w-auto text-sm">
                <option value="todas">Todas categorias</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-xs text-slate-500">{filteredSubs.length} subcategoria{filteredSubs.length !== 1 ? 's' : ''}</p>
            </div>
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
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{s.name}</p>
                    {s.description && <p className="text-xs text-slate-400 truncate">{s.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEditSub(s)} className="text-slate-400 hover:text-primary-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleToggleSub(s)} className="text-slate-400 hover:text-green-600 transition-colors">
                    {s.active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                </div>
              </motion.div>
            )
          })}
          {filteredSubs.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Nenhuma subcategoria encontrada</p>}
        </div>
      )}

      {/* Modal: Categoria */}
      <AnimatePresence>
        {showCatForm && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCatForm(false)} />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900">{editingCat ? 'Editar Categoria' : 'Nova Categoria'}</h2>
                  <button onClick={() => setShowCatForm(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4 text-slate-500" /></button>
                </div>
                <div className="p-5 space-y-3">
                  {catError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">{catError}</p>}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Nome *</label>
                    <input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Acessórios Pet" className="input" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Descrição</label>
                    <textarea value={catForm.description} onChange={e => setCatForm(p => ({ ...p, description: e.target.value }))} rows={2} className="input resize-none" placeholder="Descrição opcional" />
                  </div>
                  <button onClick={handleSaveCat} disabled={catSaving} className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                    <Check className="w-4 h-4" /> {catSaving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal: Subcategoria */}
      <AnimatePresence>
        {showSubForm && (
          <>
            <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSubForm(false)} />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900">{editingSub ? 'Editar Subcategoria' : 'Nova Subcategoria'}</h2>
                  <button onClick={() => setShowSubForm(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4 text-slate-500" /></button>
                </div>
                <div className="p-5 space-y-3">
                  {subError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">{subError}</p>}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Categoria pai *</label>
                    <select value={subForm.categoryId} onChange={e => setSubForm(p => ({ ...p, categoryId: e.target.value }))} className="input" disabled={!!editingSub}>
                      <option value="">Selecione...</option>
                      {categories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Nome *</label>
                    <input value={subForm.name} onChange={e => setSubForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Coleiras" className="input" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Descrição</label>
                    <textarea value={subForm.description} onChange={e => setSubForm(p => ({ ...p, description: e.target.value }))} rows={2} className="input resize-none" placeholder="Descrição opcional" />
                  </div>
                  <button onClick={handleSaveSub} disabled={subSaving} className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                    <Check className="w-4 h-4" /> {subSaving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
