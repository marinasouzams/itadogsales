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
  SeamstressFinancialSummary, SeamstressPaymentStatus,
  ProductionRequest,
  FlowStep,
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
    referenceMonth?: string
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
    reference_month: input.referenceMonth || input.requestDate.slice(0, 7),
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
    referenceMonth?: string
    items: { id?: string; seamstressProductId?: string; productName: string; quantity: number; unitValue: number }[]
  },
  userId?: string, userName?: string,
): Promise<void> {
  // Atualiza campos da ordem
  const { error } = await db().from('production_orders').update({
    deadline: input.deadline ?? null,
    notes: input.notes ?? null,
    ...(input.referenceMonth ? { reference_month: input.referenceMonth } : {}),
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

/** Ordens específicas por ID (com o valor entregue calculado) — usada para
 *  reexibir, na edição de um fechamento, as ordens que já estão vinculadas
 *  a ele (essas não aparecem em getUnpaidOrders, pois já têm payment_id). */
export async function getOrdersByIds(orderIds: string[]): Promise<UnpaidProductionOrder[]> {
  if (orderIds.length === 0) return []
  const { data } = await db()
    .from('production_orders')
    .select('*, production_order_items(*)')
    .in('id', orderIds)
  return ((data ?? []) as Record<string, unknown>[]).map(r => {
    const { production_order_items, ...rest } = r
    const order = mapRow<ProductionOrder>(rest)
    order.items = rows<ProductionOrderItem>(production_order_items as unknown[])
    const pieces = order.items.reduce((s, it) => s + it.deliveredQty, 0)
    const value = order.items.reduce((s, it) => s + it.deliveredQty * it.unitValue, 0)
    return { order, pieces, value }
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

/** Data do dia-padrão de pagamento no mês de `ref`, ajustando para o último
 *  dia do mês quando este for mais curto (ex: dia 31 em fevereiro). */
function paymentDateInMonth(day: number, ref: Date): string {
  const y = ref.getFullYear()
  const m = ref.getMonth()
  const lastDay = new Date(y, m + 1, 0).getDate()
  const d = Math.min(day, lastDay)
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function addMonths(ref: Date, n: number): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + n, 1)
}

/** Painel do topo de Pagamentos: para cada costureira ativa, quanto ela
 *  tem a receber (ordens ainda não incluídas em nenhum fechamento), a
 *  próxima data prevista de pagamento (a partir do dia-padrão cadastrado)
 *  e o status/alerta correspondente. */
export async function getSeamstressFinancialSummaries(): Promise<SeamstressFinancialSummary[]> {
  const { data: seamstressData } = await db()
    .from('seamstresses')
    .select('*')
    .eq('status', 'ativa')
    .order('name')
  const seamstresses = rows<Seamstress>(seamstressData)
  if (seamstresses.length === 0) return []

  const [ordersRes, paymentsRes] = await Promise.all([
    db().from('production_orders')
      .select('seamstress_id, production_order_items(quantity, delivered_qty, unit_value)')
      .in('seamstress_id', seamstresses.map(s => s.id))
      .is('production_payment_id', null)
      .not('status', 'eq', 'cancelada'),
    db().from('production_payments')
      .select('seamstress_id, reference_month, status')
      .in('seamstress_id', seamstresses.map(s => s.id)),
  ])

  const bySeamstress = new Map<string, { orders: number; value: number; pieces: number }>()
  for (const raw of (ordersRes.data ?? []) as Record<string, unknown>[]) {
    const seamstressId = raw.seamstress_id as string
    const items = (raw.production_order_items as Record<string, unknown>[]) ?? []
    const value = items.reduce((s, it) => s + (Number(it.delivered_qty) || 0) * (Number(it.unit_value) || 0), 0)
    const pieces = items.reduce((s, it) => s + (Number(it.delivered_qty) || 0), 0)
    const cur = bySeamstress.get(seamstressId) ?? { orders: 0, value: 0, pieces: 0 }
    cur.orders += 1
    cur.value += value
    cur.pieces += pieces
    bySeamstress.set(seamstressId, cur)
  }

  // Competências já pagas por costureira (para o status "Pago").
  const paidMonths = new Map<string, Set<string>>()
  for (const raw of (paymentsRes.data ?? []) as Record<string, unknown>[]) {
    if (raw.status !== 'pago') continue
    const seamstressId = raw.seamstress_id as string
    if (!paidMonths.has(seamstressId)) paidMonths.set(seamstressId, new Set())
    paidMonths.get(seamstressId)!.add(raw.reference_month as string)
  }

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  return seamstresses.map(s => {
    const agg = bySeamstress.get(s.id) ?? { orders: 0, value: 0, pieces: 0 }
    const paid = paidMonths.get(s.id) ?? new Set<string>()

    if (!s.paymentDay) {
      return {
        seamstressId: s.id, seamstressName: s.name, photoUrl: s.photoUrl, paymentDay: undefined,
        nextPaymentDate: undefined, daysUntilPayment: undefined,
        pendingValue: agg.value, pendingOrders: agg.orders, pendingPieces: agg.pieces,
        status: 'em_dia' as SeamstressPaymentStatus,
      }
    }

    const thisMonth = paymentDateInMonth(s.paymentDay, today)
    const thisCompetencia = thisMonth.slice(0, 7)
    const thisPaid = paid.has(thisCompetencia)

    let nextPaymentDate = thisMonth
    // Já passou a data deste mês: só rola pro mês seguinte se a competência
    // já foi paga OU não há mais nada pendente (senão continua "atrasado").
    if (thisMonth < todayStr && (thisPaid || agg.value <= 0.004)) {
      nextPaymentDate = paymentDateInMonth(s.paymentDay, addMonths(today, 1))
    }
    const daysUntilPayment = Math.round(
      (new Date(nextPaymentDate + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000
    )

    let status: SeamstressPaymentStatus
    if (thisPaid && nextPaymentDate === thisMonth) status = 'pago'
    else if (daysUntilPayment < 0) status = 'atrasado'
    else if (daysUntilPayment === 0) status = 'vence_hoje'
    else if (daysUntilPayment <= 5) status = 'proximo'
    else status = 'em_dia'

    return {
      seamstressId: s.id, seamstressName: s.name, photoUrl: s.photoUrl, paymentDay: s.paymentDay,
      nextPaymentDate, daysUntilPayment,
      pendingValue: agg.value, pendingOrders: agg.orders, pendingPieces: agg.pieces,
      status,
    }
  })
}

export interface ManualPaymentItemInput {
  productName: string
  seamstressProductId?: string
  productionDate?: string
  quantity: number
  unitValue: number
  notes?: string
}

export interface PaymentAdjustmentInput {
  type: ProductionAdjustmentType
  amount: number
  reason: string
  notes?: string
}

export interface ProductionPaymentInput {
  seamstressId: string
  seamstressName: string
  referenceMonth: string
  closingDate?: string
  expectedPaymentDate?: string
  orderIds: string[]
  manualItems: ManualPaymentItemInput[]
  adjustments: PaymentAdjustmentInput[]
  notes?: string
}

type PaymentItemRow = {
  order_id: string | null
  seamstress_product_id: string | null
  product_name: string
  production_date: string | null
  quantity: number
  unit_value: number
  notes: string | null
  source: 'ordem' | 'manual'
}

/** Monta as linhas do fechamento (ordens + manuais) e os totais derivados.
 *  Usada tanto na criação quanto na edição — valida que nenhuma ordem
 *  selecionada já esteja paga em OUTRO fechamento (`excludePaymentId` evita
 *  falso positivo ao reeditar o próprio fechamento que já as detém). */
async function buildPaymentItemsAndTotals(
  input: Pick<ProductionPaymentInput, 'orderIds' | 'manualItems' | 'adjustments'>,
  excludePaymentId?: string,
): Promise<{ itemRows: PaymentItemRow[]; productionFromOrders: number; productionFromManual: number; productionAmount: number; totalAcrescimos: number; totalDescontos: number; totalAmount: number }> {
  if (input.orderIds.length === 0 && input.manualItems.length === 0) {
    throw new Error('Selecione ao menos uma Ordem ou adicione um lançamento manual')
  }

  const itemRows: PaymentItemRow[] = []
  let productionFromOrders = 0

  if (input.orderIds.length > 0) {
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
    const alreadyPaid = orders.find(o => o.productionPaymentId && o.productionPaymentId !== excludePaymentId)
    if (alreadyPaid) throw new Error('Uma das ordens selecionadas já foi paga em outro fechamento')

    for (const order of orders) {
      for (const it of order.items ?? []) {
        if (it.deliveredQty <= 0) continue
        itemRows.push({
          order_id: order.id,
          seamstress_product_id: it.seamstressProductId ?? null,
          product_name: it.productName,
          production_date: null,
          quantity: it.deliveredQty,
          unit_value: it.unitValue,
          notes: null,
          source: 'ordem',
        })
        productionFromOrders += it.deliveredQty * it.unitValue
      }
    }
  }

  let productionFromManual = 0
  for (const mi of input.manualItems) {
    itemRows.push({
      order_id: null,
      seamstress_product_id: mi.seamstressProductId ?? null,
      product_name: mi.productName,
      production_date: mi.productionDate ?? null,
      quantity: mi.quantity,
      unit_value: mi.unitValue,
      notes: mi.notes ?? null,
      source: 'manual',
    })
    productionFromManual += mi.quantity * mi.unitValue
  }

  const productionAmount = productionFromOrders + productionFromManual
  const totalAcrescimos = input.adjustments.filter(a => a.type === 'acrescimo').reduce((s, a) => s + a.amount, 0)
  const totalDescontos = input.adjustments.filter(a => a.type === 'desconto').reduce((s, a) => s + a.amount, 0)
  const totalAmount = Math.max(0, productionAmount + totalAcrescimos - totalDescontos)

  return { itemRows, productionFromOrders, productionFromManual, productionAmount, totalAcrescimos, totalDescontos, totalAmount }
}

function describePaymentAudit(input: ProductionPaymentInput, totals: { productionFromOrders: number; productionFromManual: number; totalAcrescimos: number; totalDescontos: number; totalAmount: number }): string {
  const adjustmentsDesc = input.adjustments.length > 0
    ? ' | Ajustes: ' + input.adjustments.map(a =>
        `${a.type === 'acrescimo' ? '+' : '−'}${a.amount.toFixed(2)} (${a.reason}${a.notes ? ' — ' + a.notes : ''})`
      ).join('; ')
    : ''
  return `${input.orderIds.length} ordem(ns) + ${input.manualItems.length} lançamento(s) manual(is) | ` +
    `Produção por Ordens R$ ${totals.productionFromOrders.toFixed(2)} | Produção Manual R$ ${totals.productionFromManual.toFixed(2)} | ` +
    `Acréscimos R$ ${totals.totalAcrescimos.toFixed(2)} | Descontos R$ ${totals.totalDescontos.toFixed(2)} | ` +
    `Total R$ ${totals.totalAmount.toFixed(2)}${adjustmentsDesc}`
}

export async function createProductionPayment(
  input: ProductionPaymentInput,
  userId?: string, userName?: string,
): Promise<ProductionPayment> {
  const totals = await buildPaymentItemsAndTotals(input)

  const { data, error } = await db().from('production_payments').insert({
    seamstress_id: input.seamstressId,
    seamstress_name: input.seamstressName,
    reference_month: input.referenceMonth,
    closing_date: input.closingDate ?? new Date().toISOString().slice(0, 10),
    expected_payment_date: input.expectedPaymentDate ?? null,
    production_amount: totals.productionAmount,
    total_acrescimos: totals.totalAcrescimos,
    total_descontos: totals.totalDescontos,
    total_amount: totals.totalAmount,
    status: 'pendente',
    notes: input.notes ?? null,
    created_by: userId ?? null,
  }).select().single()
  if (error) throw error

  const payment = mapRow<ProductionPayment>(data as Record<string, unknown>)

  if (totals.itemRows.length > 0) {
    const { error: ie } = await db().from('production_payment_items').insert(
      totals.itemRows.map(r => ({ ...r, payment_id: payment.id }))
    )
    if (ie) throw ie
  }

  if (input.orderIds.length > 0) {
    await db().from('production_payment_orders').insert(
      input.orderIds.map(orderId => ({ payment_id: payment.id, order_id: orderId }))
    )
    await db().from('production_orders').update({ production_payment_id: payment.id }).in('id', input.orderIds)
  }

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

  await audit('create_production_payment', 'production_payments', payment.id,
    `Fechamento criado para ${input.seamstressName} — competência ${input.referenceMonth} | ${describePaymentAudit(input, totals)}`,
    userId, userName)

  payment.items = totals.itemRows.map((r, i) => ({
    id: String(i), paymentId: payment.id, orderId: r.order_id ?? undefined,
    seamstressProductId: r.seamstress_product_id ?? undefined, productName: r.product_name,
    productionDate: r.production_date ?? undefined, quantity: r.quantity, unitValue: r.unit_value,
    totalValue: r.quantity * r.unit_value, notes: r.notes ?? undefined, source: r.source, createdAt: payment.createdAt,
  }))
  payment.orderIds = input.orderIds
  payment.productionFromOrders = totals.productionFromOrders
  payment.productionFromManual = totals.productionFromManual
  return payment
}

export async function getProductionPaymentById(id: string): Promise<ProductionPayment | null> {
  const { data } = await db().from('production_payments')
    .select('*, production_payment_items(*), production_payment_adjustments(*), production_payment_orders(order_id)')
    .eq('id', id).single()
  if (!data) return null
  const { production_payment_items, production_payment_adjustments, production_payment_orders, ...rest } = data as Record<string, unknown>
  const p = mapRow<ProductionPayment>(rest)
  p.items = rows<ProductionPaymentItem>(production_payment_items as unknown[])
  p.adjustments = rows<ProductionPaymentAdjustment>(production_payment_adjustments as unknown[])
  p.orderIds = ((production_payment_orders ?? []) as Record<string, unknown>[]).map(o => o.order_id as string)
  p.productionFromOrders = p.items.filter(i => i.source === 'ordem').reduce((s, i) => s + i.totalValue, 0)
  p.productionFromManual = p.items.filter(i => i.source === 'manual').reduce((s, i) => s + i.totalValue, 0)
  return p
}

/** Reabre um fechamento existente para edição: substitui itens, ordens
 *  vinculadas e ajustes pelo novo conjunto informado. Ordens antes
 *  vinculadas são liberadas primeiro (podem ou não voltar a entrar). */
export async function updateProductionPayment(
  paymentId: string,
  input: ProductionPaymentInput,
  userId?: string, userName?: string,
): Promise<void> {
  const { data: currentData, error: ce } = await db().from('production_payments').select('*').eq('id', paymentId).single()
  if (ce || !currentData) throw new Error('Fechamento não encontrado')
  const current = mapRow<ProductionPayment>(currentData as Record<string, unknown>)

  // Libera as ordens antigas ANTES de validar as novas (uma ordem que já
  // estava neste fechamento não deve contar como "de outro fechamento").
  await db().from('production_orders').update({ production_payment_id: null }).eq('production_payment_id', paymentId)

  const totals = await buildPaymentItemsAndTotals(input, paymentId)

  await db().from('production_payment_orders').delete().eq('payment_id', paymentId)
  await db().from('production_payment_items').delete().eq('payment_id', paymentId)
  await db().from('production_payment_adjustments').delete().eq('payment_id', paymentId)

  const { error } = await db().from('production_payments').update({
    seamstress_id: input.seamstressId,
    seamstress_name: input.seamstressName,
    reference_month: input.referenceMonth,
    closing_date: input.closingDate ?? current.closingDate ?? null,
    expected_payment_date: input.expectedPaymentDate ?? null,
    production_amount: totals.productionAmount,
    total_acrescimos: totals.totalAcrescimos,
    total_descontos: totals.totalDescontos,
    total_amount: totals.totalAmount,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', paymentId)
  if (error) throw error

  if (totals.itemRows.length > 0) {
    await db().from('production_payment_items').insert(totals.itemRows.map(r => ({ ...r, payment_id: paymentId })))
  }
  if (input.orderIds.length > 0) {
    await db().from('production_payment_orders').insert(input.orderIds.map(orderId => ({ payment_id: paymentId, order_id: orderId })))
    await db().from('production_orders').update({ production_payment_id: paymentId }).in('id', input.orderIds)
  }
  if (input.adjustments.length > 0) {
    await db().from('production_payment_adjustments').insert(input.adjustments.map(a => ({
      payment_id: paymentId, type: a.type, amount: a.amount, reason: a.reason, notes: a.notes ?? null,
      created_by: userId ?? null, created_by_name: userName ?? null,
    })))
  }

  const wasPaid = current.status === 'pago'
  await audit('update_production_payment', 'production_payments', paymentId,
    `Fechamento de ${input.seamstressName} editado${wasPaid ? ' (JÁ ESTAVA PAGO)' : ''} — competência ${current.referenceMonth} → ${input.referenceMonth} | ` +
    `Total anterior R$ ${current.totalAmount.toFixed(2)} → novo R$ ${totals.totalAmount.toFixed(2)} | ${describePaymentAudit(input, totals)}`,
    userId, userName)
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

export async function getProductionDashboardKPIs(range?: { from: string | null; to: string | null }): Promise<{
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
  const from = range?.from ?? null
  const to = range?.to ?? null
  const inRange = (d: string | null | undefined) => !d ? false : (!from || d >= from) && (!to || d <= to)
  const monthInRange = (m: string | null | undefined) => !m ? false : (!from || m >= from.slice(0, 7)) && (!to || m <= to.slice(0, 7))

  const [orders, payments, seamstresses, requests, deliveryItems] = await Promise.all([
    db().from('production_orders').select('id, status, deadline, request_date, reference_month'),
    db().from('production_payments').select('status, total_amount, reference_month'),
    db().from('seamstresses').select('id, status'),
    db().from('production_requests').select('id, status'),
    db().from('production_delivery_items').select('quantity_delivered, production_deliveries!inner(delivery_date)'),
  ])

  const allOrders = (orders.data ?? []) as Record<string, unknown>[]
  const allPayments = (payments.data ?? []) as Record<string, unknown>[]
  const allSeamstresses = (seamstresses.data ?? []) as Record<string, unknown>[]
  const allRequests = (requests.data ?? []) as Record<string, unknown>[]

  // Ordens: escopadas pela competência explícita (com fallback ao mês da solicitação para ordens antigas).
  const orderMonth = (o: Record<string, unknown>) => (o.reference_month as string) || (o.request_date as string)?.slice(0, 7)
  const ordersInRange = allOrders.filter(o => monthInRange(orderMonth(o)))

  const ordensEmProducao = ordersInRange.filter(o =>
    ['solicitada', 'em_producao', 'parcialmente_entregue'].includes(o.status as string)
  ).length

  const ordensAtrasadas = ordersInRange.filter(o =>
    o.deadline && (o.deadline as string) < today &&
    !['concluida', 'cancelada'].includes(o.status as string)
  ).length

  // Costureiras ativas e solicitações pendentes são estado ATUAL — não fazem
  // sentido fatiados por competência passada, então continuam globais.
  const costureirasAtivas = allSeamstresses.filter(s => s.status === 'ativa').length
  const solicitacoesPendentes = allRequests.filter(r =>
    ['pendente', 'em_andamento', 'aguardando'].includes(r.status as string)
  ).length

  const paymentsInRange = allPayments.filter(p => monthInRange(p.reference_month as string))
  const producaoDoMes = paymentsInRange.reduce((s, p) => s + (p.total_amount as number ?? 0), 0)

  const valorAPagar = paymentsInRange
    .filter(p => p.status === 'pendente')
    .reduce((s, p) => s + (p.total_amount as number ?? 0), 0)

  const valorPago = paymentsInRange
    .filter(p => p.status === 'pago')
    .reduce((s, p) => s + (p.total_amount as number ?? 0), 0)

  // Peças produzidas — soma dos itens entregues com data de entrega na competência.
  const pecasProduzidas = ((deliveryItems.data ?? []) as Record<string, unknown>[])
    .filter(it => inRange((it.production_deliveries as Record<string, unknown>)?.delivery_date as string))
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
