/**
 * MÓDULO PRODUÇÃO — serviços de banco de dados
 */
import { supabase } from '@/lib/supabase'
import type {
  Seamstress, SeamstressProduct,
  ProductionOrder, ProductionOrderItem,
  ProductionDelivery, ProductionDeliveryItem,
  ProductionPayment, ProductionPaymentItem,
  ProductionRequest,
  AuditAction,
} from '@/types'

function db() {
  if (!supabase) throw new Error('Supabase não configurado')
  return supabase
}

// camelCase ↔ snake_case helpers
function toCamel(s: string) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}
function toSnake(s: string) {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase()
}
function mapRow<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [toCamel(k), v])
  ) as T
}
function rows<T>(data: unknown[] | null): T[] {
  return (data ?? []).map(r => mapRow<T>(r as Record<string, unknown>))
}
function toSnakeObj(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [toSnake(k), v])
  )
}

async function audit(
  action: AuditAction,
  entity: string,
  entityId: string,
  description: string,
  userId?: string,
  userName?: string,
) {
  await db().from('audit_logs').insert({
    user_id: userId ?? null,
    user_name: userName ?? 'Sistema',
    user_role: 'admin',
    action,
    entity,
    entity_id: entityId,
    description,
    timestamp: new Date().toISOString(),
  })
}

// ════════════════════════════════════════════
// COSTUREIRAS
// ════════════════════════════════════════════

export async function getSeamstresses(): Promise<Seamstress[]> {
  const { data } = await db().from('seamstresses').select('*').order('name')
  return rows<Seamstress>(data)
}

export async function getSeamstressById(id: string): Promise<Seamstress | null> {
  const { data } = await db().from('seamstresses').select('*').eq('id', id).single()
  return data ? mapRow<Seamstress>(data as Record<string, unknown>) : null
}

export async function createSeamstress(
  input: Omit<Seamstress, 'id' | 'createdAt' | 'updatedAt'>,
  userId?: string, userName?: string,
): Promise<Seamstress> {
  const { data, error } = await db().from('seamstresses').insert(toSnakeObj(input as Record<string, unknown>)).select().single()
  if (error) throw error
  const s = mapRow<Seamstress>(data as Record<string, unknown>)
  await audit('create_seamstress', 'seamstresses', s.id, `Costureira ${s.name} cadastrada`, userId, userName)
  return s
}

export async function updateSeamstress(
  id: string,
  updates: Partial<Seamstress>,
  userId?: string, userName?: string,
): Promise<void> {
  const { error } = await db().from('seamstresses').update({
    ...toSnakeObj(updates as Record<string, unknown>),
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
  await audit('update_seamstress', 'seamstresses', id, `Costureira atualizada`, userId, userName)
}

export async function deleteSeamstress(id: string, name: string, userId?: string, userName?: string): Promise<void> {
  const { error } = await db().from('seamstresses').delete().eq('id', id)
  if (error) throw error
  await audit('delete_seamstress', 'seamstresses', id, `Costureira ${name} removida`, userId, userName)
}

// ════════════════════════════════════════════
// PRODUTOS POR COSTUREIRA
// ════════════════════════════════════════════

export async function getSeamstressProducts(seamstressId: string): Promise<SeamstressProduct[]> {
  const { data } = await db()
    .from('seamstress_products')
    .select('*')
    .eq('seamstress_id', seamstressId)
    .eq('active', true)
    .order('product_name')
  return rows<SeamstressProduct>(data)
}

export async function getAllSeamstressProducts(): Promise<SeamstressProduct[]> {
  const { data } = await db().from('seamstress_products').select('*').eq('active', true).order('product_name')
  return rows<SeamstressProduct>(data)
}

export async function upsertSeamstressProduct(
  input: Omit<SeamstressProduct, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<SeamstressProduct> {
  const row = {
    seamstress_id: input.seamstressId,
    product_name: input.productName,
    unit_value: input.unitValue,
    active: input.active ?? true,
    updated_at: new Date().toISOString(),
  }
  if (input.id) {
    const { data, error } = await db().from('seamstress_products').update(row).eq('id', input.id).select().single()
    if (error) throw error
    return mapRow<SeamstressProduct>(data as Record<string, unknown>)
  }
  const { data, error } = await db().from('seamstress_products').insert(row).select().single()
  if (error) throw error
  return mapRow<SeamstressProduct>(data as Record<string, unknown>)
}

export async function deleteSeamstressProduct(id: string): Promise<void> {
  await db().from('seamstress_products').update({ active: false }).eq('id', id)
}

// ════════════════════════════════════════════
// ORDENS DE PRODUÇÃO
// ════════════════════════════════════════════

export async function getProductionOrders(): Promise<ProductionOrder[]> {
  const { data } = await db()
    .from('production_orders')
    .select('*, production_order_items(*)')
    .order('created_at', { ascending: false })
  return (data ?? []).map(r => {
    const { production_order_items, ...rest } = r as Record<string, unknown>
    const o = mapRow<ProductionOrder>(rest)
    o.items = rows<ProductionOrderItem>(production_order_items as unknown[])
    return o
  })
}

export async function getProductionOrderById(id: string): Promise<ProductionOrder | null> {
  const { data } = await db()
    .from('production_orders')
    .select('*, production_order_items(*), production_deliveries(*, production_delivery_items(*))')
    .eq('id', id)
    .single()
  if (!data) return null
  const { production_order_items, production_deliveries, ...rest } = data as Record<string, unknown>
  const o = mapRow<ProductionOrder>(rest)
  o.items = rows<ProductionOrderItem>(production_order_items as unknown[])
  ;(o as ProductionOrder & { deliveries?: ProductionDelivery[] }).deliveries = (production_deliveries as unknown[] ?? []).map(d => {
    const { production_delivery_items, ...dr } = d as Record<string, unknown>
    const del = mapRow<ProductionDelivery>(dr)
    del.items = rows<ProductionDeliveryItem>(production_delivery_items as unknown[])
    return del
  })
  return o
}

export async function createProductionOrder(
  input: {
    seamstressId: string
    seamstressName: string
    requestDate: string
    deadline?: string
    notes?: string
    hasFlow?: boolean
    flowParticipants?: string[]
    items: { seamstressProductId?: string; productName: string; quantity: number; unitValue: number }[]
  },
  userId?: string, userName?: string,
): Promise<ProductionOrder> {
  const { data, error } = await db().from('production_orders').insert({
    seamstress_id: input.seamstressId,
    seamstress_name: input.seamstressName,
    request_date: input.requestDate,
    deadline: input.deadline ?? null,
    notes: input.notes ?? null,
    status: 'solicitada',
    created_by: userId ?? null,
    has_flow: input.hasFlow ?? false,
  }).select().single()
  if (error) throw error

  const order = mapRow<ProductionOrder>(data as Record<string, unknown>)

  // Se tem fluxo: define flow_id = próprio id, flow_step = 1
  if (input.hasFlow) {
    await db().from('production_orders').update({
      flow_id: order.id,
      flow_step: 1,
      flow_participants: input.flowParticipants ?? [],
    }).eq('id', order.id)
    order.flowId = order.id
    order.flowStep = 1
    order.flowParticipants = input.flowParticipants ?? []
  }

  if (input.items.length > 0) {
    const itemRows = input.items.map(it => ({
      order_id: order.id,
      seamstress_product_id: it.seamstressProductId ?? null,
      product_name: it.productName,
      quantity: it.quantity,
      unit_value: it.unitValue,
    }))
    const { error: ie } = await db().from('production_order_items').insert(itemRows)
    if (ie) throw ie
  }

  await audit('create_production_order', 'production_orders', order.id,
    `Ordem de produção criada para ${input.seamstressName}`, userId, userName)
  return order
}

// Cria um repasse: nova etapa no fluxo a partir de uma ordem existente
export async function createRepasseOrder(
  input: {
    sourceOrderId: string
    seamstressId: string
    seamstressName: string
    deadline?: string
    notes?: string
  },
  userId?: string, userName?: string,
): Promise<ProductionOrder> {
  const source = await getProductionOrderById(input.sourceOrderId)
  if (!source) throw new Error('Ordem de origem não encontrada')

  // Quantidade = entregue pela etapa anterior (ou pedido se sem entrega)
  const newItems = (source.items ?? []).map(it => ({
    seamstressProductId: it.seamstressProductId,
    productName: it.productName,
    quantity: it.deliveredQty > 0 ? it.deliveredQty : it.quantity,
    unitValue: it.unitValue,
  }))
  const totalQtyReceived = newItems.reduce((s, i) => s + i.quantity, 0)
  const flowId = source.flowId ?? source.id
  const newStep = (source.flowStep ?? 1) + 1

  const { data, error } = await db().from('production_orders').insert({
    seamstress_id: input.seamstressId,
    seamstress_name: input.seamstressName,
    request_date: new Date().toISOString().slice(0, 10),
    deadline: input.deadline ?? source.deadline ?? null,
    notes: input.notes ?? null,
    status: 'solicitada',
    created_by: userId ?? null,
    has_flow: true,
    flow_id: flowId,
    flow_step: newStep,
    source_order_id: input.sourceOrderId,
    quantity_received: totalQtyReceived,
  }).select().single()
  if (error) throw error

  const order = mapRow<ProductionOrder>(data as Record<string, unknown>)

  if (newItems.length > 0) {
    await db().from('production_order_items').insert(newItems.map(it => ({
      order_id: order.id,
      seamstress_product_id: it.seamstressProductId ?? null,
      product_name: it.productName,
      quantity: it.quantity,
      unit_value: it.unitValue,
    })))
  }

  await audit('create_production_order', 'production_orders', order.id,
    `Repasse ${source.seamstressName} → ${input.seamstressName} (${totalQtyReceived} peças)`, userId, userName)

  return order
}

// Retorna ordens disponíveis para importar (têm fluxo, sem próxima etapa)
export async function getOrdersForImport(): Promise<ProductionOrder[]> {
  const { data: allFlow } = await db()
    .from('production_orders')
    .select('*, production_order_items(*)')
    .eq('has_flow', true)
    .not('status', 'eq', 'cancelada')
    .order('created_at', { ascending: false })

  if (!allFlow) return []

  const { data: nextSteps } = await db()
    .from('production_orders')
    .select('source_order_id')
    .not('source_order_id', 'is', null)

  const usedIds = new Set(
    (nextSteps ?? []).map((r: Record<string, unknown>) => r.source_order_id as string)
  )

  return allFlow
    .filter((r: Record<string, unknown>) => !usedIds.has(r.id as string))
    .map((r: Record<string, unknown>) => {
      const { production_order_items, ...rest } = r
      const o = mapRow<ProductionOrder>(rest as Record<string, unknown>)
      o.items = rows<ProductionOrderItem>(production_order_items as unknown[])
      return o
    })
}

// Retorna todos os fluxos em aberto com sumário calculado
export async function getOpenFlows(): Promise<import('@/types').FlowSummary[]> {
  const { data } = await db()
    .from('production_orders')
    .select('*, production_order_items(*)')
    .not('flow_id', 'is', null)
    .order('flow_step', { ascending: true })

  if (!data) return []

  const allOrders = (data as Record<string, unknown>[]).map(r => {
    const { production_order_items, ...rest } = r
    const o = mapRow<ProductionOrder>(rest as Record<string, unknown>)
    o.items = rows<ProductionOrderItem>(production_order_items as unknown[])
    return o
  })

  const flowMap = new Map<string, ProductionOrder[]>()
  for (const o of allOrders) {
    if (!o.flowId) continue
    if (!flowMap.has(o.flowId)) flowMap.set(o.flowId, [])
    flowMap.get(o.flowId)!.push(o)
  }

  const today = new Date().toISOString().slice(0, 10)
  const summaries: import('@/types').FlowSummary[] = []

  for (const [flowId, orders] of flowMap) {
    const sorted = [...orders].sort((a, b) => (a.flowStep ?? 0) - (b.flowStep ?? 0))
    const root = sorted[0]
    const latest = sorted[sorted.length - 1]

    // Fluxo totalmente concluído/cancelado → não mostrar
    const hasActive = sorted.some(o => !['concluida', 'cancelada'].includes(o.status))
    if (!hasActive) continue

    const initialQuantity = (root.items ?? []).reduce((s, i) => s + i.quantity, 0)
    const latestDelivered = (latest.items ?? []).reduce((s, i) => s + i.deliveredQty, 0)
    const latestReceived = latest.quantityReceived ?? initialQuantity
    const currentQuantity = latestDelivered > 0 ? latestDelivered : latestReceived
    const totalLoss = initialQuantity - currentQuantity
    const percentComplete = initialQuantity > 0
      ? Math.round((currentQuantity / initialQuantity) * 100)
      : 0

    const isLate = !!root.deadline && root.deadline < today
    let colorStatus: 'green' | 'yellow' | 'red' = 'green'
    if (isLate) {
      colorStatus = 'red'
    } else if (root.deadline) {
      const ms = new Date(root.deadline).getTime() - new Date(today).getTime()
      const daysLeft = Math.ceil(ms / 86400000)
      if (daysLeft <= 3) colorStatus = 'yellow'
    }
    if (totalLoss > initialQuantity * 0.1) colorStatus = 'red'

    const flowName = (root.items ?? []).map(i => i.productName).filter(Boolean).join(' / ')

    summaries.push({
      flowId,
      flowName: flowName || root.seamstressName,
      deadline: root.deadline,
      participants: root.flowParticipants ?? [],
      initialQuantity,
      currentQuantity,
      totalLoss,
      percentComplete,
      currentStep: latest.flowStep ?? sorted.length,
      totalSteps: (root.flowParticipants ?? []).length || sorted.length,
      currentSeamstressName: latest.seamstressName,
      currentStatus: latest.status,
      isLate,
      colorStatus,
      orders: sorted,
    })
  }

  return summaries
}

export async function updateProductionOrder(
  id: string,
  updates: Partial<Pick<ProductionOrder, 'status' | 'deadline' | 'notes'>>,
  userId?: string, userName?: string,
): Promise<void> {
  const { error } = await db().from('production_orders').update({
    ...toSnakeObj(updates as Record<string, unknown>),
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
  await audit('update_production_order', 'production_orders', id,
    `Ordem atualizada: ${JSON.stringify(updates)}`, userId, userName)
}

export async function editProductionOrder(
  id: string,
  input: {
    deadline?: string
    notes?: string
    items: { id?: string; seamstressProductId?: string; productName: string; quantity: number; unitValue: number }[]
  },
  userId?: string, userName?: string,
): Promise<void> {
  // Atualiza campos da ordem
  const { error } = await db().from('production_orders').update({
    deadline: input.deadline ?? null,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error

  // Para itens: atualiza os existentes com id, insere os novos sem id
  for (const it of input.items) {
    if (it.id) {
      await db().from('production_order_items').update({
        product_name: it.productName,
        quantity: it.quantity,
        unit_value: it.unitValue,
      }).eq('id', it.id)
    } else {
      await db().from('production_order_items').insert({
        order_id: id,
        seamstress_product_id: it.seamstressProductId ?? null,
        product_name: it.productName,
        quantity: it.quantity,
        unit_value: it.unitValue,
      })
    }
  }

  await audit('update_production_order', 'production_orders', id,
    'Ordem editada (prazo, observações e/ou itens)', userId, userName)
}

export async function deleteProductionOrderItem(itemId: string): Promise<void> {
  await db().from('production_order_items').delete().eq('id', itemId)
}

export async function deleteProductionOrder(
  id: string,
  seamstressName: string,
  userId?: string, userName?: string,
): Promise<void> {
  // CASCADE apaga os itens, entregas e itens de entrega automaticamente
  const { error } = await db().from('production_orders').delete().eq('id', id)
  if (error) throw error
  await audit('cancel_production_order', 'production_orders', id,
    `Ordem de ${seamstressName} excluída`, userId, userName)
}

// ════════════════════════════════════════════
// ENTREGAS
// ════════════════════════════════════════════

export async function registerDelivery(
  input: {
    orderId: string
    seamstressId: string
    deliveryDate: string
    notes?: string
    items: { orderItemId: string; productName: string; quantityDelivered: number }[]
  },
  userId?: string, userName?: string,
): Promise<void> {
  const { data: deliveryData, error: de } = await db().from('production_deliveries').insert({
    order_id: input.orderId,
    seamstress_id: input.seamstressId,
    delivery_date: input.deliveryDate,
    notes: input.notes ?? null,
    created_by: userId ?? null,
  }).select().single()
  if (de) throw de

  const deliveryId = (deliveryData as Record<string, unknown>).id as string

  if (input.items.length > 0) {
    const itemRows = input.items.map(it => ({
      delivery_id: deliveryId,
      order_item_id: it.orderItemId,
      product_name: it.productName,
      quantity_delivered: it.quantityDelivered,
    }))
    const { error: ie } = await db().from('production_delivery_items').insert(itemRows)
    if (ie) throw ie

    // Atualiza delivered_qty em cada item da ordem
    for (const it of input.items) {
      const { data: itemData } = await db().from('production_order_items')
        .select('delivered_qty').eq('id', it.orderItemId).single()
      if (itemData) {
        const current = (itemData as Record<string, unknown>).delivered_qty as number ?? 0
        await db().from('production_order_items')
          .update({ delivered_qty: current + it.quantityDelivered })
          .eq('id', it.orderItemId)
      }
    }
  }

  // Atualiza status da ordem
  const { data: orderData } = await db().from('production_orders')
    .select('*, production_order_items(*)')
    .eq('id', input.orderId).single()

  if (orderData) {
    const { production_order_items: pItems } = orderData as Record<string, unknown>
    const itemList = rows<ProductionOrderItem>(pItems as unknown[])
    const allDone = itemList.every(i => i.deliveredQty >= i.quantity)
    const anyDone = itemList.some(i => i.deliveredQty > 0)
    const newStatus = allDone ? 'concluida' : anyDone ? 'parcialmente_entregue' : 'em_producao'
    await db().from('production_orders').update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', input.orderId)
  }

  await audit('register_production_delivery', 'production_deliveries', deliveryId,
    `Entrega registrada para ordem ${input.orderId}`, userId, userName)
}

// ════════════════════════════════════════════
// PAGAMENTOS
// ════════════════════════════════════════════

export async function getProductionPayments(seamstressId?: string): Promise<ProductionPayment[]> {
  let q = db().from('production_payments').select('*, production_payment_items(*)')
  if (seamstressId) q = q.eq('seamstress_id', seamstressId)
  const { data } = await q.order('reference_month', { ascending: false })
  return (data ?? []).map(r => {
    const { production_payment_items, ...rest } = r as Record<string, unknown>
    const p = mapRow<ProductionPayment>(rest)
    p.items = rows<ProductionPaymentItem>(production_payment_items as unknown[])
    return p
  })
}

export async function getUnpaidDeliveries(seamstressId: string): Promise<{
  productName: string
  quantity: number
  unitValue: number
  totalValue: number
}[]> {
  // Busca itens entregues que ainda não foram pagos
  const { data: payments } = await db().from('production_payments')
    .select('id').eq('seamstress_id', seamstressId)

  const paidIds = ((payments ?? []) as Record<string, unknown>[]).map(p => p.id as string)

  const { data: deliveries } = await db()
    .from('production_deliveries')
    .select('production_delivery_items(product_name, quantity_delivered, production_order_items(unit_value))')
    .eq('seamstress_id', seamstressId)

  // Agrupa por produto
  const map: Record<string, { productName: string; quantity: number; unitValue: number }> = {}

  ;(deliveries ?? []).forEach((d: unknown) => {
    const dr = d as Record<string, unknown>
    const items = dr.production_delivery_items as Record<string, unknown>[] ?? []
    items.forEach(it => {
      const name = it.product_name as string
      const qty = it.quantity_delivered as number ?? 0
      const orderItem = it.production_order_items as Record<string, unknown>
      const uv = orderItem?.unit_value as number ?? 0
      if (!map[name]) map[name] = { productName: name, quantity: 0, unitValue: uv }
      map[name].quantity += qty
    })
  })

  return Object.values(map).map(v => ({
    ...v,
    totalValue: v.quantity * v.unitValue,
  }))
}

export async function createProductionPayment(
  input: {
    seamstressId: string
    seamstressName: string
    referenceMonth: string
    totalAmount: number
    items: { productName: string; quantity: number; unitValue: number }[]
    notes?: string
  },
  userId?: string, userName?: string,
): Promise<ProductionPayment> {
  const { data, error } = await db().from('production_payments').insert({
    seamstress_id: input.seamstressId,
    seamstress_name: input.seamstressName,
    reference_month: input.referenceMonth,
    total_amount: input.totalAmount,
    status: 'pendente',
    notes: input.notes ?? null,
    created_by: userId ?? null,
  }).select().single()
  if (error) throw error

  const payment = mapRow<ProductionPayment>(data as Record<string, unknown>)

  if (input.items.length > 0) {
    const itemRows = input.items.map(it => ({
      payment_id: payment.id,
      product_name: it.productName,
      quantity: it.quantity,
      unit_value: it.unitValue,
    }))
    await db().from('production_payment_items').insert(itemRows)
  }

  await audit('create_production_payment', 'production_payments', payment.id,
    `Fechamento criado para ${input.seamstressName} — ${input.referenceMonth}`, userId, userName)
  return payment
}

export async function markPaymentPaid(
  id: string,
  paymentDate: string,
  paymentMethod: string,
  userId?: string, userName?: string,
): Promise<void> {
  const { error } = await db().from('production_payments').update({
    status: 'pago',
    payment_date: paymentDate,
    payment_method: paymentMethod,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
  await audit('mark_production_paid', 'production_payments', id,
    `Pagamento marcado como pago`, userId, userName)
}

// ════════════════════════════════════════════
// SOLICITAÇÕES
// ════════════════════════════════════════════

export async function getProductionRequests(seamstressId?: string): Promise<ProductionRequest[]> {
  let q = db().from('production_requests').select('*')
  if (seamstressId) q = q.eq('seamstress_id', seamstressId)
  const { data } = await q.order('created_at', { ascending: false })
  return rows<ProductionRequest>(data)
}

export async function createProductionRequest(
  input: Omit<ProductionRequest, 'id' | 'createdAt' | 'updatedAt'>,
  userId?: string, userName?: string,
): Promise<ProductionRequest> {
  const { data, error } = await db().from('production_requests').insert({
    seamstress_id: input.seamstressId,
    seamstress_name: input.seamstressName,
    title: input.title,
    description: input.description ?? null,
    type: input.type,
    priority: input.priority,
    due_date: input.dueDate ?? null,
    responsible: input.responsible ?? 'marina',
    responsible_id: input.responsibleId ?? null,
    status: input.status,
    notes: input.notes ?? null,
    create_as_task: input.createAsTask,
    created_by: userId ?? null,
  }).select().single()
  if (error) throw error

  const req = mapRow<ProductionRequest>(data as Record<string, unknown>)
  await audit('create_production_request', 'production_requests', req.id,
    `Solicitação "${req.title}" criada`, userId, userName)
  return req
}

export async function updateProductionRequest(
  id: string,
  updates: Partial<Pick<ProductionRequest, 'status' | 'notes' | 'priority' | 'dueDate' | 'responsible'>>,
  userId?: string, userName?: string,
): Promise<void> {
  const { error } = await db().from('production_requests').update({
    ...toSnakeObj(updates as Record<string, unknown>),
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
  if (updates.status === 'concluida') {
    await audit('complete_production_request', 'production_requests', id,
      'Solicitação concluída', userId, userName)
  } else {
    await audit('update_production_request', 'production_requests', id,
      `Solicitação atualizada`, userId, userName)
  }
}

// ════════════════════════════════════════════
// DASHBOARD KPIs
// ════════════════════════════════════════════

export async function getProductionDashboardKPIs(): Promise<{
  ordensEmProducao: number
  producaoDoMes: number
  pecasProduzidas: number
  valorAPagar: number
  valorPago: number
  ordensAtrasadas: number
  costureirasAtivas: number
  solicitacoesPendentes: number
}> {
  const today = new Date().toISOString().slice(0, 10)
  const mesAtual = today.slice(0, 7)

  const [orders, payments, seamstresses, requests] = await Promise.all([
    db().from('production_orders').select('id, status, deadline'),
    db().from('production_payments').select('status, total_amount, reference_month'),
    db().from('seamstresses').select('id, status'),
    db().from('production_requests').select('id, status'),
  ])

  const allOrders = (orders.data ?? []) as Record<string, unknown>[]
  const allPayments = (payments.data ?? []) as Record<string, unknown>[]
  const allSeamstresses = (seamstresses.data ?? []) as Record<string, unknown>[]
  const allRequests = (requests.data ?? []) as Record<string, unknown>[]

  const ordensEmProducao = allOrders.filter(o =>
    ['solicitada', 'em_producao', 'parcialmente_entregue'].includes(o.status as string)
  ).length

  const ordensAtrasadas = allOrders.filter(o =>
    o.deadline && (o.deadline as string) < today &&
    !['concluida', 'cancelada'].includes(o.status as string)
  ).length

  const costureirasAtivas = allSeamstresses.filter(s => s.status === 'ativa').length
  const solicitacoesPendentes = allRequests.filter(r =>
    ['pendente', 'em_andamento', 'aguardando'].includes(r.status as string)
  ).length

  const paymentsThisMonth = allPayments.filter(p => (p.reference_month as string) === mesAtual)
  const producaoDoMes = paymentsThisMonth.reduce((s, p) => s + (p.total_amount as number ?? 0), 0)

  const valorAPagar = allPayments
    .filter(p => p.status === 'pendente')
    .reduce((s, p) => s + (p.total_amount as number ?? 0), 0)

  const valorPago = allPayments
    .filter(p => p.status === 'pago')
    .reduce((s, p) => s + (p.total_amount as number ?? 0), 0)

  // Peças produzidas (soma de todos os delivery items)
  const { data: deliveryItems } = await db().from('production_delivery_items').select('quantity_delivered')
  const pecasProduzidas = ((deliveryItems ?? []) as Record<string, unknown>[])
    .reduce((s, it) => s + (it.quantity_delivered as number ?? 0), 0)

  return {
    ordensEmProducao, producaoDoMes, pecasProduzidas,
    valorAPagar, valorPago, ordensAtrasadas,
    costureirasAtivas, solicitacoesPendentes,
  }
}

export async function getProductionMonthlyData(): Promise<{ month: string; amount: number; pieces: number }[]> {
  const { data } = await db()
    .from('production_payments')
    .select('reference_month, total_amount')
    .order('reference_month')

  const map: Record<string, { amount: number }> = {}
  ;(data ?? []).forEach((r: unknown) => {
    const row = r as Record<string, unknown>
    const m = row.reference_month as string
    if (!map[m]) map[m] = { amount: 0 }
    map[m].amount += row.total_amount as number ?? 0
  })

  return Object.entries(map).map(([month, v]) => ({ month, ...v, pieces: 0 }))
}

export async function getProductionBySeamstress(): Promise<{ name: string; amount: number; pieces: number }[]> {
  const { data } = await db()
    .from('production_payments')
    .select('seamstress_name, total_amount, status')

  const map: Record<string, { amount: number; pieces: number }> = {}
  ;(data ?? []).forEach((r: unknown) => {
    const row = r as Record<string, unknown>
    const name = row.seamstress_name as string
    if (!map[name]) map[name] = { amount: 0, pieces: 0 }
    map[name].amount += row.total_amount as number ?? 0
  })

  return Object.entries(map).map(([name, v]) => ({ name, ...v }))
}
