import { canonicalCity } from '@/utils'

/** Validação, formatação e consulta de CNPJ via BrasilAPI (pública, sem chave). */

export interface CnpjData {
  razaoSocial: string
  nomeFantasia: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  cep: string
  telefone: string
  email: string
  situacaoCadastral: string
  dataInicioAtividade: string
  naturezaJuridica: string
  cnae: string        // "6422100 — Bancos múltiplos, com carteira comercial"
  stateRegistration?: string
}

// Cache por sessão — evita chamadas repetidas
const cache = new Map<string, CnpjData>()

export function stripCnpj(v: string): string {
  return v.replace(/\D/g, '')
}

export function formatCnpj(v: string): string {
  const d = stripCnpj(v).slice(0, 14)
  if (d.length <= 2)  return d
  if (d.length <= 5)  return `${d.slice(0,2)}.${d.slice(2)}`
  if (d.length <= 8)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
}

export function validateCnpj(v: string): boolean {
  const d = stripCnpj(v)
  if (d.length !== 14) return false
  if (/^(\d)\1+$/.test(d)) return false   // todos dígitos iguais

  const calc = (len: number) => {
    let sum = 0, weight = len - 7
    for (let i = 0; i < len; i++) {
      sum += parseInt(d[i]) * weight--
      if (weight < 2) weight = 9
    }
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === parseInt(d[12]) && calc(13) === parseInt(d[13])
}

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
  return raw
}

// A BrasilAPI não traz Inscrição Estadual e quase nunca traz e-mail. A CNPJ.ws pública
// traz os dois (CORS liberado, limite de 3 consultas/min). Falha aqui nunca derruba a busca.
async function lookupExtras(cnpj: string, uf: string): Promise<{ email: string; stateRegistration: string }> {
  const empty = { email: '', stateRegistration: '' }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6_000)
  try {
    const res = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, { signal: controller.signal })
    if (!res.ok) return empty
    const j = await res.json()
    const est = j.estabelecimento ?? {}
    const ies: Array<{ inscricao_estadual?: string; ativo?: boolean; estado?: { sigla?: string } }> =
      est.inscricoes_estaduais ?? []
    const ie = ies.find(i => i.ativo && i.estado?.sigla === uf) ?? ies.find(i => i.ativo) ?? ies[0]
    return {
      email: String(est.email ?? '').trim().toLowerCase(),
      stateRegistration: ie?.inscricao_estadual ?? '',
    }
  } catch {
    return empty
  } finally {
    clearTimeout(timeout)
  }
}

export async function lookupCnpj(cnpj: string): Promise<CnpjData> {
  const stripped = stripCnpj(cnpj)
  if (!validateCnpj(stripped)) throw new Error('CNPJ inválido')

  if (cache.has(stripped)) return cache.get(stripped)!

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(
      `https://brasilapi.com.br/api/cnpj/v1/${stripped}`,
      { signal: controller.signal }
    )
    if (res.status === 404) throw new Error('CNPJ não localizado.')
    if (!res.ok)            throw new Error('Não foi possível consultar o CNPJ no momento.')

    const j = await res.json()

    const phone = fmtPhone(j.ddd_telefone_1 ?? j.ddd_telefone_2 ?? '')
    const cnaeStr = j.cnae_fiscal
      ? `${j.cnae_fiscal} — ${j.cnae_fiscal_descricao ?? ''}`
      : ''

    const data: CnpjData = {
      razaoSocial:          j.razao_social   ?? '',
      nomeFantasia:         j.nome_fantasia  ?? '',
      logradouro:           `${j.descricao_tipo_de_logradouro ? j.descricao_tipo_de_logradouro + ' ' : ''}${j.logradouro ?? ''}`.trim(),
      numero:               j.numero         ?? '',
      complemento:          j.complemento    ?? '',
      bairro:               j.bairro         ?? '',
      municipio:            canonicalCity(j.municipio),
      uf:                   j.uf             ?? '',
      cep:                  (j.cep ?? '').replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2'),
      telefone:             phone,
      email:                j.email          ?? '',
      situacaoCadastral:    j.descricao_situacao_cadastral ?? '',
      dataInicioAtividade:  j.data_inicio_atividade        ?? '',
      naturezaJuridica:     j.natureza_juridica            ?? '',
      cnae:                 cnaeStr,
    }

    const extras = await lookupExtras(stripped, data.uf)
    if (!data.email) data.email = extras.email
    data.stateRegistration = extras.stateRegistration

    cache.set(stripped, data)
    return data
  } catch (err) {
    if (err instanceof Error) throw err
    throw new Error('Não foi possível consultar o CNPJ no momento.')
  } finally {
    clearTimeout(timeout)
  }
}
