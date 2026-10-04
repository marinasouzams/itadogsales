import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  RefreshCw, CheckCircle2, AlertCircle, Zap, Plug, Unplug, ShieldCheck, Activity,
  Package, Users, ShoppingCart, FileText, Loader2, XCircle,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { useAuth } from '@/contexts/AuthContext'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatCurrency, formatDateTime, formatRelative, cn } from '@/utils'
import {
  getBlingConnection, getBlingLog, startBlingConnect, testBlingConnection, disconnectBling,
  getEntitySync, getPriceSyncEnabled, setPriceSyncEnabled, getProductsCompare, runProductsSync,
  getClientsBlingStatus, retryClientsToBling, pullClientsFromBling,
  getOrdersAutoEnabled, setOrdersAutoEnabled, getOrdersBlingStatus, sendOpenOrdersToBling, pullOrdersFromBling,
  type BlingConnection, type BlingLogEntry, type BlingEntitySync, type BlingProductCompare, type BlingClientStatus,
  type BlingOrderStatus, getClientsFiscalStatus, type ClientFiscalStatus,
} from '@/services/bling'

function formatCnpj(v?: string | null): string {
  const d = (v ?? '').replace(/\D/g, '')
  if (d.length !== 14) return v ?? ''
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

type Banner = { kind: 'success' | 'error'; text: string } | null

const SYNC_LABEL: Record<BlingEntitySync['status'], string> = {
  pendente: 'Aguardando', sincronizando: 'Atualizando...', sincronizado: 'Em dia', erro: 'Com erro',
}

function FiscalReadinessCard() {
  const [rows, setRows] = useState<ClientFiscalStatus[]>([])
  const [filter, setFilter] = useState<'open' | 'all'>('open')

  useEffect(() => { getClientsFiscalStatus().then(setRows).catch(() => setRows([])) }, [])

  const ready = rows.filter(r => r.missing.length === 0).length
  const pending = rows
    .filter(r => r.missing.length > 0 && (filter === 'all' || r.hasOpenOrder))
    .sort((a, b) => Number(b.hasOpenOrder) - Number(a.hasOpenOrder) || a.name.localeCompare(b.name))
  const openPending = rows.filter(r => r.missing.length > 0 && r.hasOpenOrder).length

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <h3 className="font-semibold text-slate-900">Cadastros para nota fiscal</h3>
        </div>
        <span className={cn(
          'text-xs font-medium px-2.5 py-1 rounded-full',
          openPending ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700',
        )}>
          {openPending ? `${openPending} com pedido em aberto` : 'Pedidos em aberto ok'}
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-1">
        Sem CPF/CNPJ, rua, número, bairro, CEP, cidade e UF o Bling não emite a nota. Corrija no Itadog — vai sozinho para o Bling.
      </p>
      <p className="mt-3 text-sm text-slate-600"><strong>{ready}</strong> de {rows.length} clientes prontos para nota</p>

      <div className="flex gap-2 mt-3 text-xs">
        {(['open', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-3 py-1 rounded-full border', filter === f ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 text-slate-600')}>
            {f === 'open' ? 'Com pedido em aberto' : 'Todos com pendência'}
          </button>
        ))}
      </div>

      {pending.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Nenhum cliente com pendência {filter === 'open' ? 'entre os pedidos em aberto' : ''}.</p>
      ) : (
        <ul className="mt-3 max-h-80 overflow-y-auto divide-y divide-slate-100">
          {pending.map(r => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-slate-800">
                  {r.code && <span className="font-mono text-xs text-slate-400 mr-1.5">{r.code}</span>}
                  {r.name}
                  {r.hasOpenOrder && <span className="ml-2 text-[10px] font-semibold uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">pedido em aberto</span>}
                </p>
                <p className="text-xs text-slate-400">{r.repName ?? ''}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {r.missing.map(m => <span key={m} className="text-[11px] text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded">{m}</span>)}
                  {r.warnings.map(m => <span key={m} className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">{m} (opcional)</span>)}
                </div>
              </div>
              <a href={`/admin/clientes/${r.id}`} className="flex-shrink-0 text-xs font-semibold text-primary-600 underline">Corrigir</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function InvoicesSyncCard({ connected, onChanged }: { connected: boolean; onChanged: () => void }) {
  const [sync, setSync] = useState<BlingEntitySync | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Banner>(null)

  const load = useCallback(async () => setSync(await getEntitySync('financeiro')), [])
  useEffect(() => { load().catch(() => {}) }, [load])

  const run = async () => {
    setBusy(true); setMessage(null)
    try {
      const r = await pullOrdersFromBling()
      setMessage({ kind: 'success', text: `Consulta feita: ${r.notas} nota(s), ${r.faturados} pedido(s) faturado(s), ${r.baixas} baixa(s) de pagamento.` })
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(false); await load(); onChanged()
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" />
          <h3 className="font-semibold text-slate-900">Notas fiscais, boletos e pagamentos</h3>
        </div>
        {sync && (
          <span className={cn(
            'text-xs font-medium px-2.5 py-1 rounded-full',
            sync.status === 'erro' ? 'bg-red-100 text-red-700' : sync.lastSync ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500',
          )}>
            {sync.status === 'erro' ? 'Com erro' : sync.lastSync ? 'Em dia' : 'Aguardando'}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-1">
        Bling → Itadog Sales a cada 10 minutos: NF autorizada fatura o pedido; boleto pago dá baixa na parcela
      </p>
      {sync?.lastSync && <p className="mt-3 text-xs text-slate-400">Última consulta: {formatRelative(sync.lastSync)}</p>}
      {sync?.errorMessage && (
        <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{sync.errorMessage}</div>
      )}
      {message && (
        <p className={cn('mt-3 text-xs font-medium', message.kind === 'success' ? 'text-green-700' : 'text-red-600')}>{message.text}</p>
      )}
      <button
        onClick={run}
        disabled={busy || !connected}
        className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-lg bg-white hover:bg-primary-50 disabled:opacity-50"
      >
        <RefreshCw className={cn('w-3 h-3', busy && 'animate-spin')} />
        {busy ? 'Consultando...' : 'Consultar agora'}
      </button>
    </div>
  )
}

function OrdersSyncCard({ connected, onChanged }: { connected: boolean; onChanged: () => void }) {
  const { user } = useAuth()
  const [auto, setAuto] = useState(false)
  const [orders, setOrders] = useState<BlingOrderStatus[]>([])
  const [busy, setBusy] = useState<'auto' | 'open' | null>(null)
  const [message, setMessage] = useState<Banner>(null)

  const load = useCallback(async () => {
    const [a, o] = await Promise.all([getOrdersAutoEnabled(), getOrdersBlingStatus()])
    setAuto(a); setOrders(o)
  }, [])

  useEffect(() => { load().catch(e => setMessage({ kind: 'error', text: (e as Error).message })) }, [load])

  const sent = orders.filter(o => o.sent)
  const withError = orders.filter(o => o.blingError)
  const openNotSent = orders.filter(o => !o.sent && !o.blingError)

  const toggleAuto = async () => {
    if (!user) return
    const next = !auto
    const text = next
      ? 'Ligar o envio automático? A partir de agora, todo pedido enviado para separação vai sozinho para o Bling.'
      : 'Desligar o envio automático? Os pedidos param de ir sozinhos para o Bling (dá para enviar um a um pelo pedido).'
    if (!window.confirm(text)) return
    setBusy('auto'); setMessage(null)
    try {
      await setOrdersAutoEnabled(next, user.id)
      setMessage({ kind: 'success', text: next ? 'Envio automático ligado.' : 'Envio automático desligado.' })
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(null); await load()
    }
  }

  const sendOpen = async () => {
    if (!window.confirm(`Enviar ao Bling os ${openNotSent.length} pedido(s) em aberto que ainda não foram?`)) return
    setBusy('open'); setMessage(null)
    try {
      const n = await sendOpenOrdersToBling()
      setMessage({ kind: 'success', text: `${n} pedido(s) enviados para a fila.` })
      await new Promise(r => setTimeout(r, 6000))
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(null); await load(); onChanged()
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-slate-400" />
          <h3 className="font-semibold text-slate-900">Pedidos</h3>
        </div>
        <span className={cn(
          'text-xs font-medium px-2.5 py-1 rounded-full',
          withError.length ? 'bg-red-100 text-red-700' : auto ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500',
        )}>
          {withError.length ? 'Com erro' : auto ? 'Envio automático' : 'Envio manual'}
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-1">Itadog Sales → Bling ao enviar para separação</p>

      <p className="mt-3 text-sm text-slate-600"><strong>{sent.length}</strong> pedido(s) no Bling{openNotSent.length ? ` · ${openNotSent.length} em aberto ainda não enviado(s)` : ''}</p>

      {withError.length > 0 && (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 space-y-1">
          <p className="font-semibold">{withError.length} pedido(s) com erro:</p>
          {withError.map(o => (
            <p key={o.id}><a href={`/admin/pedidos/${o.id}`} className="font-semibold underline">{o.number}</a> ({o.clientName}) — {o.blingError}</p>
          ))}
        </div>
      )}

      {sent.length > 0 && (
        <div className="mt-3 max-h-40 overflow-y-auto text-xs text-slate-600 space-y-0.5">
          {sent.slice(0, 20).map(o => (
            <p key={o.id}><a href={`/admin/pedidos/${o.id}`} className="underline">{o.number}</a> → Bling nº {o.blingOrderNumber ?? '—'} · {o.clientName}</p>
          ))}
        </div>
      )}

      {message && (
        <p className={cn('mt-3 text-xs font-medium', message.kind === 'success' ? 'text-green-700' : 'text-red-600')}>{message.text}</p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          onClick={toggleAuto}
          disabled={!!busy || !connected}
          className="text-xs font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-lg bg-white hover:bg-primary-50 disabled:opacity-50"
        >
          {busy === 'auto' ? 'Aguarde...' : auto ? 'Desligar envio automático' : 'Ligar envio automático'}
        </button>
        {openNotSent.length > 0 && (
          <button
            onClick={sendOpen}
            disabled={!!busy || !connected}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3 h-3', busy === 'open' && 'animate-spin')} />
            {busy === 'open' ? 'Enviando...' : `Enviar ${openNotSent.length} pedido(s) em aberto`}
          </button>
        )}
      </div>
    </div>
  )
}

function ClientsSyncCard({ connected, onChanged }: { connected: boolean; onChanged: () => void }) {
  const [sync, setSync] = useState<BlingEntitySync | null>(null)
  const [clients, setClients] = useState<BlingClientStatus[]>([])
  const [busy, setBusy] = useState<'retry' | 'pull' | null>(null)
  const [showNoDoc, setShowNoDoc] = useState(false)
  const [message, setMessage] = useState<Banner>(null)

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([getEntitySync('clientes'), getClientsBlingStatus()])
    setSync(s); setClients(c)
  }, [])

  useEffect(() => { load().catch(e => setMessage({ kind: 'error', text: (e as Error).message })) }, [load])

  const linked = clients.filter(c => c.linked).length
  const noDoc = clients.filter(c => !c.hasDocument)
  const withError = clients.filter(c => c.error)
  const waiting = clients.filter(c => c.hasDocument && !c.linked && !c.error)

  const run = async (kind: 'retry' | 'pull') => {
    setBusy(kind); setMessage(null)
    try {
      if (kind === 'retry') {
        const n = await retryClientsToBling()
        setMessage({ kind: 'success', text: n ? `${n} cliente(s) enviados para a fila. Em instantes aparecem no Bling.` : 'Nenhum cliente pendente.' })
        await new Promise(r => setTimeout(r, 4000))
      } else {
        await pullClientsFromBling()
        setMessage({ kind: 'success', text: 'Correções do Bling atualizadas.' })
      }
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(null); await load(); onChanged()
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400" />
          <h3 className="font-semibold text-slate-900">Clientes</h3>
        </div>
        <span className={cn(
          'text-xs font-medium px-2.5 py-1 rounded-full',
          withError.length ? 'bg-red-100 text-red-700' : linked ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500',
        )}>
          {withError.length ? 'Com erro' : linked ? 'Em dia' : 'Aguardando'}
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-1">Itadog Sales → Bling na hora · correções fiscais do Bling voltam a cada 30 minutos</p>

      <div className="mt-3 text-sm text-slate-600 space-y-0.5">
        <p><strong>{linked}</strong> de {clients.length} clientes no Bling{waiting.length ? ` · ${waiting.length} na fila` : ''}</p>
        {sync?.lastSync && <p className="text-xs text-slate-400">Última leitura de correções: {formatRelative(sync.lastSync)}</p>}
      </div>

      {withError.length > 0 && (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 space-y-1">
          <p className="font-semibold">{withError.length} cliente(s) com erro ao enviar:</p>
          {withError.map(c => <p key={c.id}><strong>{c.name}</strong> — {c.error}</p>)}
        </div>
      )}

      {noDoc.length > 0 && (
        <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="font-semibold">{noDoc.length} cliente(s) sem CPF/CNPJ — não vão para o Bling e não podem ter pedido enviado à separação.</p>
          <button onClick={() => setShowNoDoc(v => !v)} className="mt-1 underline">{showNoDoc ? 'Esconder lista' : 'Ver lista'}</button>
          {showNoDoc && (
            <ul className="mt-2 space-y-0.5">
              {noDoc.map(c => (
                <li key={c.id}>
                  <a href={`/admin/clientes/${c.id}`} className="underline">{c.name}</a>
                  {c.repName && <span className="text-amber-700"> · {c.repName}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {message && (
        <p className={cn('mt-3 text-xs font-medium', message.kind === 'success' ? 'text-green-700' : 'text-red-600')}>{message.text}</p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          onClick={() => run('retry')}
          disabled={!!busy || !connected}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-lg bg-white hover:bg-primary-50 disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3 h-3', busy === 'retry' && 'animate-spin')} />
          {busy === 'retry' ? 'Enviando...' : 'Enviar pendentes'}
        </button>
        <button
          onClick={() => run('pull')}
          disabled={!!busy || !connected}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3 h-3', busy === 'pull' && 'animate-spin')} />
          {busy === 'pull' ? 'Buscando...' : 'Buscar correções do Bling'}
        </button>
      </div>
    </div>
  )
}

function ProductsSyncCard({ connected, onChanged }: { connected: boolean; onChanged: () => void }) {
  const { user } = useAuth()
  const [sync, setSync] = useState<BlingEntitySync | null>(null)
  const [priceSync, setPriceSync] = useState(false)
  const [compare, setCompare] = useState<BlingProductCompare[]>([])
  const [busy, setBusy] = useState<'run' | 'price' | null>(null)
  const [showPrices, setShowPrices] = useState(false)
  const [message, setMessage] = useState<Banner>(null)

  const load = useCallback(async () => {
    const [s, p, c] = await Promise.all([getEntitySync('produtos'), getPriceSyncEnabled(), getProductsCompare()])
    setSync(s); setPriceSync(p); setCompare(c)
  }, [])

  useEffect(() => { load().catch(e => setMessage({ kind: 'error', text: (e as Error).message })) }, [load])

  const notLinked = compare.filter(c => !c.blingId)
  const priceDiffs = compare.filter(c => c.blingId && c.blingPrice !== null && Math.abs(c.itadogPrice - c.blingPrice) >= 0.01)

  const handleRun = async () => {
    setBusy('run'); setMessage(null)
    try {
      await runProductsSync()
      setMessage({ kind: 'success', text: 'Produtos atualizados com o Bling.' })
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(null); await load(); onChanged()
    }
  }

  const handleTogglePrice = async () => {
    if (!user) return
    const next = !priceSync
    const text = next
      ? `Ligar a atualização de preços? Os preços do Itadog passam a seguir o Bling.${priceDiffs.length ? ` ${priceDiffs.length} produto(s) vão mudar de preço agora.` : ''}`
      : 'Desligar a atualização de preços? Os preços do Itadog param de seguir o Bling.'
    if (!window.confirm(text)) return
    setBusy('price'); setMessage(null)
    try {
      await setPriceSyncEnabled(next, user.id)
      if (next) await runProductsSync()
      setMessage({ kind: 'success', text: next ? 'Atualização de preços ligada.' : 'Atualização de preços desligada.' })
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    } finally {
      setBusy(null); await load(); onChanged()
    }
  }

  const status = sync?.status ?? 'pendente'

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400" />
          <h3 className="font-semibold text-slate-900">Produtos, preços e estoque</h3>
        </div>
        <span className={cn(
          'text-xs font-medium px-2.5 py-1 rounded-full',
          status === 'sincronizado' ? 'bg-green-100 text-green-700' :
          status === 'erro' ? 'bg-red-100 text-red-700' :
          status === 'sincronizando' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500',
        )}>
          {SYNC_LABEL[status]}
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-1">Bling → Itadog Sales · atualiza sozinho a cada 30 minutos</p>

      {sync && (
        <div className="mt-3 text-sm text-slate-600 space-y-0.5">
          <p><strong>{sync.synced}</strong> de {sync.total} produtos ligados ao Bling</p>
          {sync.lastSync && <p className="text-xs text-slate-400">Última atualização: {formatRelative(sync.lastSync)}</p>}
        </div>
      )}

      {sync?.errorMessage && (
        <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{sync.errorMessage}</div>
      )}

      {notLinked.length > 0 && (
        <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="font-semibold mb-1">{notLinked.length} produto(s) sem ligação — cadastre no Bling com o mesmo código:</p>
          <p>{notLinked.map(p => `${p.code} ${p.name}`).join(' · ')}</p>
        </div>
      )}

      {/* Preços */}
      <div className={cn(
        'mt-3 rounded-lg border px-3 py-2.5',
        priceSync ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200',
      )}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn('text-sm', priceSync ? 'text-green-800' : 'text-slate-700')}>
            {priceSync
              ? 'Preços seguem o Bling.'
              : `Atualização de preços desligada${priceDiffs.length ? ` · ${priceDiffs.length} produto(s) com preço diferente do Bling` : ' · preços iguais aos do Bling'}`}
          </p>
          <button
            onClick={handleTogglePrice}
            disabled={!!busy || !connected}
            className="text-xs font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-lg bg-white hover:bg-primary-50 disabled:opacity-50"
          >
            {busy === 'price' ? 'Aguarde...' : priceSync ? 'Desligar preços' : 'Ligar atualização de preços'}
          </button>
        </div>
        {!priceSync && priceDiffs.length > 0 && (
          <>
            <button onClick={() => setShowPrices(v => !v)} className="mt-2 text-xs text-slate-500 underline">
              {showPrices ? 'Esconder lista' : 'Ver lista'}
            </button>
            {showPrices && (
              <div className="mt-2 max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-400 text-left">
                    <tr><th className="py-1 pr-2">Código</th><th className="py-1 pr-2">Produto</th><th className="py-1 pr-2 text-right">Itadog</th><th className="py-1 text-right">Bling</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {priceDiffs.map(p => (
                      <tr key={p.productId}>
                        <td className="py-1 pr-2 text-slate-500">{p.code}</td>
                        <td className="py-1 pr-2 text-slate-700">{p.name}</td>
                        <td className="py-1 pr-2 text-right">{formatCurrency(p.itadogPrice)}</td>
                        <td className="py-1 text-right">{formatCurrency(p.blingPrice ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {message && (
        <p className={cn('mt-3 text-xs font-medium', message.kind === 'success' ? 'text-green-700' : 'text-red-600')}>{message.text}</p>
      )}

      <button
        onClick={handleRun}
        disabled={!!busy || !connected}
        className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-primary-600 border border-primary-200 px-3 py-1.5 rounded-lg bg-white hover:bg-primary-50 disabled:opacity-50"
      >
        <RefreshCw className={cn('w-3 h-3', busy === 'run' && 'animate-spin')} />
        {busy === 'run' ? 'Atualizando...' : 'Atualizar agora'}
      </button>
    </div>
  )
}

export default function AdminSincronizacao() {
  const [params, setParams] = useSearchParams()
  const [conn, setConn] = useState<BlingConnection | null>(null)
  const [log, setLog] = useState<BlingLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<'connect' | 'test' | 'disconnect' | null>(null)
  const [banner, setBanner] = useState<Banner>(null)

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    try {
      const [c, l] = await Promise.all([getBlingConnection(), getBlingLog(10)])
      setConn(c)
      setLog(l)
    } catch (e) {
      setBanner({ kind: 'error', text: (e as Error).message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Retorno do Bling: ?bling=conectado | ?bling=erro&motivo=...
  useEffect(() => {
    const result = params.get('bling')
    if (!result) return
    if (result === 'conectado') setBanner({ kind: 'success', text: 'Bling conectado com sucesso!' })
    else setBanner({ kind: 'error', text: params.get('motivo') || 'Não foi possível conectar ao Bling.' })
    setParams({}, { replace: true })
  }, [params, setParams])

  const handleConnect = async () => {
    setActing('connect'); setBanner(null)
    try {
      await startBlingConnect() // redireciona para o Bling
    } catch (e) {
      setBanner({ kind: 'error', text: (e as Error).message })
      setActing(null)
    }
  }

  const handleTest = async () => {
    setActing('test'); setBanner(null)
    try {
      const company = await testBlingConnection()
      setBanner({ kind: 'success', text: `Conexão funcionando — ${company.nome}` })
    } catch (e) {
      setBanner({ kind: 'error', text: (e as Error).message })
    } finally {
      setActing(null); load()
    }
  }

  const handleDisconnect = async () => {
    if (!window.confirm('Desconectar o Itadog Sales do Bling? A sincronização para até você conectar novamente.')) return
    setActing('disconnect'); setBanner(null)
    try {
      await disconnectBling()
      setBanner({ kind: 'success', text: 'Bling desconectado.' })
    } catch (e) {
      setBanner({ kind: 'error', text: (e as Error).message })
    } finally {
      setActing(null); load()
    }
  }

  const status = conn?.status ?? 'disconnected'
  const connected = status === 'connected'

  return (
    <AdminLayout title="Sincronização Bling">
      <div className="p-6 space-y-5 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">Integração com o Bling</h2>
            <p className="text-xs text-slate-400">Bling ERP · API v3</p>
          </div>
        </div>

        {!isSupabaseConfigured && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            Supabase não configurado neste ambiente — a integração não está disponível.
          </div>
        )}

        {banner && (
          <motion.div
            className={cn(
              'flex items-start gap-3 rounded-xl px-4 py-3 border',
              banner.kind === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200',
            )}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {banner.kind === 'success'
              ? <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
            <p className={cn('text-sm font-medium', banner.kind === 'success' ? 'text-green-800' : 'text-red-800')}>
              {banner.text}
            </p>
          </motion.div>
        )}

        {/* Conexão */}
        <div className={cn(
          'card p-5 border',
          connected ? 'border-green-200 bg-green-50/30' : status === 'error' ? 'border-red-200 bg-red-50/30' : 'border-slate-200',
        )}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              <h3 className="font-semibold text-slate-900">Conexão com o Bling</h3>
            </div>
            {!loading && (
              <div className={cn(
                'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
                connected ? 'bg-green-100 text-green-700' : status === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600',
              )}>
                {connected ? <CheckCircle2 className="w-3 h-3" /> : status === 'error' ? <XCircle className="w-3 h-3" /> : <Unplug className="w-3 h-3" />}
                {connected ? 'Conectado' : status === 'error' ? 'Com problema' : 'Desconectado'}
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 mt-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              {conn?.companyName && (
                <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-slate-400">Empresa</dt>
                    <dd className="font-medium text-slate-800">{conn.companyName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">CNPJ</dt>
                    <dd className="font-medium text-slate-800">{formatCnpj(conn.companyCnpj)}</dd>
                  </div>
                  {conn.connectedAt && (
                    <div>
                      <dt className="text-xs text-slate-400">Conectado em</dt>
                      <dd className="text-slate-700">{formatDateTime(conn.connectedAt)}</dd>
                    </div>
                  )}
                  {conn.lastCheckAt && (
                    <div>
                      <dt className="text-xs text-slate-400">Última verificação</dt>
                      <dd className="text-slate-700">{formatRelative(conn.lastCheckAt)}</dd>
                    </div>
                  )}
                </dl>
              )}

              {!connected && !conn?.lastError && (
                <p className="text-sm text-slate-500 mt-3">
                  Conecte o Itadog Sales à conta Bling da empresa. Você será levado ao Bling para autorizar
                  e depois volta automaticamente para esta tela.
                </p>
              )}

              {conn?.lastError && (
                <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {conn.lastError}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-4">
                {connected ? (
                  <>
                    <button onClick={handleTest} disabled={!!acting} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                      <RefreshCw className={cn('w-4 h-4', acting === 'test' && 'animate-spin')} />
                      {acting === 'test' ? 'Testando...' : 'Testar conexão'}
                    </button>
                    <button onClick={handleDisconnect} disabled={!!acting} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
                      <Unplug className="w-4 h-4" />
                      {acting === 'disconnect' ? 'Desconectando...' : 'Desconectar'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleConnect}
                    disabled={!!acting || !isSupabaseConfigured}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50"
                  >
                    {acting === 'connect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
                    {acting === 'connect' ? 'Abrindo o Bling...' : status === 'error' ? 'Reconectar ao Bling' : 'Conectar ao Bling'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {isSupabaseConfigured && !loading && <ProductsSyncCard connected={connected} onChanged={load} />}
        {isSupabaseConfigured && !loading && <ClientsSyncCard connected={connected} onChanged={load} />}
        {isSupabaseConfigured && !loading && <OrdersSyncCard connected={connected} onChanged={load} />}

        {isSupabaseConfigured && !loading && <InvoicesSyncCard connected={connected} onChanged={load} />}
        {isSupabaseConfigured && !loading && <FiscalReadinessCard />}

        {/* Atividade */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900">Atividade recente</h3>
          </div>
          {log.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma atividade ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {log.map(item => (
                <li key={item.id} className="flex items-start gap-3 py-2.5">
                  <span className={cn(
                    'mt-1.5 w-2 h-2 rounded-full flex-shrink-0',
                    item.level === 'error' ? 'bg-red-500' : item.level === 'warn' ? 'bg-amber-500' : 'bg-green-500',
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">{item.message ?? `${item.entity} · ${item.action}`}</p>
                    <p className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
