/**
 * bling-nfe — NF-e, situação do pedido, boletos e pagamentos: Bling → Itadog.
 *
 * POST {} — chamado pelo pg_cron a cada 10 min (header x-bling-cron-secret) ou por admin logado.
 * Deploy com verify_jwt = false; a autorização é feita em authorizeInternal().
 */
import { adminClient, authorizeInternal, BlingError, logSync } from '../_shared/bling.ts'
import { pullOrders } from './nfe.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const sb = adminClient()
  if (!(await authorizeInternal(sb, req))) return json({ error: 'Não autorizado.' }, 401)

  try {
    return json({ ok: true, ...(await pullOrders(sb)) })
  } catch (e) {
    const err = e instanceof BlingError ? e : new BlingError(500, String(e))
    await logSync(sb, { level: 'error', entity: 'financeiro', action: 'pull', message: err.message, http_status: err.status })
    return json({ error: err.message }, err.status >= 400 && err.status < 600 ? err.status : 500)
  }
})
