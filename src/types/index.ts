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
// Aprovação de cadastro — independente do ClientStatus (ativo/inativo/prospecto).
// 'pendente': aguardando revisão do responsável administrativo (padrão ao cadastrar via representante)
// 'aprovado': liberado para realizar pedidos
// 'devolvido': enviado de volta ao representante para correção, com motivo
// 'reprovado': recusado, com motivo
export type ClientApprovalStatus = 'pendente' | 'aprovado' | 'devolvido' | 'reprovado'

export interface ClientAddress {
  street: string
  number?: string
  complement?: string
  neighborhood?: string
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
  stateRegistration?: string
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
  buyerName?: string
  buyerPhone?: string
  buyerWhatsapp?: string
  buyerEmail?: string
  buyerBirthday?: string
  companyAnniversary?: string
  creditLimit?: number
  creditClassification?: 'A+' | 'A' | 'B' | 'C' | 'D' | 'Bloqueado'
  creditNotes?: string
  issuesInvoice?: boolean
  defaultPaymentMethod?: string
  defaultPaymentTerms?: string
  avatarUrl?: string
  foundedAt?: string
  companyType?: string
  cnae?: string
  companyStatus?: string
  approvalStatus: ClientApprovalStatus
  approvalReason?: string
  reviewedBy?: string
  reviewedAt?: string
}

export interface ProductCategory {
  id: string
  name: string
  description?: string
  active: boolean
  createdAt: string
}

export interface ProductSubcategory {
  id: string
  categoryId: string
  categoryName?: string
  name: string
  description?: string
  active: boolean
  createdAt: string
}

export interface ProductAttribute {
  id: string
  name: string
  description?: string
  active: boolean
  createdAt: string
}

export interface ProductAttributeValue {
  id: string
  attributeId: string
  attributeName?: string
  name: string
  active: boolean
  createdAt: string
}

export interface ProductAttributeAssignment {
  id: string
  productId: string
  attributeId: string
  attributeName: string
  values: ProductAttributeValue[]
}

/** Atributo selecionado num item de pedido */
export interface OrderItemAttribute {
  attributeId: string
  attributeName: string
  valueId: string
  valueName: string
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
  active?: boolean
  createdAt?: string
  categoryId?: string
  subcategoryId?: string
  categoryName?: string
  subcategoryName?: string
  /** Kit promocional: ex. MANTA PET (10+1) */
  productType?: 'normal' | 'kit_promocional'
  kitPaidQty?: number      // unidades cobradas por kit (ex: 10)
  kitDeliveredQty?: number // unidades entregues por kit (ex: 11)
}

export type OrderType = 'venda' | 'troca'

export const EXCHANGE_REASONS = [
  'Produto com defeito',
  'Erro de separação',
  'Erro de tamanho',
  'Erro de cor',
  'Garantia',
  'Troca comercial',
  'Outro',
] as const

export type OrderStatus =
  | 'draft'
  | 'generated'
  | 'pending_separation'
  | 'separation'
  | 'invoiced_ready_to_ship'
  | 'partial_delivery'
  | 'delivered'

/** Status em que a venda já é considerada realizada (conta para faturamento,
 *  metas, comissões e financeiro). A partir de "enviado para separação". */
export const REVENUE_STATUSES: OrderStatus[] = [
  'pending_separation',
  'separation',
  'invoiced_ready_to_ship',
  'partial_delivery',
  'delivered',
]

/** Data comercial do pedido: usa a Data da Venda; se ausente, a data de cadastro. */
export function saleDateOf(o: { saleDate?: string; createdAt: string }): string {
  return o.saleDate || o.createdAt
}

/** Data base do FINANCEIRO (vencimentos das parcelas): usa a Data de Entrega;
 *  se ausente, cai para a Data da Venda. A Data da Venda continua sendo a
 *  referência comercial (relatórios/metas/ranking). */
export function financialBaseDate(o: { deliveryDate?: string; saleDate?: string; createdAt: string }): string {
  return o.deliveryDate || saleDateOf(o)
}

export type SyncStatus = 'pendente' | 'sincronizando' | 'sincronizado' | 'erro'

/** Uma variação dentro de um item de pedido multi-variante */
export interface OrderItemVariant {
  attributeId: string
  attributeName: string
  valueId: string
  valueName: string
  qty: number
}

/** Um cheque informado como forma de pagamento do pedido. */
export interface OrderCheck {
  id: string
  number?: string          // número do cheque
  bank?: string            // banco
  holder?: string          // titular
  amount: number           // valor do cheque
  compensationDate: string // 'YYYY-MM-DD' — vira o vencimento do título financeiro
  notes?: string
}

export interface OrderItemAdjustment {
  qty: number
  reason: string
  notes?: string
  adjustedAt: string
  adjustedBy: string
}

export interface OrderItem {
  productId: string
  productName: string
  quantity: number           // unidades pedidas (ORIGINAL — nunca muda)
  billedQuantity?: number    // unidades FATURADAS (cobradas)
  deliveredQty?: number      // unidades efetivamente entregues (acumulado)
  kitCount?: number          // número de kits pedidos
  kitPaidQty?: number        // config snapshot: unidades cobradas/kit
  kitDeliveredQty?: number   // config snapshot: unidades entregues/kit
  price: number
  discount: number
  total: number
  /** Baixas administrativas antes da separação */
  adminAdjustments?: OrderItemAdjustment[]
  /** Compatibilidade retroativa — item com atributo único */
  attribute?: OrderItemAttribute
  /** Novo: múltiplas variantes (Cor Rosa:2, Azul:1, etc.) */
  variants?: OrderItemVariant[]
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
  discount: number           // valor calculado em R$
  discountType?: 'percent' | 'fixed'  // tipo do desconto
  discountValue?: number     // valor informado pelo usuário (% ou R$)
  total: number
  paymentTerms?: string
  paymentMethod?: string           // PIX | Boleto | Dinheiro | Cartão | Transferência | Cheque | Pago Parcial
  checks?: OrderCheck[]            // cheques (quando paymentMethod === 'Cheque')
  partialPaymentAmount?: number    // valor já pago (quando pagamento parcial)
  partialPaymentDate?: string      // data do pagamento parcial
  partialPaymentNotes?: string     // observação do pagamento parcial
  deliveryDate?: string
  notes?: string
  /** Data REAL da venda (referência comercial p/ financeiro, metas, relatórios).
   *  Quando ausente, usar createdAt. Editável apenas pelo admin (pedidos retroativos). */
  saleDate?: string         // 'YYYY-MM-DD'
  createdAt: string         // data de cadastro no sistema (NÃO é referência comercial)
  updatedAt: string
  blingOrderId?: string
  generatedAt?: string
  generatedBy?: string
  invoicedAt?: string
  invoicedBy?: string
  deliveredAt?: string
  deliveredBy?: string
  deliveredNotes?: string
  // tipo do pedido
  orderType?: OrderType      // 'venda' (padrão) | 'troca'
  exchangeReason?: string    // motivo obrigatório quando orderType === 'troca'
  // soft delete
  isDeleted?: boolean
  deletedAt?: string
  deletedBy?: string
  deleteReason?: string
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
  clientId?: string
  clientName: string
  clientCity?: string
  prospectId?: string
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

// Etapas do funil Kanban do CRM — fonte da verdade da posição do prospect.
// Independente de ProspectStatus (que fica só como flag legado).
export type ProspectStage =
  | 'novo_prospect'
  | 'primeiro_contato'
  | 'visita_agendada'
  | 'visitado'
  | 'follow_up'
  | 'negociacao'
  | 'pedido_realizado'
  | 'retomar_futuramente'
  | 'perdido'

export type FollowupChannel = 'whatsapp' | 'ligacao' | 'visita' | 'email' | 'outro'

export const LOST_REASONS = [
  'Preço', 'Não trabalha com a categoria', 'Já possui fornecedor', 'Sem interesse',
  'Condição de pagamento', 'Não respondeu', 'Loja fechada', 'Outro',
] as const
export type LostReason = typeof LOST_REASONS[number]

export interface Region {
  id: string
  name: string
  createdAt: string
}

export interface Prospect {
  id: string
  name: string
  tradeName?: string
  cnpj?: string
  contact: string
  phone: string
  whatsapp?: string
  email?: string
  city: string
  state: string
  regionId?: string
  regionName?: string
  address?: string
  segment: string
  status: ProspectStatus
  stage: ProspectStage
  repId?: string
  repName?: string
  notes?: string
  source?: string
  estimatedRevenue?: number
  interestedCategoryIds?: string[]
  createdAt: string
  updatedAt?: string
  attempts?: number
  lastContactDate?: string
  nextAction?: string
  nextActionDate?: string
  lostReason?: string
  lostReasonDetail?: string
  convertedClientId?: string
  convertedAt?: string
  firstOrderId?: string
}

export interface ProspectFollowup {
  id: string
  prospectId: string
  repId: string
  repName: string
  contactDate: string
  channel: FollowupChannel
  result?: string
  notes?: string
  nextAction?: string
  nextActionDate?: string
  createdAt: string
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
  | 'create_draft_order'
  | 'update_draft_order'
  | 'delete_draft_order'
  | 'delete_order'
  | 'restore_order'
  | 'generate_order'
  | 'generate_spreadsheet'
  | 'send_to_separation'
  | 'print_separation_pdf'
  | 'invoice_ready_to_ship'
  | 'mark_as_delivered'
  | 'update_order_admin'
  | 'create_order'
  | 'update_order'
  | 'cancel_order'
  | 'create_visit'
  | 'checkin'
  | 'checkout'
  | 'update_client'
  | 'create_client'
  | 'approve_client'
  | 'return_client'
  | 'reject_client'
  | 'assume_prospect'
  | 'convert_prospect'
  | 'create_prospect'
  | 'update_prospect'
  | 'move_prospect_stage'
  | 'register_followup'
  | 'reassign_prospect'
  | 'reactivate_prospect'
  | 'add_prospect_to_route'
  | 'sync_bling'
  | 'transfer_client'
  | 'create_product'
  | 'update_product'
  | 'create_category'
  | 'update_category'
  | 'create_subcategory'
  | 'update_subcategory'
  | 'change_product_category'
  | 'create_attribute'
  | 'update_attribute'
  | 'create_attribute_value'
  | 'update_attribute_value'
  | 'assign_product_attributes'
  | 'register_payment'
  | 'write_off_balance'
  | 'delete_financial_title'
  | 'delete_order_and_financial'
  | 'delete_order_keep_financial'
  | 'payment_method_changed'
  | 'partial_payment_registered'
  | 'partial_delivery_registered'
  | 'delivery_completed'
  | 'administrative_adjustment'
  | 'financial_generated'
  | 'financial_recalculated'
  | 'financial_deleted'
  | 'commission_generated'
  | 'create_retroactive_order'
  | 'update_sale_date'
  | 'recalculate_financial'
  | 'create_check_payment'
  | 'update_check_payment'
  | 'delete_check_payment'
  | 'create_installment'
  | 'update_installment'
  | 'delete_installment'
  | 'recalculate_installments'
  | 'change_delivery_date'
  | 'create_task'
  | 'update_task'
  | 'delete_task'
  | 'complete_task'
  | 'create_seamstress'
  | 'update_seamstress'
  | 'delete_seamstress'
  | 'create_production_order'
  | 'update_production_order'
  | 'cancel_production_order'
  | 'register_production_delivery'
  | 'create_production_payment'
  | 'mark_production_paid'
  | 'create_production_request'
  | 'update_production_request'
  | 'complete_production_request'
  | 'delete_production_request'
  | 'delete_production_payment'
  | 'update_production_payment'
  | 'create_production_flow_group'
  | 'update_production_flow_group'
  | 'delete_production_flow_group'
  | 'create_exchange_order'
  | 'update_exchange_order'
  | 'change_order_type'

export interface CompanySettings {
  id: number
  defaultCommissionRate: number
  defaultMonthlyGoal: number
  companyName: string
  allowSalesWithoutStock: boolean
  /** Momento em que a comissão é gerada. Padrão: 'separation'. */
  commissionTiming?: 'separation' | 'invoiced' | 'delivered'
  monthlyNewClientsGoal: number
  updatedAt: string
}

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
  prospectIds: string[]
  checkedInIds: string[]
  status: 'planejada' | 'em_andamento' | 'finalizada'
  finishedAt?: string
  notes?: string
  createdAt: string
}

export interface CreditScore {
  score: 'Bom pagador' | 'Atenção' | 'Restrito'
  totalOrders: number
  paidOrders: number
  lateOrders: number
}

export type ReceivableStatus = 'aberto' | 'parcial' | 'pago' | 'vencido' | 'cancelado'

export const WRITE_OFF_REASONS = [
  'Desconto Comercial',
  'Troca de Mercadoria',
  'Bonificação',
  'Perda Financeira',
  'Erro Operacional',
  'Ajuste Comercial',
  'Diferença de Centavos',
  'Outro',
] as const

export type WriteOffReason = typeof WRITE_OFF_REASONS[number]

export interface FinancialReceivable {
  id: string
  clientId: string
  clientName: string
  orderId: string
  orderNumber: string
  repId: string
  repName: string
  installmentNumber: number
  installmentTotal: number
  amount: number
  dueDate: string         // ISO date
  paymentDate?: string
  paidAmount: number
  remainingAmount: number
  status: ReceivableStatus
  paymentMethod?: string
  notes?: string
  createdAt: string
  updatedAt: string
  /** Baixa com diferença (desconto, troca, perda etc.) — título encerrado com saldo abatido. */
  hasWriteOff: boolean
  writeOffAmount: number
  writeOffReason?: WriteOffReason
  writeOffDescription?: string
  writeOffBy?: string
  writeOffByName?: string
  writeOffAt?: string
}

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

export type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'done' | 'cancelled'
export type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente'
export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Task {
  id: string
  title: string
  description?: string
  clientId?: string
  clientName?: string
  orderId?: string
  orderNumber?: string
  createdBy: string
  createdByName: string
  assignedTo?: string
  assignedToName?: string
  priority: TaskPriority
  status: TaskStatus
  dueDate?: string
  dueTime?: string
  completedAt?: string
  tags: string[]
  notes?: string
  recurrence: TaskRecurrence
  createdAt: string
  updatedAt: string
}

export interface TaskComment {
  id: string
  taskId: string
  userId: string
  userName: string
  comment: string
  createdAt: string
}

// ════════════════════════════════════════════
// MÓDULO PRODUÇÃO
// ════════════════════════════════════════════

// Competência mensal — filtro compartilhado entre Ordens, Financeiro e
// Dashboard do módulo Produção.
export type CompetenciaOption =
  | 'mes_atual' | 'mes_anterior' | 'ultimos_3_meses' | 'este_ano' | 'todos' | 'personalizado'

export interface CompetenciaFilter {
  option: CompetenciaOption
  from: string | null  // 'YYYY-MM-DD' — null quando option === 'todos'
  to: string | null
  customFrom?: string  // guardados à parte para repopular o seletor de período personalizado
  customTo?: string
}

export type SeamstressStatus = 'ativa' | 'inativa'

export interface Seamstress {
  id: string
  name: string
  photoUrl?: string
  phone?: string
  whatsapp?: string
  city?: string
  address?: string
  startDate?: string
  status: SeamstressStatus
  notes?: string
  paymentDay?: number   // dia padrão de pagamento/fechamento (1–31)
  createdAt: string
  updatedAt: string
}

export type SeamstressPaymentStatus = 'em_dia' | 'proximo' | 'vence_hoje' | 'atrasado' | 'pago'

export interface SeamstressFinancialSummary {
  seamstressId: string
  seamstressName: string
  photoUrl?: string
  paymentDay?: number
  nextPaymentDate?: string   // 'YYYY-MM-DD' — null quando não há payment_day definido
  daysUntilPayment?: number  // negativo = atrasado
  pendingValue: number
  pendingOrders: number
  pendingPieces: number
  status: SeamstressPaymentStatus
}

export interface SeamstressProduct {
  id: string
  seamstressId: string
  productName: string
  unitValue: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export type ProductionOrderStatus =
  | 'solicitada'
  | 'em_producao'
  | 'parcialmente_entregue'
  | 'concluida'
  | 'cancelada'

export interface ProductionOrder {
  id: string
  seamstressId: string
  seamstressName: string
  requestDate: string
  referenceMonth?: string  // 'YYYY-MM' — competência (se vazio, cai para o mês de requestDate)
  deadline?: string
  notes?: string
  status: ProductionOrderStatus
  createdBy?: string
  createdAt: string
  updatedAt: string
  items?: ProductionOrderItem[]
  // Fluxo entre costureiras (single-order model)
  hasFlow?: boolean
  flowId?: string           // legacy: id da ordem raiz (mantido p/ compat.)
  flowStep?: number         // legacy
  flowParticipants?: string[]     // nomes dos participantes (índice = step_index)
  flowParticipantIds?: string[]   // IDs das costureiras (índice = step_index)
  flowCurrentStep?: number        // etapa atual (0-based)
  flowSteps?: FlowStep[]          // histórico completo das etapas
  // legacy multi-order
  sourceOrderId?: string
  quantityReceived?: number
  // Pagamento: id do fechamento em que a ordem foi liquidada (null = não paga)
  productionPaymentId?: string
}

export type FlowStepStatus = 'pending' | 'in_progress' | 'completed'

export interface FlowStep {
  id: string
  orderId: string
  stepIndex: number
  seamstressId?: string
  seamstressName: string
  quantityReceived: number
  quantityDelivered?: number
  status: FlowStepStatus
  notes?: string
  completedAt?: string
  createdAt: string
}

// ── Fluxo de análise: agrupa VÁRIAS Ordens (normalmente do mesmo produto/
// período) numa visão consolidada de perdas, tempo, eficiência e valor.
// Diferente do FlowSummary acima (fluxo individual de 1 ordem entre
// costureiras) — aqui o "fluxo" é o conjunto escolhido pelo admin. ──

export interface FlowGroup {
  id: string
  name: string
  periodStart?: string
  periodEnd?: string
  product?: string
  notes?: string
  createdBy?: string
  createdByName?: string
  createdAt: string
  updatedAt: string
}

export interface FlowGroupStage {
  seamstressName: string
  received: number
  delivered: number
  loss: number
  avgDays: number | null
  valueProduced: number
}

export interface FlowGroupChartPoint {
  label: string
  quantity: number
}

export interface FlowGroupAnalysis {
  group: FlowGroup
  orderIds: string[]
  orderCount: number
  initialQuantity: number
  currentQuantity: number
  totalLoss: number
  efficiency: number        // % (currentQuantity / initialQuantity)
  percentComplete: number   // % médio de avanço nas etapas das ordens
  avgDays: number | null
  valueProduced: number
  valueLost: number
  currentSeamstressName: string  // gargalo: etapa menos avançada do grupo
  deadline?: string
  isLate: boolean
  stages: FlowGroupStage[]
  chartPoints: FlowGroupChartPoint[]
}

export interface ProductionOrderItem {
  id: string
  orderId: string
  seamstressProductId?: string
  productName: string
  quantity: number
  unitValue: number
  totalValue: number
  deliveredQty: number
  createdAt: string
}

export interface ProductionDelivery {
  id: string
  orderId: string
  seamstressId: string
  deliveryDate: string
  notes?: string
  createdBy?: string
  createdAt: string
  items?: ProductionDeliveryItem[]
}

export interface ProductionDeliveryItem {
  id: string
  deliveryId: string
  orderItemId: string
  productName: string
  quantityDelivered: number
  createdAt: string
}

export type ProductionPaymentMethod = 'PIX' | 'Dinheiro' | 'Transferência' | 'Cheque'
export type ProductionPaymentStatus = 'pendente' | 'pago'

export interface ProductionPayment {
  id: string
  seamstressId: string
  seamstressName: string
  referenceMonth: string // 'YYYY-MM' — competência (independe de quando foi cadastrado)
  totalAmount: number       // valor final = produção + acréscimos - descontos
  productionAmount: number  // valor bruto (ordens + manual)
  productionFromOrders: number
  productionFromManual: number
  totalAcrescimos: number
  totalDescontos: number
  closingDate?: string          // data em que o fechamento foi montado
  expectedPaymentDate?: string  // data prevista de pagamento
  paymentDate?: string          // data efetiva do pagamento
  paymentMethod?: ProductionPaymentMethod
  notes?: string
  status: ProductionPaymentStatus
  createdBy?: string
  createdAt: string
  updatedAt: string
  items?: ProductionPaymentItem[]
  adjustments?: ProductionPaymentAdjustment[]
  orderIds?: string[]
}

export type ProductionPaymentItemSource = 'ordem' | 'manual'

export interface ProductionPaymentItem {
  id: string
  paymentId: string
  orderId?: string              // vínculo opcional com Ordem de Produção
  seamstressProductId?: string  // vínculo opcional com Produto cadastrado
  productName: string
  productionDate?: string       // data da produção (lançamento manual)
  quantity: number
  unitValue: number
  totalValue: number
  notes?: string
  source: ProductionPaymentItemSource
  createdAt: string
}

export type ProductionAdjustmentType = 'acrescimo' | 'desconto'

// Motivo do ajuste é texto livre — estas são só sugestões (datalist) para
// agilizar o preenchimento dos casos mais comuns.
export const ADJUSTMENT_REASON_SUGGESTIONS = [
  'Ajuda de custo',
  'Bônus',
  'Material perdido',
  'Adiantamento já realizado',
] as const

export interface ProductionPaymentAdjustment {
  id: string
  paymentId: string
  type: ProductionAdjustmentType
  amount: number
  reason: string
  notes?: string
  createdBy?: string
  createdByName?: string
  createdAt: string
}

/** Ordem candidata a entrar em um fechamento: a ordem + o valor já entregue
 *  e ainda não pago (calculado a partir dos itens/deliveredQty). */
export interface UnpaidProductionOrder {
  order: ProductionOrder
  pieces: number
  value: number
}

export type ProductionRequestType =
  | 'material' | 'retirada' | 'entrega' | 'equipamento'
  | 'ferramenta' | 'compra' | 'producao' | 'financeiro' | 'outros'

export type ProductionRequestPriority = 'baixa' | 'media' | 'alta' | 'urgente'

export type ProductionRequestStatus =
  | 'pendente' | 'em_andamento' | 'aguardando' | 'concluida' | 'cancelada'

export interface ProductionRequest {
  id: string
  seamstressId: string
  seamstressName: string
  title: string
  description?: string
  type: ProductionRequestType
  priority: ProductionRequestPriority
  dueDate?: string
  responsible?: string
  responsibleId?: string
  status: ProductionRequestStatus
  notes?: string
  taskId?: string
  createAsTask: boolean
  createdBy?: string
  createdAt: string
  updatedAt: string
}
