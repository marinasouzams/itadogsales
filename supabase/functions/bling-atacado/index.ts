/**
 * bling-atacado — pedidos de atacado: Bling → Itadog (somente leitura).
 *
 * Pedido de atacado = pedido de venda do Bling que NÃO nasceu no Itadog (sem "número da loja").
 * Os do varejo são criados pelo Itadog com numeroLoja = número do pedido.
 *
 * POST { from?: 'YYYY-MM-DD', dry?: boolean } — pg_cron (x-bling-cron-secret) ou admin logado.
 *  - dry: só lista o que seria importado, sem gravar nada
 *  - sem "from": últimos 45 dias (rotina); a importação inicial passa o from
 * Deploy com verify_jwt = false; a autorização é feita em authorizeInternal().
 */
import { adminClient, authorizeInternal, blingFetch, BlingError, logSync } from '../_shared/bling.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

type SB = SupabaseClient
// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const SIT_CANCELADO = 12
const SIT_EM_DIGITACAO = 21
const NFE_SITUACAO: Record<number, string> = {
  1: 'Pendente', 2: 'Cancelada', 3: 'Aguardando recibo', 4: 'Rejeitada', 5: 'Autorizada',
  6: 'Emitida DANFE', 7: 'Registrada', 8: 'Aguardando protocolo', 9: 'Denegada', 10: 'Consulta situação', 11: 'Bloqueada',
}
const NFE_OK = new Set(['Autorizada', 'Emitida DANFE', 'Registrada'])

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const ymd = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
const num = (v: unknown) => Number(v ?? 0) || 0
const iso = (d: string | null) => (d ? new Date(d.replace(' ', 'T')).toISOString() : null)

/** Pedidos de venda do Bling desde `from` (paginado, 100 por página). */
async function listOrders(sb: SB, from: string): Promise<Json[]> {
  const all: Json[] = []
  for (let page = 1; page <= 30; page++) {
    const res = await blingFetch<{ data?: Json[] }>(sb, `/pedidos/vendas?limite=100&pagina=${page}&dataInicial=${from}`)
    const list = res.data ?? []
    all.push(...list)
    if (list.length < 100) break
  }
  return all
}

async function adminId(sb: SB): Promise<string | null> {
  const { data } = await sb.from('profiles').select('id').eq('role', 'admin').order('created_at').limit(1).maybeSingle()
  return data?.id ?? null
}

/** Cliente do atacado pelo CNPJ; se não existir, cadastra com os dados do contato no Bling. */
async function ensureClient(sb: SB, contato: Json, owner: string | null, dry: boolean): Promise<string | null> {
  const cnpj = digits(contato.numeroDocumento)
  if (!cnpj) return null
  const { data: found } = await sb.from('clients').select('id, channel').eq('cnpj', cnpj).maybeSingle()
  if (found) return found.id
  if (dry || !owner) return `novo:${cnpj}`

  let c: Json = {}
  try { c = (await blingFetch<{ data: Json }>(sb, `/contatos/${contato.id}`)).data ?? {} } catch { /* segue só com o básico */ }
  const end = c.endereco?.geral ?? {}
  const phone = String(c.celular || c.telefone || '').trim()
  const { data: created, error } = await sb.from('clients').insert({
    name: c.nome || contato.nome,
    trade_name: c.fantasia || null,
    cnpj,
    state_registration: c.ie || null,
    email: c.email || null,
    phone: phone || '—',
    type: 'distribuidor',
    segment: 'Atacado',
    channel: 'atacado',
    status: 'ativo',
    rep_id: owner,
    bling_contact_id: Number(contato.id) || null,
    address: {
      street: end.endereco ?? '', number: end.numero ?? '', complement: end.complemento ?? '',
      neighborhood: end.bairro ?? '', city: end.municipio ?? '', state: end.uf ?? '',
      zipCode: String(end.cep ?? '').replace(/^(\d{5})(\d{3})$/, '$1-$2'), lat: 0, lng: 0,
    },
  }).select('id').single()
  if (error) throw new BlingError(500, `Cliente ${contato.nome}: ${error.message}`)
  await logSync(sb, { entity: 'atacado', action: 'client', message: `Cliente de atacado cadastrado: ${contato.nome}`, local_id: created.id })
  return created.id
}

const NFE_TESTE = 'Nota de teste (homologação)'

async function loadNfe(sb: SB, nfeId: number): Promise<Json> {
  let nfe: Json
  try {
    nfe = (await blingFetch<{ data: Json }>(sb, `/nfe/${nfeId}`)).data
  } catch (e) {
    // Nota emitida em homologação: o Bling não deixa consultar pelo ambiente de produção
    if (e instanceof BlingError && /ambiente de emiss/i.test(e.message)) return { nfe_id: nfeId, nfe_number: null, nfe_status: NFE_TESTE }
    throw e
  }
  const s = Number(nfe?.situacao)
  return {
    nfe_id: nfeId,
    nfe_number: nfe?.numero ? String(nfe.numero) : null,
    nfe_status: NFE_SITUACAO[s] ?? (Number.isFinite(s) ? String(s) : null),
    nfe_issued_at: iso(nfe?.dataEmissao ?? null),
    nfe_pdf_url: nfe?.linkPDF || null,
    nfe_danfe_url: nfe?.linkDanfe || null,
  }
}

async function recomputeClientStats(sb: SB, clientIds: string[]) {
  for (const id of new Set(clientIds)) {
    const { data } = await sb.from('wholesale_orders').select('total, sale_date')
      .eq('client_id', id).eq('status', 'ativo').eq('ignored', false)
    const rows = data ?? []
    await sb.from('clients').update({
      total_orders: rows.length,
      total_revenue: rows.reduce((s, r) => s + num(r.total), 0),
      last_order: rows.map(r => r.sale_date).sort().pop() ?? null,
    }).eq('id', id)
  }
}

export async function run(sb: SB, opts: { from?: string; dry?: boolean }) {
  const from = opts.from ?? new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const dry = !!opts.dry
  const owner = await adminId(sb)

  const { data: sitRef } = await sb.from('bling_reference').select('bling_id, descricao').eq('kind', 'situacao_venda')
  const sitName = new Map((sitRef ?? []).map(r => [Number(r.bling_id), r.descricao as string]))

  const listed = (await listOrders(sb, from)).filter(o => !String(o.numeroLoja ?? '').trim())
  const { data: existingRows } = await sb.from('wholesale_orders')
    .select('bling_id, total, bling_situacao_id, nfe_id, nfe_status').in('bling_id', listed.map(o => o.id))
  const existing = new Map((existingRows ?? []).map(r => [Number(r.bling_id), r]))

  const stats = { encontrados: listed.length, novos: 0, atualizados: 0, sem_mudanca: 0, clientes_novos: 0, erros: 0 }
  const preview: Json[] = []
  const touchedClients: string[] = []

  for (const o of listed) {
    const prev = existing.get(Number(o.id))
    const sitId = Number(o.situacao?.id ?? 0)
    const unchanged = !!prev && num(prev.total) === num(o.total) && Number(prev.bling_situacao_id) === sitId
      && (!o.notaFiscal?.id || NFE_OK.has(prev.nfe_status ?? ''))
    // A listagem não traz nota; a nota é conferida no detalhe enquanto não estiver autorizada
    if (prev && unchanged && (prev.nfe_id || sitId === SIT_CANCELADO)) { stats.sem_mudanca++; continue }

    try {
      const { data: d } = await blingFetch<{ data: Json }>(sb, `/pedidos/vendas/${o.id}`)
      const status = sitId === SIT_CANCELADO ? 'cancelado' : sitId === SIT_EM_DIGITACAO ? 'rascunho' : 'ativo'
      const nfeId = Number(d.notaFiscal?.id ?? 0)
      const nfe = nfeId ? await loadNfe(sb, nfeId) : {}
      const items = ((d.itens ?? []) as Json[]).map((it, i) => ({
        line: i + 1,
        product_bling_id: it.produto?.id ? Number(it.produto.id) : null,
        code: it.codigo ?? null,
        description: it.descricao ?? '',
        unit: it.unidade ?? null,
        quantity: num(it.quantidade),
        unit_price: num(it.valor),
        discount: num(it.desconto),
        total: Math.round((num(it.quantidade) * num(it.valor) - num(it.desconto)) * 100) / 100,
      }))

      const clientId = await ensureClient(sb, d.contato ?? {}, owner, dry)
      if (clientId?.startsWith('novo:')) stats.clientes_novos++
      preview.push({
        numero: d.numero, data: ymd(d.data), cliente: d.contato?.nome, cnpj: digits(d.contato?.numeroDocumento),
        total: num(d.total), situacao: sitName.get(sitId) ?? String(sitId), status, nota: nfe.nfe_number ?? null,
        itens: items.length, acao: prev ? 'atualizar' : 'novo', teste: nfe.nfe_status === NFE_TESTE,
      })
      if (dry) { prev ? stats.atualizados++ : stats.novos++; continue }

      const { data: city } = clientId
        ? await sb.from('clients').select('address').eq('id', clientId).maybeSingle()
        : { data: null }
      const row = {
        bling_id: Number(d.id), number: String(d.numero), client_id: clientId, client_name: d.contato?.nome ?? null,
        client_cnpj: digits(d.contato?.numeroDocumento) || null, client_city: city?.address?.city ?? null,
        sale_date: ymd(d.data) ?? ymd(o.data), total: num(d.total), products_total: num(d.totalProdutos),
        discount: num(d.desconto?.valor), freight: num(d.transporte?.frete),
        status, bling_situacao_id: sitId, bling_situacao: sitName.get(sitId) ?? null,
        installments: ((d.parcelas ?? []) as Json[]).map(p => ({ due: ymd(p.dataVencimento), amount: num(p.valor), forma_id: p.formaPagamento?.id ?? null })),
        notes: [d.observacoes, d.observacoesInternas].filter(Boolean).join(' | ') || null,
        items_count: items.length, synced_at: new Date().toISOString(),
        ...nfe,
        ...(!prev && nfe.nfe_status === NFE_TESTE ? { ignored: true, ignore_reason: 'Nota emitida em ambiente de teste (homologação)' } : {}),
      }
      const { error } = await sb.from('wholesale_orders').upsert(row, { onConflict: 'bling_id' })
      if (error) throw new BlingError(500, error.message)
      await sb.from('wholesale_order_items').delete().eq('order_bling_id', row.bling_id)
      if (items.length) {
        // código do Bling → produto do Itadog (quando já vinculado)
        const ids = items.map(i => i.product_bling_id).filter(Boolean)
        const { data: prods } = await sb.from('products').select('id, bling_id').in('bling_id', ids.map(String))
        const byBling = new Map((prods ?? []).map(p => [Number(p.bling_id), p.id]))
        await sb.from('wholesale_order_items').insert(items.map(i => ({
          ...i, order_bling_id: row.bling_id, product_id: i.product_bling_id ? byBling.get(i.product_bling_id) ?? null : null,
        })))
      }
      prev ? stats.atualizados++ : stats.novos++
      if (clientId) touchedClients.push(clientId)
    } catch (e) {
      stats.erros++
      await logSync(sb, { level: 'error', entity: 'atacado', action: 'pull', message: `Pedido ${o.numero}: ${e instanceof Error ? e.message : String(e)}`, bling_id: String(o.id) })
    }
  }

  if (!dry) {
    await recomputeClientStats(sb, touchedClients)
    const now = Date.now()
    await sb.from('bling_syncs').update({
      status: stats.erros ? 'erro' : 'sincronizado', total: stats.encontrados, synced: stats.encontrados - stats.erros, errors: stats.erros,
      last_sync: new Date(now).toISOString(), next_sync: new Date(now + 10 * 60 * 1000).toISOString(),
      error_message: stats.erros ? `${stats.erros} pedido(s) de atacado com erro` : null, updated_at: new Date(now).toISOString(),
    }).eq('id', 'atacado')
  }
  return { ...stats, dry, from, pedidos: preview }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  const sb = adminClient()
  if (!(await authorizeInternal(sb, req))) return json({ error: 'Não autorizado.' }, 401)
  const body = await req.json().catch(() => ({}))
  try {
    return json({ ok: true, ...(await run(sb, { from: ymd(body.from) ?? undefined, dry: !!body.dry })) })
  } catch (e) {
    const err = e instanceof BlingError ? e : new BlingError(500, String(e))
    await logSync(sb, { level: 'error', entity: 'atacado', action: 'pull', message: err.message, http_status: err.status })
    return json({ error: err.message }, err.status >= 400 && err.status < 600 ? err.status : 500)
  }
})
