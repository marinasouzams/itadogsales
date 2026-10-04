/**
 * Nota fiscal e contas a receber: Bling → Itadog (a cada 10 min).
 *
 * Para cada pedido já enviado ao Bling e ainda não concluído:
 *  1) Lê o pedido no Bling (situação) e, se houver, a NF-e (número, chave, PDF)
 *  2) NF-e autorizada → pedido vira "faturado / pronto para envio" no Itadog (como o botão Faturar)
 *  3) Liga as parcelas do Itadog às contas a receber do Bling (link do boleto/PIX)
 *  4) Conta paga no Bling → baixa automática da parcela no Itadog (data do borderô)
 */
import { blingFetch, logSync } from '../_shared/bling.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

type SB = SupabaseClient
// deno-lint-ignore no-explicit-any
type Json = Record<string, any>

const NFE_SITUACAO: Record<number, string> = {
  1: 'Pendente', 2: 'Cancelada', 3: 'Aguardando recibo', 4: 'Rejeitada', 5: 'Autorizada',
  6: 'Emitida DANFE', 7: 'Registrada', 8: 'Aguardando protocolo', 9: 'Denegada',
  10: 'Consulta situação', 11: 'Bloqueada',
}
const NFE_AUTORIZADA = new Set([5, 6, 7])
const NFE_AUTORIZADA_NOMES = new Set([...NFE_AUTORIZADA].map(n => NFE_SITUACAO[n]))

// Situação da conta a receber no Bling
const CONTA_SITUACAO: Record<number, string> = {
  1: 'Em aberto', 2: 'Recebido', 3: 'Parcialmente recebido', 4: 'Devolvido', 5: 'Cancelado', 6: 'Devolvido parcial', 7: 'Confirmado',
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const ymd = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 10) : null)

/** Pedido faturado pela NF do Bling: mesmo efeito do botão "Faturar" do admin. */
async function markInvoiced(sb: SB, order: Json, nfe: Json) {
  const issuedAt = nfe.dataEmissao ? new Date(nfe.dataEmissao.replace(' ', 'T')).toISOString() : new Date().toISOString()
  await sb.from('orders').update({
    status: 'invoiced_ready_to_ship',
    invoiced_at: issuedAt,
    invoiced_by: `Bling (NF ${nfe.numero ?? ''})`.trim(),
  }).eq('id', order.id)

  await sb.from('interactions').insert({
    client_id: order.client_id, client_name: order.client_name,
    rep_id: order.rep_id, rep_name: order.rep_name, type: 'pedido',
    title: `Pedido nº ${order.number} faturado`,
    description: `Nota fiscal nº ${nfe.numero ?? ''} emitida no Bling. Pedido pronto para envio.`,
    related_id: order.id, timestamp: new Date().toISOString(),
  })
  await sb.from('notifications').insert({
    type: 'order_invoiced', title: 'Pedido faturado (Bling)',
    description: `Pedido ${order.number} · NF ${nfe.numero ?? ''}`, entity: 'Order', entity_id: order.id,
  })

  // Comissão no faturamento, quando essa for a regra configurada (idempotente)
  const { data: settings } = await sb.from('company_settings').select('commission_timing, default_commission_rate').eq('id', 1).maybeSingle()
  if (settings?.commission_timing === 'invoiced' && order.order_type !== 'troca') {
    const { data: existing } = await sb.from('commissions').select('id').eq('order_id', order.id).neq('status', 'cancelada').limit(1)
    if (!existing?.length) {
      const rate = Number(settings.default_commission_rate ?? 0)
      await sb.from('commissions').insert({
        rep_id: order.rep_id, rep_name: order.rep_name, order_id: order.id, order_number: order.number,
        client_id: order.client_id, client_name: order.client_name, order_total: order.total,
        rate, amount: round2(Number(order.total) * rate / 100), status: 'prevista',
        reference_month: String(order.sale_date ?? order.created_at).slice(0, 7),
      })
    }
  }
}

/** Data do pagamento: data do borderô mais recente da conta (senão, hoje). */
async function paymentDate(sb: SB, conta: Json): Promise<string> {
  const ids: number[] = Array.isArray(conta.borderos) ? conta.borderos : []
  let best: string | null = null
  for (const id of ids.slice(-3)) {
    try {
      const { data } = await blingFetch<{ data: Json }>(sb, `/borderos/${id}`)
      const d = ymd(data?.data)
      if (d && (!best || d > best)) best = d
    } catch { /* borderô indisponível: segue */ }
  }
  return best ?? new Date().toISOString().slice(0, 10)
}

/** Liga parcelas às contas do Bling e dá baixa nas pagas. Devolve quantas baixas fez. */
async function syncReceivables(sb: SB, order: Json, origemIds: number[]): Promise<{ ligadas: number; baixas: number }> {
  const { data: recs } = await sb.from('financial_receivables')
    .select('id, installment_number, amount, due_date, status, paid_amount, bling_conta_id, payment_method')
    .eq('order_id', order.id).neq('status', 'cancelado').order('installment_number')
  if (!recs?.length) return { ligadas: 0, baixas: 0 }

  // Contas do Bling originadas da NF (ou do pedido)
  let contas: Json[] = []
  for (const idOrigem of origemIds) {
    try {
      const res = await blingFetch<Json>(sb, `/contas/receber/boletos?idOrigem=${idOrigem}`)
      const list = (res.data?.contas ?? res.contas ?? []) as Json[]
      if (list.length) { contas = list; break }
    } catch { /* sem contas para esta origem */ }
  }
  if (!contas.length) return { ligadas: 0, baixas: 0 }

  contas.sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))
  const sortedRecs = [...recs].sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))

  let ligadas = 0, baixas = 0
  for (let i = 0; i < contas.length; i++) {
    const c = contas[i]
    // Mesma posição quando a quantidade bate; senão, mesmo vencimento e valor
    const rec = (contas.length === sortedRecs.length ? sortedRecs[i] : null)
      ?? sortedRecs.find(r => ymd(r.due_date) === ymd(c.vencimento) && Math.abs(Number(r.amount) - Number(c.valor)) < 0.05)
    if (!rec) continue

    const { data: conta } = await blingFetch<{ data: Json }>(sb, `/contas/receber/${c.id}`)
    const situacao = Number(conta?.situacao ?? c.situacao)
    const patch: Json = {
      bling_conta_id: c.id,
      bling_situacao: CONTA_SITUACAO[situacao] ?? String(situacao),
      boleto_url: conta?.linkBoleto || null,
      pix_url: conta?.linkQRCodePix || null,
      bling_synced_at: new Date().toISOString(),
    }
    if (!rec.bling_conta_id) ligadas++

    // Baixa automática
    const valor = Number(conta?.valor ?? c.valor ?? rec.amount)
    const saldo = Number(conta?.saldo ?? 0)
    const pago = round2(situacao === 2 || situacao === 7 ? Number(rec.amount) : situacao === 3 ? valor - saldo : 0)
    if (pago > 0 && round2(Number(rec.paid_amount ?? 0)) < pago && rec.status !== 'pago') {
      const remaining = round2(Math.max(Number(rec.amount) - pago, 0))
      Object.assign(patch, {
        paid_amount: pago,
        remaining_amount: remaining,
        status: remaining <= 0 ? 'pago' : 'parcial',
        payment_date: await paymentDate(sb, conta ?? {}),
        updated_at: new Date().toISOString(),
      })
      baixas++
      await logSync(sb, {
        entity: 'financeiro', action: 'baixa',
        message: `Baixa automática: pedido ${order.number}, parcela ${rec.installment_number} · R$ ${pago.toFixed(2)} (pago no Bling)`,
        local_id: rec.id, bling_id: String(c.id),
      })
    }
    await sb.from('financial_receivables').update(patch).eq('id', rec.id)
  }
  return { ligadas, baixas }
}

/** Busca no Bling notas e pagamentos dos pedidos em andamento. */
export async function pullOrders(sb: SB) {
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString()
  const { data: orders } = await sb.from('orders')
    .select('id, number, status, client_id, client_name, rep_id, rep_name, total, order_type, sale_date, created_at, bling_order_id, bling_nfe_id, nfe_status')
    .not('bling_order_id', 'is', null).not('is_deleted', 'is', true).gte('created_at', since)

  const stats = { pedidos: 0, notas: 0, faturados: 0, parcelas_ligadas: 0, baixas: 0, erros: 0 }
  for (const order of orders ?? []) {
    // Pedido sem nada pendente (nota autorizada e parcelas quitadas) não precisa ser consultado
    if (NFE_AUTORIZADA_NOMES.has(order.nfe_status ?? '')) {
      const { count } = await sb.from('financial_receivables').select('id', { count: 'exact', head: true })
        .eq('order_id', order.id).not('status', 'in', '(pago,cancelado)')
      if (!count) continue
    }
    stats.pedidos++
    try {
      const { data: ped } = await blingFetch<{ data: Json }>(sb, `/pedidos/vendas/${order.bling_order_id}`)
      const { data: sit } = await sb.from('bling_reference').select('descricao')
        .eq('kind', 'situacao_venda').eq('bling_id', ped?.situacao?.id ?? 0).maybeSingle()
      const update: Json = { bling_situacao: sit?.descricao ?? null }

      const nfeId = ped?.notaFiscal?.id ? Number(ped.notaFiscal.id) : null
      if (nfeId) {
        const { data: nfe } = await blingFetch<{ data: Json }>(sb, `/nfe/${nfeId}`)
        const situacao = Number(nfe?.situacao)
        Object.assign(update, {
          bling_nfe_id: nfeId,
          nfe_number: nfe?.numero ? String(nfe.numero) : null,
          nfe_series: nfe?.serie != null ? String(nfe.serie) : null,
          nfe_key: nfe?.chaveAcesso || null,
          nfe_status: NFE_SITUACAO[situacao] ?? String(situacao),
          nfe_issued_at: nfe?.dataEmissao ? new Date(String(nfe.dataEmissao).replace(' ', 'T')).toISOString() : null,
          nfe_pdf_url: nfe?.linkPDF || null,
          nfe_danfe_url: nfe?.linkDanfe || null,
        })
        stats.notas++
        if (NFE_AUTORIZADA.has(situacao) && ['pending_separation', 'separation'].includes(order.status)) {
          await markInvoiced(sb, order, nfe)
          stats.faturados++
          await logSync(sb, {
            entity: 'pedidos', action: 'invoice',
            message: `Pedido ${order.number} faturado pela NF ${nfe?.numero ?? ''} do Bling`,
            local_id: order.id, bling_id: String(nfeId),
          })
        }
      }
      await sb.from('orders').update(update).eq('id', order.id)

      const r = await syncReceivables(sb, order, [nfeId, Number(order.bling_order_id)].filter(Boolean) as number[])
      stats.parcelas_ligadas += r.ligadas
      stats.baixas += r.baixas
    } catch (e) {
      stats.erros++
      await logSync(sb, {
        level: 'error', entity: 'financeiro', action: 'pull',
        message: `Pedido ${order.number}: ${e instanceof Error ? e.message : String(e)}`, local_id: order.id,
      })
    }
  }

  const now = Date.now()
  await sb.from('bling_syncs').update({
    status: stats.erros ? 'erro' : 'sincronizado',
    total: stats.pedidos, synced: stats.pedidos - stats.erros, errors: stats.erros,
    last_sync: new Date(now).toISOString(), next_sync: new Date(now + 10 * 60 * 1000).toISOString(),
    error_message: stats.erros ? `${stats.erros} pedido(s) com erro ao consultar o Bling` : null,
    updated_at: new Date(now).toISOString(),
  }).eq('id', 'financeiro')
  return stats
}
