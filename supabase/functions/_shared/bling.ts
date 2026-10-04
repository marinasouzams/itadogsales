/**
 * Cliente do Bling (API v3) para as Edge Functions.
 * - Tokens ficam no Vault (RPCs bling_get_tokens / bling_save_tokens).
 * - Renovação com trava no banco: só um processo renova por vez, porque o Bling
 *   invalida o refresh token antigo e bloqueia o IP após 20 chamadas/min em /oauth/token.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const BLING_OAUTH_URL = 'https://www.bling.com.br/Api/v3/oauth'
export const BLING_API_URL = 'https://api.bling.com.br/Api/v3'

const REFRESH_TOKEN_DAYS = 30
const RENEW_BEFORE_MS = 5 * 60 * 1000

export interface BlingTokens {
  access_token: string
  refresh_token: string
  token_type?: string
  scope?: string
  expires_at: string
  refresh_expires_at: string
}

export class BlingError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message)
  }
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export function blingCredentials(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get('BLING_CLIENT_ID')
  const clientSecret = Deno.env.get('BLING_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new BlingError(500, 'Chaves do Bling não configuradas no Supabase (BLING_CLIENT_ID / BLING_CLIENT_SECRET).')
  }
  return { clientId, clientSecret }
}

/** Mensagem legível a partir do corpo de erro do Bling ({ error: { message, description } }). */
function blingErrorMessage(body: unknown, fallback: string): string {
  const err = (body as { error?: { message?: string; description?: string } | string })?.error
  if (typeof err === 'string') return err
  return err?.description || err?.message || fallback
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text }
}

/** POST /oauth/token — troca de code ou renovação. */
export async function requestToken(body: Record<string, string>): Promise<BlingTokens> {
  const { clientId, clientSecret } = blingCredentials()
  const res = await fetch(`${BLING_OAUTH_URL}/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'enable-jwt': '1',
    },
    body: new URLSearchParams(body),
  })
  const payload = await readBody(res)
  if (!res.ok) {
    throw new BlingError(res.status, blingErrorMessage(payload, `Falha ao obter token do Bling (HTTP ${res.status})`), payload)
  }
  const data = payload as { access_token: string; refresh_token?: string; token_type?: string; scope?: string; expires_in?: number }
  const now = Date.now()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? '',
    token_type: data.token_type,
    scope: data.scope,
    expires_at: new Date(now + (data.expires_in ?? 3600) * 1000).toISOString(),
    refresh_expires_at: new Date(now + REFRESH_TOKEN_DAYS * 24 * 3600 * 1000).toISOString(),
  }
}

export async function loadTokens(sb: SupabaseClient): Promise<BlingTokens | null> {
  const { data, error } = await sb.rpc('bling_get_tokens')
  if (error) throw new BlingError(500, `Erro ao ler tokens: ${error.message}`)
  return (data as BlingTokens | null) ?? null
}

export async function saveTokens(sb: SupabaseClient, tokens: BlingTokens): Promise<void> {
  const { error } = await sb.rpc('bling_save_tokens', { p_tokens: tokens })
  if (error) throw new BlingError(500, `Erro ao salvar tokens: ${error.message}`)
}

export async function logSync(sb: SupabaseClient, entry: {
  level?: 'info' | 'warn' | 'error'
  entity: string
  action: string
  message?: string
  http_status?: number
  local_id?: string
  bling_id?: string
  details?: unknown
}): Promise<void> {
  // Log nunca derruba o fluxo principal
  await sb.from('bling_sync_log').insert({ level: 'info', ...entry }).then(() => {}, () => {})
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function refreshAccessToken(sb: SupabaseClient, current: BlingTokens): Promise<string> {
  const { data: locked } = await sb.rpc('bling_try_refresh_lock', { p_seconds: 30 })

  if (!locked) {
    // Outro processo está renovando: aguarda e usa o token novo
    for (let i = 0; i < 15; i++) {
      await sleep(1000)
      const t = await loadTokens(sb)
      if (t && t.access_token !== current.access_token) return t.access_token
    }
    throw new BlingError(503, 'Renovação do acesso ao Bling em andamento. Tente novamente em instantes.')
  }

  try {
    // Pode ter sido renovado enquanto aguardávamos a trava
    const latest = (await loadTokens(sb)) ?? current
    if (latest.access_token !== current.access_token && Date.parse(latest.expires_at) - Date.now() > RENEW_BEFORE_MS) {
      return latest.access_token
    }

    const fresh = await requestToken({ grant_type: 'refresh_token', refresh_token: latest.refresh_token })
    if (!fresh.refresh_token) {
      // Bling não devolveu refresh novo: mantém o anterior e sua validade
      fresh.refresh_token = latest.refresh_token
      fresh.refresh_expires_at = latest.refresh_expires_at
    }
    await saveTokens(sb, fresh)
    await sb.from('bling_connection').update({
      status: 'connected',
      access_expires_at: fresh.expires_at,
      refresh_expires_at: fresh.refresh_expires_at,
      last_refresh_at: new Date().toISOString(),
      last_error: null,
    }).eq('id', 1)
    await logSync(sb, { entity: 'conexao', action: 'refresh', message: 'Acesso ao Bling renovado' })
    return fresh.access_token
  } catch (e) {
    const err = e instanceof BlingError ? e : new BlingError(500, String(e))
    if (err.status === 400 || err.status === 401) {
      await sb.from('bling_connection').update({
        status: 'error',
        last_error: 'A autorização do Bling expirou ou foi revogada. Clique em "Reconectar ao Bling".',
      }).eq('id', 1)
    }
    await logSync(sb, { level: 'error', entity: 'conexao', action: 'refresh', message: err.message, http_status: err.status })
    throw err
  } finally {
    await sb.rpc('bling_release_refresh_lock')
  }
}

/** Access token válido, renovando quando faltar menos de 5 min (ou se forçado). */
export async function getAccessToken(sb: SupabaseClient, opts: { force?: boolean } = {}): Promise<string> {
  const tokens = await loadTokens(sb)
  if (!tokens) throw new BlingError(401, 'O Itadog Sales ainda não está conectado ao Bling.')
  if (!opts.force && Date.parse(tokens.expires_at) - Date.now() > RENEW_BEFORE_MS) return tokens.access_token
  return await refreshAccessToken(sb, tokens)
}

/** Chamada à API do Bling com renovação automática e uma nova tentativa em 401. */
export async function blingFetch<T = unknown>(sb: SupabaseClient, path: string, init: RequestInit = {}): Promise<T> {
  const call = (token: string) => fetch(`${BLING_API_URL}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'enable-jwt': '1',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  let res = await call(await getAccessToken(sb))
  if (res.status === 401) res = await call(await getAccessToken(sb, { force: true }))

  const payload = await readBody(res)
  if (!res.ok) {
    throw new BlingError(res.status, blingErrorMessage(payload, `Erro na API do Bling (HTTP ${res.status})`), payload)
  }
  return payload as T
}

export interface BlingCompany { id: string; nome: string; cnpj: string; email?: string }

export async function fetchCompany(sb: SupabaseClient): Promise<BlingCompany> {
  const res = await blingFetch<{ data: BlingCompany }>(sb, '/empresas/me/dados-basicos')
  return res.data
}
