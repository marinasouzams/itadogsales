/**
 * Clientes Itadog ⇄ contatos Bling.
 *
 * Regra de mesclagem (por campo fiscal), usando a base da última sincronização (clients.bling_fiscal):
 *   - só o Itadog mudou  → envia ao Bling
 *   - só o Bling mudou   → traz para o Itadog
 *   - os dois mudaram    → vale o Bling (dados fiscais são do Bling)
 *   - sem base (contato já existia no Bling) → vale o Bling; campo vazio no Bling recebe o do Itadog
 */
import { BlingError, blingFetch, logSync } from '../_shared/bling.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

type SB = SupabaseClient

const FIELDS = [
  'nome', 'fantasia', 'documento', 'ie', 'email', 'telefone',
  'endereco', 'numero', 'complemento', 'bairro', 'cep', 'municipio', 'uf',
] as const
type Field = typeof FIELDS[number]
type Fiscal = Record<Field, string | null>

interface ClientRow {
  id: string
  code: string | null
  name: string | null
  trade_name: string | null
  cnpj: string | null
  cpf: string | null
  state_registration: string | null
  email: string | null
  phone: string | null
  buyer_whatsapp: string | null
  address: Record<string, unknown> | null
  rep_id: string | null
  bling_contact_id: number | null
  bling_fiscal: Fiscal | null
}

// deno-lint-ignore no-explicit-any
type BlingContact = Record<string, any>

const digits = (v: unknown) => (typeof v === 'string' ? v.replace(/\D/g, '') : '') || null
const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Telefone no formato aceito pelo Bling: (47) 3396-7484 / (47) 99947-5899. Inválido → null. */
function phoneBR(v: unknown): string | null {
  let d = digits(v)
  if (!d) return null
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  return null
}

function fromClient(c: ClientRow): Fiscal {
  const a = c.address ?? {}
  return {
    nome: text(c.name),
    fantasia: text(c.trade_name),
    documento: digits(c.cnpj) ?? digits(c.cpf),
    ie: text(c.state_registration),
    email: text(c.email),
    telefone: phoneBR(c.phone),
    endereco: text(a.street),
    numero: text(a.number),
    complemento: text(a.complement),
    bairro: text(a.neighborhood),
    cep: digits(a.zipCode),
    municipio: text(a.city),
    uf: text(a.state)?.toUpperCase() ?? null,
  }
}

function fromBling(b: BlingContact): Fiscal {
  const g = b.endereco?.geral ?? {}
  return {
    nome: text(b.nome),
    fantasia: text(b.fantasia),
    documento: digits(b.numeroDocumento),
    ie: text(b.ie),
    email: text(b.email),
    telefone: phoneBR(b.telefone) ?? text(b.telefone),
    endereco: text(g.endereco),
    numero: text(g.numero),
    complemento: text(g.complemento),
    bairro: text(g.bairro),
    cep: digits(g.cep),
    municipio: text(g.municipio),
    uf: text(g.uf)?.toUpperCase() ?? null,
  }
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? null)?.toUpperCase() === (b ?? null)?.toUpperCase()

function merge(itadog: Fiscal, base: Fiscal | null, bling: Fiscal) {
  const result = { ...itadog }
  const toBling: Field[] = []
  const toItadog: Field[] = []
  for (const f of FIELDS) {
    const i = itadog[f], b = bling[f]
    if (same(i, b)) continue
    if (!base) {
      if (b !== null) { result[f] = b; toItadog.push(f) } else toBling.push(f)
      continue
    }
    const a = base[f]
    if (!same(i, a) && same(b, a)) toBling.push(f)
    else { result[f] = b; toItadog.push(f) }
  }
  return { result, toBling, toItadog }
}

/** Monta o corpo do contato para POST/PUT, partindo do que já existe no Bling. */
function contactBody(current: BlingContact | null, f: Fiscal, extra: {
  codigo: string; celular: string | null; vendedorId: number | null; tipoClienteId: number | null
}): BlingContact {
  const keep = ['codigo', 'situacao', 'celular', 'rg', 'orgaoEmissor', 'dadosAdicionais', 'financeiro',
    'pais', 'tiposContato', 'pessoasContato', 'vendedor', 'indicadorIe']
  const body: BlingContact = {}
  for (const k of keep) if (current?.[k] !== undefined && current?.[k] !== null) body[k] = current[k]
  const cobranca = current?.endereco?.cobranca

  Object.assign(body, {
    nome: f.nome,
    fantasia: f.fantasia ?? '',
    numeroDocumento: f.documento,
    tipo: (f.documento ?? '').length === 14 ? 'J' : 'F',
    ie: f.ie ?? '',
    email: f.email ?? '',
    telefone: f.telefone ?? '',
    situacao: body.situacao ?? 'A',
    codigo: extra.codigo, // código do Itadog (CLI-0001…) é sempre o que vale
    endereco: {
      geral: {
        endereco: f.endereco ?? '', numero: f.numero ?? '', complemento: f.complemento ?? '',
        bairro: f.bairro ?? '', cep: f.cep ?? '', municipio: f.municipio ?? '', uf: f.uf ?? '',
      },
      ...(cobranca ? { cobranca } : {}),
    },
  })
  // IE preenchida = contribuinte; vazia = não contribuinte (ajustável no Bling)
  // (só mexe quando a IE muda, para não desfazer "isento" marcado no Bling)
  if (!current || text(current.ie) !== f.ie) body.indicadorIe = f.ie ? 1 : 9
  if (!current && extra.celular) body.celular = extra.celular
  if (extra.vendedorId) body.vendedor = { id: extra.vendedorId }
  if (!current && extra.tipoClienteId) body.tiposContato = [{ id: extra.tipoClienteId }]
  return body
}

/** Grava no cliente do Itadog os campos que vieram do Bling. */
function clientPatch(c: ClientRow, f: Fiscal, fields: Field[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const address = { ...(c.address ?? {}) }
  let addressChanged = false
  for (const k of fields) {
    switch (k) {
      case 'nome': patch.name = f.nome ?? c.name; break
      case 'fantasia': patch.trade_name = f.fantasia; break
      case 'documento':
        if ((f.documento ?? '').length === 14) { patch.cnpj = f.documento; patch.cpf = null }
        else if ((f.documento ?? '').length === 11) { patch.cpf = f.documento; patch.cnpj = null }
        break
      case 'ie': patch.state_registration = f.ie; break
      case 'email': patch.email = f.email; break
      case 'telefone': patch.phone = f.telefone; break
      case 'endereco': address.street = f.endereco; addressChanged = true; break
      case 'numero': address.number = f.numero; addressChanged = true; break
      case 'complemento': address.complement = f.complemento; addressChanged = true; break
      case 'bairro': address.neighborhood = f.bairro; addressChanged = true; break
      case 'cep': address.zipCode = f.cep ? f.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : null; addressChanged = true; break
      case 'municipio': address.city = f.municipio; addressChanged = true; break
      case 'uf': address.state = f.uf; addressChanged = true; break
    }
  }
  if (addressChanged) patch.address = address
  return patch
}

let tipoClienteCache: number | null | undefined
async function tipoClienteId(sb: SB): Promise<number | null> {
  if (tipoClienteCache !== undefined) return tipoClienteCache
  try {
    const res = await blingFetch<{ data: { id: number; descricao: string }[] }>(sb, '/contatos/tipos')
    tipoClienteCache = res.data?.find(t => /^cliente/i.test(t.descricao))?.id ?? null
  } catch {
    tipoClienteCache = null
  }
  return tipoClienteCache
}

const CLIENT_COLUMNS = 'id, code, name, trade_name, cnpj, cpf, state_registration, email, phone, buyer_whatsapp, address, rep_id, bling_contact_id, bling_fiscal'

/**
 * Sincroniza um cliente com o Bling (cria, liga ou mescla).
 * Devolve o que aconteceu, para o histórico.
 */
export async function syncClient(sb: SB, clientId: string): Promise<{ result: 'criado' | 'ligado' | 'atualizado' | 'sem_mudanca' | 'sem_documento' }> {
  const { data: c, error } = await sb.from('clients').select(CLIENT_COLUMNS).eq('id', clientId).maybeSingle()
  if (error) throw new BlingError(500, `Erro ao ler cliente: ${error.message}`)
  if (!c) return { result: 'sem_mudanca' }
  const client = c as ClientRow

  const itadog = fromClient(client)
  if (!itadog.documento) return { result: 'sem_documento' }

  let vendedorId: number | null = null
  if (client.rep_id) {
    const { data: rep } = await sb.from('profiles').select('bling_vendedor_id').eq('id', client.rep_id).maybeSingle()
    vendedorId = rep?.bling_vendedor_id ?? null
  }
  const extra = { codigo: client.code ?? client.id, celular: phoneBR(client.buyer_whatsapp), vendedorId, tipoClienteId: null as number | null }

  let contactId = client.bling_contact_id
  let current: BlingContact | null = null
  let result: 'criado' | 'ligado' | 'atualizado' | 'sem_mudanca' = 'sem_mudanca'

  if (!contactId) {
    // Evita duplicidade: procura o CPF/CNPJ no Bling antes de criar
    // (confere o documento de cada resultado — nunca liga pelo "primeiro da lista")
    const found = await blingFetch<{ data: { id: number; numeroDocumento?: string; situacao?: string }[] }>(
      sb, `/contatos?numeroDocumento=${itadog.documento}&limite=100`,
    )
    const match = (found.data ?? []).find(ct => digits(ct.numeroDocumento) === itadog.documento && ct.situacao !== 'E')
    if (match) {
      contactId = match.id
      result = 'ligado'
    } else {
      extra.tipoClienteId = await tipoClienteId(sb)
      const created = await blingFetch<{ data: { id: number } }>(sb, '/contatos', {
        method: 'POST', body: JSON.stringify(contactBody(null, itadog, extra)),
      })
      await sb.from('clients').update({
        bling_contact_id: created.data.id, bling_fiscal: itadog, bling_synced_at: new Date().toISOString(), bling_error: null,
      }).eq('id', client.id)
      await logSync(sb, { entity: 'clientes', action: 'create', message: `Cliente criado no Bling: ${itadog.nome}`, local_id: client.id, bling_id: String(created.data.id) })
      return { result: 'criado' }
    }
  }

  current = (await blingFetch<{ data: BlingContact }>(sb, `/contatos/${contactId}`)).data
  const bling = fromBling(current)
  const base = result === 'ligado' ? null : client.bling_fiscal
  const { result: merged, toBling, toItadog } = merge(itadog, base, bling)
  const vendedorChanged = vendedorId !== null && current.vendedor?.id !== vendedorId
  const codigoChanged = text(current.codigo) !== extra.codigo

  if (toBling.length || vendedorChanged || codigoChanged) {
    await blingFetch(sb, `/contatos/${contactId}`, { method: 'PUT', body: JSON.stringify(contactBody(current, merged, extra)) })
    if (result !== 'ligado') result = 'atualizado'
  }

  const patch = toItadog.length ? clientPatch(client, merged, toItadog) : {}
  if (toItadog.length && result !== 'ligado') result = 'atualizado'
  await sb.from('clients').update({
    ...patch,
    bling_contact_id: contactId,
    bling_fiscal: merged,
    bling_synced_at: new Date().toISOString(),
    bling_error: null,
  }).eq('id', client.id)

  if (result !== 'sem_mudanca') {
    const parts = [
      toBling.length && `enviado ao Bling: ${toBling.join(', ')}`,
      toItadog.length && `trazido do Bling: ${toItadog.join(', ')}`,
    ].filter(Boolean).join(' · ')
    await logSync(sb, {
      entity: 'clientes', action: result === 'ligado' ? 'link' : 'update',
      message: `Cliente ${result === 'ligado' ? 'ligado ao contato já existente no Bling' : 'sincronizado'}: ${merged.nome}${parts ? ` (${parts})` : ''}`,
      local_id: client.id, bling_id: String(contactId),
    })
  }
  return { result }
}

/** Atualiza o painel de clientes (bling_syncs). */
export async function refreshClientsPanel(sb: SB, opts: { pulledAt?: string } = {}) {
  const { count: total } = await sb.from('clients').select('id', { count: 'exact', head: true })
  const { count: linked } = await sb.from('clients').select('id', { count: 'exact', head: true }).not('bling_contact_id', 'is', null)
  const { count: errors } = await sb.from('clients').select('id', { count: 'exact', head: true }).not('bling_error', 'is', null)
  await sb.from('bling_syncs').update({
    status: (errors ?? 0) > 0 ? 'erro' : 'sincronizado',
    total: total ?? 0,
    synced: linked ?? 0,
    errors: errors ?? 0,
    ...(opts.pulledAt ? { last_sync: opts.pulledAt, next_sync: new Date(Date.parse(opts.pulledAt) + 30 * 60 * 1000).toISOString() } : {}),
    error_message: (errors ?? 0) > 0 ? `${errors} cliente(s) com erro ao enviar ao Bling` : null,
    updated_at: new Date().toISOString(),
  }).eq('id', 'clientes')
}

/** Traz correções feitas no Bling: contatos alterados desde a última leitura (com folga de 1 dia). */
export async function pullClients(sb: SB) {
  const { data: panel } = await sb.from('bling_syncs').select('last_sync').eq('id', 'clientes').maybeSingle()
  const since = new Date(Date.parse(panel?.last_sync ?? '2000-01-01') - 24 * 3600 * 1000)
  const sinceStr = since.toISOString().slice(0, 10)
  const startedAt = new Date().toISOString()

  const changedIds: number[] = []
  for (let page = 1; ; page++) {
    const res = await blingFetch<{ data: { id: number }[] }>(sb, `/contatos?pagina=${page}&limite=100&dataAlteracaoInicial=${sinceStr}`)
    changedIds.push(...(res.data ?? []).map(c => c.id))
    if ((res.data ?? []).length < 100) break
  }

  let synced = 0
  if (changedIds.length) {
    const { data: linked } = await sb.from('clients').select('id').in('bling_contact_id', changedIds)
    for (const row of linked ?? []) {
      try {
        const { result } = await syncClient(sb, row.id)
        if (result !== 'sem_mudanca') synced++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        await sb.from('clients').update({ bling_error: msg }).eq('id', row.id)
      }
    }
  }
  await refreshClientsPanel(sb, { pulledAt: startedAt })
  return { alterados_no_bling: changedIds.length, clientes_atualizados: synced }
}
