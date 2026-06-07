/**
 * Camada de dados unificada.
 * - Quando VITE_SUPABASE_URL estiver configurado → lê/escreve no Supabase
 * - Caso contrário → usa dados mock (modo demo/dev)
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Client, Order, Visit, Prospect, Commission, AuditLog, BlingSync, Interaction, Product, User } from '@/types'
import {
  MOCK_CLIENTS, MOCK_ORDERS, MOCK_VISITS, MOCK_PROSPECTS,
  MOCK_COMMISSIONS, MOCK_AUDIT_LOGS, MOCK_BLING_SYNCS,
  MOCK_INTERACTIONS, MOCK_PRODUCTS, MOCK_USERS,
} from '@/mock/data'

// ── helpers ──────────────────────────────────────────────────
function toSnake(obj: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k.replace(/([A-Z])/g, '_$1').toLowerCase(), v
    ])
  )
}

function snakeToCamel<T>(obj: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v
    ])
  ) as T
}

function mapRow<T>(row: Record<string, unknown>): T {
  const c = snakeToCamel<Record<string, unknown>>(row)
  // normalise address JSONB
  if ('address' in c && typeof c.address === 'object' && c.address !== null) {
    const a = c.address as Record<string, unknown>
    c.address = {
      street: a.street, city: a.city, state: a.state,
      zipCode: a.zip_code ?? a.zipCode,
      lat: Number(a.lat), lng: Number(a.lng),
    }
  }
  // normalise items JSONB (already camel if stored as camelCase)
  return c as T
}

// ── PROFILES / USERS ─────────────────────────────────────────
export async function getUsers(): Promise<User[]> {
  if (!isSupabaseConfigured || !supabase) return MOCK_USERS
  const { data } = await supabase.from('profiles').select('*').order('name')
  return (data ?? []).map(r => mapRow<User>(r as Record<string, unknown>))
}

// ── CLIENTS ──────────────────────────────────────────────────
export async function getClients(repId?: string): Promise<Client[]> {
  if (!isSupabaseConfigured || !supabase) {
    return repId ? MOCK_CLIENTS.filter(c => c.repId === repId) : MOCK_CLIENTS
  }
  let q = supabase.from('clients').select('*').order('name')
  if (repId) q = q.eq('rep_id', repId)
  const { data } = await q
  return (data ?? []).map(r => mapRow<Client>(r as Record<string, unknown>))
}

export async function upsertClient(client: Partial<Client>): Promise<Client | null> {
  if (!isSupabaseConfigured || !supabase) return client as Client
  const row = toSnake(client as Record<string, unknown>)
  const { data } = await supabase.from('clients').upsert(row).select().single()
  return data ? mapRow<Client>(data as Record<string, unknown>) : null
}

// ── PRODUCTS ─────────────────────────────────────────────────
export async function getProducts(): Promise<Product[]> {
  if (!isSupabaseConfigured || !supabase) return MOCK_PRODUCTS
  const { data } = await supabase.from('products').select('*').eq('active', true).order('name')
  return (data ?? []).map(r => mapRow<Product>(r as Record<string, unknown>))
}

// ── ORDERS ───────────────────────────────────────────────────
export async function getOrders(repId?: string): Promise<Order[]> {
  if (!isSupabaseConfigured || !supabase) {
    return repId ? MOCK_ORDERS.filter(o => o.repId === repId) : MOCK_ORDERS
  }
  let q = supabase.from('orders').select('*').order('created_at', { ascending: false })
  if (repId) q = q.eq('rep_id', repId)
  const { data } = await q
  return (data ?? []).map(r => mapRow<Order>(r as Record<string, unknown>))
}

export async function upsertOrder(order: Partial<Order>): Promise<Order | null> {
  if (!isSupabaseConfigured || !supabase) return order as Order
  const row = toSnake(order as Record<string, unknown>)
  const { data } = await supabase.from('orders').upsert(row).select().single()
  return data ? mapRow<Order>(data as Record<string, unknown>) : null
}

// ── VISITS ───────────────────────────────────────────────────
export async function getVisits(repId?: string): Promise<Visit[]> {
  if (!isSupabaseConfigured || !supabase) {
    return repId ? MOCK_VISITS.filter(v => v.repId === repId) : MOCK_VISITS
  }
  let q = supabase.from('visits').select('*').order('created_at', { ascending: false })
  if (repId) q = q.eq('rep_id', repId)
  const { data } = await q
  return (data ?? []).map(r => mapRow<Visit>(r as Record<string, unknown>))
}

export async function upsertVisit(visit: Partial<Visit>): Promise<Visit | null> {
  if (!isSupabaseConfigured || !supabase) return visit as Visit
  const row = toSnake(visit as Record<string, unknown>)
  const { data } = await supabase.from('visits').upsert(row).select().single()
  return data ? mapRow<Visit>(data as Record<string, unknown>) : null
}

// ── PROSPECTS ────────────────────────────────────────────────
export async function getProspects(): Promise<Prospect[]> {
  if (!isSupabaseConfigured || !supabase) return MOCK_PROSPECTS
  const { data } = await supabase.from('prospects').select('*').order('created_at', { ascending: false })
  return (data ?? []).map(r => mapRow<Prospect>(r as Record<string, unknown>))
}

export async function upsertProspect(prospect: Partial<Prospect>): Promise<Prospect | null> {
  if (!isSupabaseConfigured || !supabase) return prospect as Prospect
  const row = toSnake(prospect as Record<string, unknown>)
  const { data } = await supabase.from('prospects').upsert(row).select().single()
  return data ? mapRow<Prospect>(data as Record<string, unknown>) : null
}

// ── COMMISSIONS ──────────────────────────────────────────────
export async function getCommissions(repId?: string): Promise<Commission[]> {
  if (!isSupabaseConfigured || !supabase) {
    return repId ? MOCK_COMMISSIONS.filter(c => c.repId === repId) : MOCK_COMMISSIONS
  }
  let q = supabase.from('commissions').select('*').order('created_at', { ascending: false })
  if (repId) q = q.eq('rep_id', repId)
  const { data } = await q
  return (data ?? []).map(r => mapRow<Commission>(r as Record<string, unknown>))
}

// ── AUDIT LOGS ────────────────────────────────────────────────
export async function getAuditLogs(): Promise<AuditLog[]> {
  if (!isSupabaseConfigured || !supabase) return MOCK_AUDIT_LOGS
  const { data } = await supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(200)
  return (data ?? []).map(r => mapRow<AuditLog>(r as Record<string, unknown>))
}

export async function insertAuditLog(log: Omit<AuditLog, 'id'>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  await supabase.from('audit_logs').insert(toSnake(log as Record<string, unknown>))
}

// ── BLING SYNCS ───────────────────────────────────────────────
export async function getBlingsyncs(): Promise<BlingSync[]> {
  if (!isSupabaseConfigured || !supabase) return MOCK_BLING_SYNCS
  const { data } = await supabase.from('bling_syncs').select('*').order('entity')
  return (data ?? []).map(r => mapRow<BlingSync>(r as Record<string, unknown>))
}

// ── INTERACTIONS ──────────────────────────────────────────────
export async function getInteractions(clientId?: string, repId?: string): Promise<Interaction[]> {
  if (!isSupabaseConfigured || !supabase) {
    let result = MOCK_INTERACTIONS
    if (clientId) result = result.filter(i => i.clientId === clientId)
    if (repId) result = result.filter(i => i.repId === repId)
    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }
  let q = supabase.from('interactions').select('*').order('timestamp', { ascending: false })
  if (clientId) q = q.eq('client_id', clientId)
  if (repId) q = q.eq('rep_id', repId)
  const { data } = await q
  return (data ?? []).map(r => mapRow<Interaction>(r as Record<string, unknown>))
}

export async function insertInteraction(interaction: Omit<Interaction, 'id'>): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  await supabase.from('interactions').insert(toSnake(interaction as Record<string, unknown>))
}
