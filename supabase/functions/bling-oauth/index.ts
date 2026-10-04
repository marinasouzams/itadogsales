/**
 * bling-oauth — conexão do Itadog Sales com o Bling (OAuth2).
 *
 * GET  ?code&state  → retorno do Bling (link de redirecionamento cadastrado no app).
 * POST { action }   → chamadas do painel admin (exigem usuário admin logado):
 *   - start:      gera o link de autorização do Bling
 *   - test:       testa a conexão buscando os dados básicos da empresa
 *   - disconnect: apaga os tokens e marca como desconectado
 *
 * Deploy com verify_jwt = false (o Bling chama o GET sem JWT); o POST valida o usuário aqui.
 */
import {
  adminClient, blingCredentials, BlingError, BLING_OAUTH_URL,
  fetchCompany, getAccessToken, logSync, requestToken, saveTokens,
} from '../_shared/bling.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const RETURN_PATH = '/admin/sincronizacao'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { Location: to } })
}

function messagePage(title: string, text: string): Response {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;color:#0f172a">
<h1 style="font-size:20px">${title}</h1><p style="color:#475569">${text}</p></body></html>`
  return new Response(html, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function withParams(base: string, params: Record<string, string>): string {
  const url = new URL(base)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url.toString()
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** Aceita só a origem do site (https, ou http em localhost para desenvolvimento). */
function safeOrigin(origin: unknown): string | null {
  if (typeof origin !== 'string') return null
  try {
    const u = new URL(origin)
    const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol !== 'https:' && !(isLocal && u.protocol === 'http:')) return null
    return u.origin
  } catch {
    return null
  }
}

// ── Retorno do Bling ─────────────────────────────────────────
async function handleCallback(url: URL): Promise<Response> {
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const denied = url.searchParams.get('error')
  const sb = adminClient()

  if (!state) {
    return messagePage('Link inválido', 'Volte ao Itadog Sales e clique em "Conectar ao Bling" novamente.')
  }

  // Consome o state (uso único)
  const { data: st } = await sb.from('bling_oauth_states').delete().eq('state', state).select().maybeSingle()
  if (!st || Date.parse(st.expires_at) < Date.now()) {
    return messagePage('Link expirado', 'Volte ao Itadog Sales e clique em "Conectar ao Bling" novamente.')
  }

  const back = st.return_to as string

  if (denied || !code) {
    await logSync(sb, { level: 'warn', entity: 'conexao', action: 'connect', message: 'Autorização não concedida no Bling', details: { error: denied } })
    return redirect(withParams(back, { bling: 'erro', motivo: 'Autorização cancelada no Bling.' }))
  }

  try {
    const tokens = await requestToken({ grant_type: 'authorization_code', code })
    await saveTokens(sb, tokens)

    const company = await fetchCompany(sb)
    const now = new Date().toISOString()
    await sb.from('bling_connection').update({
      status: 'connected',
      company_id: company.id,
      company_name: company.nome,
      company_cnpj: company.cnpj,
      connected_at: now,
      connected_by: st.created_by,
      access_expires_at: tokens.expires_at,
      refresh_expires_at: tokens.refresh_expires_at,
      last_check_at: now,
      last_error: null,
    }).eq('id', 1)

    await logSync(sb, { entity: 'conexao', action: 'connect', message: `Conectado ao Bling: ${company.nome}`, bling_id: company.id })
    return redirect(withParams(back, { bling: 'conectado' }))
  } catch (e) {
    const err = e instanceof BlingError ? e : new BlingError(500, String(e))
    await sb.from('bling_connection').update({ status: 'error', last_error: err.message }).eq('id', 1)
    await logSync(sb, { level: 'error', entity: 'conexao', action: 'connect', message: err.message, http_status: err.status, details: err.details })
    return redirect(withParams(back, { bling: 'erro', motivo: err.message }))
  }
}

// ── Ações do painel admin ───────────────────────────────────
async function handleAction(req: Request): Promise<Response> {
  const sb = adminClient()

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Não autenticado.' }, 401)
  const { data: auth } = await sb.auth.getUser(jwt)
  if (!auth?.user) return json({ error: 'Sessão inválida. Entre novamente no Itadog Sales.' }, 401)
  const { data: profile } = await sb.from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
  if (profile?.role !== 'admin') return json({ error: 'Apenas administradores podem gerenciar a conexão com o Bling.' }, 403)

  const body = await req.json().catch(() => ({})) as { action?: string; origin?: string }

  try {
    switch (body.action) {
      case 'start': {
        const { clientId } = blingCredentials()
        const origin = safeOrigin(body.origin)
        if (!origin) return json({ error: 'Endereço de retorno inválido.' }, 400)

        await sb.from('bling_oauth_states').delete().lt('expires_at', new Date().toISOString())
        const state = randomState()
        const { error } = await sb.from('bling_oauth_states').insert({
          state, created_by: auth.user.id, return_to: `${origin}${RETURN_PATH}`,
        })
        if (error) throw new BlingError(500, `Erro ao iniciar conexão: ${error.message}`)

        const url = new URL(`${BLING_OAUTH_URL}/authorize`)
        url.searchParams.set('response_type', 'code')
        url.searchParams.set('client_id', clientId)
        url.searchParams.set('state', state)
        return json({ url: url.toString() })
      }

      case 'test': {
        const company = await fetchCompany(sb)
        await sb.from('bling_connection').update({
          status: 'connected',
          company_id: company.id,
          company_name: company.nome,
          company_cnpj: company.cnpj,
          last_check_at: new Date().toISOString(),
          last_error: null,
        }).eq('id', 1)
        await logSync(sb, { entity: 'conexao', action: 'test', message: `Conexão OK: ${company.nome}` })
        return json({ ok: true, company: { nome: company.nome, cnpj: company.cnpj } })
      }

      case 'disconnect': {
        // Revoga no Bling (melhor esforço) e apaga os tokens locais
        try {
          const { clientId, clientSecret } = blingCredentials()
          const token = await getAccessToken(sb)
          await fetch(`${BLING_OAUTH_URL}/revoke`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ token }),
          })
        } catch { /* segue mesmo se a revogação falhar */ }

        await sb.rpc('bling_clear_tokens')
        await sb.from('bling_connection').update({
          status: 'disconnected',
          access_expires_at: null,
          refresh_expires_at: null,
          last_error: null,
        }).eq('id', 1)
        await logSync(sb, { level: 'warn', entity: 'conexao', action: 'disconnect', message: 'Conexão com o Bling removida pelo admin' })
        return json({ ok: true })
      }

      default:
        return json({ error: 'Ação desconhecida.' }, 400)
    }
  } catch (e) {
    const err = e instanceof BlingError ? e : new BlingError(500, String(e))
    if (body.action === 'test') {
      await sb.from('bling_connection').update({ last_check_at: new Date().toISOString(), last_error: err.message }).eq('id', 1)
      await logSync(sb, { level: 'error', entity: 'conexao', action: 'test', message: err.message, http_status: err.status })
    }
    return json({ error: err.message }, err.status >= 400 && err.status < 600 ? err.status : 500)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method === 'GET') return await handleCallback(new URL(req.url))
  if (req.method === 'POST') return await handleAction(req)
  return json({ error: 'Método não permitido.' }, 405)
})
