/**
 * Pedidos Itadog → Bling (Vendas > Pedidos).
 *
 * - Itens pelo preço cheio + um único desconto em R$ (o desconto por item no Itadog é só exibição)
 * - Kit promocional: 1 unidade do produto-kit por kit, valor = total do kit no Itadog
 * - Cores/estampas e avisos (troca) vão nas observações internas — não aparecem na nota
 * - Parcelas = contas a receber já geradas no Itadog (mesmas datas e valores);
 *   sem financeiro, calcula pelo prazo
 * - Antes de criar, procura pelo número do Itadog (numeroLoja) para nunca duplicar
 */
import { BlingError, blingFetch, logSync } from '../_shared/bling.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { syncClient } from './clientes.ts'

type SB = SupabaseClient
// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

const SITUACAO_CANCELADO = 12

interface OrderItem {
  productId: string
  productName?: string
  price: number
  quantity: number
  total?: number
  kitCount?: number
  kitPaidQty?: number
  variants?: { qty: number; valueName: string; attributeName?: string }[]
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const ymd = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null)
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** "30/45/60", "30,45", "30/60 dias", "À vista", "7 dias" → [30,45,60] … */
function parseTermDays(terms: string | null): number[] {
  const t = (terms ?? '').toLowerCase()
  if (!t.trim() || /vista/.test(t)) return [0]
  const nums = (t.match(/\d+/g) ?? []).map(Number).filter(n => n >= 0 && n <= 365)
  return nums.length ? nums : [0]
}

function variantsText(item: OrderItem): string | null {
  const v = (item.variants ?? []).filter(x => x.qty > 0)
  if (!v.length) return null
  return v.map(x => `${x.valueName} ${x.qty}`).join(', ')
}

async function vendedorFor(sb: SB, repId: string | null): Promise<number | null> {
  if (!repId) return null
  const { data: rep } = await sb.from('profiles').select('name, bling_vendedor_id').eq('id', repId).maybeSingle()
  if (!rep) return null
  if (rep.bling_vendedor_id) return rep.bling_vendedor_id
  // Liga pelo nome (vendedor cadastrado no Bling com o mesmo nome do representante)
  const { data: refs } = await sb.from('bling_reference').select('bling_id, descricao').eq('kind', 'vendedor')
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()
  const match = (refs ?? []).find(r => r.descricao && norm(r.descricao) === norm(rep.name ?? ''))
  if (!match) return null
  await sb.from('profiles').update({ bling_vendedor_id: match.bling_id }).eq('id', repId)
  return match.bling_id
}

async function buildOrderBody(sb: SB, order: Json, client: Json) {
  const { data: settings } = await sb.from('bling_settings').select('payment_methods, troca_natureza').eq('id', 1).single()
  const paymentMap = (settings?.payment_methods ?? {}) as Record<string, number>

  // Itens
  const items = (order.items ?? []) as OrderItem[]
  const ids = [...new Set(items.map(i => i.productId))]
  const { data: products } = await sb.from('products')
    .select('id, code, name, bling_id, product_type, kit_paid_qty').in('id', ids)
  const byId = new Map((products ?? []).map(p => [p.id, p]))

  const missing: string[] = []
  const cores: string[] = []
  const itens = items.map(item => {
    const p = byId.get(item.productId)
    if (!p?.bling_id) { missing.push(p ? `${p.code} ${p.name}` : (item.productName ?? item.productId)); return null }
    const isKit = p.product_type === 'kit_promocional'
    const kits = isKit ? (item.kitCount ?? Math.max(1, Math.round(item.quantity / Math.max(p.kit_paid_qty, 1)))) : 0
    const quantidade = isKit ? kits : Number(item.quantity)
    const valor = isKit ? round2(Number(item.price) * Math.max(p.kit_paid_qty, 1)) : Number(item.price)
    const cor = variantsText(item)
    if (cor) cores.push(`${p.code} ${p.name}: ${cor}`)
    return {
      codigo: p.code,
      descricao: p.name,
      unidade: 'UN',
      quantidade,
      valor,
      produto: { id: Number(p.bling_id) },
    }
  }).filter(Boolean) as Json[]

  if (missing.length) {
    throw new BlingError(422, `Produto(s) sem ligação com o Bling: ${missing.join('; ')}. Cadastre no Bling com o mesmo código.`)
  }

  const itensTotal = round2(itens.reduce((s, i) => s + i.quantidade * i.valor, 0))
  const subtotal = round2(Number(order.subtotal ?? 0))
  if (Math.abs(itensTotal - subtotal) > 0.05) {
    throw new BlingError(422, `Valores do pedido não conferem (itens ${itensTotal.toFixed(2)} × subtotal ${subtotal.toFixed(2)}). Revise os itens do pedido.`)
  }
  // Desconto do pedido (+ centavos de arredondamento dos itens); nunca negativo
  const desconto = Math.max(round2(Number(order.discount ?? 0) + (itensTotal - subtotal)), 0)
  const total = round2(itensTotal - desconto)

  // Parcelas: usa o financeiro do Itadog quando existe
  const { data: receivables } = await sb.from('financial_receivables')
    .select('installment_number, amount, due_date, payment_method, status')
    .eq('order_id', order.id).neq('status', 'cancelado').order('installment_number')
  const formaDefault = paymentMap[order.payment_method ?? ''] ?? null
  let parcelas: Json[]
  if (receivables?.length) {
    parcelas = receivables.map(r => ({
      dataVencimento: ymd(r.due_date),
      valor: round2(Number(r.amount)),
      formaPagamento: { id: paymentMap[r.payment_method ?? ''] ?? formaDefault },
    }))
  } else {
    const base = ymd(order.delivery_date) ?? ymd(order.sale_date) ?? ymd(order.created_at)!
    const days = parseTermDays(order.payment_terms)
    const each = round2(total / days.length)
    parcelas = days.map(d => ({ dataVencimento: addDays(base, d), valor: each, formaPagamento: { id: formaDefault } }))
  }
  if (parcelas.some(p => !p.formaPagamento.id)) {
    throw new BlingError(422, `Forma de pagamento "${order.payment_method ?? 'não informada'}" sem correspondente no Bling.`)
  }
  // Soma das parcelas tem que bater com o total: a última absorve a diferença
  const diff = round2(total - parcelas.reduce((s, p) => s + p.valor, 0))
  if (parcelas.length && diff !== 0) parcelas[parcelas.length - 1].valor = round2(parcelas[parcelas.length - 1].valor + diff)

  // Observações internas (não vão para a nota)
  const { data: rep } = order.rep_id
    ? await sb.from('profiles').select('name').eq('id', order.rep_id).maybeSingle()
    : { data: null }
  const internas = [
    order.order_type === 'troca'
      ? `⚠ PEDIDO DE TROCA — emitir a nota com a natureza "${settings?.troca_natureza ?? 'Troca'}".${order.exchange_reason ? ` Motivo: ${order.exchange_reason}` : ''}`
      : null,
    `Pedido Itadog ${order.number}${rep?.name ? ` · Representante: ${rep.name}` : ''} · Cliente ${client.code ?? ''}`,
    cores.length ? `CORES / ESTAMPAS:\n${cores.join('\n')}` : null,
    order.payment_terms ? `Prazo: ${order.payment_terms} · ${order.payment_method ?? ''}` : null,
    order.notes ? `Observações do pedido: ${order.notes}` : null,
  ].filter(Boolean).join('\n')

  const data = ymd(order.sale_date) ?? ymd(order.created_at)!
  const vendedorId = await vendedorFor(sb, order.rep_id)

  return {
    body: {
      numeroLoja: order.number,
      data,
      dataSaida: data,
      dataPrevista: ymd(order.delivery_date) ?? data,
      contato: { id: Number(client.bling_contact_id) },
      ...(vendedorId ? { vendedor: { id: vendedorId } } : {}),
      itens,
      parcelas,
      ...(desconto > 0 ? { desconto: { valor: desconto, unidade: 'REAL' } } : {}),
      observacoesInternas: internas,
    },
    total,
  }
}

/** Pedido já existente no Bling com o número do Itadog (ignora os cancelados). */
async function findByNumber(sb: SB, number: string): Promise<number | null> {
  const res = await blingFetch<{ data: { id: number; numeroLoja?: string; situacao?: { id: number } }[] }>(
    sb, `/pedidos/vendas?numerosLojas[]=${encodeURIComponent(number)}&limite=100`,
  )
  return (res.data ?? []).find(p => p.numeroLoja === number && p.situacao?.id !== SITUACAO_CANCELADO)?.id ?? null
}

async function saveBlingInfo(sb: SB, orderId: string, blingId: number) {
  const { data } = await blingFetch<{ data: Json }>(sb, `/pedidos/vendas/${blingId}`)
  const { data: sit } = await sb.from('bling_reference').select('descricao')
    .eq('kind', 'situacao_venda').eq('bling_id', data?.situacao?.id ?? 0).maybeSingle()
  await sb.from('orders').update({
    bling_order_id: String(blingId),
    bling_order_number: data?.numero ? String(data.numero) : null,
    bling_situacao: sit?.descricao ?? null,
    bling_sent_at: new Date().toISOString(),
    bling_error: null,
    sync_status: 'sincronizado',
  }).eq('id', orderId)
  return data?.numero ? String(data.numero) : null
}

/** Cria ou atualiza o pedido no Bling. */
export async function pushOrder(sb: SB, orderId: string): Promise<'criado' | 'ligado' | 'atualizado' | 'ignorado'> {
  const { data: order, error } = await sb.from('orders').select('*').eq('id', orderId).maybeSingle()
  if (error) throw new BlingError(500, `Erro ao ler pedido: ${error.message}`)
  if (!order || order.is_deleted) return 'ignorado'

  // Cliente precisa estar no Bling
  let { data: client } = await sb.from('clients').select('id, code, bling_contact_id').eq('id', order.client_id).maybeSingle()
  if (client && !client.bling_contact_id) {
    await syncClient(sb, client.id)
    client = (await sb.from('clients').select('id, code, bling_contact_id').eq('id', order.client_id).maybeSingle()).data
  }
  if (!client?.bling_contact_id) {
    throw new BlingError(422, 'Cliente sem cadastro no Bling (confira CPF/CNPJ e o cartão de clientes na tela Sync Bling).')
  }

  const { body, total } = await buildOrderBody(sb, order, client)

  let blingId = order.bling_order_id ? Number(order.bling_order_id) : null
  let result: 'criado' | 'ligado' | 'atualizado'
  if (blingId) {
    await blingFetch(sb, `/pedidos/vendas/${blingId}`, { method: 'PUT', body: JSON.stringify(body) })
    result = 'atualizado'
  } else {
    blingId = await findByNumber(sb, order.number)
    if (blingId) {
      result = 'ligado'
    } else {
      const created = await blingFetch<{ data: { id: number } }>(sb, '/pedidos/vendas', { method: 'POST', body: JSON.stringify(body) })
      blingId = created.data.id
      result = 'criado'
    }
  }

  const numero = await saveBlingInfo(sb, order.id, blingId)
  const verbo = result === 'criado' ? 'enviado ao Bling' : result === 'ligado' ? 'ligado ao pedido já existente no Bling' : 'atualizado no Bling'
  await logSync(sb, {
    entity: 'pedidos', action: result === 'atualizado' ? 'update' : 'create',
    message: `Pedido ${order.number} ${verbo}${numero ? ` (nº ${numero} no Bling)` : ''} · R$ ${total.toFixed(2)}`,
    local_id: order.id, bling_id: String(blingId),
  })
  return result
}

/** Cancela no Bling um pedido excluído/cancelado no Itadog. */
export async function cancelOrder(sb: SB, orderId: string): Promise<'cancelado' | 'ignorado'> {
  const { data: order } = await sb.from('orders').select('id, number, bling_order_id').eq('id', orderId).maybeSingle()
  if (!order?.bling_order_id) return 'ignorado'
  await blingFetch(sb, `/pedidos/vendas/${order.bling_order_id}/situacoes/${SITUACAO_CANCELADO}`, { method: 'PATCH', body: '{}' })
  await sb.from('orders').update({ bling_situacao: 'Cancelado', bling_error: null }).eq('id', orderId)
  await logSync(sb, {
    level: 'warn', entity: 'pedidos', action: 'cancel',
    message: `Pedido ${order.number} cancelado no Bling`, local_id: order.id, bling_id: order.bling_order_id,
  })
  return 'cancelado'
}

/** Atualiza o painel de pedidos (bling_syncs). */
export async function refreshOrdersPanel(sb: SB) {
  const { count: sent } = await sb.from('orders').select('id', { count: 'exact', head: true }).not('bling_order_id', 'is', null)
  const { count: errors } = await sb.from('orders').select('id', { count: 'exact', head: true })
    .not('bling_error', 'is', null).not('is_deleted', 'is', true)
  await sb.from('bling_syncs').update({
    status: (errors ?? 0) > 0 ? 'erro' : 'sincronizado',
    synced: sent ?? 0,
    errors: errors ?? 0,
    last_sync: new Date().toISOString(),
    error_message: (errors ?? 0) > 0 ? `${errors} pedido(s) com erro ao enviar ao Bling` : null,
    updated_at: new Date().toISOString(),
  }).eq('id', 'pedidos')
}
