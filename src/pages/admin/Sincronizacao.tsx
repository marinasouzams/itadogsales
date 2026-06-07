import { useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, CheckCircle2, AlertCircle, Clock, Zap, Settings } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { MOCK_BLING_SYNCS } from '@/mock/data'
import { formatRelative, cn } from '@/utils'
import type { BlingSync } from '@/types'

const ENTITY_LABELS: Record<string, string> = {
  produtos: 'Produtos',
  clientes: 'Clientes',
  pedidos: 'Pedidos',
  estoque: 'Estoque',
  tabelas: 'Tabelas de Preço',
}

const ENTITY_ICONS: Record<string, string> = {
  produtos: '📦',
  clientes: '👥',
  pedidos: '🛒',
  estoque: '🏭',
  tabelas: '💲',
}

export default function AdminSincronizacao() {
  const [syncs, setSyncs] = useState<BlingSync[]>(MOCK_BLING_SYNCS)
  const [syncing, setSyncing] = useState<string | null>(null)

  const handleSync = async (id: string) => {
    setSyncing(id)
    setSyncs(prev => prev.map(s => s.id === id ? { ...s, status: 'sincronizando' } : s))
    await new Promise(r => setTimeout(r, 2000))
    setSyncs(prev => prev.map(s => s.id === id ? {
      ...s,
      status: 'sincronizado',
      synced: s.total,
      errors: 0,
      errorMessage: undefined,
      lastSync: new Date().toISOString(),
    } : s))
    setSyncing(null)
  }

  const handleSyncAll = async () => {
    for (const sync of syncs) {
      if (sync.status !== 'sincronizado') {
        await handleSync(sync.id)
      }
    }
  }

  const errorCount = syncs.filter(s => s.status === 'erro').length
  const syncedCount = syncs.filter(s => s.status === 'sincronizado').length

  return (
    <AdminLayout title="Sincronização Bling">
      <div className="p-6 space-y-5 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Bling ERP Integration</h2>
              <p className="text-xs text-slate-400">{syncedCount}/{syncs.length} entidades sincronizadas</p>
            </div>
          </div>
          <button
            onClick={handleSyncAll}
            className="btn-primary flex items-center gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
            Sincronizar tudo
          </button>
        </div>

        {/* Error banner */}
        {errorCount > 0 && (
          <motion.div
            className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">{errorCount} entidade{errorCount > 1 ? 's' : ''} com erro de sincronização</p>
              <p className="text-xs text-red-600 mt-0.5">Verifique as credenciais da API ou tente novamente</p>
            </div>
          </motion.div>
        )}

        {/* Sync cards */}
        <div className="space-y-4">
          {syncs.map((sync, i) => {
            const isCurrentlySyncing = syncing === sync.id || sync.status === 'sincronizando'
            const progress = sync.total > 0 ? (sync.synced / sync.total) * 100 : 0

            return (
              <motion.div
                key={sync.id}
                className={cn(
                  'card p-5 border',
                  sync.status === 'erro' ? 'border-red-200 bg-red-50/30' :
                  sync.status === 'sincronizado' ? 'border-green-200 bg-green-50/30' :
                  sync.status === 'pendente' ? 'border-amber-200 bg-amber-50/30' :
                  'border-blue-200 bg-blue-50/30'
                )}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <div className="flex items-start gap-4">
                  <div className="text-2xl flex-shrink-0">{ENTITY_ICONS[sync.entity]}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">{ENTITY_LABELS[sync.entity]}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {sync.synced}/{sync.total} registros
                          {sync.errors > 0 && (
                            <span className="text-red-500 ml-2">· {sync.errors} erro(s)</span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className={cn(
                          'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
                          sync.status === 'sincronizado' ? 'bg-green-100 text-green-700' :
                          sync.status === 'erro' ? 'bg-red-100 text-red-700' :
                          sync.status === 'pendente' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        )}>
                          {sync.status === 'sincronizado' && <CheckCircle2 className="w-3 h-3" />}
                          {sync.status === 'erro' && <AlertCircle className="w-3 h-3" />}
                          {sync.status === 'pendente' && <Clock className="w-3 h-3" />}
                          {isCurrentlySyncing && <RefreshCw className="w-3 h-3 animate-spin" />}
                          {sync.status === 'sincronizado' ? 'Sincronizado' :
                           sync.status === 'erro' ? 'Erro' :
                           sync.status === 'pendente' ? 'Pendente' :
                           'Sincronizando...'}
                        </div>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="mt-3">
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <motion.div
                          className={cn(
                            'h-full rounded-full',
                            sync.status === 'erro' ? 'bg-red-500' :
                            sync.status === 'sincronizado' ? 'bg-green-500' :
                            'bg-primary-600'
                          )}
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.6, delay: i * 0.1 }}
                        />
                      </div>
                    </div>

                    {/* Timestamps */}
                    <div className="flex items-center gap-4 mt-2.5 text-xs text-slate-400">
                      {sync.lastSync && (
                        <span>Última sync: {formatRelative(sync.lastSync)}</span>
                      )}
                      {sync.nextSync && (
                        <span>Próxima: {formatRelative(sync.nextSync)}</span>
                      )}
                    </div>

                    {/* Error message */}
                    {sync.errorMessage && (
                      <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        {sync.errorMessage}
                      </div>
                    )}

                    {/* Retry button */}
                    {(sync.status === 'erro' || sync.status === 'pendente') && (
                      <button
                        onClick={() => handleSync(sync.id)}
                        disabled={!!syncing}
                        className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-lg bg-white hover:bg-primary-50 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={cn('w-3 h-3', isCurrentlySyncing && 'animate-spin')} />
                        {isCurrentlySyncing ? 'Sincronizando...' : 'Tentar novamente'}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* API Config card */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900">Configuração da API Bling</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">API Key</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value="••••••••••••••••••••••"
                  readOnly
                  className="input flex-1 font-mono text-slate-400"
                />
                <button className="btn-secondary text-sm px-4">Alterar</button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-green-600 font-medium">Conexão ativa com Bling API v3</span>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
