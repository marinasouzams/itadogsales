/**
 * bling-ref — lê do Bling as listas de referência usadas nos pedidos e grava em bling_reference:
 * formas de pagamento, naturezas de operação, vendedores, situações do módulo de vendas,
 * depósitos e canais de venda.
 *
 * POST {} — chamado por admin logado ou pg_cron (x-bling-cron-secret). Deploy com verify_jwt = false.
 */
import { adminClient, authorizeInternal, BlingError, blingFetch, logSync } from '../_shared/bling.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

type SB = ReturnType<typeof adminClient>
// deno-lint-ignore no-explicit-any
type Item = Record<string, any>

async function listAll(sb: SB, path: string): Promise<Item[]> {
  const all: Item[] = []
  const sep = path.includes('?') ? '&' : '?'
  for (let page = 1; page <= 20; page++) {
    const res = await blingFetch<{ data: Item[] }>(sb, `${path}${sep}pagina=${page}&limite=100`)
    const data = Array.isArray(res.data) ? res.data : []
    all.push(...data)
    if (data.length < 100) break
  }
  return all
}

async function save(sb: SB, kind: string, items: Item[], describe: (i: Item) => string | null) {
  await sb.from('bling_reference').delete().eq('kind', kind)
  if (!items.length) return 0
  const rows = items.filter(i => i.id).map(i => ({ kind, bling_id: i.id, descricao: describe(i), raw: i, fetched_at: new Date().toISOString() }))
  const { error } = await sb.from('bling_reference').insert(rows)
  if (error) throw new BlingError(500, `Erro ao gravar ${kind}: ${error.message}`)
  return rows.length
}

async function refresh(sb: SB) {
  const result: Record<string, number | string> = {}
  const tasks: [string, () => Promise<Item[]>, (i: Item) => string | null][] = [
    ['forma_pagamento', () => listAll(sb, '/formas-pagamentos'), i => i.descricao ?? null],
    ['natureza_operacao', () => listAll(sb, '/naturezas-operacoes'), i => i.descricao ?? null],
    ['vendedor', () => listAll(sb, '/vendedores'), i => i.contato?.nome ?? null],
    ['deposito', () => listAll(sb, '/depositos'), i => i.descricao ?? null],
    ['canal_venda', () => listAll(sb, '/canais-venda'), i => i.descricao ?? null],
    ['situacao_venda', async () => {
      const mods = await blingFetch<{ data: Item[] }>(sb, '/situacoes/modulos')
      const vendas = (mods.data ?? []).find(m => /venda/i.test(m.nome ?? m.descricao ?? ''))
      if (!vendas) return []
      const sit = await blingFetch<{ data: Item[] }>(sb, `/situacoes/modulos/${vendas.id}`)
      return (sit.data ?? []).map(s => ({ ...s, moduloId: vendas.id }))
    }, i => i.nome ?? i.descricao ?? null],
  ]
  for (const [kind, load, describe] of tasks) {
    try {
      result[kind] = await save(sb, kind, await load(), describe)
    } catch (e) {
      result[kind] = `erro: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  await logSync(sb, { entity: 'referencias', action: 'refresh', message: 'Listas de referência do Bling atualizadas', details: result })
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  const sb = adminClient()
  if (!(await authorizeInternal(sb, req))) return json({ error: 'Não autorizado.' }, 401)
  try {
    return json({ ok: true, ...(await refresh(sb)) })
  } catch (e) {
    const err = e instanceof BlingError ? e : new BlingError(500, String(e))
    return json({ error: err.message }, err.status >= 400 && err.status < 600 ? err.status : 500)
  }
})
