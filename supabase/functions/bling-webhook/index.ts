/**
 * bling-webhook — recebe os avisos (webhooks) do Bling.
 *
 * - Confere a assinatura X-Bling-Signature-256 (HMAC-SHA256 do corpo com o client secret)
 * - Guarda o evento em bling_inbox (o mesmo eventId é ignorado se chegar de novo)
 * - Agenda a atualização correspondente (agrupada) e responde 200 na hora
 *   (o Bling exige resposta em até 5 s)
 *
 * Deploy com verify_jwt = false (o Bling não envia JWT; a segurança é a assinatura).
 */
import { adminClient, blingCredentials, logSync } from '../_shared/bling.ts'

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
}

/** Comparação em tempo constante (evita descobrir a assinatura por tempo de resposta). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function validSignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!header) return false
  const { clientSecret } = blingCredentials()
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(clientSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)))
  const received = header.trim().replace(/^sha256=/i, '').toLowerCase()
  return safeEqual(expected, received)
}

/** Que atualização cada tipo de evento dispara. */
function kindOf(event: string): 'produtos' | 'pedidos' | null {
  const resource = event.split('.')[0]
  if (['product', 'stock', 'virtual_stock'].includes(resource)) return 'produtos'
  if (['order', 'invoice'].includes(resource)) return 'pedidos'
  return null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 })

  const raw = await req.text()
  const sb = adminClient()

  if (!(await validSignature(raw, req.headers.get('X-Bling-Signature-256')))) {
    await logSync(sb, { level: 'warn', entity: 'webhook', action: 'signature', message: 'Webhook recusado: assinatura inválida' })
    return new Response('invalid signature', { status: 401 })
  }

  let body: { eventId?: string; event?: string; companyId?: string; data?: unknown }
  try { body = JSON.parse(raw) } catch { return new Response('invalid json', { status: 400 }) }

  const eventId = body.eventId ?? crypto.randomUUID()
  const event = body.event ?? 'desconhecido'

  // Evento repetido (reentrega do Bling) → responde 200 sem processar de novo
  const { error } = await sb.from('bling_inbox').insert({
    event_id: eventId, event, company_id: body.companyId ?? null, payload: body,
  })
  if (error && !/duplicate key/i.test(error.message)) {
    // Falha ao gravar: devolve erro para o Bling reenviar depois
    return new Response('retry', { status: 500 })
  }
  if (!error) {
    const kind = kindOf(event)
    if (kind) await sb.rpc('bling_webhook_dispatch', { p_kind: kind })
  }
  return new Response('ok', { status: 200 })
})
