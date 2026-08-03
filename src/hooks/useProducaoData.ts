import { useState, useEffect, useCallback } from 'react'
import * as db from '@/services/producaoDB'
import type {
  Seamstress, SeamstressProduct,
  ProductionOrder, ProductionPayment, ProductionRequest,
  UnpaidProductionOrder, FlowGroup, FlowGroupAnalysis, SeamstressFinancialSummary,
} from '@/types'

function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = []
): { data: T | undefined; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fn()
      .then(res => { if (!cancelled) { setData(res); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(err?.message ?? 'Erro'); setLoading(false) } })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, loading, error, refetch }
}

export function useSeamstresses() {
  return useAsync<Seamstress[]>(() => db.getSeamstresses())
}

export function useSeamstress(id: string | undefined) {
  return useAsync<Seamstress | null>(
    () => id ? db.getSeamstressById(id) : Promise.resolve(null),
    [id]
  )
}

export function useSeamstressProducts(seamstressId: string | undefined) {
  return useAsync<SeamstressProduct[]>(
    () => seamstressId ? db.getSeamstressProducts(seamstressId) : Promise.resolve([]),
    [seamstressId]
  )
}

export function useProductionOrders() {
  return useAsync<ProductionOrder[]>(() => db.getProductionOrders())
}

export function useProductionOrder(id: string | undefined) {
  return useAsync<ProductionOrder | null>(
    () => id ? db.getProductionOrderById(id) : Promise.resolve(null),
    [id]
  )
}

export function useProductionPayments(seamstressId?: string) {
  return useAsync<ProductionPayment[]>(
    () => db.getProductionPayments(seamstressId),
    [seamstressId]
  )
}

export function useProductionRequests(seamstressId?: string) {
  return useAsync<ProductionRequest[]>(
    () => db.getProductionRequests(seamstressId),
    [seamstressId]
  )
}

export function useProductionDashboard(range?: { from: string | null; to: string | null }) {
  return useAsync(() => db.getProductionDashboardKPIs(range), [range?.from, range?.to])
}

export function useProductionMonthlyData() {
  return useAsync(() => db.getProductionMonthlyData())
}

export function useProductionBySeamstress() {
  return useAsync(() => db.getProductionBySeamstress())
}

export function useOrdersForImport() {
  return useAsync<ProductionOrder[]>(() => db.getOrdersForImport())
}

export function useUnpaidOrders(seamstressId: string | undefined) {
  return useAsync<UnpaidProductionOrder[]>(
    () => seamstressId ? db.getUnpaidOrders(seamstressId) : Promise.resolve([]),
    [seamstressId]
  )
}

export function useOrdersByIds(orderIds: string[]) {
  const key = orderIds.slice().sort().join(',')
  return useAsync<UnpaidProductionOrder[]>(
    () => orderIds.length > 0 ? db.getOrdersByIds(orderIds) : Promise.resolve([]),
    [key]
  )
}

export function useSeamstressFinancialSummaries() {
  return useAsync<SeamstressFinancialSummary[]>(() => db.getSeamstressFinancialSummaries())
}

export function useFlowGroups() {
  return useAsync<FlowGroup[]>(() => db.getFlowGroups())
}

export function useFlowGroupAnalysis(groupId: string | undefined) {
  return useAsync<FlowGroupAnalysis | null>(
    () => groupId ? db.getFlowGroupAnalysis(groupId) : Promise.resolve(null),
    [groupId]
  )
}

export function useOrdersForFlowGroup() {
  return useAsync<ProductionOrder[]>(() => db.getOrdersForFlowGroup())
}
