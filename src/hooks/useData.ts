/**
 * Hooks de dados — wrappam services/db.ts com loading/error/refetch
 */
import { useState, useEffect, useCallback } from 'react'
import * as db from '@/services/db'
import type {
  Client, Order, Visit, Prospect, Commission,
  AuditLog, Interaction, Product, User, CompanySettings,
  ProductCategory, ProductSubcategory,
  ProductAttribute, ProductAttributeValue, ProductAttributeAssignment,
} from '@/types'

// ── genérico ─────────────────────────────────────────────────
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

// ── USERS ────────────────────────────────────────────────────
export function useUsers() {
  return useAsync<User[]>(() => db.getUsers())
}
export function useUser(id: string | undefined) {
  return useAsync<User | null>(() => id ? db.getUserById(id) : Promise.resolve(null), [id])
}

// ── CLIENTS ──────────────────────────────────────────────────
export function useClients(repId?: string) {
  return useAsync<Client[]>(() => db.getClients(repId), [repId])
}
export function useClient(id: string | undefined) {
  return useAsync<Client | null>(() => id ? db.getClientById(id) : Promise.resolve(null), [id])
}

// ── PRODUCTS ─────────────────────────────────────────────────
export function useProducts() {
  return useAsync<Product[]>(() => db.getProducts())
}

// ── ORDERS ───────────────────────────────────────────────────
export function useOrders(repId?: string) {
  return useAsync<Order[]>(() => db.getOrders(repId), [repId])
}
export function useOrder(id: string | undefined) {
  return useAsync<Order | null>(() => id ? db.getOrderById(id) : Promise.resolve(null), [id])
}

// ── VISITS ───────────────────────────────────────────────────
export function useVisits(repId?: string) {
  return useAsync<Visit[]>(() => db.getVisits(repId), [repId])
}

// ── PROSPECTS ────────────────────────────────────────────────
export function useProspects() {
  return useAsync<Prospect[]>(() => db.getProspects())
}
export function useProspect(id: string | undefined) {
  return useAsync<Prospect | null>(() => id ? db.getProspectById(id) : Promise.resolve(null), [id])
}

// ── COMMISSIONS ──────────────────────────────────────────────
export function useCommissions(repId?: string) {
  return useAsync<Commission[]>(() => db.getCommissions(repId), [repId])
}

// ── INTERACTIONS ─────────────────────────────────────────────
export function useInteractions(clientId?: string, repId?: string) {
  return useAsync<Interaction[]>(
    () => db.getInteractions(clientId, repId),
    [clientId, repId]
  )
}

// ── AUDIT LOGS ───────────────────────────────────────────────
export function useAuditLogs() {
  return useAsync<AuditLog[]>(() => db.getAuditLogs())
}

// ── DASHBOARD ────────────────────────────────────────────────
export function useDashboardKPIs() {
  return useAsync(() => db.getDashboardKPIs())
}
export function useMonthlyRevenue() {
  return useAsync(() => db.getMonthlyRevenue())
}
export function useRepRanking() {
  return useAsync(() => db.getRepRanking())
}
export function useVisitsByDay() {
  return useAsync(() => db.getVisitsByDay())
}
export function useCompanySettings() {
  return useAsync<CompanySettings>(() => db.getCompanySettings())
}
export function useAllProducts() {
  return useAsync<Product[]>(() => db.getAllProducts())
}
export function useProductCategories() {
  return useAsync<ProductCategory[]>(() => db.getProductCategories())
}
export function useProductSubcategories(categoryId?: string) {
  return useAsync<ProductSubcategory[]>(() => db.getProductSubcategories(categoryId), [categoryId])
}
export function useProductAttributes() {
  return useAsync<ProductAttribute[]>(() => db.getProductAttributes())
}
export function useProductAttributeValues(attributeId?: string) {
  return useAsync<ProductAttributeValue[]>(() => db.getProductAttributeValues(attributeId), [attributeId])
}
export function useProductAttributeAssignments(productId: string | undefined) {
  return useAsync<ProductAttributeAssignment[]>(
    () => productId ? db.getProductAttributeAssignments(productId) : Promise.resolve([]),
    [productId]
  )
}
