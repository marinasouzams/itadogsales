/**
 * FONTE ÚNICA DE DADOS — ITADOG SALES
 * Toda comunicação com Supabase passa por aqui.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type {
  Client, Order, Visit, Prospect, Commission,
  AuditLog, Interaction, Product, User, CompanySettings,
} from '@/types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ── snake_case ↔ camelCase ────────────────────────────────────
function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k.replace(/([A-Z])/g, '_$1').toLowerCase(), v,
    ])
  )
}

function mapRow<T>(row: Record<string, unknown>): T {
  const c = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase()), v,
    ])
  ) as Record<string, unknown>

  if (c.address && typeof c.address === 'object') {
    const a = c.address as Record<string, unknown>
    c.address = {
      street: a.street, city: a.city, state: a.state,
      zipCode: a.zip_code ?? a.zipCode,
      lat: Number(a.lat), lng: Number(a.lng),
    }
  }
  return c as T
}

function rows<T>(data: unknown[] | null): T[] {
  return (data ?? []).map(r => mapRow<T>(r as Record<string, unknown>))
}

function db() {
  if (!supabase) throw new Error('Supabase não configurado')
  return supabase
}

// ═══════════════════════════════════════════════════════════
// PROFILES / USERS
// ═══════════════════════════════════════════════════════════
export async function getUsers(): Promise<User[]> {
  const { data } = await db().from('profiles').select('*').order('name')
  return rows<User>(data)
}

export async function getUserById(id: string): Promise<User | null> {
  const { data } = await db().from('profiles').select('*').eq('id', id).single()
  return data ? mapRow<User>(data as Record<string, unknown>) : null
}

export async function updateProfile(id: string, updates: Partial<User>): Promise<void> {
  const row = toSnake(updates as Record<string, unknown>)
  await db().from('profiles').update(row).eq('id', id)
}

/** Cria novo representante via signUp em cliente temporário (sem afetar sessão atual) */
export async function createRepresentante(data: {
  name: string; email: string; password: string
  phone?: string; region?: string; territory?: string[]; meta?: number
}): Promise<{ success: boolean; error?: string; userId?: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return { success: false, error: 'Supabase não configurado' }

  // Cliente temporário sem persistência — não afeta sessão do admin
  const tmp = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, storageKey: `tmp_signup_${Date.now()}` },
  })

  const { data: authData, error } = await tmp.auth.signUp({
    email: data.email,
    password: data.password,
    options: { data: { name: data.name, role: 'rep' } },
  })

  if (error) return { success: false, error: error.message }

  const userId = authData.user?.id
  if (!userId) return { success: false, error: 'Usuário não criado' }

  // Atualiza campos extras no profile (o trigger já cria o básico)
  await db().from('profiles').upsert({
    id: userId,
    name: data.name,
    email: data.email,
    role: 'rep',
    phone: data.phone ?? null,
    region: data.region ?? null,
    territory: data.territory ?? [],
    meta: data.meta ?? null,
    active: true,
  }).eq('id', userId)

  return { success: true, userId }
}

// ═══════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════
export async function getClients(repId?: string): Promise<Client[]> {
  let q = db().from('clients').select('*').order('name')
  if (repId) q = q.eq('rep_id', repId)
  const { data } = await q
  return rows<Client>(data)
}

export async function getClientById(id: string): Promise<Client | null> {
  const { data } = await db().from('clients').select('*').eq('id', id).single()
  return data ? mapRow<Client>(data as Record<string, unknown>) : null
}

export async function createClient(client: Omit<Client, 'id' | 'createdAt' | 'totalOrders' | 'totalRevenue'>): Promise<Client | null> {
  const row = toSnake(client as unknown as Record<string, unknown>)
  row.total_orders = 0
  row.total_revenue = 0
  const { data } = await db().from('clients').insert(row).select().single()
  return data ? mapRow<Client>(data as Record<string, unknown>) : null
}

export async function updateClient(id: string, updates: Partial<Client>): Promise<void> {
  const row = toSnake(updates as Record<string, unknown>)
  await db().from('clients').update(row).eq('id', id)
}

// ═══════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════
export async function getProducts(activeOnly = true): Promise<Product[]> {
  let q = db().from('products').select('*').order('name')
  if (activeOnly) q = q.eq('active', true)
  const { data } = await q
  return rows<Product>(data)
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<Product | null> {
  const row = toSnake(product as unknown as Record<string, unknown>)
  const { data } = await db().from('products').insert(row).select().single()
  return data ? mapRow<Product>(data as Record<string, unknown>) : null
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
  const row = toSnake(updates as Record<string, unknown>)
  await db().from('products').update(row).eq('id', id)
}

// ═══════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════
export async function getOrders(repId?: string): Promise<Order[]> {
  let q = db().from('orders').select('*').order('created_at', { ascending: false })
  if (repId) q = q.eq('rep_id', repId)
  const { data } = await q
  return rows<Order>(data)
}

export async function getOrderById(id: string): Promise<Order | null> {
  const { data } = await db().from('orders').select('*').eq('id', id).single()
  return data ? mapRow<Order>(data as Record<string, unknown>) : null
}

export async function createOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order | null> {
  const row = toSnake(order as unknown as Record<string, unknown>)
  const { data } = await db().from('orders').insert(row).select().single()
  if (!data) return null
  const created = mapRow<Order>(data as Record<string, unknown>)
  // Atualiza stats do cliente
  try {
    await db().from('clients')
      .update({
        total_orders: (created as unknown as Record<string, unknown>).totalOrders as number + 1 || 1,
        last_order: new Date().toISOString().slice(0, 10),
      })
      .eq('id', order.clientId)
  } catch { /* silencioso */ }
  return created
}

export async function updateOrderStatus(id: string, status: Order['status']): Promise<void> {
  await db().from('orders').update({ status }).eq('id', id)
}

// ═══════════════════════════════════════════════════════════
// VISITS
// ═══════════════════════════════════════════════════════════
export async function getVisits(repId?: string): Promise<Visit[]> {
  let q = db().from('visits').select('*').order('created_at', { ascending: false })
  if (repId) q = q.eq('rep_id', repId)
  const { data } = await q
  return rows<Visit>(data)
}

export async function createVisit(visit: Omit<Visit, 'id' | 'createdAt'>): Promise<Visit | null> {
  const row = toSnake(visit as unknown as Record<string, unknown>)
  const { data } = await db().from('visits').insert(row).select().single()
  return data ? mapRow<Visit>(data as Record<string, unknown>) : null
}

export async function updateVisit(id: string, updates: Partial<Visit>): Promise<Visit | null> {
  const row = toSnake(updates as Record<string, unknown>)
  const { data } = await db().from('visits').update(row).eq('id', id).select().single()
  if (!data) return null
  const updated = mapRow<Visit>(data as Record<string, unknown>)
  // Atualiza last_visit do cliente se checkout
  if (updates.status === 'concluida' && (updates as Visit).clientId) {
    try {
      await db().from('clients')
        .update({ last_visit: new Date().toISOString().slice(0, 10) })
        .eq('id', (updates as Visit).clientId)
    } catch { /* silencioso */ }
  }
  return updated
}

// ═══════════════════════════════════════════════════════════
// PROSPECTS
// ═══════════════════════════════════════════════════════════
export async function getProspects(): Promise<Prospect[]> {
  const { data } = await db().from('prospects').select('*').order('created_at', { ascending: false })
  return rows<Prospect>(data)
}

export async function getProspectById(id: string): Promise<Prospect | null> {
  const { data } = await db().from('prospects').select('*').eq('id', id).single()
  return data ? mapRow<Prospect>(data as Record<string, unknown>) : null
}

export async function createProspect(prospect: Omit<Prospect, 'id' | 'createdAt'>): Promise<Prospect | null> {
  const row = toSnake(prospect as unknown as Record<string, unknown>)
  const { data } = await db().from('prospects').insert(row).select().single()
  return data ? mapRow<Prospect>(data as Record<string, unknown>) : null
}

export async function updateProspect(id: string, updates: Partial<Prospect>): Promise<void> {
  const row = toSnake(updates as Record<string, unknown>)
  await db().from('prospects').update(row).eq('id', id)
}

// ═══════════════════════════════════════════════════════════
// COMMISSIONS
// ═══════════════════════════════════════════════════════════
export async function getCommissions(repId?: string): Promise<Commission[]> {
  let q = db().from('commissions').select('*').order('created_at', { ascending: false })
  if (repId) q = q.eq('rep_id', repId)
  const { data } = await q
  return rows<Commission>(data)
}

export async function createCommission(commission: Omit<Commission, 'id' | 'createdAt'>): Promise<void> {
  const row = toSnake(commission as unknown as Record<string, unknown>)
  await db().from('commissions').insert(row)
}

// ═══════════════════════════════════════════════════════════
// INTERACTIONS
// ═══════════════════════════════════════════════════════════
export async function getInteractions(clientId?: string, repId?: string): Promise<Interaction[]> {
  let q = db().from('interactions').select('*').order('timestamp', { ascending: false })
  if (clientId) q = q.eq('client_id', clientId)
  if (repId) q = q.eq('rep_id', repId)
  const { data } = await q
  return rows<Interaction>(data)
}

export async function createInteraction(interaction: Omit<Interaction, 'id'>): Promise<void> {
  const row = toSnake(interaction as unknown as Record<string, unknown>)
  await db().from('interactions').insert(row)
}

// ═══════════════════════════════════════════════════════════
// AUDIT LOGS
// ═══════════════════════════════════════════════════════════
export async function getAuditLogs(): Promise<AuditLog[]> {
  const { data } = await db()
    .from('audit_logs').select('*')
    .order('timestamp', { ascending: false })
    .limit(300)
  return rows<AuditLog>(data)
}

export async function logAudit(log: Omit<AuditLog, 'id'>): Promise<void> {
  try {
    const row = toSnake(log as unknown as Record<string, unknown>)
    await db().from('audit_logs').insert(row)
  } catch { /* silencioso — auditoria não deve travar fluxo */ }
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD — agregados
// ═══════════════════════════════════════════════════════════
export async function getDashboardKPIs() {
  const [
    { data: orders },
    { data: visits },
    { data: clients },
    { data: commissions },
  ] = await Promise.all([
    db().from('orders').select('total, status, sync_status'),
    db().from('visits').select('status, result'),
    db().from('clients').select('status'),
    db().from('commissions').select('amount, status'),
  ])

  const allOrders = (orders ?? []) as { total: number; status: string; sync_status: string }[]
  const allVisits = (visits ?? []) as { status: string; result: string }[]
  const allClients = (clients ?? []) as { status: string }[]
  const allComms = (commissions ?? []) as { amount: number; status: string }[]

  const faturamento = allOrders
    .filter(o => ['faturado', 'aprovado', 'pronto_entrega'].includes(o.status))
    .reduce((s, o) => s + Number(o.total), 0)

  const pedidos = allOrders.length
  const visitas = allVisits.filter(v => v.status === 'concluida').length
  const conversao = pedidos > 0
    ? Math.round(allOrders.filter(o => ['aprovado', 'faturado'].includes(o.status)).length / pedidos * 100)
    : 0
  const ticketMedio = pedidos > 0 ? faturamento / pedidos : 0
  const clientesAtivos = allClients.filter(c => c.status === 'ativo').length
  const comissoesPendentes = allComms
    .filter(c => c.status === 'prevista' || c.status === 'aprovada')
    .reduce((s, c) => s + Number(c.amount), 0)

  return { faturamento, pedidos, visitas, conversao, ticketMedio, clientesAtivos, comissoesPendentes }
}

export async function getMonthlyRevenue() {
  const { data } = await db()
    .from('orders')
    .select('created_at, total, status')
    .gte('created_at', new Date(new Date().getFullYear(), 0, 1).toISOString())
    .in('status', ['aprovado', 'faturado', 'pronto_entrega'])
    .order('created_at')

  const monthLabels = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const map: Record<number, number> = {}
  ;(data ?? []).forEach((o: { created_at: string; total: number }) => {
    const m = new Date(o.created_at).getMonth()
    map[m] = (map[m] ?? 0) + Number(o.total)
  })

  return monthLabels.map((month, i) => ({
    month,
    faturamento: map[i] ?? 0,
    meta: 180000, // meta padrão — ajustável
  }))
}

export async function getRepRanking() {
  const [{ data: reps }, { data: orders }, { data: visits }] = await Promise.all([
    db().from('profiles').select('id, name, meta').eq('role', 'rep').eq('active', true),
    db().from('orders').select('rep_id, total, status').in('status', ['aprovado', 'faturado', 'pronto_entrega']),
    db().from('visits').select('rep_id, status, result').eq('status', 'concluida'),
  ])

  return (reps ?? []).map((r: { id: string; name: string; meta: number }) => {
    const repOrders = (orders ?? []).filter((o: { rep_id: string }) => o.rep_id === r.id)
    const repVisits = (visits ?? []).filter((v: { rep_id: string }) => v.rep_id === r.id)
    const faturamento = repOrders.reduce((s: number, o: { total: number }) => s + Number(o.total), 0)
    const positivos = repVisits.filter((v: { result: string }) => v.result === 'positivo').length
    const conversao = repVisits.length > 0 ? Math.round(positivos / repVisits.length * 100) : 0
    return {
      id: r.id,
      name: r.name.split(' ').slice(0, 2).join(' '),
      faturamento,
      meta: r.meta ?? 180000,
      visitas: repVisits.length,
      conversao,
    }
  }).sort((a, b) => b.faturamento - a.faturamento)
}

export async function getVisitsByDay() {
  const { data } = await db()
    .from('visits')
    .select('created_at')
    .eq('status', 'concluida')
    .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())

  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const map: Record<number, number> = {}
  ;(data ?? []).forEach((v: { created_at: string }) => {
    const d = new Date(v.created_at).getDay()
    map[d] = (map[d] ?? 0) + 1
  })
  return days.map((day, i) => ({ day, visitas: map[i] ?? 0 }))
}

// ═══════════════════════════════════════════════════════════
// COMPANY SETTINGS
// ═══════════════════════════════════════════════════════════
export async function getCompanySettings(): Promise<CompanySettings> {
  const { data } = await db().from('company_settings').select('*').eq('id', 1).single()
  if (!data) return { id: 1, defaultCommissionRate: 3, defaultMonthlyGoal: 180000, companyName: 'ITADOG', updatedAt: new Date().toISOString() }
  return mapRow<CompanySettings>(data as Record<string, unknown>)
}

export async function updateCompanySettings(updates: Partial<Omit<CompanySettings, 'id' | 'updatedAt'>>): Promise<void> {
  const row = toSnake(updates as Record<string, unknown>)
  await db().from('company_settings').update(row).eq('id', 1)
}

// ═══════════════════════════════════════════════════════════
// PRODUCTS — CRUD COMPLETO
// ═══════════════════════════════════════════════════════════
export async function getAllProducts(): Promise<Product[]> {
  const { data } = await db().from('products').select('*').order('name')
  return rows<Product>(data)
}

export async function toggleProductActive(id: string, active: boolean): Promise<void> {
  await db().from('products').update({ active }).eq('id', id)
}
