/**
 * bling-sync — tarefas de sincronização com o Bling.
 *
 * POST { job } — chamado pelo pg_cron (header x-bling-cron-secret) ou por admin logado.
 *   - token_keepalive:   renova o acesso diariamente (mantém a autorização viva)
 *   - products_snapshot: copia todos os produtos do Bling (com variações) para bling_products
 *   - products_sync:     snapshot + aplica nos produtos do Itadog (bling_apply_products) — a cada 30 min
 *
 * Deploy com verify_jwt = false; a autorização é feita em authorizeInternal().
 */
import {
  adminClient, authorizeInternal, BlingError, blingFetch, getAccessToken, logSync,
} from '../_shared/bling.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

type SB = ReturnType<typeof adminClient>

interface BlingProductListItem {
  id: number
  idProdutoPai?: number
  nome: string
  codigo?: string
  preco?: number
  tipo?: string
  situacao?: string
  formato?: string
  estoque?: { saldoVirtualTotal?: number }
}

interface BlingProductDetail extends BlingProductListItem {
  unidade?: string
  variacoes?: (BlingProductListItem & {
    unidade?: string
    variacao?: { nome?: string; ordem?: number; produtoPai?: { id: number } }
  })[]
}

const PAGE_SIZE = 100

function toRow(p: BlingProductListItem & { unidade?: string; variacao?: { nome?: string } }, parentId?: number) {
  return {
    bling_id: p.id,
    parent_bling_id: parentId ?? p.idProdutoPai ?? null,
    codigo: p.codigo?.trim() || null,
    nome: p.nome,
    formato: p.formato ?? null,
    tipo: p.tipo ?? null,
    situacao: p.situacao ?? null,
    preco: p.preco ?? null,
    unidade: p.unidade ?? null,
    variacao_nome: p.variacao?.nome ?? null,
    estoque_virtual: p.estoque?.saldoVirtualTotal ?? null,
    raw: p,
    fetched_at: new Date().toISOString(),
  }
}

async function upsertRows(sb: SB, rows: ReturnType<typeof toRow>[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from('bling_products').upsert(rows.slice(i, i + 200), { onConflict: 'bling_id' })
    if (error) throw new BlingError(500, `Erro ao gravar produtos: ${error.message}`)
  }
}

async function productsSnapshot(sb: SB) {
  const startedAt = new Date().toISOString()

  // 1) Lista completa (ativos e inativos)
  const list: BlingProductListItem[] = []
  for (let page = 1; ; page++) {
    const res = await blingFetch<{ data: BlingProductListItem[] }>(
      sb, `/produtos?pagina=${page}&limite=${PAGE_SIZE}&criterio=5&tipo=T`,
    )
    list.push(...(res.data ?? []))
    if ((res.data ?? []).length < PAGE_SIZE) break
  }
  await upsertRows(sb, list.map(p => toRow(p)))

  // 2) Detalhe dos produtos com variações (traz o nome da variação, ex.: "Cor:Azul")
  const parents = list.filter(p => p.formato === 'V' && !p.idProdutoPai)
  let variations = 0
  for (const parent of parents) {
    const { data } = await blingFetch<{ data: BlingProductDetail }>(sb, `/produtos/${parent.id}`)
    const rows = [toRow(data)]
    for (const v of data.variacoes ?? []) rows.push(toRow(v, data.id))
    variations += (data.variacoes ?? []).length
    await upsertRows(sb, rows)
  }

  // 3) Remove da cópia o que não veio nesta leitura (excluído no Bling)
  const { count: removed } = await sb.from('bling_products').delete({ count: 'exact' }).lt('fetched_at', startedAt)

  return { listados: list.length, comVariacoes: parents.length, variacoes: variations, removidos: removed ?? 0 }
}

interface ApplyResult {
  ligados: number
  atualizados: number
  criados_inativos: number
  desativados: number
  precos_ativos: boolean
  mudancas_preco: unknown[]
  mudancas_nome: unknown[]
}

async function productsSync(sb: SB) {
  await sb.from('bling_syncs').update({ status: 'sincronizando', updated_at: new Date().toISOString() }).eq('id', 'produtos')
  try {
    const snapshot = await productsSnapshot(sb)
    const { data, error } = await sb.rpc('bling_apply_products')
    if (error) throw new BlingError(500, `Erro ao aplicar produtos: ${error.message}`)
    const applied = data as ApplyResult

    const { count: total } = await sb.from('products').select('id', { count: 'exact', head: true })
    const { count: linked } = await sb.from('products').select('id', { count: 'exact', head: true }).not('bling_id', 'is', null)
    const now = Date.now()
    await sb.from('bling_syncs').update({
      status: 'sincronizado',
      total: total ?? 0,
      synced: linked ?? 0,
      errors: (total ?? 0) - (linked ?? 0),
      last_sync: new Date(now).toISOString(),
      next_sync: new Date(now + 30 * 60 * 1000).toISOString(),
      error_message: null,
      updated_at: new Date(now).toISOString(),
    }).eq('id', 'produtos')

    // Só registra no histórico quando algo mudou
    const changed = applied.ligados + applied.atualizados + applied.criados_inativos + applied.desativados
    if (changed > 0) {
      const parts = [
        applied.ligados && `${applied.ligados} ligado(s)`,
        applied.atualizados && `${applied.atualizados} atualizado(s)`,
        applied.mudancas_preco.length && `${applied.mudancas_preco.length} preço(s) alterado(s)`,
        applied.criados_inativos && `${applied.criados_inativos} novo(s) criado(s) inativo(s)`,
        applied.desativados && `${applied.desativados} desativado(s)`,
      ].filter(Boolean)
      await logSync(sb, { entity: 'produtos', action: 'apply', message: `Produtos do Bling: ${parts.join(', ')}`, details: applied })
    }
    return { ...snapshot, ...applied }
  } catch (e) {
    const err = e instanceof BlingError ? e : new BlingError(500, String(e))
    await sb.from('bling_syncs').update({ status: 'erro', error_message: err.message, updated_at: new Date().toISOString() }).eq('id', 'produtos')
    throw err
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const sb = adminClient()
  const caller = await authorizeInternal(sb, req)
  if (!caller) return json({ error: 'Não autorizado.' }, 401)

  const { job } = await req.json().catch(() => ({})) as { job?: string }

  try {
    switch (job) {
      case 'token_keepalive': {
        await getAccessToken(sb, { force: true })
        return json({ ok: true })
      }
      case 'products_snapshot': {
        const summary = await productsSnapshot(sb)
        await logSync(sb, {
          entity: 'produtos', action: 'snapshot',
          message: `Leitura de produtos do Bling: ${summary.listados} itens, ${summary.comVariacoes} com variações`,
          details: summary,
        })
        return json({ ok: true, ...summary })
      }
      case 'products_sync':
        return json({ ok: true, ...(await productsSync(sb)) })
      default:
        return json({ error: 'Tarefa desconhecida.' }, 400)
    }
  } catch (e) {
    const err = e instanceof BlingError ? e : new BlingError(500, String(e))
    await logSync(sb, { level: 'error', entity: job ?? 'sync', action: 'job', message: err.message, http_status: err.status, details: err.details })
    return json({ error: err.message }, err.status >= 400 && err.status < 600 ? err.status : 500)
  }
})
