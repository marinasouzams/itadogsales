/**
 * FONTE ÚNICA DE DADOS — ITADOG SALES
 * Toda comunicação com Supabase passa por aqui.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type {
  Client, ClientApprovalStatus, Order, Visit, Prospect, ProspectStage, ProspectFollowup, FollowupChannel, Commission,
  AuditLog, Interaction, Product, User, CompanySettings,
  ProductCategory, ProductSubcategory,
  ProductAttribute, ProductAttributeValue, ProductAttributeAssignment,
  RouteSession, CreditScore, FinancialReceivable, ReceivableStatus, WriteOffReason,
  Task, TaskStatus, TaskPriority, TaskRecurrence, TaskComment, Region,
} from '@/types'
import { REVENUE_STATUSES, saleDateOf, financialBaseDate } from '@/types'

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
      ...a,
      zipCode: a.zipCode ?? a.zip_code,
      lat: Number(a.lat ?? 0), lng: Number(a.lng ?? 0),
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
  const { data, error } = await db().from('clients').insert(row).select().single()
  if (error) {
    if (error.code === '23505' && error.message.includes('cnpj')) {
      throw new Error('Já existe um cliente cadastrado com este CNPJ.')
    }
    throw error
  }
  const created = data ? mapRow<Client>(data as Record<string, unknown>) : null
  if (created) {
    try {
      await createNotification({ type: 'new_client', title: 'Novo Cliente Cadastrado', description: created.name, entity: 'Client', entityId: created.id })
    } catch { /* silencioso */ }
  }
  return created
}

export async function updateClient(id: string, updates: Partial<Client>): Promise<void> {
  const row = toSnake(updates as Record<string, unknown>)
  const { error } = await db().from('clients').update(row).eq('id', id)
  if (error) {
    if (error.code === '23505' && error.message.includes('cnpj')) {
      throw new Error('Já existe um cliente cadastrado com este CNPJ.')
    }
    throw error
  }
}

export async function deleteClient(id: string): Promise<void> {
  await db().from('clients').delete().eq('id', id)
}

/** Aprova, devolve para correção ou reprova um cadastro de cliente pendente de revisão.
 *  'devolvido' e 'reprovado' exigem motivo — validado nas telas antes de chamar esta função. */
export async function reviewClient(
  id: string,
  decision: Exclude<ClientApprovalStatus, 'pendente'>,
  reason: string | undefined,
  userId?: string,
): Promise<void> {
  const { error } = await db().from('clients').update({
    approval_status: decision,
    approval_reason: reason ?? null,
    reviewed_by: userId ?? null,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
}

// ═══════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════
/** Garante que campos numéricos do produto sejam sempre number, não string.
 *  O Postgres retorna `numeric` como string no JS — isso causava crash em
 *  Intl.NumberFormat no Safari iOS. */
function parseProduct(r: Record<string, unknown>): Product {
  const p = mapRow<Product>(r)
  return {
    ...p,
    price: typeof p.price === 'string' ? parseFloat(p.price) || 0 : (p.price ?? 0),
    stock: typeof p.stock === 'string' ? parseInt(p.stock, 10) || 0  : (p.stock ?? 0),
  }
}

export async function getProducts(activeOnly = true): Promise<Product[]> {
  let q = db().from('products').select('*').order('code')
  if (activeOnly) q = q.eq('active', true)
  const { data } = await q
  return (data ?? []).map(r => parseProduct(r as Record<string, unknown>))
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<Product | null> {
  const row = toSnake(product as unknown as Record<string, unknown>)
  const { data } = await db().from('products').insert(row).select().single()
  return data ? parseProduct(data as Record<string, unknown>) : null
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
  const row = toSnake(updates as Record<string, unknown>)
  await db().from('products').update(row).eq('id', id)
}

// ═══════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════
export async function getOrders(repId?: string): Promise<Order[]> {
  let q = db().from('orders').select('*').eq('is_deleted', false).order('created_at', { ascending: false })
  if (repId) q = q.eq('rep_id', repId)
  const { data } = await q
  return rows<Order>(data)
}

export async function getDeletedOrders(): Promise<Order[]> {
  const { data } = await db()
    .from('orders')
    .select('*')
    .eq('is_deleted', true)
    .order('deleted_at', { ascending: false })
  return rows<Order>(data)
}

export async function getOrderById(id: string): Promise<Order | null> {
  const { data } = await db().from('orders').select('*').eq('id', id).single()
  return data ? mapRow<Order>(data as Record<string, unknown>) : null
}

/** Recalcula total_orders/total_revenue/last_order do cliente DIRETO da
 *  tabela de pedidos (fonte da verdade), em vez de somar/subtrair em cima
 *  do valor salvo. Evita o desalinhamento que ocorria quando um pedido era
 *  excluído ou tinha a data de venda/valor editados sem esse recálculo. */
async function recalculateClientStats(clientId: string): Promise<void> {
  if (!clientId) return
  try {
    const { data } = await db()
      .from('orders')
      .select('total, sale_date')
      .eq('client_id', clientId)
      .not('is_deleted', 'is', true)

    const list = (data ?? []) as { total: number; sale_date: string | null }[]
    const totalOrders = list.length
    const totalRevenue = list.reduce((s, o) => s + (Number(o.total) || 0), 0)
    const lastOrder = list.reduce<string | null>((max, o) => (o.sale_date && (!max || o.sale_date > max) ? o.sale_date : max), null)

    await db().from('clients')
      .update({ total_orders: totalOrders, total_revenue: totalRevenue, last_order: lastOrder })
      .eq('id', clientId)
  } catch { /* silencioso — não deve travar o fluxo do pedido */ }
}

export async function softDeleteOrder(
  id: string,
  deletedBy: string,
  deleteReason: string,
  _previousStatus: string
): Promise<void> {
  const order = await getOrderById(id)
  const { error } = await db().from('orders').update({
    is_deleted: true,
    deleted_at: new Date().toISOString(),
    deleted_by: deletedBy,
    delete_reason: deleteReason,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  if (order) await recalculateClientStats(order.clientId)
}

export async function restoreOrder(id: string, restoredBy: string): Promise<void> {
  const order = await getOrderById(id)
  const { error } = await db().from('orders').update({
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  if (order) await recalculateClientStats(order.clientId)
}

export async function permanentDeleteOrder(id: string): Promise<void> {
  const order = await getOrderById(id)
  const { error } = await db().from('orders').delete().eq('id', id)
  if (error) throw new Error(error.message)
  if (order) await recalculateClientStats(order.clientId)
}

export async function createOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order | null> {
  const row = toSnake(order as unknown as Record<string, unknown>)
  const { data } = await db().from('orders').insert(row).select().single()
  if (!data) return null
  const created = mapRow<Order>(data as Record<string, unknown>)
  await recalculateClientStats(order.clientId)
  return created
}

export async function updateOrderStatus(id: string, status: Order['status']): Promise<void> {
  await db().from('orders').update({ status }).eq('id', id)
}

export async function updateOrderAdmin(id: string, updates: Partial<Order>): Promise<void> {
  const row = toSnake(updates as Record<string, unknown>)
  const before = (updates.total !== undefined || updates.saleDate !== undefined || updates.clientId !== undefined)
    ? await getOrderById(id)
    : null
  await db().from('orders').update(row).eq('id', id)
  if (before) {
    await recalculateClientStats(before.clientId)
    if (updates.clientId && updates.clientId !== before.clientId) {
      await recalculateClientStats(updates.clientId)
    }
  }
}

export async function generateOrder(id: string, userName: string): Promise<void> {
  await db().from('orders').update({
    status: 'generated',
    generated_at: new Date().toISOString(),
    generated_by: userName,
  }).eq('id', id)
  try {
    const order = await getOrderById(id)
    if (order) {
      await createNotification({ type: 'new_order', title: 'Pedido Gerado', description: `Pedido ${order.number}`, entity: 'Order', entityId: id })
    }
  } catch { /* silencioso */ }
}

export async function sendToSeparation(id: string): Promise<void> {
  await db().from('orders').update({ status: 'pending_separation' }).eq('id', id)
}

export async function markAsSeparation(id: string): Promise<void> {
  await db().from('orders').update({ status: 'separation' }).eq('id', id)
}

export async function invoiceOrder(
  order: Order,
  userName: string,
): Promise<void> {
  await db().from('orders').update({
    status: 'invoiced_ready_to_ship',
    invoiced_at: new Date().toISOString(),
    invoiced_by: userName,
  }).eq('id', order.id)
  // A comissão NÃO é gerada aqui — quem controla é o momento configurado
  // (commissionTiming) no fluxo do pedido. Ver generateOrderCommission().
}

/** True se já existe comissão (não cancelada) vinculada ao pedido. */
export async function hasOrderCommission(orderId: string): Promise<boolean> {
  const { data } = await db()
    .from('commissions')
    .select('id')
    .eq('order_id', orderId)
    .neq('status', 'cancelada')
    .limit(1)
  return (data?.length ?? 0) > 0
}

/** Gera a comissão prevista do pedido (idempotente — não duplica).
 *  Pedidos de troca nunca geram comissão. */
export async function generateOrderCommission(order: Order, commissionRate: number): Promise<boolean> {
  if (order.orderType === 'troca') return false
  if (await hasOrderCommission(order.id)) return false
  // Mês de referência da comissão = mês da DATA DA VENDA (retroativos contam no mês certo)
  const referenceMonth = saleDateOf(order).slice(0, 7)
  await createCommission({
    repId: order.repId,
    repName: order.repName,
    orderId: order.id,
    orderNumber: order.number,
    clientName: order.clientName,
    clientId: order.clientId,
    orderTotal: order.total,
    rate: commissionRate,
    amount: order.total * (commissionRate / 100),
    status: 'prevista',
    referenceMonth,
  })
  return true
}

export async function deliverOrder(id: string, userName: string, notes?: string): Promise<void> {
  await db().from('orders').update({
    status: 'delivered',
    delivered_at: new Date().toISOString(),
    delivered_by: userName,
    delivered_notes: notes ?? null,
  }).eq('id', id)
}

export async function deleteOrder(id: string): Promise<void> {
  const { error } = await db().from('orders').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function updateOrderRep(
  id: string,
  updates: {
    items: Order['items']
    subtotal: number
    discount: number
    discountType?: 'percent' | 'fixed'
    discountValue?: number
    total: number
    paymentTerms?: string
    paymentMethod?: string
    checks?: Order['checks']
    deliveryDate?: string
    partialPaymentAmount?: number
    partialPaymentDate?: string
    partialPaymentNotes?: string
    notes?: string
    status?: Order['status']
    orderType?: Order['orderType']
    exchangeReason?: string
  }
): Promise<void> {
  const row = toSnake(updates as unknown as Record<string, unknown>)
  const { error } = await db().from('orders').update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function registerPartialDelivery(
  order: Order,
  deliveredItems: Array<{ productId: string; deliveredQty: number }>,
  userName: string,
): Promise<'partial_delivery' | 'delivered'> {
  // Atualiza deliveredQty em cada item no JSONB
  const updatedItems = order.items.map(item => {
    const match = deliveredItems.find(d => d.productId === item.productId)
    if (!match) return item
    return { ...item, deliveredQty: match.deliveredQty }
  })

  // Calcula total pendente
  const totalPending = updatedItems.reduce((sum, item) => {
    const qty = item.quantity
    const delivered = item.deliveredQty ?? 0
    return sum + Math.max(0, qty - delivered)
  }, 0)

  const newStatus: 'partial_delivery' | 'delivered' = totalPending === 0 ? 'delivered' : 'partial_delivery'
  const now = new Date().toISOString()

  const updatePayload: Record<string, unknown> = {
    items: updatedItems,
    status: newStatus,
  }
  if (newStatus === 'delivered') {
    updatePayload.delivered_at = now
    updatePayload.delivered_by = userName
  }

  const { error } = await db().from('orders').update(updatePayload).eq('id', order.id)
  if (error) throw new Error(error.message)

  return newStatus
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

export async function getVisitsForProspect(prospectId: string): Promise<Visit[]> {
  const { data } = await db().from('visits').select('*').eq('prospect_id', prospectId).order('created_at', { ascending: false })
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
  const { data } = await db().from('prospects').select('*, regions(name)').order('created_at', { ascending: false })
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...mapRow<Prospect>(r),
    regionName: (r['regions'] as Record<string, unknown> | null)?.['name'] as string | undefined,
  }))
}

export async function getProspectById(id: string): Promise<Prospect | null> {
  const { data } = await db().from('prospects').select('*, regions(name)').eq('id', id).single()
  if (!data) return null
  return {
    ...mapRow<Prospect>(data as Record<string, unknown>),
    regionName: (data['regions'] as Record<string, unknown> | null)?.['name'] as string | undefined,
  }
}

// ── REGIONS ────────────────────────────────────────────────────
export async function getRegions(): Promise<Region[]> {
  const { data } = await db().from('regions').select('*').order('name')
  return rows<Region>(data)
}

export async function createRegion(name: string): Promise<Region | null> {
  const { data } = await db().from('regions').insert({ name }).select().single()
  return data ? mapRow<Region>(data as Record<string, unknown>) : null
}

export async function updateRegion(id: string, name: string): Promise<void> {
  await db().from('regions').update({ name }).eq('id', id)
}

export async function deleteRegion(id: string): Promise<void> {
  const { error } = await db().from('regions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function createProspect(prospect: Omit<Prospect, 'id' | 'createdAt'>): Promise<Prospect | null> {
  const { regionName: _regionName, ...rest } = prospect
  const row = toSnake(rest as unknown as Record<string, unknown>)
  const { data } = await db().from('prospects').insert(row).select().single()
  return data ? mapRow<Prospect>(data as Record<string, unknown>) : null
}

export async function updateProspect(id: string, updates: Partial<Prospect>): Promise<void> {
  const { regionName: _regionName, ...rest } = updates
  const row = toSnake(rest as Record<string, unknown>)
  await db().from('prospects').update(row).eq('id', id)
}

// ── CRM: etapas do funil, follow-ups e conversão ──────────────
export async function moveProspectStage(
  id: string,
  stage: ProspectStage,
  extra?: { lostReason?: string; lostReasonDetail?: string },
): Promise<void> {
  const row: Record<string, unknown> = { stage, updated_at: new Date().toISOString() }
  if (stage === 'perdido') {
    row.lost_reason = extra?.lostReason ?? null
    row.lost_reason_detail = extra?.lostReasonDetail ?? null
  } else {
    row.lost_reason = null
    row.lost_reason_detail = null
  }
  const { error } = await db().from('prospects').update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getProspectFollowups(prospectId: string): Promise<ProspectFollowup[]> {
  const { data } = await db()
    .from('prospect_followups')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('contact_date', { ascending: false })
    .order('created_at', { ascending: false })
  return rows<ProspectFollowup>(data)
}

export interface RegisterFollowupInput {
  prospectId: string
  repId: string
  repName: string
  contactDate: string
  channel: FollowupChannel
  result?: string
  notes?: string
  nextAction?: string
  nextActionDate?: string
}

/** Registra um follow-up e avança o contador de tentativas + próxima ação do
 *  prospect. Não mexe na etapa do funil — isso é decisão explícita do
 *  representante via moveProspectStage. Retorna as tentativas atualizadas
 *  para a tela decidir se dispara o alerta da 5ª tentativa. */
export async function registerFollowup(input: RegisterFollowupInput): Promise<{ attempts: number }> {
  const row = toSnake(input as unknown as Record<string, unknown>)
  const { error: insErr } = await db().from('prospect_followups').insert(row)
  if (insErr) throw new Error(insErr.message)

  const { data: current } = await db().from('prospects').select('attempts').eq('id', input.prospectId).single()
  const attempts = ((current?.attempts as number) ?? 0) + 1

  const { error: updErr } = await db().from('prospects').update({
    attempts,
    last_contact_date: input.contactDate,
    next_action: input.nextAction ?? null,
    next_action_date: input.nextActionDate ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', input.prospectId)
  if (updErr) throw new Error(updErr.message)

  return { attempts }
}

/** Converte um prospect em cliente reaproveitando o cadastro já existente —
 *  não exige novo preenchimento. Cliente nasce com approvalStatus 'pendente',
 *  seguindo o mesmo fluxo de aprovação de qualquer cadastro feito por rep. */
export async function convertProspectToClient(prospect: Prospect, userId?: string): Promise<Client | null> {
  const cnpjDigits = (prospect.cnpj ?? '').replace(/\D/g, '')
  const client = await createClient({
    name: prospect.name,
    tradeName: prospect.tradeName || undefined,
    cnpj: cnpjDigits || undefined,
    type: 'revendedor',
    repId: prospect.repId || userId || '',
    address: {
      street: '', city: prospect.city, state: prospect.state, zipCode: '', lat: 0, lng: 0,
    },
    phone: prospect.phone,
    email: prospect.email || undefined,
    status: 'ativo',
    approvalStatus: 'pendente',
    segment: prospect.segment,
    priority: 'media',
    notes: prospect.notes || undefined,
    buyerName: prospect.contact || undefined,
    buyerWhatsapp: prospect.whatsapp || undefined,
  } as Parameters<typeof createClient>[0])

  if (client) {
    await db().from('prospects').update({
      stage: 'pedido_realizado',
      converted_client_id: client.id,
      converted_at: new Date().toISOString(),
      status: 'convertido',
      updated_at: new Date().toISOString(),
    }).eq('id', prospect.id)
  }
  return client
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

/** Log de auditoria de uma entidade específica (ex.: timeline de um prospect) —
 *  consulta direta, não depende do limite de 300 registros de getAuditLogs(). */
export async function getAuditLogsForEntity(entity: string, entityId: string): Promise<AuditLog[]> {
  const { data } = await db()
    .from('audit_logs').select('*')
    .eq('entity', entity).eq('entity_id', entityId)
    .order('timestamp', { ascending: false })
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

// Retorna o range do mês corrente no formato YYYY-MM-DD
function currentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to:   `${y}-${pad(m + 1)}-${new Date(y, m + 1, 0).getDate()}`,
  }
}

// Retorna a data comercial de um pedido: sale_date > created_at
function orderDateKey(o: { sale_date: string | null; created_at: string }): string {
  return (o.sale_date ?? o.created_at).slice(0, 10)
}

export async function getDashboardKPIs(from?: string, to?: string) {
  const range = from && to ? { from, to } : currentMonthRange()

  const [
    { data: orders },
    { data: visits },
    { data: clients },
    { data: commissions },
  ] = await Promise.all([
    db().from('orders').select('total, status, sync_status, sale_date, created_at, order_type').eq('is_deleted', false),
    db().from('visits').select('status, result'),
    db().from('clients').select('status'),
    db().from('commissions').select('amount, status'),
  ])

  type ORow = { total: number; status: string; sync_status: string; sale_date: string | null; created_at: string; order_type: string | null }
  const allOrders = (orders ?? []) as ORow[]

  const periodOrders = allOrders.filter(o => {
    const d = orderDateKey(o)
    return d >= range.from && d <= range.to
  })

  const allVisits  = (visits ?? [])      as { status: string; result: string }[]
  const allClients = (clients ?? [])     as { status: string }[]
  const allComms   = (commissions ?? []) as { amount: number; status: string }[]

  // Trocas nunca entram no faturamento/metas
  const vendas    = periodOrders.filter(o => (o.order_type ?? 'venda') !== 'troca')
  const faturados = vendas.filter(o => REVENUE_STATUSES.includes(o.status as Order['status']))
  const faturamento = faturados.reduce((s, o) => s + Number(o.total), 0)

  const trocasMes = periodOrders.filter(o => o.order_type === 'troca').length

  const pedidos = vendas.length
  const visitas = allVisits.filter(v => v.status === 'concluida').length
  const conversao = pedidos > 0 ? Math.round(faturados.length / pedidos * 100) : 0
  const ticketMedio = faturados.length > 0 ? faturamento / faturados.length : 0
  const clientesAtivos = allClients.filter(c => c.status === 'ativo').length
  const comissoesPendentes = allComms
    .filter(c => c.status === 'prevista' || c.status === 'aprovada')
    .reduce((s, c) => s + Number(c.amount), 0)

  return { faturamento, pedidos, visitas, conversao, ticketMedio, clientesAtivos, comissoesPendentes, trocasMes }
}

export async function getMonthlyRevenue() {
  // Atribui o faturamento ao mês da DATA DA VENDA (sale_date), não da data de
  // cadastro — pedidos retroativos aparecem no mês correto.
  const { data } = await db()
    .from('orders')
    .select('sale_date, created_at, total, status, order_type')
    .in('status', REVENUE_STATUSES)
    .eq('is_deleted', false)
    .neq('order_type', 'troca')

  const year = new Date().getFullYear()
  const monthLabels = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const map: Record<number, number> = {}
  ;(data ?? []).forEach((o: { sale_date: string | null; created_at: string; total: number; order_type: string | null }) => {
    const d = (o.sale_date ?? o.created_at)   // 'YYYY-MM-DD' ou ISO
    if (Number(d.slice(0, 4)) !== year) return
    const m = Number(d.slice(5, 7)) - 1
    map[m] = (map[m] ?? 0) + Number(o.total)
  })

  return monthLabels.map((month, i) => ({
    month,
    faturamento: map[i] ?? 0,
    meta: 180000, // meta padrão — ajustável
  }))
}

export async function getRepRanking(from?: string, to?: string) {
  const range = from && to ? { from, to } : currentMonthRange()

  const [{ data: reps }, { data: orders }, { data: visits }, { data: settingsRow }] = await Promise.all([
    db().from('profiles').select('id, name, meta').eq('role', 'rep').eq('active', true),
    db().from('orders').select('rep_id, total, status, sale_date, created_at, order_type').in('status', REVENUE_STATUSES).eq('is_deleted', false).neq('order_type', 'troca'),
    db().from('visits').select('rep_id, status, result').eq('status', 'concluida'),
    db().from('company_settings').select('default_monthly_goal').eq('id', 1).single(),
  ])

  const defaultGoal = Number((settingsRow as Record<string,unknown> | null)?.['default_monthly_goal'] ?? 180000)

  type ORow = { rep_id: string; total: number; status: string; sale_date: string | null; created_at: string }
  // Filtra pela competência antes de agrupar por rep
  const periodOrders = (orders ?? [] as ORow[]).filter((o: ORow) => {
    const d = orderDateKey(o)
    return d >= range.from && d <= range.to
  })

  return (reps ?? []).map((r: { id: string; name: string; meta: number }) => {
    const repOrders = periodOrders.filter((o: ORow) => o.rep_id === r.id)
    const repVisits = (visits ?? []).filter((v: { rep_id: string }) => v.rep_id === r.id)
    const faturamento = repOrders.reduce((s: number, o: ORow) => s + Number(o.total), 0)
    const positivos = repVisits.filter((v: { result: string }) => v.result === 'positivo').length
    const conversao = repVisits.length > 0 ? Math.round(positivos / repVisits.length * 100) : 0
    return {
      id: r.id,
      name: r.name.split(' ').slice(0, 2).join(' '),
      faturamento,
      meta: r.meta ?? defaultGoal,
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
  if (!data) return { id: 1, defaultCommissionRate: 3, defaultMonthlyGoal: 180000, companyName: 'ITADOG', allowSalesWithoutStock: false, commissionTiming: 'separation', monthlyNewClientsGoal: 10, updatedAt: new Date().toISOString() }
  return mapRow<CompanySettings>(data as Record<string, unknown>)
}

export async function updateCompanySettings(updates: Partial<Omit<CompanySettings, 'id' | 'updatedAt'>>): Promise<void> {
  const row = toSnake(updates as Record<string, unknown>)
  await db().from('company_settings').update(row).eq('id', 1)
}

// ═══════════════════════════════════════════════════════════
// PRODUCT CATEGORIES
// ═══════════════════════════════════════════════════════════
export async function getProductCategories(): Promise<ProductCategory[]> {
  const { data } = await db().from('product_categories').select('*').order('name')
  return rows<ProductCategory>(data)
}

export async function createProductCategory(cat: { name: string; description?: string }): Promise<ProductCategory | null> {
  const { data } = await db().from('product_categories').insert({ name: cat.name, description: cat.description ?? null }).select().single()
  return data ? mapRow<ProductCategory>(data as Record<string, unknown>) : null
}

export async function updateProductCategory(id: string, updates: Partial<Pick<ProductCategory, 'name' | 'description' | 'active'>>): Promise<void> {
  await db().from('product_categories').update(updates).eq('id', id)
}

// ═══════════════════════════════════════════════════════════
// PRODUCT SUBCATEGORIES
// ═══════════════════════════════════════════════════════════
export async function getProductSubcategories(categoryId?: string): Promise<ProductSubcategory[]> {
  let q = db()
    .from('product_subcategories')
    .select('*, product_categories(name)')
    .order('name')
  if (categoryId) q = q.eq('category_id', categoryId)
  const { data } = await q
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...mapRow<ProductSubcategory>(r),
    categoryName: (r['product_categories'] as Record<string, unknown> | null)?.['name'] as string | undefined,
  }))
}

export async function createProductSubcategory(sub: { categoryId: string; name: string; description?: string }): Promise<ProductSubcategory | null> {
  const { data } = await db().from('product_subcategories')
    .insert({ category_id: sub.categoryId, name: sub.name, description: sub.description ?? null })
    .select().single()
  return data ? mapRow<ProductSubcategory>(data as Record<string, unknown>) : null
}

export async function updateProductSubcategory(id: string, updates: Partial<Pick<ProductSubcategory, 'name' | 'description' | 'active'>>): Promise<void> {
  await db().from('product_subcategories').update(updates).eq('id', id)
}

// ═══════════════════════════════════════════════════════════
// PRODUCTS — CRUD COMPLETO
// ═══════════════════════════════════════════════════════════
export async function getAllProducts(): Promise<Product[]> {
  const { data } = await db()
    .from('products')
    .select('*, product_categories(name), product_subcategories(name)')
    .order('code')
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...parseProduct(r),
    categoryName: (r['product_categories'] as Record<string, unknown> | null)?.['name'] as string | undefined,
    subcategoryName: (r['product_subcategories'] as Record<string, unknown> | null)?.['name'] as string | undefined,
  }))
}

export async function toggleProductActive(id: string, active: boolean): Promise<void> {
  await db().from('products').update({ active }).eq('id', id)
}

export async function setProductCategory(id: string, categoryId: string | null, subcategoryId: string | null): Promise<void> {
  await db().from('products').update({ category_id: categoryId, subcategory_id: subcategoryId }).eq('id', id)
}

// ═══════════════════════════════════════════════════════════
// PRODUCT ATTRIBUTES
// ═══════════════════════════════════════════════════════════
export async function getProductAttributes(): Promise<ProductAttribute[]> {
  const { data } = await db().from('product_attributes').select('*').order('name')
  return rows<ProductAttribute>(data)
}

export async function createProductAttribute(attr: { name: string; description?: string }): Promise<ProductAttribute | null> {
  const { data } = await db().from('product_attributes').insert({ name: attr.name, description: attr.description ?? null }).select().single()
  return data ? mapRow<ProductAttribute>(data as Record<string, unknown>) : null
}

export async function updateProductAttribute(id: string, updates: Partial<Pick<ProductAttribute, 'name' | 'description' | 'active'>>): Promise<void> {
  await db().from('product_attributes').update(updates).eq('id', id)
}

// ── Attribute Values ─────────────────────────────────────
export async function getProductAttributeValues(attributeId?: string): Promise<ProductAttributeValue[]> {
  let q = db()
    .from('product_attribute_values')
    .select('*, product_attributes(name)')
    .order('name')
  if (attributeId) q = q.eq('attribute_id', attributeId)
  const { data } = await q
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...mapRow<ProductAttributeValue>(r),
    attributeName: (r['product_attributes'] as Record<string,unknown> | null)?.['name'] as string | undefined,
  }))
}

export async function createProductAttributeValue(val: { attributeId: string; name: string }): Promise<ProductAttributeValue | null> {
  const { data } = await db().from('product_attribute_values')
    .insert({ attribute_id: val.attributeId, name: val.name })
    .select().single()
  return data ? mapRow<ProductAttributeValue>(data as Record<string, unknown>) : null
}

export async function updateProductAttributeValue(id: string, updates: Partial<Pick<ProductAttributeValue, 'name' | 'active'>>): Promise<void> {
  await db().from('product_attribute_values').update(updates).eq('id', id)
}

// ── Product Attribute Assignments ────────────────────────
export async function getProductAttributeAssignments(productId: string): Promise<ProductAttributeAssignment[]> {
  const { data } = await db()
    .from('product_attribute_assignments')
    .select(`
      id, product_id, attribute_id, created_at,
      product_attributes(name),
      product_attribute_assignment_values(
        value_id,
        product_attribute_values(id, name, active, attribute_id, created_at)
      )
    `)
    .eq('product_id', productId)

  return (data ?? []).map((r: Record<string, unknown>) => {
    const attr = r['product_attributes'] as Record<string,unknown> | null
    const avArr = (r['product_attribute_assignment_values'] as Record<string,unknown>[] | null) ?? []
    return {
      id: r['id'] as string,
      productId: r['product_id'] as string,
      attributeId: r['attribute_id'] as string,
      attributeName: attr?.['name'] as string ?? '',
      values: avArr
        .map((av: Record<string,unknown>) => {
          const v = av['product_attribute_values'] as Record<string,unknown> | null
          if (!v || typeof v !== 'object') return null  // ← null guard: evita crash em mapRow
          return mapRow<ProductAttributeValue>(v)
        })
        .filter((v): v is ProductAttributeValue => v !== null),
    } as ProductAttributeAssignment
  })
}

export async function saveProductAttributeAssignment(
  productId: string,
  attributeId: string,
  valueIds: string[],
): Promise<void> {
  // Upsert assignment
  const { data: existing } = await db()
    .from('product_attribute_assignments')
    .select('id')
    .eq('product_id', productId)
    .eq('attribute_id', attributeId)
    .maybeSingle()

  let assignmentId: string
  if (existing?.id) {
    assignmentId = existing.id as string
    // Remove old values
    await db().from('product_attribute_assignment_values').delete().eq('assignment_id', assignmentId)
  } else {
    const { data: created } = await db()
      .from('product_attribute_assignments')
      .insert({ product_id: productId, attribute_id: attributeId })
      .select().single()
    assignmentId = (created as Record<string,unknown>)['id'] as string
  }

  if (valueIds.length > 0) {
    await db().from('product_attribute_assignment_values').insert(
      valueIds.map(vid => ({ assignment_id: assignmentId, value_id: vid }))
    )
  }
}

export async function deleteProductAttributeAssignment(productId: string, attributeId: string): Promise<void> {
  await db()
    .from('product_attribute_assignments')
    .delete()
    .eq('product_id', productId)
    .eq('attribute_id', attributeId)
}

// ═══════════════════════════════════════════════════════════
// STORAGE — AVATARS
// ═══════════════════════════════════════════════════════════
export async function uploadAvatar(userId: string, file: File): Promise<string | null> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `avatars/${userId}.${ext}`
  const { error } = await db().storage.from('profiles').upload(path, file, { upsert: true })
  if (error) return null
  return db().storage.from('profiles').getPublicUrl(path).data.publicUrl
}

export async function uploadClientAvatar(clientId: string, file: File): Promise<string | null> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `clients/${clientId}.${ext}`
  const { error } = await db().storage.from('clients').upload(path, file, { upsert: true })
  if (error) return null
  return db().storage.from('clients').getPublicUrl(path).data.publicUrl
}

// ═══════════════════════════════════════════════════════════
// CREDIT SCORE
// ═══════════════════════════════════════════════════════════
export async function getClientCreditScore(clientId: string): Promise<CreditScore> {
  const { data } = await db()
    .from('orders')
    .select('status')
    .eq('client_id', clientId)
    .eq('is_deleted', false)

  const all = (data ?? []) as { status: string }[]
  const totalOrders = all.length
  const paidOrders = all.filter(o => o.status === 'delivered' || o.status === 'invoiced_ready_to_ship').length
  const lateOrders = totalOrders - paidOrders

  let score: CreditScore['score']
  if (totalOrders === 0) {
    score = 'Restrito'
  } else {
    const ratio = paidOrders / totalOrders
    if (totalOrders >= 5 && ratio >= 0.8) {
      score = 'Bom pagador'
    } else if (ratio >= 0.3) {
      score = 'Atenção'
    } else {
      score = 'Restrito'
    }
  }

  return { score, totalOrders, paidOrders, lateOrders }
}

// ═══════════════════════════════════════════════════════════
// ROUTE SESSIONS
// ═══════════════════════════════════════════════════════════
export async function getActiveRouteSession(repId: string): Promise<RouteSession | null> {
  const { data } = await db()
    .from('route_sessions')
    .select('*')
    .eq('rep_id', repId)
    .in('status', ['planejada', 'em_andamento'])
    .eq('date', new Date().toISOString().slice(0, 10))
    .maybeSingle()
  return data ? mapRow<RouteSession>(data as Record<string, unknown>) : null
}

export async function upsertRouteSession(session: Omit<RouteSession, 'id' | 'createdAt'>): Promise<RouteSession | null> {
  const row = toSnake(session as unknown as Record<string, unknown>)
  const { data } = await db().from('route_sessions').upsert(row).select().single()
  return data ? mapRow<RouteSession>(data as Record<string, unknown>) : null
}

export async function finalizeRouteSession(id: string): Promise<void> {
  await db().from('route_sessions').update({
    status: 'finalizada',
    finished_at: new Date().toISOString(),
  }).eq('id', id)
}

export async function updateRouteCheckedIn(id: string, checkedInIds: string[]): Promise<void> {
  await db().from('route_sessions').update({ checked_in_ids: checkedInIds }).eq('id', id)
}

export async function updateRouteStatus(id: string, status: 'planejada' | 'em_andamento' | 'finalizada'): Promise<void> {
  await db().from('route_sessions').update({ status }).eq('id', id)
}

export async function getRouteSessions(repId: string): Promise<RouteSession[]> {
  const { data } = await db()
    .from('route_sessions')
    .select('*')
    .eq('rep_id', repId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (!data) return []
  return data.map(r => ({
    id: r.id as string,
    repId: r.rep_id as string,
    repName: r.rep_name as string,
    date: r.date as string,
    city: r.city as string,
    clientIds: (r.client_ids as string[]) ?? [],
    prospectIds: (r.prospect_ids as string[]) ?? [],
    checkedInIds: (r.checked_in_ids as string[]) ?? [],
    status: (r.status as RouteSession['status']) ?? 'planejada',
    finishedAt: (r.finished_at as string | undefined) ?? undefined,
    notes: (r.notes as string | undefined) ?? undefined,
    createdAt: r.created_at as string,
  }))
}

export async function addProspectToRoute(prospectId: string, repId: string, repName: string, city: string): Promise<RouteSession | null> {
  const active = await getActiveRouteSession(repId)
  if (active) {
    if (active.prospectIds.includes(prospectId)) return active
    const prospectIds = [...active.prospectIds, prospectId]
    const { data } = await db().from('route_sessions').update({ prospect_ids: prospectIds }).eq('id', active.id).select().single()
    return data ? mapRow<RouteSession>(data as Record<string, unknown>) : null
  }
  return upsertRouteSession({
    repId, repName,
    date: new Date().toISOString().slice(0, 10),
    city,
    clientIds: [],
    prospectIds: [prospectId],
    checkedInIds: [],
    status: 'planejada',
  })
}

// ═══════════════════════════════════════════════════════════
// BIRTHDAYS
// ═══════════════════════════════════════════════════════════
export async function getUpcomingBirthdays(days: number): Promise<Array<{
  clientId: string
  clientName: string
  buyerName?: string
  buyerPhone?: string
  buyerWhatsapp?: string
  type: 'pessoa' | 'empresa'
  date: string
  daysUntil: number
}>> {
  const today = new Date()
  const results: Array<{
    clientId: string
    clientName: string
    buyerName?: string
    buyerPhone?: string
    buyerWhatsapp?: string
    type: 'pessoa' | 'empresa'
    date: string
    daysUntil: number
  }> = []

  const { data } = await db()
    .from('clients')
    .select('id, name, buyer_name, buyer_phone, buyer_whatsapp, buyer_birthday, company_anniversary')
    .or('buyer_birthday.not.is.null,company_anniversary.not.is.null')

  const rows2 = (data ?? []) as Array<{
    id: string
    name: string
    buyer_name?: string
    buyer_phone?: string
    buyer_whatsapp?: string
    buyer_birthday?: string
    company_anniversary?: string
  }>

  for (const row of rows2) {
    for (const { field, type } of [
      { field: 'buyer_birthday' as const, type: 'pessoa' as const },
      { field: 'company_anniversary' as const, type: 'empresa' as const },
    ]) {
      const raw = row[field]
      if (!raw) continue
      const d = new Date(raw)
      const thisYear = new Date(today.getFullYear(), d.getMonth(), d.getDate())
      let diff = Math.ceil((thisYear.getTime() - today.getTime()) / 86400000)
      if (diff < 0) diff += 365
      if (diff <= days) {
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        results.push({
          clientId: row.id,
          clientName: row.name,
          buyerName: row.buyer_name,
          buyerPhone: row.buyer_phone,
          buyerWhatsapp: row.buyer_whatsapp,
          type,
          date: `${mm}-${dd}`,
          daysUntil: diff,
        })
      }
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil)
}

// ═══════════════════════════════════════════════════════════
// FINANCIAL RECEIVABLES
// ═══════════════════════════════════════════════════════════

function parseReceivable(r: Record<string, unknown>): FinancialReceivable {
  const p = mapRow<FinancialReceivable>(r)
  return {
    ...p,
    amount: Number(p.amount) || 0,
    paidAmount: Number(p.paidAmount) || 0,
    remainingAmount: Number(p.remainingAmount) || 0,
    writeOffAmount: Number(p.writeOffAmount) || 0,
    hasWriteOff: Boolean(p.hasWriteOff),
  }
}

export async function getReceivables(filters?: {
  clientId?: string
  repId?: string
  status?: ReceivableStatus
  from?: string
  to?: string
}): Promise<FinancialReceivable[]> {
  // Auto-mark overdue open/partial records before fetching
  const today = new Date().toISOString().slice(0, 10)
  await db()
    .from('financial_receivables')
    .update({ status: 'vencido' })
    .in('status', ['aberto', 'parcial'])
    .lt('due_date', today)

  let q = db().from('financial_receivables').select('*').order('due_date')
  if (filters?.clientId) q = q.eq('client_id', filters.clientId)
  if (filters?.repId) q = q.eq('rep_id', filters.repId)
  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.from) q = q.gte('due_date', filters.from)
  if (filters?.to) q = q.lte('due_date', filters.to)

  const { data } = await q
  return (data ?? []).map(r => parseReceivable(r as Record<string, unknown>))
}

export async function getClientReceivables(clientId: string): Promise<FinancialReceivable[]> {
  const { data } = await db()
    .from('financial_receivables')
    .select('*')
    .eq('client_id', clientId)
    .order('due_date')
  return (data ?? []).map(r => parseReceivable(r as Record<string, unknown>))
}

export async function generateReceivables(order: Order): Promise<FinancialReceivable[]> {
  // ── CHEQUE: um título por cheque, vencimento = data de compensação ──
  const checks = (order.checks ?? []).filter(c => c.compensationDate && (Number(c.amount) || 0) > 0)
  if (order.paymentMethod === 'Cheque' && checks.length > 0) {
    const created: FinancialReceivable[] = []
    for (let i = 0; i < checks.length; i++) {
      const c = checks[i]
      const row = {
        client_id: order.clientId, client_name: order.clientName,
        order_id: order.id, order_number: order.number,
        rep_id: order.repId, rep_name: order.repName,
        installment_number: i + 1, installment_total: checks.length,
        amount: Number(c.amount), due_date: c.compensationDate,
        paid_amount: 0, remaining_amount: Number(c.amount),
        status: 'aberto', payment_method: 'Cheque',
        notes: `Cheque ${c.number ? 'nº ' + c.number : String(i + 1).padStart(2, '0')}${c.bank ? ' · ' + c.bank : ''}${c.holder ? ' · ' + c.holder : ''}`,
      }
      const { data } = await db().from('financial_receivables').insert(row).select().single()
      if (data) created.push(parseReceivable(data as Record<string, unknown>))
    }
    return created
  }

  // Vencimentos contam a partir da DATA DE ENTREGA (deliveryDate); se ausente,
  // caem para a Data da Venda. 'YYYY-MM-DD' → meia-noite local.
  const baseStr = financialBaseDate(order)
  const today = new Date(baseStr.length <= 10 ? baseStr + 'T00:00:00' : baseStr)
  const paymentTerms = order.paymentTerms ?? ''

  // Parse days from paymentTerms using regex
  const matches = paymentTerms.match(/(\d+)/g)
  const days: number[] = matches ? matches.map(Number) : [30]

  // "À vista" → 1 installment due today
  const isAvista = /à\s*vista/i.test(paymentTerms)
  const installmentDays = isAvista ? [0] : days.length > 0 ? days : [30]

  const installmentTotal = installmentDays.length
  // Se há pagamento parcial já registrado, gera recebíveis apenas sobre o saldo restante
  const baseAmount = order.total - (order.partialPaymentAmount ?? 0)
  const amountPerInstallment = baseAmount / installmentTotal

  const created: FinancialReceivable[] = []

  for (let i = 0; i < installmentDays.length; i++) {
    const dueDate = new Date(today)
    dueDate.setDate(dueDate.getDate() + installmentDays[i])
    const dueDateStr = dueDate.toISOString().slice(0, 10)

    const row = {
      client_id: order.clientId,
      client_name: order.clientName,
      order_id: order.id,
      order_number: order.number,
      rep_id: order.repId,
      rep_name: order.repName,
      installment_number: i + 1,
      installment_total: installmentTotal,
      amount: amountPerInstallment,
      due_date: dueDateStr,
      paid_amount: 0,
      remaining_amount: amountPerInstallment,
      status: 'aberto',
    }

    const { data } = await db()
      .from('financial_receivables')
      .insert(row)
      .select()
      .single()

    if (data) created.push(parseReceivable(data as Record<string, unknown>))
  }

  return created
}

/** Gera os recebíveis do pedido apenas se ainda não existirem (idempotente).
 *  Pedidos de troca nunca geram financeiro.
 *  Retorna true quando criou, false quando já havia financeiro ou é troca. */
export async function ensureOrderReceivables(order: Order): Promise<boolean> {
  if (order.orderType === 'troca') return false
  const existing = await getOrderReceivables(order.id)
  if (existing.length > 0) return false
  await generateReceivables(order)
  return true
}

/** Reprocessa o financeiro do pedido (data de entrega/venda, condição ou forma
 *  de pagamento). PRESERVA parcelas pagas/parciais — só recria as EM ABERTO,
 *  redistribuindo o valor restante (total − já comprometido nas travadas).
 *  Também reposiciona o mês de referência da comissão. */
export async function reprocessOrderFinancial(order: Order): Promise<{ receivablesRecreated: boolean; hadLocked: boolean }> {
  const existing = await getOrderReceivables(order.id)
  const locked = existing.filter(r => r.status === 'pago' || r.status === 'parcial')
  const open = existing.filter(r => r.status === 'aberto')

  // Remove apenas as parcelas EM ABERTO (mantém pagas/parciais)
  for (const o of open) await deleteReceivable(o.id)

  let receivablesRecreated = false
  const lockedAmount = locked.reduce((s, r) => s + r.amount, 0)
  const remaining = Math.max(0, Number(order.total) - lockedAmount)
  const offset = locked.length

  if (remaining > 0.005) {
    const checks = order.paymentMethod === 'Cheque'
      ? (order.checks ?? []).filter(c => c.compensationDate && (Number(c.amount) || 0) > 0)
      : []
    const baseRow = {
      client_id: order.clientId, client_name: order.clientName,
      order_id: order.id, order_number: order.number,
      rep_id: order.repId, rep_name: order.repName,
      paid_amount: 0, status: 'aberto' as const,
    }
    if (checks.length > 0) {
      for (let i = 0; i < checks.length; i++) {
        const c = checks[i]
        await db().from('financial_receivables').insert({
          ...baseRow,
          installment_number: offset + i + 1, installment_total: offset + checks.length,
          amount: Number(c.amount), due_date: c.compensationDate, remaining_amount: Number(c.amount),
          payment_method: 'Cheque',
          notes: `Cheque ${c.number ? 'nº ' + c.number : String(i + 1).padStart(2, '0')}${c.bank ? ' · ' + c.bank : ''}`,
        })
      }
      receivablesRecreated = true
    } else {
      const terms = order.paymentTerms ?? ''
      const isAvista = /à\s*vista/i.test(terms)
      const matches = terms.match(/(\d+)/g)
      const days = isAvista ? [0] : (matches ? matches.map(Number) : [30])
      const baseStr = financialBaseDate(order)
      const baseDate = new Date(baseStr.length <= 10 ? baseStr + 'T00:00:00' : baseStr)
      const per = remaining / days.length
      for (let i = 0; i < days.length; i++) {
        const due = new Date(baseDate); due.setDate(due.getDate() + days[i])
        await db().from('financial_receivables').insert({
          ...baseRow,
          installment_number: offset + i + 1, installment_total: offset + days.length,
          amount: per, due_date: due.toISOString().slice(0, 10), remaining_amount: per,
        })
      }
      receivablesRecreated = true
    }
  }

  // Reposiciona a comissão no mês da data da venda
  await db().from('commissions')
    .update({ reference_month: saleDateOf(order).slice(0, 7) })
    .eq('order_id', order.id)
    .neq('status', 'cancelada')
  return { receivablesRecreated, hadLocked: locked.length > 0 }
}

export async function registerPayment(params: {
  id: string
  paidAmount: number
  paymentDate: string
  paymentMethod: string
  notes?: string
  userId: string
  userName: string
}): Promise<void> {
  const { data: current } = await db()
    .from('financial_receivables')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!current) throw new Error('Recebível não encontrado')

  const rec = parseReceivable(current as Record<string, unknown>)
  const newPaidAmount = rec.paidAmount + params.paidAmount
  const remaining = rec.amount - newPaidAmount
  const newStatus: ReceivableStatus = remaining <= 0 ? 'pago' : 'parcial'

  await db()
    .from('financial_receivables')
    .update({
      paid_amount: newPaidAmount,
      remaining_amount: Math.max(0, remaining),
      status: newStatus,
      payment_date: params.paymentDate,
      payment_method: params.paymentMethod,
      notes: params.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)

  await logAudit({
    userId: params.userId,
    userName: params.userName,
    userRole: 'admin',
    action: 'register_payment',
    entity: 'financial_receivables',
    entityId: params.id,
    description: `Pagamento de R$ ${params.paidAmount.toFixed(2)} registrado`,
    timestamp: new Date().toISOString(),
  })
}

/** Baixa definitiva de um título com diferença (desconto, troca, bonificação,
 *  perda financeira etc.). Registra o valor recebido nesta baixa (pode ser 0,
 *  para perda financeira total), encerra o título como "pago" e grava o
 *  saldo abatido com motivo, usuário e data — nada é perdido do histórico. */
export async function writeOffReceivable(params: {
  id: string
  paidAmount: number
  paymentDate: string
  paymentMethod: string
  writeOffReason: WriteOffReason
  writeOffDescription?: string
  notes?: string
  userId: string
  userName: string
}): Promise<void> {
  const { data: current } = await db()
    .from('financial_receivables')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!current) throw new Error('Recebível não encontrado')

  const rec = parseReceivable(current as Record<string, unknown>)
  const newPaidAmount = rec.paidAmount + params.paidAmount
  const writeOffAmount = Math.max(0, rec.amount - newPaidAmount)

  await db()
    .from('financial_receivables')
    .update({
      paid_amount: newPaidAmount,
      remaining_amount: 0,
      status: 'pago',
      payment_date: params.paymentDate,
      payment_method: params.paymentMethod,
      notes: params.notes || rec.notes || null,
      has_write_off: true,
      write_off_amount: writeOffAmount,
      write_off_reason: params.writeOffReason,
      write_off_description: params.writeOffDescription ?? null,
      write_off_by: params.userId,
      write_off_by_name: params.userName,
      write_off_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)

  await logAudit({
    userId: params.userId,
    userName: params.userName,
    userRole: 'admin',
    action: 'write_off_balance',
    entity: 'financial_receivables',
    entityId: params.id,
    description: `Baixa com abatimento — ${rec.clientName} | Pedido ${rec.orderNumber} | Parcela ${rec.installmentNumber}/${rec.installmentTotal} | Valor original R$ ${rec.amount.toFixed(2)} | Recebido nesta baixa R$ ${params.paidAmount.toFixed(2)} | Total recebido R$ ${newPaidAmount.toFixed(2)} | Abatido R$ ${writeOffAmount.toFixed(2)} | Motivo: ${params.writeOffReason}${params.writeOffDescription ? ' — ' + params.writeOffDescription : ''}`,
    timestamp: new Date().toISOString(),
  })
}

export async function cancelReceivable(id: string): Promise<void> {
  await db()
    .from('financial_receivables')
    .update({ status: 'cancelado', updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function deleteReceivable(id: string): Promise<void> {
  const { error } = await db().from('financial_receivables').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Edita uma parcela individualmente (vencimento, valor, observação).
 *  Mantém o valor já pago e recalcula o saldo/estado. */
export async function updateReceivable(
  id: string,
  updates: { dueDate?: string; amount?: number; notes?: string },
): Promise<void> {
  const { data: current } = await db().from('financial_receivables').select('*').eq('id', id).single()
  if (!current) throw new Error('Parcela não encontrada')
  const rec = parseReceivable(current as Record<string, unknown>)
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.dueDate !== undefined) row.due_date = updates.dueDate
  if (updates.notes !== undefined) row.notes = updates.notes
  if (updates.amount !== undefined) {
    const amount = updates.amount
    const remaining = Math.max(0, amount - rec.paidAmount)
    row.amount = amount
    row.remaining_amount = remaining
    row.status = remaining <= 0 ? 'pago' : (rec.paidAmount > 0 ? 'parcial' : 'aberto')
  }
  const { error } = await db().from('financial_receivables').update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Adiciona uma parcela manual ao pedido. */
export async function createReceivable(
  order: Order,
  parcela: { dueDate: string; amount: number; notes?: string },
): Promise<void> {
  const existing = await getOrderReceivables(order.id)
  const n = existing.length + 1
  const row = {
    client_id: order.clientId, client_name: order.clientName,
    order_id: order.id, order_number: order.number,
    rep_id: order.repId, rep_name: order.repName,
    installment_number: n, installment_total: n,
    amount: parcela.amount, due_date: parcela.dueDate,
    paid_amount: 0, remaining_amount: parcela.amount, status: 'aberto',
    notes: parcela.notes ?? null,
  }
  const { error } = await db().from('financial_receivables').insert(row)
  if (error) throw new Error(error.message)
}

export async function getOrderReceivables(orderId: string): Promise<FinancialReceivable[]> {
  const { data, error } = await db()
    .from('financial_receivables')
    .select('*')
    .eq('order_id', orderId)
    .neq('status', 'cancelado')
    .order('installment_number')
  if (error) throw new Error(error.message)
  return (data ?? []).map(parseReceivable)
}

export async function deleteOrderReceivables(orderId: string): Promise<void> {
  const { error } = await db().from('financial_receivables').delete().eq('order_id', orderId)
  if (error) throw new Error(error.message)
}

export async function addNoteToOrderReceivables(orderId: string, note: string): Promise<void> {
  const { error } = await db()
    .from('financial_receivables')
    .update({ notes: note, updated_at: new Date().toISOString() })
    .eq('order_id', orderId)
  if (error) throw new Error(error.message)
}

// ═══════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════
export interface AppNotification {
  id: string
  type: string
  title: string
  description?: string
  entity?: string
  entityId?: string
  repId?: string
  read: boolean
  createdAt: string
}

function parseNotification(r: Record<string, unknown>): AppNotification {
  return {
    id: String(r.id),
    type: String(r.type),
    title: String(r.title),
    description: r.description ? String(r.description) : undefined,
    entity: r.entity ? String(r.entity) : undefined,
    entityId: r.entity_id ? String(r.entity_id) : undefined,
    repId: r.rep_id ? String(r.rep_id) : undefined,
    read: Boolean(r.read),
    createdAt: String(r.created_at),
  }
}

export async function getNotifications(): Promise<AppNotification[]> {
  const { data } = await db()
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (!data) return []
  return (data as Record<string, unknown>[]).map(parseNotification)
}

export async function markNotificationRead(id: string): Promise<void> {
  await db().from('notifications').update({ read: true }).eq('id', id)
}

export async function markAllNotificationsRead(): Promise<void> {
  await db().from('notifications').update({ read: true }).eq('read', false)
}

export async function createNotification(n: Omit<AppNotification, 'id' | 'read' | 'createdAt'>): Promise<void> {
  await db().from('notifications').insert({
    type: n.type,
    title: n.title,
    description: n.description,
    entity: n.entity,
    entity_id: n.entityId,
    rep_id: n.repId,
  })
}

// ── TASKS ──────────────────────────────────────────────────────────────────

function parseTask(r: Record<string, unknown>): Task {
  return {
    id: String(r.id),
    title: String(r.title),
    description: r.description ? String(r.description) : undefined,
    clientId: r.client_id ? String(r.client_id) : undefined,
    clientName: r.client_name ? String(r.client_name) : undefined,
    orderId: r.order_id ? String(r.order_id) : undefined,
    orderNumber: r.order_number ? String(r.order_number) : undefined,
    createdBy: String(r.created_by),
    createdByName: String(r.created_by_name),
    assignedTo: r.assigned_to ? String(r.assigned_to) : undefined,
    assignedToName: r.assigned_to_name ? String(r.assigned_to_name) : undefined,
    priority: (r.priority as TaskPriority) ?? 'media',
    status: (r.status as TaskStatus) ?? 'todo',
    dueDate: r.due_date ? String(r.due_date) : undefined,
    dueTime: r.due_time ? String(r.due_time) : undefined,
    completedAt: r.completed_at ? String(r.completed_at) : undefined,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    notes: r.notes ? String(r.notes) : undefined,
    recurrence: (r.recurrence as TaskRecurrence) ?? 'none',
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

export async function getTasks(filters?: {
  assignedTo?: string
  clientId?: string
  orderId?: string
  status?: TaskStatus
}): Promise<Task[]> {
  let q = db().from('tasks').select('*').order('created_at', { ascending: false })
  if (filters?.assignedTo) q = q.eq('assigned_to', filters.assignedTo)
  if (filters?.clientId) q = q.eq('client_id', filters.clientId)
  if (filters?.orderId) q = q.eq('order_id', filters.orderId)
  if (filters?.status) q = q.eq('status', filters.status)
  const { data } = await q
  if (!data) return []
  return (data as Record<string, unknown>[]).map(parseTask)
}

export async function getTaskById(id: string): Promise<Task | null> {
  const { data } = await db().from('tasks').select('*').eq('id', id).single()
  if (!data) return null
  return parseTask(data as Record<string, unknown>)
}

export async function createTask(t: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task | null> {
  const row = {
    title: t.title,
    description: t.description ?? null,
    client_id: t.clientId ?? null,
    client_name: t.clientName ?? null,
    order_id: t.orderId ?? null,
    order_number: t.orderNumber ?? null,
    created_by: t.createdBy,
    created_by_name: t.createdByName,
    assigned_to: t.assignedTo ?? null,
    assigned_to_name: t.assignedToName ?? null,
    priority: t.priority,
    status: t.status,
    due_date: t.dueDate ?? null,
    due_time: t.dueTime ?? null,
    tags: t.tags,
    notes: t.notes ?? null,
    recurrence: t.recurrence,
  }
  const { data } = await db().from('tasks').insert(row).select().single()
  if (!data) return null
  return parseTask(data as Record<string, unknown>)
}

export async function updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  const row: Record<string, unknown> = {}
  if (updates.title !== undefined) row.title = updates.title
  if (updates.description !== undefined) row.description = updates.description ?? null
  if (updates.clientId !== undefined) row.client_id = updates.clientId ?? null
  if (updates.clientName !== undefined) row.client_name = updates.clientName ?? null
  if (updates.orderId !== undefined) row.order_id = updates.orderId ?? null
  if (updates.orderNumber !== undefined) row.order_number = updates.orderNumber ?? null
  if (updates.assignedTo !== undefined) row.assigned_to = updates.assignedTo ?? null
  if (updates.assignedToName !== undefined) row.assigned_to_name = updates.assignedToName ?? null
  if (updates.priority !== undefined) row.priority = updates.priority
  if (updates.status !== undefined) {
    row.status = updates.status
    if (updates.status === 'done') row.completed_at = new Date().toISOString()
    else row.completed_at = null
  }
  if (updates.dueDate !== undefined) row.due_date = updates.dueDate ?? null
  if (updates.dueTime !== undefined) row.due_time = updates.dueTime ?? null
  if (updates.tags !== undefined) row.tags = updates.tags
  if (updates.notes !== undefined) row.notes = updates.notes ?? null
  if (updates.recurrence !== undefined) row.recurrence = updates.recurrence
  await db().from('tasks').update(row).eq('id', id)
}

export async function deleteTask(id: string): Promise<void> {
  await db().from('tasks').delete().eq('id', id)
}

export async function duplicateTask(id: string): Promise<Task | null> {
  const task = await getTaskById(id)
  if (!task) return null
  return createTask({ ...task, title: `${task.title} (cópia)`, status: 'todo', completedAt: undefined })
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const { data } = await db()
    .from('task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  if (!data) return []
  return (data as Record<string, unknown>[]).map(r => ({
    id: String(r.id),
    taskId: String(r.task_id),
    userId: String(r.user_id),
    userName: String(r.user_name),
    comment: String(r.comment),
    createdAt: String(r.created_at),
  }))
}

export async function addTaskComment(taskId: string, userId: string, userName: string, comment: string): Promise<void> {
  await db().from('task_comments').insert({ task_id: taskId, user_id: userId, user_name: userName, comment })
}
