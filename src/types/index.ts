export type UserRole = 'admin' | 'rep'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatar?: string
  phone?: string
  region?: string
  territory?: string[]
  active: boolean
  createdAt: string
  meta?: number
  metaAting?: number
}

export type ClientType = 'fazenda' | 'cooperativa' | 'agropecuaria' | 'distribuidor' | 'revendedor'
export type ClientStatus = 'ativo' | 'inativo' | 'prospecto'
export type Priority = 'alta' | 'media' | 'baixa'

export interface ClientAddress {
  street: string
  city: string
  state: string
  zipCode: string
  lat: number
  lng: number
}

export interface Client {
  id: string
  name: string
  tradeName?: string
  cnpj?: string
  cpf?: string
  type: ClientType
  repId: string
  address: ClientAddress
  phone: string
  email?: string
  status: ClientStatus
  segment: string
  lastVisit?: string
  lastOrder?: string
  totalOrders: number
  totalRevenue: number
  priority: Priority
  notes?: string
  createdAt: string
  distance?: number
}

export interface Product {
  id: string
  code: string
  name: string
  category: string
  price: number
  unit: string
  stock: number
  blingId?: string
  image?: string
}

export type OrderStatus = 'rascunho' | 'enviado' | 'aprovado' | 'faturado' | 'pronto_entrega' | 'cancelado'
export type SyncStatus = 'pendente' | 'sincronizando' | 'sincronizado' | 'erro'

export interface OrderItem {
  productId: string
  productName: string
  quantity: number
  price: number
  discount: number
  total: number
}

export interface Order {
  id: string
  number: string
  clientId: string
  clientName: string
  clientCity?: string
  repId: string
  repName: string
  status: OrderStatus
  syncStatus: SyncStatus
  items: OrderItem[]
  subtotal: number
  discount: number
  total: number
  paymentTerms?: string
  deliveryDate?: string
  notes?: string
  createdAt: string
  updatedAt: string
  blingOrderId?: string
}

export type VisitStatus = 'agendada' | 'em_andamento' | 'concluida' | 'cancelada'
export type VisitResult = 'positivo' | 'negativo' | 'neutro' | 'reagendado'

export interface CheckPoint {
  lat: number
  lng: number
  timestamp: string
}

export interface Visit {
  id: string
  clientId: string
  clientName: string
  clientCity?: string
  repId: string
  repName: string
  status: VisitStatus
  checkIn?: CheckPoint
  checkOut?: CheckPoint
  result?: VisitResult
  notes?: string
  rating?: number
  nextVisit?: string
  duration?: number
  orderId?: string
  createdAt: string
}

export type ProspectStatus = 'disponivel' | 'assumido' | 'convertido' | 'descartado'

export interface Prospect {
  id: string
  name: string
  contact: string
  phone: string
  email?: string
  city: string
  state: string
  region?: string
  segment: string
  status: ProspectStatus
  repId?: string
  repName?: string
  notes?: string
  source?: string
  estimatedRevenue?: number
  createdAt: string
  attempts?: number
}

export type CommissionStatus = 'prevista' | 'aprovada' | 'paga' | 'cancelada'

export interface Commission {
  id: string
  repId: string
  repName: string
  orderId: string
  orderNumber: string
  clientName: string
  clientId?: string
  orderTotal: number
  rate: number
  amount: number
  status: CommissionStatus
  referenceMonth: string
  paidAt?: string
  createdAt: string
}

export type AuditAction =
  | 'login'
  | 'logout'
  | 'create_order'
  | 'update_order'
  | 'cancel_order'
  | 'create_visit'
  | 'checkin'
  | 'checkout'
  | 'update_client'
  | 'assume_prospect'
  | 'convert_prospect'
  | 'sync_bling'
  | 'transfer_client'

export interface AuditLog {
  id: string
  userId: string
  userName: string
  userRole: UserRole
  action: AuditAction
  entity: string
  entityId: string
  description: string
  oldValue?: string
  newValue?: string
  ip?: string
  timestamp: string
}

export type BlingEntityType = 'produtos' | 'clientes' | 'pedidos' | 'estoque' | 'tabelas'
export type BlingStatus = 'pendente' | 'sincronizando' | 'sincronizado' | 'erro'

export interface BlingSync {
  id: string
  entity: BlingEntityType
  status: BlingStatus
  total: number
  synced: number
  errors: number
  lastSync?: string
  nextSync?: string
  errorMessage?: string
}

export interface RouteClient extends Client {
  routeOrder: number
  estimatedTime: number
  daysSinceVisit: number
  daysSinceOrder: number
}

export interface DashboardKPIs {
  faturamento: number
  faturamentoMeta: number
  pedidos: number
  visitas: number
  conversao: number
  ticketMedio: number
  clientesAtivos: number
  comissoesPendentes: number
}

// Interactions
export type InteractionType =
  | 'visita'
  | 'checkin'
  | 'checkout'
  | 'pedido'
  | 'orcamento'
  | 'rota'
  | 'ligacao'
  | 'whatsapp'
  | 'anotacao'

export interface Interaction {
  id: string
  clientId: string
  clientName: string
  repId: string
  repName: string
  type: InteractionType
  title: string
  description?: string
  rating?: number
  relatedId?: string
  timestamp: string
}

// Route session
export interface RouteSession {
  id: string
  repId: string
  repName: string
  date: string
  city: string
  clientIds: string[]
  checkedInIds: string[]
  status: 'ativa' | 'concluida'
  createdAt: string
}
