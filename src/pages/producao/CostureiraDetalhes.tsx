import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Plus, Phone, MapPin, Calendar, Edit2,
  Trash2, Check, X, Package, DollarSign, Download, Scissors,
} from 'lucide-react'
import { printControlePDF } from '@/services/controlePDF'
import AdminLayout from '@/layouts/AdminLayout'
import { LoadingSpinner } from '@/components/shared/LoadingState'
import { useSeamstress, useSeamstressProducts, useProductionOrders, useProductionPayments } from '@/hooks/useProducaoData'
import { upsertSeamstressProduct, deleteSeamstressProduct, updateSeamstress } from '@/services/producaoDB'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/utils'
import { cn } from '@/utils'
import type { SeamstressProduct } from '@/types'

function fmt(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const STATUS_COLOR: Record<string, string> = {
  solicitada: 'bg-slate-100 text-slate-600',
  em_producao: 'bg-blue-100 text-blue-700',
  parcialmente_entregue: 'bg-orange-100 text-orange-700',
  concluida: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-600',
}
const STATUS_LABEL: Record<string, string> = {
  solicitada: 'Solicitada', em_producao: 'Em Produção',
  parcialmente_entregue: 'Parcial', concluida: 'Concluída', cancelada: 'Cancelada',
}

export default function CostureiraDetalhes() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: s, loading, refetch: refetchS } = useSeamstress(id)
  const { data: products = [], refetch: refetchP } = useSeamstressProducts(id)
  const { data: allOrders = [] } = useProductionOrders()
  const { data: payments = [] } = useProductionPayments(id)

  const orders = allOrders.filter(o => o.seamstressId === id)

  const [tab, setTab] = useState<'overview' | 'produtos' | 'ordens' | 'pagamentos'>('overview')
  const [pdfPeriod, setPdfPeriod] = useState({
    start: new Date().toISOString().slice(0, 8) + '01',
    end: new Date().toISOString().slice(0, 10),
  })
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [productModal, setProductModal] = useState<'create' | 'edit' | null>(null)
  const [editingProduct, setEditingProduct] = useState<SeamstressProduct | null>(null)
  const [productForm, setProductForm] = useState({ productName: '', unitValue: '' })
  const [saving, setSaving] = useState(false)

  async function handleSaveProduct() {
    if (!productForm.productName.trim() || !id) return
    setSaving(true)
    try {
      await upsertSeamstressProduct({
        id: editingProduct?.id,
        seamstressId: id,
        productName: productForm.productName,
        unitValue: parseFloat(productForm.unitValue) || 0,
        active: true,
      })
      setProductModal(null)
      refetchP()
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteProduct(p: SeamstressProduct) {
    await deleteSeamstressProduct(p.id)
    refetchP()
  }

  function openEditProduct(p: SeamstressProduct) {
    setEditingProduct(p)
    setProductForm({ productName: p.productName, unitValue: String(p.unitValue) })
    setProductModal('edit')
  }

  if (loading) return <AdminLayout title="Costureira"><div className="p-6"><LoadingSpinner /></div></AdminLayout>
  if (!s) return <AdminLayout title="Costureira"><div className="p-6 text-center text-slate-400">Costureira não encontrada</div></AdminLayout>

  const totalProd = orders.reduce((sum, o) => {
    return sum + (o.items ?? []).reduce((s2, it) => s2 + it.deliveredQty * it.unitValue, 0)
  }, 0)
  const totalPago = payments.filter(p => p.status === 'pago').reduce((s, p) => s + p.totalAmount, 0)
  const totalPendente = payments.filter(p => p.status === 'pendente').reduce((s, p) => s + p.totalAmount, 0)

  return (
    <AdminLayout title={s.name}>
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        {/* Back */}
        <button onClick={() => navigate('/admin/producao/costureiras')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        {/* Header Card */}
        <div className="card mb-5">
          <div className="flex items-center gap-4">
            <div className={cn(
              'w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0',
              s.status === 'ativa' ? 'bg-purple-500' : 'bg-slate-400'
            )}>
              {s.photoUrl ? (
                <img src={s.photoUrl} alt={s.name} className="w-full h-full object-cover rounded-2xl" />
              ) : s.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900">{s.name}</h1>
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium',
                  s.status === 'ativa' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                )}>
                  {s.status === 'ativa' ? 'Ativa' : 'Inativa'}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 mt-1 text-sm text-slate-500">
                {s.city && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{s.city}</span>}
                {s.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{s.phone}</span>}
                {s.startDate && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Desde {fmt(s.startDate)}</span>}
              </div>
            </div>
          </div>

            <button onClick={() => setShowPdfModal(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors mt-3 sm:mt-0">
            <Download className="w-3.5 h-3.5" /> Exportar Controle
          </button>

        {/* KPIs rápidos */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100">
            <div className="text-center">
              <p className="text-xs text-slate-500">Produção Total</p>
              <p className="text-lg font-bold text-slate-900">{formatCurrency(totalProd)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">Pago</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(totalPago)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">Pendente</p>
              <p className="text-lg font-bold text-orange-600">{formatCurrency(totalPendente)}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5">
          {(['overview', 'produtos', 'ordens', 'pagamentos'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-2 text-xs font-semibold rounded-lg transition-all capitalize',
                tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {t === 'overview' ? 'Visão Geral' : t === 'produtos' ? 'Produtos' : t === 'ordens' ? 'Ordens' : 'Pagamentos'}
            </button>
          ))}
        </div>

        {/* Tab: Visão Geral */}
        {tab === 'overview' && (
          <div className="card space-y-3">
            {s.address && (
              <div>
                <p className="text-xs text-slate-500 font-medium mb-0.5">Endereço</p>
                <p className="text-sm text-slate-800">{s.address}</p>
              </div>
            )}
            {s.whatsapp && (
              <div>
                <p className="text-xs text-slate-500 font-medium mb-0.5">WhatsApp</p>
                <a href={`https://wa.me/55${s.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                  className="text-sm text-green-600 hover:underline">{s.whatsapp}</a>
              </div>
            )}
            {s.notes && (
              <div>
                <p className="text-xs text-slate-500 font-medium mb-0.5">Observações</p>
                <p className="text-sm text-slate-800">{s.notes}</p>
              </div>
            )}
            {!s.address && !s.whatsapp && !s.notes && (
              <p className="text-sm text-slate-400 text-center py-4">Nenhuma informação adicional</p>
            )}
          </div>
        )}

        {/* Tab: Produtos */}
        {tab === 'produtos' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-500">{products.length} produto(s) cadastrado(s)</p>
              <button
                onClick={() => { setProductForm({ productName: '', unitValue: '' }); setEditingProduct(null); setProductModal('create') }}
                className="flex items-center gap-1.5 bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
            {products.length === 0 ? (
              <div className="card text-center py-8 text-slate-400">Nenhum produto cadastrado</div>
            ) : (
              <div className="space-y-2">
                {products.map(p => (
                  <div key={p.id} className="card flex items-center gap-3">
                    <Package className="w-5 h-5 text-purple-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{p.productName}</p>
                      <p className="text-xs text-slate-500">{formatCurrency(p.unitValue)} por peça</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditProduct(p)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteProduct(p)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Ordens */}
        {tab === 'ordens' && (
          <div className="space-y-2">
            {orders.length === 0 ? (
              <div className="card text-center py-8 text-slate-400">Nenhuma ordem de produção</div>
            ) : (
              orders.map(o => (
                <div key={o.id} className="card cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/admin/producao/ordens/${o.id}`)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Scissors className="w-4 h-4 text-slate-400" />
                        <p className="text-sm font-medium text-slate-800">{fmt(o.requestDate)}</p>
                        {o.deadline && <p className="text-xs text-slate-500">— prazo {fmt(o.deadline)}</p>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {(o.items ?? []).length} produto(s) · {(o.items ?? []).reduce((s, i) => s + i.quantity, 0)} peças
                      </p>
                    </div>
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_COLOR[o.status])}>
                      {STATUS_LABEL[o.status]}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab: Pagamentos */}
        {tab === 'pagamentos' && (
          <div className="space-y-2">
            {payments.length === 0 ? (
              <div className="card text-center py-8 text-slate-400">Nenhum fechamento registrado</div>
            ) : (
              payments.map(p => (
                <div key={p.id} className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-slate-400" />
                        <p className="text-sm font-medium text-slate-800">
                          {p.referenceMonth.split('-').reverse().join('/')}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">{formatCurrency(p.totalAmount)}</p>
                      {p.paymentDate && (
                        <p className="text-xs text-slate-500">Pago em {fmt(p.paymentDate)} · {p.paymentMethod}</p>
                      )}
                    </div>
                    <span className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded-full',
                      p.status === 'pago' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    )}>
                      {p.status === 'pago' ? 'Pago' : 'Pendente'}
                    </span>
                  </div>
                  {(p.items ?? []).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                      {(p.items ?? []).map((it, i) => (
                        <div key={i} className="flex justify-between text-xs text-slate-600">
                          <span>{it.productName} × {it.quantity}</span>
                          <span>{formatCurrency(it.totalValue)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* PDF Export Modal */}
      <AnimatePresence>
        {showPdfModal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowPdfModal(false)} />
            <motion.div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4 w-full"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <h3 className="text-lg font-bold text-slate-900 mb-4">Exportar Controle PDF</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Período: De</label>
                  <input type="date" value={pdfPeriod.start} onChange={e => setPdfPeriod(p => ({ ...p, start: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Até</label>
                  <input type="date" value={pdfPeriod.end} onChange={e => setPdfPeriod(p => ({ ...p, end: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowPdfModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={() => { s && printControlePDF(s, pdfPeriod.start, pdfPeriod.end); setShowPdfModal(false) }}
                  className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" /> Gerar PDF
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product Modal */}
      <AnimatePresence>
        {productModal && (
          <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setProductModal(null)} />
            <motion.div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl"
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}>
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">
                  {productModal === 'create' ? 'Novo Produto' : 'Editar Produto'}
                </h2>
                <button onClick={() => setProductModal(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Produto</label>
                  <input value={productForm.productName}
                    onChange={e => setProductForm(p => ({ ...p, productName: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="Ex: Coleira Nylon" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Valor por Peça (R$)</label>
                  <input type="number" step="0.01" min="0" value={productForm.unitValue}
                    onChange={e => setProductForm(p => ({ ...p, unitValue: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="1,20" />
                </div>
              </div>
              <div className="p-5 border-t border-slate-100 flex gap-3">
                <button onClick={() => setProductModal(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleSaveProduct} disabled={saving}
                  className="flex-1 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
