/**
 * MÓDULO PRODUÇÃO — serviços de banco de dados
 */
import { supabase } from '@/lib/supabase'
import type {
  Seamstress, SeamstressProduct,
  ProductionOrder, ProductionOrderItem,
  ProductionDelivery, ProductionDeliveryItem,
  ProductionPayment, ProductionPaymentItem, ProductionPaymentAdjustment,
  ProductionAdjustmentType, UnpaidProductionOrder,
  ProductionRequest,
  FlowStep, FlowSummary,
  FlowGroup, FlowGroupAnalysis, FlowGroupStage, FlowGroupChartPoint,
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

  // Carrega etapas do fluxo se existir
  if (o.hasFlow) {
    const { data: stepsData } = await db()
      .from('production_flow_steps')
      .select('*')
      .eq('order_id', id)
      .order('step_index', { ascending: true })
    o.flowSteps = rows<FlowStep>(stepsData as unknown[] ?? [])
  }

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
    // Novo modelo: participantes com ID + nome. Substitui o campo string[] legado.
    flowParticipants?: { id: string; name: string }[]
    items: { seamstressProductId?: string; productName: string; quantity: number; unitValue: number }[]
  },
  userId?: string, userName?: string,
): Promise<ProductionOrder> {
  // Se tem fluxo, o primeiro participante é o responsável inicial
  const participants = input.flowParticipants ?? []
  const firstId   = input.hasFlow && participants.length > 0 ? participants[0].id   : input.seamstressId
  const firstName = input.hasFlow && participants.length > 0 ? participants[0].name : input.seamstressName

  const { data, error } = await db().from('production_orders').insert({
    seamstress_id: firstId,
    seamstress_name: firstName,
    request_date: input.requestDate,
    deadline: input.deadline ?? null,
    notes: input.notes ?? null,
    status: 'solicitada',
    created_by: userId ?? null,
    has_flow: input.hasFlow ?? false,
  }).select().single()
  if (error) throw error

  const order = mapRow<ProductionOrder>(data as Record<string, unknown>)

  if (input.hasFlow && participants.length > 0) {
    const names = participants.map(p => p.name)
    const ids   = participants.map(p => p.id)
    const totalQty = input.items.reduce((s, i) => s + i.quantity, 0)

    // Atualiza a ordem com metadados do fluxo
    await db().from('production_orders').update({
      flow_id:              order.id,
      flow_step:            1,
      flow_participants:    names,
      flow_participant_ids: ids,
      flow_current_step:    0,
    }).eq('id', order.id)

    // Cria os registros de cada etapa (pending, exceto a primeira = in_progress)
    const stepRows = participants.map((p, i) => ({
      order_id:          order.id,
      step_index:        i,
      seamstress_id:     p.id || null,
      seamstress_name:   p.name,
      quantity_received: i === 0 ? totalQty : 0,
      status:            i === 0 ? 'in_progress' : 'pending',
    }))
    const { error: se } = await db().from('production_flow_steps').insert(stepRows)
    if (se) throw se

    order.flowId             = order.id
    order.flowStep           = 1
    order.flowParticipants   = names
    order.flowParticipantIds = ids
    order.flowCurrentStep    = 0
  }

  if (input.items.length > 0) {
    const itemRows = input.items.map(it => ({
      order_id:             order.id,
      seamstress_product_id: it.seamstressProductId ?? null,
      product_name:         it.productName,
      quantity:             it.quantity,
      unit_value:           it.unitValue,
    }))
    const { error: ie } = await db().from('production_order_items').insert(itemRows)
    if (ie) throw ie
  }

  await audit('create_production_order', 'production_orders', order.id,
    `Ordem criada para ${firstName}${input.hasFlow ? ` (fluxo: ${participants.map(p => p.name).join(' → ')})` : ''}`,
    userId, userName)
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

// ════════════════════════════════════════════
// FLUXO AUTOMÁTICO ENTRE COSTUREIRAS
// ════════════════════════════════════════════

/** Avança o fluxo para a próxima etapa automaticamente. */
export async function completeFlowStep(
  orderId: string,
  quantityDelivered: number,
  notes?: string,
  userId?: string,
  userName?: string,
): Promise<void> {
  const order = await getProductionOrderById(orderId)
  if (!order || !order.hasFlow) throw new Error('Ordem sem fluxo configurado')

  const currentIndex  = order.flowCurrentStep ?? 0
  const participants  = order.flowParticipants ?? []
  const participantIds = order.flowParticipantIds ?? []
  const totalSteps    = participants.length
  const isLast        = currentIndex >= totalSteps - 1
  const now           = new Date().toISOString()

  // 1. Marca etapa atual como concluída
  const { error: e1 } = await db()
    .from('production_flow_steps')
    .update({
      status:             'completed',
      quantity_delivered: quantityDelivered,
      notes:              notes ?? null,
      completed_at:       now,
    })
    .eq('order_id', orderId)
    .eq('step_index', currentIndex)
  if (e1) throw e1

  if (isLast) {
    // 2a. Última etapa → ordem concluída
    await db().from('production_orders').update({
      status:     'concluida',
      updated_at: now,
    }).eq('id', orderId)

    await audit('mark_as_delivered', 'production_orders', orderId,
      `Fluxo concluído — ${participants[currentIndex]} entregou ${quantityDelivered} peças`,
      userId, userName)
  } else {
    // 2b. Avança para próxima etapa
    const nextIndex = currentIndex + 1
    const nextName  = participants[nextIndex]
    const nextId    = participantIds[nextIndex] ?? ''

    const { error: e2 } = await db().from('production_orders').update({
      flow_current_step: nextIndex,
      seamstress_id:     nextId   || order.seamstressId,
      seamstress_name:   nextName,
      status:            'em_producao',
      updated_at:        now,
    }).eq('id', orderId)
    if (e2) throw e2

    // Ativa a próxima etapa com a quantidade recebida
    const { error: e3 } = await db()
      .from('production_flow_steps')
      .update({
        status:            'in_progress',
        quantity_received: quantityDelivered,
      })
      .eq('order_id', orderId)
      .eq('step_index', nextIndex)
    if (e3) throw e3

    await audit('send_to_separation', 'production_orders', orderId,
      `Etapa ${currentIndex + 1}/${totalSteps}: ${participants[currentIndex]} → ${nextName} (${quantityDelivered} peças)`,
      userId, userName)
  }
}

/** Retorna todos os fluxos em aberto com linha do tempo completa. */
export async function getOpenFlows(): Promise<FlowSummary[]> {
  const { data: ordersData } = await db()
    .from('production_orders')
    .select('*, production_order_items(*)')
    .eq('has_flow', true)
    .not('status', 'in', '("concluida","cancelada")')
    .order('created_at', { ascending: false })

  if (!ordersData || (ordersData as unknown[]).length === 0) return []

  const orderIds = (ordersData as Record<string, unknown>[]).map(r => r.id as string)

  const { data: stepsData } = await db()
    .from('production_flow_steps')
    .select('*')
    .in('order_id', orderIds)
    .order('step_index', { ascending: true })

  // Agrupa etapas por ordem
  const stepsByOrder = new Map<string, FlowStep[]>()
  for (const raw of (stepsData ?? []) as Record<string, unknown>[]) {
    const step = mapRow<FlowStep>(raw)
    if (!stepsByOrder.has(step.orderId)) stepsByOrder.set(step.orderId, [])
    stepsByOrder.get(step.orderId)!.push(step)
  }

  const today = new Date().toISOString().slice(0, 10)
  const summaries: FlowSummary[] = []

  for (const raw of ordersData as Record<string, unknown>[]) {
    const { production_order_items, ...rest } = raw as Record<string, unknown>
    const order = mapRow<ProductionOrder>(rest as Record<string, unknown>)
    order.items = rows<ProductionOrderItem>(production_order_items as unknown[])

    const flowSteps  = (stepsByOrder.get(order.id) ?? []).sort((a, b) => a.stepIndex - b.stepIndex)
    order.flowSteps  = flowSteps

    const participants = order.flowParticipants ?? []
    const totalSteps   = Math.max(participants.length, flowSteps.length)
    const currentIndex = order.flowCurrentStep ?? 0

    // Quantidade inicial = quantidade da step 0 (ou soma dos itens)
    const initialQuantity = flowSteps.length > 0
      ? flowSteps[0].quantityReceived
      : (order.items ?? []).reduce((s, i) => s + i.quantity, 0)

    // Quantidade atual = última etapa concluída → entregue; senão = inicial
    const completed    = flowSteps.filter(s => s.status === 'completed')
    const lastDone     = completed[completed.length - 1]
    const currentQuantity = lastDone?.quantityDelivered ?? initialQuantity

    const totalLoss       = initialQuantity - currentQuantity
    const percentComplete = totalSteps > 0
      ? Math.round((completed.length / totalSteps) * 100)
      : 0

    const isLate = !!order.deadline && order.deadline < today
    let colorStatus: 'green' | 'yellow' | 'red' = 'green'
    if (isLate) {
      colorStatus = 'red'
    } else if (order.deadline) {
      const daysLeft = Math.ceil(
        (new Date(order.deadline).getTime() - new Date(today).getTime()) / 86400000
      )
      if (daysLeft <= 3) colorStatus = 'yellow'
    }
    if (initialQuantity > 0 && totalLoss > initialQuantity * 0.1) colorStatus = 'red'

    const flowName = (order.items ?? []).map(i => i.productName).filter(Boolean).join(' / ')

    summaries.push({
      flowId:               order.id,
      flowName:             flowName || order.seamstressName,
      deadline:             order.deadline,
      participants,
      initialQuantity,
      currentQuantity,
      totalLoss,
      percentComplete,
      currentStep:          currentIndex + 1,  // 1-based
      totalSteps,
      currentSeamstressName: order.seamstressName,
      currentStatus:        order.status,
      isLate,
      colorStatus,
      flowSteps,
      order,
      orders: [order],  // compat legado
    })
  }

  return summaries
}

// ════════════════════════════════════════════
// FLUXOS DE ANÁLISE (agrupam várias Ordens)
// ════════════════════════════════════════════

function daysBetweenDates(a: string, b: string): number {
  const d1 = new Date(a.length <= 10 ? a + 'T00:00:00' : a)
  const d2 = new Date(b.length <= 10 ? b + 'T00:00:00' : b)
  return Math.round((d2.getTime() - d1.getTime()) / 86400000)
}

export async function getFlowGroups(): Promise<FlowGroup[]> {
  const { data } = await db().from('production_flow_groups').select('*').order('created_at', { ascending: false })
  return rows<FlowGroup>(data)
}

export async function createFlowGroup(
  input: {
    name: string
    periodStart?: string
    periodEnd?: string
    product?: string
    notes?: string
    orderIds: string[]
  },
  userId?: string, userName?: string,
): Promise<FlowGroup> {
  if (input.orderIds.length === 0) throw new Error('Selecione ao menos uma ordem para o fluxo')

  const { data, error } = await db().from('production_flow_groups').insert({
    name: input.name,
    period_start: input.periodStart ?? null,
    period_end: input.periodEnd ?? null,
    product: input.product ?? null,
    notes: input.notes ?? null,
    created_by: userId ?? null,
    created_by_name: userName ?? null,
  }).select().single()
  if (error) throw error

  const group = mapRow<FlowGroup>(data as Record<string, unknown>)

  const { error: le } = await db().from('production_flow_group_orders').insert(
    input.orderIds.map(orderId => ({ flow_group_id: group.id, order_id: orderId }))
  )
  if (le) throw le

  await audit('create_production_flow_group', 'production_flow_groups', group.id,
    `Fluxo de análise "${input.name}" criado com ${input.orderIds.length} ordem(ns)${input.product ? ' · ' + input.product : ''}`,
    userId, userName)
  return group
}

export async function deleteFlowGroup(id: string, name: string, userId?: string, userName?: string): Promise<void> {
  const { error } = await db().from('production_flow_groups').delete().eq('id', id)
  if (error) throw error
  await audit('delete_production_flow_group', 'production_flow_groups', id,
    `Fluxo de análise "${name}" excluído`, userId, userName)
}

/** Ordens candidatas a participar de um Fluxo de análise: todas as ordens
 *  não canceladas (independente de já estarem em outro fluxo — um mesmo
 *  lote pode ser analisado em mais de uma visão). */
export async function getOrdersForFlowGroup(): Promise<ProductionOrder[]> {
  const { data } = await db()
    .from('production_orders')
    .select('*, production_order_items(*)')
    .not('status', 'eq', 'cancelada')
    .order('request_date', { ascending: false })
  return ((data ?? []) as Record<string, unknown>[]).map(r => {
    const { production_order_items, ...rest } = r
    const o = mapRow<ProductionOrder>(rest)
    o.items = rows<ProductionOrderItem>(production_order_items as unknown[])
    return o
  })
}

/** Monta a análise consolidada de um Fluxo: quantidade inicial/final,
 *  perdas, tempo médio, eficiência, valor produzido/perdido, etapas por
 *  costureira e os pontos do gráfico de linha. */
export async function getFlowGroupAnalysis(groupId: string): Promise<FlowGroupAnalysis> {
  const { data: groupData, error: ge } = await db().from('production_flow_groups').select('*').eq('id', groupId).single()
  if (ge || !groupData) throw new Error('Fluxo de análise não encontrado')
  const group = mapRow<FlowGroup>(groupData as Record<string, unknown>)

  const { data: linkData } = await db().from('production_flow_group_orders').select('order_id').eq('flow_group_id', groupId)
  const orderIds = ((linkData ?? []) as Record<string, unknown>[]).map(r => r.order_id as string)

  const empty: FlowGroupAnalysis = {
    group, orderIds: [], orderCount: 0, initialQuantity: 0, currentQuantity: 0, totalLoss: 0,
    efficiency: 0, percentComplete: 0, avgDays: null, valueProduced: 0, valueLost: 0,
    currentSeamstressName: '—', deadline: undefined, isLate: false, stages: [], chartPoints: [],
  }
  if (orderIds.length === 0) return empty

  const { data: ordersData } = await db().from('production_orders').select('*, production_order_items(*)').in('id', orderIds)
  const orders = ((ordersData ?? []) as Record<string, unknown>[]).map(r => {
    const { production_order_items, ...rest } = r
    const o = mapRow<ProductionOrder>(rest)
    o.items = rows<ProductionOrderItem>(production_order_items as unknown[])
    return o
  })
  if (orders.length === 0) return { ...empty, orderIds }

  const flowOrderIds = orders.filter(o => o.hasFlow).map(o => o.id)
  const stepsByOrder = new Map<string, FlowStep[]>()
  if (flowOrderIds.length > 0) {
    const { data: stepsData } = await db()
      .from('production_flow_steps').select('*').in('order_id', flowOrderIds).order('step_index', { ascending: true })
    for (const raw of (stepsData ?? []) as Record<string, unknown>[]) {
      const step = mapRow<FlowStep>(raw)
      if (!stepsByOrder.has(step.orderId)) stepsByOrder.set(step.orderId, [])
      stepsByOrder.get(step.orderId)!.push(step)
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  let initialQuantity = 0, currentQuantity = 0, valueProduced = 0, valueLost = 0
  let sumDays = 0, daysCount = 0
  const perOrderPercent: { percent: number; seamstressName: string }[] = []
  const stageMap = new Map<string, FlowGroupStage>()
  const stageOrder: string[] = []
  const chartByIndex = new Map<number, number>()
  const chartLabelByIndex = new Map<number, string>()
  let maxStepIndex = -1

  const stageDays = new Map<string, { sum: number; count: number }>()

  const upsertStage = (key: string) => {
    if (!stageMap.has(key)) {
      stageMap.set(key, { seamstressName: key, received: 0, delivered: 0, loss: 0, avgDays: null, valueProduced: 0 })
      stageOrder.push(key)
    }
    return stageMap.get(key)!
  }
  const addStageDays = (key: string, days: number) => {
    const d = stageDays.get(key) ?? { sum: 0, count: 0 }
    d.sum += Math.max(0, days); d.count += 1
    stageDays.set(key, d)
  }

  for (const order of orders) {
    const items = order.items ?? []
    const orderInitial = items.reduce((s, it) => s + it.quantity, 0)
    const orderDelivered = items.reduce((s, it) => s + it.deliveredQty, 0)
    const orderValueProduced = items.reduce((s, it) => s + it.deliveredQty * it.unitValue, 0)
    const orderValueLost = items.reduce((s, it) => s + Math.max(0, it.quantity - it.deliveredQty) * it.unitValue, 0)

    initialQuantity += orderInitial
    currentQuantity += orderDelivered
    valueProduced += orderValueProduced
    valueLost += orderValueLost

    const end = order.status === 'concluida' ? order.updatedAt.slice(0, 10) : today
    sumDays += Math.max(0, daysBetweenDates(order.requestDate, end)); daysCount++

    const steps = (stepsByOrder.get(order.id) ?? []).sort((a, b) => a.stepIndex - b.stepIndex)
    if (order.hasFlow && steps.length > 0) {
      const completed = steps.filter(s => s.status === 'completed').length
      perOrderPercent.push({ percent: (completed / steps.length) * 100, seamstressName: order.seamstressName })

      const avgUnitValue = items.length > 0 ? items.reduce((sum, it) => sum + it.unitValue, 0) / items.length : 0
      for (const step of steps) {
        maxStepIndex = Math.max(maxStepIndex, step.stepIndex)
        const received = step.quantityReceived
        const delivered = step.quantityDelivered ?? (step.status === 'completed' ? step.quantityReceived : 0)
        const loss = step.status === 'completed' ? Math.max(0, received - delivered) : 0

        const key = step.seamstressName || 'Sem nome'
        const s = upsertStage(key)
        s.received += received
        s.delivered += delivered
        s.loss += loss
        s.valueProduced += delivered * avgUnitValue
        if (step.status === 'completed' && step.completedAt) {
          addStageDays(key, daysBetweenDates(step.createdAt, step.completedAt))
        }

        const chartQty = (step.status === 'completed' ? delivered : received)
        chartByIndex.set(step.stepIndex, (chartByIndex.get(step.stepIndex) ?? 0) + chartQty)
        if (!chartLabelByIndex.has(step.stepIndex)) chartLabelByIndex.set(step.stepIndex, key)
      }
    } else {
      const percent = order.status === 'concluida' ? 100
        : order.status === 'cancelada' ? 0
        : orderInitial > 0 ? (orderDelivered / orderInitial) * 100 : 0
      perOrderPercent.push({ percent, seamstressName: order.seamstressName })

      const key = order.seamstressName || 'Sem nome'
      const s = upsertStage(key)
      s.received += orderInitial
      s.delivered += orderDelivered
      s.loss += Math.max(0, orderInitial - orderDelivered)
      s.valueProduced += orderValueProduced
      addStageDays(key, daysBetweenDates(order.requestDate, end))
    }
  }

  for (const name of stageOrder) {
    const d = stageDays.get(name)
    if (d && d.count > 0) stageMap.get(name)!.avgDays = Math.round((d.sum / d.count) * 10) / 10
  }

  const avgDays = daysCount > 0 ? Math.round((sumDays / daysCount) * 10) / 10 : null
  const percentComplete = perOrderPercent.length > 0
    ? Math.round(perOrderPercent.reduce((s, p) => s + p.percent, 0) / perOrderPercent.length)
    : 0

  const bottleneck = perOrderPercent.length > 0
    ? perOrderPercent.reduce((min, p) => (p.percent < min.percent ? p : min))
    : undefined
  const currentSeamstressName = bottleneck?.seamstressName ?? '—'

  const totalLoss = Math.max(0, initialQuantity - currentQuantity)
  const efficiency = initialQuantity > 0 ? Math.round((currentQuantity / initialQuantity) * 1000) / 10 : 0

  const deadlines = orders.map(o => o.deadline).filter((d): d is string => !!d).sort()
  const deadline = deadlines[0]
  const isLate = !!deadline && deadline < today

  const stepPoints: FlowGroupChartPoint[] = []
  for (let i = 0; i <= maxStepIndex; i++) {
    if (!chartByIndex.has(i)) continue
    stepPoints.push({ label: chartLabelByIndex.get(i) ?? `Etapa ${i + 1}`, quantity: chartByIndex.get(i)! })
  }
  const chartPoints: FlowGroupChartPoint[] = [
    { label: 'Início', quantity: initialQuantity },
    ...stepPoints,
    { label: 'Atual', quantity: currentQuantity },
  ]

  const stages: FlowGroupStage[] = stageOrder.map(name => stageMap.get(name)!)

  return {
    group, orderIds, orderCount: orders.length,
    initialQuantity, currentQuantity, totalLoss, efficiency, percentComplete,
    avgDays, valueProduced, valueLost,
    currentSeamstressName, deadline, isLate,
    stages, chartPoints,
  }
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
  // The DB has no ON DELETE CASCADE for delivery_items → order_items, so we
  // must delete in dependency order manually.

  // 1. Get order item ids to target delivery_items that reference them
  const { data: orderItems } = await db()
    .from('production_order_items')
    .select('id')
    .eq('order_id', id)
  const orderItemIds = (orderItems ?? []).map((r: { id: string }) => r.id)

  // 2. Delete delivery_items referencing those order items
  if (orderItemIds.length > 0) {
    const { error: e1 } = await db()
      .from('production_delivery_items')
      .delete()
      .in('order_item_id', orderItemIds)
    if (e1) throw e1
  }

  // 3. Delete delivery_items referencing deliveries of this order (safety net)
  const { data: deliveries } = await db()
    .from('production_deliveries')
    .select('id')
    .eq('order_id', id)
  const deliveryIds = (deliveries ?? []).map((r: { id: string }) => r.id)
  if (deliveryIds.length > 0) {
    await db()
      .from('production_delivery_items')
      .delete()
      .in('delivery_id', deliveryIds)
  }

  // 4. Delete deliveries
  await db().from('production_deliveries').delete().eq('order_id', id)

  // 5. Delete order items
  await db().from('production_order_items').delete().eq('order_id', id)

  // 6. Delete the order itself
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
  let q = db().from('production_payments').select(
    '*, production_payment_items(*), production_payment_adjustments(*), production_payment_orders(order_id)'
  )
  if (seamstressId) q = q.eq('seamstress_id', seamstressId)
  const { data } = await q.order('reference_month', { ascending: false })
  return (data ?? []).map(r => {
    const { production_payment_items, production_payment_adjustments, production_payment_orders, ...rest } = r as Record<string, unknown>
    const p = mapRow<ProductionPayment>(rest)
    p.items = rows<ProductionPaymentItem>(production_payment_items as unknown[])
    p.adjustments = rows<ProductionPaymentAdjustment>(production_payment_adjustments as unknown[])
    p.orderIds = ((production_payment_orders ?? []) as Record<string, unknown>[]).map(o => o.order_id as string)
    return p
  })
}

/** Ordens da costureira ainda não incluídas em nenhum fechamento, com o
 *  valor já entregue (peças × valor unitário) calculado por ordem. */
export async function getUnpaidOrders(seamstressId: string): Promise<UnpaidProductionOrder[]> {
  const { data } = await db()
    .from('production_orders')
    .select('*, production_order_items(*)')
    .eq('seamstress_id', seamstressId)
    .is('production_payment_id', null)
    .not('status', 'eq', 'cancelada')
    .order('request_date', { ascending: false })

  return ((data ?? []) as Record<string, unknown>[]).map(r => {
    const { production_order_items, ...rest } = r
    const order = mapRow<ProductionOrder>(rest)
    order.items = rows<ProductionOrderItem>(production_order_items as unknown[])
    const pieces = order.items.reduce((s, it) => s + it.deliveredQty, 0)
    const value = order.items.reduce((s, it) => s + it.deliveredQty * it.unitValue, 0)
    return { order, pieces, value }
  })
}

export async function createProductionPayment(
  input: {
    seamstressId: string
    seamstressName: string
    referenceMonth: string
    orderIds: string[]
    adjustments: { type: ProductionAdjustmentType; amount: number; reason: string; notes?: string }[]
    notes?: string
  },
  userId?: string, userName?: string,
): Promise<ProductionPayment> {
  if (input.orderIds.length === 0) throw new Error('Selecione ao menos uma ordem para o fechamento')

  const { data: ordersData, error: oe } = await db()
    .from('production_orders')
    .select('*, production_order_items(*)')
    .in('id', input.orderIds)
  if (oe) throw oe

  const orders = ((ordersData ?? []) as Record<string, unknown>[]).map(r => {
    const { production_order_items, ...rest } = r
    const order = mapRow<ProductionOrder>(rest)
    order.items = rows<ProductionOrderItem>(production_order_items as unknown[])
    return order
  })
  const alreadyPaid = orders.find(o => o.productionPaymentId)
  if (alreadyPaid) throw new Error('Uma das ordens selecionadas já foi paga em outro fechamento')

  // Agrega os itens entregues de todas as ordens selecionadas por produto
  // (mantém a tabela do recibo em PDF já existente).
  const itemMap = new Map<string, { productName: string; quantity: number; unitValue: number }>()
  for (const order of orders) {
    for (const it of order.items ?? []) {
      if (it.deliveredQty <= 0) continue
      const key = `${it.productName}__${it.unitValue}`
      const cur = itemMap.get(key) ?? { productName: it.productName, quantity: 0, unitValue: it.unitValue }
      cur.quantity += it.deliveredQty
      itemMap.set(key, cur)
    }
  }
  const items = Array.from(itemMap.values())
  const productionAmount = items.reduce((s, it) => s + it.quantity * it.unitValue, 0)

  const totalAcrescimos = input.adjustments.filter(a => a.type === 'acrescimo').reduce((s, a) => s + a.amount, 0)
  const totalDescontos = input.adjustments.filter(a => a.type === 'desconto').reduce((s, a) => s + a.amount, 0)
  const totalAmount = Math.max(0, productionAmount + totalAcrescimos - totalDescontos)

  const { data, error } = await db().from('production_payments').insert({
    seamstress_id: input.seamstressId,
    seamstress_name: input.seamstressName,
    reference_month: input.referenceMonth,
    production_amount: productionAmount,
    total_acrescimos: totalAcrescimos,
    total_descontos: totalDescontos,
    total_amount: totalAmount,
    status: 'pendente',
    notes: input.notes ?? null,
    created_by: userId ?? null,
  }).select().single()
  if (error) throw error

  const payment = mapRow<ProductionPayment>(data as Record<string, unknown>)

  if (items.length > 0) {
    await db().from('production_payment_items').insert(items.map(it => ({
      payment_id: payment.id,
      product_name: it.productName,
      quantity: it.quantity,
      unit_value: it.unitValue,
    })))
  }

  await db().from('production_payment_orders').insert(
    input.orderIds.map(orderId => ({ payment_id: payment.id, order_id: orderId }))
  )

  if (input.adjustments.length > 0) {
    await db().from('production_payment_adjustments').insert(input.adjustments.map(a => ({
      payment_id: payment.id,
      type: a.type,
      amount: a.amount,
      reason: a.reason,
      notes: a.notes ?? null,
      created_by: userId ?? null,
      created_by_name: userName ?? null,
    })))
  }

  // Marca as ordens selecionadas como pagas neste fechamento — não podem
  // mais aparecer disponíveis em um novo fechamento.
  await db().from('production_orders')
    .update({ production_payment_id: payment.id })
    .in('id', input.orderIds)

  const adjustmentsDesc = input.adjustments.length > 0
    ? ' | Ajustes: ' + input.adjustments.map(a =>
        `${a.type === 'acrescimo' ? '+' : '−'}${a.amount.toFixed(2)} (${a.reason}${a.notes ? ' — ' + a.notes : ''})`
      ).join('; ')
    : ''
  await audit('create_production_payment', 'production_payments', payment.id,
    `Fechamento criado para ${input.seamstressName} — ${input.referenceMonth} | ${input.orderIds.length} ordem(ns) | ` +
    `Produção R$ ${productionAmount.toFixed(2)} | Acréscimos R$ ${totalAcrescimos.toFixed(2)} | ` +
    `Descontos R$ ${totalDescontos.toFixed(2)} | Total R$ ${totalAmount.toFixed(2)}${adjustmentsDesc}`,
    userId, userName)

  payment.items = items.map((it, i) => ({ id: String(i), paymentId: payment.id, ...it, totalValue: it.quantity * it.unitValue, createdAt: payment.createdAt }))
  payment.orderIds = input.orderIds
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

export async function deleteProductionPayment(
  id: string,
  seamstressName: string,
  referenceMonth: string,
  userId?: string, userName?: string,
): Promise<void> {
  // Libera as ordens deste fechamento — voltam a ficar disponíveis para
  // entrar em um novo fechamento.
  const { error: e0 } = await db()
    .from('production_orders')
    .update({ production_payment_id: null })
    .eq('production_payment_id', id)
  if (e0) throw e0

  // production_payment_items/adjustments/orders têm ON DELETE CASCADE via
  // payment_id, mas apagamos items explicitamente por clareza/compat.
  const { error: e1 } = await db()
    .from('production_payment_items')
    .delete()
    .eq('payment_id', id)
  if (e1) throw e1

  const { error } = await db().from('production_payments').delete().eq('id', id)
  if (error) throw error

  await audit('delete_production_payment', 'production_payments', id,
    `Fechamento de ${seamstressName} (${referenceMonth}) excluído — ordens liberadas para novo fechamento`, userId, userName)
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
  updates: Partial<Omit<ProductionRequest, 'id' | 'createdAt' | 'updatedAt' | 'createAsTask' | 'taskId' | 'createdBy'>>,
  userId?: string, userName?: string,
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.seamstressId   !== undefined) row.seamstress_id   = updates.seamstressId
  if (updates.seamstressName !== undefined) row.seamstress_name = updates.seamstressName
  if (updates.title          !== undefined) row.title           = updates.title
  if (updates.description    !== undefined) row.description     = updates.description ?? null
  if (updates.type           !== undefined) row.type            = updates.type
  if (updates.priority       !== undefined) row.priority        = updates.priority
  if (updates.dueDate        !== undefined) row.due_date        = updates.dueDate ?? null
  if (updates.responsible    !== undefined) row.responsible     = updates.responsible
  if (updates.status         !== undefined) row.status          = updates.status
  if (updates.notes          !== undefined) row.notes           = updates.notes ?? null

  const { error } = await db().from('production_requests').update(row).eq('id', id)
  if (error) throw error

  const action = updates.status === 'concluida' ? 'complete_production_request' : 'update_production_request'
  await audit(action, 'production_requests', id,
    `Solicitação "${updates.title ?? id}" atualizada`, userId, userName)
}

export async function deleteProductionRequest(
  id: string,
  title: string,
  userId?: string, userName?: string,
): Promise<void> {
  await audit('delete_production_request', 'production_requests', id,
    `Solicitação "${title}" excluída`, userId, userName)
  const { error } = await db().from('production_requests').delete().eq('id', id)
  if (error) throw error
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
