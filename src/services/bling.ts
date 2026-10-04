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

/** Chama a Edge Function e devolve a mensagem de erro dela, quando houver. */
async function callBling<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db().functions.invoke('bling-oauth', { body: { action, ...extra } })
  if (error) {
    let message = 'Não foi possível falar com o servidor da integração.'
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null) as { error?: string } | null
      if (body?.error) message = body.error
    }
    throw new Error(message)
  }
  return data as T
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
