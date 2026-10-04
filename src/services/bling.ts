/**
 * Integração Bling — acesso do painel admin.
 * Os tokens nunca passam pelo navegador: tudo que fala com o Bling roda na
 * Edge Function `bling-oauth` (supabase/functions/bling-oauth).
 */
import { supabase } from '@/lib/supabase'

export type BlingConnectionStatus = 'disconnected' | 'connected' | 'error'

export interface BlingConnection {
  status: BlingConnectionStatus
  companyName: string | null
  companyCnpj: string | null
  connectedAt: string | null
  accessExpiresAt: string | null
  refreshExpiresAt: string | null
  lastRefreshAt: string | null
  lastCheckAt: string | null
  lastError: string | null
}

export interface BlingLogEntry {
  id: number
  createdAt: string
  level: 'info' | 'warn' | 'error'
  entity: string
  action: string
  message: string | null
}

function db() {
  if (!supabase) throw new Error('Supabase não configurado')
  return supabase
}

export async function getBlingConnection(): Promise<BlingConnection | null> {
  const { data, error } = await db().from('bling_connection').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    status: data.status,
    companyName: data.company_name,
    companyCnpj: data.company_cnpj,
    connectedAt: data.connected_at,
    accessExpiresAt: data.access_expires_at,
    refreshExpiresAt: data.refresh_expires_at,
    lastRefreshAt: data.last_refresh_at,
    lastCheckAt: data.last_check_at,
    lastError: data.last_error,
  }
}

export async function getBlingLog(limit = 10): Promise<BlingLogEntry[]> {
  const { data, error } = await db()
    .from('bling_sync_log')
    .select('id, created_at, level, entity, action, message')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({
    id: r.id, createdAt: r.created_at, level: r.level, entity: r.entity, action: r.action, message: r.message,
  }))
}

// ── Produtos ────────────────────────────────────────────────

export interface BlingEntitySync {
  status: 'pendente' | 'sincronizando' | 'sincronizado' | 'erro'
  total: number
  synced: number
  errors: number
  lastSync: string | null
  nextSync: string | null
  errorMessage: string | null
}

export interface BlingProductCompare {
  productId: string
  code: string
  name: string
  active: boolean
  blingId: string | null
  itadogPrice: number
  blingPrice: number | null
}

export async function getEntitySync(id: string): Promise<BlingEntitySync | null> {
  const { data, error } = await db().from('bling_syncs').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    status: data.status,
    total: data.total,
    synced: data.synced,
    errors: data.errors,
    lastSync: data.last_sync,
    nextSync: data.next_sync,
    errorMessage: data.error_message,
  }
}

export async function getPriceSyncEnabled(): Promise<boolean> {
  const { data, error } = await db().from('bling_settings').select('price_sync_enabled').eq('id', 1).maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data?.price_sync_enabled)
}

export async function setPriceSyncEnabled(enabled: boolean, userId: string): Promise<void> {
  const { error } = await db().from('bling_settings')
    .update({ price_sync_enabled: enabled, updated_by: userId }).eq('id', 1)
  if (error) throw new Error(error.message)
}

export async function getProductsCompare(): Promise<BlingProductCompare[]> {
  const { data, error } = await db().from('bling_products_compare')
    .select('product_id, code, name, active, bling_id, itadog_price, bling_price')
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({
    productId: r.product_id,
    code: r.code,
    name: r.name,
    active: r.active,
    blingId: r.bling_id,
    itadogPrice: Number(r.itadog_price),
    blingPrice: r.bling_price === null ? null : Number(r.bling_price),
  }))
}

/** Roda agora a atualização de produtos (a mesma que o agendamento faz a cada 30 min). */
export async function runProductsSync(): Promise<void> {
  await invokeFunction('bling-sync', { job: 'products_sync' })
}

/** Chama uma Edge Function e devolve a mensagem de erro dela, quando houver. */
async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().functions.invoke(name, { body })
  if (error) {
    let message = 'Não foi possível falar com o servidor da integração.'
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const parsed = await ctx.json().catch(() => null) as { error?: string } | null
      if (parsed?.error) message = parsed.error
    }
    throw new Error(message)
  }
  return data as T
}

async function callBling<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  return invokeFunction<T>('bling-oauth', { action, ...extra })
}

/** Abre a tela de autorização do Bling; ao final o Bling volta para /admin/sincronizacao. */
export async function startBlingConnect(): Promise<void> {
  const { url } = await callBling<{ url: string }>('start', { origin: window.location.origin })
  window.location.href = url
}

export async function testBlingConnection(): Promise<{ nome: string; cnpj: string }> {
  const { company } = await callBling<{ ok: boolean; company: { nome: string; cnpj: string } }>('test')
  return company
}

export async function disconnectBling(): Promise<void> {
  await callBling('disconnect')
}
